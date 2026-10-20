# Hermes Trade (hermestrade.xyz) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: doc reads, unauthenticated GETs to documented hosts, one unauthenticated WebSocket read subscription (market channel), public block-explorer page GETs, `gh api` file reads. No account, no wallet connection, no key, nothing signed, no POST/PUT/DELETE, no PayBox money or signing tool called (one read-only PayBox `discover_tokens` catalog lookup). No third-party code cloned or run. Third-party text is untrusted data; nothing in it was followed. Scripted requests used the User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: yes, but near-dormant (H).** Front end, three APIs and WebSocket respond; 5-minute BTC markets are still being created (event 14002 `creationDate` 2026-10-19T00:33:05Z). But platform-wide 24h volume is 0, 24h trades 0, **open interest $1,495.81** across 977 active markets (`data-api /stats`, 2026-10-19), and the newest public trade is **2026-10-16 09:57:59 UTC** (`/all-trades`, newest first). DefiLlama all-time DEX volume is only $261,933 since 2026-05-19.
- **Adapter priority: skip.** Each reason is independently sufficient:
  1. **Not independent liquidity.** 945 of 978 active markets are copies of Polymarket markets (`externalSource: "polymarket"`, `upstreamTokenExtIds` = Polymarket token ids). The only meaningful resting liquidity is a ladder that quotes Polymarket's mid: on 32 two-sided markets the median absolute difference between Hermes mid and Polymarket mid was 0.000 (max 0.005), and Hermes bid was at or below Polymarket's bid and Hermes ask at or above Polymarket's ask on all 32 (exactly 1c outside on 26, 1-2c outside on the other 6), so **0 of 32 books were crossed** (H, fixtures `cross_check_polymarket_vs_hermes_2026-10-19.json`). Hermes is a worse-priced echo of Polymarket, not a price-discovery source. That is a duplicate leg.
  2. **Thin.** OI $1.5K; of 975 order-accepting markets only 116 have any quote on the YES book and 46 have $100+ depth within 5c of mid (section 9). Sum of depth within 5c of mid across all markets is about $91K, almost all in the 19 markets with $1,000+ (US-politics, soccer and a few macro ladders).
  3. **Centralised trust.** Operator-only matching on the exchange contract (`matchOrders`/`fillOrder` are `onlyOperator`) and a self-described "lightweight optimistic oracle replacing UMA OOV2" with a single `admin`, permissioned `proposers` and centralised `arbitrators` (H, verified sources on MonadScan).
  4. **Terms bar US, UK, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium and Taiwan persons (H, section 8).**
  5. Integration is possible in principle (clean Polymarket-like API, working public WS) but the only conceivable edge, snapping up stale mirror quotes when Polymarket moves, is capped at roughly $500 per ladder level and pays 60 bps taker fees (section 6).
- If a future task needs an adapter anyway: the API is a Polymarket CLOB-v1 clone with a `scopeId` extension (sections 3-4), so the existing Polymarket adapter is about 80 percent reusable. Treat Hermes as a **Polymarket mirror** and de-duplicate by `externalId`.

## 1. Liveness evidence (H unless marked)

| Check | Result | Source |
|---|---|---|
| Site | `https://hermestrade.xyz` 307 to `/predict`, Next.js app, 200 | GET |
| Docs | GitBook, `llms.txt` + `llms-full.txt` (120 KB) read in full except the glossary entries, which I only grepped | https://docs.hermestrade.xyz/llms-full.txt |
| Gamma API | `/health` ok; 448 active events / 978 markets (975 `acceptingOrders`) | https://gamma-api.hermestrade.xyz/events?active=true&closed=false |
| CLOB API | `/ok` ok, `/time` 1792370198 (= 2026-10-19 00:36:38 UTC) | https://clob-api.hermestrade.xyz/time |
| Relayer / data-api | `relayer.../ok` ok; `data-api.../health` ok | GET |
| Newest public trade | `match_time` 2026-10-16T09:57:59Z (page 1 of 217, newest first; total 21,613 rows); 500 newest maker rows span 2026-10-15 02:45 to 2026-10-16 09:57, 36 unique maker addresses, about $4.5K notional, all `MINT`/`MERGE`, concentrated in 4 markets | https://clob-api.hermestrade.xyz/all-trades?limit=100&page=1..5 |
| Platform stats | totalVolume $526,525.37 (gross, maker+taker double counted), totalTrades 20,738, volume24h 0, trades24h 0, openInterest $1,495.81, activeMarkets 978 | https://data-api.hermestrade.xyz/stats |
| DefiLlama | Listed "Hermes Trade", category Prediction Market, Monad. Volume (halved to avoid maker+taker double count): 24h 0, 7d $12,292, 30d $32,056, all-time $261,933; monthly 2026-05 $133, 06 $46,496, 07 $110,625, 08 $36,905, 09 $54,786, 10 (to 18th) $12,988; zero-volume days 2026-09-28..10-09 and 10-17..18. Fees all-time $1,096. TVL series empty. | https://api.llama.fi/summary/dexs/hermes-trade , .../fees/hermes-trade , https://api.llama.fi/protocol/hermes-trade |
| On-chain | `CTFExchange` 0x0176...0De8 verified on MonadScan, created about 153 days before 2026-10-19 (= about 2026-05-19, matches DefiLlama `start`), 16,851 txs at 2026-10-19 00:39 UTC | https://monadscan.com/address/0x017641abFa4264121237023f9Fe678BF00F60De8 |
| Launch coverage | "HermesTrade launches as first native prediction market on Monad", 2026-06-12 (headline via Phemex; body via a Vietnamese re-post: order-book matching, "team with market-making experience", World Cup markets at launch, AI-agent strategy tools planned). No English primary announcement found. | M/L: https://www.bitget.com/vi/news/detail/12560605457003 (re-post of tintucbitcoin.com, published 2026/06/12 10:15) |
| Operator | Crunchbase lists "Hermes Trade S.r.L.", Florence, Italy, IT / management consultancy; the link to this product is unconfirmed. ToS names no legal entity. | L: https://www.crunchbase.com/organization/hermes-trade-d80d (403 to direct fetch; seen via search summary only) |
| Social | `https://x.com/Hermes_Trd` (site footer, DefiLlama `twitter`) | H (links), content not read |

