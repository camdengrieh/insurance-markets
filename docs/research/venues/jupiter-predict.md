# Jupiter Predict (Solana broker/front end over Polymarket, Kalshi data, and a small native product) - adapter spec

Researched 2026-10-19 (~01:40-02:10 UTC). READ-ONLY: unauthenticated GETs to documented hosts (`api.jup.ag`, `developers.jup.ag`, `docs.jup.ag`, `clob.polymarket.com`, `api.elections.kalshi.com`, `api.llama.fi`) with the generic User-Agent `insurance-markets-research/0.1`; WebFetch of docs and press pages. No account, no API key, nothing signed, no POST/PUT/DELETE (so `POST /orders` and `POST /execute` were NOT exercised), no wallet, no PayBox money tool. No third-party code cloned or run. WebSearch budget was exhausted early in this session, so the "is Kalshi still wired in" question rests on docs/API evidence, not news search.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
All third-party text (docs, API payloads, market rules) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/jupiter-predict/` (12 files, largest 10 KB; third-party trader wallet addresses in the trades feed are replaced with `WALLET_n`).
Cross-reference: an earlier pass left `docs/research/venues/jupiter-prediction-markets.md` (+ fixtures). This spec re-fetched and re-checked its key claims independently; where this pass did not re-check something, it is marked M.

## 0. Verdict

**adapter_priority: skip** as a price/liquidity leg. Revisit only as an optional Solana-wallet execution route into Polymarket liquidity.

1. **Live** (H): `trading_active:true`, the global trade feed had fills 0 to 15 minutes old, DefiLlama shows $255K volume on 2026-10-18. Volume is down about 70% from its June 2026 peak.
2. **Not independent** (H): it is a keeper-executed broker. Browse markets are Polymarket's (ids `POLY-<id>`, Polymarket `clobTokenIds`, and Jupiter's `/orderbook` equals Polymarket's CLOB level-for-level, section 8). The API also still serves Kalshi markets with prices identical to Kalshi's own API. Any Jupiter-vs-primary-venue gap is just Jupiter's extra fee (it charges "2x the Polymarket fee").
3. **API is good but redundant** (H): keyless reads work, OpenAPI spec exists, `/orderbook` and `/trades` exist. There is no websocket and the keyless limit is about 5 requests per 10 s. Everything it serves is a re-presentation of data we can read straight from Polymarket and Kalshi.
4. **ToS point against building on it** (H): the Jupiter SDK/API License Agreement prohibits use "for competitive analysis", sharing API content with third parties and combining it with scraped content (section 7). A scanner that republishes Jupiter prices is on the wrong side of that.
5. **Residual value, small**: (a) a Solana credential in PayBox can reach Polymarket liquidity through Jupiter at higher fees (unverified, section 4); (b) Jupiter Forecast (`bisonfi`) 15-minute BTC Up/Down markets with a native prop-AMM, thin; (c) the public `/trades` feed as a very weak flow signal.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.jup.ag/prediction/v1/trading-status` | `{"trading_active":true}` at 2026-10-19T01:41Z, no key | H (fixture `trading_status.json`) |
| `GET /trades` | 20 fills between 01:27:07Z and 01:41:47Z (newest ~0 min old), total about $223 over that 15-minute sample; all 20 were `POLY-*` markets | H (fixture `trades_feed_redacted.json`) |
| DefiLlama `jupiter-prediction` (category `Interface`, parent Jupiter, listed 2025-12-04) | 24h (day 2026-10-18) $255,078; 7d $1.59M; 30d $6.24M; all-time $58.03M | H (fixture `defillama_volume_summary_trimmed.json`) |
| DefiLlama monthly sum from the daily chart | 2025-10 $0.07M, 11 $0.82M, 12 $1.90M, 2026-01 $1.78M, 02 $1.27M, 03 $2.50M, 04 $4.22M, 05 $5.24M, **06 $13.79M (peak)**, 07 $11.42M, 08 $5.60M, 09 $5.28M, 10 (to the 18th) $4.16M | H |
| Dev docs | "The Prediction Market API is currently in beta and subject to breaking changes" | H (`developers.jup.ag/docs/prediction`) |
| Press | Polymarket integration announced 2026-02-01/02 with a $35M ParaFi JUP investment; no volume or fee data in the article | H for the announcement (CoinDesk 2026-02-02), M for anything else |

