# Foreso (foreso.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip** (revisit as P2 only if API access is granted and volume appears). Live, but tiny, almost entirely long-dated Chinese-language celebrity/KOL markets, with a stock/crypto/sports catalogue that has ~zero volume; every endpoint (including market data) requires an API key from a Google Form; the documented API host did not resolve in DNS from here.

## Liveness [H]

- foreso.com serves a live Next.js app; sitemap `lastmod` 2026-10-19 [H: https://www.foreso.com/sitemap.xml].
- GitHub org Foreso-Global created 2026-05-28, 0 public repos; user `foreso-market` (bio "Decentralized Social Prediction Market Platform") has one repo `smartcontract`, last push 2026-05-27, commits titled only "first commit" [H: gh api].
- Footer says "(c) 2025" so the brand may predate the repos; account `foreso-market` created 2025-12-11 [H].

## Kind and market model

- Hybrid order book on the Gnosis Conditional Token Framework (Polymarket-style): off-chain matching, on-chain settlement by operators; users sign EIP-712 orders; ERC-1155 YES/NO position tokens; 1 YES + 1 NO = 1 USDT, merge/split supported; NegRisk adapter for multi-outcome groups [H: https://foreso.gitbook.io/usersguide/ctf-architecture/module-by-module-breakdown.md].
- Markets are groups ("events") containing binary sub-markets. Embedded data shows `market_type: "binary"` [H: fixtures]. Price ticks 0.001-0.999, min limit 1 share, min market buy 0.99 USDT [H: create-order doc].
- Many markets are user/partner-created ("ForesoGate", `is_gate: true`, `gate_user_id`); docs mention AI moderation for permissionless creation [H].
- Crypto/stock markets are "hit price" barrier markets (`barrier_type: touch`, Binance 1-minute-candle High >= target, monthly) [H: fixtures/market-group-btc-monthly-hit-price.sample.json].

## Chains and collateral [H]

BNB Smart Chain (chain id 56), USDT `0x55d398326f99059fF775485246999027B3197955` (18 decimals). Contracts from the site's own bootstrap config [H: fixtures/site-initialConfig.sample.json; same field names as docs `GET /v1/blockchain/config`]:

- conditional_tokens `0x0e02b9B014c75E17c31f8DCA1270597Bf1e4A7a5`
- ctf_exchange `0x1e06635f6cB161A4B8AA7eCdF54E4F244b1f3F9e`
- ctf_adapter `0x546B32ea1f0Ac988E3084CEcffe0BA2712aE4ee4`
- market_factory `0xB5e011DE59FdDaE57861839ce3900e68Bcf6b0Ef`

Not verified on-chain (bscscan returned 403 to WebFetch; no RPC calls made). Only BSC USDT is accepted for deposits [H: faq/deposits-and-withdrawals]. Deposit min 15 / max 10000 USDT per site config (onramp) [H].

## Read API

- Official docs: https://foreso.gitbook.io/usersguide (machine index https://foreso.gitbook.io/usersguide/llms.txt; any page + `.md`) [H].
- Base URL (production): `https://api.open.foreso.com` [H: docs]. **DNS lookup failed** from this machine (system resolver and 1.1.1.1 returned no record), while `api.foreso.com`, `open.foreso.com`, `www.foreso.com` resolve (Cloudflare). So the documented host may not be live or is not yet public [H: dig/curl 2026-10-19]. `https://www.foreso.com/api/*` and `https://api.foreso.com/` return HTTP 401 `{"code":401,"message":"Missing authentication information"}` unauthenticated [H: fixtures/www-api-unauth-401.txt]. robots.txt disallows `/api` and allows `/markets/`, `/event/` [H].
- Auth: **everything, including public market data, needs an API key** ("All endpoints (including public market data) require an API Key signature"). Key obtained via a Google Form (approval manual, no timeline stated) [H: https://foreso.gitbook.io/usersguide/foreso-open-api/getting-started.md]. Headers `apikey`, `X-API-Timestamp` (+-3 s skew), `X-API-Signature: sha256=HMAC_SHA256(METHOD\nPATH\nTS\nBODY, key_secret)`. Trading endpoints add `Authorization: Bearer <JWT>` (24 h) from wallet personal_sign login.
- Rate limit: 10 req/s per API key [H].
- WebSocket: NOT FOUND (searched: all `api-reference_*` and integration-guide pages for websocket/wss).
- Key endpoints [H: llms.txt + page reads]:
  - `GET /v1/markets` (page_size max 20; filters category, status active|resolved|cancelled, sort_by created_at|volume|end_time, listed, ids, search); fields include market_id, condition_id, question, category, status, end_time, total_volume, liquidity, tokens
  - `GET /v1/markets/groups`, group details, binary market details, market stats (names per llms.txt; paths not all read)
  - `GET /v1/markets/{market_id}/orderbook?asset=<position token id>` -> bids/asks `{price,size,total}`, spread, mid_price
  - latest price (price, bid, ask, spread, volume_24h), price history
  - `GET /v1/blockchain/config`, `GET /v1/blockchain/contracts/{marketId}` (condition_id, question_id, oracle_address, collateral token)
  - user-scoped: orders, positions, trade/order/settlement history (JWT)
  - No public per-market trade tape endpoint found (only user trade history).
- Unauthenticated alternative: server-rendered market pages listed in `https://www.foreso.com/markets/sitemap/0.xml` embed full group JSON (prices per option `current_price`, `total_volume`, `position_id`, condition/question ids, oracle config). Saved: fixtures/market-group-*.sample.json. This is HTML scraping of pages robots allows, not an API; empty order books on sampled pages (client-side loaded, not captured) [H].

## Trade path [H docs; feasibility M]

- `POST /v1/orders` (+ batch create/cancel) with API-key HMAC + JWT. Order is EIP-712 signed (domain name "CTFExchange", `signatureType = 2` Safe) by the EOA; maker is a per-user **Safe proxy wallet** created via `enable-trading`, then `enable-module` (Safe tx signature) and `whitelist` (EIP-712, nonce<<12). Docs warn that standard `encode_typed_data` fails and the order must be hand-ABI-encoded (non-standard) [H: integration guide].
- Withdrawals, mint/merge and redeem are also signed-data + execute API calls.
- PayBox reachability: an EVM wallet on BNB could in principle do this only if PayBox exposes arbitrary EIP-712 / personal_sign signing on BSC (`request_wallet_sign`) and funded USDT on BSC. Raw order placement is not a transaction proposal (orders are off-chain signed). Safe module setup and deposits are on-chain transactions. Verdict **partial** (M; PayBox capability set not checked here; blocked first by API key approval).

## Fees [H]

Site config and FAQ: taker 1% (100 bps), maker 0%, max 200 bps; "Est. Fee" shown pre-trade. Contract `FeeManager` ceil-divides `amount * rate / 10000`; MAX_FEE_RATE 200 [H: smartcontract repo]. Gas is paid by operators (users only sign). No documented withdrawal fee.

## Resolution and dispute risk

- Docs are inconsistent: architecture diagram says UMA Optimistic Oracle + UMA CTF adapter; Oracle & Settlement page says "most markets are resolved through Foreso AI" [H]. Repo has both `UMAOracleAdapter.sol` and `AIOptimisticOracleAdapter.sol`.
- AI adapter: privileged PROPOSER_ROLE (the AI) proposes payouts with evidence URI, `challengePeriod = 2 hours`, `challengeBond = 0.1 ether` (native BNB), ARBITER_ROLE final say, `openChallenge` flag [H: contract source]. So resolution is effectively centralized (operator/AI + arbiter). Market metadata shows `oracle_type: offchain_verifiable` with `oracle_config_key` of `manual` (gate events) or `offchain_verifiable` (price feeds, Binance) [H: fixtures].
- Settlement "typically 3 hours after close" [H FAQ]. Rules are free text, mostly Chinese for KOL markets; stated sources per market. Contracts audited by Scalebit (PDF link, not read) [H: audit-report page].
- Mismatch risk vs other venues: touch-based crypto markets use Binance 1m candle High (differs from Polymarket/Kalshi sources); dates in UTC+8.

## Geo / ToS / automation [H]

US, UK, DE, FR, NL, IT, AU, BE, RU, IR and others blocked at order placement; SG, TH, TW, PL close-only; Japan blocked on frontend only (API not restricted); Ontario blocked. Docs tell builders to geoblock-check before ordering. API access is gated by manual key approval (automation is sanctioned via the Open API). Multiple accounts discouraged. Terms of Service page NOT FOUND (searched: /terms 404; footer "Privacy Agreement/Our Policy" not read). US-based operator must not use it.

## Liquidity (date 2026-10-19) [H: summed from 40 of 42 sitemap market pages]

- Cumulative `total_volume` of sampled groups about $304K, of which $239K is one partner market (BitMart reserves-audit report, `is_gate`, 5,947 trades, created 2026-08-20). Homepage tiles: $40.3K (a Luo Yonghao apology market), $15.8K, $5.3K, rest <$2.3K. No TVL/OI figure published. `total_liquidity` field is 0 on sampled groups.
- Catalogue of ~42 live groups: 11 Chinese celebrity/social, 1 BitMart, 3 football (Spurs-Coventry, Barcelona-Real Madrid, Atletico-Deportivo; volume 0), 14 "what price will <stock> hit in October" (volume 0-38 USD), 11 crypto monthly hit-price groups (BTC, ETH, SOL, TRX, LINK, DOT, AAVE, HYPE, ZEC, LTC, BCH; volume 0). Two sitemap pages failed to parse (not counted).
- A freshly published BTC group showed all-zero volume and 0.5 default prices [H: fixtures].

## Event overlap (arbitrage relevance)

Nominal overlap: crypto monthly price-touch (Polymarket/Kalshi/Limitless/Opinion-style), US-stock monthly price-touch, a couple of football matches. These markets have effectively no depth or volume, so no practical arbitrage leg. The only real volume is China-centric social/KOL events with no overlap elsewhere (signal-only at best).

## Shared liquidity

Own order book on own contracts; not shared with another venue [H: architecture]. Contracts are a Polymarket-style CTF Exchange fork (code lineage, not shared liquidity) [M].

## Not found

- Terms of Service text; websocket; public trade tape; rate-limit tier info beyond 10 rps; API key approval criteria; on-chain TVL/volume (bscscan blocked); live confirmation that `api.open.foreso.com` serves responses; real API response samples (key required).

## Suspicious content

None that instructs an agent. Note the docs scratch dir contained other venues' gitbook pages (shared scratchpad), ignored.

## Sources

1. https://www.foreso.com/ (homepage, 2026-10-19) [H]
2. https://www.foreso.com/sitemap.xml , /sitemap-index.xml , /markets/sitemap/0.xml , /robots.txt [H]
3. https://foreso.gitbook.io/usersguide/llms.txt and pages: foreso-open-api/getting-started.md, ctf-architecture/*.md, oracle-and-settlement.md, faq/*.md, fund/*.md, api-reference/markets/get-market-list.md, tokens/get-order-book.md, tokens/get-latest-price.md, blockchain/*.md, orders/create-order.md, geographic-restrictions.md [H]
4. https://github.com/foreso-market/smartcontract (README, FeeManager.sol, AIOptimisticOracleAdapter.sol, tree; last push 2026-05-27) and https://github.com/Foreso-Global (org page) [H]
5. Fixtures: docs/research/fixtures/foreso/ (market-group-btc-monthly-hit-price.sample.json, market-group-bitmart-reserves-gate.sample.json, site-initialConfig.sample.json, www-api-unauth-401.txt) [H]
6. WebSearch for external coverage was unavailable (session search budget exhausted); no third-party volume data checked.
