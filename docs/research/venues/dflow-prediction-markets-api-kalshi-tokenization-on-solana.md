# DFlow Prediction Markets API (Kalshi tokenization on Solana) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, `gh api` file reads, unauthenticated GETs to documented hosts with User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. Third-party text was treated as untrusted data. WebSearch hit the shared session budget after two queries, so press/news coverage after the first two searches was not available; I did not use search engines via curl or web-archive services. Everything below rests on primary pages, repos and APIs fetched directly, plus two search result lists.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, or my inference from first-hand data; **L** = weak or stale.

Two earlier notes cover the same venue (`docs/research/venues/dflow-prediction-markets.md` and `docs/research/venues/dflow-prediction-markets-282.md`). This note re-verified their key claims independently (commit, Phantom disclosure, DefiLlama series, OpenAPI fragments, leftover endpoint, probes) and reaches the same verdict. Where I rely on them and did not re-fetch, I say so.

---

## 0. Bottom line

1. **adapter_priority = skip. The DFlow prediction-market product is not offered any more (still_live = false).** DFlow's docs, agent skills and consumer app are spot-only as of 2026-10-19, a repo commit dated 2026-07-11 is titled "Sunset Kalshi and Proof; spot-only skill set", and its on-chain Kalshi-tokenization volume is zero since 2026-07-03 (H, section 1).
2. **Even while live (2025-12 to about 2026-06) it was never an independent leg.** It was a Solana tokenization layer over Kalshi: every market maps 1:1 to a Kalshi market and is filled from "Kalshi offchain liquidity" (H, DFlow's own Dec 2025 post). Same prices, same depth, same resolution as Kalshi. A Kalshi adapter covers everything DFlow ever exposed.
3. **No usable read API today.** The documented dev host does not resolve, the prod Metadata API host answers HTTP 403 with an empty body (it was always key-gated), and every prediction-market docs page is 404. No price, order book or trade response could be fetched, so there is no live market sample to save (H).
4. **Not reachable via PayBox in any useful sense**: Solana-only, product gone, buyers needed Proof (KYC) verification, fills are asynchronous and multi-transaction (section 5).
5. **Do not confuse with World.** Phantom moved new prediction positions from "Kalshi via DFlow" to "World" on 2026-06-01. World uses a different on-chain program and CASH collateral, is independent of Kalshi, and reportedly routes through DFlow's router. It deserves its own spec (see `docs/research/venues/world.md`); the remaining prediction-market fields in DFlow's Trade API schema may now serve World rather than Kalshi (M inference, section 1 note).

---

## 1. Is it still live? (2026)

| # | Evidence | Date | Tag |
|---|---|---|---|
| 1 | The announcement https://solana.com/news/dflow-prediction-markets-api says DFlow "is releasing" the API "in conjunction with Kalshi's contract tokenization effort"; docs link given: `pond.dflow.net/concepts/prediction/prediction-markets`. That URL now returns HTTP 404 (also `/prediction-markets/prediction-markets-101`, `/build/prediction-markets/introduction`). | 2025-12-01 post; probes 2026-10-19 | H |
| 2 | `https://pond.dflow.net/llms.txt` (6,779 B, saved as fixture) lists Spot, Proof, AI, Resources, Trading API and Proof API pages: zero prediction-market or Kalshi pages. `llms-full.txt` (160,133 B) has no hit for "kalshi" or "prediction". `get-started/what-is-dflow.md` describes Spot and Proof only. | 2026-10-19 | H |
| 3 | `DFlowProtocol/dflow-skills` commit `1c546209` "Sunset Kalshi and Proof; spot-only skill set" removes the four `dflow-kalshi-*` skills (trading, market-scanner, market-data, portfolio) and strips the prediction-market fee content (`platformFeeScale`). Proof was re-added 2026-07-28; Kalshi skills never came back. Fixture saved. | 2026-07-11 | H |
| 4 | DefiLlama "DFlow Prediction Market" (`api.llama.fi`), description "powered by the Kalshi CLP": daily volume 0 on every day after 2026-07-02 (last non-zero day 12,806 USD); 24h/7d/30d volume all 0. Balance ("TVL") series: 1,406,306 USD on 2026-07-06, 0 on 2026-07-07, 741 USD on 2026-10-19. | 2026-10-19 | H data, M on what the series measures |
| 5 | `https://dflow.net` (title "DFlow - Intelligent Trade Execution on Solana", "The Trading API ... For traders, applications, and financial institutions") ships a JS bundle whose tabs are `Spot` and `Equities`; routes `/prediction` and `/prediction/:eventTicker` redirect to `/`; a "Legacy Desktop" link goes to `legacy.dflow.net`, whose bundle contains no "prediction" or "kalshi" string. The main bundle still holds the Dec 2025 blog post, a redeem modal ("your prediction tokens are redeemable for USDC") and a proxy host `prediction-markets-api-proxy.dflow.workers.dev` (403 to a plain GET; CORS locked to dflow.net, I did not spoof an Origin). | 2026-10-19 | H |
| 6 | Phantom's disclosures page (dated 2026-07-01): markets opened before 2026-06-01 are "Kalshi via DFlow"; on or after 2026-06-01 they are powered by "World Prediction Markets". Old positions are exited by trading the expired outcome token for the stablecoin used to open them. https://phantom.com/prediction-market-disclosures | 2026-06-01 / 2026-07-01 | H |
| 7 | DFlow's own post on the MoonPay acquisition (2026-05-05, in the dflow.net bundle) says DFlow "built the first and only system that fully tokenizes Kalshi's prediction markets on Solana", past tense, and talks about spot routing, Coinbase, Phantom, Kamino. The 2026-05-04 Coinbase post calls DFlow "a trading protocol that enables traders to exchange value across spot and prediction markets". | 2026-05-04/05 | H |
| 8 | Cookbook `DFlowProtocol/cookbook`: prediction-market scripts (`src/prediction-markets/*`) last changed 2026-02-13; every later commit is a dependency bump (latest 2026-10-09). README still lists them and still defaults to the dev metadata host (which no longer resolves). | 2026-10-09 | H |

Not established: any official DFlow or MoonPay announcement of a shutdown (NOT FOUND, searched: docs index, full docs text, FAQ, repo commit lists, dflow.net bundle blog list of 8 posts, 2 web searches). So "sunset" is H for "removed from DFlow's public product, docs and skills, with zero volume since 2026-07-03" and M for "no way to trade tokenized Kalshi markets through DFlow today".

Nuance: the live Trade API OpenAPI (`https://pond.dflow.net/resources/trading-api/openapi.json`, 125 KB, BUSL-1.1, served 2026-10-19) still carries prediction-market fields: `GET /order` params `predictionMarketSlippageBps`, `predictionMarketInitPayer`, `outcomeAccountRentRecipient`, `platformFeeScale` ("native prediction market swaps and async prediction market swaps"); `GET /order-status` ("Only prediction market orders are supported"); error codes `unverified_wallet_not_allowed`, `wallet_restricted`, `use_order_endpoint_for_prediction_markets`; and a privileged quote-stream op `subscribe_all_prediction_markets` for `(outcome_mint, CASH)` pairs (H, fixture `trading-api_openapi.prediction-market-fragments.json`). The code path is therefore not gone. Because that text speaks of a "native-predictions settlement currency" (CASH) and World uses CASH on a different program, my best guess (M, from other repo notes, not verified by me) is that it now serves World, but it could also be dormant or wind-down plumbing. It changes nothing for adapters: nothing is documented, advertised or priced.

Verdict: **still_live = false** for the DFlow Kalshi prediction-market product. DFlow the company is live (spot aggregator, Proof, equities).

---

## 2. Kind and market model

- **Kind (H):** broker / tokenization layer in front of Kalshi (a CFTC-designated contract market) built on DFlow "Concurrent Liquidity Programs" (CLPs). DFlow's Dec 2025 post: "the first tokenization layer bringing Kalshi's prediction markets to Solana"; "100% Market Coverage: all Kalshi markets are available as tokenized markets on Solana"; positions are "actual Solana tokens (not synthetic exposures)". CLP flow: the user writes an on-chain intent (limit order); LPs fill at or better than the limit; the protocol mints the position tokens; at resolution "settlement flows back through the CLP, redeeming the winning tokens". Kalshi funded a "$2M grants program" for builders (DFlow's claim, L as marketing).
- **Market model (H for fields, M for semantics):** binary YES/NO per market with Kalshi's event > market hierarchy (series ticker, event ticker, market ticker); Kalshi scalar markets surface as `scalarOutcomePct`. Price discovery is Kalshi's off-chain central limit order book; there is no AMM and no parimutuel pool. Orderbook shape in the cookbook: `{yes_bids: {"<price>": size}, no_bids: {...}}`.
- **Tokenization (H):** per market and per settlement mint, two SPL mints (`yesMint`, `noMint`) plus a `marketLedger` account (`MarketAccountInfo = {marketLedger, yesMint, noMint, isInitialized, redemptionStatus, scalarOutcomePct}` in the Metadata API spec; cookbook reads `market.accounts[settlementMint].yesMint/noMint`). Outcome tokens have 6 decimals (1 contract = 1,000,000 units). Markets are initialized on demand by the first trade (`initPredictionMarketCost` in lamports in the `/order` response).
- **Execution (H):** `executionMode` is `sync | async`; prediction-market orders were asynchronous multi-transaction; `/order-status` statuses `pending, expired, failed, open, pendingClose, closed`.

## 3. Chains and collateral

- Solana mainnet only (H). Settlement mints: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (cookbook default) and CASH `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` (the DefiLlama adapter lists both as collateral for DFlow program `pReDicTmksnPfkfiz33ndSdbe2dY43KYPg4U2dbvHvb`; the Trade API OpenAPI calls CASH "the native-predictions settlement currency"). Any spot token could be the input; the route went input mint -> settlement mint -> outcome mint (M). Payout "redeemable in multiple stablecoins" (DFlow post, H as a statement).
- SOL rent for market/token accounts is a per-trade cost (`initPredictionMarketCost`, `outcomeAccountRentRecipient`, H). "Dev" meant unauthenticated, not devnet: all requests ran on mainnet-beta (QuickNode guide, M).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Docs URL | none live. Former: https://pond.dflow.net/concepts/prediction/prediction-markets (404). | H |
| Official spec (orphaned) | `https://pond.dflow.net/build/metadata-api/openapi.json`: still served HTTP 200, 89,286 B, "prediction-markets-api" v0.1.0, 28 operations (26 GET, 2 POST: `/api/v1/markets/batch`, `/api/v1/filter_outcome_mints`). Spec server: `https://dev-prediction-markets-api.dflow.net`; security scheme header `x-api-key`. Fixture summarises it. | H |
| Key endpoints (historical, from the spec) | markets: `/api/v1/events` (`withNestedMarkets`, `status`, `seriesTickers`, `limit`, `cursor`), `/api/v1/markets` (`status` = initialized/active/inactive/closed/determined, `sort` = volume/volume24h/liquidity/openInterest), `/api/v1/market/{ticker}`, `/api/v1/market/by-mint/{mint}`, `/api/v1/search`, `/api/v1/series`, `/api/v1/tags_by_categories`, `/api/v1/filters_by_sports`, `/api/v1/outcome_mints`. Books: `/api/v1/orderbook/{market_ticker}`, `/api/v1/orderbook/by-mint/{mint}`. Trades: `/api/v1/trades`, `/api/v1/trades/by-mint/{mint}`, `/api/v1/onchain-trades` (+ by-event, by-market). History: `/api/v1/market/{ticker}/candlesticks`, `/api/v1/event/{ticker}/candlesticks`, forecast percentile history. Resolution/live: market `status`/`result`/`redemptionStatus`, `/api/v1/live_data` (Kalshi pass-through). | H |
| Reachability today | `dev-prediction-markets-api.dflow.net`: NXDOMAIN (default resolver, 1.1.1.1 and 8.8.8.8 all empty). Prod `prediction-markets-api.dflow.net`: resolves, HTTP 403 with empty body on every path (`/`, `/health-check`, `/api/v1/...`). The prod Trade API `quote-api.dflow.net/venues` returns the same empty 403 without a key, so the 403 means "key required", not necessarily "dead". The proxy host returns 403 too. | H |
| Auth and limits | Trade API: dev host works without a key, rate limited ("intended for testing only", observed `x-ratelimit-limit: 60`); prod needs a key from a request form ("2-5 days") passed as `x-api-key`. Metadata API: key required on prod; the dev tier that QuickNode describes ("no key") is gone with the dev host. | H |
| WebSocket | Current docs: Trade API `/quote-stream`, `/book-stream`, `/priority-fees/stream` on `wss://quote-api.dflow.net` (spot; per-key access). Cookbook prediction-market WS channels (prices, trades, orderbook) required a private endpoint plus key. | H |
| Undocumented leftover | `GET https://dev-quote-api.dflow.net/prediction-markets` -> HTTP 200, 15,760,501 B JSON array of 89,114 records `{address, market_id, is_funded, outcome_val, scalar_outcome_pct}`: `outcome_val` N 52,310 / Y 35,067 / S 238 / missing 1,499; `is_funded` true 87,387 / false 1,727. No ticker, price, volume or timestamp, so it is not usable for pricing. Meaning (per-market settlement ledger state) is inferred from field names (L). Prod host: 403. Fixture has counts and 5 records. | H shape, L meaning |

Nothing in the arbitrage sense (prices, depth, trades) is obtainable without a DFlow API key, and the Kalshi API itself offers the same data.

## 5. Trade path and PayBox reachability

- **Historical path (H, cookbook `prediction-market-lifecycle.ts`, Feb 2026 code):** `GET {trade-api}/order?inputMint=<settlement mint>&outputMint=<outcome mint>&amount&slippageBps&userPublicKey` returns a base64 Solana `VersionedTransaction`; the user signs with an ed25519 key and submits to a Solana RPC; selling is the reverse; `GET /order-status?signature=` tracks asynchronous fills; redemption after resolution reuses `/order` with the outcome mint as input (QuickNode guide, M). The cookbook comments say to validate the transaction before signing.
- **Gating (M, QuickNode guide quoting the old docs):** "Any wallet used to trade prediction market positions through DFlow must be verified with Proof." The current OpenAPI still has `unverified_wallet_not_allowed` and `wallet_restricted` error codes (H). Proof docs now say only "Spot trading on DFlow does not require Proof" (H).
- **Today:** no documented prediction-market trade path. I did not call `/order` with an outcome mint (no mint can be discovered without the Metadata API, and building a transaction for a wallet is unnecessary for the verdict). `/order-status` with a bogus signature returns HTTP 400 `{"msg":"Invalid signature","code":"invalid_signature"}` (H, fixture).
- **PayBox reachable? No.** (1) The product is gone. (2) Solana only: a PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot sign an SPL/Solana transaction, and no bridge gives it a position. (3) PayBox does expose Solana wallets and a `solanaTransaction` signing intent (M, from `docs/research/06-paybox-platform.md`), so a Solana credential could in principle sign an `/order` transaction, but the buyer also had to be Proof-verified and fills are asynchronous and multi-transaction, which does not fit a single-proposal flow. Moot while the product is down.

## 6. Fees

- **Builder/platform fee (H, OpenAPI `/order`):** `platformFeeScale`, "3 decimals ... a value of 50 means 0.050", `>= 0` and `< 1000`, "for native prediction market swaps and async prediction market swaps"; for async prediction-market swaps the fee is paid in the stablecoin mint (`platformFeeMode` ignored). DefiLlama's adapter documents the shape: "Fee formula: scale * p * (1 - p) * c" (p = price, c = contracts), all to the protocol (H). That is Kalshi's own `coefficient * p * (1-p)` form; the Kalshi taker fee itself is covered by the Kalshi venue spec.
- **Historical tiers (M/L):** earlier notes record scale values of 0.09 down to 0.08 (taker) and 0.0225 down to 0.02 (maker) by 30-day volume from archived March 2026 docs; I did not re-fetch them and the pages are 404. Treat as L.
- **Other costs (H):** Solana network and priority fees, market initialization rent in lamports, outcome token account rent. Spot trading carries no DFlow protocol fee (docs). Net: at best equal to trading on Kalshi directly, usually worse.

## 7. Resolution and dispute risk

- Resolution is Kalshi's. Phantom's disclosure says legacy markets depend on "external data sources and oracles including" Kalshi's database and DFlow's reindexing of it, so "errors there can affect outcomes" (H). Dispute handling is Kalshi's process; DFlow adds reindexing error/delay risk and a wind-down redemption risk: legacy holders must "trade their expired outcome token for the stablecoin" and get a quote that "may differ from the original contract price" (H).
- Market states exposed by the Metadata API: `initialized, active, inactive, closed, determined` (H), plus `redemptionStatus` and `scalarOutcomePct` on each account (H).
- Terms: DFlow's published Terms of Service (https://pond.dflow.net/terms-of-service, "Last Updated: May 21, 2024", so stale, L) list among prohibited uses transacting in "binary options (including prediction-market transactions)" and "financial activities subject to registration or licensing". That predates the product and sits oddly with it; it is a counterparty-risk flag only.

## 8. Geo, ToS, automation, liquidity, overlap

- **Geo/ToS (current):** nothing published for prediction markets. Current FAQ and api-key pages state no geo or ToS rules for them (H). Phantom: "Prediction Markets on Phantom are only available to users in certain jurisdictions" (H, for the Phantom front end, not DFlow's API). Historical DFlow docs reportedly required builders to geoblock the US and other jurisdictions or lose API access (M, earlier note's archived read, not re-verified). The Jupiter prediction API (a different, provider-agnostic Solana product, https://developers.jup.ag/docs/prediction, beta) says "We have restricted United States and South Korea IPs", and does not name Kalshi, DFlow or any provider (H for the statement).
- **Automation:** API-key use was the intended path. ToS (2024) bans unauthorized "robot, spider, crawler, scraper, script" access "not authorized by us" (H); an API key is the authorization. The Agent CLI and MCP server (`https://pond.dflow.net/mcp`) are spot-only (H).
- **Liquidity (DefiLlama, fetched 2026-10-19, H data / M methodology):** all-time on-chain volume 17,311,389 USD (CASH/USDC transfers to the settlement vault in transactions touching the program, starting 2025-11-23). Monthly: 2025-12 1.84M, 2026-01 3.61M, **2026-02 6.11M (peak; peak day 2026-02-22 at 378,439)**, 03 3.56M, 04 0.44M, 05 0.90M, 06 0.72M, 07 0.13M, 08-10 0. Balance series peak 2,233,846 USD on 2026-03-07, 741 USD on 2026-10-19. The company-wide "$50 billion+ cumulative, over $12 billion in Q1 2026" figures (DFlow, 2026-05-05) are spot routing volume, not prediction markets. Compared with Kalshi itself this is a rounding error.
- **Event categories:** whatever Kalshi lists (sports, politics, crypto price ladders, macro/economics, weather, entertainment), claimed "100% market coverage" (DFlow's claim; H that it said so, L as a fact). The Metadata API spec has sports filters and a live-data pass-through for sports, which fits. Overlap with other venues exists only because Kalshi overlaps Polymarket, Limitless and others.
- **Shares liquidity with: Kalshi (100%).** Not an independent arbitrage leg (H: DFlow's Dec 2025 post; Phantom's "powered by Kalshi via DFlow"; DefiLlama "powered by the Kalshi CLP").

## 9. Adapter recommendation

- **skip.** Dead product, no reachable read API, no independent liquidity, and a Kalshi adapter already sees every market DFlow ever mirrored (same tickers, same book, same resolution). The tokenized SPL representation has no price of its own that differs from Kalshi's.
- Only theoretical use: Solana-side tokens of legacy positions (market `by-mint` lookups) for portfolio display. Not worth building.
- Monitoring: re-check monthly with `curl https://pond.dflow.net/llms.txt | grep -i -E "prediction|kalshi"` and watch commits on `DFlowProtocol/dflow-skills` and `DFlowProtocol/cookbook`. MoonPay (now DFlow's owner) may relaunch something; a relaunch would need a fresh spec.
- Leads worth their own specs: **World Prediction Markets** (independent of Kalshi; see `docs/research/venues/world.md`) and MoonPay's own `mp prediction-market` CLI, whose skill (`moonpay/skills`, `skills/moonpay-prediction-market/SKILL.md`, last changed 2026-03-24, so L for today) says "Kalshi - runs on Solana (USDC)" without naming DFlow.

## 10. Fixtures

`docs/research/fixtures/dflow-prediction-markets-api-kalshi-tokenization-on-solana/` (all under 7 KB):
- `trading-api_openapi.prediction-market-fragments.json` - prediction-market params, error codes, response fields and the quote-stream op still present in the live Trade API schema
- `metadata-api_openapi.summary.json` - the orphaned Metadata API spec: server, auth scheme, 28 operations, `MarketAccountInfo`
- `dev-quote-api_prediction-markets.sample.json` - counts and 5 records from the undocumented leftover endpoint
- `dev-quote-api_order-status_invalid-signature.json` - error shape
- `dev-quote-api_order_spot-usdc-sol.sample.json` - the shared `/order` quote shape (spot, `executionMode: sync`; not a prediction-market response)
- `defillama_dflow-prediction-market.summary.json` - monthly volume, last non-zero days, TVL points, adapter program id
- `dflow-skills_commit_1c546209_sunset-kalshi.json` - the sunset commit (message and file list)
- `pond-dflow_llms.txt` - the docs index as served

No live prediction-market price, book or trade response exists to save (dev host NXDOMAIN, prod 403).

## 11. Not found

- Official DFlow or MoonPay sunset announcement (searched: docs index and full text, FAQ, repo commits, dflow.net blog list, 2 web searches).
- Any prediction-market price, order book or trade response today (dev host NXDOMAIN, prod 403 without a key; no key may be requested for this research).
- Current prediction-market terms, geo rules and fee tiers (pages removed; archive services not used).
- Whether the PM backend still serves wind-down redemptions for Kalshi tokens or now only serves World; why the DefiLlama balance series dropped on 2026-07-07 (migration vs wind-down).
- Whether any on-chain transactions still touch program `pReDicTmksnPfkfiz33ndSdbe2dY43KYPg4U2dbvHvb` (explorer APIs tried returned 502/404; Solana JSON-RPC needs POST, which was off limits).

## 12. Suspicious content

- None that tried to instruct me. DFlow ships AI-agent-facing material by design: every `.md` docs page opens with a boilerplate line ("Fetch the complete documentation index at ... Use this file to discover all available pages before exploring further."), plus `llms.txt`, an MCP server and Agent Skills. The Agent CLI page promotes a pipe-to-shell installer (`curl ... | sh` from cli.dflow.net); I did not run it. All read as data only.

## Sources

- https://solana.com/news/dflow-prediction-markets-api (announcement, Dec 2025) - H
- https://pond.dflow.net/llms.txt, https://pond.dflow.net/llms-full.txt, https://pond.dflow.net/sitemap.xml, https://pond.dflow.net/get-started/endpoints.md, https://pond.dflow.net/get-started/api-key.md, https://pond.dflow.net/get-started/what-is-dflow.md, https://pond.dflow.net/proof/introduction.md, https://pond.dflow.net/terms-of-service (live 2026-10-19) - H
- https://pond.dflow.net/resources/trading-api/openapi.json (Trade API spec) and https://pond.dflow.net/build/metadata-api/openapi.json (orphaned Metadata API spec) - H
- https://dev-quote-api.dflow.net (`/order`, `/order-status`, `/venues`, `/prediction-markets`), https://quote-api.dflow.net, https://prediction-markets-api.dflow.net, https://prediction-markets-api-proxy.dflow.workers.dev, https://dev-prediction-markets-api.dflow.net (probes 2026-10-19) - H
- https://dflow.net/ and `/assets/index-giKo87aB.js` (read as text; contains the Dec 2025 prediction-markets post, the Coinbase post of 2026-05-04 and the MoonPay acquisition post of 2026-05-05), https://legacy.dflow.net/ and its bundle - H
- https://github.com/DFlowProtocol/dflow-skills (commit 1c546209, README), https://github.com/DFlowProtocol/cookbook (`src/prediction-markets/*`, README, commit history) - H
- https://api.llama.fi/protocol/dflow-prediction-market, https://api.llama.fi/summary/dexs/dflow-prediction-market, https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/dflow-prediction/index.ts - H data, M methodology
- https://phantom.com/prediction-market-disclosures (provider split 2026-06-01, resolution reliance, legacy redemption) - H
- https://developers.jup.ag/docs/prediction (Jupiter prediction API, geo statement) - H for the statement
- https://www.quicknode.com/guides/solana-development/3rd-party-integrations/kalshi-prediction-markets-with-dflow (endpoint paths, Proof requirement; undated, uses Feb/Mar 2026 market dates) - M
- https://github.com/moonpay/skills (`skills/moonpay-prediction-market/SKILL.md`) - L
- Repo notes: `docs/research/venues/dflow-prediction-markets.md`, `docs/research/venues/dflow-prediction-markets-282.md`, `docs/research/venues/world.md`, `docs/research/06-paybox-platform.md` - M
