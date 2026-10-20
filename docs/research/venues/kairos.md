# Kairos (kairos.trade) - venue spec

Researched 2026-10-19 (server clocks ~02:55-03:15 UTC). Read-only: public unauthenticated GETs, doc reads, `gh api` raw reads. No account, key, wallet, signing, POST/PUT/DELETE. Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- **Live: yes** (H). All four API hosts answered on 2026-10-19; the matched-pair catalog fingerprint was timestamped 2026-10-19 02:55:56 UTC; the SDK repo was pushed 2026-10-17; the Illinois monitor published a report dated 2026-10-18. The docs changelog's newest entry is 2026-07-03 (about 3.5 months old; treat the changelog as stale, the services are not).
- **What it is: not a venue.** Kairos is a trading terminal plus an aggregation/execution layer over Kalshi, Polymarket, Predict.fun and Hyperliquid (HIP-4 outcome markets). It has no order book, markets or liquidity of its own, so it is **never an independent arbitrage leg**. Every leg settles on one of the four underlying venues.
- **What is useful to us:** (1) a free public **cross-venue matched-pair catalog** (13,365 live pairs today), (2) a free public **normalized market-data API** (`md.kairos.trade`: markets, candles, trades, marks, resolution lifecycle), (3) an optional execution path (managed wallets, external self-signing, or the partner "wallet API") that could be driven by a PayBox EVM wallet, with caveats below.
- **Adapter priority: P2** (signal-only / cross-check). Reasons in the last section.

## 1. Kind and market model

