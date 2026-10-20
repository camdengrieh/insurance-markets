# Jupiter Prediction Markets ("Jupiter Predict") - adapter spec

Researched 2026-10-19 (~00:40-01:20 UTC). READ-ONLY: unauthenticated GETs to documented hosts (`api.jup.ag`, `developers.jup.ag`, `docs.jup.ag`, `clob.polymarket.com`, `api.elections.kalshi.com`, `api.llama.fi`), `gh api` file listings, web search. No account, no API key, nothing signed, no POST/PUT/DELETE (so the order-build endpoint was NOT exercised), no wallet, no PayBox money tool called. No third-party code cloned or run. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (docs, API payloads, market rules) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/jupiter-prediction-markets/` (11 files, each <= 12 KB; third-party wallet keys in the trades feed are redacted).

## 0. Verdict

**adapter_priority: skip** as a price/liquidity leg (revisit only as an optional Solana execution route to Polymarket).

1. Live, but well below its June 2026 peak (H): keyless API answered, `trading_active: true`, trade feed had fills minutes before my call, DefiLlama 24h volume $259K (2026-10-17 day).
2. **It is not an independent venue.** It is a Solana front end and keeper-executed broker over **Polymarket (default provider)** and **Kalshi (`provider=kalshi`)**, plus a small native product (Forecast / `bisonfi`, and sportsbook "ticket" markets). Market ids are `POLY-<polymarket id>`, markets carry Polymarket `clobTokenIds`, and the quoted prices equal Polymarket's CLOB best bid/ask (H, section 8). Any edge seen on Jupiter vs Polymarket/Kalshi is just fee drag (Jupiter charges **2x the Polymarket fee**).
3. The confirmed hint: the Keyrock/Kalshi "liquidity layer ... starting with Jupiter" quote is real (Kalshi's own post, section 8). The unconfirmed half ("Polymarket NOT CONFIRMED") is now **confirmed**: Polymarket is the default provider.
4. The API is good (keyless reads, OpenAPI spec, orderbook, trades feed), but everything it serves is a re-presentation of data we already read from the primary venues.
5. Residual value: (a) Solana-wallet access path to Polymarket liquidity (PayBox has Solana) at 2x fees and with US/KR IP blocks; (b) a few Jupiter-native markets (Forecast SPCX/BTC 15m, sportsbook tickets) with odds set by a separate provider; (c) the public trades/leaderboard feed as a weak flow signal.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.jup.ag/prediction/v1/trading-status` | `{"trading_active":true}`, 2026-10-19 00:43Z, no key | H (fixture `trading_status.json`) |
| Global trades feed `GET /trades` | 20 most recent fills spanning 2026-10-19 ~00:25Z to ~00:43Z (unix 1792369492..1792370582), total ~$1,557; the newest was only a few minutes old when fetched | H (fixture `trades_feed_redacted.json`) |
| DefiLlama volume (adapter `jupiter-prediction`) | 24h $258,987; 7d $1.33M; 30d $5.98M; all-time $57.8M (series starts 2025-10-21) | H (fixture `defillama_summary_trimmed.json`) |
| Docs state beta | "currently in beta and subject to breaking changes" | H |
| Docs index lists a newer product | Jupiter Forecast page (native 15m BTC rounds), June 2026 | H |
| Press | Kalshi-backed beta Oct 2025; Polymarket integration announced 2026-02-01; Forecast announced 2026-06-04 | M |

Trajectory (DefiLlama monthly, H): 2025-12 $1.9M, 2026-03 $2.5M, 2026-04 $4.2M, 2026-05 $5.2M, **2026-06 $13.8M (peak)**, 2026-07 $11.4M, 2026-08 $5.6M, 2026-09 $5.3M, 2026-10 (to the 17th) $3.9M. Roughly $250K/day now.

## 2. What it is

