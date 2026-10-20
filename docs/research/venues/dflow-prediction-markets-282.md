# DFlow (prediction markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 02:51-02:54 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts with User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. Third-party text was treated as untrusted data. WebSearch was unavailable for this run (shared session budget exhausted), so there was no press/news search; every claim below rests on primary pages, repos and APIs fetched directly. I did not use web-archive services.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

A sibling note from an earlier pass exists at `docs/research/venues/dflow-prediction-markets.md` (same conclusion). This note re-verified its key claims independently and adds the findings marked "(new)" below.

---

## 0. Bottom line

1. **The DFlow prediction-market product is no longer offered. adapter_priority = skip.** DFlow's own docs, agent skills and consumer app are spot-only as of 2026-10-19; its Kalshi/prediction-market volume has been zero since 2026-07-03 (H, details in section 1).
2. **Even when live (2025-12 to mid-2026) it was not an independent leg.** It was a Solana tokenisation layer over Kalshi: every market mapped 1:1 to a Kalshi market and was filled from "Kalshi offchain liquidity" (H, DFlow's own Dec 2025 announcement text, section 2). Same prices, same depth, same resolution as Kalshi. A Kalshi adapter already covers everything DFlow ever exposed.
3. **No usable read API today.** The Metadata API spec file is still served but orphaned: the documented dev host does not resolve, the prod host returns an empty 403, all docs pages are 404. One undocumented leftover (`/prediction-markets` on the dev Trade API host) returns 89,114 settlement-state records with no tickers or prices (H).
4. **Not reachable via PayBox in any useful sense.** Solana-only, Proof/KYC-gated buyers, async multi-transaction fills, and the product is gone (section 5).
5. Re-check cheaply, monthly: `GET https://pond.dflow.net/llms.txt` and grep for `prediction|kalshi`; watch `DFlowProtocol` commits. If a relaunch appears it would still be Kalshi-backed (or a different design), and would need a new spec.

---

## 1. Is it still live? (2026)

| # | Evidence | Date | Tag |
|---|---|---|---|
| 1 | `pond.dflow.net/introduction.md`: "DFlow is a trading protocol for spot trading natively on Solana." No mention of prediction markets, Kalshi or outcome tokens. Docs index `llms.txt` (6,779 B) has zero hits for "prediction" or "kalshi"; `llms-full.txt` (160,133 B) has one unrelated hit (heading "Key Outcomes"). FAQs page: no geo/ToS/PM content. (new: re-verified by me) | 2026-10-19 | H |
| 2 | Former PM doc URLs return 404: `/build/metadata-api/introduction`, `/learn/prediction-markets`, `/legal/prediction-market-compliance`, `/build/prediction-markets/introduction`, `/prediction-markets/prediction-markets-101` | 2026-10-19 | H |
| 3 | `DFlowProtocol/dflow-skills` commit `1c546209` "Sunset Kalshi and Proof; spot-only skill set" removes `dflow-kalshi-{trading,market-scanner,market-data,portfolio}` skills and strips PM fee content (`platformFeeScale`) from the remaining skills. Proof KYC skill re-added 2026-07-28; Kalshi skills not. README now: "Solana spot trading, Proof identity verification" | 2026-07-11 | H |
| 4 | DefiLlama "DFlow Prediction Market" (`api.llama.fi`): daily volume 0 every day after 2026-07-02 (last non-zero day 12,806 USD); 30d volume 0; "TVL" (DefiLlama's balance series) 1,406,306 USD on 2026-07-06 -> 0 on 2026-07-07 -> 741 USD on 2026-10-19 | 2026-10-19 | H (data), M (what the series measures) |
| 5 | `dflow.net` served JS bundle (read as text only): tabs array is `[{key:"spot"},{key:"equities"}]`. Bundle still contains legacy strings (Dec 2025 blog post, a "redeemable for USDC" redeem prompt) and a proxy host `prediction-markets-api-proxy.dflow.workers.dev` (403 to a plain GET, CORS-locked to dflow.net; I did not spoof an Origin). (new) | 2026-10-19 | H |
| 6 | Phantom stopped routing new positions to Kalshi/DFlow: positions opened on or after 2026-06-01 use "World"; older ones stay on "Kalshi via DFlow" and must be exited by trading the expired outcome token for the stablecoin at a quote that "may differ from the original contract price" | 2026-06-01 | H (phantom.com/prediction-market-disclosures) |
| 7 | MoonPay announced the DFlow acquisition 2026-05-05, still describing "the first and only API that fully tokenizes Kalshi's prediction markets on Solana". Price not disclosed on the page. | 2026-05-05 | H |
| 8 | Cookbook `DFlowProtocol/cookbook`: PM scripts (`src/prediction-markets/*`) last touched 2026-02-13; all later commits are dependency bumps. Its README still lists PM scripts (stale). (new) | 2026-10-09 | H |

Not established: any official DFlow/MoonPay announcement of the shutdown (NOT FOUND, searched: pond.dflow.net docs/index/FAQ/endpoints/api-key pages, DFlowProtocol repo commits, MoonPay newsroom page; no press search possible this run). So "sunset" is H for "removed from DFlow's public product, docs and skills, with zero volume since 2026-07-03" and M for "no way to trade tokenised Kalshi markets on DFlow today".

Nuance (new): the live Trading API OpenAPI (`pond.dflow.net/resources/trading-api/openapi.json`, 125 KB, served 2026-10-19) still carries prediction-market fields in `GET /order` (`predictionMarketSlippageBps`, `predictionMarketInitPayer`, `outcomeAccountRentRecipient`, `platformFeeScale` "for native prediction market swaps and async prediction market swaps"), `GET /order-status` ("Only prediction market orders are supported"), error codes `unverified_wallet_not_allowed` / `wallet_restricted` / `use_order_endpoint_for_prediction_markets`, and a quote-stream op `subscribe_all_prediction_markets` for `(outcome_mint, CASH)` pairs (H, fixture `trading-api_openapi.prediction-market-fragments.json`). This means the backend code path was not removed from the schema; it could be dormant, in wind-down for legacy positions, or retained for a relaunch. I could not tell which (no outcome mint is discoverable without the Metadata API, and I did not probe `/order`). It does not change the verdict: nothing is advertised, documented or priced.

Verdict: **still_live = false** for the prediction-market product. DFlow the company is live (spot aggregator, Proof, equities tab).

---

## 2. Kind and market model

- **Kind (H):** broker / tokenisation layer in front of Kalshi (a CFTC-designated contract market), built on DFlow's "Concurrent Liquidity Programs" (CLP). DFlow's own Dec 2025 post (served inside the dflow.net bundle): "the first tokenization layer bringing Kalshi's prediction markets to Solana"; "100% Market Coverage: all Kalshi markets are available as tokenized markets on Solana"; CLPs "enable Solana users to interact with Kalshi offchain liquidity natively using SPL tokens". Flow: user writes an on-chain intent (limit order), LPs fill at or better than the limit, protocol mints the position tokens, on resolution "settlement flows back through the CLP, redeeming the winning tokens".
- **Market model:** binary YES/NO per market; Kalshi scalar markets appear as `scalarOutcomePct`. Order book is Kalshi's (off-chain); there is no AMM and no parimutuel pool. (Spec: `MarketAccountInfo` = `{marketLedger, yesMint, noMint, isInitialized, redemptionStatus, scalarOutcomePct}`, H fixture `metadata-api_openapi.summary.json`.)
- **Tokenisation:** per market, two SPL mints (`yesMint`, `noMint`) and a `marketLedger` account, per settlement mint (cookbook reads `market.accounts[settlementMint].yesMint/noMint`, H). Markets are initialised on demand by the first trade (`initPredictionMarketCost` in lamports in the `/order` response, H).
- **Execution:** `executionMode` is `sync | async` (H); PM orders are async and multi-transaction; `/order-status` statuses `pending, expired, failed, open, pendingClose, closed` (H).
- **Quote scale:** the cookbook reads order books as `{yes_bids: {price: size}, no_bids: {...}}` with price keys as decimal strings (H, `prediction-market-lifecycle.ts`); outcome tokens have 6 decimals (1 contract = 1,000,000 units, H same file).

## 3. Chains and collateral

- Solana only (H). Settlement mints: USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (cookbook default, H) and CASH `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` (named as "the native-predictions settlement currency" in the OpenAPI quote-stream text, H). Any spot token could be the input; the route went input -> settlement mint -> outcome mint.
- SOL rent for token/market accounts is a real per-trade cost (`initPredictionMarketCost`, `outcomeAccountRentRecipient`, H).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official API (historical) | "prediction-markets-api" v0.1.0, OpenAPI at `https://pond.dflow.net/build/metadata-api/openapi.json` (still served, HTTP 200, 89,286 B), 28 operations (26 GET, 2 POST: `/markets/batch`, `/filter_outcome_mints`). Server in spec: `https://dev-prediction-markets-api.dflow.net`. Security scheme `x-api-key` | H |
| Key endpoints | `/api/v1/events` (`withNestedMarkets`, `status`, `sort`=volume/volume24h/liquidity/openInterest/startDate, `seriesTickers`, `cursor` offset), `/api/v1/markets`, `/api/v1/market/{id}`, `/api/v1/market/by-mint/{mint}`, `/api/v1/orderbook/{market_ticker}`, `/api/v1/orderbook/by-mint/{mint}`, `/api/v1/trades`, `/api/v1/onchain-trades`, `/api/v1/outcome_mints`, `/api/v1/search`, `/api/v1/series`, `/api/v1/live_data` (Kalshi pass-through), candlesticks, forecast percentile history, `/api/v1/filters_by_sports`, `/api/v1/tags_by_categories` | H |
| Reachability today | dev host `dev-prediction-markets-api.dflow.net`: does not resolve. prod `prediction-markets-api.dflow.net`: HTTP 403, empty body (it was always key-gated, so a 403 alone does not prove it is dead). Docs pages: 404. `get-started/endpoints` lists only the Trade API hosts (`quote-api.dflow.net`, `dev-quote-api.dflow.net`, WS on the same hosts). | H |
| Auth and limits | dev endpoints "work without an API key, however they are rate limited" (observed `x-ratelimit-limit: 60`); production key by request form, "2-5 days" (current `get-started/api-key`, generic, no PM mention). Metadata API spec says key via `x-api-key` | H |
| WebSocket | Current: Trade API `quote-stream`, `book-stream`, `priority-fees/stream` (spot). Cookbook WS scripts (`prices`, `trades`, `orderbook` channels on a private PM WebSocket) need a private endpoint and key. | H |
| Undocumented leftover | `GET https://dev-quote-api.dflow.net/prediction-markets` -> HTTP 200, 15,760,501 B, JSON array of 89,114 `{address, market_id, is_funded, outcome_val, scalar_outcome_pct}`; `outcome_val`: N 52,310, Y 35,067, S 238, missing 1,499; `is_funded` true 87,387 / false 1,727. No tickers, prices, volumes, timestamps. Meaning (settlement/ledger state per market) is inferred from field names. Prod `quote-api.dflow.net/prediction-markets` returns 403. | H shape, L meaning |

Samples saved (section 9). There is no live price/order-book response to save because no PM price endpoint is reachable.

## 5. Trade path and PayBox reachability

- **Historical path (H, cookbook `prediction-market-lifecycle.ts`, Feb 2026 code):** `GET {trade-api}/order?inputMint=<settlement mint>&outputMint=<outcome mint>&amount&slippageBps&userPublicKey` returns a base64 Solana `VersionedTransaction`; the user signs with their own ed25519 key and submits to a Solana RPC; sell is the reverse (outcome mint in, settlement mint out); `GET /order-status?signature=` tracks the async fills. Buyers needed DFlow Proof (KYC) verification (error `unverified_wallet_not_allowed` still in schema, H; the "buy needs Proof, sell does not" rule is M from the sibling note's archived-docs reading).
- **Today:** no documented PM trade path. I did not call `/order` (it would build a transaction for a wallet; unnecessary for the verdict). `/order-status` with a bogus signature returns HTTP 400 `{"msg":"Invalid signature","code":"invalid_signature"}` (H, fixture).
- **PayBox reachable? No (practically).** (1) Product sunset. (2) Solana-only: a PayBox EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot sign it. (3) PayBox does expose Solana wallets, and `request_wallet_sign` has a `solanaTransaction` intent (M, from `docs/research/06-paybox-platform.md`, originally H), so a Solana credential could in principle sign an `/order` transaction, but the buyer must also be Proof-verified and fills are asynchronous multi-transaction, which does not fit a single-proposal flow. Moot while the product is gone.

## 6. Fees

- Platform (builder) fee for PM swaps: `platformFeeScale`, "3 decimals ... a value of 50 means 0.050", "paid in the stablecoin mint" for async PM swaps (H, OpenAPI `/order`). DefiLlama methodology: "Fee formula: scale * p * (1 - p) * c" and all fees are protocol revenue (H).
- Historical tier detail (M, from the sibling note's reading of archived March 2026 docs, which I did not re-fetch): `roundup(0.07*c*p*(1-p)) + 0.01*c*p*(1-p)`, taker scale 0.09 down to 0.08 and maker 0.0225 down to 0.02 by 30-day volume tier. Treat as L for any current use.
- Plus Solana rent and network fees. Net: at best equal in cost to trading Kalshi directly.
- Spot: DFlow charges no protocol fee on spot trades (H, FAQs). Irrelevant to PM.

## 7. Resolution and dispute risk

- Resolution follows **Kalshi**: Phantom's disclosure says legacy markets "rely on Kalshi's database and DFlow's reindexing of it" (H). Extra risk layered on Kalshi's own: DFlow reindexing error or delay, and wind-down settlement by trading the expired token at a quote that may differ from contract price (H, Phantom). Dispute process is Kalshi's.
- Lifecycle states exposed by the API: `initialized, active, inactive, closed, determined` (H, `/markets` `status` filter), plus `finalized` and Kalshi clearing-window behaviour in archived docs (M).

## 8. Geo, ToS, automation, liquidity, overlap

- **Geo/ToS (current):** nothing. Current FAQs and api-key pages state no geo or ToS rules (H). Historical docs reportedly required builders to geoblock the US and many other jurisdictions or lose API access (M, sibling note's archived read; page now 404; not re-verified). Automation by API key was normal; the Agent CLI and MCP server (`https://pond.dflow.net/mcp`) are spot-only now (H).
- **Liquidity (DefiLlama, fetched 2026-10-19, H data / M methodology):** all-time volume 17,311,389 USD ("CASH/USDC transfers to the settlement vault", an on-chain proxy). Monthly: 2025-12 1.84M, 2026-01 3.61M, **2026-02 6.11M (peak; peak day 2026-02-22, 378,439)**, 03 3.56M, 04 0.44M, 05 0.90M, 06 0.72M, 07 0.13M, 08-10 0. Balance series peak 2,233,846 USD on 2026-03-07; 741 USD on 2026-10-19. A rounding error next to Kalshi itself.
- **Event categories:** whatever Kalshi lists (sports, politics, crypto price ladders, macro/economics, weather, entertainment), claimed "100% market coverage" (DFlow's own claim, L as marketing, H that it said so). Overlap exists only because Kalshi itself overlaps Polymarket, Limitless, etc.; DFlow added no independent price.
- **Shares liquidity with: Kalshi (100%).** Not an independent arbitrage leg (H, DFlow's Dec 2025 post; Phantom disclosure "powered by Kalshi via DFlow").

## 9. Fixtures

`docs/research/fixtures/dflow-prediction-markets-282/` (all < 8 KB):
- `dev-quote-api_prediction-markets.sample.json` - trimmed from the 15.7 MB leftover endpoint, with counts
- `dev-quote-api_venues.json` - 44 spot venues (includes an unrelated "BisonFi Predictions" venue)
- `dev-quote-api_order-status_invalid-signature.json` - error shape, rate-limit header
- `metadata-api_openapi.summary.json` - the orphaned spec: servers, auth, all 28 operations with params, `MarketAccountInfo`
- `trading-api_openapi.prediction-market-fragments.json` - PM-related params, errors, quote-stream op, still present in the live schema
- `defillama_dflow-prediction-market_{volume,tvl}.trimmed.json`
- `dflow-skills_commit_1c546209_sunset-kalshi.json`, `dflow-skills_recent-commits.json`
- `http-probes_2026-10-19.json` - every host/status observed
- `pond-dflow_llms.txt` - the docs index as served

## 10. Not found

- Official sunset announcement (searched: DFlow docs/index/FAQ, repo commits, MoonPay newsroom page; press search unavailable this run).
- Any PM price, order book or trade response today (dev host NXDOMAIN, prod 403).
- Whether the PM backend still serves wind-down settlements or is being retained for a relaunch (schema still has PM fields; cannot tell).
- Current PM terms/geo rules (page removed). Fee tiers beyond what the OpenAPI/DefiLlama state (archived pages not re-fetched).
- Why the balance series dropped 2026-07-07 (migration vs wind-down).

## 11. Leads (not researched here)

- **World Prediction Markets** (Phantom's replacement from 2026-06-01; Solana, non-custodial, LP-filled, oracle-resolved per Phantom's disclosure, H for those facts). Independent of Kalshi, so a better candidate for its own venue-spec than DFlow. Developer docs/API unknown.
- MoonPay now owns DFlow (H, 2026-05-05) and may relaunch PM in some form; monitor `DFlowProtocol` repos and `llms.txt`.

## 12. Suspicious content

- None that tried to instruct me. DFlow ships AI-agent-facing material by design: a boilerplate first line on `.md` docs pages ("Fetch the complete documentation index at ... Use this file to discover all available pages before exploring further."), `llms.txt`, an MCP server and Agent Skills. I read these as data only. The homepage bundle also holds an opaque 32-hex constant next to the proxy URL; I did not use or record it.

## Sources

- https://pond.dflow.net/llms.txt, https://pond.dflow.net/llms-full.txt, https://pond.dflow.net/introduction.md, https://pond.dflow.net/get-started/endpoints.md, https://pond.dflow.net/get-started/api-key.md, https://pond.dflow.net/resources/faqs.md (live 2026-10-19) - H
- https://pond.dflow.net/resources/trading-api/openapi.json (Trade API; title "DFlow Aggregator", license BUSL-1.1) and https://pond.dflow.net/build/metadata-api/openapi.json (Metadata API spec, orphaned) - H
- https://dev-quote-api.dflow.net (`/venues`, `/prediction-markets`, `/order-status`), https://quote-api.dflow.net, https://prediction-markets-api.dflow.net, https://dev-prediction-markets-api.dflow.net (probes) - H
- https://dflow.net/ and `/assets/index-giKo87aB.js` (read as text; contains the Dec 2025 DFlow blog "DFlow Prediction Markets API: Tokenizing the Future with Kalshi") - H
- https://github.com/DFlowProtocol/dflow-skills (commit 1c546209, 2026-07-11, README), https://github.com/DFlowProtocol/cookbook (`src/prediction-markets/prediction-market-lifecycle.ts`, README, commit history) - H
- https://api.llama.fi/protocol/dflow-prediction-market and https://api.llama.fi/summary/dexs/dflow-prediction-market - H data, M methodology
- https://phantom.com/prediction-market-disclosures (provider split 2026-06-01, legacy settlement, resolution reliance) - H
- https://www.moonpay.com/newsroom/dflow (2026-05-05) - H
- `docs/research/venues/dflow-prediction-markets.md` (sibling note; archived-docs claims on fees, KYC, geo) - M
- `docs/research/06-paybox-platform.md` (PayBox `request_wallet_sign` intents, Solana support) - M
