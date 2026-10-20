# FinFeedAPI - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, public OpenAPI/llms.txt/.well-known reads and unauthenticated GETs to documented API hosts only. No account, API key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party and vendor pages were treated as untrusted data; nothing in them was followed. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, vendor marketing, or my inference/calculation from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/finfeedapi/` (listed in section 12).

---

## 0. Bottom line

1. **FinFeedAPI is a paid, key-gated, read-only data vendor, not a venue.** It has no markets, no liquidity, no settlement and no execution of its own. It normalises trades, quotes, order-book snapshots, OHLCV and market metadata from nine upstream venues (H, https://www.finfeedapi.com/products/prediction-markets-api). The third-party article that surfaced it states "Hard limitation: no trade execution" (M, https://interexy.com/how-to-integrate-prediction-market-aggregators), and the official pricing page lists only data endpoints (H, .../prediction-markets-api/pricing, as read by the fetch tool).
2. **Still live and actively maintained (2026).** Public OpenAPI served; API host answers (401 without key); SDK repo `api-bricks/api-bricks-sdk` pushed 2026-10-16; vendor blog posts dated 2026-08-21, 2026-08-28, 2026-10-13 and 2026-10-15 (all H, see section 1).
3. **Coverage is wider than the discovery hint.** Nine exchange ids, not four: KALSHI, POLYMARKET, MYRIAD, MANIFOLD, HYPERLIQUIDOUTCOME, PASCAL, GEMINIPM, CRYPTOCOMPM, FORECASTEX (H, OpenAPI example list). The "Polymarket, Kalshi, Myriad, Manifold" hint is the launch-era list (M, stale).
4. **Weak fit for an arbitrage scanner.** Per the OpenAPI schema there is no volume, open-interest, close-time, category/tag or winner field on the market object; no websocket for prediction markets; no cross-venue event matching; every call costs money (about $1 to $5 per 1,000 requests); and the Customer Agreement limits use to "internal business purposes" and bans reselling. Native APIs of the big venues are free and richer.
5. **adapter_priority = P2.** Useful only as an optional paid, normalised historical and long-tail-venue read source (backtests of the edge model, venues without a good native API). Not an arbitrage leg (it is not a venue) and not a signal source for Quotient. Build native adapters first.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.prediction-markets.finfeedapi.com/swagger/v1/swagger.json` | HTTP 200, OpenAPI 3.0.4 "Prediction Markets API" v1, 86,827 bytes, no key needed (probed 2026-10-19) | H |
| `GET https://api.prediction-markets.finfeedapi.com/v1/exchanges` (no key) | HTTP 401 JSON error naming the accepted key locations (fixture `unauth-401.json`). Same for `/v1/ohlcv/periods`, `/v1/markets/POLYMARKET/active?limit=2`, `/v1/exchanges/KALSHI`, `/mcp` | H |
| GitHub `api-bricks/api-bricks-sdk` ("SDKs for CoinAPI & FinFeedAPI") | not archived, MIT, 533 stars, `pushed_at` 2026-10-16T06:10Z (`gh api repos/api-bricks/api-bricks-sdk`, 2026-10-19) | H |
| Blog "Prediction Markets API Expends with Gemini, Pascal, and Crypto.com" | page shows "August 21, 2026" | H (date text on page) |
| Blog "ForecastEx Prediction Markets Data Is Now Live on FinFeedAPI" | page shows "August 28, 2026" | H |
| Blog "Best Prediction Market APIs for Data..." / "Raw vs normalized prediction market data" | pages show "October 13, 2026" / "October 15, 2026"; the first says its comparison reflects documentation "as of October 2026" | H |
| Blog "Introducing Prediction Markets API" | page shows "October 13, 2025" (launch, Polymarket + Kalshi only). More than 6 months old: **stale** for coverage claims | H (date), L (coverage) |
| Corporate | operator is API BRICKS LTD f/k/a CoinAPI LTD (UK), parent of CoinAPI; Customer Agreement effective 2025-08-18 (H, https://www.finfeedapi.com/legal). The order-book payload still carries a `time_coinapi` field (H, OpenAPI schema), confirming CoinAPI heritage | H |

Verdict: **live**. NOT FOUND (searched: homepage, blog list, sitemap, status page header only): any incident or deprecation notice. The status page `https://status.apibricks.io/` returned HTTP 200 but I did not parse it.

---

## 2. Kind and market model

- **Kind:** commercial market-data API / aggregator (data only) from the CoinAPI team. REST, JSON-RPC (read-only mirror of REST) and a hosted MCP server; official SDKs for Python, Go, JS/TS, Java, C#, Swift (H, .../prediction-markets-api/docs as read by the fetch tool). Also sells stock, currency, SEC and flat-file products (H, homepage).
- **Market model exposed (normalised, H, OpenAPI `Markets.MarketModel`):** one record per *outcome*, not per event. Fields (complete list): `market_id`, `title`, `description`, `outcome_name`, `price` (double), `status`, `exchange`, `exchange_id`, `outcome_type`, `mechanism`, `source_specific_data` (free-form dict).
  - `status` enum: Open, Closed, Resolved, Suspended.
  - `outcome_type` enum: Binary, MultipleChoice, Numeric (so categorical and scalar venues like Manifold can be represented).
  - `mechanism` is a free string ("CPMM, CLOB" given as examples).
  - **No** volume, open-interest, liquidity, close/expiry time, category/tag, resolution source, winning outcome, or native venue token/condition id as first-class fields. Venue-specific extras go in `source_specific_data` (documented example only shows `market_slug`).
- **Outcome tokenisation (FinFeed's convention):** a binary market is two separate ids with suffixes, e.g. `WILL-TRUMP-SELL-10K-25K-GOLD-CARDS-IN-2025_YES` and `..._NO` (H, OpenAPI example; FAQ "Binary markets have separate IDs for each outcome", H via fetch tool). Ids are upper-case hyphenated slugs and are described as unique and immutable (M, docs page example `PM_BTC_2024`). Kalshi ids look like `KALSHI-<TICKER>_YES` (M, data-samples page).
- **Caution on the documented example:** the OpenAPI example for POLYMARKET shows `"mechanism": "CPMM"` with `price` 0.1234. Polymarket's main venue is a CLOB, so this example is illustrative and must not be used to infer mechanism (M, my inference; the example is H as text).
- Underlying venue mechanics (from FinFeed's own blog, M, vendor marketing): Polymarket = CLOB on Polygon with UMA oracle; Kalshi = CFTC-regulated CLOB; Manifold = play-money AMM + limit orders with creator resolution; Myriad = BNB Smart Chain, order books + AMM, plus perpetual sentiment markets; Hyperliquid = HIP-4 outcome contracts on HyperCore, fully collateralised (https://www.finfeedapi.com/blog/what-prediction-market-exchanges-does-finfeedapi-integrate-with). Pascal is described in the OpenAPI example list as "A noncustodial prediction market exchange on Solana" (H).

## 3. Chains and collateral

N/A for FinFeedAPI itself (HTTP API; no chain, no token, no collateral). Billing is in "Usage Credits" in USD, roughly 1 UC = 1 USD on pay-as-you-go (H, .../pricing). I found no crypto or x402 payment option (NOT FOUND: searched llms.txt, legal page, pricing page, FAQ, auth.md for x402/USDC-as-payment; the only USDC mentions are about venues). Upstream chains: Polygon (Polymarket), BNB Smart Chain (Myriad), Solana (Pascal), HyperCore (Hyperliquid), fiat/regulated (Kalshi, ForecastEx, Gemini, Crypto.com).

---

## 4. Read API

- **exists:** official-authenticated (key required for every endpoint; only the OpenAPI document is public). Tag H.
- **Docs:** https://www.finfeedapi.com/products/prediction-markets-api/docs ; public OpenAPI `https://api.prediction-markets.finfeedapi.com/swagger/v1/swagger.json` ; FAQ https://www.finfeedapi.com/products/prediction-markets-api/faq ; data samples https://www.finfeedapi.com/products/prediction-markets-api/data-samples ; agent index https://www.finfeedapi.com/llms.txt (all H).
- **Base URLs (H):** REST/JSON-RPC `https://api.prediction-markets.finfeedapi.com` ; hosted MCP `https://api.prediction-markets.finfeedapi.com/mcp` (MCP key header `X-APIKey`; https://www.finfeedapi.com/auth.md). Flat files have a separate MCP/S3 host `mcp.flatfiles.finfeedapi.com` (H, auth.md). `GET /` returns HTTP 400 "This is the base URL of the API" (H).
- **Auth (H, 401 body + auth.md + OpenAPI):** key accepted as query `apikey=`, headers `X-CoinAPI-Key`, `X-APIBricks-Key`, `X-APIKey`, `Authorization: <key>`, URL path `/apikey-<KEY>/`, HTTP Basic (user `finfeedapi`), or optional JWT `Authorization: Bearer`. Keys are created in the console `console.apibricks.io`; extra keys beyond plan quota cost 1 USD/day (FAQ, H via fetch tool). I did not create a key.
- **Key endpoints (all GET, H, OpenAPI paths + params; summary fixture `openapi-endpoints-summary.json`):**
  - Exchanges: `/v1/exchanges`, `/v1/exchanges/{exchange_id}`.
  - Markets: `/v1/markets/{exchange_id}/active` (market-id list; `limit` 1-10000, `page`), `/v1/markets/{exchange_id}/history` (full records incl. Closed/Resolved; cursor pagination, `limit` 1-10000, `cursor` from `next_cursor`), `/v1/markets/{exchange_id}/{market_id}` (single market record).
  - Prices / trades: `/v1/activity/{exchange_id}/{market_id}/current` (latest trade + latest quote), `/latest` (recent trades + quotes, `limit` 1-10000), `/history/trades`, `/history/quotes`, `/history/ohlcv` (flat-file backed; `date` or `time_start`/`time_end`; ohlcv `period` one of 1SEC, 1MIN, 1HRS).
  - Order book: `/v1/orderbook/{exchange_id}/{market_id}/current` (snapshot with `asks`, `bids`, `time_exchange`, `time_coinapi`), `/v1/orderbook/{exchange_id}/{market_id}/history` (raw limit-order updates from flat files, not reconstructed snapshots).
  - OHLCV time series: `/v1/ohlcv/periods`, `/v1/ohlcv/{exchange_id}/history`, `/v1/ohlcv/{exchange_id}/{market_id}/history`, `/v1/ohlcv/{exchange_id}/{market_id}/latest` (`period_id`, `time_start`, `time_end`, `limit` up to 100000). FAQ says periods run 1SEC to 5YRS.
  - Resolution: no dedicated endpoint. Only `status` on the market record ("closed does not necessarily mean resolved"; "resolved records where supported"; settlement fields vary by exchange, M via vendor blog fetch). NOT FOUND (searched: OpenAPI schemas, FAQ, comparison blog): a winning-outcome / settlement-value field.
- **Response shapes (H for schema, no live sample):** trade `{id, market_id, price, quantity, timestamp, outcome, side: Buy|Sell}`; quote `{entry_time, recv_time, ask, bid, ask_volume, bid_volume}`; order-book level `{price, size}`; OHLCV `{time_period_start, time_period_end, time_open, time_close, price_open, price_high, price_low, price_close, volume_traded, trades_count}`; MarketsPage `{data: [...], next_cursor}`. Prices appear to be 0-1 probabilities (documented samples such as 0.356, 0.99; M via data-samples page). The Kalshi OHLCV sample on the data-samples page shows values like 4.5 and 3.5, scale unexplained: verify before relying on Kalshi prices (M). Numbers carry up to 19 digits with 9 decimals; times are ISO 8601 UTC (H docs page via fetch tool). Output can be JSON or MessagePack (M, launch blog).
- **Rate limits (H via fetch tool, FAQ + pricing):** daily request budgets by plan on a rolling 24-hour window; hard-limit plans get HTTP 429 until the window resets, soft-limit plans may overage. Default 100 items per response counts as one request; with `limit`, every 100 items counts as one request credit, rounded up. NOT FOUND (searched: pricing, FAQ, docs): per-second or concurrency limits, and the actual daily cap per plan.
- **Websocket:** none for prediction markets. The docs page lists REST, JSON-RPC, MCP only; FinFeed's own comparison blog says its data should "not be confused with a native WebSocket streaming feed" and lists "no WebSocket" for itself, while Polymarket/Kalshi/Prediction.com have it (H/M via fetch tool). The generic llms.txt tagline mentions WebSocket feeds, but that is the currencies/SEC products. So **poll only**; data is request-response snapshots, no latency figure published.
- **Unauthenticated sample status:** a public GET of any data endpoint returns 401, so I could not capture a real market/book payload. Fixtures are the public OpenAPI document's own examples plus the live 401 body (section 12). The shapes in this section are therefore schema-level (H) not payload-level.

---

## 5. Trade path

**None.** Data only. No order placement, cancel, balances, signing or settlement endpoints in the OpenAPI document (H: the 16 paths are all GET reads), none on the pricing page, and the third-party article says "no trade execution" (M). Trading must go to each venue directly (or via a different aggregator that executes, e.g. the open-source pmxt per the same article, M, not evaluated here).

## 6. Reachable through PayBox?

**No.** There is nothing to sign or send: no on-chain contract, no signed-order flow, no wallet. Reading it needs a human-created API key paid through the vendor's console and invoiced under the Customer Agreement; no x402 (HTTP 402) flow was found, so PayBox `pay_x402`/`use_service` cannot pay for calls (NOT FOUND, see section 3). A PayBox plugin could only consume it with a user-supplied key. This is a read/signal feed, not a venue leg.

## 7. Fees

- **Trading fees:** none (no trading).
- **API cost (H via fetch tool, https://www.finfeedapi.com/products/prediction-markets-api/pricing, page undated):**

| Plan | Monthly | Credit price | Per 1K requests: first 1,000/day / beyond |
|---|---|---|---|
| Pay As You Go | usage | $1 / credit | $5 / $1 |
| Committed 64 | $64 | $0.85 | $4.25 / $0.85 |
| Committed 256 | $256 | $0.75 | $3.75 / $0.75 |
| Committed 512 | $512 | $0.70 | $3.50 / $0.70 |
| Committed 1024 | $1,024 | $0.65 | $3.25 / $0.65 |
| Enterprise | custom | custom | custom |

  $25 of non-expiring free credits for qualified organisations; 99.9% uptime SLA only on Committed 1024; latency SLA only on Enterprise; fees non-refundable. The interexy article says pricing is "enterprise/custom" (M, early-2026), which the official page contradicts: treat the article as stale.
- **Scanner cost estimate (M, my arithmetic from the table):** polling one book per second continuously = 86,400 requests/day = 1,000 x $5/1K + 85,400 x $1/1K, about **$90/day on pay-as-you-go** (about $2,700/month), before the `limit` multiplier. Polling hundreds of markets across venues would cost far more than the free native APIs.

## 8. Resolution mechanism and dispute risk

FinFeedAPI resolves nothing. It relays upstream status, and its docs warn that settlement fields and history depth vary per exchange (M via vendor blog). Resolution and dispute risk is that of each upstream venue (Polymarket UMA, Kalshi rulebook, Manifold creator-resolved, etc.; see those venue specs). **Data risk specific to FinFeed:** (a) no winner field, so resolution outcome must come from the venue; (b) separate `_YES`/`_NO` ids and `Suspended`/`Closed` states can lag; (c) the vendor's own blog warns similar questions on different platforms "may not be equivalent" and ships no matching, so any cross-venue equivalence check is on us.

## 9. Geo / ToS / automation

- No geo-block on the API was found (NOT FOUND: searched FAQ, legal page). FAQ: VPNs are not blocked (H via fetch tool). Venue geo rules apply only to trading, which FinFeed does not do.
- **Customer Agreement** (https://www.finfeedapi.com/legal, effective 2025-08-18, so about 14 months old, possibly stale; English law, London courts; H): access right is "non-exclusive, non-transferable, revocable ... for your internal business purposes only" (s1.2). Acceptable Usage Policy lists as not "Legitimate Use": "Re-selling our Services or parts thereof to another party" and "Unusual usage patterns inconsistent with ... normal use". Section 2.3: customer "solely responsible for any use of the external Data Sources which may be subject to restrictions of use and require additional license agreements with the third party" (i.e. upstream venue data licences are the customer's problem). Access may be suspended or terminated without notice for abnormal usage.
- **Implication for the project (M, my reading, not legal advice):** a PayBox/XO plugin that proxies FinFeed data to many end users risks the no-resale / internal-use clauses. If used at all, each user should bring their own key, or the data should stay internal to the aggregation service as a backtesting input.
- Automation itself (bots, scripts, MCP agents) is the intended use: the vendor ships an MCP server, SDKs and agent-directed files.

## 10. Liquidity

FinFeedAPI has none: it is a data vendor (volume/OI/TVL not applicable). No usage or customer-count figure was published that I could find. The only size signals are SDK repo stars (533, GitHub 2026-10-19) and vendor-claimed coverage of nine venues. Upstream venue liquidity belongs in the venue specs.

## 11. Event-category overlap and independence

- Categories are not tagged in the API (no category/tag field). Overlap is whatever the upstream venues carry: Polymarket, Kalshi, ForecastEx, Gemini PM and Crypto.com PM all list sports, politics, macro/economics and crypto-price contracts that overlap each other and our target venues (M, from FinFeed blog descriptions of Polymarket/Kalshi; Gemini/Crypto.com/ForecastEx category detail NOT FOUND, not read).
- **Not an independent arbitrage leg.** FinFeedAPI shares 100% of its liquidity with the upstream venues it mirrors (it carries no liquidity of its own), so it can never be a leg. It is at most a read path onto Polymarket, Kalshi, Myriad, Manifold, Hyperliquid HIP-4, Pascal, Gemini PM, Crypto.com PM and ForecastEx, none of which has a documented FinFeed-side execution route.
- Marginal value over native APIs: (1) one auth and schema for nine venues including long-tail ones (Pascal, HIP-4, ForecastEx, Gemini, Crypto.com) whose native APIs we have not integrated; (2) historical flat files for backtests ("Flat Files API", GZIP CSV via S3-compatible storage, Snowflake: H homepage). Against: paid per request, no websocket, thin market object, no volume/close-time, one more vendor dependency.

---

## 12. Fixtures

All in `docs/research/fixtures/finfeedapi/`:
- `unauth-401.json` - **live** unauthenticated response body for data endpoints (2026-10-19).
- `openapi-endpoints-summary.json` - derived: the 16 GET paths with parameters, security schemes (APIKey `Authorization` header, JWT bearer), schema names.
- `openapi-schemas-excerpt.json` - derived: schema definitions for market, trade, quote, order book, OHLCV, exchange.
- `openapi-documented-examples.json` - the exchange list (9 ids) and one market record exactly as given as documentation examples in the public OpenAPI document. **Not live data**; values such as `price: 0.1234` and `mechanism: CPMM` are illustrative.

## 13. Open questions

1. Real payload shapes for `/v1/markets/{exchange_id}/active`, `/history` and `/orderbook/.../current` (needs a key; not created per the read-only rules).
2. Whether the live `/v1/exchanges` list matches the nine ids in the OpenAPI example, and how many markets per venue are covered.
3. Price scale for Kalshi OHLCV (the sample shows 4.5 and 3.5) and for Manifold/Myriad AMM markets.
4. Whether `source_specific_data` exposes native keys (Polymarket conditionId/token ids, Kalshi ticker, close times) that would make market linking feasible. If not, FinFeed cannot join with other venues without title matching.
5. Daily request caps per plan, per-second limits, and whether the free $25 credit requires a "qualified organisation" check.
6. Historical depth and update cadence per venue (not published).
7. Whether any upstream venue's licence terms (s2.3) restrict our intended use of redistributed FinFeed data.

## 14. Sources

- Homepage (venue list, product list, free credits): https://www.finfeedapi.com (H, fetch tool summary)
- Prediction Markets product page, MCP tool names, auth header, 9 venues: https://www.finfeedapi.com/products/prediction-markets-api (H, fetch tool summary)
- Docs overview (interfaces, SDKs, conventions; websocket not mentioned): https://www.finfeedapi.com/products/prediction-markets-api/docs (H, fetch tool summary)
- FAQ (rate-limit accounting, 429, `_yes/_no` ids, `/active`, `/history`, VPN, SLAs): https://www.finfeedapi.com/products/prediction-markets-api/faq (H, fetch tool summary)
- Pricing (tiers, credits, SLA): https://www.finfeedapi.com/products/prediction-markets-api/pricing (H, fetch tool summary; page undated)
- Data samples (order-book/OHLCV/activity shapes): https://www.finfeedapi.com/products/prediction-markets-api/data-samples (M, fetch tool summary; Kalshi price scale unclear)
- Public OpenAPI (primary, full read): https://api.prediction-markets.finfeedapi.com/swagger/v1/swagger.json (H)
- Live 401 probes: https://api.prediction-markets.finfeedapi.com/v1/exchanges and four other paths (H, 2026-10-19)
- Agent-facing auth and skill files: https://www.finfeedapi.com/auth.md , https://www.finfeedapi.com/.well-known/agent-skills/finfeedapi-market-data/SKILL.md , https://www.finfeedapi.com/.well-known/ai-catalog.json , https://www.finfeedapi.com/llms.txt , https://www.finfeedapi.com/robots.txt (H)
- Legal (Customer Agreement, AUP, SLA; effective 2025-08-18): https://www.finfeedapi.com/legal (H, read from page text)
- Blog: https://www.finfeedapi.com/blog/introducing-prediction-markets-api (2025-10-13, stale), .../prediction-markets-api-expends-with-gemini-pascal-and-crypto-com (2026-08-21), .../forecastex-prediction-markets-data-is-now-live-on-finfeedapi (2026-08-28), .../best-prediction-market-apis-for-data-coverage-history-and-resolution-data-compared (2026-10-13), .../raw-vs-normalized-prediction-market-data (2026-10-15), .../what-prediction-market-exchanges-does-finfeedapi-integrate-with (undated). Vendor marketing, M.
- SDK repo metadata: `gh api repos/api-bricks/api-bricks-sdk` (H, 2026-10-19; contents not read)
- Discovery evidence (secondary, early 2026, partly stale): https://interexy.com/how-to-integrate-prediction-market-aggregators (M)
- Prior project notes: `docs/research/10-aggregation-landscape.md` (1.8) and `docs/research/14-platform-of-platforms.md` (section 5), which had not read FinFeedAPI first-hand.