- **Kind**: broker / front end (DefiLlama category `Interface`, listed 2025-12-04, parent Jupiter). Jupiter operator per its Terms: Block Raccoon S.A. (M, search summary of the Terms; not re-read in full). Non-custodial, Solana.
- **Market model (H, `developers.jup.ag/docs/prediction`)**: binary YES/NO only. An *event* holds one or more binary *markets* (one market per candidate/team; multi-outcome = several independent binary markets). Contracts pay $1 if correct. Prices are quoted as micro-USD (1,000,000 = $1.00). Contracts are fractional (`*Micro` strings, 1,000,000 = 1 contract; fills floored to 0.01).
- **Order book vs AMM**: not a Jupiter order book. Jupiter's `/orderbook/{marketId}` returns the **upstream provider's** book re-shaped as `yes`/`no` bid arrays (Kalshi-style) (H for shape, section 3; M for the transform). Orders are executed by a **keeper network** "directly on the underlying prediction markets" (H, docs). Native Forecast markets (provider `bisonfi`) are different: multiple prop-AMM market makers quote, Jupiter routes to the best quote, and the order is an atomic Jupiter swap USDC -> outcome token (H docs; M press).
- **Tokenisation**:
  - Keeper path (Polymarket/Kalshi markets): **no transferable outcome token**. Exposure is a program account: a Position PDA derived from owner + market + side, plus a short-lived Order account and a Vault PDA escrow (H docs). Opening a position = 3 transactions: create order (user-signed), keeper fill, order close (H docs).
  - Forecast / `bisonfi`: each side is a Token-2022 mint (`outcomeMint`) worth $1/$0; issuer program `2sVcg2dBSUzXkmdZ8M5cp1LbnzDrWJmr6hktkHwB8nY3`; these mints can be swapped through the normal Jupiter Swap API (H, `docs/prediction/forecast`).
  - Sportsbook "ticket" markets (OpenAPI `provider` enum value `gx`): fixed-odds tickets from "a separate sportsbook provider", no order book, no early exit, $4-$3,000 per ticket (H user docs; the mapping gx = ticket provider is M, docs never say what `gx` is).