Scale note: the trade-feed sample ($223 in 15 min, about $21K/day if extrapolated) is roughly 10x below DefiLlama's $255K/day. Either `/trades` is a sampled/filtered feed or DefiLlama counts other flows (Degen, Arcade). Unreconciled (M).

## 2. What it is

- **Kind**: `broker-or-frontend`. Jupiter is a Solana DEX aggregator; Predict is a non-custodial Solana app/API that routes orders to external prediction-market providers via a keeper network. Jupiter "doesn't create markets" (H, FAQ). Contracting entity per Terms: "Jupiter" with a George Town, Cayman Islands registered address; governing law Panama; LCIA arbitration, London (H, `docs.jup.ag/user-docs/legal/terms-of-use`).
- **Market model** (H, dev docs): binary YES/NO only. An event holds one or more binary markets (one per candidate/team; multi-outcome = several independent binary markets). A contract pays $1 or $0. Prices are micro-USD (1,000,000 = $1.00). Quantities have `*Micro` (1,000,000 = 1 contract), `*Decimal`, and a legacy whole-contract field; fills are floored to 0.01 contract.
- **Order book vs AMM**: not a Jupiter order book. For Polymarket and Kalshi markets, `/orderbook/{marketId}` is the upstream book re-shaped as `yes`/`no` bid arrays (H, section 8). Execution is by Jupiter's keeper network "on the underlying markets" (H, dev docs). Jupiter Forecast (`bisonfi` provider) is different: prop-AMM quotes, atomic swap (H, `docs/prediction/forecast`).
- **Outcome tokenisation**:
  - Keeper path (Polymarket/Kalshi-sourced): no transferable outcome token. Exposure is a Position PDA (owner + market + side), a transient Order account (with an order escrow ATA, `orderAtaPubkey`), and a vault PDA. Three transactions per entry: create order (user-signed), keeper fill, order close (H, dev docs).
  - Forecast (`bisonfi`): each side is a Token-2022 `outcomeMint`, worth $1/$0, tradable via the normal Jupiter Swap API (H, forecast doc).
  - Sports "ticket" markets (OpenAPI `provider: gx`): fixed odds from "a separate sportsbook provider", no exit, $4-$3,000 per ticket (H, `user-docs/trade/predict/sports-markets`). The page does not name the provider, and does not say what `gx` is (the `gx` = ticket provider mapping is M).
- **Other products** (H, FAQ): Degen (5/15-minute Up/Down on crypto and SpaceX), Arcade (1-minute BTC/SOL pool bets, no order book, 1% of winning payout), Mentions, clans and leaderboards. None are arbitrage-relevant (pool or ticket pricing, no exit).

## 3. Chains and collateral

