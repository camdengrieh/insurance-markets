# Ton4You (now branded "Hyperstar") - venue spec

Researched 2026-10-19. Verdict: **skip**. Live-ish but a near-empty crypto up/down binary options pool on TON; no events overlap, no integrable trade path from EVM/PayBox.

Confidence tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Status

- Site https://trade.hyperstar.link/ returns HTTP 200 (Nuxt SPA, Telegram mini-app; page title "Hyperstar"). ton4u.io 301-redirects to trade.hyperstar.link (H, curl 2026-10-19).
- Venue is rebranded: code and storage keys still say `ton4u`, UI says Hyperstar (H, site JS bundle).
- Live but effectively idle: daily volume 0, positions 0, open interest 0 on both pools on 2026-10-19 (H, metrics endpoint). DefiLlama fees API: 24h/7d/30d/all-time = 0 (H).
- DefiLlama TVL: about $5k in Feb 2026, peak $9.9k (2026-02-08), collapsed to $1 from about July 2026 onward (H, api.llama.fi/protocol/ton4you). The venue's own endpoint shows about $854 in pools (USDT pool $442 + TON-denominated pool 305.9 TON about $412), so DefiLlama is lagging/undercounting, but the order of magnitude is "under $1k" (H).

## Market model (M, inferred from site code and DefiLlama text)

- Binary options (Call/Put style "Up/Down", "Higher/Lower") on crypto price feeds, charted with a TradingView UDF datafeed served at `/api/udf/*` (H: `/api/udf/config` returns exchange "TON4U", resolutions 1m..1D). The bundle calls Binance spot and futures REST for prices (M: strings `api.binance.com/api/v3`, `fapi.binance.com/fapi/v1` in bundle; it may be only for charts, exact use of Binance as settlement oracle NOT FOUND).
- Counterparty is a liquidity pool, not an order book: each settlement jetton has a pool contract with LP supply, token balance and open interest (H, metrics fixture). Not a peer-to-peer order book, no outcome tokens (NOT FOUND any tokenised outcome shares).
- No sports/politics/macro event markets seen. Category: crypto price only (M).

## Chains and collateral

- TON only (H). Settlement jettons per pool: USDT (jetton master EQCxE6mU...Id_sDs, 6 dp) and a TON-denominated variant labelled "GRAM"/pool key `ton` (9 dp); T4U and BRIN variants referenced in docs text but absent from the live payload (H/M). T4U token address per DefiLlama: ton:EQA0nLHH...IqoBq (H).
- Wallet connect: TON Connect (Tonkeeper, etc.) plus Telegram login (H, bundle).

## Read API (unofficial-ish, no official docs found)

- Official docs: NOT FOUND (searched: site HTML, JS bundle, ton4u.io, DefiLlama protocol page; WebSearch budget exhausted so no wider web search was possible). No GitHub repo listed on DefiLlama (`github: null`).
- Base URL used by the front end: `https://trade.hyperstar.link/api/` (H, bundle `CANONICAL_API_BASE_URL`).
- Confirmed public GETs (no auth, HTTP 200 JSON):
  - `GET /api/defillama/metrics[?timestamp=<unix>]` - per-pool TVL, LP supply, open interest, daily volume/fees, TON/USD rate. Built for DefiLlama's fees adapter (H, github.com/DefiLlama/dimension-adapters fees/ton4you/index.ts). Note the adapter passes `?date=YYYY-MM-DD` but the methodology says the param is `timestamp`; both returned the same "today" payload in my test, so the date param appears ignored (H). Fixture: `docs/research/fixtures/ton4you/defillama_metrics_2026-10-19.json`.
  - `GET /api/udf/config` - TradingView UDF config (H). Fixture: `fixtures/ton4you/udf_config.json`. Also `udf/symbols`, `udf/search` referenced in the bundle (M, not called).
- `GET /api/config` and `/api/options` return 404 (H). Positions/orders/pools endpoints exist in client code (strings "options", "orders", "pools_changed") but paths were not recoverable and are probably authenticated (L). I did not guess further.
- Auth and rate limits: NOT FOUND. CORS headers mention `Authorization`, `X-User-Authorization`, `X-Hyperstar-Network`, `X-TON-Network` (H), suggesting user-token auth for private routes.
- Websocket: NOT FOUND.
- On-chain: pool state is readable from TON contracts (pool addresses in the metrics fixture), the only route to prices/OI without the proprietary backend.

## Trade path

- Via the web/Telegram app with a TON wallet signing transactions or Telegram-session auth (M). Programmatic order placement API: NOT FOUND. Would have to build raw TON messages to pool contracts (undocumented) (L).
- PayBox reachability: **no**. PayBox wallets are EVM/Solana; TON is not in the list of supported chains for this task. No bridge-free route, and pool is TON/jetton-only.

## Fees (M)

- Service fee plus referral reward taken when a position settles; user pays both; LPs receive supply-side revenue; "service discount" field exists (H methodology text from DefiLlama and the metrics endpoint). Exact formulas/rates: NOT FOUND.

## Resolution

- Price-feed based expiry settlement by the protocol; oracle identity and dispute process NOT FOUND. Pool-as-counterparty means house/LP risk and operator trust; no audits (DefiLlama `audits: "0"`) (H).

## Geo / ToS / automation

- Terms and geo restrictions: NOT FOUND (SPA, no readable terms page fetched).

## Liquidity (all H unless stated)

- Live pools 2026-10-19: about $854 total TVL, OI 0, volume 0 (venue metrics endpoint).
- DefiLlama TVL peaked $9.9k on 2026-02-08, shows $1 since about July 2026; fees all-time $0 in DefiLlama.

## Overlap and independence

- Only crypto-price up/down, which in principle overlaps Polymarket/Kalshi/Limitless crypto price markets but with different strikes/expiries and a pool counterparty; no practical arbitrage at this size. Liquidity independent (own pools) but negligible. Possible signal use: none.

## Adapter priority: skip

Reasons: under $1k liquidity, zero volume, TON-only (unreachable from PayBox EVM/Solana wallets), no documented trade API, pool-counterparty model with unverifiable oracle/fees.

## Sources

- https://trade.hyperstar.link/ (site HTML and JS chunks, 2026-10-19) - H
- https://trade.hyperstar.link/api/defillama/metrics (fixture) - H
- https://trade.hyperstar.link/api/udf/config (fixture) - H
- https://api.llama.fi/protocol/ton4you and https://api.llama.fi/summary/fees/ton4you - H
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/ton4you/index.ts - H
- https://defillama.com/protocol/ton4you - M (via API, not page)
