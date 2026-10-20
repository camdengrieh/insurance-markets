# CCXT prediction module (`ccxt.prediction`) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` raw file reads of the public ccxt/ccxt repo (saved to a scratch directory, never executed, never installed), WebFetch/WebSearch of docs.ccxt.com, npm/unpkg metadata GETs, and two unauthenticated GETs to venue hosts that CCXT's code maps (Kalshi, SX Bet). No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party text was treated as untrusted data; nothing in it was followed. Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (all <= 50 KB): `docs/research/fixtures/ccxt-prediction-module/` (section 12).

---

## 0. Bottom line

1. **This is not a venue. It is an MIT-licensed client library**: a `prediction` namespace inside CCXT that wraps nine prediction venues behind one event/market/outcome model. It has no liquidity, no hosted API, no ToS, no fees of its own and no market model of its own. It cannot be an arbitrage leg. (H)
2. **Live and fast-moving.** CCXT pushed 2026-10-18, latest release v4.5.88 on 2026-10-14 (npm and PyPI both 4.5.88), 44,454 GitHub stars, 77,163 npm downloads in the week 2026-10-10..16. The prediction module itself is only **3 months old** (first commit "Prediction on ccxt" 2026-07-15; newest venue SX Bet on 2026-09-23, Predict.fun 2026-09-21). Expect API churn. (H)
3. **Coverage = 9 venues**: Binance (Web3 Wallet prediction, which is a front end to Predict.fun), Hyperliquid (HIP-4 outcomes), Kalshi, Limitless, Myriad, Opinion, Polymarket, Predict.fun, SX Bet. Six of those are already being covered natively by us; CCXT has none of the long tail (Manifold, PredictIt, Trueo, XO, Azuro, Augur, ...). (H)
4. **Weak as a bulk scanner**: `fetchEvents` must be scoped by a query/tags/id/slug (an unscoped call throws), `fetchTickers` needs an explicit outcome list on four venues, outcome handles are lossy slugs, and the static fee constants are wrong or approximate. It is a sensible *single-outcome* fetcher, not a market-universe crawler. (H, wiki + source)
5. **Cannot trade through PayBox**: every trading class takes a raw `privateKey` / API secret in-process; there is no external-signer hook. Its real value to us is as a **reference implementation** (endpoint maps, EIP-712 domains, order-book normalisation) and a **test oracle** for our own adapters, MIT-licensed so code can be ported with a notice. (H)
6. **Two on-by-default behaviours to know about** (documented only in code comments and commit titles): CCXT stamps its own *builder code* (zero fee, tracking only) onto signed Polymarket orders, and its Hyperliquid class auto-signs an `approveBuilderFee` (max 0%) for a CCXT-owned builder address before the first order. Neither is charged, both are surprises in a human-approval flow (section 6). (H)
7. **adapter_priority = skip** as a venue adapter (duplicate liquidity, no API of its own). Keep it as: reference source, dev-time cross-check, and optionally the official `ccxt-mcp` read-only server as an ad-hoc exploration tool.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| GitHub repo metadata (`gh api repos/ccxt/ccxt`) | pushed 2026-10-18T09:36Z, 44,454 stars, MIT, default branch master | H |
| Latest release | v4.5.88 published 2026-10-14T10:40Z (GitHub); npm 4.5.88 time 2026-10-14T11:06Z; PyPI 4.5.88 uploaded 2026-10-14T10:56Z | H |
| npm downloads, `ccxt`, 2026-10-10..2026-10-16 | 77,163 (whole library, not the prediction module) | H |
| Prediction module in the published npm package | unpkg listing of `ccxt@4.5.88/js/src/prediction/` shows 9 `.js` + 9 `.d.ts` files (fixture) | H |
| Module history | 38 commits touching `ts/src/prediction`; first 2026-07-15 "feat: Prediction on ccxt (#28752)"; 8 commits in 2026-07, 14 in 2026-08, 14 in 2026-09, 2 in 2026-10 (the October ones are cross-repo refactors, not venue features) | H |
| Per-language ports | `python/ccxt/prediction` (10 files), `php/prediction` (10), `go/v4/prediction` (21), `cs/ccxt/exchanges/prediction` (9), `java/.../exchanges/prediction` (9), rust (35 files with `prediction` in the path) in the git tree | H |
| Docs site | https://docs.ccxt.com/docs/prediction serves, titled "Prediction Markets", lists Binance, Hyperliquid, Kalshi, Limitless, Myriad, Opinion, Polymarket, Predict.fun, SX Bet (page summary) | M |
| Official docs prose lags the code | `wiki/Prediction-Markets.md` (GitHub) still says "Polymarket, Kalshi, Limitless, Myriad, and Hyperliquid"; per-exchange wiki pages exist for all nine | H |
| Official MCP server | `mcp/` in the repo, npm `ccxt-mcp` 0.1.3 (modified 2026-09-07), MIT; market tier (incl. `search_events` for prediction markets) is on by default, trading/funds are off by default | H |

