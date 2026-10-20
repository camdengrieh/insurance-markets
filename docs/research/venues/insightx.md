# InsightX (app.insightx.finance, Mantle) - adapter spec

Researched 2026-10-19 (~00:30-00:50 UTC). READ-ONLY: unauthenticated GETs to the operator's API and to public explorer/DefiLlama/Polymarket-Gamma APIs, GitBook page reads, reads of the site's own public JS bundles as data (never executed), `gh api` file reads, two read-only PayBox `discover_tokens` chain lookups. No account, no wallet, no sign-in (the `tip_info` nonce endpoint was deliberately NOT called), no POST/PUT/DELETE, nothing signed or paid. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak, stale (>6 months) or marketing claim.
Third-party text (docs, market rules, API payloads, JS) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/insightx/` (11 files, all <= 9 KB).

## 0. Verdict

**adapter_priority: skip** (confidence: high).

1. **Live, but a thin Polymarket mirror** (H). The `/predict/v2/markets` feed lists 539,893 markets (106,577 with `status=1`); every row sampled has `source: "polymarket"` with `source_market_id` and `poly_clob_token_ids`. Prices and the `volume`/`total_volume` fields on mirrored markets are copies of Polymarket's (Brazil election: InsightX 187,719,303 vs Gamma 187,719,303.63; identical prices). So its quotes are not an independent price and its "volume" fields are not InsightX volume.
2. **Almost no resting liquidity** (H). Depth probes: 142 native ("Originals") markets hold about $850 of resting orders in total (max $137 on one market; ~15-share levels, 3 levels a side); 270 sampled mirrored markets hold about $0.10 in total. The big mirrored markets (Fed, Brazil election) have empty books.
3. **Custodial, operator-run** (H, client JS + docs). Deposit goes to a per-user deposit address; matching is off-chain; the only on-chain contract is an order-ID attestation (`PredictTrade.trade()`, no funds, no matching, no settlement); resolution is a privileged "judge" account calling `settle-market`.
4. **Volume claims do not reconcile with the books** (H/M). The operator's own stats endpoint says $1.5-3.5M/day through Oct 2026, while resting depth is ~$850. A volume-ranked leaderboard pays "PVP Points" (H, client JS), so volume farming is a plausible explanation (M, inference).
5. The only exploitable "edge" seen: stale native quotes versus Polymarket (House 2026: InsightX YES ask 0.826 vs Polymarket Democrats 0.905; GTA 6: InsightX YES bid 0.0774 vs Polymarket 0.0295), at $5-15 per level. Not worth an adapter.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| App `https://app.insightx.finance/` | HTTP 200, Next.js on Vercel, client-rendered (no SSR content); deployment cached ~10 days (age header) | H |
| API `https://mainnet-api.insightx.finance` | live; `/predict/v2/depth` returns `updated_at` = now; markets created 2026-10-18/19 (e.g. id 80731296) | H |
| Self-reported volume (`/predict/v2/llama/stats?date=`) | 2026-10-17: $1,577,120 (fees $3,942.80); 2026-10-18 reported 0 (probably job lag; 0 also on 09-10, 09-22, 10-03, 10-04) | H |
| Launch | Mantle press release 2026-06-12 ("first AI-native prediction market", ahead of World Cup); first on-chain `trade()` tx 2026-06-03 13:46 UTC | H (PR is promotional) |
| On-chain `trade()` calls | last seen 2026-09-19 19:04 UTC (Routescan txlist); none in the 30 days since although API volume continues | H |
| DefiLlama listing | slug `insightx`, category Prediction Market, chain Mantle; **DefiLlama's own series stops at 2026-08-04** (stale 76 days) | H |
| Legacy marketing site `https://www.insightx.finance/` | HTTP 200, old Vue SPA (last-modified 2026-10-15), links X `@InsightXHQ`, Telegram `t.me/InsightXHQ`, linktr.ee/InsightX_ai, whitepaper | H |

## 2. What it is

