# Bravado Trade (bravadotrade.com)

Researched 2026-10-19. Read-only: public docs and unauthenticated GETs only. WebSearch budget was exhausted in the session, so no independent third-party sources were found (volume, funding, press are NOT FOUND).

## Verdict

- Kind: execution and data middleware over Polymarket and Predict.fun. It is NOT a venue and has no markets, liquidity or oracle of its own. [H]
- Adapter priority: P2 (signal-only), see "Priority" below.
- Still live: yes. Docs reachable, `GET /v2/trade/healthz` returned `{"ok":true,"ts":"2026-10-19T05:05:44.838Z"}` on 2026-10-19; changelog has an entry dated 2026-08-08. [H]

## Kind and market model

- "Infrastructure layer for prediction markets": Data API + WebSockets, Trade API, UMA API, Copytrade API, Combos API, MCP server, tax/PnL analytics. [H] https://bravadotrade.com , https://docs.bravadotrade.com/introduction.md
- Supported venues: Polymarket (all products) and Predict.fun (Trade API LIMIT/MARKET/TWAP/ICEBERG, order-book WS, Trader Data; no copytrade, no combos, no trade tape; "limited availability", per-partner entitlement `VENUE_NOT_ENABLED`). [H] https://docs.bravadotrade.com/markets/overview.md , https://docs.bravadotrade.com/markets/predict-fun/overview.md
- Market model is inherited: off-chain CLOB, on-chain settlement, ERC-1155 conditional tokens, binary and neg-risk multi-outcome, prices are decimal probabilities as strings (Polymarket 0.001-0.999, tick 0.001; Predict.fun tick 0.01). Outcome token id is the `symbol`. [H] https://docs.bravadotrade.com/markets/polymarket/overview.md
- Combos API: multi-leg RFQ parlays (2-10 Polymarket markets) in one on-chain position. Not a native Polymarket feature; priced by RFQ (counterparty not identified in docs read). [H] https://docs.bravadotrade.com/markets/polymarket/combos-api.md (listed in llms.txt; summary only read)

## Chains and collateral

- Polymarket: Polygon, collateral "pUSD" (docs also say USDC in places; API uses pUSD). [H] https://docs.bravadotrade.com/markets/overview.md
- Predict.fun: BNB Chain, USDT (BEP20). [H] https://docs.bravadotrade.com/markets/predict-fun/overview.md
- No other venues or chains. Bravado's own chain: none.

## Read API

