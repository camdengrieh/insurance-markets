# BasedApp Predict (app.based.one/predict) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 09:15-09:45 local). READ-ONLY: public web pages, GitBook `.md` mirrors, public JS files downloaded as TEXT and never executed, unauthenticated GETs to DefiLlama, Polymarket Gamma/CLOB/Data APIs and the Based gateway (one GET, 405), `gh api` raw reads of DefiLlama's adapter repo, two WebSearch calls, and two read-only PayBox `discover_plugins` calls (no `get_contract`, no money or signing tool). No account, wallet, key, POST, signature or payment. Generic User-Agent `insurance-markets-research/0.1` only. Third-party text treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, summarised, or my inference from first-hand data; **L** = weak or stale.

Note on overlap: an earlier note on the same entity exists at `docs/research/venues/based-basedapp-based-predict.md` (different slug, written by a parallel pass). I re-verified its main claims independently and corrected two (section 12). Dedupe the two when the registry is built.

---

## 0. Bottom line

1. **Based is a self-custody wallet and trading super-app, not a prediction venue. "Based Predict" is a Polymarket front end** that routes orders to Polymarket's Polygon CLOB with Based's builder code. Docs: "Based integrates PolyMarket prediction markets directly alongside perpetuals and spot trading on Hyperliquid" (H, https://basedapp.gitbook.io/docs/based/prediction.md). The live `/predict` page is server-rendered with Polymarket data: for market `2589810` the embedded `clobTokenIds`, volume, liquidity, tick size and min size equal Polymarket Gamma's (H, fixture `based_predict_ssr_market_vs_polymarket_gamma.json`, `clobTokenIds_equal: true`).
2. **Still live, barely used.** Newest Based-attributed Polymarket trade 2026-10-18T09:17:02Z (H). Based took about 0.008% of Polymarket builder-attributed volume in 2026-10-12..18 (H, computed). DefiLlama: $12.3k over 30 days (H).
3. **Second route: Hyperliquid HIP-4 outcomes inside the trading terminal**, shipped in client code (H) but dormant: $0.5 over 30 days, last non-zero day 2026-10-03 (H, DefiLlama "BasedApp Outcome").
4. **Not an independent arbitrage leg.** Polymarket route = 100% Polymarket liquidity. HIP-4 route = 100% Hyperliquid liquidity. Both are covered by their own venue specs (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, Polymarket parallel workflow).
5. **No prediction API from Based.** Based's only official APIs are an authenticated builder-referral API and an OAuth MCP gateway for Hyperliquid perps/spot; neither exposes prediction markets (H).
6. **adapter_priority = skip.** Read and trade Polymarket and Hyperliquid directly. Based adds a flat 1% builder fee, an extra geo layer and no new price.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://app.based.one/predict | HTTP 200 (3.7 MB SSR), title "Prediction Markets \| Based Trading \| Based", embeds current Polymarket events (e.g. "Fed Decision in October?", market end 2026-10-29) | H |
| Polymarket builder-trade feed for Based's builder code | newest row `createdAt 2026-10-18T09:17:02Z`; 300 rows span 2026-09-10..2026-10-18 | H (fixture `polymarket_clob_builder_trades_based_sample.json`) |
| Polymarket builder volume feed, 90-date window 2026-07-22..2026-10-19 | Based has a row on 87 of 90 dates; recent ranks 72-197 among builders | H (fixture `polymarket_builders_volume_v2_based.json`) |
| DefiLlama "Based Predict" (id 7123, chain Polygon, category Interface, parent Based) | 24h $1.91 (day 2026-10-18), 7d $3,678.91, 30d $12,268.89, series total $441,669.89; series begins 2026-07-05; peak day $85,374 on 2026-07-12; `doublecounted: true` | H (https://api.llama.fi/summary/dexs/based-predict, fixture) |
| Company | https://based.one/llms.txt: "More than $44 billion in lifetime trading volume", "More than 100,000 users", Series A Feb 2026; pitch is Hyperliquid perps, stock perps, card, AI. Prediction markets are not mentioned there; HyENA (HIP-3) sunset 2026-08-28 | H (company claims; accuracy M) |

Verdict: **still_live = true**, but prediction is a side feature with tiny flow.

---

## 2. Kind and market model

- **Kind (H):** self-custody wallet / trading app and builder-code front end (https://based.one/llms.txt: "Based is not a broker"; https://based.one/md/about: "Based does not hold user funds"). DefiLlama classes it "Interface".
- **Polymarket route (H via SSR/Gamma fixture):** binary Yes/No per market, each with a `clobTokenIds` pair; central limit order book; `negRisk` multi-outcome events (example market `negRisk: true`, `orderPriceMinTickSize 0.001`, `orderMinSize 5`). Tokenisation is Polymarket's conditional-token (ERC-1155) positions on Polygon; Based mints nothing and publishes no prediction contract addresses (docs Official Links lists none; H).
- **HIP-4 route (code H, behaviour M):** the terminal's JS calls Hyperliquid `info` type `outcomeMeta`, keeps a `useUnifiedMarketStore` "outcome instruments" table and orders outcome instruments (symbols starting `#` or `+`) with spot-style asset ids (H, fixture `app_js_excerpts.txt`). HIP-4 itself: fully collateralised binary outcomes on HyperCore CLOB, see the HIP-4 venue spec (M here).
- UI: list/card/calendar views, filters, Top Traders leaderboard and trader analysis (H, docs). Leaderboard has no documented API.

## 3. Chains and collateral

- **Polymarket route:** Polygon, chain id 137 (H, JS `chain:137`; DefiLlama chain "Polygon"). The client supports two wallet shapes, Polymarket Gnosis Safe (`POLY_GNOSIS_SAFE`, mode `legacy-safe`) and Polymarket deposit wallets (modes `deposit` / `new-deposit`) (H, JS text). A legacy bridged USDC constant `0x2791bca1...4174` is present; current Polymarket collateral (V2) is covered by the Polymarket spec (M). Funding from other chains is quoted through Relay, `https://api.relay.link` `/quote/v2` (H, JS).
- **HIP-4 route:** Hyperliquid L1 (HyperCore), USDC per the HIP-4 spec (M).
- BASED token (utility/staking, fee discount) is not collateral for any market (H, docs fees).

## 4. Read API

- **Based-specific prediction API: NONE.** NOT FOUND (searched: `basedapp.gitbook.io/docs/llms.txt` index of all pages, Prediction, Web Terminal, FAQ, Official Links ("Documentation: GitBook" only), integrations pages, `based.one/llms.txt`, `based.one/md/about`, DefiLlama `github: null`).
- **Official but irrelevant APIs (H):**
  - Builder Referrals API, `https://app.based.one/api/builders/referrals/...` (referral/volume per code), `x-api-key` header, keys "issued for legitimate business use cases", "currently no rate limits" (https://basedapp.gitbook.io/docs/integrations/builder-on-builder-program/builder-api-access.md). Not market data; not probed (needs a key).
  - Based MCP, `https://gateway.based.one/mcp`, Streamable HTTP, OAuth scope `trade`; tools `get_accounts, get_balance, get_positions, get_open_orders, get_markets, place_order, place_tp_sl, cancel_order, get_order`; "Trade Hyperliquid from your agent"; markets are perps (`BTC`) and spot (`HYPE/USDC`); no prediction or outcome tool is documented (https://basedapp.gitbook.io/docs/integrations/based-mcp.md). Live `GET` returns HTTP 405 (POST-only, consistent with docs); I did not POST.
- **Undocumented first-party Next.js routes (do not integrate; read as JS text only, never called):** `/api/polymarket/activity/`, `/positions/`, `/closed-positions/`, `/userOpenOrders/`, `/balance-portfolio/`, `/api/polymarket/clob-proxy/order`, `/clob-proxy/cancel` (H, JS chunk), plus `/api/geoblock/check*`.
- **Where an adapter should read prediction data instead (H shape, per the Polymarket workflow):** Gamma `https://gamma-api.polymarket.com/markets/{id}` (confirmed 200 today, fields incl. `clobTokenIds, conditionId, feesEnabled, feeSchedule {exponent 1, rate 0.05, takerOnly true, rebateRate 0.25}, umaBond 500, umaReward 5, resolvedBy, resolutionSource, bestBid/bestAsk, liquidity, volume`), CLOB `https://clob.polymarket.com`, WebSocket `wss://ws-subscriptions-clob.polymarket.com/ws/...` (the Based app opens the `/ws/user` channel, H). HIP-4 data comes from Hyperliquid `info` / WebSocket (see HIP-4 spec).
- **Based-specific attribution feeds (the only Based-shaped data), unauthenticated GET, 200 today (H):**
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` -> `{data:[{date, rank, builder_name:"Based", builder_code, verified, volume, active_users}]}`; `volume` is **share notional** (6.161 shares on 2026-10-18 = $1.91 cash), not USD.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=0x07aa1a85...88d1cf` -> `{data:[trade], next_cursor, limit:300, count}`; trade fields `id, tradeType, takerOrderHash, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. `owner`/`maker` are third-party identifiers (redacted in the fixture).
  - DefiLlama `GET https://api.llama.fi/summary/dexs/based-predict`, `/summary/fees/based-predict`, `/summary/dexs/based-app-outcome` (H, fixtures).

## 5. Trade path

- **Via Based: none usable.** The app builds a Polymarket CLOB client `{host, chain:137, signer, creds, signatureType, funderAddress, builderConfig:{builderCode}}`, creates and signs the order in the user's session, and POSTs `{order, clobOrderType, address, funderAddress, apiKey, deferExec}` to Based's own proxy `/api/polymarket/clob-proxy/order` (H, fixture `app_js_excerpts.txt`). No public order API, API keys or agent-wallet interface exist for predictions (H absence). Telegram bot and desktop app are UI surfaces.
- **Based MCP** can place Hyperliquid perp/spot orders only (H); outcome trading through it is not documented.
- **Sensible path:** Polymarket directly (EIP-712 signed CLOB orders on Polygon 137, L2 creds) and Hyperliquid directly (signed actions to `/exchange`, agent wallets). Do not attach Based's builder code to anyone else's orders; the "API Traders" doc publishes Based's Hyperliquid builder wallet `0x1924b8561eeF20e70Ede628A296175D358BE80e5` and a cloid only so API perp trades earn Based XP (H, https://basedapp.gitbook.io/docs/integrations/api-traders.md).

## 6. PayBox / EVM wallet reachability

- **Based as a venue: no.** No order API, no transaction-proposal interface; Safe/deposit-wallet setup and order signing happen inside Based's UI/client (H).
- PayBox plugin catalog today (read-only `discover_plugins`, H): query "polymarket" returned no plugin; query "hyperliquid" returned an official `hyperliquid` plugin described as "Browse Hyperliquid spot markets, prices, and token metadata" (not enabled for this user). No Based or Polymarket plugin.
- Underlying venues: Polymarket needs EIP-712 typed-data signing on Polygon plus an L2 API credential, and Hyperliquid needs L1 action signing, not EVM transaction proposals; both are the subject of their own specs (M). Routing a PayBox wallet through Based would add fee and geo risk and no unique market.

## 7. Fees

- **Polymarket route (H):** total = Polymarket platform fee (per-market `feeSchedule`, taker-only) + **Based builder fee 1% of notional**. Docs: "Based charges an additional 1% on top of the Polymarket Trading Fees" (https://basedapp.gitbook.io/docs/based/prediction.md). Observed: `builderFee / sizeUsdc` is between 0.00998 and 0.0100 on all 300 sampled rows (2026-09-10..2026-10-18; BUY and SELL, TAKER and MAKER rows) (H, computed from the live feed).
- **Stale docs (L):** the same page prints `fee = round up (0.07 x C x P x (1-P))` and "Sells/closing of positions do not incur fees as of 12 Dec 2025". That is about 10 months old and the 0.07 coefficient does not match Gamma's live `feeSchedule.rate 0.05` for the example market. Use Gamma's `feeSchedule` per market, not Based's table.
- **Hyperliquid side (H, https://basedapp.gitbook.io/docs/based/fees.md):** total = Hyperliquid fee + Based builder fee; perps 0.045% + 0.025% = 0.070%, spot sell 0.070% + 0.1%, Diamond staking (600,000+ BASED) removes the builder fee. No schedule for HIP-4 outcomes is published (NOT FOUND, searched: docs Fees, llms.txt).
- Payer: the trader. Up to 76% of builder fees go to affiliates (H, docs). Cross-chain funding via Relay carries Relay's quote fees (M).

## 8. Resolution and dispute risk

- Based resolves nothing. Polymarket markets settle through Polymarket's UMA adapter: the example market's Gamma record carries `umaBond 500`, `umaReward 5`, `resolvedBy 0x69c47D...5f24`, `resolutionSource` (federalreserve.gov), `fallbackResolutionType none` (H). The Polymarket dispute process (proposal, challenge window, DVM escalation, possible 50-50) is documented in `docs/research/08-venues-polymarket-kalshi.md` (M here).
- Redemption is on Polymarket's schedule: Based FAQ says redemption is "available after Polymarket resolves the market, which can take a day or more" and exiting early means selling (H, https://basedapp.gitbook.io/docs/guides-and-faq/faq.md). Extra risk from Based: front-end dependence, its Safe/deposit-wallet deployment step, and a geo gate.
- HIP-4 outcomes settle under Hyperliquid's own rules (mostly deployer-settled per the HIP-4 spec, M).

## 9. Geo, ToS, automation

- Docs: "Prediction market features may not be available in certain jurisdictions due to regulatory requirements" (H, Prediction page). Country list NOT FOUND (searched: docs Prediction/About/Web Terminal/FAQ, `based.one/llms.txt`).
- The client runs **three separate geoblock checks** - `trading`, `prediction`, `outcome` (the last defaults to not allowed until its check returns) - backed by `/api/geoblock/check*` and a compliance-provider SDK (env names `NEXT_PUBLIC_SUNBREAK_*`) (H code, M interpretation; fixture `app_js_excerpts.txt`). I did not call those endpoints.
- Terms of Service: https://based.one/terms (HTTP 200, "Platform Terms" / "Card Terms" / "Privacy Policy" links) is client-rendered; no terms text in the HTML or in a summarising fetch. Bot/automation clause, operator entity, restricted countries and any Polymarket-specific clause: **NOT FOUND** (searched: `based.one/terms` raw HTML and WebFetch, `/md/terms` 404, docs, web search). Do not infer permission.
- Polymarket's own IP geoblock and US restrictions still bind the underlying order (M, see Polymarket spec). Hyperliquid HIP-4 has its own barred-person list (M, HIP-4 spec).
- Automation: Based offers an official agent path only for Hyperliquid perps/spot (MCP). Scripted use of the prediction UI/proxy would be unsanctioned reverse engineering (M inference; no clause found either way).

## 10. Liquidity (with dates)

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| Based Predict volume (USD) | 24h $1.91; 7d $3,678.91; 30d $12,268.89; series total $441,669.89; peak day $85,374 (2026-07-12) | api.llama.fi, 2026-10-19 | H |
| Based Predict fees | 7d $36.35; 30d $121.99; total $7,310.23 | api.llama.fi, 2026-10-19 | H |
| Share of Polymarket builder-attributed volume | 14,369.6 vs 181,613,167 share notional, 2026-10-12..18 = 0.0079%; 3-7 active users on busy days | data-api v2, 2026-10-19 | H (computed) |
| Based, 87 dates in 2026-07-22..10-19 window | 361,263 share notional | data-api v2, 2026-10-19 | H (computed) |
| BasedApp Outcome (HIP-4 via Based builder code; DefiLlama id 8963, listed 2026-10-08) | total $78,120.38 since 2026-05-02; 76 non-zero days; peak $18,023 on 2026-05-11; 7d $0; 30d $0.5; last non-zero day 2026-10-03 | api.llama.fi, 2026-10-19 | H |
| Book depth reachable through Based | identical to Polymarket's (Based's "liquidity" field is Polymarket's: example market 747,115.86 both sides) | SSR vs Gamma fixture | H |
| Whole Based platform | ">$44 billion lifetime volume", ">100,000 users" (company claims) | based.one/llms.txt, 2026-10-19 | H claim / M accuracy |

TVL: DefiLlama shows empty TVL for the protocol (H). Both DefiLlama entries carry `doublecounted: true`.

## 11. Event categories and shared liquidity

- **Categories (H, docs):** Crypto, Sports, Finance, Elections, Politics, Geopolitics, Tech, Culture. Live example: Fed rate decision for October 2026 (macro), a category that also trades on Kalshi and Polymarket itself.
- **Shared liquidity: YES.** Based Predict = 100% Polymarket (global, Polygon CLOB). The terminal's HIP-4 route = 100% Hyperliquid. An arbitrage scan that counts Based as a leg would compare Polymarket with itself minus a 1% fee. Count it zero times.
- Signal value: nil. Based's flow is about 0.008% of Polymarket builder volume and its leaderboard has no API.

## 12. Corrections versus the earlier overlapping note (`based-basedapp-based-predict.md`)

1. That note says Based's site/app has **no** HIP-4 mention. First-hand: the trading terminal's JS contains Hyperliquid `outcomeMeta` calls, outcome-instrument handling (`#`/`+` symbols) and an `outcome` geoblock check (H, fixture `app_js_excerpts.txt`). So the HIP-4 route is real code, not only a DefiLlama attribution, though usage is dust and there is no doc or `llms.txt` mention.
2. That note says Based has no official API. Based has an authenticated builder-referral API and an OAuth MCP gateway (both H); neither covers prediction markets, so the conclusion (no usable prediction API) stands.

## 13. Fixtures (`docs/research/fixtures/basedapp-predict/`, each under 50 KB)

| File | Source |
|---|---|
| `defillama_protocol_based-predict.json` | `GET https://api.llama.fi/protocol/based-predict` |
| `defillama_summary_dexs_based-predict_trimmed.json` | `GET https://api.llama.fi/summary/dexs/based-predict` (totals + last 30 daily points) |
| `defillama_summary_fees_based-predict_trimmed.json` | `GET https://api.llama.fi/summary/fees/based-predict` (totals + methodology) |
| `defillama_summary_dexs_based-app-outcome_trimmed.json` | `GET https://api.llama.fi/summary/dexs/based-app-outcome` (all non-zero days) |
| `polymarket_builders_volume_v2_based.json` | `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90`, Based rows + per-day all-builder totals |
| `polymarket_clob_builder_trades_based_sample.json` | `GET https://clob.polymarket.com/builder/trades?builder_code=<Based>`, first 5 of 300 rows, `owner`/`maker` redacted |
| `based_predict_ssr_market_vs_polymarket_gamma.json` | market parsed from the SSR `/predict` page next to `GET https://gamma-api.polymarket.com/markets/2589810` |
| `app_js_excerpts.txt` | short excerpts of public client JS read as text (CLOB client, proxy POST, WebSocket, geoblock checks, outcome instruments) |

## 14. Adapter priority

**skip.** Reasons: (1) 100% duplicate liquidity (Polymarket for Predict, Hyperliquid for Outcome); (2) no Based API for predictions; (3) tiny usage (about $12k/30d and $0.5/30d); (4) extra 1% builder fee, an additional geo layer and an unreadable ToS; (5) no PayBox-reachable surface beyond what Polymarket/Hyperliquid already offer. Re-open only if Based publishes a documented order API or its own market contracts.

## 15. Not found / open questions

- Based API, SDK, GitHub or contracts for prediction products: NOT FOUND (searched: docs index, integrations pages, Official Links, `based.one/llms.txt`, DefiLlama `github: null`).
- ToS body (automation clause, entity, restricted countries): NOT FOUND (client-rendered).
- Whether the HIP-4 outcome UI is switched on for general users, and its builder fee: NOT FOUND (code present; no doc, no announcement found in two searches).
- Restricted-jurisdiction list for the `prediction` and `outcome` checks: NOT FOUND.
- Why DefiLlama's Based Predict series starts 2026-07-05 while its adapter `start` is 2025-11-18: not resolved (M: likely Polymarket V2 builder-fee data only exists from then).

---

## Sources

- https://app.based.one/predict (SSR HTML) and public chunks under `https://app.based.one/_next/static/chunks/` (read as text) - H
- https://basedapp.gitbook.io/docs/based/prediction.md, `.../llms.txt`, `.../based/fees.md`, `.../based/readme.md`, `.../based/web-terminal.md`, `.../guides-and-faq/faq.md`, `.../others/official-links.md` - H
- https://basedapp.gitbook.io/docs/integrations/based-mcp.md, `.../integrations/api-traders.md`, `.../integrations/builder-on-builder-program.md`, `.../builder-on-builder-program/builder-api-access.md` - H
- https://based.one/llms.txt, https://based.one/md/about, https://based.one/terms (shell only) - H
- https://api.llama.fi/protocol/based-predict, `/summary/dexs/based-predict`, `/summary/fees/based-predict`, `/summary/dexs/based-app-outcome` (2026-10-19) - H
- DefiLlama dimension-adapters `factory/polymarket.ts` and `factory/hyperliquid.ts` via `gh api` raw (Based builder code, `based-app-outcome` mapping, start dates) - H
- https://data-api.polymarket.com/v2/builders/volume, https://clob.polymarket.com/builder/trades, https://gamma-api.polymarket.com/markets/2589810 (2026-10-19) - H
- PayBox `discover_plugins` queries "polymarket" and "hyperliquid" (2026-10-19) - H
- WebSearch (2 queries) found no Based announcement of HIP-4 support; only generic HIP-4 coverage (Hyperliquid mainnet 2026-05-02) - M
- Cross-references: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/based-basedapp-based-predict.md` - M