- **Other products**: Degen (5/15-minute Up/Down; BTC ones are Polymarket-sourced "since 30 September 2026", SPCX/SpaceX is Forecast and US-market-hours only), Arcade (1-minute BTC/SOL pool bets, 1% of payout), clans, leaderboards, copy-bet (H user docs). None matter for arbitrage.
- **Chain / collateral**: Solana mainnet only. Docs say deposits and payouts are **JupUSD or USDC** (mint choice per order via `depositMint`; default USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; JupUSD mint `JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD` appears in the docs' example). Quick Buy also accepts SOL (swapped first). Forecast: USDC only. `vault-info` shows `settlementMint` = USDC (H, fixture `vault_info.json`). Needs a little SOL for fees and rent. (H unless noted.)

## 3. Read API (official, public-ish, key optional)

| Item | Detail | Tag |
|---|---|---|
| Status | **official-public** (keyless tier works) though docs say a key is required | H |
| Docs | https://developers.jup.ag/docs/prediction (+ `/events-and-markets`, `/trading-lifecycle`, `/open-positions`, `/manage-positions`, `/claim-payouts`, `/position-data`, `/forecast`); every docs page is also fetchable as markdown by appending `.md`; index at https://developers.jup.ag/docs/llms.txt | H |
| OpenAPI | https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml (OpenAPI 3.0.3, 83 KB, "v1.0.0") | H |
| Base URL | `https://api.jup.ag/prediction/v1` | H |
| Auth | `x-api-key` header (security scheme `ApiKeyAuth`); keys come from the Portal (account sign-up; I did not sign up). **Observed: GETs succeed with no key.** | H |
| Rate limits | Docs (generic Jupiter table, `docs/portal/rate-limits`): Keyless 0.5 RPS / 30 per min; Free 1 RPS; Developer 10; Launch 50; Pro 150; per organisation; 60 s sliding window; `x-ratelimit-remaining/current/reset` headers; 429 on excess. **Observed keyless: `remaining` 4 after the first call and `reset` = +10 s, i.e. about 5 requests per 10 s window**, which matches 0.5 RPS but not a 60 s window. Prediction-specific limits NOT FOUND. | H |
| Websocket / streaming | NOT FOUND (searched: prediction docs, OpenAPI paths, llms.txt, `/docs/prediction/websocket.md` 404). Polling only. | H absence |
| MCP | Hosted Trading MCP `https://mcp.jup.ag` has prediction tools (e.g. `prediction_search_events`); keyless at a lower limit | H (docs page `docs/ai/trading-mcp`) |

**Key endpoints (all in the OpenAPI; GETs read-only):**
- Discovery: `GET /events` (params `category` = crypto|sports|politics|esports|culture|economics|tech, `subcategory`, `tags`, `filter` = new|live|trending|upcoming, `provider` = kalshi|polymarket|bisonfi (**default polymarket**), `sortBy`, `sortDirection`, `includeMarkets`, `includeAllMarkets`, `start`, `end`), `GET /events/search?query=&limit=`, `GET /events/{eventId}`, `GET /events/{eventId}/markets`, `GET /events/scores`, `GET /events/suggested/{pubkey}`.
- Prices: `GET /markets/{marketId}` -> `pricing.{buyYesPriceUsd, sellYesPriceUsd, buyNoPriceUsd, sellNoPriceUsd, volume}` (micro-USD).
- Depth: `GET /orderbook/{marketId}` -> `{yes:[[cents,size]], no:[...], yes_dollars:[["0.0100",size]], no_dollars:[...]}`, ascending by price; arrays are **bids** per side.
- Trades: `GET /trades` (global recent fills, no pagination args documented), `GET /history`, `GET /leaderboards`, `GET /profiles/{pubkey}`.
- Resolution: market `status` (open|closed|cancelled), `result` (null|yes|no), `resolveAt`, `rulesPrimary`/`rulesSecondary`, event `rulesPdf`; `GET /forecast?marketId=` returns a forecast time series with Kalshi-style field names (`market_ticker`, `end_period_ts`, `numerical_forecast`; not exercised).
- Health/TVL: `GET /trading-status`, `GET /vault-info`.
- Trade: `POST /orders`, `POST /execute`, `GET /orders/status/{orderPubkey}`, `GET /positions`, `DELETE /positions/{pubkey}`, `POST /positions/{pubkey}/claim` (section 4).

**Confirmed response shapes (unauthenticated GET, 2026-10-19, fixtures saved):**
- `GET /events?category=crypto&filter=trending&includeMarkets=true&start=0&end=2` -> `{data:[{eventId:"POLY-1112205", category, subcategory, tags, metadata:{slug,title,series:"polymarket",closeTime,...}, volumeUsd:"8458902000000", volume24hr, closeCondition, markets:[{provider:"polymarket", marketId:"POLY-5777422", status, result, title, openTime, closeTime, rulesPrimary, pricing:{...}, outcomes, clobTokenIds:[yesTokenId,noTokenId], marketOptions, ...}]}], pagination:{start,end,hasNext}}`. **No `total` in pagination** (only `hasNext`). `volumeUsd` is micro-USD and is the **upstream venue's** event volume (the Bitcoin-price event shows $8.46M, the Brazil election $187.7M), not volume done through Jupiter. A 2-event page was 88 KB (rules text is inline), a 5-event sports page 1.6 MB, so always set small `end` and avoid `includeMarkets` unless needed.
- `GET /orderbook/POLY-5777422` -> arrays as above; best YES bid 0.961 / NO bid 0.012 at fetch time.
- `GET /markets/POLY-5777422` -> `pricing{buyYesPriceUsd:977000, sellYesPriceUsd:960000, buyNoPriceUsd:40000, sellNoPriceUsd:23000, volume:47924}`.
- `provider=kalshi` returns Kalshi tickers (`eventId:"WRECSS-26"`, `marketId:"WRECSS-26-UK"`, `metadata.series:"KXWRECSS"`, rules from `assets.kalshi.com/contract_terms/...`, `clobTokenIds:null`, `outcomes:null`).
- `provider=bisonfi` returns `BISON-<marketPda>-UP|DOWN` markets with `outcomeMint`, `marketPda`, `lifecycleStatus`, `tradable` (the sampled 15m BTC round had `tradable:false`).
- `GET /vault-info` -> `{pubkey:"BrTCoKzZoh7waCM3h2MuJKan8fX2A574gedorgPRC3HJ", data:{settlementMint, currentContracts:"184489000000", globalMaxContracts:"1035000000000", positionMaxContracts:"50000000000", protocolFeeBps:"0", tradingDisabled:"false", depositsDisabled:"false", ...}, vaultBalance:"248.460275"}` (H; interpretation of `currentContracts` as open interest of ~184,489 contracts is M).

## 4. Trade path and PayBox reachability

**Programmatic trading: yes, via build-sign-submit (official).**
1. `POST /orders` `{ownerPubkey, marketId, isYes, isBuy:true, depositAmount (micro units, min $5), depositMint, [contracts]}` returns a base64 unsigned **versioned Solana transaction**, `txMeta{blockhash,lastValidBlockHeight}`, `order{orderPubkey, positionPubkey, requiredSigners, estimatedProtocolFeeUsd, estimatedVenueFeeUsd, maxBuyPriceUsd, slippageBps, ...}` and `execution{endpoint, context}` (H, docs + OpenAPI).
2. The owner signs (ed25519) and submits to Solana (`sendRawTransaction`) for keeper-filled orders; for Forecast/atomic-swap orders the signed tx goes to `POST /execute` with the opaque `execution.context` (H docs).
3. A keeper fills on the upstream market; poll `GET /orders/status/{orderPubkey}` (created|partiallyfilled|filled|failed); position appears in `GET /positions`.
4. Sell: `DELETE /positions/{positionPubkey}` returns a sell tx (or `POST /orders` with `isBuy:false` and `positionPubkey`); `DELETE /positions` closes all and needs `minSellPriceSlippageBps`. Claim: `POST /positions/{positionPubkey}/claim` (some markets auto-settle). Limit orders: limit **buys only**, Polymarket-sourced markets only; limit sells disabled (H user docs FAQ).
- No signed-order scheme (no EIP-712): authority is the Solana tx signature.

**PayBox reachability: partial (H for PayBox facts from `docs/research/06-paybox-platform.md`, 2026-10-19; Jupiter side H).**
- EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon, OP, Avalanche) **cannot trade it directly**: the venue is Solana-only and the only signature is a Solana ed25519 tx. Funding such a wallet's USDC to Solana would need a bridge/swap (PayBox `request_swap` cross-chain via MoonX routes, M, not tested and a money tool).
- A PayBox **Solana** credential could in principle sign the Jupiter-built tx with `request_wallet_sign` op `solanaTransaction` (live schema has that op), or return it as an `io.paybox/transactionProposal` of kind `solana` (limits: <= 1,232 bytes, legacy/v0, **exactly one signer who is the fee payer**, no durable nonce, no sponsor) (H from the project notes).
- Unverified blockers (cannot be tested read-only because `POST /orders` is a POST): (a) whether `order.requiredSigners` is just the owner or also an order-account keypair or keeper (a second signer would break the single-signer proposal kind); (b) tx size; (c) whether the Forecast `/execute` leg needs Jupiter's server to co-handle the signed tx (then the proposal path would not fit and `request_wallet_sign` + own submit/`/execute` is needed).
- The API call itself must come from a non-US/non-KR IP, and the wallet owner must not be in a Prohibited Locality (section 7).
- PayBox has an official `jupiter` plugin but it covers swaps/assets, not Predict (H, project notes).