- Docs: https://docs.bravadotrade.com ; machine index https://docs.bravadotrade.com/llms.txt (all pages also served as `.md`); OpenAPI 3.0.3 at `https://partner-api.bravadotrade.com/v2/trade/openapi.json` (public, 209KB, version 2.0). [H]
- Base URLs: `https://partner-api.bravadotrade.com` (Data/analytics root and `/v2/trade/*`); `wss://partner-api.bravadotrade.com/stream/{polymarket|predictfun}/partner` (authenticated order books, op `sub` with `book:<tokenId>`); `wss://partner-api.bravadotrade.com/stream/polymarket/partner/trades` (all Polymarket fills, ~20-50 trades/s); `wss://stream.bravadotrade.com/ws` (partner-tier mempool fills, ~1-2s ahead of Polymarket RTDS, Polymarket only, feed token via onboarding); UMA REST + `/uma/ws` (Polymarket only, "contact us for access"); MCP at `https://mcp.bravadotrade.com` (OAuth 2.1, read-only). [H] https://docs.bravadotrade.com/api/market-data/venue-order-books.md , .../mempool-feed.md , .../trade-feed.md , https://docs.bravadotrade.com/products/uma-api.md
- Key REST endpoints: `/trader-analytics/traders/{address}/{trades,pnl,positions,...}`, `/trader-analytics/leaderboard`, `/trader-analytics/predict/...` (Predict.fun); `/clob-proxy/prices-history?market={tokenId}&startTs&fidelity`, `/clob-proxy/volume-history?market={tokenId}`, `/clob-proxy/holders?market={conditionId}` (venue-sourced, sampled). [H] https://docs.bravadotrade.com/api/market-data/historical-data.md
- There is NO unified market catalog or market-metadata endpoint ("no documented unified catalog endpoint"; use the venue's own API for discovery). No resolution/market-status REST for Predict.fun. [H] same page. This is the main limit for an aggregator: Bravado offers books and trades keyed by token id, but market discovery, titles and cross-venue linking still need Polymarket Gamma/CLOB and Predict.fun APIs directly.
- Auth: HMAC-SHA256 on every request. Headers `X-BRAVADO-API-KEY`, `X-BRAVADO-TIMESTAMP` (ms), `X-BRAVADO-SIGNATURE` over `timestamp\nMETHOD\ncanonical_path_with_query\nsha256(body)`. Scopes: trade.read, trade.execute, trade.cancel, trade.withdraw, trade.combos, trade.users, stream.read, analytics.read, mcp.read, mcp.query. Creating keys needs a Console account (not done). [H] https://docs.bravadotrade.com/authentication.md
- Only unauthenticated things found: `/v2/trade/healthz`, `/v2/trade/openapi.json`, and `/clob-proxy/*` (returned 200 for a dummy token). `/trader-analytics/leaderboard` returned 401 `MISSING_AUTH_HEADERS`. A public `/market` WS route is mentioned as free (no credits) but its URL/contract is "legacy Terminal access" and not documented in pages read. [H]
- Rate limits: per API key, `rate_limit_per_min` returned by `GET /v2/trade/account`; 429 with `Retry-After`. Plan table (pricing page, garbled, M): Free 5,000 credits/month; 100k credits at 30 req/s; 1M credits at 150 req/s; 5M credits at 400 req/s; overage $8 or $3 per 10k credits; WebSockets require a paid plan. Credits: Data API 1/request, MCP 10/request, Trade API 0, authenticated WS 1 credit per 100 KB. [H/M] https://bravadotrade.com/pricing , https://docs.bravadotrade.com/api-credits.md
- Latency claim: hint said "2-5s ahead of on-chain confirmation". Docs say ~1-2s (median ~1.5-2s) ahead of Polymarket's own RTDS feed using the Polygon public mempool; UMA proposals ~0.3-1.4s before mined. Fills carry pending/settled/reverted lifecycle, so pending fills can revert. Polymarket only. [H]

Fixtures: `docs/research/fixtures/bravado-trade/trade-healthz.json`, `trade-openapi-summary.json` (path list + POST /v2/trade/order request schema, trimmed from the 209KB spec), `clob-proxy-volume-history-empty.json` (shape only, dummy token), `analytics-leaderboard-401.json` (auth error shape).

## Trade path

- `POST /v2/trade/order` (optional `"venue":"predictfun"`, default polymarket), `/order/batch`, cancel single/batch/all, positions redeem/split/merge, `/withdraw`, managed strategies (TWAP, ICEBERG, PEGGED, STOP_LOSS, TAKE_PROFIT, TRAILING_STOP), `/quote`, copytrade, combos. Idempotency-Key required on writes. [H] OpenAPI above; https://docs.bravadotrade.com/products/trade-api.md
- Custody model: the order is placed with an HMAC API key, not a user-signed order. `POST /v2/trade/users` "Creates a Privy embedded wallet, deploys the Polymarket Safe via the Bravado relayer, issues CLOB credentials, and binds the user to the calling integration". Collateral sits in a Bravado-provisioned deposit wallet (Polygon Safe); on Predict.fun the user's own EOA on BNB. Whether the user can export the Privy key is NOT FOUND (searched: openapi, trade-api, withdraw docs). Terms do not state a custody model. [H] openapi; https://bravadotrade.com/legal/terms
- PayBox reachability: partial. A PayBox EVM wallet can only fund the Bravado deposit wallet (ERC20 transfer of pUSD on Polygon, or USDT on BNB) and later receive withdrawals via `trade.withdraw`; it cannot sign the orders, since signing is done server-side with Bravado/Privy keys. So it is an HMAC-credential integration (API secret must be stored outside PayBox, e.g. `request_secret`-style) plus transfers, not a transaction-proposal or signed-order flow. For direct signed orders, integrate Polymarket / Predict.fun natively (covered by the other workflow). [M, inferred from the above]
- Access gating: Predict.fun requires a partner entitlement; withdraw needs a separately granted scope; trade scopes depend on "organisation's enabled access". Real access probably needs contact with Bravado. [H]

## Fees

- Trade API: 10 bps (0.10%) per side, maker and taker, collected via Bravado builder codes applied automatically (`builder_code_used` on the order response). On top of venue fees: Polymarket trading fee listed as 0 in Bravado's table (M: verify against Polymarket docs, which may have introduced fees since), Predict.fun `feeRateBps` market-set (commonly 200 = 2%) taken in shares on buys. Plan subscription fees apply for Data/WS (Free tier then paid; prices not legible). [H] https://docs.bravadotrade.com/products/trade-api.md , https://docs.bravadotrade.com/markets/predict-fun/overview.md

## Resolution

- Inherited. Polymarket via UMA Optimistic Oracle V2 (proposal, dispute, settle; a concluded event is not immediately redeemable). Predict.fun mechanism: NOT FOUND in Bravado docs ("other venues may resolve differently"). Bravado's UMA API exposes proposal/dispute stage data for Polymarket, which is useful as a dispute-risk signal. [H] https://docs.bravadotrade.com/products/uma-api.md , https://docs.bravadotrade.com/markets/overview.md

## Geo / ToS / automation

- Terms do not list prohibited countries; eligibility follows "any connected venue" (so Polymarket geo rules apply); "Do not bypass location or other access restrictions"; do not split requests across accounts to evade limits; automation (copy trading, scheduled strategies) allowed with authorisation; MCP is read-only. [H] https://bravadotrade.com/legal/terms
- Automation is the product, so an agent adapter is permitted by design subject to plan limits.

## Liquidity

- None of its own. Volume, OI and TVL for Bravado: NOT FOUND (searched: homepage, docs, pricing; web search unavailable). Docs call Polymarket "the largest prediction market by volume" (no figure). [H]
- Shares liquidity with: Polymarket (all of it) and Predict.fun (all of it). NOT an independent arbitrage leg.

## Event coverage (overlap)

- Whatever Polymarket and Predict.fun list (sports, politics, crypto price incl. 5m/15m BTC markets, macro). No venue-specific events. Overlap with other venues is exactly Polymarket's and Predict.fun's overlap. [H/M]

## Priority

P2 (signal-only), with a possible narrow upgrade. Reasons:
- Not an independent venue; the aggregator already needs native Polymarket and Predict.fun adapters, which give the same books and fills without a paid HMAC intermediary and 0.10% extra fee.
- No market catalog, so it does not help with cross-venue market linking.
- Custodial-style (Privy/Bravado relayer) execution does not fit PayBox's non-custodial signing model.
- Genuinely useful signals if ever wanted: mempool fills (~1-2s early, partner tier only), UMA proposal/dispute stream (resolution-risk filter), wallet PnL/whale tracking, and a historical L2 dataset service (custom). These can feed the Quotient-style signal layer, but need paid access or onboarding.
- Do not treat as a competing aggregator to copy: it covers 2 venues and is Polymarket-centric.

## Suspicious content

- None observed that targeted AI agents. Docs explicitly offer an llms.txt and an MCP server for "Build with AI" (normal for Mintlify). The docs include a support mailto; ignored. A page claimed a GitHub repo `github.com/bravado` for release notes (looks like a generic template; not verified, not followed).

## Open questions

- Can the Privy embedded wallet be exported or is the user wallet bring-your-own via the master/user key flow?
- Predict.fun resolution mechanism and Bravado's actual Predict.fun feature parity.
- Exact plan prices (pricing page text garbled).
- Public `/market` WS URL and message shape.
- Whether the Combos RFQ counterparty is Polymarket-native or Bravado.

## Sources

- https://bravadotrade.com (homepage, H)
- https://bravadotrade.com/pricing (garbled, M)
- https://bravadotrade.com/legal/terms (H, summarised by fetch tool)
- https://docs.bravadotrade.com/llms.txt (H)
- https://docs.bravadotrade.com/markets/overview.md, /markets/polymarket/overview.md, /markets/predict-fun/overview.md (H)
- https://docs.bravadotrade.com/authentication.md, /api-credits.md, /reference/rate-limits.md, /reference/changelog.md, /reference/status.md (H)
- https://docs.bravadotrade.com/products/trade-api.md, /api/trade/withdraw.md, /products/uma-api.md (H)
- https://docs.bravadotrade.com/api/market-data/{venue-order-books,mempool-feed,trade-feed,historical-data}.md (H)
- https://partner-api.bravadotrade.com/v2/trade/openapi.json and /v2/trade/healthz (H, fetched 2026-10-19)