- **Solana mainnet only** (H, FAQ: "Solana only").
- **Collateral**: dollar-pegged. Dev docs: deposits in "JupUSD or USDC" via `depositMint` (default USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`); the vault's `settlementMint` is that USDC mint (H, fixture `vault_info.json`). Quick Buy also accepts SOL, swapped first (H, how-it-works). Forecast: USDC only, $5-$250 via the API (dev docs) vs $5-$1,000 (user FAQ), a doc disagreement (M). The dev overview page says "Receive JupUSD payouts" while the vault settles in USDC; docs are inconsistent on payout asset (H that they disagree).
- Needs a little SOL for network fees and temporary rent (H, FAQ).

## 4. Read API

| Item | Detail | Tag |
|---|---|---|
| Status | **official-public**: documented as key-required, but GETs succeed keyless (observed). Beta; "subject to breaking changes". | H |
| Docs | https://developers.jup.ag/docs/prediction (+ `/events-and-markets`, `/trading-lifecycle`, `/open-positions`, `/manage-positions`, `/claim-payouts`, `/position-data`, `/forecast`); every page also fetches as markdown by appending `.md`; index https://developers.jup.ag/docs/llms.txt | H |
| OpenAPI | https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml (3.0.3, "v1.0.0", 83 KB, 25 paths, fixture `openapi_paths_and_provider_enums.json`) | H |
| Base URL | `https://api.jup.ag/prediction/v1` | H |
| Auth | Header `x-api-key` (scheme `ApiKeyAuth`); key from https://developers.jup.ag/portal (needs an account; not created). Keyless worked for all GETs I issued. | H |
| Rate limits | Docs (generic Jupiter table): Keyless 0.5 RPS / 30 per min; Free 1 RPS; Developer 10; Launch 50; Pro 150, per organisation, 60 s sliding window, headers `x-ratelimit-remaining/current/reset`, 429 when over. **Observed keyless: window of about 10 s; the 5th request in a window showed `remaining 0`, the 6th returned 429** (`{"code":429,"message":"[API Gateway] Too many requests"}`), i.e. about 5 per 10 s, which equals 0.5 RPS but not the documented 60 s window. Prediction-specific limits: NOT FOUND (searched: prediction pages, OpenAPI, rate-limits page). | H |
| Websocket/stream | NOT FOUND (searched: prediction docs, OpenAPI paths, llms.txt). Polling only. | H absence |
| MCP | Hosted Trading MCP with prediction tools exists per the earlier pass (`mcp.jup.ag`); not re-read here | M |

**Key endpoints** (all in the OpenAPI, GET unless noted):
- Discovery: `/events` (params `category`, `subcategory`, `tags`, `filter` new|live|trending|upcoming, `provider` kalshi|polymarket|bisonfi with default polymarket, `sortBy`, `sortDirection`, `includeMarkets`, `includeAllMarkets`, `start`, `end`), `/events/search?query=&limit=`, `/events/{eventId}`, `/events/{eventId}/markets`, `/events/{eventId}/markets/{marketId}`, `/events/scores`, `/events/{eventId}/score`, `/events/suggested/{pubkey}`.
- Prices: `/markets/{marketId}` -> `pricing{buyYesPriceUsd, sellYesPriceUsd, buyNoPriceUsd, sellNoPriceUsd, volume}` (micro-USD).
- Depth: `/orderbook/{marketId}` -> `{yes:[[cents,size]], no:[...], yes_dollars:[["0.5900",size]], no_dollars:[...]}`; arrays are **bids** per side, ascending by price.
- Trades/social: `/trades` (global recent fills, 20 rows, no pagination args seen), `/history`, `/leaderboards`, `/profiles/{ownerPubkey}`, `/profiles/{ownerPubkey}/pnl-history`.
- Resolution: market `status` (open|closed), `result` (null|yes|no), `resolveAt`, `rulesPrimary`/`rulesSecondary`, event `rulesPdf`, `closeCondition`; `/forecast` is a forecast-history endpoint (not exercised).
- Health: `/trading-status`, `/vault-info`.
- Trade (not exercised): `POST /orders`, `POST /execute`, `GET /orders`, `GET /orders/status/{orderPubkey}`, `GET /positions`, `DELETE /positions`, `DELETE /positions/{positionPubkey}`, `POST /positions/{positionPubkey}/claim`.

**Confirmed response shapes** (keyless GET, 2026-10-19, fixtures saved):
- `GET /events?category=crypto&filter=trending&includeMarkets=true&start=0&end=1` -> `{data:[{eventId:"POLY-1112205", isActive, isLive, category:"crypto", subcategory:"btc", tags, metadata:{slug,title,series:"polymarket",closeTime,...}, volumeUsd:"8458902000000", volume24hr, closeCondition, rulesPdf, markets:[{provider:"polymarket", marketId:"POLY-5407561", status:"open", result:null, title, openTime, closeTime (unix s), rulesPrimary, pricing:{buyYesPriceUsd:630000,...,volume}, outcomes:["Yes","No"], clobTokenIds:[yes,no], marketOptions, sportsMarketType,...}], sportsMarketGroups}], pagination:{start,end,hasNext}}`. No `total` in the events pagination (the search endpoint adds one). `volumeUsd` is the upstream event volume in micro-USD ($8.46M here), not volume done through Jupiter. Payload is heavy: one event with all markets was 55 KB because rules text is inline, so keep `end` small.
- `GET /orderbook/POLY-5407561` -> best YES bid 0.62 (384), 0.61 (12,559.57), 0.60 (1,116), 0.59 (1,050); NO bids 0.37 (5), 0.36 (783), 0.35 (3,439.43), 0.34 (15,152).
- `GET /markets/POLY-5407561` -> `pricing{buyYesPriceUsd:630000, sellYesPriceUsd:620000, buyNoPriceUsd:380000, sellNoPriceUsd:370000, volume:181541}`.
- `provider=kalshi` returns Kalshi tickers (`eventId:"KXNCAAF-27"`, `marketId:"KXMLB-26-MIL"`, `metadata.series:"KXNCAAF"`, `rulesPdf` on `assets.kalshi.com`, `clobTokenIds:null`). Quirk: `provider=kalshi&filter=trending` returned `data:[]` while `provider=kalshi` without that filter, and with `category=sports&filter=live`, returned events.
- `provider=bisonfi` returns `BISON-<marketPda>-UP|DOWN` markets with `outcomeSide`, `lifecycleStatus`, `tradable` (the sample 5-minute BTC round had `tradable:false` and no `pricing` object), and Chainlink BTC/USD rules.
- `GET /vault-info` -> `{pubkey:"BrTCoKzZoh7waCM3h2MuJKan8fX2A574gedorgPRC3HJ", data:{settlementMint:<USDC>, currentContracts:"184489000000", globalMaxContracts:"1035000000000", positionMaxContracts:"50000000000", protocolFeeBps:"0", tradingDisabled:"false", depositsDisabled:"false", settlementDelaySeconds:"0", ...}, vaultBalance:"248.460275"}`. Reading `currentContracts` as about 184,489 contracts of open interest is M.

## 5. Trade path and PayBox reachability

**Programmatic trading exists** (official, documented, H):
1. `POST /orders` with `{ownerPubkey, marketId, isYes, isBuy, depositAmount, depositMint}` (buy; `positionPubkey` + a contracts field for sells) returns a base64 unsigned **versioned Solana transaction**, `txMeta{blockhash,lastValidBlockHeight}`, `order{orderPubkey, orderAtaPubkey, userPubkey, ...}`, `requiredSigners` ("Public keys that must sign the transaction"), and `execution{endpoint, context}`.
2. The owner signs (ed25519), then either submits to Solana with `sendRawTransaction` (the `open-positions` doc's example for keeper-filled orders) or posts `{signedTransaction, context}` to `POST /execute` (required for Forecast/`atomic_swap` orders). The docs are not fully consistent: the OpenAPI says to pass each build's `execution.context` unchanged to `/execute` and lists a `create_order` context type "for keeper-filled orders", and the Forecast doc says "Every order, buy or sell, is built by the API, signed by you, then submitted to /execute". Which path a keeper-filled order must use is therefore unconfirmed (M).
3. A keeper fills on the upstream market; poll `GET /orders/status/{orderPubkey}` (created|partiallyfilled|filled|failed); the position appears in `GET /positions`.
4. Sell: `POST /orders` with `isBuy:false` or `DELETE /positions/{positionPubkey}`; claim: `POST /positions/{positionPubkey}/claim` (Forecast and Arcade auto-settle).
- Minimum order $5 (`400 Minimum order is $5`); limit orders: buys only, Polymarket-sourced only; limit sells disabled; no parlays (H, FAQ and open-positions doc).
- No EIP-712 or HMAC scheme: authority is the Solana transaction signature. The API call itself needs `x-api-key` and a non-US/non-KR IP.

**PayBox reachability: partial** (PayBox facts are H from the project note `docs/research/06-paybox-platform.md`; Jupiter side H).
- **EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon, OP, Avalanche) cannot trade it**: the venue is Solana-only and the only signature is a Solana ed25519 transaction. They would first need to bridge/swap USDC to Solana, which is a money-moving PayBox tool (`request_swap`) that I did not call (M).
- A PayBox **Solana** credential could in principle sign the Jupiter-built transaction with `request_wallet_sign` op `solanaTransaction`, then your own code submits it (or posts it to `/execute`). The `io.paybox/transactionProposal` kind `solana` allows <= 1,232 bytes, legacy/v0, **exactly one signer who must be the fee payer**, no durable nonce, no sponsor (H from the project note).
- Unverified blockers, untestable without a POST: (a) whether `requiredSigners` is only the owner (an extra order-account keypair or Jupiter co-signer would break the single-signer proposal kind); (b) whether the build exceeds 1,232 bytes; (c) the 3-transaction lifecycle (create, keeper fill, close) means reconciliation, not a single approved proposal.
- Jupiter's own PayBox plugin (`jupiter`, official, not enabled) is swaps/assets and not a Predict plugin (H from the project note).

## 6. Fees

- **Polymarket-sourced Browse markets** (H, `docs.jup.ag/user-docs/trade/predict/fees`): "2x the Polymarket fee on that market". Jupiter adds a fee equal to Polymarket's, so the user pays twice. Paid by the trader, in the token used to buy, only on executed fills (buy and sell), rounded **up** to the cent, included in the quote rather than shown separately; no fee for claims or refunds; Solana network fees and temporary rent extra, in SOL.
- **Published sample table** (1 and 100 contracts at $0.01/0.10/0.20/0.25/0.40: e.g. 100 @ $0.25 -> $1.32): I recomputed all 10 cells and each equals `ceil_to_cent(0.07 * C * p * (1 - p))` (H arithmetic). Polymarket's taker formula is `C * rate * p * (1 - p)` with category rates 0.03-0.07 (project note `docs/research/08-venues-polymarket-kalshi.md`, H there). So "2x" should be 0.06-0.14 depending on category, and the table's flat 0.07 matches none exactly. **Do not model Jupiter fees from the table; use the per-order quote** (`estimatedProtocolFeeUsd` / `estimatedVenueFeeUsd` in the `POST /orders` response per the earlier pass, M; vault `protocolFeeBps` is `0`, H fixture).
- **Forecast and sports tickets**: "None currently". **Arcade**: 1% of winning payout. **Other Degen**: set by the route and shown in the quote (H, fees page).
- **Spread**: buy-side quotes are the upstream ask and sell-side the upstream bid (section 8), so entry + exit pays the upstream spread plus the fee twice.
- DefiLlama's methodology line "Jupiter doesnt keep any fees as of now, all the fees goes to kalshi" (H that it says so) contradicts Jupiter's current docs (a Jupiter-retained fee equal to Polymarket's); treat it as stale from the Kalshi-only beta.
- Order limits: $5 minimum (Polymarket-sourced); Forecast $5-$250 API / $5-$1,000 app; tickets $4-$3,000; Arcade 1-1,000 USDC (H, FAQ and docs).

## 7. Resolution, geo, ToS, automation

**Resolution** (H, FAQ + how-it-works): each market's rules and its source decide the outcome; "Jupiter follows the source and does not independently rewrite outcomes". States Upcoming -> Open -> Closed -> Settled; cancelled/voided markets refund. Some routes record results on-chain, others "settle through their own process". Disputes are therefore **inherited from Polymarket (UMA-based design, M, not re-verified here), Kalshi, Chainlink (Forecast BTC/USD stream, H in rules text)**, plus Jupiter-specific layers: keeper/fill failure, vault/program risk, JupUSD/USDC depeg, provider-outage pauses, and claim lag (most winnings need a manual Claim; "Claim All" exists).

**Geo** (H):
- API docs: "We have restricted United States and South Korea IPs from accessing the Prediction Market API."
- Terms of Use: wallets "located in, established in, or a resident of" a Prohibited Locality (United States, Republic of China, Singapore, Myanmar, Cote D'Ivoire, Cuba, Crimea and Sevastopol, DR Congo, Iran, Iraq, Libya, Mali, Nicaragua, North Korea, Somalia, Sudan, Syria, Yemen, Zimbabwe, plus US/UK/EU-sanctioned regions) are not served; VPN use to alter IP is forbidden. The FAQ says some regions are blocked on mobile and not web and that users are responsible for their own eligibility. My keyless GETs were not blocked from the research host; I did not test from restricted regions and will not circumvent.

**Automation / API licence** (H, https://developers.jup.ag/docs/legal/sdk-api-license-agreement):
- Clause 3.2(f) bars using the API/SDK "for competitive analysis" and disseminating performance information.
- Clause 3.2(d) bars sharing "any content obtained through the API" with third parties; 3.2(g) bars combining API content with content obtained by scraping or any means outside the API; 3.2(e) bars use that "exceeds reasonable request volume" (Jupiter decides); 3.2(h)(iii) bars circumventing usage limits.
- Clause 5.1: "The Licensee may only access the API with the Keys issued to the Licensee by Jupiter." So keyless access is outside the licence's contemplated use (M for what that means in practice, since the endpoints answer keyless).
- Terms of Use itself has no explicit rule on bots or APIs.
- Net: a keyed integration for personal execution is allowed; a cross-venue scanner that redistributes Jupiter prices, or mixes them with direct Polymarket/Kalshi reads, is legally awkward. Another reason not to use Jupiter as a data source.

## 8. Liquidity and shared-liquidity verdict

**Own liquidity (small and falling)**: DefiLlama volume $255K (2026-10-18), $1.59M 7d, $6.24M 30d, $58.0M all-time; DefiLlama TVL $219,779 at 2026-10-19 00:00Z (peak $830K) (H). `/vault-info` shows `vaultBalance` 248 USDC and `currentContracts` about 184K contracts, with caps of 1.035M global and 50K per position (H; interpretation M). The vault holding $248 against 184K contracts suggests funds move to the upstream venue rather than sit in the vault (M). Prior DefiLlama pull in `docs/research/14-platform-of-platforms.md`: Jupiter's 30d volume is about 0.04% of Kalshi's (H there).

**Shares liquidity with Polymarket (primary) and Kalshi (data/quotes): NOT an independent arbitrage leg.**
1. H (price + depth identity, 2026-10-19T01:42Z): for `POLY-5407561` Jupiter's YES bids were 0.62 x 384, 0.61 x 12,559.57, 0.60 x 1,116, 0.59 x 1,050, exactly the Polymarket CLOB YES bids (fixture `polymarket_clob_book_yes_top6_for_comparison.json`). Jupiter's NO bids 0.37 x 5, 0.36 x 783, 0.35 x 3,439.43, 0.34 x 15,152 are exactly the complement of Polymarket YES asks 0.63 x 5, 0.64 x 783, 0.65 x 3,439.43, 0.66 x 15,152. Jupiter `buyYes` 0.63 / `sellYes` 0.62 equal Polymarket's best ask/bid. Sizes match to the cent.
2. H: market ids `POLY-<n>` and Polymarket `clobTokenIds`; `metadata.series:"polymarket"`; images on Polymarket's S3.
3. H: for `KXMLB-26-MIL`, Jupiter `/markets` showed buyYes 0.629 / sellYes 0.618 / buyNo 0.382 / sellNo 0.371, identical to Kalshi's API `yes_ask_dollars 0.6290`, `yes_bid_dollars 0.6180`, `no_ask 0.3820`, `no_bid 0.3710` (fixture `market_KXMLB-26-MIL_jupiter_vs_kalshi.json`). Same for `KXNCAAF-27-UGA` (0.17/0.16).
4. H: dev docs guide and `llms.txt` still say "Aggregates liquidity from Polymarket and Kalshi"; Kalshi's own post (2025-12-01, stale >6 months) said tokenized predictions were live "via Jupiter and DFlow" with "a hybrid RFQ system".
5. **Is Kalshi still tradable through Jupiter? Unverified; evidence leans no (M).** For: the API serves live Kalshi quotes. Against: the OpenAPI `Market.provider` response enum is `polymarket | gx | bisonfi` (no `kalshi`; the events query enum still lists it, fixture `openapi_paths_and_provider_enums.json`); user docs (FAQ, how-it-works, fees) say Browse is "sourced from Polymarket" and never mention Kalshi; the main dev pages no longer mention Kalshi; DFlow, the other Kalshi tokenisation partner, removed Kalshi from its product in July 2026 (from the project note `docs/research/venues/dflow-prediction-markets.md`, M here). Resolve only by a `POST /orders` build or asking Jupiter.
- Independent bits (tiny): Forecast `bisonfi` markets (prop-AMM, 15-minute BTC, sometimes SPCX; `tradable:false` outside a round's window) and sportsbook ticket markets (fixed odds from a separate provider, cannot be sold, so not usable as an arb leg).

## 9. Event categories and overlap

Categories (H, FAQ/OpenAPI): Sports, Crypto, Politics, Esports, Culture, Economics, Tech, Finance, Weather, Mentions. Sampled 2026-10-19: Bitcoin price-hit ladders, NFL (Cowboys vs Packers), BTC/ETH/SOL Up/Down rounds, elections; Kalshi side: MLB and college-football futures, recession markets. Because the markets are Polymarket's (and Kalshi's), overlap with other venues is total, and the cross-venue edge exists between Polymarket/Kalshi and other venues, not between Jupiter and them. Join key: `POLY-<n>` is the Polymarket market id (the Gamma id, M from the earlier pass); Kalshi ids are native Kalshi tickers. Use Jupiter at most as a label for "also tradable from Solana".

## 10. Adapter recommendation

- **skip**. Do not build a Jupiter price adapter: poll Polymarket and Kalshi directly (no extra fee, no 0.5 RPS cap, websockets, deeper data, no licence clause against analysis).
- If the project later wants a Solana-wallet execution route into Polymarket via PayBox Solana credentials, the surface is `GET /markets/{id}`, `GET /orderbook/{id}`, `POST /orders` (+ `/execute`), `GET /orders/status/{pubkey}`, `GET /positions`, `POST .../claim`. Budget: API key (account needed), 3 transactions per entry, $5 minimum, the quoted fee (about 2x Polymarket's), keeper latency, US/KR block. First verify `requiredSigners` and transaction size with a single tiny `POST /orders` build (a write-path call this read-only pass avoided).
- Weak optional signal: `/trades` and `/leaderboards` (Solana wallet flow). Roughly 1-2 fills per minute in the sample; low value, and the licence limits redistribution.

## 11. NOT FOUND / open questions

- Prediction-specific rate limits (searched: prediction docs, OpenAPI, rate-limits page): only the generic tiers; observed about 5 requests per 10 s keyless.
- Websocket/streaming (searched: prediction docs, OpenAPI paths, llms.txt): none.
- What provider `gx` is (searched: OpenAPI, sports-markets page, FAQ): never named. Mapping to the ticket provider is an inference.
- On-chain program id and account layout for the keeper path: NOT FOUND in the pages read (searched: prediction docs, position-data page; only the vault PDA via `/vault-info` and the Forecast issuer program are given). No RPC lookups done.
- `requiredSigners` content and transaction size for `POST /orders` (a POST; not allowed here).
- Whether Kalshi markets can still be bought through Jupiter (section 8.5).
- Whether a keyless caller may call `POST /orders` / `/execute` (docs say a key is required for all requests).
- News check for Sep-Oct 2026 changes (WebSearch budget exhausted): the latest dated press I opened is 2026-02-02 (CoinDesk) and Kalshi's 2025-12-01 post. Product changes after that rest on the docs and live API.
- Not re-verified this pass (carried from the earlier note as M): Degen BTC markets being Polymarket-sourced "since 30 September 2026", the Jupiter Forecast launch date (June 2026), the Forecast issuer program id, the Block Raccoon S.A. operator name, and the MCP endpoint.
- The `/trades` feed vs DefiLlama volume gap (section 1) is unexplained.

## 12. Suspicious / agent-directed content

- Every `developers.jup.ag` page begins with a "Documentation Index ... Fetch the complete documentation index at ... llms.txt ... before exploring further" banner aimed at LLM crawlers. I fetched `llms.txt` because it is the normal doc index, which is also what the task needed; no other action was taken from it.
- Every `docs.jup.ag` page carries an "Agent Instructions" block telling agents to use `docs.gum.ag/llms.txt` for GUM products (Universal Deposit, GUM Universal Bridge) and to describe the jup.ag experience from these docs. Not followed; the GUM docs were not fetched. It does not affect any Predict fact above.
- Nothing in API payloads (market rules, titles) contained instructions.

## Sources

- https://docs.jup.ag/user-docs/trade/predict/faq , `/fees`, `/how-it-works`, `/sports-markets` - H, fetched 2026-10-19
- https://docs.jup.ag/user-docs/legal/terms-of-use - H (Prohibited Localities, VPN clause, entity)
- https://developers.jup.ag/docs/prediction and `.md` pages `/events-and-markets`, `/trading-lifecycle`, `/open-positions`, `/forecast` (fetched, greps for signers/minimums/Kalshi) - H
- https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml - H
- https://developers.jup.ag/docs/guides/how-to-build-a-prediction-market-app-on-solana.md ("Aggregates liquidity from Polymarket and Kalshi") and https://developers.jup.ag/docs/llms.txt - H
- https://developers.jup.ag/docs/portal/rate-limits.md , https://developers.jup.ag/docs/portal/api-keys.md - H
- https://developers.jup.ag/docs/legal/sdk-api-license-agreement - H (clauses 3.2(d)(e)(f)(g)(h), 5.1)
- Live GETs 2026-10-19 keyless: `https://api.jup.ag/prediction/v1/{trading-status, events, markets/POLY-5407561, markets/KXMLB-26-MIL, orderbook/POLY-5407561, trades, vault-info, events/search}`; `https://clob.polymarket.com/book?token_id=<yes token of POLY-5407561>`; `https://api.elections.kalshi.com/trade-api/v2/markets/{KXMLB-26-MIL,KXNCAAF-27-UGA}` - H
- https://api.llama.fi/summary/dexs/jupiter-prediction , https://api.llama.fi/protocol/jupiter-prediction - H for numbers; methodology text M/stale
- https://www.coindesk.com/markets/2026/02/02/jupiter-brings-polymarket-to-solana-and-lands-usd35-million-investment-deal - H for the announcement, silent on Kalshi/fees/volume
- https://news.kalshi.com/p/kalshi-solana-tokenized-predictions (2025-12-01) - H for quotes, stale
- Search-result headlines only (not opened): The Block, Invezz/TradingView, DeFi Rate, CryptoTimes on the Feb 2026 Polymarket integration - M
- Project notes: `docs/research/06-paybox-platform.md` (PayBox Solana proposal limits), `docs/research/08-venues-polymarket-kalshi.md` (Polymarket fee formula), `docs/research/14-platform-of-platforms.md`, `docs/research/venues/dflow-prediction-markets.md` (DFlow Kalshi sunset), `docs/research/venues/jupiter-prediction-markets.md` (earlier pass) - cited as project notes