## 5. Fees

- **Polymarket-sourced markets (H, `docs.jup.ag/user-docs/trade/predict/fees`)**: "Twice the Polymarket fee on that market" - where Polymarket charges a fee, Jupiter adds an equal extra fee. Paid by the trader, in the token used to buy, charged only on executed fills (buy and sell), rounded **up** to the cent; no fee on claims/refunds; no fee for resting orders until they fill. Plus Solana network fees and temporary rent in SOL.
- The published table (e.g. 100 contracts @ $0.25 -> $1.32; 1 contract @ $0.01 -> $0.01) equals `ceil_to_cent(0.07 * contracts * p * (1-p))` - I recomputed all 18 cells and every one matches (H arithmetic). That is 2 x (0.035 * C * p * (1-p)), so the table implies a Polymarket-side coefficient of 0.035 for the category used; the actual Polymarket schedule varies by category and was not re-verified here (M). It also happens to be Kalshi's published taker-fee shape (M).
- `protocolFeeBps` in the vault config is `0` (H, fixture); the `POST /orders` response has separate `estimatedProtocolFeeUsd` / `estimatedVenueFeeUsd` fields I could not observe.
- Forecast and sports-ticket markets: currently **no trading fee** (H user docs). Arcade: 1% of payout. Degen non-Forecast: "set by the market's route".
- Contradiction to note: the DefiLlama methodology says "Jupiter doesnt keep any fees as of now, all the fees goes to kalshi" (H that it says so; likely stale, from the Kalshi-only beta). Jupiter's own docs (current) describe a Jupiter-retained fee equal to the Polymarket fee. I trust Jupiter's docs; flag DefiLlama's fee/revenue split as unreliable.
- Minimums: $5 per order on Polymarket-sourced markets (API: "400 Minimum order is $5"); Forecast API path $5-$250 (API) / $5-$1,000 (user docs - the two docs disagree, M).

