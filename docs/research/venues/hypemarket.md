# HypeMarket (beta.hypemarket.trade) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, web fetch/search, PayBox `discover_tokens` (catalog read only). No account, wallet, key, signature, POST/PUT/DELETE, money-moving PayBox tool or browser automation. No third-party code cloned, installed or run. All requests used the User-Agent `insurance-markets-research/0.1`.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages, repos and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/hypemarket/` (7 files, largest 14.7 KB).

## 0. Verdict

- **Kind:** on-chain LS-LMSR AMM prediction market (one shared collateral pool per market, no order book), Move contracts on Supra L1, collateral = native SUPRA coin. (H, docs + on-chain resource.)
- **Live?** Yes, technically: API answers, last trade row 2026-10-17T18:12Z, 4 markets ACTIVE (next expiry 2026-10-25), but **no new market created since 2026-09-02** (H, API tally). Economically it is dust.
- **Size:** TVL **$214** (1.63M SUPRA, DefiLlama 2026-10-18); DefiLlama volume **$0.86 / 24h, $6.89 / 30d**, $56.4k all-time; fees $622 all-time (H). SUPRA trades at about **$0.000132** (H, API + DefiLlama coins), so the 100-SUPRA minimum trade is about **$0.013** and the largest active market holds about **$29** of collateral. There is nothing to arbitrage at any size that matters.
- **API:** a real, unauthenticated, CORS-open JSON REST API exists and works (`api.hypemarket.trade/api`), plus an on-chain Move view/GET path for live quotes. The official docs page still says the "public read API" is "planned for Phase 2", which is stale; the Bot Trading Guide documents the REST discovery endpoint. (H)
- **Trade path:** Move entry functions (`buy_with_coin`, `sell`, `redeem`) signed by an Ed25519 Supra account. **Not reachable from any PayBox chain** (Supra is not in PayBox's 11-chain catalog; an EVM wallet cannot sign Supra Move transactions).
- **adapter_priority: skip.** Revisit only if 30-day volume exceeds roughly $50k and a PayBox/Supra signing route appears (see section 12).

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| Site `beta.hypemarket.trade` returns 200 (Next.js app, links to GitBook docs, X `@HypeMarketTrade`, Telegram `t.me/hypemarkettrade`) | H | curl 2026-10-19 |
| DefiLlama lists it (id 8017, category Prediction Market, chain Supra, listedAt 2026-06-16, TVL series to 2026-10-18) | H | `api.llama.fi/protocol/hypemarket` |
| API `GET /markets?status=all` returns 132 markets: 128 CLOSED, 4 ACTIVE. Created per month: Jun 105, Jul 19, Aug 6, Sep 2, Oct 0 (last createdAt 2026-09-02T00:14Z) | H (data), M (reading: creation has stopped) | `fixtures/.../api_markets_status-open_limit5_2026-10-19.json` is the 4 active; full list not saved (587 KB) |
| Latest activity row `bought ... Barcelona` at 2026-10-17T18:12:39Z, tx `0x1076...fffee` | H | `GET /activities?market=...` (`fixtures/.../api_activities_...redacted.json`) |
| `GET /dashboard` stats: totalUsers 400, totalTradeCount 11,135, activeTraderCount 215 (window not stated), volume30d 4,505,127,436,914 atomic (= 45,051 SUPRA, about $5.95) at 2026-10-19T00:20Z | H | `fixtures/.../api_dashboard_stats_only_2026-10-19.json` |
| TVL decay: $7,197 on 2026-06-16 (first listed day) to $214 on 2026-10-18; still falling | H | `fixtures/.../defillama_hypemarket_extract_2026-10-19.json` |
| GitHub org `HypeMarket-Protocol` created 2026-02-23, 2 public repos, both forks of DefiLlama adapter repos (no contract/SDK repo published) | H | `gh api users/HypeMarket-Protocol`, `orgs/.../repos` |
| ToS is labelled "Preview ... final, binding Terms will be published before or at mainnet launch" while the Bot Guide calls the packages "mainnet" and uses `rpc-mainnet.supra.com` | H (both texts), M (inference: product is in a long soft-launch/beta) | GitBook legal page, bot guide |

## 2. Market model

- **AMM, LS-LMSR** (Liquidity-Sensitive LMSR). Docs: cost `C(q) = b * ln(sum e^(q_i/b))`, `b = alpha * Q`; "One shared pool per market"; "100% of the pool's collateral is redistributed to winning shares at resolution". On-chain `alpha_config` shows `alpha0_bps = 500` (alpha = 5%) for every market sampled. (H: docs how-hypemarket-works, bot guide, on-chain resource)
- **Binary and categorical.** 132 markets: 52 with 2 outcomes, 75 with 3, and one each with 5, 6, 7, 11 and 16. **The API `type` field says `BINARY` for all of them, including the 16-outcome market, so do not use `type`; use `outcomeCount`/`outcomes`.** Scalar/range markets are roadmap Phase 3 (NOT live). Multi-outcome "range" markets are emulated as buckets (e.g. 7 price bins for BTC on 2026-12-31). (H: API tally; docs roadmap)
- **Outcome tokenisation:** no ERC-20/1155. Shares are Move resources, "soulbound", non-transferable ("no approval needed (shares are soulbound)"). Share unit equals collateral unit: 1 whole share = 10^8 atomic (SUPRA has 8 decimals). Outcomes are indexed `0..n-1`; `vector<u8>` outcome ids in the entry functions. (H: bot guide, smart-contracts page)
- **Price semantics (important for an aggregator):** marginal prices **do not sum to 1**. Docs: "Marginal prices need not sum to 1". Observed: binary `get_prices` example `[41635579, 65019932]` sums to 1.0665; the El Clasico 3-way market opened at `38826395` x3 = 1.1648 and now sums 1.164 (`[34175342, 44384941, 37799602]`). This matches the closed form for a symmetric start, `1 + alpha * n * ln(n)` (binary 1.069, 3-way 1.165). Consequences: (a) quote `p_i` overstates probability, normalise with `p_i / sum(p)` for comparison with other venues; (b) buying every outcome costs more than the 1 SUPRA it pays, so there is no internal arbitrage; (c) the effective spread between buy and sell is tiny pre-fee (buy 1 share `41635836` vs sell `41635321` atomic in the docs example) but fees add 1% + creator fee per side. (H data and docs; M for the closed-form reading, my arithmetic)
- **Payout is not exactly 1 SUPRA/share:** "Payouts can deviate slightly from 1 SUPRA per share ... deep and balanced markets can settle slightly above 1 SUPRA ... thin or heavily lopsided markets can settle slightly below". On-chain field `redeemable_amount_per_share` (0 until closed). Aggregator must not assume a $1 claim. (H: docs; on-chain resource)
- **Can always trade, can exit before expiry:** sell any time while `status == ACTIVE (2)`; no margin, no liquidation. (H)
- **Seeding:** creator seed minimum **200,000 SUPRA (about $26)**, requires the Hype Catalyst badge; `initial_shares_per_outcome` on the El Clasico market is 171,704 SUPRA-shares per outcome. Initial prices are therefore the LS-LMSR prior (1/n plus the alpha term), not a market view. (H: fees-and-limits, on-chain)
- **Status enum (on-chain):** 0 PENDING, 1 CANCELLED, 2 ACTIVE, 3 PAUSED, 4 RESOLVED, 5 CLOSED, 6 UPDATE_REQUIRED, 7 VOIDED, 8 VOIDED_CLOSED. Trade only in 2; redeem in 5 or 8. (H: bot guide). Observed on the on-chain MarketData resource: `status: 2`, `collateral_amount: 22159999999999` (= 221,600 SUPRA) for the El Clasico market. (H)

## 3. Chains and collateral

- **Chain:** Supra L1 (standalone, MoveVM; mainnet since 2024-11-27 per HypeMarket docs, M for the date). Sub-second finality (600-900 ms claimed). Explorer `suprascan.io`. (H: technical-overview, wallets-and-networks)
- **Collateral:** native SUPRA only (`collateralToken == "0xa"`, coin standard, 8 decimals). All 132 markets use it. Docs mention possible stablecoin/FA collateral "may be added"; the `buy` (FA) entry function is mentioned in the Bot Guide but no market uses it. (H: API tally, supported-tokens page, bot guide)
- **Price of collateral:** SUPRA about $0.00013218 (HypeMarket `/price/supra`, source coingecko, 2026-10-19T00:21Z) and $0.00013305 (DefiLlama coins, ts 1792367579). Highly volatile unit; the market payout is in SUPRA, so USD value of any position floats. (H: both responses)
- **Contracts (mainnet):** `MARKET_PACKAGE` `0xbe08b388cc1a21ba8d8a514c1857369f4908d4b478bb8d66a369bfb9ca5a2da8`, `MARKET_HELPER_PACKAGE` `0x60063863e728b3be5c994c3474e08410cc6e8c1ea9cd4bddc07112bd267d6151`; each market is its own object address (e.g. El Clasico `0x11d749...e53a`). The package address matches the DefiLlama adapter constant `CONTRACT`. (H: bot guide, DefiLlama adapter source)
- **Supra signing key scheme:** Ed25519 Move accounts (Supra docs: "Built-in support for ED25519"; StarKey wallet). Supra EVM exists only as a **MultiVM testnet** in the docs fetched; HypeMarket is Move-only. (H: docs.supra.com/llms-full.txt, lines mentioning ED25519 and "SupraEVM MultiVM Testnet")

## 4. Read API

**Official/documented:**

- Docs index: `https://hypemarket-protocol.gitbook.io/hypemarket-protocol-docs/llms.txt`; every page also served as `.md`. The "API & Widgets" page says the full public read API, endpoint schemas, rate limits and widgets are **Phase 2 / to be published** (so the **REST API is only documented in the Bot Trading Guide, and only the `/markets` listing**). (H: developers/api-and-widgets.md, developers/bot-trading-guide.md)
- **REST (documented):** `GET https://api.hypemarket.trade/api/markets?status=open|resolved|closed|all&page=1&limit=50` returns `{data:{items,total,page,limit,favoriteMarketIds},success}`; item fields documented: `market, title, outcomes, outcomeCount, collateralToken, creatorFeeBps, status, expiresAt`. (H: confirmed live, `fixtures/.../api_markets_status-open_limit5_2026-10-19.json`)
- **On-chain views (documented):** `POST https://rpc-mainnet.supra.com/rpc/v3/view` with `{function, type_arguments, arguments}`; functions `market::get_prices`, `get_supplies`, `get_market_data`, `calculate_purchase_cost`, `calculate_sale_return`, `market_config_manager::get_protocol_fee_bps` / `get_user_fee_bps`, `market_helper::get_market_user_summary_batch`, `get_buy_price_impact_bps`, `get_sell_price_impact_bps`. u64 args must be JSON strings; `vector<u8>` is a hex string. **I did NOT call these** because they are POST (session rule: no POST). Shapes below are from the docs ("verified examples (live mainnet)"), not from my own calls. (H for the doc text, not exercised)
- **On-chain GET (not POST), exercised:** `GET https://rpc-mainnet.supra.com/rpc/v3/accounts/{market}/resources/{PKG}::market::MarketData` returns the full market state incl. `collateral_amount`, `status`, `alpha_config`, `creator_fee_bps`, `resolver`, `winning_outcome`, `redeemable_amount_per_share`, `expires_at`. This is the path the DefiLlama adapter uses. No rate-limit headers were returned. (H: `fixtures/.../supra_rpc_get_resource_MarketData_2026-10-19.json`)

**Undocumented but live (derived from the site's JS bundle, then confirmed by GET; treat as unstable) [M for stability, H that they respond]:**

| Endpoint | Result |
|---|---|
| `GET /markets/{marketAddress or slug}` | single market, same fields as list item (200) |
| `GET /market/price-history?market={addr}&range=1H\|24H\|7D\|ALL` | `{data:{market,points:[{at,prices:[atomic...]}]}}` (200; range is case-sensitive, `all` returns 400) |
| `GET /activities?market={addr}&limit=N[&outcome_index=&min_amount=&sort=newest\|oldest]` | trades: `who, username, action ("bought"/"sold"?), amount (shares atomic), cost (atomic SUPRA), outcomeIndex, outcomeName, atWhen, transactionHash`. Third-party identities redacted in the fixture. |
| `GET /market/holders?market={addr}[&outcome_index=]` | top holders per outcome (display names + atomic holdings) |
| `GET /dashboard` | platform stats (`totalVolume, volume30d, betsMade, totalUsers, totalTradeCount, activeTraderCount, totalTvl, totalTvlUsd, tvlAsOf`) plus the active-market list |
| `GET /price/supra` | `{symbol, price, currency, source:"coingecko", lastUpdatedAt}` |
| `GET /market/analytics?market=` | 401 Unauthorized (bearer token needed) |
| Other routes seen in JS (not called): `/users/*`, `/points/*`, `/referral/*`, `/quests/*`, `/leaderboard/volume`, `/market/comment*`, `/market/submit`, `/markets/market-create`, `/market/dispute_request`, `/ai/market-assistant/*`, `/login/*`, `/rewards/my-proofs` | write/auth endpoints, deliberately not touched |

- **Auth:** none for the GETs above. Docs say account-scoped access will use a wallet-signature (Sign-In with Supra / StarKey) flow; bearer token for `/market/analytics`. (H: api-and-widgets page; 401 response)
- **Rate limits:** response headers on `api.hypemarket.trade`: `ratelimit-policy: 120;w=60`, `ratelimit-limit: 120` (120 requests per 60 s, observed on `/markets`). Behind Cloudflare. `access-control-allow-origin: *`. (H: curl headers 2026-10-19). Supra RPC limits: NOT FOUND (searched: bot guide, response headers).
- **WebSocket / streaming:** NOT FOUND (searched: gitbook llms.txt index, bot guide, API & Widgets page, JS bundle for `wss://`/`WebSocket`). Docs promise "Webhooks" in Phase 2. Poll `/activities` and the chain.
- **Resolution data:** `status`, `statusHistory[]`, `disputeEndsAt`, `resolveNote`, `resolver`, and on-chain `winning_outcome` / `redeemable_amount_per_share`. (H: API fields)
- **Gotchas:**
  1. REST list/detail does **not** carry live prices. Live marginal prices need the POST `get_prices` view, or the last point of `price-history`.
  2. `price-history` lagged the chain: for the El Clasico market its last point is `2026-10-17T13:39:42.653Z`, while `/activities` shows a later buy at `18:12:39Z`. So the history endpoint is sampled or delayed (M; cause unknown). Do not use it as a live quote.
  3. `totalVolumeUSD` in market items is inconsistent with SUPRA's price (implied $0.42 per SUPRA vs $0.000132). Ignore it; compute USD from atomic SUPRA and `/price/supra`. Also `tvl` in market items is `0.00...` for all four active markets while the chain shows `collateral_amount > 0`. (H: data; M: that these API fields are simply unreliable)
  4. Sum of per-market `totalVolume` (about 511.8M SUPRA) differs from `/dashboard.totalVolume` (about 216.2M SUPRA). Unreconciled; DefiLlama's $56.4k all-time is the better anchor. (H data, cause NOT FOUND)
  5. All numeric fields are decimal strings of atomic units (10^8). `tvl`/`totalVolume` come as `"123.000000000000000000"`.

## 5. Trade path

- **Programmatic: yes, on-chain transactions only.** No order API, no signed-order/relayer path. "Writes that move funds are on-chain transactions signed by the wallet, not API calls." (H: api-and-widgets page)
- **Functions** (module `MARKET_PACKAGE::market`): `buy_with_coin<0x1::supra_coin::SupraCoin>(caller, market: address, outcomes: vector<u8>, amounts: vector<u64>, max_cost: u64)`; `sell(caller, market, outcomes, amounts, min_return)`; `redeem(caller, market)` (after CLOSED/VOIDED_CLOSED; claim is manual). Multi-outcome baskets in one call are possible (vectors). `max_cost` / `min_return` enforced on-chain, so a stale quote reverts rather than mis-fills. (H: bot guide)
- **Signing scheme:** Supra BCS-encoded entry-function transaction, signed by an Ed25519 key; Bot Guide uses `supra-l1-sdk` (`SupraClient`, `createRawTxObject`, `sendTxUsingSerializedRawTransaction`). Gas: Supra reserves `maxGas x gasUnitPrice` up front (guide: maxGas about 30,000, gasUnitPrice 100,000 = about 30 SUPRA held, far less consumed); sender must hold that. (H: bot guide; M for the 30 SUPRA arithmetic, mine)
- **Min trade:** 100 SUPRA per buy or sell (about $0.013 at today's price). No protocol maximum; limited by pool depth. (H: fees-and-limits)
- **Bots explicitly allowed in the docs:** "Bot accounts are ordinary Supra accounts - use a dedicated key with limited funds". (H)
- Never exercised by me: no wallet, no tx, no POST.

## 6. PayBox reachability

- **paybox_reachable: no.** PayBox `discover_tokens mode=chains` (live, 2026-10-19) lists 11 chains: Solana, Ethereum, Base, Arbitrum One, OP Mainnet, Polygon, BNB Smart Chain, Avalanche, Robinhood, Arc, Hyperliquid. A `query=Supra` search returned 0 chains (catalog is "not a support allowlist", so absence is evidence, not proof). (H)
- Supra Move transactions are Ed25519-signed BCS payloads, not EVM transactions or EIP-712/EIP-191 messages; no EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) can submit them, and SUPRA gas/collateral must sit on Supra L1. HypeMarket has no EVM contracts (Supra EVM is a MultiVM testnet per Supra docs). (H: docs; M: conclusion)
- Theoretical edge: a PayBox Solana wallet is also an Ed25519 key, so a Supra address could in principle be derived from the same key; whether `request_wallet_sign` can sign an arbitrary Supra signing message is unverified and no signing tools were called. Even then SUPRA funding on Supra L1 has no PayBox route. Treat as unreachable.

## 7. Fees

- **Protocol fee: 1% per trade, buy and sell**, user-facing, allocated: Ecosystem 0.30%, Supra Foundation 0.10%, Treasury 0.25%, HM Reward Pool 0.125%, Referral Pool 0.125%, Toonies NFT holders 0.10%. A future upgrade re-splits it (still 1%). (H: fees-and-limits). On-chain value read from `market_config_manager::get_protocol_fee_bps` and a per-market override (`override_protocol_fee_bps`, false on the sample market). I did not call the view; DefiLlama implied fee rate = $621.99 / $56,424 = 1.10% all-time (H data, M inference), consistent with 1% + small creator/user fees.
- **Creator fee: 0-2%** (`creator_fee_bps`), set per market, paid by the trader on top. Observed distribution over 132 markets: 50 bps x113, 100 bps x10, 200 bps x3, others 0/10/25/69/88/150. (H: API tally)
- **User fee (`userFeeBps`):** global, charged **on the creator fee** (`userFee = creatorFee * userBps / 10000`). Value NOT FOUND (needs the POST view; not in docs prose). (H: bot guide formula)
- **Who pays:** the trader, on both buy (added to cost) and sell (subtracted from return). Formulas (bot guide): buy `max_cost = (base + creator + protocol + user) * (1 + slip)`; sell `min_return = (base - creator - protocol - user) * (1 - slip)`; `base` is the LS-LMSR quote from `calculate_purchase_cost` / `calculate_sale_return`. (H)
- **Round-trip cost for an arb leg:** about `2 x (1% + creator_fee + userFee-on-creator)` plus LS-LMSR price impact, e.g. about 3% round trip at the typical 50 bps creator fee, plus about 7% (binary) to 16% (3-way) built-in price overround vs fair probability (section 2). No gas cost to speak of ($0.004 order of magnitude, M).
- **Rewards (HP points, referral, "Rewards Season and SUPRA airdrop")** exist and are anti-Sybil filtered; they may be driving some of the historic volume (M).

## 8. Resolution mechanism and dispute risk

- **Lifecycle (docs):** Created, Pending (admin review), Active, Resolved, Dispute Period (24-48 h; 2-4 h for Daily Markets), Closed. Dispute = post a bond; the **Resolver Board** (admins plus "verified users") approves or rejects; frivolous disputes forfeit the bond and cost HP. Winners must **claim manually** (`redeem`), unclaimed funds sweep to treasury after 90 days. Void returns all stakes. (H: market-lifecycle-and-disputes, fees-and-limits)
- **Price/crypto/forex/macro markets:** docs conflict. Technical Overview, Resolution Sources and the ToS say they resolve from **Supra DORA**; the "How HypeMarket Works" page says they resolve from "HypeMarket's own price oracle" and DORA integration is "in active development"; Roadmap Phase 1 also says "HypeMarket's own price oracle". Treat today's oracle as HypeMarket-operated. (H: the quotes; M: which is currently true)
- **Everything else (sports, politics, culture):** resolved by the Resolver Board from creator-listed sources (e.g. LaLiga for El Clasico). Market `resolutionSources` and `rulesDescription` are in the API. (H)
- **Central point of control:** the on-chain `resolver` field is the **same single address for all 132 markets** (`0x5afa68...9769`), and the contracts have "circuit breakers + multisig" admin controls and a PAUSED status. So resolution and pausing are effectively operator-controlled. (H: API tally and docs)
- **Observed behaviour vs docs:** for all 128 CLOSED markets, `RESOLVED -> CLOSED` status events are a median 57 s apart (min 25 s), and `disputeEndsAt` minus RESOLVED time has median about 0 h (max 24 h). The documented 24-48 h challenge window is not visible in practice. 38 markets passed through `UPDATE_REQUIRED` during admin review. (M: derived from API `statusHistory`; the on-chain status transitions may differ from backend history)
- **Known error mode:** the docs' own worked example shows a mis-resolved market ("resolver pulled pre-creation data") that only a user dispute would have fixed. (H: market-lifecycle page)
- **Audit status:** "A third-party smart-contract audit is planned and has not yet been performed"; DefiLlama `audits: "0"`; bug bounty planned, not live. (H: audits-and-security page, DefiLlama)
- **Rule mismatch vs other venues:** HypeMarket rules are creator-authored text with default observation window "creation to expiry" and statements like "regulation time only" (El Clasico). A cross-venue link must compare rulesDescription, not titles. Dispute or void risk is higher than on UMA/Kalshi-style venues. (M)

## 9. Geo, ToS, automation

- **Geo:** no country list found. ToS (preview) section 2: "You must not be a resident of, or located in, a jurisdiction where use of the Platform is prohibited, nor a restricted or sanctioned person"; Risks/Disclaimers: "HypeMarket may not be available to residents of certain jurisdictions". NOT FOUND (searched: ToS, Risks, Disclaimers, FAQ) any named blocked-country list or site geoblock; `beta.hypemarket.trade` served me HTML with no geoblock. (H)
- **Automation:** the Bot Trading Guide explicitly documents programmatic trading with a dedicated key. ToS section 8 prohibits "manipulate markets or resolutions" and Sybil/abuse of rewards; anti-Sybil filters use "funding-cluster, behavioral, and velocity checks, plus per-wallet caps" (affects HP/airdrop eligibility, not trading). No explicit API ToS or scraping restriction found; rate limit is 120 req/min on the REST API. (H)
- **Terms status:** "preview", final ToS to come. Governing law "to be specified". (H)

## 10. Liquidity (with dates)

| Metric | Value | Date | Source / tag |
|---|---|---|---|
| TVL | **$214.30** = 1,625,506 SUPRA | 2026-10-18 | DefiLlama protocol API (H) |
| TVL (own dashboard) | **$201.22** = 1,521,514 SUPRA | 2026-10-19T00:20Z | `GET /dashboard` (H) |
| TVL peak | $7,197 | 2026-06-16 (first day listed) | DefiLlama (H) |
| Volume 24h / 7d / 30d | **$0.86 / $1.91 / $6.89** | 2026-10-19 | `api.llama.fi/summary/dexs/hypemarket` (H) |
| Volume 30d, own dashboard | 45,051 SUPRA (about $5.95) | 2026-10-19 | `/dashboard.volume30d` (H) |
| Volume all-time | $56,424 | 2026-10-19 | DefiLlama (H); counts seed liquidity as volume |
| Fees all-time | $622 | 2026-10-19 | DefiLlama (H) |
| Users / trades | 400 users, 11,135 trades, 215 "active traders" | 2026-10-19 | `/dashboard` (H) |
| Biggest active market | BTC bucket market lifetime volume 1.42M SUPRA; NATO 1.13M; $CROWN 0.82M; El Clasico 0.57M (24h vol 6,180 SUPRA = under $1) | 2026-10-19 | API list (H), USD at $0.000132 is mine |
| El Clasico collateral | 221,600 SUPRA = about **$29** | 2026-10-19 | on-chain resource (H) |

- Typical order size that moves price: with alpha 5% and seed 171,704 shares per outcome, a few thousand SUPRA is already a visible move, but that is cents of USD. A reasonable arb is capped at well under $50 per market, below any realistic gas plus fee plus bridging cost.
- The SUPRA/USD price fell to $0.000132, so even historical "large" volume numbers in SUPRA terms (hundreds of millions) are small in USD. (M)

## 11. Event categories, overlap, shared liquidity

- **Category mix (132 markets):** SPORTS 117 (mostly FIFA World Cup 2026 matches and prop markets in June/July, then NFL opener, La Liga, Premier League totals), CRYPTO 12 (BTC price buckets, SUPRA price, small-token market-cap targets, SupraNova bridge), POLITICS 1, TECHNOLOGY 1, CULTURE 1. (H: API tally)
- **Active now (4):** El Clasico Barcelona vs Real Madrid 2026-10-25 (3-way); BTC price bucket on 2026-12-31 23:45 UTC via TradingView BINANCE:BTCUSDT (7 buckets); "Will the US formally initiate withdrawal from NATO in 2026" (binary); "Will Suprachamps $CROWN hit $250K market cap before Dec 31 2026" (binary, illiquid Supra-native token, not comparable). (H)
- **Overlap with other venues:** El Clasico (sportsbooks, Polymarket/Kalshi-style soccer markets), BTC year-end price (Polymarket, Kalshi, Limitless, Opinion), NATO withdrawal (Polymarket-type politics). That is where an arb could exist on paper, but liquidity is so small that the price signal is noise (11 unique traders, 12 trades on El Clasico over 6 weeks). (M)
- **Shares liquidity with another venue? No.** Its pools are its own Supra-native collateral; no sign of liquidity routing from or to any other venue. It is an independent leg, but an irrelevant one. (H: docs/contracts are self-contained; M: no cross-venue integration found)
- **Signal value:** none. Creator-seeded initial prices (LS-LMSR prior) and a few retail traders; do not feed into the Quotient/edge signal.

## 12. adapter_priority: skip

Reasons: $214 TVL, $7 of monthly volume, minimum trade nearly equals the whole price scale, volatile worthless-ish collateral (SUPRA about $0.00013), no PayBox/EVM path, centralised single-address resolver, no audit, ToS still "preview", market creation stalled since 2026-09-02, REST API officially unfinished (docs "Phase 2") although usable.

If someone later wants a read-only adapter anyway (cheap to build): `GET /markets?status=open`, then per market `GET /accounts/{market}/resources/{PKG}::market::MarketData` for state and the (POST) `get_prices` view for live prices (needs an exception to the no-POST rule in a build phase), normalise prices by their sum, treat `status != 2` as untradeable, and convert to USD with `/price/supra`. Revisit triggers: 30-day volume above about $50k, a second market-creation wave, an audit, or SUPRA collateral replaced by a stablecoin.

## 13. NOT FOUND / open questions

- **Websocket / event stream:** NOT FOUND (searched: docs index, bot guide, API page, JS bundle).
- **`userFeeBps` and exact on-chain `protocolFeeBps`:** NOT FOUND (needs POST view; searched bot guide text for numeric values; only formulas given).
- **Supra RPC rate limits:** NOT FOUND (searched headers and docs).
- **Rate-limit and uptime SLAs, ToS final text, named restricted jurisdictions:** NOT FOUND.
- **Contract source/ABI repo:** NOT FOUND (GitHub org has only two DefiLlama forks; docs say "module addresses, function signatures, ABIs will be published").
- **Whether price markets resolve today from DORA or from HypeMarket's own oracle:** docs conflict (section 8).
- **Why `price-history` lags the chain and why `totalVolumeUSD`/`tvl` fields in market items are off:** unknown.
- **Whether a PayBox Ed25519 (Solana) wallet could sign a Supra transaction:** untested (no signing tools may be called).
- **X/Telegram activity:** not fetched (X needs login; no browser automation).

## 14. Suspicious content

None found. Observations only: GitBook pages begin with a standard boilerplate pointer to `llms.txt` (not an instruction to act); the Bot Trading Guide contains developer instructions for human bot authors (env vars incl. a `BOT_PRIVATE_KEY` placeholder, `npm install supra-l1-sdk`), which I did not follow or run; the site embeds Google Tag Manager and an `attribution.metacrm.inc` tracker (normal analytics, not fetched).

## Sources

- [H] HypeMarket app home: https://beta.hypemarket.trade (curl 2026-10-19; 200; links to docs, X, Telegram, legal)
- [H] Docs index: https://hypemarket-protocol.gitbook.io/hypemarket-protocol-docs/llms.txt ; pages read as `.md`: introduction/hypemarket, the-basics/how-hypemarket-works, the-basics/fees-and-limits, the-basics/rewards, the-basics/how-to-earn-hp, for-creators/creating-a-market, for-creators/resolution-sources, knowledge-base/market-lifecycle-and-disputes, knowledge-base/wallets-and-networks, knowledge-base/supported-tokens-and-collateral, knowledge-base/faqs, developers/technical-overview, developers/smart-contracts, developers/bot-trading-guide, developers/api-and-widgets, developers/audits-and-security, legal/terms-of-service, legal/risks, legal/disclaimers, roadmap (all under `https://hypemarket-protocol.gitbook.io/hypemarket-protocol-docs/`)
- [H] REST API: https://api.hypemarket.trade/api/markets , /markets/{addr}, /market/price-history, /activities, /market/holders, /dashboard, /price/supra (GET, 2026-10-19; endpoints beyond `/markets` found in the app's JS bundle and then confirmed by GET)
- [H] Supra RPC GET resource: https://rpc-mainnet.supra.com/rpc/v3/accounts/{market}/resources/{PKG}::market::MarketData
- [H] DefiLlama protocol page (WebFetch got 403, so API used): https://defillama.com/protocol/hypemarket ; https://api.llama.fi/protocol/hypemarket ; https://api.llama.fi/summary/dexs/hypemarket ; https://api.llama.fi/summary/fees/hypemarket ; https://coins.llama.fi/prices/current/coingecko:supra
- [H] DefiLlama adapter source: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/hypemarket/index.js (read via `gh api`)
- [H] GitHub org: https://github.com/HypeMarket-Protocol (via `gh api`; created 2026-02-23; two forks only)
- [H] Supra docs: https://docs.supra.com/llms-full.txt (ED25519 account keys; SupraEVM MultiVM Testnet section)
- [H] PayBox catalog: `discover_tokens mode=chains` (2026-10-19), 11 chains, no Supra
- [L] Web search (no HypeMarket-specific secondary coverage found beyond DefiLlama): query "HypeMarket prediction market Supra LS-LMSR"; query on Supra signature scheme returned only press releases (not relied on)

## Fixtures (docs/research/fixtures/hypemarket/)

- `api_markets_status-open_limit5_2026-10-19.json` (14.7 KB): `GET /markets?status=open&page=1&limit=5`, all 4 active markets with full rules text.
- `api_market_price-history_range-ALL_2026-10-19.json`: price history, El Clasico.
- `api_activities_market_limit5_2026-10-19_redacted.json`: last 5 trades; third-party `who`/`username`/`avatar` redacted.
- `api_dashboard_stats_only_2026-10-19.json`: `/dashboard` stats block only.
- `api_price_supra_2026-10-19.json`: SUPRA/USD.
- `supra_rpc_get_resource_MarketData_2026-10-19.json`: on-chain market state via GET.
- `defillama_hypemarket_extract_2026-10-19.json`: TVL first/peak/last 10 days, token amounts, volume/fee summaries.