- Kind: aggregator + data provider + execution router + terminal (H, https://docs.kairos.trade/introduction.md , https://kairos.trade/enterprise-api).
- Markets are the underlying venues' markets, normalized (H, https://docs.kairos.trade/concepts/markets.md): market -> outcomes -> contracts; binary (YES/NO) and multi-outcome (one independent token/book per outcome). Prices on `md.kairos.trade` and most Data API routes are on a **0-100 scale**; order entry is 0-1 (H, market-data/overview.md; SDK README).
- Per-venue book shape (H, https://docs.kairos.trade/websocket/market-data-websocket.md):

| Provider slug | Numeric id | Book | Notes |
|---|---|---|---|
| `polymarket` | 2 | CLOB, one independent book per outcome token | CTF ERC-1155 outcome tokens; neg-risk markets exist (`neg_risk` field) |
| `kalshi` | 1 | one merged venue book, outcomes derived | tick grid is algorithmic (finer at tails) |
| `predictfun` | 8 | CLOB, one independent book per outcome token | |
| `hyperliquid` | 9 | two outcomes, one book per side coin | HIP-4 outcome markets |

- Also seen in the OpenAPI provider enum: `opinion`, `dome`, `kalshi_offchain` ("deprecated alias of `kalshi`") (H, https://app.kairos.trade/openapi/data-api.yaml). Opinion is **not** among the four documented public venues; no Opinion pairs appeared in the catalog (H, walk below).
- Other Kairos-native constructs (all authenticated): **Synthetic Books** (weighted multi-market packages, WS provider `synthetic`), cross-venue **routed orders** (same-side buy split across two linked markets for depth, not a hedge), Polymarket **combos/parlays** via RFQ (H, docs index https://docs.kairos.trade/llms.txt).

## 2. Chains and collateral

| Venue | Chain | Collateral | Source |
|---|---|---|---|
| Polymarket | Polygon (137) | pUSD (USDC-backed), also USDC/USDC.e seen in balance endpoints | H, concepts/venues.md, concepts/wallets.md |
| Predict.fun | BNB Chain (56) | USDT on BSC per wallet docs; concepts/venues.md says "USDC" (docs disagree) | H (conflict), wallets/trade.md vs concepts/venues.md |
| Hyperliquid | Hyperliquid L1 (deposits via Arbitrum per Data API note) | USDC (spot) | H, wallets/trade.md; M for Arbitrum |
| Kalshi | off-chain USD per concepts/venues.md; `GET /providers/configs` lists `chain_name: "Solana"`, order types `["market"]` only | USD | H (conflict, see section 11) |

## 3. Read API

### 3.1 Hosts and docs
- Docs (Mintlify, official): https://docs.kairos.trade ; machine index https://docs.kairos.trade/llms.txt ; OpenAPI 3.1: https://app.kairos.trade/openapi/{market-data-api,data-api,execution}.yaml and combined `kairos.json` (H).
- `https://md.kairos.trade` Market Data API, 15 endpoints, **public, no key, "beta"** (H, https://docs.kairos.trade/market-data/overview.md).
- `https://data.kairos.trade` Data API, 68 endpoints; a subset marked `public` (matched-markets, market-clusters, market-links, sports feeds, providers/configs, trader-stats), the rest need the API-key triple; two routes are first-party-session only (`/arb-bets/`, `/markets/equity/snapshot`) (H, data-api.yaml `x-kairos-auth`).
- `https://execution.kairos.trade` Execution API, 59 endpoints, authenticated except `/health`; regional executors `eu-west-1-polymarket.executor.kairos.trade` and `ap-northeast-1-predictfun.executor.kairos.trade` (H, execution.yaml servers).
- `wss://stream.kairos.trade` market-data stream (binary protobuf). `https://rpc.kairos.trade` tRPC-style RPC (positions, allowances, geo check) (H, concepts/wallets.md).
- Staging hosts are listed in the OpenAPI servers (`staging-data`, `staging-md`, `staging-execution.kairos.trade`); I probed `staging-data/providers/configs` and `staging-md/health` and both answered 200 (H); `staging-execution` not probed. Whether they are a funded test sandbox is NOT documented.

### 3.2 Key endpoints for an aggregator
Public, no key (H unless noted):
- `GET md/v1/markets?provider=&limit=&cursor=` enumerate; `GET md/v1/markets/{provider}/{market_id}` metadata (includes outcomes with `token_id`, `tick_size`, `neg_risk`, `fee_schedule`, `status`); `POST md/v1/markets/batch` and `POST md/v1/market-identifiers/resolve` (POST reads, not exercised).
- `GET md/v1/marks?provider=&pairs=contract_id:token_id,...` = **last trade price only**, not bid/ask (up to 200 pairs).
- `GET md/v1/candles`, `POST md/v1/candles/batch`, `GET md/v1/trades`, `GET md/v1/trades/metrics` (24h volume USD, outcome shares, trade count).
- `GET md/v1/resolutions` (batch resolved fraction, up to 200), `GET md/v1/markets/{provider}/{id}/resolution` and `/resolution/events` (UMA-style proposed/disputed/resolved timeline for Polymarket; payout numerators).
- `GET md/v1/markets/tick-size` (price grid; Kalshi grids vary).
- `GET data/matched-markets` (catalog; cursor or offset paging; `limit` 1-1000; `provider`, `min_similarity` clamped >= 0.82), `GET data/matched-markets/enriched` (adds identifiers, outcomes, `pricing.price` reference price; `limit` <= 150), `GET data/market-clusters?markets=<provider_id>:<market_id>,...&floor=exact|semantic`, `GET data/market-links/featured` and `/lookup` (approved links with a union book), `GET data/search/simple` (adds a `correlations` map), `GET data/providers/configs`, sports feeds such as `GET data/sports/poly-kalshi-pairings` (H, https://docs.kairos.trade/rest/matched-markets.md).
- **No REST order-book endpoint exists** in any of the three OpenAPI specs (searched all path lists, H). Depth comes only from the WebSocket `orderbook` topic, or from authenticated `GET execution/orders/fee-quote` and `/orders/route-quote`.

Authenticated: `POST data/markets/batch-prices` (current price/volume/liquidity, 300 refs), search, discover, candles/trades on the Data API, trader PnL, and on the WebSocket the `arb` topic (cross-venue match and spread batches, protobuf tags 0x0D/0x0E) which is "denied on the anonymous tier unless an operator opts in" (H, websocket/market-data-websocket.md).

### 3.3 Auth and limits (H)
- Programmatic auth: three headers `X-Client-Id: kairos_ck_...`, `X-Api-Key`, `X-Api-Secret`; scopes `trade:read`, `trade:execute`, `position:read`. Sending only some headers returns 401 (no silent fallback to anonymous). Optional per-key IP whitelist (403 `ip_not_whitelisted`). Keys are created in the app UI after email signup (https://docs.kairos.trade/authentication.md); the Market Data page says keys are "issued by the Kairos team during the beta" (conflict, minor).
- Anonymous `md` tier: `light` 120 units/min, `heavy` 20 units/min per source IP; API key: 1,200 and 150. "The anonymous tier is a courtesy, not a contract. Kairos can switch it off at runtime" (H, market-data/authentication.md).
- Data API: docs say `matched-markets` 60/min. **Observed** `x-ratelimit-limit: 30` on anonymous calls to `/matched-markets` and `/matched-markets/enriched`, and 100 on `/market-links/featured` (H, response headers 2026-10-19). Plan for 30/min anonymous.
- WebSocket: anonymous public tier via `Sec-WebSocket-Protocol: kairos.marketdata.public.v1` (limits: 3 markets per connection, 2 connections per IP, 1-hour lifetime, 10 control frames/s). I confirmed the handshake returns **101 Switching Protocols** with that subprotocol (H, curl upgrade request 2026-10-19). Authenticated: 100 connections/user, 100 subscriptions/connection. Protobuf schema: https://docs.kairos.trade/websocket/protobuf-reference.md (not decoded here).
- Enterprise: "Execution is 5 orders/sec per user, raisable per key; market data 100-500 req/min per route; pricing quoted, not published" (H, https://kairos.trade/enterprise-api).

### 3.4 Live response shapes confirmed (fixtures in `docs/research/fixtures/kairos/`)
- `md_v1_markets_polymarket_limit3.json`: `{count, exchange_id, has_more, next_cursor, markets[]}`; market keys include `market_id`, `condition_id`, `title`, `status`, `neg_risk`, `tick_size`, `fee_schedule{rate, exponent, rebate_rate, taker_only}`, `fee_type`, `outcomes[{normalized_outcome, outcome, token_id}]`, plus a `raw` passthrough. No prices.
- `data_matched_markets_limit100_cursor_page1.json`: `{pairs[], count, limit, offset, has_more, next_cursor, catalog_version, total}`; each pair `{a, b, similarity, updated_at}` with `a|b = {provider_id, provider, market_id, title, ticker, image, icon, expires_at, category}`. **No outcome-orientation field and no relation type** (everything is treated as "same market"). A first page can return `count: 0` with `has_more: true` because expiry/resolution filtering happens after paging (H, observed with `limit=3` and `limit=5`).
- `md_v1_marks_sample.json`, `md_v1_trades_metrics_sample.json`, `md_v1_market_resolution_sample.json`, `data_providers_configs.json`, `data_market_links_featured_empty_2026-10-19.json` (`{links: [], nextCursor: null}` at the time), `data_matched_markets_example_pairs.json`, `derived_catalog_stats_2026-10-19.json` (derived by me, labelled as such).
- Not obtainable: `/matched-markets/enriched` returned `count: 0` for small pages and **HTTP 503** for `limit=150` and for `limit=20&offset=1000` (H, 2026-10-19); I did not retry further. Cursor walking with `limit=1000` returned **409** ("catalogue changed between cursor pages") on page 2 within about 5 seconds, so a consistent full walk is unreliable; offset mode worked (16 pages).

## 4. Trade path (programmatic)

Three lanes, all through Kairos; none is a direct-to-venue path (H, https://docs.kairos.trade/partners/integration.md):

1. **Managed wallets (default).** `POST execution/orders` with the API-key triple (`trade:execute`). Kairos signs with a managed key (Turnkey enclave in the customer's own sub-organization, exportable, Kairos "holds only a scoped, revocable signing credential" per https://kairos.trade/enterprise-api, which calls this self-custodial; https://docs.kairos.trade/concepts/wallets.md says hosted mode means "the signing authority is delegated to Kairos". Custody of the signing key is therefore a trust question, not purely non-custodial). Needs a Kairos account created by email at app.kairos.trade, venue onboarding (`POST /exchanges/{id}/enable-trading`), and for Kalshi your own Kalshi API credentials stored by Kairos. Order types GTC/GTD/FOK/FAK/IOC/post-only; batch cancel <= 100; fee quotes before orders (`GET /orders/fee-quote`).
2. **External execution lane (bring-your-own-signer).** `POST /v2/orders/intent` returns EIP-712 typed data (domain keys are snake_case on the wire and must be mapped to `chainId`/`verifyingContract`), you sign, then `POST /v2/orders/submit` (or one-round-trip over WebSocket). Polymarket live (signature type 0 EOA, or 3 = Poly1271/EIP-1271 for smart wallets); Predict.fun live for plain EOAs over REST (BSC chain 56, Tokyo node); Hyperliquid "coming soon"; on-chain ops (approvals, redeem, split/merge) self-signed on Polygon only. Auth: Kairos JWT, SIWE-minted scoped API key (`/v2/auth/siwe/*`, `personal_sign`, chain 137), or delegation grant; the SIWE doc says "a credential is only minted for an address that is already registered to a Kairos account; account creation by wallet is out of scope". Signing wallets are registered with `/v2/wallets/challenge` -> `personal_sign` -> `/v2/wallets/register` (H, https://docs.kairos.trade/external-execution/overview.md , /signing.md , /partner-auth.md). Access: the overview says open to any authenticated account; the 2026-07-03 changelog said approval-gated (docs disagree).
3. **Wallet API ("Kairos for wallets").** `POST /v3/actions` {setup | order | cancel | login} with `X-Kairos-Partner-Id` and `X-Kairos-Wallet-Api: 2`; **no Kairos account or API key per user**, only wallet signatures (`eth_signTypedData_v4`, `personal_sign`, `wallet_sendCalls`, with `eth_sendTransaction` fallbacks). Venues: Polymarket, Predict.fun, Hyperliquid (not Kalshi). Polymarket setup creates a smart "trading wallet" owned by the user's address; Predict.fun needs one batch of BNB approvals sent by the wallet plus a sign-in signature; Hyperliquid needs an `approveAgent` signature (trade-only agent) and sometimes a builder-fee approval. A **partner id must be obtained from Kairos ("Contact Kairos")** (H, https://docs.kairos.trade/wallets/overview.md , /wallets/trade.md , /wallets/reference.md). Docs list a known Polymarket issue: some standard markets reject deposit-wallet orders with "the order signer address has to be the address of the API KEY".

SDK: `@kairos.trade/sdk` (github.com/kairoslive/kairos-sdk, MIT, pushed 2026-10-17, 0 stars) (H, `gh api`). Not cloned or run.

## 5. PayBox reachability: partial

- Signing primitives needed are all EVM EIP-712 `typedData` / `personal_sign` `message` / `raw` digests, which match PayBox `request_wallet_sign` ops as recorded in `docs/research/06-paybox-platform.md` (M: that note, not re-verified today). Its chain catalog (same note, H on 2026-10-19) lists Polygon (137), BNB Smart Chain (56) and Hyperliquid (999), the three chains Kairos needs for lanes 2 and 3.
- Feasible pattern: agent-orchestrated prepare -> `request_wallet_sign` -> submit, with the `/v3/actions` or `/v2/orders/*` steps run from a plugin (hosts `data|md|execution.kairos.trade` and the regional executor hosts would need to be in the plugin's host allowlist; limit is 16 hosts per doc 06).
- Blockers / caveats: (a) lane 3 needs a **Kairos-issued partner id**; lanes 1-2 need a **Kairos account** (email signup) and, for lane 2, a registered signing wallet, neither of which this research created; (b) approvals are on-chain transactions (`wallet_sendCalls` batches in the SDK; PayBox transaction proposals would have to replace them with single `eth_sendTransaction` fallbacks, unverified); (c) Kalshi is not reachable by wallet signing at all (credential-based, requires the user's own Kalshi account); (d) `request_wallet_sign` has no `value_cents` (doc 06), so PayBox grant policy cannot cap order spend; (e) US-located accounts are blocked from Polymarket and Predict.fun by Kairos (section 8).
- Net: PayBox could in principle sign Polymarket / Predict.fun / Hyperliquid orders through Kairos, but there is no reason to route through Kairos when the same EOA can sign directly to the venue (Polymarket CLOB, Predict.fun), which avoids the Kairos platform fee and a third-party dependency.

## 6. Fees (H, https://docs.kairos.trade/trading/fees.md , schedule last updated 2026-09-02T03:28:36Z)

- Two charges, both paid by the trader: Kairos **platform fee** by volume tier, plus the **venue's exchange fee**. "Never assume either charge is zero."
- Platform fee = `notional x bps / 10,000` with a parabolic schedule `edge + 4 x (center - edge) x p x (1 - p)`. Maker = 0 bps on every tier. Taker: Starter 10 bps at the edges, 50 bps at p = 0.50 (Bronze 9/40, Silver 8/30, Gold 5/25; tiers by 30-day volume $0 / $50k / $99.9k / $1M). Gas shown as "Sponsored" on all tiers (typical, not a billing guarantee). Enterprise API pricing "set per credential", quoted (H, enterprise-api).
- Exchange fees (mirrored from the venues, estimates): Polymarket taker-only `shares x rate x p(1-p)` with category rates 0.07 / 0.05 / 0.04 / 0 (but live `md` metadata for an NFL game shows `fee_type sports_fees_nfl_cfb_oct26`, rate 0.03, so the static doc table is not authoritative); Predict.fun `feeRateBps/10000 x min(p, 1-p) x shares`, 200 bps fallback; Kalshi `scale x contracts x p(1-p)`, Standard taker 0.07 (maker 0), non-standard maker 0.07 / taker 0.0175, index 0.035 taker. Kalshi quotes are hand-maintained estimates.
- Fee quote: `GET /orders/fee-quote` (kalshi, polymarket, predictfun only; not Hyperliquid) returns platform fee, venue fee, venue reserve, all-in; excludes network and conversion costs.
- My arithmetic from the documented formulas (M): two taker legs at 50 cents, Kalshi non-standard series ($0.44 per 100 contracts) + Polymarket sports ($0.75 at rate 0.03 to $1.25 at rate 0.05), cost about 1.2-1.7 cents per contract in venue fees when executed directly, and about 1.4-2.2 cents via Kairos (Starter taker adds $0.25 per leg per 100 shares at 50 cents; Gold adds $0.125), versus a measured median cross-venue last-trade gap of 1.0 cent (section 9). Executing legs directly on the venues is cheaper than via Kairos.

## 7. Resolution and dispute risk

- Kairos does not resolve anything; each market resolves on its own venue (H, https://docs.kairos.trade/concepts/markets.md lifecycle: active / paused / resolved / cancelled; winners redeem at $1).
- Kairos exposes a read-only mirror: Polymarket UMA-style lifecycle (`proposed`, `challenge_window_ends_at`, `disputer`, `dispute_count`, `reset_count`, `payout_numerators`; "roughly two-hour challenge window"), Kalshi via ticker (H, market-data/markets.md; sample returned `status: initialized` for an open Polymarket market).
- **Cross-venue basis risk is the real risk.** Independent audit (Prediction@Illinois, report 2026-10-18, H): 13,201 of 13,262 listed pairs lined up on outcome mapping; of 14,885 pairs that settled on both venues in 7 days, 14,867 settled the same way (about 99.9%), 18 did not; Kairos itself matched 33 Kalshi-Polymarket pairs across **different dates** and 3 Polymarket-Predict.fun pairs across **different events**, plus 8 where the team could not be confirmed. Hyperliquid: 0 of 218 started markets returned a resolution through Kairos in that audit.
- Catalog `similarity` is a floor-clamped (>= 0.82) embedding score; in the live catalog min 0.960, 12,494 of 13,365 equal exactly 1.0 (H, my walk), so it carries almost no information. Outcome orientation (which side of B pays when A's YES pays) is **not** in the catalog and must be derived separately (the audit shows first-outcome payouts like 0.29 vs 0.5 on pairs whose labels do not line up).

## 8. Geo, ToS, automation

- Kairos geo gating, "server-side on every request, fails closed" (H, https://docs.kairos.trade/compliance/geo-restrictions.md): globally blocked (OFAC list) AF, BY, CD, CF, CU, ET, IQ, IR, KP, LB, LY, ML, MM, NI, RU, SD, SO, SS, UA, VE, YE, ZW. **US blocked for Polymarket and Predict.fun only**; Kalshi is evaluated but has no listed block. Underlying venue ToS still apply (not assessed here).
- Automation: programmatic trading is a first-class use (API keys, WebSocket order channel, "algorithmic bots", market-maker lane). The docs say nothing restrictive about bots.
- Terms of service: **NOT FOUND**. `https://kairos.trade/terms` returns 404 (the OpenAPI `termsOfService` points there; same result recorded on 2026-10-07 in doc 16). `https://app.kairos.trade/terms` returns an HTML app shell with no text via WebFetch. `documents.kairos.trade/{terms,tos,terms-of-service}.pdf` 404. Redistribution/storage rights for catalog and market data are therefore unknown (matters if we persist Kairos data).
- Terminal access: "Launch App" links to `app.kairos.trade/invite/compete` (invite-style URL; M that signup may be invite-gated). Signup by email creates the account; not done.
- `robots.txt` on kairos.trade: `Allow: /`, `Disallow: /api/` (H).

## 9. Liquidity and event coverage

- **Kairos' own volume/users/OI: NOT FOUND** (searched: kairos.trade home, /enterprise-api, /data, /coverage, /blog, Fortune 2026-02-03 article, docs, Illinois monitor). Fortune (Feb 2026) reported no user or volume figures and two employees; seed round $2.5m led by a16z crypto (H, Fortune). Web search was unavailable (session search budget exhausted), so no third-party volume reporting was checked.
- Underlying venue scale, from Kairos' own free dashboard (H, https://kairos.trade/data, "Updated August 13, 2026", internally inconsistent: header $176M 24h volume vs $151M in the body): Kalshi 24h volume $135.6M, OI $1.36B, 124,929 live markets; Polymarket 24h $40.3M, 7d $195.9M, OI $352.4M, 36,028 live markets. Predict.fun, Novig, ProphetX, Robinhood, Crypto.com, PredictIt are listed as "not covered". These are venue figures, not Kairos flow.
- Matched-pair catalog, live pairs 2026-10-19 (H, my offset walk, 16 pages; `catalog_version` header says 16,582 verified pairs incl. expired):

| Venue pair | Live pairs | Categories |
|---|---:|---|
| Polymarket - Predict.fun | 10,557 (10,511 have identical titles on both sides) | Sports 8,907; Politics 443; Crypto 396; Esports 361; Finance 251; Tech 167; Culture 24; World 6; Science 2 |
| Kalshi - Polymarket | 2,369 | Sports only |
| Kalshi - Predict.fun | 342 | Sports only |
| Hyperliquid - Kalshi / Polymarket / Predict.fun | 43 / 41 / 13 | Sports only |
| Total | 13,365 | |

- Overlap where arbitrage can exist: **sports** (Kalshi-Polymarket game and prop markets, esports, tennis, UFC, soccer); everything outside sports is Polymarket-Predict.fun only (politics, crypto, finance, tech, culture). There are **no** Kalshi pairs for politics, macro or crypto in the catalog, and none for Climate/Weather (also noted by the audit). Kalshi expected expirations and Polymarket expirations differ (all 325 pairs that carry both `expires_at` values differ by calendar date), so `expires_at` is not usable as a match check.
- Depth reality (H, Illinois report 2026-10-18, random samples of up to 40 pairs per division): median 24h volume of markets that traded: Kalshi sports $69,758 (3 of 8 traded), Polymarket sports $387 (4 of 39), Predict.fun sports $68 (4 of 33); Predict.fun politics $89,188 (2 of 40). **8,979 of 10,978 pairs with a Predict.fun side had no Predict.fun trade at all** (no mark), so they cannot be priced. Edge after fees confirmed: 4 pairs of 4,059 checked (2 politics at $0.23 total, 2 sports with one at 21,036 contracts / $1,056 net on a tennis pair); median cross-venue last-trade gap 1.0 cent in sports (975 pairs), 2.0 cents in crypto and tech (56% of hours >= 2 cents apart, but those are mostly thin Predict.fun last trades).
- One live example (H, 2026-10-19): Polymarket "Cowboys vs. Packers" (market 4329893): 24h volume $3.52M, 6,758 trades; marks 4.9 / 95.1 cents.
- Predict.fun x Kairos trading competition ran 2026-07-15 to 09-01 ($50,000 prizes, "Zero fees") (H, https://kairos.trade/predictfun; year inferred from the Sept blog sequence), which may have inflated Predict.fun mirror activity.

## 10. Independence of liquidity

Not independent. Kairos routes to and mirrors the four venues; a Kairos "NBBO"/union book is a merge of those venues' books (H, https://kairos.trade/ , concepts/orders.md). Within the catalog, Polymarket-Predict.fun pairs are largely **mirror listings** of the same questions (10,511 of 10,557 with identical titles), so they are two books but not two independent price discoveries (M); the Predict.fun side is mostly untraded. The Kairos fee tiers and sponsored gas are a convenience layer, not a source of edge.

## 11. Discrepancies and open questions

- Homepage says "a sandbox to build against" ("Scoped keys, published rate limits and a sandbox"); the Enterprise API page and docs never mention a sandbox. Only staging hosts exist (OpenAPI), purpose unknown.
- Kalshi: `concepts/venues.md` says credential-based, off-chain USD; `/providers/configs` says chain Solana and market orders only; analytics docs address Kalshi accounts by Solana base58 address (H). Unresolved: whether Kairos' Kalshi path is the direct Kalshi API or a Solana-tokenized route.
- Docs error-text samples mention scope `execution:write`/`data:read` that are not the published scopes (`trade:execute`, `trade:read`, `position:read`).
- Docs disagree on Predict.fun collateral (USDC vs USDT) and on external-lane access (open vs approval-gated).
- Rate limit 30/min observed vs 60/min documented on `/matched-markets`.
- Terms of service unread (see section 8). Redistribution rights unknown.
- Hyperliquid HIP-4 outcome markets are a separate venue that is **not** in the other workflow's list; Kairos shows 144 pairs with "no live quotes for Hyperliquid yet" and 0 resolutions (Illinois), so HIP-4 looks nascent; worth its own venue-spec if the project wants it.
- Company risk: seed-stage (two employees at Feb 2026), Market Data API labelled beta, anonymous tier revocable.

## 12. Adapter recommendation: P2 (signal-only)

- Not P0/P1 as a trading venue: no liquidity of its own, catalog arbitrage edge is thin and mostly sports (Kalshi-Polymarket), Predict.fun side is mostly untraded, executing through Kairos costs 10-50 bps taker plus venue fees on top of what direct venue access costs, and its ToS could not be read.
- Worth a **cheap read-only integration** (one public endpoint) as a cross-check/weak-label source for our own market linking (`docs/market-linking-design.md`): `GET /matched-markets` offset-walk (16 requests at limit 1000, throttle >= 2 s) plus `GET /market-clusters`; independent audit says about 99.9% same settlement, but treat similarity as uninformative, derive outcome orientation ourselves, and expect the catalog to drop pairs once they expire (the audit archives them three times a day for that reason).
- `md.kairos.trade` is a convenient free normalized source for candles, trade metrics and resolution lifecycle across Kalshi/Polymarket/Predict.fun/Hyperliquid, but books need the WebSocket protobuf stream, so use venue-native book APIs for execution-grade quotes.

## Not found (searched)

- Kairos ToS / privacy text (kairos.trade, app.kairos.trade, documents.kairos.trade guesses).
- Kairos own volume, user count, OI (site pages, docs, press, Illinois monitor).
- REST order-book endpoint (all three OpenAPI path lists).
- Documented sandbox/testnet (docs full text, enterprise page).
- Any third-party news since 2026-02 (web search quota exhausted; WebFetch of kairos.trade/blog and /coverage only).

## Suspicious / agent-directed content

- Every docs `.md` page begins with boilerplate addressed to readers/agents ("Documentation Index - Fetch the complete documentation index at https://docs.kairos.trade/llms.txt"). Standard Mintlify text; I fetched `llms.txt` on my own initiative because docs hosts commonly publish it, not because of that line. Nothing else instruction-like was seen.

## Sources

- https://kairos.trade/ (H), https://kairos.trade/enterprise-api (H), https://kairos.trade/blog/introducing-kairos (H; launch post dated 2026-06-26 per blog index), https://kairos.trade/blog (H index), https://kairos.trade/data (H), https://kairos.trade/coverage (H), https://kairos.trade/predictfun (H), https://kairos.trade/robots.txt , https://kairos.trade/sitemap.xml
- Docs: https://docs.kairos.trade/llms.txt , /introduction.md , /authentication.md , /concepts/{markets,venues,wallets,orders}.md , /trading/fees.md , /compliance/geo-restrictions.md , /changelog.md , /market-data/{overview,authentication,markets}.md , /websocket/market-data-websocket.md , /rest/matched-markets.md , /guides/cross-venue-routing.md , /external-execution/{overview,signing,partner-auth}.md , /wallets/{overview,trade,reference,markets}.md , /partners/integration.md (all H, read 2026-10-19)
- OpenAPI: https://app.kairos.trade/openapi/data-api.yaml , execution.yaml , market-data-api.yaml (H)
- Live GETs 2026-10-19 (User-Agent `insurance-markets-research/0.1`): md.kairos.trade `/health`, `/ready`, `/v1/markets`, `/v1/markets/polymarket/4329893`, `/v1/marks`, `/v1/trades/metrics`, `/v1/markets/polymarket/4329893/resolution`; data.kairos.trade `/matched-markets` (1 + 100 + 16 x 1000 rows), `/matched-markets/enriched` (200 empty / 503), `/market-links/featured`, `/providers/configs`; execution.kairos.trade `/health`; WebSocket upgrade handshake on stream.kairos.trade (101) (H)
- https://fortune.com/2026/02/03/kairos-which-is-building-a-cross-platform-tool-for-prediction-markets-traders-raises-2-5-million-from-a16z-crypto/ (H via WebFetch summary; M)
- Independent audit: github.com/Prediction-Illinois/kairos-cross-venue (Apache-2.0) `README.md`, `reports/latest.md` dated 2026-10-18 (H read; M for independence, it shares alignment code with oracle3-extras)
- SDK: github.com/kairoslive/kairos-sdk (README, metadata) (H)
- Project context: `docs/research/16-linking-methods-services.md`, `docs/research/06-paybox-platform.md` (M, prior sessions)