## 6. Resolution mechanism and dispute risk

- Jupiter does not resolve anything. Outcome comes from the upstream source (Polymarket's own resolution process for POLY markets (UMA-based per Polymarket's public design, M, not re-verified here); Kalshi for Kalshi markets; Chainlink BTC/USD stream for Forecast BTC; Pyth Pro signed snapshots for SPCX) and Jupiter "follows the final result from that source ... does not independently rewrite market outcomes" (H user docs `settlement`). Disputes are therefore **inherited from Polymarket/Kalshi** plus Jupiter-specific lag.
- Docs: "Some market routes record eligible results on-chain, while other integrations settle through their own route"; settlement "is not instant"; closed-but-unsettled positions cannot be closed; cancelled/voided markets refund (`status: cancelled`). Claim is a separate signed tx unless the route auto-pays (Forecast, Arcade); the `claim-payouts` page also mentions a 24-hour auto-claim (H).
- Extra risk layers vs trading the primary venue: keeper failure or fill failure, Jupiter vault/program risk, JupUSD/USDC depeg risk, provider-outage banners (H user docs). The vault only held $248 USDC when read, which suggests user funds are moved to the upstream venue rather than escrowed long-term in Jupiter's vault (M inference from `vaultBalance`; DefiLlama TVL $219,779 at 2026-10-19 00:13Z, max $830K).

## 7. Geo / ToS / automation