- **Kind**: onchain-other / hybrid custodial CLOB on Mantle. Operator "InsightX" (CEO quoted as "Florian J." in the Mantle release, H); AI engine "MindKit" (whitepaper, L). The app's backend is the same code base as PVP.fun's ("pvpfun" API paths, `pic.pvpfun.io`, "PVP Points", invite codes) (H, client JS) - reuse of that stack, not proof of common ownership (M).
- **Two market sources** (H, `/predict/v2/events?source=`, UI labels in JS): `source=polymarket` = "AI-Curated" (755 approved events, 2026-10-19), `source=insightx` = "Originals" (142 events, created 2026-06-08 to 2026-09-09, rules text in Polymarket's wording). Originals can also come from user proposals (`create-market`, `my-proposal`) reviewed by an admin who sets the initial YES price (`review-market` with `yes_price`) (H, client JS).
- **Market model**: binary YES/NO shares priced 0.0001-0.9999 (docs). Multi-outcome events are N independent binary markets inside one event (701 of 755 mirrored events have 2 markets; Fed and election events are bracket lists). Not scalar, not AMM, not parimutuel. "Implicit matching": BUY YES at p and BUY NO at 1-p match (docs sec 10.4). Outcome tokenisation: **none** - positions are database rows (`GET /predict/v2/position`), not ERC-20/ERC-1155. `outcome_idx`: 1 = YES, 2 = NO in the API (docs; confirmed: idx 1 and 2 books are complements, idx 0 is always empty); `winner_idx` 1/2 likewise.
- **Market status codes** (H, from data): 1 = trading, 2 = ended/awaiting settlement (outcome_prices already 0/1), 3 = settled (`winner_idx`, `settlement_price0/1` set).
- **Collateral / chains**: public `GET /wallet/deposit_tokens` (fixture) lists only **USDe (0x5d3a1Ff2...ef34, 18 dec) on `mantle_mainnet`** and **USDT0 (0xe7cd86e1...C82D, 6 dec) on `morph_mainnet`**, both mapped to internal `asset_id` 2 (UI quotes prices in "USDT"). The wallet-login code accepts networks `bsc_mainnet, eth_mainnet, base_mainnet, morph_mainnet, mantle_mainnet, xlayer_mainnet, solana_mainnet` plus testnets, but only the two above are depositable today (H). Whitepaper says "USDT/USDC" and "Mantle only" (L, differs).
- **Categories** (events API tags, H): mirrored - Sports 405, Politics 231, Finance 55, Others 44, Crypto 43, Weather 9, Esports 5; native - Politics 27, Crypto 26, Finance 26, Others 23, Weather 15, Esports 12, Sports 11.

## 3. Read API

Official docs: `https://insightx-2.gitbook.io/whitepaper` -> section 10 "Developer Resources and API Integration" (H). Markdown of any page by appending `.md`; index at `/whitepaper/llms.txt`. The docs are a whitepaper section, not an OpenAPI spec; they omit several real endpoints and list two that do not exist.

| Item | Value | Tag |
|---|---|---|
| Base URL | `https://mainnet-api.insightx.finance` (Mantle mainnet, API "v2") | H |
| Envelope | `{"errno":0,"errmsg":"no error","data":...}`; auth failure `{"errno":1006,"errmsg":"authorization error","data":null}`; HTTP 200 even on errors; wrong page range gives HTTP 400 `{"errno":400,...}` | H |
| Auth for reads | **none** for markets, events, depth, tags, deposit_tokens, llama stats. JWT (`jwt-token` header) for profile, orders, position, balances, my-proposal | H |
| Rate limits | docs "recommended" <= 10 req/s and 5-8 concurrent; no rate-limit headers seen; enforcement NOT FOUND | H/M |
| WebSocket / streaming | NOT FOUND (searched: docs, all app JS chunks for `WebSocket(`/`wss://`); polling only | H |
| Public repo / SDK / OpenAPI | NOT FOUND (searched: GitHub via web search, site links, docs) | M |

**Public endpoints, confirmed with real responses** (fixtures):
- `GET /predict/v2/events?page=&size=&source=polymarket|insightx&tag=&keyword=` -> `{count,list:[{id,title,description,image,status,rules,markets:[{id,event_id,title,outcomes,outcome_prices,volumn,end_date,status,winner_idx,settlement_price0,settlement_price1}],volume,labels,tags,end_date,judge_begin_time,created_at}]}`. Note the misspelled `volumn`. `size=100` honoured; 8 pages cover all 897 events. (H, `events_sample_mirror_and_native.json`)
- `GET /predict/v2/event_details?event_id=` -> single event object (H, `event_details_8512072.json`).
- `GET /predict/v2/markets?page=&size=` (documented) -> `{list,total,page,size}`, flat market rows: `id,event_id,title,description,rules,outcome0_name,outcome1_name,outcome_prices` (JSON string),`end_time,settle_time,winner_idx,status,total_volume,total_volume0,total_volume1,source,source_market_id,identifier,group_item_title,poly_clob_token_ids,category,tags,creator_uid,created_at,updated_at`. Newest first; `status=` filters (106,577 active); deep pages fail (page 200 at size 100 is HTTP 400); `size` above ~100 seems capped; other filter params ignored. (H, `markets_endpoint_page1_size3.json`). **Docs list `GET /predict/v2/market/{market_id}` which returns 404** (H).
- `GET /predict/v2/depth?market_id=&outcome_idx=1|2` -> `{market_id,outcome_idx,bids:[{price,amount,orders}],asks,best_bid,best_ask,mid_price,updated_at}`; aggregated levels, no top-N parameter seen. Empty book returns zeros. (H, depth fixtures)
- `GET /predict/v2/tags` -> `["WorldCup","Sports","Politics","Crypto","Finance","Esports","Weather","Others"]` (H).
- `GET /predict/v2/llama/stats?date=YYYY-MM-DD` -> `{date,volume,fees}` operator-self-reported, feeds DefiLlama (H; adapter source read at `DefiLlama/dimension-adapters/dexs/insightx/index.ts`).
- `GET /wallet/deposit_tokens` (H). Trades/last-trade feed: NOT FOUND (searched: docs, JS). Resolution data: only via `status`, `winner_idx`, `settlement_price0/1` on events/markets.

**Authenticated endpoints (from docs + client JS; shapes of responses not verified)**: `GET /wallet/tip_info?network=&address=` (login message), `POST /wallet/connect {network,address,signature}` -> `{token, expires_in: 604800}`, `GET /predict/v2/orders|position|profile|user-permissions|my-proposal`, `GET /wallet/balance|deposit_address|withdrawal_quota|transactions`, `POST /predict/v2/place-order|cancel-order|create-market|settle-market`, `POST /wallet/withdrawal`, admin: `GET /predict/v2/admin/pending-markets`, `POST .../review-market|refresh-trading-switch`, `GET /admin/platform_statistics|account_statistics`.

## 4. Trade path

1. **Login** (docs sec 10.5 + client JS, H): GET login message -> sign with wallet (EVM `personal_sign` of `tip_info`; Solana ed25519 `signMessage`) -> POST signature -> JWT valid 7 days (`expires_in` 604800). Address is lower-cased; network string such as `mantle_mainnet`.
2. **Fund** (client JS, H): `GET /wallet/deposit_address` (JWT) returns a per-user address; UI sends an ERC-20 `transfer` of USDe (Mantle) or USDT0 (Morph) from the connected wallet. Balance is internal ("Buy order total cannot exceed 95% of your balance"). Withdraw via `POST /wallet/withdrawal` with a quota (`withdrawal_quota`); limits and fees NOT FOUND (auth-gated).
3. **Order** (docs sec 10.8, H): `POST /predict/v2/place-order {market_id, outcome_idx(1|2), side:"buy"|"sell", order_type:"limit", price, amount}` with JWT -> `{order_id, signature, deadline}`. Docs say the order is inactive until the user calls `PredictTrade.trade(uint64 orderID, uint64 deadline, bytes signature)` on Mantle (gas in MNT). Contract `0xD22A5FFdb71221B7b2F081e2679C8A0149d58BE9` (Mantle 5000, verified source `PredictTrade`, solc 0.8.28, Ownable, `authorizer` = server signer that can be swapped by the owner): it only checks the authorizer's signature over `(chainid, contract, orderID, user, deadline)` and writes `tradeRecord[orderID] = user` (H, Routescan verified source). **It holds no funds and does no matching.** No `trade()` tx since 2026-09-19, so whether current orders still need it is unknown (the UI string "Backend order submitted, on-chain recording may fail" suggests it is now best-effort).
4. **Cancel**: `POST /predict/v2/cancel-order {order_id}` (pending/partially_filled only). Order types other than `limit` NOT FOUND; no FOK/IOC/market order documented.
5. **Per-order signing**: none by the user; the only user signatures are the login message and the optional on-chain `trade()` transaction. Orders are authorised by the bearer JWT. This means any bot holding the JWT can trade the account (and request a withdrawal).

**PayBox reachability: partial (not worth building).** PayBox's chain catalog does list Mantle (`eip155:5000`, MNT) and Morph (`eip155:2818`) and a USDe token on Mantle (H, `discover_tokens` 2026-10-19), though the catalog is "not a support allowlist" and neither chain is in the featured 11 (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid; see `06-paybox-platform.md`). A PayBox EVM wallet could in principle (a) `personal_sign` the login message, (b) transfer USDe on Mantle to the deposit address, (c) call `trade()`. But funding needs bridging to Mantle/Morph, the account is custodial, trading authority is a bearer JWT, and liquidity is ~nil. Whether PayBox can sign proposals on chain 5000 is NOT FOUND.

## 5. Fees

- Self-reported fees = **exactly 0.25% of reported volume** on every day checked (e.g. 2026-10-17: 3,942.80 / 1,577,120; 2026-08-04: 25,058.225 / 10,023,290) (H, `llama/stats`). Who pays (taker/maker/both) and the exact formula: NOT FOUND (searched: docs sec 4/10, client JS strings).
- Whitepaper design table says "0.5% of the transaction amount" (L, marketing comparison; disagrees with 0.25%); IXT staking gives fee discounts/waivers (L; no IXT contract or listing verified).
- Gas: MNT only for the optional `trade()` call. Deposit/withdrawal fees: NOT FOUND.

## 6. Resolution and dispute risk

- Docs/whitepaper claim a "cascading clearing system": on-chain oracles + AI verification + decentralized arbitration (L; no oracle contract or dispute process is documented or visible on-chain).
- What the code shows (H, client JS): a permissioned "Judge Events" panel lists markets and a privileged account selects a winner and calls `POST /predict/v2/settle-market {market_id, winner_idx}`; user-proposed markets are approved/priced by an admin. Mirrored markets carry Polymarket rules text and Polymarket's final prices at status 2, so settlement most likely follows Polymarket's outcome, but that link is not documented (M).
- UI: "If you're right, payout is expected 2 hours later" (H). No dispute window, bond or appeal path found. **Resolution risk = operator discretion + custody risk.**
- Whitepaper says contracts "will" be audited (L); `audits: "0"` on DefiLlama (H). No audit report found.

## 7. Geo, ToS, automation

- No terms, privacy or geo-restriction page found (`/terms`, `/privacy`, `/tos`, `/docs` return 404; no restricted-jurisdiction strings in the JS) -> NOT FOUND. Whitepaper sec 9 only warns of regulatory risk (L).
- Automation is explicitly invited: docs sec 10.1/10.13 name "AI Agents" and "Market Makers" as API users and recommend <= 10 req/s (H). Invite code is bound at first login (`INSIGHT_X_INVITE_CODE`, `bind_invite_code`); whether it is mandatory: NOT FOUND.

## 8. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Self-reported daily volume | 2026-10-12..17: 2.34, 2.76, 3.35, 1.77, 1.50, 1.58 ($M); 7d (to 10-18) $13.3M; 30d $63.8M; peak ~$23M/day (2026-07-06 per DefiLlama) | `llama/stats` 2026-10-19; DefiLlama series to 2026-08-04 (all-time $849M, self-reported) | H (numbers), L (as real volume) |
| Resting order depth, 142 native markets | ~$850 total, max $137 per market, 10 of 142 markets non-empty | `/depth` crawl 2026-10-19 | H |
| Resting order depth, 270 sampled mirrored markets | ~$0.10 total (1 order) | same | H |
| TVL | none reported (DefiLlama `tvl: []`) | DefiLlama API 2026-10-19 | H |
| `volume` / `total_volume` fields in events and markets APIs | copies of Polymarket volume for `source=polymarket` (event 13: 187,719,303 vs 187,719,303.63; market 80730445: 106,043 vs 106,059.97) | Gamma cross-check 2026-10-19 | H |
| Own-volume counters | `total_volume0/1` exist but were 0 on all sampled mirrored rows | markets sample | H |

## 9. Overlap and independence (arbitrage view)

- **Not an independent leg.** Mirrored markets reuse Polymarket's catalog, ids (`source_market_id`), CLOB token ids and displayed prices; execution routing to Polymarket is NOT FOUND, so either there is no real fill path or it is hidden. Treat InsightX prices on mirrored markets as a lagged copy of Polymarket.
- Native books are stale, not independent: quotes sit away from Polymarket (see Verdict 5) and were placed by what looks like a single market-making bot (3 levels each side, ~15 shares each).
- Overlapping categories: sports, politics (US midterms, 2028 nominee), macro (Fed), crypto price (BTC thresholds) - all Polymarket-derived.
- Quotient / signal use: no value beyond Polymarket itself.

## 10. Open questions

1. Do current orders still need `trade()`? (No on-chain tx for 30 days while volume continues.)
2. What is the real source of the $1.5-3.5M/day self-reported volume (internal MM, farming, hedging to Polymarket)?
3. Does a fill on a mirrored market get hedged on Polymarket (the `poly_clob_token_ids` field suggests a routing design)?
4. Withdrawal fees/limits, KYC/geo gating at first login (all auth-gated; not tested).
5. Why DefiLlama stopped updating after 2026-08-04 while the stats endpoint still serves data.

## Sources

- InsightX app: https://app.insightx.finance/ (H; HTML + public JS chunks `/_next/static/chunks/*`, read as data)
- InsightX API (unauthenticated GETs, 2026-10-19): https://mainnet-api.insightx.finance/predict/v2/events, /predict/v2/markets, /predict/v2/depth, /predict/v2/event_details, /predict/v2/tags, /predict/v2/llama/stats, /wallet/deposit_tokens (H)
- Official whitepaper + developer section: https://insightx-2.gitbook.io/whitepaper , https://insightx-2.gitbook.io/whitepaper/insightx-whitepaper/10.-developer-resources-and-api-integration.md , sections 3, 4, 5, 6, 7, 9 (H for content; claims L)
- Legacy site: https://www.insightx.finance/ (H)
- Mantle launch release (2026-06-12): https://chainwire.org/2026/06/12/mantle-launches-first-ai-native-prediction-market-with-insightx-ahead-of-the-2026-world-cup/ (promotional, L/M)
- DefiLlama: https://defillama.com/protocol/insightx (WebFetch blocked, 403), API https://api.llama.fi/protocol/insightx , https://api.llama.fi/summary/dexs/insightx , https://api.llama.fi/summary/fees/insightx (H)
- DefiLlama adapter source: https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/insightx/index.ts (H)
- Trading contract verified source and txs: Routescan etherscan-compatible API `https://api.routescan.io/v2/network/mainnet/evm/5000/etherscan/api` for `0xD22A5FFdb71221B7b2F081e2679C8A0149d58BE9` (H); Mantle Blockscout returned 502
- Polymarket cross-check: https://gamma-api.polymarket.com/public-search , /markets?id= (H; Polymarket itself is covered by another workflow)
- PayBox chain/token lookups via `discover_tokens` (chains `Mantle`, `Morph`; token `USDe` on eip155:5000), 2026-10-19 (H)
- Web search (extended) for docs/ownership: only syndicated press releases found; PVP.fun relationship not corroborated by third parties (L)
