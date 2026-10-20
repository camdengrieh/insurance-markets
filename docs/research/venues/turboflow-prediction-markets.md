# TurboFlow Prediction Markets (tf.xyz) - venue spec

Researched 2026-10-19. READ-ONLY. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale/unofficial. No account created, no wallet connected, no POST, no PayBox tool called, no third-party code executed.

## Verdict (one paragraph)

TurboFlow is live and growing (about 1.9M USD/day of "prediction market" volume, 25k users), but the product is NOT a prediction market in the sense the aggregator needs. It is a house-quoted, fixed-odds Higher/Lower price-direction product (binary-option style) on BTC, ETH, gold, silver and a Korean-equity pair, with 30s to 1h expiries, running on TurboFlow's own SVM-compatible chain. There is no order book, no tradeable outcome token, no shared event identity with other venues, and no official public trading API (API is beta, application by email, 100k USD cumulative volume gate). US persons are excluded by the Terms. Adapter priority: skip (revisit only as a watch-only signal feed).

## 1. Liveness (still_live = true)

- H: Official metrics endpoint `https://apis.turboflow.xyz/defillama/metrics?date=2026-10-18` returned 200 with 624 daily active users, 50,532 daily txs, 1,885,291 USD event-contract volume (fixtures/defillama_metrics_2026-10-18.json).
- H: DefiLlama series for slug `turboflow-prediction-markets` runs daily from 2026-03-25 to 2026-10-18 (https://api.llama.fi/summary/dexs/turboflow-prediction-markets, fixture trimmed).
- H: Docs-site and X campaign "Event Contracts League" (30k USDT rewards) said to run 2026-09-30 to 2026-10-21 (M: from search snippet of X post, post date metadata unreliable).
- H: Funding: 6M USD seed led by Pantera announced 2026-06-22 (PR Newswire title via search; Pantera note dated 2026-06-30 read at panteracapital.com). Susquehanna Crypto and DCG reported as participants (M, The Block via search snippet).

## 2. Kind and market model

- Classification: onchain-other, fixed-odds "Event Contracts" (Higher/Lower) plus perps. DefiLlama category "Prediction Market" (H), but the vendor's own llms.txt calls them "prediction-market-style" (H).
- Mechanics (H, https://turboflow.gitbook.io/whitepaper/turboflow/products/event-contracts): pick market, duration, stake, Higher or Lower. Enter Price = oracle price when the order is accepted; Exit Price = oracle price at expiry. Correct direction pays the "Return Rate" locked at confirmation; wrong direction loses the full stake; flat result refunds principal. Max loss = stake. No margin, funding or liquidation.
- Not categorical, not scalar, not AMM, not order book, not parimutuel. Counterparty is the platform/market-making pool (H: docs say "powered by professional market makers"; FAQ says liquidity supported by a partnership with Susquehanna Crypto; DefiLlama methodology: all fees accrue to protocol, no LP vault share).
- Outcome tokenisation: none. A position is an account-ledger record (pair_id, duration, order_way 1=Higher/2=Lower, stake, locked return_rate). No transferable token (M: nothing in docs or client bundle suggests one).
- Markets (docs, H): BTC, ETH, XAU (gold), XAG (silver); durations 30s, 1m, 3m, 5m, 15m, 1h; docs say limit 200 USDT per duration. Live config (H, fixture pm_config_v2_2026-10-19.json) is wider than docs: 7 pairs = BTC/USDT, ETH/USDT, XAU/USDT, GOLD/USD, SILVER/USD, SKHYNIX/USDT, SKHY/USDT (SK Hynix-linked); 8 durations seen (30, 60, 180, 300, 600, 900, 1800, 3600 s); per-order min 2 USDT, max 100 to 1000 USDT depending on pair/duration (BTC 5m max 1000, ETH 5m max 800).
- Return-rate pricing (H from live config): each pair/duration has separate `ask_return_rate` (Higher, per L-grade SDK mapping) and `bid_return_rate` (Lower). Examples at 2026-10-19 00:34Z: BTC 30s Higher 0.69 / Lower 0.91; BTC 5m 0.82 / 0.84; ETH 30s 0.77 / 0.90; GOLD/USD 30s 0.90 / 0.80. `oracle_cfg.refresh_interval` = 2 (seconds, M: rates refreshed every ~2s), `rr_sum_total` = 1.6 for 30/60s, 1.65 for 3/5/15m, 1.7 for 1h (M: target for ask+bid; observed sums across all 46 pair/duration rows range 1.40 to 1.78).
- Implied pricing (M, derived): a Higher stake breaks even at p = 1/(1+r). For BTC 5m that is 54.9% Higher and 54.3% Lower, so the two sides sum to about 109%, i.e. roughly 5.8% to 17.6% overround across the config (median about 9-10%) before any flat refunds. This is a house edge, not a market-clearing price. Skew between ask and bid probably reflects house inventory/market-maker lean (L: unverified).
- `global_configs` (H, same fixture): `order_interval` 1000 (ms, M), `resell_rfq_duration_ms` 15000, `resell_min_duration_sec` 300, `resell_tail_lock_sec` 60. Suggests an early-exit "resell via RFQ" feature for contracts of 5 min or more (L: undocumented in the whitepaper).
- Prediction product (H, docs https://turboflow.gitbook.io/whitepaper/turboflow/products/prediction): sports and esports outcome markets (football, LoL, F1, Dota 2, basketball). Real volume is negligible: footballVolumeUsd = 870 USD on 2026-10-18, 1,553 USD on 2026-10-17, 0 to 1.5k on most sampled days (H, metrics endpoint). Football fees 0. Market mechanics (odds format, order book or house odds) NOT FOUND in docs.

## 3. Chains and collateral

- Execution chain: TurboFlow's own SVM-compatible chain (H: whitepaper "Execution Layer" page says "Compatible with the Solana Virtual Machine", 100,000+ TPS claim; M: the official GitHub org `turboflow-xyz` hosts a fork of the Solana explorer retitled to Turboflow; M: official web bundle references `https://rpc.tf.xyz/svm` and `wss://rpc.tf.xyz/ws`; the ToS mentions "node operators"). Chain id, program addresses, explorer URL: NOT FOUND (searched: gitbook llms.txt, FAQ, docs pages, web bundle, GitHub org).
- Funding rails (H, https://turboflow.gitbook.io/whitepaper/turboflow/resources/deposits-and-withdrawals): deposit USDT or USDC via Solana or BNB Chain. Quote currency is USDT; USDC balances are converted at market rates with a possible premium or discount. DefiLlama lists chains BSC + Solana (custody footprint only).
- Wallet model (H, FAQ): accounts use Privy; a wallet address is generated and bound after registration or login. App is described as "self-custodial" by Pantera (M, investor note) but the trade ledger is an off-chain-style account balance (M: orders go to a REST API with JWT, see section 4).
- Withdrawal risk: docs state withdrawals above vault-relative thresholds trigger review and "temporary restrictions" (H).

## 4. Read API

Official status: no public API documentation. Only a "Trading API" in beta for approved users (H, https://turboflow.gitbook.io/whitepaper/turboflow/professional-access/api-trading): accounts with more than 100,000 USD cumulative trading volume may apply by email to contacts@tf.xyz with UID and account email. Also invite-only Market Making and "Builder Code" integration access (H). No Swagger, SDK, or GitHub API docs found.

Confirmed unauthenticated GETs this session (host `apis.turboflow.xyz`, which the official web bundle selects for production, and which DefiLlama's adapter uses; these paths are NOT in official docs, so treat as undocumented, subject to change):

| Endpoint | Purpose | Verified | Fixture |
|---|---|---|---|
| `GET /defillama/metrics?date=YYYY-MM-DD` | daily aggregate users, volume (perp / event / football / prediction total), fees, revenue | H (200, JSON; used by DefiLlama adapter in github.com/DefiLlama/dimension-adapters helpers/turboflow.ts) | defillama_metrics_2026-10-17.json, 2026-10-18.json |
| `GET /public/pm/config?version=2` | live event-contract grid: pair_id, pair_name, enable, durations, per-duration ask/bid return rates, min/max stake, oracle_cfg, global_configs | H (200, 6.3KB; path first seen in L-grade third-party README, confirmed live) | pm_config_v2_2026-10-19.json |
| `GET /market/kline?spot_token_key=<pair_id>&granularity=1m&limit=N` | OHLCV candles (fields o,h,l,c,v,t,g; t = unix seconds) | H (200; BTC 1m about 82.1k USD at 2026-10-19 00:34Z) | market_kline_btc_1m_limit3_2026-10-19.json |

Response envelope for all: `{"errno":"200","msg":"success","data":...}`; errors use a string errno.

Rate limiting: H observed `{"errno":"10010004","msg":"Rate limit exceeded. Please try again later."}` on the metrics endpoint after about 14 requests in about 40 seconds from one IP (fixture error_rate_limited_sample_2026-10-19.json). Limits are undocumented; the edge is Alibaba Cloud (M: aliyungf_tc / acw_tc cookies, Aliyun verification script on the web page). Keep polling at or below 1 request per several seconds, cache config for >=2s.

WebSocket (L, not verified this session; from the unofficial reverse-engineering README and the official web bundle): `wss://apis.turboflow.xyz/realtime?isDex=true`, subscribe with `{"action":"subscribe","args":["dex_all_ticker"]}`; channels listed by the third-party README include `dex_predict_ticker`, `dex_predict_market`, `dex_predict_risk`, `dex_predict_config`, `dex_public_trade` (no login) and `dex_trade`, `dex_position`, `dex_asset` (login). Official bundle confirms the `/realtime` path (M). Message schema NOT FOUND.

Not available / NOT FOUND: official market-list endpoint for the football/esports "Prediction" product; order-book or depth endpoint (none expected, no book exists); trade history / public trades REST; resolution/settlement REST feed; OpenAPI spec. (searched: gitbook llms.txt and all linked pages, tf.xyz llms.txt, robots.txt, web bundle string scan, GitHub org turboflow-xyz [3 repos: explorer fork, two DefiLlama forks], GitHub code search).

## 5. Trade path

- Official: API trading is beta, approval only (see above). No programmatic path available to us. Builder Code is by application.
- Order placement in the app (M/L): browser logs in via Privy, session JWT, REST calls to the API host. A third-party unofficial Rust SDK (github.com/linshengyyy/turboflow-rs, 11 stars, last push 2026-06-26, README in Chinese, self-described "reverse engineering", not read beyond README and types.rs; NOT executed) documents `POST /account/pm/order/submit` with `Authorization: Bearer <JWT>` and a `uid` header, body fields `account_id, amount, duration, order_way (1 Higher, 2 Lower), pair_id, pool_id (1), coin_code ("1" = USDT), return_rate (percent int, optional)`; JWT copied manually from the browser dev tools. This relies on a human-session token, is unauthorised use of an undocumented interface, and is a Terms risk (see section 8). Not recommended and not tested here.
- No per-order wallet signature is evident (L): auth is a bearer session token, not an EIP-712 / Ed25519 signed order. Slippage control is the client-supplied locked return_rate.
- Order confirmation latency per docs: 300-500 ms "onchain confirmation" (H).

## 6. PayBox reachability

paybox_reachable = no (for trading). A PayBox-managed BSC (EVM) or Solana wallet could in principle send USDT/USDC to the user's TurboFlow deposit address (funding only, a plain token transfer, deposit address visible only after logging into the app), but there is no on-chain contract call or signed-order flow an agent could propose via PayBox to place a position; trading requires a Privy-authenticated session or approved API credentials. The execution chain is a private SVM chain, not Base/Ethereum/Arbitrum/Polygon. US persons excluded. I did not call any PayBox tool.

## 7. Fees

- Event contracts: no explicit fee line in docs. Cost is embedded in the sub-100% Return Rate (win pays r x stake with r about 0.69-0.91 in the live config; loss forfeits stake). Implied overround about 6-18% (median 9-10%) per section 2 (M, derived).
- Reported fees (H, metrics endpoint): eventContractsFeesUsd = 25,254 USD on 1,885,291 USD volume on 2026-10-18 (1.34%); 28,485 / 2,224,121 (1.28%) on 2026-10-17; 1.5-2.0% on most sampled days since mid-June (0 reported before June 2026). This does not reconcile with the 6-18% implied overround (open question; possibly most volume is balanced, flats, or "fee" is accounted net of something).
- Perps (not our scope): Classic 0.02-0.08% per side + funding; Turbo Perps zero fee, profit-share on winners (formula in https://turboflow.gitbook.io/whitepaper/turboflow/resources/fee-schedule). The fee schedule page does not cover Event Contracts at all (H).
- Who pays: user; 100% to protocol (DefiLlama methodology, H).

## 8. Resolution, geo, ToS, automation

- Resolution (H docs): automatic at expiry using "TurboFlow's oracle-based pricing system under the platform's official settlement rules". Oracle source (Chainlink/Pyth/CEX composite), tie rule ("unchanged under platform rules" refunds), and rules for the sports Prediction product edge cases (postponed/cancelled) are NOT FOUND. No dispute process exists. Resolution is centralised on the operator; the ToS says "node operators" may "review, adjust, or amend related rules" where they identify "loopholes or unfair manipulation" (H, ToS text in web bundle, effective 2025-10-27).
- Geo (H, ToS in web bundle): users must not be located in any jurisdiction where use would violate applicable laws "(including, but not limited to, the United States and any sanctioned regions)". The web app has a `geoBlocked` state (M). Target market is APAC / "Kalshi of APAC" (M, The Block via search). No formal list of restricted countries found.
- Automation (H/M): no explicit bot clause found; ToS prohibits market manipulation, multiple accounts to "exploit or bypass system mechanisms", and accessing the platform "through unauthorized means or bypass its security". Official stance is that programmatic access is by approved API only. robots.txt on tf.xyz disallows `/api`, `/auth`, `/login`, `/account` etc.
- Operational: 1 order per `order_interval` (1000 ms, M); per-duration and platform-wide unsettled-position limits (H).

## 9. Liquidity (all dated)

- 24h volume 1,886,162 USD (2026-10-18); 30d 44,541,181 USD; all-time (since 2026-03-25 data start) 127,369,426 USD (H, DefiLlama summary fetched 2026-10-19). Methodology: single-sided stake notional; includes event contracts + football.
- Trend (H, metrics endpoint samples, event-contract volume per day): 62k (2026-03-28), 107k (04-15), 225k (05-15), 373k (06-15), 494k (07-15), 861k (08-15), 885k (09-15), 1.18M (10-12), 1.49M (10-14), 1.93M (10-15), 2.22M (10-17), 1.89M (10-18). About 30x growth in 7 months.
- Football/sports "prediction" volume: under 2k USD/day (H); effectively inactive.
- Users: 25,117 total, 624 DAU, 106 new (2026-10-18, H). Pantera note (2026-06-30) claims >15,000 users and >19B USD cumulative volume (L, company-reported, mostly leveraged perps, unaudited).
- Perps volume on same day 5.56M USD (H), so event contracts are about 25% of platform volume. TurboFlow Perps TVL about 6.67M USD (M, DefiLlama protocols list, 2026-10-19; perps custody on BSC + Solana; prediction entry shows no TVL).
- Per-order depth: max stake 100 to 1000 USDT per order (H, config). Practical capacity per signal is tiny.

## 10. Event overlap and arbitrage relevance

- Overlap categories: crypto price only (BTC, ETH), plus metals and a Korean-equity-linked name which have no counterpart on the covered prediction venues. Sports/esports overlap is theoretical (no liquidity).
- Conceptual comparables (M, from general knowledge, not verified this session; covered by the parallel workflow): Polymarket and Kalshi short-dated "BTC/ETH up or down" windows. These resolve on fixed clock windows (e.g. start-of-window vs end-of-window price), whereas TurboFlow's Enter Price is the price at order acceptance. The reference prices, window boundaries and oracles differ, so there is no clean arbitrage identity; any cross-venue hedge is a basis trade with oracle and timing risk.
- Taker-only: you can only buy at the house-quoted return rate; you cannot post a bid, sell the opposite side to others, or provide liquidity. Net edge must overcome the 6-18% house overround. The only plausible exploitable edge is stale return rates (refresh about every 2s) versus a fast price feed, which is latency arbitrage against the operator, likely to be curtailed ("abnormal trading behavior", limits, review) and a ToS risk.
- Signal value (L): the ask/bid return-rate skew might reveal house inventory lean or MM short-term directional views, but this is untested; it should be treated as a weak, noisy feed.

## 11. Shared liquidity

Not shared with another prediction venue (own counterparty pool; M). It shares the account balance and vault/market-maker backing with TurboFlow Perps (M). Reported market-maker relationship with Susquehanna Crypto (H, official FAQ). It is an independent counterparty but not an independent arbitrage leg because it has no event identity matching other venues and no sell side.

## 12. Adapter recommendation

- adapter_priority: skip.
- Why: no official public API, trading API gated by 100k USD volume and email approval, ToS excludes US persons and forbids unauthorised access, no shared event identity with other venues, house-edge pricing, house-controlled oracle/settlement, tiny per-order size, no PayBox-reachable trade path.
- If ever revisited (watch-only P2): poll `GET /public/pm/config?version=2` (about every 5-10 s, within rate limit) to record BTC/ETH return-rate skew and `GET /market/kline` for candles, store as a weak sentiment feature. Any trade integration would first require approved API access (contacts@tf.xyz per docs; not contacted).

## Open questions

1. What is the settlement oracle and price source for Enter/Exit Price, and what is the tie/flat tolerance? (not in docs)
2. What is the official Trading API schema, auth (HMAC? JWT?) and rate limit once approved?
3. Why do reported fees (1.3-2.0% of volume) differ from the 6-18% implied overround in return rates?
4. Is the football/esports Prediction product house-odds or an order book, and where is its market list exposed (the web app routes `/prediction/football`, `/prediction/f1/...`)?
5. Chain id, program addresses and public explorer URL for the SVM chain (explorer fork exists in the GitHub org); are positions/settlements verifiable on-chain as the site claims?
6. Is the resell/early-exit RFQ feature live for contracts of 5 min or more?

## Fixtures (docs/research/fixtures/turboflow-prediction-markets/)

- pm_config_v2_2026-10-19.json (live event-contract grid, 6.3KB)
- market_kline_btc_1m_limit3_2026-10-19.json
- defillama_metrics_2026-10-17.json, defillama_metrics_2026-10-18.json (official daily aggregates)
- error_rate_limited_sample_2026-10-19.json (rate-limit error shape)
- defillama_dexs_summary_trimmed_2026-10-19.json, defillama_protocols_turboflow_entries_2026-10-19.json (DefiLlama views)
- gitbook_llms_index_2026-10-19.txt (docs index)

## Suspicious / embedded-instruction content (recorded, not followed)

- https://www.tf.xyz/llms.txt contains an "Information-Use Guidance" block addressed to AI products (treat gitbook/UI as source of truth; do not present investor commentary or historical metrics as audited facts). Benign, but it is AI-directed text. Ignored as instruction; the underlying cautions are consistent with our tagging anyway.
- Gitbook pages begin with an AI-directed hint ("For the complete documentation index, see llms.txt"). Benign navigation hint.
- Third-party repo linshengyyy/turboflow-rs README encourages scripted order placement with a JWT copied from the browser (self-described reverse engineering). Not followed or run.
- GitHub code search surfaced a third-party file `rickyananda/hermes-skills: red-teaming/solana-anchor-recon/references/turboflow-svm-bridge-recon-2026-09.md` (offensive-security recon of TurboFlow's SVM bridge). Not opened; noted only as a reputational/security-risk flag for the bridge (L, unread).

## Sources

- H: https://www.tf.xyz/ (homepage HTML, robots.txt, llms.txt, SPA bundle /assets/main-DnmkLxn4.js scanned as static text for hosts, ToS strings and route names)
- H: https://turboflow.gitbook.io/whitepaper/llms.txt and pages: products/event-contracts, products/prediction, professional-access/api-trading, professional-access/market-making, professional-access/builder-code, resources/deposits-and-withdrawals, resources/fee-schedule, resources/faq, turboflow-core/execution-layer, turboflow-core/parameters-and-risk-logic
- H: https://apis.turboflow.xyz/defillama/metrics?date=2026-10-17 and 2026-10-18; /public/pm/config?version=2; /market/kline (unauthenticated GETs, 2026-10-19)
- H: https://api.llama.fi/summary/dexs/turboflow-prediction-markets ; https://api.llama.fi/protocol/turboflow-prediction-markets ; https://api.llama.fi/protocols (TurboFlow Perps entry)
- H: https://github.com/DefiLlama/dimension-adapters (dexs/turboflow-prediction-markets/index.ts, helpers/turboflow.ts)
- H: https://panteracapital.com/investing-in-turboflow/ (2026-06-30, investor note; company-reported figures are L)
- M: https://openmarketnotes.com/articles/what-is-turboflow-event-contracts-perpetuals/ (2026-07-13, secondary; confirms no chain/API/oracle disclosed)
- M: web search snippets: https://www.theblock.co/news/deals/2026-06-22-turboflow-funding-crypto-pantera-capital-405706 (not fetched, 403 on other press sites), https://candydrops.xyz/en/projects/turboflow (own L1 / SVM, beta, no token)
- M: https://github.com/turboflow-xyz (official org: explorer fork, DefiLlama forks)
- L: https://github.com/linshengyyy/turboflow-rs (unofficial reverse-engineering SDK README + src/types.rs)
- Could not fetch: https://defillama.com/protocol/turboflow-prediction-markets (HTTP 403 on web page; API used instead), Morningstar / Prediction News press pages (403). app.tf.xyz did not resolve in DNS; the app is served at tf.xyz (the hint in llms.txt is https://tf.xyz/home).