Verdict: **still_live = true**. Staleness flag: nothing here is older than 6 months because the module did not exist before 2026-07-15. The only possibly stale item is the CCXT wiki prose (written for 5 venues).

---

## 2. Kind and market model

- **Kind (H):** unified client SDK / data-normalisation layer. Languages: TypeScript/JS, Python (async only: `ccxt.prediction.<id>` IS the async class), PHP (ReactPHP, async only), C#, Go, Java, Rust. Source: `wiki/Prediction-Markets.md`.
- **Unified model (H, `ts/src/base/types.ts`, fixture `ccxt-prediction-types-excerpt.ts`):** `PredictionEvent` -> `PredictionMarket` -> `PredictionOutcome`. The **outcome** is the tradeable unit.
  - `marketType`: `binary | categorical | scalar` (scalar adds `underlying`, `floorStrike`, `capStrike`, `strikeType`, `settlementValue`).
  - `executionModel`: `clob | amm | parimutuel`.
  - Prices are probabilities 0..1, `amount` = shares, `cost` = collateral. Fields: `collateral` (quote symbol), `tickSize`, `limits`, `fees {trading, resolution}`, `openInterest`, `volume`, `liquidity`, `resolved`, `resolvedOutcome`, `mutuallyExclusive` (event-level: exactly one market resolves YES), `resolutionSource`.
  - Outcome: `outcome` (unified handle `MARKET:LABEL`), `outcomeId` (raw token id / ticker / coin), `label`, `price`, `bid`, `ask`, `winner`, `settleFraction` (0..1, supports fractional settlement), `negRisk` (Polymarket flag).
  - Trading structures (`PredictionOrder/Trade/Position/Ticker/OrderBook/Settlement/TradingFee/OpenInterest`) are standalone, outcome-addressed, with **no `symbol`**.
- **What it does NOT model (H, absence):** no cross-venue event identity, no settlement-equivalence flag, no dispute/oracle metadata, no collateral-yield flag. The only cross-venue code in the repo is `examples/js/prediction/prediction-common-fed-event.js`, which finds "the same event" across polymarket/kalshi/limitless/myriad/hyperliquid by **title-token overlap** after stop-word removal. That is a demo, not a matcher.
- **Handle caveat (H, `PredictionExchange.ts` `shortenSlug/slugToOutcomeSymbol`):** handles are built from venue slugs with abbreviation (`federal-reserve` -> `fed`), stop-word removal and uppercasing, event-qualified to avoid collisions. They are venue-scoped, lossy and not a join key. Use `outcomeId` plus the venue id, and keep `info` (raw payload).
- **Order-book normalisation example (H, `kalshi.ts fetchOrderBook`):** Kalshi returns YES bids and NO bids only; CCXT derives asks as `1 - price` of the opposite side (YES ask = 1 - NO bid), per outcome. Myriad's AMM "book" is synthesised from the implied price (CCXT's own skip-tests comment). Treat a CCXT book as a *view*, not as venue-native depth.

---