- **Geo (H)**: "We have restricted United States and South Korea IPs from accessing the Prediction Market API." The Jupiter Terms of Use (docs.jup.ag user-docs legal) separately list Prohibited Localities for wallets ("wallets located in, established in, or a resident of the United States, the Republic of China, Singapore, Myanmar ..."), and forbid VPN circumvention; Jupiter Mobile restricts more regions than web (H user docs FAQ). My keyless GETs were not blocked from the research host; I did not test from restricted regions and will not try to circumvent.
- **Automation**: not forbidden for the API (it is a documented developer API with keys and rate-limit tiers). The Jupiter *SDK & API License Agreement* (https://developers.jup.ag/docs/legal/sdk-api-license-agreement) governs keyed use and contains clauses an aggregator should read: prohibits "access the API or SDK for competitive analysis or disseminate performance information", "exceeds reasonable request volume", combining API content "with content obtained through scraping or any other means outside the API", and "sell, lease, share ... any content obtained through the API ... to any third party" (quoted sparingly; H). Whether the keyless tier is bound by it is unclear (M). An arbitrage scanner that only reads Jupiter as a price source would arguably fall under "competitive analysis"/redistribution, a further reason not to build on it.
- Compliance posture: the user is responsible for local legality; Jupiter "does not confirm whether trading is permitted where you are" (H FAQ). Regulatory exposure for Polymarket-routed trades follows the upstream venue's own rules (not analysed here).

## 8. Liquidity and shared-liquidity verdict

**Volume (own, via Jupiter)**: $259K/day, $5.98M 30d, $57.8M all time (DefiLlama, as of chart day 2026-10-17; H for the numbers, M for comparability). **TVL / escrow**: $0.22M (DefiLlama 2026-10-19 00:13Z); vault 248 USDC; vault caps `globalMaxContracts` 1,035,000 contracts and `positionMaxContracts` 50,000 (H). Press: ~$17M cumulative before Forecast and $5.3M in April 2026 (M, CryptoTimes 2026-06-05). Scale check: Jupiter's 30d volume is ~0.04% of Kalshi's ($14.9B) per the project's own DefiLlama pull in `docs/research/14-platform-of-platforms.md`.

**Shares liquidity with: Polymarket (primary) and Kalshi (secondary) - NOT an independent arbitrage leg.** Evidence:
1. H: Jupiter docs guide: "Aggregates liquidity from Polymarket and Kalshi"; `provider` param "`polymarket` (default), `kalshi`"; "Polymarket (default) has more markets. Kalshi is US-regulated."
2. H: market ids and metadata are Polymarket's: `POLY-5777422`, `clobTokenIds` are Polymarket CLOB token ids, `metadata.series:"polymarket"`, images hosted on Polymarket's S3.
3. H (price identity): at ~2026-10-19 00:44Z Jupiter `pricing` for `POLY-5777422` was buyYes $0.977 / sellYes $0.960; Polymarket's CLOB for the YES token (fetched within ~2 s) showed best ask 0.977 and best bid 0.96 (size 12,503, which also appears as the 0.9600 level in Jupiter's orderbook). Fixtures `market_POLY-5777422.json`, `orderbook_POLY-5777422.json`, `polymarket_clob_book_yes_top6_for_comparison.json`.
4. H: for Kalshi, `WRECSS-26-UK` on Jupiter showed buyYes 0.157 / sellYes 0.131, identical to Kalshi's own API (`yes_ask_dollars 0.1570`, `yes_bid_dollars 0.1310`).
5. H (Kalshi primary source, 2025-12-01, stale >6 mo): "Tokenized predictions powered by Kalshi are now live on @Solana, via @JupiterExchange and @DFlow" and "Under the hood of DFlow and Jupiter, a hybrid RFQ system atomically executes trades" (https://news.kalshi.com/p/kalshi-solana-tokenized-predictions).
6. H user docs (current): "Browse markets are currently sourced from Polymarket". So whether **Kalshi markets are still tradable through Jupiter is unverified**: the API still serves live Kalshi quotes (point 4), but the user docs no longer mention Kalshi and CryptoTimes (2026-06-05) says it is unclear whether the Kalshi integration is still active (M). Needs a `POST /orders` test or Jupiter confirmation.
- Truly independent bits (small): Forecast `bisonfi` markets (prop-AMM quotes; SPCX/BTC 15m), and sportsbook ticket markets (fixed odds from a separate provider; held to resolution, no exit, so unusable as an arb leg).

## 9. Event categories and overlap

Categories (H, OpenAPI + user docs): sports (moneyline/spreads/totals/exact score/goalscorers, esports), politics, crypto (price-hit ladders, 5/15-minute and hourly Up/Down), economics (Fed, BoJ, BoK decisions), culture, tech, finance, weather, mentions. Trending samples fetched 2026-10-19 were all `POLY-*`: Brazil and French presidential elections, "Will the U.S. invade Iran before 2027", NFL (Cowboys vs Packers), UEFA Champions League 2027, Ballon d'Or 2026, "Fed Decision in October?", BTC/ETH/SOL "Up or Down" 5/15-minute rounds, "Which company has the best AI model end of October?". Because the markets are Polymarket's (and Kalshi's), overlap with other venues is total on those categories, and the **cross-venue edge is only between Polymarket/Kalshi and other venues, not between Jupiter and them**. Mapping: `POLY-<n>` = Polymarket event/market id (Gamma id), usable directly as a join key to the Polymarket adapter; Kalshi ids are native Kalshi tickers.

## 10. Adapter recommendation

- **Do not build a Jupiter price adapter.** Poll Polymarket/Kalshi directly (no 2x fee, no 0.5 RPS cap, deeper data, websockets).
- If the project later wants a Solana-wallet execution route to Polymarket via PayBox Solana credentials, the surface to wrap is `GET /markets`, `GET /orderbook`, `POST /orders` (+ `/execute` for Forecast), `GET /orders/status`, `GET /positions`, `POST .../claim`; budget 3 txs per entry, $5 min, 2x Polymarket fees, keeper latency, US/KR block. Verify `requiredSigners` and tx size first (a single `POST /orders` build for a tiny order, which this read-only pass did not do).
- Optional weak signal: the public `/trades` feed and `/leaderboards` (Solana wallet flow; copy-bet is a product feature). Low volume (~20 fills per 18 min at the time) so low value.

## 11. NOT FOUND / open questions

- Prediction-specific rate limits (searched: prediction docs, OpenAPI, rate-limits page): only generic tiers; observed 5 req / 10 s keyless.
- Websocket/stream (searched: prediction docs, OpenAPI paths, llms.txt): none.
- What provider `gx` is (searched: prediction docs, OpenAPI, user docs): unexplained; likely the sportsbook ticket provider (M).
- On-chain Jupiter Predict program id for the keeper path: NOT FOUND (docs list only the Forecast issuer program and the vault PDA via `/vault-info`). Not searched on-chain (no RPC use).
- `requiredSigners` content and tx size of `POST /orders` builds (POST not allowed here).
- Whether Kalshi markets can still be bought through Jupiter (see 8.6).
- Whether keyless callers may call `POST /orders`/`/execute` (docs say a key is required).
- Jupiter Terms of Use full text was only grepped (Prohibited Localities line read); no Predict-specific legal page found beyond the FAQ.
- jup.ag/prediction page content: WebFetch returned only the nav (client-rendered), no disclaimers visible.

## 12. Suspicious / agent-directed content

- Every `docs.jup.ag` and `developers.jup.ag` markdown page starts with a "Documentation Index ... Fetch the complete documentation index at ... llms.txt ... before exploring further" banner aimed at LLM crawlers; the `docs.jup.ag` pages additionally carry an "Agent Instructions" block telling agents how to describe GUM products ("describe the jup.ag experience from these docs and the mechanics and fees from the GUM docs"). Benign formatting hints; recorded, not followed beyond using the standard index to locate Predict pages.

## Sources

- https://developers.jup.ag/docs/prediction (+ `.md` variants of `/events-and-markets`, `/trading-lifecycle`, `/open-positions`, `/manage-positions`, `/claim-payouts`, `/position-data`, `/social-features`, `/forecast`) - H, fetched 2026-10-19
- https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml - H
- https://developers.jup.ag/docs/guides/how-to-build-a-prediction-market-app-on-solana.md - H ("Aggregates liquidity from Polymarket and Kalshi")
- https://developers.jup.ag/docs/portal/rate-limits.md, `/docs/portal/api-keys.md`, `/docs/ai/trading-mcp.md`, `/docs/llms.txt` - H
- https://developers.jup.ag/docs/legal/sdk-api-license-agreement - H
- https://docs.jup.ag/user-docs/trade/predict (+ `/faq`, `/fees`, `/how-it-works`, `/settlement`, `/degen`, `/sports-markets`), https://docs.jup.ag/user-docs/legal/terms-of-use - H (user-facing docs, current)
- Live GETs (2026-10-19, keyless): `https://api.jup.ag/prediction/v1/{trading-status, events, markets/POLY-5777422, orderbook/POLY-5777422, vault-info, trades}`; `https://clob.polymarket.com/book?token_id=...`; `https://api.elections.kalshi.com/trade-api/v2/markets/WRECSS-26-UK` - H
- https://api.llama.fi/summary/dexs/jupiter-prediction and https://api.llama.fi/protocol/jupiter-prediction - H for numbers; methodology text M/stale
- https://news.kalshi.com/p/kalshi-solana-tokenized-predictions (2025-12-01) - H for quotes, stale
- https://defirate.com/news/jupiter-brings-polymarket-to-solana-expanding-prediction-markets/ (2026-02-03), https://www.theblock.co/news/defi/2026-02-01-jupiter-polymarket-solana-387945 (2026-02-01), https://www.cryptotimes.io/2026/06/05/jupiter-unveils-forecast-to-power-solana-prediction-markets/ (2026-06-05) - M
- Search summaries (not opened): CoinMarketCap Academy "Jupiter Prediction Market Beta Launches on Solana", Webopedia, Blockhead - M/L (Oct-Dec 2025, stale)
- Project notes: `docs/research/06-paybox-platform.md` (PayBox Solana limits), `docs/research/14-platform-of-platforms.md` (earlier Jupiter entry, DefiLlama volumes)