Stale/odd items: DefiLlama's description is garbled ("trade outcomit-order-book exchange...") and says collateral is "USDC and enzoBTC"; docs, `public-info` and the contracts show only USDW (wrapped USDC). enzoBTC collateral is **NOT FOUND** anywhere in Hermes sources (searched docs `llms-full.txt`, `public-info` `tokens`, bridge assets).

## 2. Kind and market model

- **Kind:** on-chain-settled central limit order book (Polymarket "CTF Exchange" fork), off-chain matching by Hermes' operator, on-chain settlement. Not an AMM, not parimutuel. (H: docs `core-concepts/order-book`; contract `@author Polymarket`, `onlyOperator` matching.)
- **Market structure:** every market is **binary** (YES/NO; crypto up/down use outcomes `["Up","Down"]`, index 0 = YES = "Up"). Multi-outcome events are `negRisk` sets of mutually exclusive binary markets (Polymarket NegRisk adapter), including placeholder "Other" markets that are native to Hermes (33 of 978 markets have no `externalSource`). No scalar markets. (H: docs `markets-and-events`, `outcome-shares`; gamma event list.)
- **Tokenisation:** outcome shares are **ERC-1155 conditional tokens** (Gnosis CTF, `ConditionalTokens` at 0xd77d...6a2A, verified). Market fields: `conditionId`, `clobTokenIds` (JSON array string; index 0 = YES, 1 = NO). Each token has its own book; docs say the NO book is the mirror of YES (a SELL of YES is economically a BUY of NO). Match types: `MINT` (new pair), `MERGE`, `COMPLEMENTARY`. (H)
- **Prices:** tick 0.001 on the books I read (docs say most markets use 0.01; read `tick_size` per token), valid 0.01-0.99 per docs; min order 5 shares; no max. (H live books; docs `reference/limits`)
- **Event types seen:** `binary` 411 events, `neg_risk` 37 events; adapters `crypto_periodic` 390 events (BTC up/down: series `btc-updown-5m` 287, `btc-updown-15m` 96, `btc-updown-4h` 7), `neg_risk` 496 markets, `regular` 92 markets. Sports events carry a `PredictGameFixture`; **all resting orders on a sports market are cancelled automatically when the game goes live** (H docs `guides/sports-markets`), so there is no in-play book.
- **Cross-venue join key:** `market.externalId` / `upstreamMarketExtId` = the Polymarket condition id; `upstreamTokenExtIds[i]` pairs with `clobTokenIds[i]` (H fields; pairing confirmed by matching mids on 32 markets).
- **Market creation:** restricted to the Hermes team ("A market creation guide is coming soon. Market creation is currently restricted to the HermesTrade team", H docs `guides`).

## 3. Read API

**Official, public, unauthenticated for all reads.** Docs: https://docs.hermestrade.xyz/reference/api-overview.md . Live OpenAPI (Scalar UI): https://clob-api.hermestrade.xyz/docs , https://gamma-api.hermestrade.xyz/docs , https://relayer.hermestrade.xyz/docs ; JSON specs at `{host}/docs/openapi.json` (H). Full endpoint inventory saved in `docs/research/fixtures/hermes-trade/openapi_endpoint_inventory_2026-10-19.txt`.