## 3. Coverage matrix (what each class does today)

Derived by regex over `ts/src/prediction/*.ts` on master (fixture `ccxt-prediction-capability-matrix.json`); credentials as declared in `describe()`. `WS` = `pro: true` plus `watch*` flags.

| Venue class | REST market data keyless? | Trading creds in CCXT | WS | CCXT rateLimit | Notes |
|---|---|---|---|---|---|
| `polymarket` (Polygon, USDC) | Yes: gamma, clob, data hosts | `privateKey` (derives L2 creds) or L2 key/secret/passphrase; funder for proxy/deposit wallets | market + user | 100 ms | CTF Exchange V2 signing constants in options; builder code attached (section 6) |
| `kalshi` (US, USD) | Yes (live-verified, fixture) | `apiKey` + RSA `privateKey` | none | 200 ms | demo host configured; `fetchSettlements`, `fetchOpenInterest` |
| `limitless` (Base) | Yes | `apiKey` + `secret` + `privateKey` | none | 200 ms | has `approve`, `redeem` |
| `myriad` | Yes | `privateKey` only (optional `apiKey` for higher limits) | 8 watch methods | 200 ms | AMM + gasless order book, split/merge/redeem endpoints |
| `opinion` (BNB, chainId 56) | declared `apiKey` required | `apiKey` + `walletAddress` + `privateKey` | yes | 67 ms ("15 req/s per key" comment) | `countries: HK` metadata |
| `predictfun` (BNB) | **No: every endpoint needs an API key** (source comment: keyless GET returns 401) | `apiKey`; wallet + key only for orders/JWT | yes | 250 ms | EIP-712 orders + personal_sign JWT |
| `sxbet` | Yes (live-verified, fixture) | `apiKey` + `walletAddress` + `privateKey` | yes (Centrifugo) | 120 ms (500/min baseline) | newest class, 2026-09-23 |
| `hyperliquid` (HIP-4 outcomes) | Yes, via `POST /info` (POST-only read) | `walletAddress` + `privateKey` | none in this class | 50 ms | prediction class shares the id with the perp class; `-p` flag selects it in the CLI |
| `binance` (Web3 Wallet) | **No: all SAPI endpoints signed** | `apiKey` + `secret` (HMAC) | none | 5 ms, cost 200 per call (= about 60 req/min on the 12,000 weight/min SAPI budget) | routes to Predict.fun (docstring) |

