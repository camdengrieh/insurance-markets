# PredictAsiaX - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, `curl` GETs to documented public hosts (`docs.predictasiax.com`, `api.predictasiax.com`, `origin.predictasiax.com`, `predictasiax.com`) with the generic User-Agent `insurance-markets-research/0.1`, npm registry metadata, `gh api` for repo lookup. No account, no API key (the documented sandbox key mint is a POST that creates a key, so it was NOT called), no signing, no payment, no wallet connection, no browser automation. WebSearch budget was exhausted after the first two searches, so discovery leans on those plus first-party probing.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak, self-promotional or stale.

Fixtures (<= 50 KB each, all captured 2026-10-19 UTC): `docs/research/fixtures/predictasiax/` (section 13).

---

## 0. Bottom line

1. **Infrastructure is online and actively edited; trading is not happening (H).** Docs spec v2.6.1 is dated 2026-10-09, the Merkle audit chain is ticking (about 309 batches per 24h), but `GET /v1/status` reports `fills_24h: 0`, `notional_24h_usdt: 0`, `unique_markets_24h: 0` and every category shows `volume_24h_usdt: "0.00"`. The homepage says "0 LIVE" markets. CoinGecko says PAX "stopped trading", about $3 24h volume.
2. **Of 96 markets that exist, exactly 1 has an order book, and it is a flat synthetic-looking ladder (H for data, M for the "synthetic" inference).** `ada-1-2026` shows 4 symmetric levels each side (bids 0.27 to 0.255, asks 0.29 to 0.305, sizes 93,300 / 65,310 / 45,717 / 31,722, i.e. each level 0.7x the one before). Its price history is 0.28 at every one of 500 points between 2026-07-27 and 2026-10-19. The other 95 return an empty book with a default `mid` of 0.50.
3. **Custodial, off-chain, operator-resolved (H).** Terms s4: deposits to platform-issued addresses are held custodially, balance is "a credit against the Operator's obligation". Settlement is off-chain on a ledger; the on-chain anchor contract is `null` ("On-chain anchor cron pending activation"). The "Decentralized" branding is not backed by anything on-chain that I could find.
4. **Self-described pre-launch as recently as July 2026 (L).** A builder's Reddit post republished by CoinSpectator on 2026-07-19 says about 95% complete, zero organic users, trading/deposits/withdrawals paused. No later launch announcement found (search budget ran out).
5. **Not tradeable by a wallet (H).** Order placement is `POST /v1/orders` with a Bearer API key bound to a PAX account. No signed orders, no contract calls. Real-money keys need a human-reviewed tier upgrade; the self-serve sandbox key only simulates fills.
6. **adapter_priority = skip.** Dead liquidity, custodial, gated trading access, operator resolution. Revisit only if `/v1/status` shows sustained non-zero fills (trigger in section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://predictasiax.com` | Loads. Title "Asia's First Multi-Chain Prediction Market Exchange"; footer says "Asia's First Decentralized Prediction Exchange". Markets section: **"Markets 0 LIVE"**, "No markets in this category", "No active Fast Markets", sentiment widgets all 0. | H |
| `https://docs.predictasiax.com` | Loads. "Spec version 2.6.1 - Last updated 2026-10-09" (10 days before this probe). | H |
| Changelog | v2.0.0 2026-08-19 ... v2.6.1 2026-09-26. Dense release cadence (v2.2.x-v2.4.x all on 2026-09-05/06). | H |
| `GET https://api.predictasiax.com/v1/status` (no key) | `ok:true`, `trading: {fills_24h:0, notional_24h_usdt:0, unique_markets_24h:0}`, `builders: {total_active:40, new_24h:4, top3_by_earnings_24h:[]}`, audit `event_seq_latest` 912,954, `db_ok`/`redis_ok` true. Returned version string "2.4.1" (docs say 2.6.1; `/v1/health` says "0.3.0": version drift). | H |
| `GET /v1/audit/status` | 912,794 events, first 2026-08-27T10:48Z, last 2026-10-19T03:39Z; 26,159 batches all anchored to a Cloudflare R2 bucket (not a chain). | H |
| `GET /v1/audit/anchor` | `{"chain":"polygon","contract":null,"cadence":"daily","last_anchored_at_ms":null,"notes":"On-chain anchor cron pending activation"}` | H |
| `GET /v1/builders/public` | One public builder (PredictAsiaX itself, tier partner, jurisdiction SG, joined 2026-08-19): `volume_30d_usdt "0.00"`, `fills_30d 0`. | H |
| CoinGecko `coins/predictasiax` | "PAX tokens have stopped trading", no trading pairs, price $0.9182 (0.0% 24h), 24h volume $2.95, market cap $0 (supply not reported), FDV $91.9M (100.1M supply), Polygon contract `0x63de49a3c952ca35957d03741ec62e7a19af67a3`, categories GambleFi + Prediction Markets. The page itself is internally inconsistent (7d change 0.00% vs 372.6%); no last-updated date. | H for what the page says, L for the numbers |
| CoinSpectator, 2026-07-19 (republished Reddit self-post by the builder) | "about 95% complete", production infra since 2026-04-18, zero organic public users, "all activity so far is internal QA", trading/deposits/withdrawals paused, settlement off-chain, custodial single deposit address per user. Self-reported and promotional. | L |

Verdict: **still_live = true in the narrow sense (site, API, docs, ledger online and maintained), but there is no evidence of real trading ever occurring.** Treat as pre-launch / dormant. Not to be confused with PredicXion (already known).

Evidence I could not obtain: any post-July launch announcement, X/Reddit/Discord activity (no search budget left; I did not fetch social pages), the whitepaper PDF, `/fees` and `/how-it-works` in full.

---

## 2. Kind and market model

- **Kind:** centralized, custodial, off-chain exchange with a crypto token (PAX on Polygon). Discovered as `onchain-other`; that classification is wrong for trading. H (Terms s4; `/v1/audit/anchor`).
- **Outcome types (H, `docs.predictasiax.com/markets`):** binary YES/NO (most common), Over/Under scalar thresholds, multi-outcome categorical (N > 2, one wins). Seeded templates: crypto price binary 60s, crypto price binary 5m, crypto price target by date, sports match winner, election binary (`GET /v1/composer/templates`).
- **Matching engine:** deliberately hidden. Docs say "Engine-agnostic": `meta.fill_venue` in an order response is `amm`, `clob` or `hybrid`. The fee page lists four surfaces: CLOB limit orders, AMM / fast rounds (short-window crypto rounds), parlays/combos (15% margin baked into odds), LP-share. The consumer site says creators act as market maker and traders bet against creator-deposited liquidity. H for docs statements, M for how it actually behaves.
- **Tokenisation:** none. Positions are rows in a hosted ledger (Neon Postgres, per the fee page); no ERC-1155 / CTF / SPL tokens. Prices are decimal strings 0 to 1 (`"price":"0.55"`), money is decimal strings (USDT 6dp). H.
- **Market creation:** permissioned via `POST /v1/composer/markets` (builder tier `read_live`+), then admin review (`pending_review -> approved -> listed -> trading -> resolving -> settled`). H.
- **Market IDs:** docs examples use `m_<sha256[0:16]>` / `m_btc_150k_2026`; the live LQF config uses slug IDs like `btc-200k-2026`, `hamilton-f1-2026`. Two ID schemes in the wild (docs vs live). H.

---

## 3. Chains and collateral

- **Collateral:** USDT only. "Every balance is settled in USDT." H (technology page, how-it-works, docs).
- **Deposit/withdraw networks:** how-it-works page says Polygon and TRC20 only (withdraw fee $0.50 / $1.50) (H, page summary via WebFetch). `GET /v1/chains/payout-networks` lists nine withdrawal networks: polygon, trc20, arbitrum, base, optimism, bsc, linea, avalanche, ethereum (H). The July Reddit post says "8 EVM chains plus Tron" for deposits (L). Mismatch between sources; the API list is the freshest first-party data.
- **Deposit mechanism:** each user gets a platform-issued (HD-derived) deposit address; you do not hold its key (Terms s4). H.
- **On-chain footprint:** token only (PAX, Polygon, ERC-20, utility = launch cashback credited to the platform balance per how-it-works; no governance/staking utility described). Anchor contract `null`. No trading contracts, no ABI, no verified source found. NOT FOUND (searched: docs, openapi.json, `/v1/audit/anchor`, GitHub `predictasiax/*`).
- **Note:** "Multi-Chain" in the title refers to deposit/withdraw rails, not to on-chain settlement.

---

## 4. Read API

**Official, documented, key-gated; only a thin slice is unauthenticated.** Docs: `https://docs.predictasiax.com` (`/openapi`, `/asyncapi`, `/getting-started`, `/auth`, `/rate-limits`, `/oracle`, `/verify`, `/fee-architecture`). Specs: `https://docs.predictasiax.com/downloads/openapi.json` (OpenAPI 3.1, v2.6.1, 158 KB, 175 operations in the file although the docs home text claims "69 paths / 76 operations"; path list saved as fixture) and `.../asyncapi.json`.

- **REST base:** `https://api.predictasiax.com` (`/v1/...`). Oracle gateway on a separate host `https://origin.predictasiax.com` (returned 403 Cloudflare Access to my unauthenticated GET, though docs call its reads public; the same oracle reads work on `api.` host). H.
- **WebSocket:** `wss://predictasiax.com/ws`. A bare HTTP upgrade handshake returned `101 Switching Protocols` (H). Docs: anonymous for public streams (`ticker`, `orderbook`, `fast_tick`, `markets_snapshot`); private streams after `{"op":"AUTH","token":"sk_live_..."}`; commands `AUTH/SUBSCRIBE/UNSUBSCRIBE/LOCALE`. I did not subscribe or read frames, so message shapes are unverified.
- **Envelope:** `{ data, meta:{ ts_ms, trace_id } }` for most routes; oracle and a few orderbook/price-history routes return bare JSON. Timestamps `*_ms`, money as decimal strings. H.

Key endpoints and what I observed unauthenticated (all 2026-10-19):

| Need | Endpoint | Result without a key | Tag |
|---|---|---|---|
| Market list | `GET /v1/markets?category=&q=&limit=` (cursor paged, `page.next_cursor`) | **401 `missing-api-key`** | H |
| Single market | `GET /v1/markets/{id}` | **401** | H |
| Categories + counts | `GET /v1/markets/categories` | 200: crypto 5, macro 3, politics 4, sports 4, tech 4 = 20 markets, all `volume_24h_usdt "0.00"` | H |
| Top volume | `GET /v1/markets/top-volume` | 200, `markets: []` | H |
| Order book | `GET /v1/markets/{id}/orderbook` | **200, no key.** Shape `{"asks":[{"price":0.29,"size":93300.0}],"bids":[...],"mid":"0.28"}`. Returns an empty book + `mid "0.50"` even for IDs that do not exist, so an empty book is not proof the market exists. | H |
| Price history | `GET /v1/markets/{id}/price-history?range=1h|6h|1d|7d|30d|90d` | 200, `[{"probability":0.28,"time":<ms>}...]`, 500 points for 90d | H |
| Resolution status | `GET /v1/markets/{id}/resolution` | 200 `{"data":{"market_id","status":"open","pending_outcome":null,"settlement_time":"2026-12-31T00:00:00.000Z"}}`; 404 `NOT_FOUND` for unknown id. This is the practical existence check. | H |
| Market enumeration (workaround) | `GET /v1/lqf/config?limit=50&offset=N` | 200, 96 rows (`market_id`, `daily_stipend_usdt 10000`, `max_qualifying_spread_bps 500` on every row). All 96 IDs return `resolution.status "open"`. Note this is 96 vs 20 in `/categories`: the two endpoints disagree on how many markets exist. | H for data, M for interpretation |
| Trades | `GET /v1/data/history`, trade tape "30 days rolling" per FAQ; `GET /v1/markets/movers?from_ms&to_ms` | `from_ms`/`to_ms` required; not probed further (auth status unclear) | M |
| Candles | 1m/5m/15m/30m/1h/4h/1d, 90 days rolling (FAQ) | not probed | M |
| Health | `GET /v1/health`, `/v1/status`, `/v1/audit/*`, `/v1/oracle/pool`, `/v1/oracle/providers` | 200, public | H |

- **Auth:** Bearer `sk_live_*` key (sandbox keys minted anonymously via `POST /v1/sandbox-keys`, tier `self_serve`, 30-day expiry, $10/order and $100/day caps, fills simulated at mid-price), OAuth 2.1 + PKCE (`connect.predictasiax.com`), HMAC reserved for enterprise and currently returns 401. H (docs).
- **Rate limits:** per key and per category, 60 read / 30 trade / 10 account-write per minute at baseline per the docs home; the rate-limits page itself says "fair-use" and tells clients to read `X-RateLimit-Limit/Remaining/Reset`; `Retry-After` on 429. Unauthenticated reads are IP-throttled (no figure). Exceeding published limits by more than 10x over 60 minutes can get a key revoked. H (docs; the two pages are not numerically consistent).
- **Read cost:** free at every tier. H.
- **Data retention:** trade tape 30 days, candles 90 days. H (FAQ).
- **SDKs:** `@predictasiax/api` on npm (latest 2.4.0, created 2026-09-05, modified 2026-09-06; description "REST + WebSocket, HMAC signing, Polymarket-compatible"); repo URL in metadata (`github.com/predictasiax/pax-typescript-sdk`) returns 404 via `gh api`, so no public source. H for registry metadata. I did not install or run it. A claimed MCP endpoint `mcp.predictasiax.com/mcp/call` (44 tools, marketing text) was NOT called.

---

## 5. Trade path

- **Programmatic:** yes in principle, via REST with a Bearer key: `POST /v1/orders` (required `Idempotency-Key` header matching `[A-Za-z0-9_-]{8,128}`, body `user_id`, `market_id`, `side yes|no`, `price`, `size` as strings, `client_order_id`), `POST /v1/orders/batch`, `DELETE /v1/orders/{id}` or `POST /v1/orders/{id}/cancel`, `POST /v1/orders/cancel-all`, order groups, RFQ and combo-RFQ endpoints. 24h idempotency per `client_order_id`. H (docs and OpenAPI). Not exercised.
- **Signing scheme:** none on the order. Auth is a bearer secret; no EIP-712, no wallet signature on orders. HMAC (`PAX-ADDRESS/TIMESTAMP/NONCE/SIGNATURE`, signing string `method\npath\nts\nnonce\nsha256(body)`) is documented but disabled for standard accounts. H.
- **Real-money access:** sandbox keys (`self_serve`) only simulate fills. Live tiers `read_live` (auto at $100 30-day attributed volume, which is unreachable by simulation), `trade_capped` ($100/order, $1k/day), `trade_full` come "via tier upgrade after integration" / `POST /v1/apply` with human review for elevated tiers. Docs state read_live is a real-money tier but the route to it requires attributed volume. H (docs), real behaviour unverified.
- **Account:** email+password or wallet-connect login (Terms s6/13); builder keys from the Builder Portal.

---

## 6. PayBox reachability

**paybox_reachable = partial (funding leg only; no trading leg).**

- An EVM wallet reachable through PayBox (Polygon, Arbitrum, Base, Ethereum, BNB, ...) could in principle send USDT to a platform-issued deposit address as a plain ERC-20 transfer (M; networks per `payout-networks`, which lists withdrawal rails; deposit rails not confirmed by any first-party machine-readable source, and deposits were reported paused in July).
- Everything after that is HTTP + a bearer key tied to a PAX account. There is no contract to propose a transaction against and no signed-order scheme for PayBox to sign. A PayBox plugin would need the API key stored as a secret, which also breaks the non-custodial story.
- Net: not an on-chain venue for PayBox purposes. Do not build a PayBox trading plugin for it.

---

## 7. Fees

All H unless marked; the consumer site and API docs describe different models.

- **CLOB taker (PAF):** `fee_bps = clamp(PAF_BASE_BPS * 4 * p * (1-p), PAF_FLOOR_BPS, PAF_CEILING_BPS)` with defaults 20 / 8 / 25. Effective 8 to 20 bps, peak at p = 0.5, floor near 0 and 1. (The 25 bps ceiling is dormant; the fee page intro still says "0.08% to 0.25%"; v2.6.1 changelog corrected docs to 8-20.) `POST /v1/fees/estimate` exists.
- **CLOB maker:** quality-scaled rebate 3-8 bps (LQF score = proximity^2 x balance x continuity, recomputed every 60 s). Per-market `mm_stipend_pool` funded from fees; `daily_stipend_usdt 10000` is a config value on every one of 96 markets, but `GET /v1/lqf/pool/{id}` shows `pool: null`, i.e. nothing actually allocated (H for the null, M for the interpretation).
- **7-way fee split at p = 0.5 (auto tier):** acquisition builder 3, execution builder 3, operator 2, market creator 3, MM stipend pool 5, LP 2, platform net 2 bps. Builder shares rise at higher tiers.
- **AMM / fast rounds:** `fee = notional * 0.05 * p * (1-p)` (max 1.25% at 50/50), split 83% platform / 12% LP / 5% insurance; FAQ also says fast-round markets carry about 5% round-trip house edge + spread. Parlays: 15% margin baked into odds.
- **Consumer site (how-it-works, via WebFetch summary, M):** creator markets charge a flat 2% platform fee on traders' losses; 12% of each round's loser pool goes to LP holders and 5% to an insurance fund; 5% referral fee discount. Conflicts in form with the bps model above.
- **Withdrawal:** network fee only; $0.50 Polygon, $1.50 TRC20 on the site; `payout-networks` gives `fee_estimate_usd` 0.5 (Polygon), 1.5 (Tron). Minimum amount 1. Large/high-risk withdrawals may be manually reviewed (Terms s6).
- Who pays: takers pay the fee at fill; makers are paid from the stipend pool/rebate.

---

## 8. Resolution and dispute risk

- **Declared mechanism (H, Terms s9 + technology page):** "on-chain oracles, external data providers, LLM-based evidence aggregation, and human review"; "Outcomes are confirmed by our operations layer before any payout moves"; resolved price + proof hash published in a "Trade Explorer". Template oracle adapters named in the live template list: `pax:oracle:chainlink` (crypto), `pax:oracle:sportsdata` (sports), `pax:oracle:election-official` (elections).
- **Reddit self-description (L):** about 50 data sources, 39 settlement engines, multi-LLM resolution with self-critique, ed25519-signed proof pages, a "hard-void watchdog".
- **Optimistic oracle (builder track, H docs; empty in practice):** propose/dispute with a 1000 PAX bond, 24h liveness, winner gets 50% of the slashed bond. Bonds for the first providers are provisioned by the PAX team ("no public self-serve top-up"). Live data: `GET /v1/oracle/providers` returns `{"providers":[]}`, `GET /v1/oracle/pool` shows `pool_pax "0"`. So no third-party resolver has participated.
- **Dispute window:** "typically 7 days"; operator decision final; operator may void a market and refund at cost; Cayman Islands law and courts (website Terms) vs British Virgin Islands law + SIAC Singapore arbitration (API Terms). H.
- **Risk assessment (M):** high. Single operator is oracle of last resort, custodian, and counterparty-of-record; LLM-based resolution adds ambiguity; void-at-discretion; two inconsistent jurisdiction clauses. Audit trail is hash-chained and Merkle-batched with proofs at `GET /v1/audit/proof/{evt_id}`, but anchored to a Cloudflare R2 bucket the operator controls, not to a chain.

---

## 9. Geo, ToS and automation

- **Website Terms (H, "Last updated: 26 September 2026"):** restricted persons = anyone located in / resident of / national of a comprehensively sanctioned jurisdiction (OFAC, UN, EU, UK, Cayman lists) or on a sanctions list, or where use is prohibited or needs a licence the Operator lacks; 18+; IP/device/wallet/KYT screening. No KYC at present but "may add KYC ... prospectively". No country list. Bots/scripts are prohibited except authorised access via the official Developer API (s12).
- **API Terms (H, effective 2026-08-10):** OFAC-sanctioned regions listed (Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk/Kherson/Zaporizhzhia); also bars residents of jurisdictions where prediction markets / event contracts / binary options are unlawful; VPN/proxy to misrepresent location is grounds for key revocation. Election template has `blocked_jurisdictions: ["US"]`.
- **Automation (H):** "Automated Access is expressly permitted - the API is designed for it" (s6). Respect `Retry-After`; do not exceed published limits by more than 10x over 60 minutes.
- **Data licence (H, s7), relevant to an aggregator:** public market data (market list, order books, candles, trade tape, volume stats) may be displayed, cached, transformed or redistributed with attribution (example "Prices via PredictAsiaX - predictasiax.com"); must not be presented as your own prices or in a way that misrepresents which venue a price came from; no resale as a standalone data product. **s5 also bars using API responses "to power a competing prediction market venue without a prior written agreement"**: a scanner is fine, but an XO-side market-maker that quotes off PAX prices would arguably breach it. Quote-level legal review needed before any production use.
- Also: s5 forbids enumerating market IDs "beyond what is exposed by documented endpoints". `GET /v1/lqf/config` and `/v1/markets/categories` are documented public endpoints; I used only those plus per-ID reads of documented routes.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| 24h fills / notional / markets traded | 0 / 0 USDT / 0 | `/v1/status`, 2026-10-19 ~03:30-03:48 UTC | H |
| 24h volume by category | 0.00 USDT in all 5 | `/v1/markets/categories`, 2026-10-19 | H |
| Top-volume markets (24h) | empty list | `/v1/markets/top-volume`, 2026-10-19 | H |
| PredictAsiaX builder 30d volume / fills | 0.00 / 0 | `/v1/builders/public`, 2026-10-19 | H |
| Markets with a non-empty book | 1 of 96 (`ada-1-2026`, 4 levels/side, top-of-book 0.27 / 0.29, 93,300 shares each side) | per-market `/orderbook`, 2026-10-19 | H |
| Price movement on the one quoted market | none: 0.28 at every one of 500 samples, 2026-07-27 to 2026-10-19 | `/price-history?range=90d` | H |
| TVL / open interest | NOT FOUND (no public endpoint) | | - |
| PAX token 24h volume | about $2.95 | CoinGecko (undated page) | L |
| Unique ledger events | 912,954 total, about 309 batches/24h with no fills: internal/system events | `/v1/audit/status` | H |

Conclusion: effectively zero real liquidity. The one quoted book is passive/static.

---

## 11. Event overlap with other venues

The 96 configured markets are the kind that exist on larger venues (M, by title only; I did not compare prices, and with no trading that would be meaningless):

- **Sports:** F1 2026 drivers and constructors (30 IDs), MLB World Series teams (10), UFC lightweight/champion (10).
- **Politics:** US 2028 nominee/candidate markets (`harris-2028`, `newsom`, `buttigieg`, ...), Iran meeting venues, Israel-Iran strike, Taiwan conflict, NATO expansion, Trump tariff / Ireland.
- **Crypto price:** `btc-200k-2026`, `eth-4k-dec26`, `sol-20-dip-2026`, `xrp-3-2026`, `ada-1-2026`, `bnb-600-2026`.
- **Macro / tech / other:** `fed-cut-3x-2026`, `us-recession-2026`, `gold-3k-2026`, `spx-6000-2026`, `eurusd-135-2026`, `openai-ipo-2026`, `bytedance-ipo-2026`, `anthropic-funding-2026`, `apple-iphone18-2026`, `zendaya-tom-married`.
- Settlement dates: 27 markets 2026-12-31, 27 markets 2026-12-06 (F1), 14 on 2026-12-31 23:59:59, 9 on 2026-11-05, 9 on 2028-07-31, 6 on 2028-11-07, 3 on 2026-12-06, 1 on 2026-10-31 (fixture TSV).
- Overlap is on paper only; with no volume there is nothing to arbitrage against and PAX prices would just be stale 0.50 / 0.28.

---

## 12. Shared liquidity, priority and revisit trigger

- **Shares liquidity with another venue?** No evidence; own ledger. SDK is advertised as "Polymarket-compatible" (an API-shape claim, M), and many market titles resemble well-known Polymarket events, but nothing indicates order routing or mirrored books. If PAX ever posts prices derived from another venue, it is not an independent leg.
- **adapter_priority: skip.** No fills, one static book, custodial, key-gated market list, discretionary operator resolution, self-reported pre-launch status in July 2026.
- **Revisit trigger:** `GET /v1/status` shows `trading.fills_24h` > 0 for several consecutive days, `notional_24h_usdt` meaningfully above about $10k/day, books non-empty on more than a handful of markets whose prices actually move, and a key with live (non-simulated) trade tier is obtainable. If that happens, a read-only adapter is cheap: poll `/v1/lqf/config` for IDs, `/v1/markets/{id}/orderbook` and `/resolution` (no key needed), add `/v1/markets` once a read key exists. Signal-only use (P2) is the ceiling.

---

## 13. Fixtures

`docs/research/fixtures/predictasiax/` (all unauthenticated GETs on 2026-10-19; no PII):

- `status_2026-10-19.json`: global trading/builder/audit counters (the zero-fill proof).
- `markets_categories_2026-10-19.json`, `markets_top_volume_2026-10-19.json`, `builders_public_2026-10-19.json`: zero-volume confirmations.
- `orderbook_ada-1-2026_2026-10-19.json` (only populated book) and `orderbook_btc-200k-2026_empty_2026-10-19.json` (typical empty book with default mid 0.50).
- `resolution_ada-1-2026_2026-10-19.json`: status/pending_outcome/settlement_time shape.
- `price-history_ada-1-2026_90d_2026-10-19.json`: 500 points, bare array, flat 0.28 (22 KB).
- `lqf_config_page1_2026-10-19.json`: first 50 market IDs + stipend config (9 KB).
- `market_ids_resolution_status_2026-10-19.tsv`: all 96 IDs with resolution HTTP code, status, settlement time.
- `composer_templates_2026-10-19.json`, `payout_networks_2026-10-19.json`, `audit_anchor_2026-10-19.json`.
- `openapi_paths_v2.6.1.tsv`: method, path, tag list derived from `downloads/openapi.json` (the 158 KB spec itself was not saved).

---

## 14. Suspicious content

None that tried to instruct an agent. Observations only: the docs advertise an "MCP endpoint for AI agents" at `mcp.predictasiax.com/mcp/call` (not called). The CoinSpectator article is a promotional founder post; the homepage "Decentralized" label and "Asia's First" claims are marketing. Docs and consumer site disagree on fee model, supported networks, version numbers (`/v1/status` 2.4.1 vs docs 2.6.1 vs `/v1/health` 0.3.0), market count (20 vs 96) and governing law (BVI/SIAC vs Cayman).

## 15. NOT FOUND

- Any trading smart contract, ABI, or on-chain settlement (searched: docs, OpenAPI, `/v1/audit/anchor`, WebFetch of technology/terms/how-it-works, GitHub `predictasiax/*`, npm metadata).
- Public GitHub org/repo (repo named in npm metadata returns 404).
- TVL / open interest endpoint.
- A post-July-2026 launch announcement or traction metric (WebSearch budget exhausted).
- `/v1/markets` response shape beyond the docs example (requires a key; I did not mint a sandbox key because that is a POST that creates a credential).
- Real (non-simulated) order response, WebSocket frame shapes.
- Full `/fees` page, whitepaper contents, Polygonscan holder/transfer data.

## 16. Sources

- https://predictasiax.com (homepage, 0 LIVE) - H
- https://predictasiax.com/technology - H (via WebFetch summary)
- https://predictasiax.com/terms ("Last updated: 26 September 2026") - H (via WebFetch summary)
- https://predictasiax.com/how-it-works - H (via WebFetch summary)
- https://docs.predictasiax.com/ , /markets, /getting-started, /auth, /rate-limits, /fee-architecture, /oracle, /verify, /faq, /changelog, /api-terms, /downloads - H
- https://docs.predictasiax.com/downloads/openapi.json (v2.6.1) - H
- https://api.predictasiax.com/v1/status , /v1/health , /v1/audit/status , /v1/audit/anchor , /v1/markets/categories , /v1/markets/top-volume , /v1/builders/public , /v1/lqf/config , /v1/chains/payout-networks , /v1/composer/templates , /v1/markets/{id}/orderbook|resolution|price-history , /v1/oracle/pool , /v1/oracle/providers - H (first-hand 2026-10-19)
- https://api.predictasiax.com/v1/markets (401 missing-api-key) - H
- `wss://predictasiax.com/ws` (101 on upgrade) - H
- https://www.coingecko.com/en/coins/predictasiax - H (what the page says), L (numbers)
- https://coinspectator.com/mainstream/2026/07/19/predictasiax-asias-production-prediction-market-95-complete-still-in-final-development/ - L (founder self-post)
- https://registry.npmjs.org/@predictasiax%2Fapi - H (metadata only)
- GitHub `predictasiax/pax-typescript-sdk` - 404, H