| Host | Purpose | Auth |
|---|---|---|
| `https://gamma-api.hermestrade.xyz` | events, markets, tags, series, sports `games`, `public-info` (chain + contracts + `scopeId`), bridge asset lists, adjudication state | none for reads; Bearer JWT for profile / bridge quote / withdrawals |
| `https://clob-api.hermestrade.xyz` | books, prices, midpoints, spreads, tick size, fee rate, price history, public order / trade / transaction history, plus trading | none for reads; L1 (EIP-712) for API keys; L2 (HMAC) for orders |
| `wss://clob-ws.hermestrade.xyz/ws/market` | live book stream | none (market channel) |
| `https://data-api.hermestrade.xyz` | `/stats`, `/oi?market=<conditionId>`, `/holders`, `/v1/leaderboard`, `/positions` etc. | none for the ones I called |
| `https://relayer.hermestrade.xyz` | Safe deployment and gasless tx submission | RelayerAPIKey or Bearer JWT |

Key endpoints for an aggregator (all GET, all confirmed live 2026-10-19):

- Markets: `GET gamma /events?limit=100&offset=N&active=true&closed=false` (offset pagination; also `order`, `ascending`, `tag_id`, `series_id`, `exclude_tag_slug`, date filters), `/events/{id}`, `/events/slug/{slug}`, `/markets/{id}`, `/markets/slug/{slug}`, `/sports-events`, `/games?status=&sport_type=&date=&keyword=`, `/games/{id}/scores`, `/config/sport-types`. Note the list output leaves `volume`, `liquidity`, `openInterest`, `volume24hr`, `bestBid`, `bestAsk`, `outcomePrices`, `lastTradePrice` as **null**; prices must come from the CLOB. (H, fixture `gamma_events_sample`)
- Books / prices: `GET clob /book?token_id=` (bids/asks `{price,size}` strings, `tick_size`, `min_order_size`, `neg_risk`, `last_trade_price`, empty `hash`), `/price`, `/midpoint`, `/spread`, `/tick-size`, `/fee-rate?token_id=`, `/last-trade-price`, `/price-history?token_id=&interval=1H|6H|1D|1W|1M|30D|ALL|MAX&fidelity=`. Batch variants (`POST /books`, `/prices`, `/midpoints`, `/spreads`, `GET|POST /last-trades-prices`, max 500) are POST, so I did not call them. (H docs + spec; GETs confirmed for `/book`, `/fee-rate`, `/time`, `/all-*`)
- Trades: `GET /all-trades`, `/all-orders`, `/all-transactions` (public, `page` + `limit`, response `{data, limit, page, total}`; docs also mention `next_cursor`). Trade rows: `id` (snowflake), `market` (conditionId), `asset_id`, `side`, `size`, `price`, `fee`, `fee_rate_bps`, `status` (`TRADE_STATUS_CONFIRMED`), `match_time`, `outcome`, `maker_address`, `transaction_hash`, `trader_side`, `match_type`. Rows seen are maker-side rows only. (H, fixture `clob_all-trades_sample`)
- Resolution: market object `adjudication` (`currentPhase`, `proposedOutcome`, `settledOutcome`, `proposedAt`, `resolvedAt`, `livenessSecs`, `payoutVector`, `questionId`, `nextSteps`) (H, fixture `gamma_closed_event_settled`). WS `market_resolved` needs `custom_feature_enabled` (M, SDK docs).
- Open interest / volume: `GET data-api /stats` (platform) and `/oi?market=<conditionId>` (per market; returned `value: 0.15152` for the Senate-Democrat market). (H)
- **WebSocket: exists and works, contrary to the official docs.** Hermes docs say "WebSocket streams are not confirmed in any of the three OpenAPI specifications" (H, api-overview). I opened `wss://clob-ws.hermestrade.xyz/ws/market` (HTTP/1.1 101), sent `{"assets_ids":[<token>],"type":"market","initial_dump":true}` and received a `book` frame identical to `GET /book`, plus a protocol ping (opcode 9). Event types per the third-party SDK docs: `book`, `price_change` (size "0" removes a level), `last_trade_price` (empty `transaction_hash` for synthetic trades), `tick_size_change`, `best_bid_ask`, `new_market`, `market_resolved` (last three need `custom_feature_enabled`); keep-alive is a text frame `"PING"` answered by `"PONG"`; user channel `/ws/user` takes L2 credentials in the first frame. (H for the handshake + book frame; M for the rest, source https://github.com/chainupcloud/predict-rs/blob/main/docs/ws.md)
- **Rate limits: NOT documented.** Docs: "Rate limits are not documented in the HermesTrade OpenAPI specifications ... Contact the HermesTrade team" (H, `reference/limits`). Empirically I made 975 sequential `/book` GETs at roughly 2 req/s plus about 150 other GETs with no 429 (H). The third-party SDK doc claims "100 req/min sliding window (authenticated endpoints)" copied from upstream Polymarket V1 (L).
- **Data quality traps:** (a) `last_trade_price` and `/price-history` can include **synthetic trades**: the CLOB exposes `POST /self-trade` "for whitelisted market-makers to inject synthetic trades" (H, OpenAPI), trade `status`/`match_type` enums include `SYNTHETIC` (H docs), and the SDK doc says it is "used for market-maker price-history backfill / mirroring" (M). Use the book, not last trade or history, as the price signal. (b) The `/book` `hash` field is empty. (c) `/stats.totalVolume` ($526K) is gross; DefiLlama's $262K halves maker+taker. (d) Detect NegRisk from the event (`negRisk: true`, `eventType: "neg_risk"`) or from `/book` (`neg_risk`); the exchange to sign against follows from it (H, live JSON).
- Fixtures (<=50 KB each) are in `docs/research/fixtures/hermes-trade/`, section 13.

## 4. Trade path (programmatic)

**Yes, official and Polymarket-compatible, with a tenant extension. Not tested (would need an account, keys and signatures; out of scope).**

1. **Login (Gamma):** `GET /auth/nonce?address=` -> sign EIP-712 login message (`chainId` 143) -> `POST /auth/login` -> JWT. (H docs `reference/authentication`)
2. **API key (CLOB L1):** headers `PRED_ADDRESS`, `PRED_SIGNATURE`, `PRED_TIMESTAMP`, `PRED_NONCE` (+ optional `PRED_SCOPE_ID`) on `POST /auth/api-key` or `GET /auth/derive-api-key`. EIP-712 struct `ClobAuth(address address,string timestamp,uint256 nonce,bytes32 scopeId,string message)`, domain `ClobAuthDomain` v1, chainId 143, no verifyingContract. (M: https://github.com/chainupcloud/predict-rs/blob/main/docs/auth-flow.md ; Hermes docs list the headers but say the exact type hash "should be confirmed with the HermesTrade team")
3. **Trading (CLOB L2):** `PRED_API_KEY`, `PRED_PASSPHRASE`, `PRED_TIMESTAMP` (+-30 s), `PRED_ADDRESS`, `PRED_SIGNATURE` = base64-standard(HMAC-SHA256(secret, timestamp + METHOD + path-without-query + body)). Hermes docs explicitly leave the HMAC algorithm unconfirmed; the algorithm above is from the third-party SDK (M).
4. **Order signing (H, verified contract source):** EIP-712 domain `name="Prediction Market Protocol"`, `version="1"`, `chainId=143`, `verifyingContract` = the **exchange that settles the market**: `CTFExchange` 0x017641abFa4264121237023f9Fe678BF00F60De8 for standalone binary markets, `NegRiskCtfExchange` 0x50b7B00EE75F8bFb5cDa892883aFb3867851c738 for NegRisk / sports families (a wrong exchange gives `INVALID_SIGNATURE`, M SDK doc). Struct: `Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType,bytes32 scopeId)`. Hermes `scopeId` = `0x1811a132dd725e2c40475aa52df39025b36544f7a70825968e32b28da2196e95` (H, `public-info`). Signature types: `0` EOA (maker == signer), `1` POLY_PROXY, `2` POLY_GNOSIS_SAFE (default for the app; maker = Safe address CREATE2-derived from `(signer, scopeId)`), `3` POLY_1271.
5. **Submit:** `POST /order` (single), `POST /orders` (<=15), `POST /orders/replace`, `DELETE /order|/orders (<=3000)|/cancel-all|/cancel-market-orders`; order types GTC, GTD, FOK, FAK (no market order type; simulate with FAK/FOK at an aggressive price). `POST /heartbeats` exists; heartbeat-or-cancel timeout is not documented. Amount math: 6-decimal truncation, BUY `makerAmount = price*size*1e6`, `takerAmount = size*1e6` (M SDK doc). `cancelOrder(Order)` is also callable on-chain by the maker (H contract).
6. **Funding / custody:** the app deploys a Safe per EOA through the Relayer (docs say a small amount of MON is needed once for deployment, then the Relayer pays gas, H docs). Collateral is **USDW**, a 1:1 USDC receipt token (see section 5), plus ERC-20 / ERC-1155 approvals to the exchange, set through Safe MultiSend via the Relayer (M SDK doc).
7. **No SDK from Hermes** ("No official HermesTrade SDK has been identified", H). Third-party Rust SDK + CLI: https://github.com/chainupcloud/predict-rs (MIT, last push 2026-06-09, "pre-1.0 ... unstable"; also `pm-sdk-go`, `pm-sdk-ts` in the same org, M). It is the operator-side vendor's SDK, not Hermes' own; I read its docs only and ran nothing.

## 5. Chains, collateral and PayBox reachability

- **Chain:** Monad mainnet, chainId **143**, native MON, RPC https://rpc.monad.xyz , explorer https://monadscan.com (H, `public-info`). Single chain.
- **Collateral:** **USDW** 0xb7bD080Df56FA76ce6CA4fA737d47815f7F8e746 (ERC-20, 6 decimals), "backed 1:1 by USDC on Monad", wrap/unwrap handled by the platform on deposit/withdraw; "not intended to circulate outside the platform" (H docs `core-concepts/usdw`). Underlying USDC on Monad: 0x754704Bc059F8C67012fEd69BC8A327a5aafb603 (H `public-info` `USDC_UNDERLYING`; also visible in PayBox `discover_tokens` for eip155:143 with market cap about $215M, H). Contracts: `USDW_WRAPPER` 0x119E...D2c1, `USDW_VAULT`, `NEG_RISK_WCOL`, `FEE_VAULT` 0x222C...0B08, all in `gamma /public-info` (fixture). The SDK registry also lists a `GET /unwrap-requests` USDW "unwrap queue" on data-api, so withdrawals may not be instant (L, not read live).
- **Deposit routes (H, `gamma /bridge/assets`, `/withdrawals/bridge/chains`):** Relay-powered bridge from **Ethereum (ETH, USDC, USDT), Optimism (ETH, USDC), BNB (BNB, USDC, USDT), Polygon (POL, USDC, USDT), Base (ETH, USDC), Arbitrum (ETH, USDC, USDT)**; min deposit $1; destination currency USDC on 143 with `receiveCurrency` = USDW. Withdrawals back to the same six chains, min 500000 raw (= $0.50; BNB uses 18 decimals so 0.5 token). Quote endpoints (`POST /bridge/quote`, `/withdrawals/bridge/quote`) need a Bearer JWT and are POST, so not called.
- **PayBox reachability: partial.**
  - For: PayBox's chain catalog does list Monad (`discover_tokens mode=chains query=monad` -> `eip155:143`, MON; H live call 2026-10-19), though PayBox says the catalog is "not a support allowlist" and Monad is not in its featured list of 11 chains recorded in `docs/research/06-paybox-platform.md`. Order and auth signing are EIP-712 typed data, which PayBox `request_wallet_sign` (`typedData` op, no chain or domain allowlist found, per `06-paybox-platform.md` section 4) could sign for an EOA, so signatureType 0 (maker = EOA, funded with USDW) or the Safe flow (EOA owns the Safe) are both signable. Deposits from Base/Ethereum/BNB/Arbitrum/Polygon are bridgeable via Hermes' Relay quote, whose source-chain transaction could be a normal PayBox transaction proposal (M, untested).
  - Against / unknown: native Monad transactions through PayBox (USDC approve, `USDWrapper.wrap`, Safe MultiSend) are **NOT FOUND** as supported (not tested; catalog is not an allowlist). Every order needs one `request_wallet_sign` round trip (plus a JWT login and an L1 key-creation signature up front). The Gamma JWT / bridge-quote flow and Relayer calls are authenticated POSTs from an agent runtime, not from a PayBox plugin sandbox (the repo's PayBox notes say plugins cannot hold a signature step open). Tiny capacity (section 9) means the integration cost is not worth it anyway.

## 6. Fees

- **Model:** taker fee only, deducted at match; makers are not charged at placement (H docs `core-concepts/fees`). Gas is paid by the Relayer ("gasless"), except the one-time Safe deployment which the docs say needs MON (H docs).
- **Rate:** `feeRateBps` is signed into each order; fetch `GET /fee-rate?token_id=` first. Live values 2026-10-19: **60 bps** for `regular` and `neg_risk` markets, **510 bps** for `crypto_periodic` (BTC 5m/15m/4h) markets (H, fixture `clob_fee-rate`). Contract cap `MAX_FEE_RATE_BIPS = 1000` (10%). The SDK doc says the real charge is split `PLATFORM_FEE + TENANT_FEE` over several on-chain transfers (M).
- **Formula (H, verified `CalculatorHelper.calculateFee`):**
  - BUY: fee in **outcome tokens** = `feeRateBps * min(p, 1-p) * tokens / (p * 10000)`.
  - SELL: fee in **collateral** = `feeRateBps * min(p, 1-p) * tokens / 10000`.
  - Examples: 60 bps BUY at p = 0.50 costs 0.6% of the tokens bought (0.6% of notional); at p = 0.90 about 0.067%. 510 bps at p = 0.50 is 5.1% of notional, which makes the 5-minute BTC markets uneconomic for arbitrage.
- Maker rows in the public trade history show `fee_rate_bps: "0"`, `fee: "0"` (H). DefiLlama realised fees $1,096 on $262K volume (about 0.42%) (H).
- Deposit/withdraw: Relay bridge fees (not quantified), min $1 in, $0.50 out. No fee schedule for deposits/withdrawals in the docs (NOT FOUND, searched `llms-full.txt` for "withdraw", "deposit fee").

## 7. Resolution mechanism and dispute risk

- **Design (H, verified contracts on MonadScan):** Polymarket's `UmaCtfAdapter` / `NegRiskUmaCtfAdapter` / `UmaSportsOracle` forks (UMA_ADAPTER 0x4400...B101, NEG_RISK_UMA_ADAPTER 0x1399...e73c, SPORTS_ORACLE 0xDA31...e7b), pointed at **`LightOracle`** 0x8f3E...bE9, whose own header reads "lightweight optimistic oracle replacing UMA OOV2 ... Adds **permissioned propose, centralized arbitration**, and timeout protection". It has one `admin` (can add/remove proposers and arbitrators, set min bond and liveness), `proposers` mapping, `arbitrators` mapping. So real UMA is not used; a challenge goes to Hermes-appointed arbitrators. `FINDER` is a `SimpleFinder` with 0 txs. The `CRYPTO_PERIODIC_MARKET_ADAPTER` 0xaD79...3B87 (37,861 txs) is **unverified** on MonadScan.
- **Phases exposed in Gamma `adjudication`:** proposed -> challenged -> arbitrated -> resolved / canceled; `livenessSecs` 7200 observed; cancel pays `[1,1]` (positions refunded at cost). `POST /disputes/evidence` only records a pre-dispute intent. (H docs `core-concepts/resolution-disputes`)
- **Terms say Hermes is not responsible** for resolution ("resolved by various on-chain oracles ... we are not responsible for any dispute", H ToS).
- **Observed behaviour (H, Gamma closed events):** all 100 most recent closed BTC up/down events show `settled`, resolved within about 2-3 minutes of the window end (Chainlink Streams BTC/USD TWAP, resolution source `data.chain.link/streams/btc-usd-twap-60s-streams`). Sports: proposal 6-10 h after the game and resolution 2 h later (e.g. Seahawks vs Broncos, end 2026-10-16T00:15Z, proposed 10:09:01Z, resolved 12:10:02Z). Some markets sit in `awaiting_proposal` long after end (Brazil Presidential Election, end 2026-10-04, still `awaiting_proposal` on 2026-10-19; Chargers vs Chiefs, end 2026-10-18T20:25Z). Outcome source for mirrored events is presumably Polymarket's result (`externalSource`), but that is not documented (M/L).
- **Risk:** high centralisation (single admin controls who can propose and who arbitrates; operator controls matching; operator can pause trading). Cross-venue resolution mismatch against Polymarket is possible because Hermes resolves independently and with different rules text (the crypto markets copy Polymarket's wording).

## 8. Geo, ToS and automation

- **Restricted persons (H, ToS from `gamma /public-info` -> `agreements`, English text):** "PERSONS OR ENTITIES WHO RESIDE IN, ARE LOCATED IN, ARE REGISTERED IN ... THE UNITED STATES, THE UNITED KINGDOM, FRANCE, ONTARIO, SINGAPORE, POLAND, THAILAND, AUSTRALIA, BELGIUM, TAIWAN, OR ANY OTHER RESTRICTED TERRITORY ... MAY NOT USE THE SITE, PLATFORM, OR TECHNOLOGY FEATURES FOR TRADING" plus comprehensive-sanctions territories, and anyone acting for or controlled by a restricted person. The sanctions list in the "Restricted Jurisdictions" clause names US, UK, France, Ontario, Singapore, Poland, Thailand, Taiwan (Australia and Belgium appear only in the earlier clause). Restricted users may only use "Content Features". Age 18+.
- "USE OF A VIRTUAL PRIVATE NETWORK ("VPN") OR ANY SIMILAR TOOL TO ATTEMPT TO CIRCUMVENT ... IS STRICTLY PROHIBITED"; wallets may be put in close-only mode.
- **Enforcement:** no geoblock endpoint ("GET /geoblock absent ... No geolocation middleware", M, SDK doc) and unauthenticated reads from my machine were served with no geo challenge (I did not test from other regions). Trading-time KYC / IP checks: NOT FOUND (searched docs and ToS for "KYC", "geo").
- **Automation:** docs openly support bots (FOK "for bots", "automated strategies" guidance, heartbeat for market makers, 15-order batches, public bulk history endpoints). ToS forbids "any data-mining tool, robot, crawler, or similar data-gathering or extraction tool to scrape or otherwise remove data from the Site, any other Interface, or the Features", wash trading, spoofing, front-running and "pre-arranged or non-competitive trading". Read-only polling of the documented public API appears intended, but the scraping clause is broad (M).
- A US-based operator (the user's project) would be a restricted person for trading. Read-only use for signals is not barred by the text I read (M).

## 9. Liquidity (all numbers 2026-10-19, H unless marked)

| Metric | Value | Source |
|---|---|---|
| Open interest | $1,495.81 total | data-api `/stats` |
| Volume | 24h $0; 7d $12,292; 30d $32,056; all-time $261,933 (DefiLlama, halved) / $526,525 gross | DefiLlama, data-api |
| Peak | July 2026 $110.6K (World Cup); single day max $88,347 on 2026-07-16 | DefiLlama series |
| TVL | not reported (empty series) | DefiLlama |
| Order-accepting markets | 975 | gamma + CLOB scan |
| Markets with any YES-book quote | crypto_periodic 6 of 389; neg_risk 93 of 496; regular 17 of 90 | `clob_book_scan_summary` |
| Two-sided with spread <= 5c | 4 / 44 / 16 respectively (crypto / neg_risk / regular) | same |
| Depth within 5c of mid >= $1,000 | 0 / 18 / 1 | same |
| Sum of depth within 5c of mid | about $1.7K / $86.1K / $3.6K (YES token only) | same |
| Ladder shape | Each ladder level risks about $500 (bids `price*size = 500`, asks `(1-price)*size = 500`) e.g. Senate-Democrat bids 0.62 x 806.45, 0.61 x 819.67; asks 0.67 x 1515.15 | `/book`, M for the interpretation |
| Biggest book | "Which party will win the House in 2026? / Democratic Party" bid 0.89, ask 0.92, about $31.7K within 5c | scan |
| Thin or dead books | most sports / team-champion markets show only dust orders at stale prices, e.g. Chiefs AFC West bid 0.10 / ask 0.89 on Hermes vs Polymarket 0.66 / 0.72; many have no bids or asks at all | scan |
| Maker concentration | 36 unique maker addresses in the newest 500 trade rows | `/all-trades` |

**Independence (the key finding):** the ladder markets track Polymarket exactly: 32 markets compared, median |mid diff| 0.000, max 0.005, Hermes bid = Polymarket bid minus 0.01 and Hermes ask = Polymarket ask plus 0.01 on 26 of 32, 1-2c outside on the rest. Zero crossed books, so no riskless gross edge existed at the time of the check; the only conceivable edge would be lagging quotes after a Polymarket move (the book I watched did not change between 00:35 and 00:44 UTC, but Polymarket did not move either, so update latency is **NOT MEASURED**). Treat Hermes quotes as derived from Polymarket (M, inference from the numbers; the quoting entity is unidentified). The SDK repo also says multiple tenants of the same backend "may share a unified order book" differing only by `scopeId` (L, one search snippet of a CLAUDE.md in the vendor repo); I found no second live tenant (NOT FOUND, searched GitHub code search for the vendor org and `PRED_SCOPE_ID`).

## 10. Event coverage and overlap

- **Catalogue = Polymarket mirror.** 945 of 978 active markets have `externalSource` / `upstreamType` = `polymarket`; the other 33 are Hermes-native "Other" catch-all legs of NegRisk events. Overlap with Polymarket is therefore about 100% by construction, and that is exactly why Hermes cannot be an independent leg.
- By tag (active events): crypto up/down 390 (BTC only, 5m / 15m / 4h; titles copy Polymarket's "Bitcoin Up or Down - <date>, <time> ET" with Chainlink TWAP rule text), sports 22 (NFL games, NFL / NBA / EPL / LaLiga / UCL / MLS champions, esports Worlds / LPL / LCK, Ballon d'Or), politics 10 (US 2026 midterms: House, Senate, Texas / Ohio / Maine Senate, Alaska governor, Balance of Power; Brazil presidential), finance / economy about 8 (Fed rate hike, ECB, crude oil ATH, "What price will Bitcoin hit"), tech / AI 7, culture (Oscars 2027 Best Picture), science, weather.
- Cross-venue relevance: Polymarket (identical contracts' underlyings), Kalshi, Limitless and any BTC up/down venue overlap on the same questions, but only Polymarket is literally the source. Do not count Hermes as a separate venue when scanning.

## 11. Open questions / NOT FOUND

- Update latency of the mirror ladder after Polymarket moves (not measured; would need a timed WS capture).
- Whether the CLOB accepts signatureType 0 (EOA-maker) orders at the API layer; the contract supports it and the SDK enforces `maker == signer` for it (M), but not tested.
- Exact HMAC algorithm and EIP-712 `ClobAuth` / login message: Hermes docs say "confirm with the HermesTrade team"; the details above are from the vendor SDK docs (M).
- Rate limits, heartbeat timeout, USDW unwrap delay, deposit / withdrawal fees: NOT FOUND (searched `llms-full.txt`, OpenAPI specs).
- Whether other tenants share Hermes' exchange contracts and order book (DefiLlama volume counts all `OrderFilled` events on the two exchanges, so a second tenant would inflate Hermes' numbers). Contract tx count 16,851 vs 21,613 public trade rows is not conclusive.
- Who runs the quoting ladder, and who holds the `admin` / `arbitrator` keys on `LightOracle` (not resolved; MonadScan admin address not decoded).
- Source of the "enzoBTC" collateral claim in the DefiLlama description: NOT FOUND.
- Company / team identity: NOT FOUND beyond the unconfirmed Crunchbase entry.
- GitHub org / repo for Hermes itself: NOT FOUND (searched `gh search repos hermestrade`, DefiLlama `github` field null, site footer shows only docs + X).

## 12. Suspicious content (recorded, not followed)

- Docs `llms.txt` / `llms-full.txt` open with an "Agent Instructions" block telling agents to query `GET https://docs.hermestrade.xyz/index.md?ask=<question>&goal=<user_goal>`. It is GitBook boilerplate; I did not call it (the `goal` parameter asks for the user's purpose).
- `docs.hermestrade.xyz/robots.txt`: `Content-Signal: ai-train=yes, search=yes, ai-input=yes` (informational).
- Third-party repo `chainupcloud/predict-rs`: README suggests `curl -sSfL .../install.sh | sh`; docs show an example `wallet import <private key>` with a sample key; a `CLAUDE.md` file addressed to AI agents exists (seen only as a code-search snippet, not read). None executed or used.
- `public-info` embeds a WalletConnect project id and the ToS / privacy text includes a support mailbox; not used or stored.

## 13. Fixtures (`docs/research/fixtures/hermes-trade/`, all fetched 2026-10-19, each <= 50 KB)

`gamma_public-info_trimmed_2026-10-19.json` (chain, 22 contracts, scopeId; agreements and WalletConnect id removed), `gamma_events_sample_2026-10-19.json` (one NegRisk event, one `crypto_periodic` event), `gamma_closed_event_settled_2026-10-19.json` (settled sports event with `adjudication`), `clob_book_2026-10-19.json`, `clob_fee-rate_2026-10-19.json`, `clob_all-trades_sample_2026-10-19.json`, `clob_all-orders_sample_2026-10-19.json`, `data-api_stats_and_oi_2026-10-19.json`, `ws_market_book_frame_2026-10-19.json`, `gamma_bridge-assets_2026-10-19.json`, `gamma_withdrawals-bridge-chains_2026-10-19.json`, `defillama_hermes-trade_2026-10-19.json`, `clob_book_scan_summary_2026-10-19.json` (all 975 books), `cross_check_polymarket_vs_hermes_2026-10-19.json` (32 markets), `openapi_endpoint_inventory_2026-10-19.txt`, `exchange_contract_excerpts_2026-10-19.txt`.

## 14. Sources

Primary (Hermes):
- https://hermestrade.xyz/predict - app (H)
- https://docs.hermestrade.xyz/llms.txt and /llms-full.txt (all pages: welcome, getting-started, core-concepts incl. order-book, smart-wallets, resolution-disputes, fees, usdw; guides incl. sports-markets; reference incl. api-overview, authentication, network-contracts, limits, glossary) (H)
- https://gamma-api.hermestrade.xyz/docs/openapi.json , https://clob-api.hermestrade.xyz/docs/openapi.json , https://relayer.hermestrade.xyz/docs/openapi.json (H)
- https://gamma-api.hermestrade.xyz/public-info , /events , /bridge/assets , /withdrawals/bridge/chains , /agreements (H)
- https://clob-api.hermestrade.xyz/book , /fee-rate , /all-trades , /all-orders , /time ; wss://clob-ws.hermestrade.xyz/ws/market ; https://data-api.hermestrade.xyz/stats , /oi , /v1/leaderboard (H; leaderboard not saved)
- https://monadscan.com/address/<contract> pages for CTFExchange 0x017641abFa4264121237023f9Fe678BF00F60De8, LightOracle 0x8f3E5D465C593c225B3000fe3d9E80a2Da210e44, UMA_ADAPTER, SPORTS_ORACLE, NEG_RISK_UMA_ADAPTER, CRYPTO_PERIODIC, USDW, FEE_VAULT, CTF (verified source read for the first two) (H)

Secondary:
- https://api.llama.fi/protocol/hermes-trade , /summary/dexs/hermes-trade , /summary/fees/hermes-trade ; https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hermes-trade/index.ts and fees/hermes-trade/index.ts (adapters list exchange + FeeVault addresses, `start: 2026-05-18`) (H)
- https://github.com/chainupcloud/predict-rs (README, docs/auth-flow.md, diff-vs-upstream-v1.md, orders.md, ws.md, gamma.md, cli/src/networks/monad.yaml, data client source) - vendor SDK, MIT, unaudited third-party (M)
- https://clob.polymarket.com/book (public GET, used only for the cross-check) (H)
- PayBox `discover_tokens` (read-only catalog) for `eip155:143` (H); repo notes `docs/research/06-paybox-platform.md` (H for what they record)
- https://www.bitget.com/vi/news/detail/12560605457003 and Phemex headline 2026-06-12 (M/L); https://www.crunchbase.com/organization/hermes-trade-d80d (L, via search summary only)
- Web searches (extended): "HermesTrade Monad prediction market Hermes_Trd"; "Hermes Trade Monad prediction market launch mainnet Polymarket CLOB"; "HermesTrade launches first native prediction market on Monad June 2026" (L, leads only). A further search on the vendor / tenant model was refused because the shared search budget was exhausted; not retried.