Test coverage in the repo (H): static request and response fixtures for all nine under `ts/src/test/static/{request,response}/prediction/`; live-test skips recorded in `skip-tests.json` (predictfun "requires apiKeys"; polymarket `createOrder` skipped because order placement is geo-blocked from CI's EU proxy; kalshi and polymarket entries carry an `until: 2026-12-31` marker). No sxbet entry in skip-tests.

---

## 4. Read API

**CCXT has no API of its own.** There is no CCXT-hosted endpoint to call; "the read API" is the library's unified methods, which call each venue's own public or authenticated API from the caller's machine. (H)

- **Docs:** https://docs.ccxt.com/docs/prediction (overview), per-venue pages under `wiki/exchanges/prediction/*.md`, runnable examples `examples/{js,ts,py,php,go,cs}/prediction/*`.
- **Unified read methods (H, `PredictionExchange.ts` + wiki):** `fetchEvents({query|queries|tags|eventId|slug, limit, sort, status, searchIn})`, `fetchEvent(id)`, `fetchMarkets()`/`loadMarkets()`, `fetchTicker(outcome)`, `fetchTickers(outcomes[])`, `fetchOrderBook(outcome, limit)`, `fetchOHLCV(outcome, timeframe)`, `fetchTrades(outcome)`, `fetchOpenInterest`, `fetchTradingFee`, `fetchTradeQuote` (AMM venues), `fetchTime`, `fetchStatus`; WebSocket via ccxt.pro `watchTicker/Tickers/OrderBook/Trades/OHLCV` (and private `watchOrders/MyTrades/Positions`) on the five venues flagged `pro`.
- **Known read-side limits (H, wiki):** `fetchEvents` "must be scoped by at least one of query, queries, tags, eventId or slug - an unscoped call throws ArgumentsRequired on every venue". `fetchTickers()` with no argument throws on Kalshi, Polymarket, Limitless and Myriad (Hyperliquid serves its whole universe in one call). The wiki says unscoped market browse should use `fetchMarkets()`, "a capped, volume-ordered listing where the venue supports it". Per-venue caps in options, e.g. Kalshi `maxFetchMarketsLimit` 1000, Polymarket `fetchMarketsLimit` 200 / `maxFetchEventsLimit` 500, Polymarket price-history spans capped at 15 days.
- **Auth and limits:** none at CCXT level. Client-side throttling is on by default (`enableRateLimit = true` in `Exchange.ts`) using the per-class `rateLimit` ms in section 3 and per-endpoint `cost` weights. Server-side limits are the venues' own. NOT FOUND: any CCXT-published rate-limit table for the prediction module (searched: docs.ccxt.com prediction page, wiki).
- **Venue base URLs as configured in CCXT** (H, `urls.api`; these are CCXT's constants, not independently verified except where noted): Kalshi `https://external-api.kalshi.com/trade-api/v2` (+ `https://api.elections.kalshi.com/v1` for free-text series search, + demo host); Polymarket `https://gamma-api.polymarket.com`, `https://clob.polymarket.com`, `https://data-api.polymarket.com`, `wss://ws-subscriptions-clob.polymarket.com/ws/{market,user}`; Limitless `https://api.limitless.exchange`; Myriad `https://api-v2.myriadprotocol.com`, `wss://ws.myriadprotocol.com/ws`; Opinion `https://openapi.opinion.trade/openapi`, `wss://ws.opinion.trade`; Predict.fun `https://api.predict.fun`, `wss://ws.predict.fun/ws`; SX Bet `https://api.sx.bet`, `wss://realtime.sx.bet/connection/websocket`; Hyperliquid `https://api.hyperliquid.xyz`; Binance `https://api.binance.com/sapi/v1/w3w/wallet/prediction`.
- **Live confirmation of two mapped endpoints (unauthenticated GET, 2026-10-19, HTTP 200):**
  - Kalshi `GET /trade-api/v2/markets?limit=2&status=open&mve_filter=exclude` -> `{cursor, markets[]}`; each market has `ticker`, `event_ticker`, `market_type: "binary"`, `title`, `yes_bid_dollars`, `yes_ask_dollars`, `no_bid_dollars`, `no_ask_dollars`, `last_price_dollars`, `volume_fp`, `open_interest_fp`, `rules_primary`, `status`, `close_time` (fixture `kalshi-markets-limit2-mve-exclude.json`). Prices are decimal strings in dollars (0..1), which matches what CCXT parses into `price/bid/ask`. Note: without `mve_filter=exclude`, the first market returned was a multivariate cross-category combo (`KXMVECROSSCATEGORY-...`), so a scanner must filter combos.
  - SX Bet `GET /markets/active?pageSize=2` -> `{status:"success", data:{markets[], nextKey}}`; market rows carry `marketHash`, `outcomeOneName/TwoName/VoidName`, `teamOneName/TwoName`, `line`, `sportXeventId`, `tradingModes:["CLOB"]`, `chainVersion:"SXR"` (fixture `sxbet-markets-active-pagesize2.json`). Binary two-outcome plus a void outcome name. These two samples are venue responses, not CCXT output: I did not run CCXT.
- **Official MCP server (H, `mcp/README.md`):** `npx -y ccxt-mcp`, runs locally over stdio, credentials never tool parameters, tiers market (on) / read / trading (off) / funds (off) / implicitWrites (off); `search_events` covers prediction markets; live trading needs `"trading": "live"` plus `maxOrderValue` in a config file. Useful for ad-hoc exploration; not a dependency we need.

---

## 5. Trade path and PayBox reachability

- **Trade path (H):** `createOrder(outcome, type, side, amount, price, params)`, `createOrders`, `editOrder`, `cancelOrder`, `cancelAllOrders`, `approve` (limitless, predictfun, sxbet), `redeem` (limitless), plus venue endpoints for split/merge/redeem on Myriad. Signing happens **inside the CCXT process with a raw secret**:
  - Polymarket: EIP-712 `Order` for "Polymarket CTF Exchange" version "2", chainId 137, verifyingContract = exchange or neg-risk exchange (CCXT constants `0xE111180000d2663C0091e4f400237545B87B996B` and `0xe2222d279d744050d28e00520010520000310F59`, not verified on-chain by me, M); L2 API creds derived from an EOA signature; signatureType variants incl. POLY_1271 deposit wallets.
  - Opinion: EIP-712, chainId 56, verifyingContract from the quote-token's `ctfExchangeAddress`.
  - Predict.fun: EIP-712 order (chainId 56, exchange address chosen by neg-risk / yield-bearing flags) plus a `personal_sign` JWT over a server message; API key on every call.
  - SX Bet: EIP-712 digest over server-supplied domain; API key for private routes.
  - Limitless: API key + HMAC for some calls, EIP-712 orders on Base (chainId 8453); Myriad: EIP-712 `MyriadCTFExchange` order book plus on-chain AMM transactions.
  - Hyperliquid: L1 "phantom agent" EIP-712 (chainId 1337) with secp256k1.
  - Kalshi: RSA signature with an API-key UUID (no wallet). Binance: HMAC-SHA256 SAPI (custodial; keys server-side at Binance).
- **Reachable from a PayBox EVM wallet?** **No for CCXT itself.** The classes declare `privateKey` (and sometimes `apiKey`/`secret`) as required credentials and there is no signer-injection or remote-signing hook in any prediction class (grep for signer/walletClient hooks found only fields named `signer` inside order structs). PayBox is non-custodial, and the project's own notes (`docs/research/06-paybox-platform.md`) say a sandboxed Open Plugin cannot obtain a signature and `request_wallet_sign` accepts `typedData` intents. So CCXT cannot be the execution engine. **Partial for the underlying venues**: Polymarket, Opinion, Predict.fun, SX Bet, Limitless, Myriad and Hyperliquid orders are EIP-712 payloads that a `typedData` signing intent could in principle sign, and CCXT's source is a convenient cross-check for the exact domains and field orders. Kalshi (RSA API key, fiat) and Binance (custodial HMAC) are not wallet-signable. Each venue's own note owns the real answer.
- **Chains and collateral:** none of its own. Per CCXT constants: Polygon/USDC (Polymarket), Base (Limitless), BNB (Opinion, Predict.fun, Myriad also configured for BNB), Hyperliquid L1 with USDH as `outcomeQuoteCurrency` (chain for the outcome venue itself not stated in CCXT's class), USD (Kalshi), SX chain (SX Bet).

---

## 6. Fees

- **CCXT charges nothing.** No subscription, no hosted service.
- **Builder / attribution codes (H, source + commits):**
  - Polymarket: `options.builder = 0xea409de8b037bb6ac664b6d12d6831b03cb04a37`, `builderFee: true`, `feeRate: 0` (bps). The builder code is packed into the signed order's `builder` bytes32 field; override with `params.builderCode` or `options.builder`. Commit "feat(polymarket): add builderFee 0 just for tracking purposes (#29278)", 2026-07-22. CCXT also ships an example (`check-builder-trade.js`) that reads `GET clob.polymarket.com/builder/trades?builder_code=...` to count attributed volume and fees.
  - Hyperliquid: default `builder = 0x6530512A6c89C7cfCEbC3BA7fcD9aDa5f30827a6`, `feeInt: 0`, `feeRate: '0%'`. With default options `initializeClient()` runs **before the first order** and calls `approveBuilderFee(builder, '0%')`, a user-signed `HyperliquidTransaction:ApproveBuilderFee` action, then attaches `builder: {b, f: 0}` to each order. Commit "feat(hyperliquid): add tracking (fee=0) builder id (#29281)", 2026-07-22. Net: orders through CCXT are attributed to CCXT's builder at zero charge; the extra signature is a surprise in any approve-each-signature flow. To disable: set `options.builderFee = false`.
  - NOT FOUND: any builder/referral code in the Kalshi, Limitless, Opinion, Binance classes (grep for builder/broker/referral). Myriad and Predict.fun have referral endpoints mapped but no default code. SX Bet exposes `externalUserId` as an optional partner-attribution param.
- **Static fee constants in `describe()` (H) are defaults, not schedules:** binance taker 0.02 (feeRateBps 200 per order), hyperliquid maker 0.0002 / taker 0.0005, kalshi taker 0.07 (code comment "7% fee on profit"), limitless 0.02/0.02, myriad 0.01/0.01, opinion maker -0.02 / taker 0.04, polymarket 0/0, predictfun taker 0.02, sxbet 0/0 (comment: per-account rates behind `GET /user/fees-v3`, "no public venue-wide schedule"). Do not feed these into edge maths: Kalshi's published fee is not a flat 7% of profit (my recollection, M, to be settled in the Kalshi spec), and Polymarket's `fetchTradingFee(outcome)` and Myriad's `fetchTradingFee` exist precisely because the rate is per-outcome. Use the venue-native fee endpoints.
- **Who pays:** the trader, at the venue. CCXT unifies `fee: {cost, currency, rate}` on orders and trades.

---

## 7. Resolution mechanism and dispute risk

CCXT only *reports* resolution state. It has no oracle, no dispute window and no arbitration. Exposed fields: `resolved`, `resolvedOutcome`, `winner`, `settleFraction`, `settlementValue` (scalar), `resolutionSource`, `PredictionSettlement {result, won, payout, pnl}` via `fetchSettlements` (kalshi, sxbet only) and `PredictionPosition.payout/won`. `redeem` exists only on Limitless. Dispute risk is entirely the underlying venue's (UMA on Polymarket, CFTC-regulated settlement on Kalshi, etc.). Practical risk for an arb scanner: two CCXT "equivalent" outcomes on different venues may have different resolution sources and void rules; `resolutionSource` is a free-text hint, not a comparable key. (H for the fields, absence of dispute data is H-by-absence.)

---

## 8. Geo, ToS and automation

- **CCXT:** MIT licence (H, GitHub licence metadata and npm `license: MIT`). No ToS, no usage rules, no key. Automation is the entire point of the library.
- **`countries` metadata in the classes** is informational: polymarket `US`, kalshi `US`, opinion `HK`, others empty. It is not a statement of legality or availability. (H)
- **Every venue's own ToS and geo rules apply unchanged**, and CCXT does nothing to evade them. The repo's own test config notes that Polymarket "geo-blocks order placement and CI runs via an EU proxy" (H, `skip-tests.json`), which is a reminder that read access and trade access differ by region. Do not read anything into the proxy in that file; it is CI infrastructure.
- **Attribution:** MIT requires the copyright and licence notice if code is ported. The project already has a `NOTICE` file; add CCXT there if anything is copied. (M, my reading of MIT)

---

## 9. Liquidity and independence

- **Liquidity: none.** Adoption indicators only: 44,454 stars (GitHub, 2026-10-19), 77,163 npm downloads for 2026-10-10..16 (npm API) for the whole library, not the prediction module. NOT FOUND: any usage metric specific to `ccxt.prediction` (searched: npm, PyPI, docs). (H)
- **Shared liquidity:** CCXT is a pass-through to the venues, so it is 100% duplicate of them. Inside the nine: **`binance` is Predict.fun liquidity** (class docstring: "Binance aggregates prediction markets from on-chain vendors (predict.fun on BNB Chain) behind its standard signed SAPI", H; our note `binance-wallet-prediction-markets-via-predict-fun.md` reaches the same conclusion, M here). Never count `binance` and `predictfun` as two pools. Hyperliquid HIP-4, Kalshi, Opinion, Limitless, Myriad, SX Bet are separate books as far as these sources show; Polymarket vs Predict.fun / Limitless independence is a question for their own notes.
- **Not independent:** CCXT as a whole -> **not an arbitrage leg.**

---

## 10. Event categories that overlap other venues

CCXT adds no markets, so overlap is whatever its nine venues overlap on: politics, macro (Fed decisions, CPI), crypto price brackets (Kalshi, Polymarket, Limitless, Hyperliquid HIP-4 BTC binaries, Opinion, Predict.fun) and sports (Kalshi, Polymarket, SX Bet). The repo's own cross-venue demo targets "Fed" events across polymarket/kalshi/limitless/myriad/hyperliquid (H). CCXT gives the *plumbing* to fetch the same query from several venues in one loop, but all matching, equivalence checking (resolution source, strike, time zone, void rules) and edge maths remain our job.

---

## 11. Recommendation for the aggregator

1. **Do not build a "CCXT" venue adapter.** Register it in the platform registry as `kind: client-library`, `liquidity: none`, `independent: false`.
2. **Use as reference material:** per-venue endpoint maps (section 4 and the `api` blocks in each class), EIP-712 domains and field orders (section 5), Kalshi book derivation, Polymarket V2 signing constants. Port with an MIT notice rather than re-deriving.
3. **Use as a dev-time oracle:** run CCXT in a throwaway sandbox (outside this repo's trust boundary, never with real keys) against the same outcome and diff its `fetchOrderBook`/`fetchTicker` output with our adapters. I did not do this (no install, no third-party code executed).
4. **Do not use in the PayBox bundle:** the npm package is 70 MB unpacked (1,351 files; fixture) against our 516,853-byte plugin bundle, signing needs raw keys, and the package is monolithic (an open, Python-focused issue, ccxt#29573, asks for core plus per-exchange module splitting; H, GitHub search). A single prediction class is ~100-220 KB of source before the 500 KB+ base, so it is a poor fit for the sandbox size budget (M).
5. **If the unified shape is useful, copy the shape, not the code:** `Event -> Market -> Outcome` with `outcomeId`, `marketType`, `executionModel`, `collateral`, `settleFraction`, `mutuallyExclusive`. Add what CCXT lacks: venue-qualified ids, settlement-equivalence key, void/dispute policy, collateral-yield flag, and a "liquidity-sharing group" id.
6. **Pitfalls to document for adapter authors:** keyless reads are impossible on Predict.fun and Binance; Kalshi needs `mve_filter=exclude` to avoid combos; `fetchEvents` needs a scope; handle strings are not stable ids; static fees are not real fees; CCXT version churn (a new patch release every few days).

---

## 12. Fixtures saved

All under `docs/research/fixtures/ccxt-prediction-module/`:

| File | What | Size |
|---|---|---|
| `npm-ccxt-latest-summary.json` | trimmed npm registry record for ccxt 4.5.88 (licence, engines, file count, unpacked size, dependencies; author field removed) | 0.7 KB |
| `unpkg-ccxt-4.5.88-js-src-prediction-listing.json` | the 18 files in `js/src/prediction/` of the published package | 1.5 KB |
| `ccxt-prediction-capability-matrix.json` | DERIVED by regex from the TS sources: has-flags, creds, rateLimit, hosts per venue | 8.6 KB |
| `ccxt-prediction-types-excerpt.ts` | excerpt of `ts/src/base/types.ts` (unified prediction structures), MIT | 10.5 KB |
| `kalshi-markets-limit2-mve-exclude.json` | real unauthenticated response, 2026-10-19 | 4.6 KB |
| `sxbet-markets-active-pagesize2.json` | real unauthenticated response, 2026-10-19 | 1.3 KB |

No CCXT-produced output sample exists because I did not install or run CCXT.

---

## 13. NOT FOUND / open questions

- NOT FOUND (searched: docs.ccxt.com prediction page, wiki, WebSearch extended): a dated announcement or release note for the prediction module; the first commit date (2026-07-15) is the best evidence.
- NOT FOUND: CCXT-published rate-limit guidance or an SLA for the prediction module; any hosted CCXT service (none exists as far as these sources show).
- NOT FOUND: any cross-venue matching, settlement-equivalence or dispute metadata in CCXT (only the title-token demo script).
- NOT FOUND: Binance developer-docs detail on auth/underlying venues from the page fetched (page summary returned only an endpoint count); the Binance facts above come from CCXT's source and our existing Binance note.
- Open: does the PyPI wheel/sdist for 4.5.88 include `ccxt/prediction`? The git tree has it and npm has it (listing), PyPI not inspected (M).
- Open: whether Opinion's "public" REST group needs the API key in practice (CCXT declares `apiKey` required; I did not probe Opinion).
- Open: CCXT's behaviour under a real run (builder-code attachment on Polymarket orders, the auto `approveBuilderFee` on Hyperliquid) is from reading source and commit titles, not from an executed order. Sandbox-only trading is the only safe way to confirm.
- Suspicious content: none encountered in the pages I read. The repo ships agent-directed files (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/skills/...`); I did not read or follow them.

---

## 14. Sources

H unless noted. All fetched or read 2026-10-19.

- CCXT repo: https://github.com/ccxt/ccxt (metadata via `gh api repos/ccxt/ccxt`; releases `repos/ccxt/ccxt/releases/latest` -> v4.5.88 2026-10-14)
- Prediction module source: https://github.com/ccxt/ccxt/tree/master/ts/src/prediction (`binance.ts`, `hyperliquid.ts`, `kalshi.ts`, `limitless.ts`, `myriad.ts`, `opinion.ts`, `polymarket.ts`, `predictfun.ts`, `sxbet.ts`)
- Base class: https://github.com/ccxt/ccxt/blob/master/ts/src/base/PredictionExchange.ts ; types: https://github.com/ccxt/ccxt/blob/master/ts/src/base/types.ts
- Commit history of the module: `gh api --paginate "repos/ccxt/ccxt/commits?path=ts/src/prediction"` (38 commits, 2026-07-15 .. 2026-10-14)
- Docs prose: https://github.com/ccxt/ccxt/blob/master/wiki/Prediction-Markets.md ; per-venue: `wiki/exchanges/prediction/{binance,hyperliquid,kalshi,limitless,myriad,opinion,polymarket,predictfun,sxbet}.md`
- Docs site: https://docs.ccxt.com/docs/prediction (M, page summary)
- Cross-venue demo: https://github.com/ccxt/ccxt/blob/master/examples/js/prediction/prediction-common-fed-event.js ; builder example `check-builder-trade.js` in the same folder
- Test config: https://github.com/ccxt/ccxt/blob/master/skip-tests.json ; static fixtures under `ts/src/test/static/{request,response}/prediction/`
- MCP server: https://github.com/ccxt/ccxt/blob/master/mcp/README.md ; https://registry.npmjs.org/ccxt-mcp
- npm: https://registry.npmjs.org/ccxt/latest ; https://api.npmjs.org/downloads/point/last-week/ccxt ; https://unpkg.com/ccxt@4.5.88/js/src/prediction/?meta
- PyPI: https://pypi.org/pypi/ccxt/json (version 4.5.88, 2026-10-14)
- Issue search: `gh api search/issues` for open issues mentioning "prediction" in ccxt/ccxt (#29226 "CCXT Prediction" opened 2026-07-16; #29573 split-modules request open)
- Binance docs page (returned only an endpoint count, no detail): https://developers.binance.com/en/docs/catalog/web3-wallet-prediction-trading (M)
- Venue hosts probed unauthenticated: https://external-api.kalshi.com/trade-api/v2/markets ; https://api.sx.bet/markets/active
- Project cross-references (M for the purposes of this note): `docs/research/06-paybox-platform.md`, `docs/research/venues/binance-wallet-prediction-markets-via-predict-fun.md`, `docs/research/venues/sx-bet.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`
