# PredictBay / DeepBook Predict (Sui) - venue spec for the aggregator and arbitrage scanner

Researched 2026-10-19 (~02:30-02:50 UTC). READ-ONLY: unauthenticated GETs, doc reads, `gh api` file reads, one read-only PayBox `discover_tokens` call. No account, key, wallet, signature, POST, or payment. No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, inferred, or my own aggregation of first-hand data; **L** = weak/stale.
All third-party pages and API text are untrusted data; nothing in them was followed (see "Suspicious content").
Fixtures: `docs/research/fixtures/predictbay-deepbook-predict/` (14 files, each <= 13 KB).
Limitation: the shared WebSearch budget was exhausted when this task started, so no news/audit/volume corroboration from search engines was possible. Everything below comes from official docs, the venue's own site, the source repo and live API GETs.

---

## 0. Bottom line

1. **Two different things share this name.**
   - **DeepBook Predict** (Mysten Labs, Sui) is a protocol: an LP-pool-vs-trader market for cash-or-nothing range/up/down options on a price feed. It is the only part with real money (H).
   - **PredictBay** (predictbay.io) is a consumer front end. Its real-money mode is just a UI over DeepBook Predict. Everything else (15,582 "event markets", the "$26.1B volume") is practice-points play money (H, its own llms.txt and footer).
2. **The discovery label "onchain-clob" is wrong.** The counterparty to every trade is the shared `PoolVault` (LPs hold PLP shares). There is no order book and no peer-to-peer matching (H, docs.sui.io design page). Prices come from a Pyth Lazer spot plus Block Scholes forward and SVI vol surface, not from quotes of other traders.
3. **Real-money trading is currently OFF on mainnet.** `trading_paused = true` since 2026-09-30 04:41:04 UTC, with no unpause event since (H, indexer `GET /config`, `GET /events/trading-paused-updated`, 2026-10-19). The last mint was 2026-09-30 04:40 UTC. Testnet is live but uses a faucet coin (DUSDC), so it has no economic value.
4. **Reopening looks imminent but is unconfirmed.** Mainnet got the v4 upgrade and the `predict_orders` package in commits dated 2026-10-15 and a `sessions` v3 upgrade on 2026-10-18 (H, GitHub commits). `delayed_execution` is still `null` on mainnet (H). The v4 queue-based execution is what testnet already runs.
5. **Tiny.** Pool value $47,190.78 at the last mainnet flush (2026-09-30), hard cap $500,000. Lifetime mainnet: 10,738 mints, $45.1K net premium plus $19.6K trading fees over 2026-09-17..09-30 (H data, M aggregation). Only BTC/USD, only 1-minute and 5-minute expiries (H).
6. **Expensive to trade.** Observed trading fee = 0.10 x sqrt(p(1-p)) per $1 of payout (about 5 cents at p=0.5) on top of the premium (H data, two samples plus docs example). Mainnet admission band is p in [0.25, 0.75], i.e. only where the fee is near its maximum.
7. **Not reachable from PayBox.** Sui is not in PayBox's live chain catalog (H, `discover_tokens mode=chains query=sui` returned 0, 2026-10-19). It is not an EVM chain, so no EVM transaction proposal or signed order can trade it.
8. **Rank: P2.** Cheap, free, keyless read API worth watching and a possible fair-value signal for BTC short-expiry binaries, but not an execution leg. PredictBay the website alone would be `skip`.

---

## 1. Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| PredictBay site | predictbay.io returns 200 on 2026-10-19; `predictbay.com` returns 403 (Cloudflare); `.xyz`, `app.`/`docs.` subdomains do not resolve | H |
| Operator | ToS (effective 2026-06-01, updated 2026-07-01) names **PredictBay Inc., Panama**; the page footer says **PredictBay Pte. Ltd.** (inconsistent) | H |
| Stealth/press | Homepage cites a GlobeNewswire release dated 2026-08-19 ("$26.1 Billion in Paper Volume and 1-Minute Sui Prediction Markets"). The wboc.com copy returned HTTP 429 and the GlobeNewswire copy returned 403, so the body was not read. The headline is read first-hand from predictbay.io, the body content is not | H (headline) / not read |
| "Paper volume" | Homepage counters say "PRACTICE TRADING VOLUME"; footer: "Practice mode uses points" | H |
| Token | Homepage and roadmap say `$PBAY` fair-launched 2026-10-08 12:00 UTC on Sui via Cetus (contract string `0xe68a...05d2::pbay::PBAY`). DexScreener lookup of that coin type returned `pairs: null` (not verified on-chain). Token is irrelevant to the trading adapter | M |
| DeepBook Predict docs | docs.sui.io: "Both deployments went live on 2026-09-12" | H |
| Mainnet indexer | Fresh: `latest_onchain_checkpoint` 335596416 vs indexed 335596417 at 2026-10-19 02:31 UTC | H |
| Oracle feeds | Still streaming on mainnet: Pyth BTC spot 82,372.76 at 2026-10-19 02:37 UTC, SVI rows current | H |
| Repo README staleness | `packages/predict/README.md` still says "in development, not yet deployed" (stale versus the live deployments) | H |

---

## 2. Kind and market model

- **Kind:** on-chain options protocol with an LP-pool counterparty. House/pool model, priced by an oracle-driven formula. Not a CLOB, not parimutuel (H).
- **Contract:** European cash-settled **range digital**. Pays `quantity` ($1 per contract) if settlement price lands in `(lower_tick, higher_tick]`, else 0. UP/DOWN is a range with one open end: `up` = above strike, `down` = at or below. Sentinel ticks: 0 = -inf, 1073741823 = +inf; the fully open range is rejected (H, docs.sui.io overview, design, README).
- **Outcome tokenisation:** none. A position is an on-chain order record (`order_id`, `position_root_id`, `lower_tick`, `higher_tick`, `quantity`) held in the owner's account wrapper, not a transferable token (H, event `order-minted`). The one fungible token is **PLP** (LP share).
- **Strikes:** integer ticks, `raw_strike = tick x tick_size`; mainnet BTC `tick_size` = 10,000,000 (9-decimal fixed point, i.e. 0.01 USD) (M interpretation of H field).
- **Markets:** one `ExpiryMarket` object per (underlying, expiry). Mainnet has underlying id 1 = BTC_USD only. Cadence config on 2026-09-12 enabled cadences 0 and 1 with `window_size` 2 (two expiries live per cadence), cadences 2-5 zeroed (H, `GET /events/cadence-config-updated`). Docs name these the 1-minute and 5-minute cadences (H). A new market is seeded with `initial_expiry_cash` 2,000 USDC and `max_expiry_allocation` 10,000 USDC (H, `market_created`).
- **Quote shape:** the probability of a range is the difference of two boundary probabilities from an SVI curve; the forward is Pyth spot x Block Scholes basis. The entry probability must lie inside `[min_entry_probability, max_entry_probability]` = **[0.25, 0.75] on mainnet**, **[0.15, 0.85] on testnet markets created since 2026-10-13** (H, `market_created` events). Max entry probability overall 0.99; smallest position about 1.02 contracts; minimum premium 1 USDC; lot 0.01 USDC (H docs).
- **Execution modes (H docs + testnet `GET /config`):**
  - v3 (mainnet as documented): `mint`, `mintAmount`, `mintCost` fill immediately.
  - v4 (testnet since 2026-10-09; mainnet upgraded 2026-10-15 but policy not enabled): every mint/early sell is a **queued order**, priced at Pyth's signed price for an instant about 800 ms after placement (`delay_ms` 800), then filled or refunded by any keeper. Testnet policy: `mint_capacity` 100, `sell_capacity` 100, `per_account_cap` 5, `order_fee` 20000 raw (0.02 USDC). Immediate mint/redeem abort on v4. Trading closes 10 s before expiry (`no_trade_window_ms` 10000; mainnet manifest shows 2000 at deploy and `GET /config` 10000 now).

PredictBay's own text is looser and partly inconsistent with the protocol: its FAQ talks about "hourly or daily" markets, "more people predict Higher, payout for Lower increases" (parimutuel language), "positions cannot be exited early", and its ToS describes a leveraged "Boost" with a knock-out floor, whereas the protocol README says every position is 1x. Treat the PredictBay FAQ/ToS as generic marketing text; the protocol docs and on-chain data govern (M).

---

## 3. Chains and collateral

- **Chain:** Sui only. Mainnet chain id `35834a8a`, testnet `4c78adac` (H).
- **Collateral/settlement:** Circle native USDC on mainnet, 6 decimals, coin type `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`. Testnet uses a mintable test coin (DUSDC) via a Tally request form (H).
- **Mainnet packages (call targets, H docs.sui.io contract-information):** `predict` `0x08fa3ef1...ee53` (original id `0x89aea622...bbba`), `propbook` `0xa6c8f320...3831`, `account` `0x4e1dd014...5d58`, `sessions` `0xec678aee...0a1a`. Key shared objects: `poolVault` `0x4d227a1b...3b99`, `protocolConfig` `0x5fa6efbe...9580`, `registry` `0x94327dbc...beba`. Full list in the docs page; the mainnet `predict` package is **upgradeable and was upgraded v3 to v4 on 2026-10-15** (H, commit dbef4696).
- **PredictBay roadmap:** multichain deposits (ETH, SOL, Base, BNB) planned Q1 2027, "one-click bridge from EVM wallets" planned Q4 2026. Not shipped (H roadmap page, targets not promises).

---

## 4. Read API

**Official, public, no key, GET-only JSON, CORS `*`.** No rate limits documented and no rate-limit headers returned (H docs + response headers). Three sibling services per network:

| Service | Mainnet base URL (confirmed live 2026-10-19) | Testnet base URL |
|---|---|---|
| Predict | `https://deepbook-predict-server.mainnet.mystenlabs.com` | `https://deepbook-predict-server.testnet.mystenlabs.com` |
| Propbook (oracles) | `https://deepbook-propbook-server.mainnet.mystenlabs.com` | `https://deepbook-propbook-server.testnet.mystenlabs.com` |
| Account | `https://deepbook-account-server.mainnet.mystenlabs.com` | `https://deepbook-account-server.testnet.mystenlabs.com` |

Important: these hostnames are **not** in the docs. docs.sui.io (contract-information page) still lists `predict-server-v4.testnet.mystenlabs.com` etc., which do not resolve, and says "As of 2026-09-14 no indexed read service exists" for the current deployments. I found the working hosts in the Content-Security-Policy header of predictbay.io (a third-party source) and confirmed they answer `GET /status` with `status: OK` and sub-2-second lag for the current mainnet and testnet deployments (H for the responses, M for their stability: Mysten says its hostnames are operational endpoints that can change). Docs: `https://docs.sui.io/onchain-finance/deepbook/deepbook-predict/contract-information`.

Endpoints seen working (H, 2026-10-19):
- Predict: `GET /status`, `GET /config` (trading_paused, delayed_execution, no_trade_window_ms, max_lp_pool_value), `GET /markets?active=true&limit=N` (market metadata records, strings for numbers), `GET /markets/:expiry_market_id/state` (market, reference_tick, mint_paused, settlement, payouts_completed), `GET /markets/:id/open-interest` (open_order_count, open_quantity), `GET /vaults/:pool_vault_id/state` (idle balance, total_supply, pool_value, active_market_nav, latest flush/supply/withdraw fills), `GET /accounts/:account_id/positions` (documented, not exercised), `GET /events` (list of 20+ event resources) and `GET /events/:resource?limit=&cursor=&from_ms=&to_ms=` (cursor-paged, oldest first; I paged all 10,738 `order-minted` rows with limit=100 and no throttling).
- Propbook: `GET /oracle-bindings`, `GET /oracles/:pyth_feed_id/pyth/latest`, `GET /oracles/:svi_store_id/block-scholes/svi?limit=`, plus spot/forward variants (documented).
- Account: `GET /accounts/:account_id/portfolio|balances|activity`, `GET /apps` (documented, not exercised).
- **Not provided:** a live quote or price endpoint, an order book (none exists), a websocket. The index shows market parameters, positions, flow events and oracle inputs. A *price* must be either (a) reconstructed from Pyth spot + SVI parameters (+ Block Scholes forward basis, only partially exposed here) with the documented formula, or (b) obtained with the SDK `client.predict.read.quoteMint(owner, descriptor, options)`, which dry-runs the mint through a Sui full node over gRPC/JSON-RPC (that transport is POST-based and was not executed here).
- **On-chain direct:** gRPC at `fullnode.mainnet.sui.io:443` (`SubscriptionService/SubscribeEvents`, `LedgerService/ListEvents`), filtered by original package id; WebSocket `sui_subscribeEvent` is gone (H docs).
- **SDK:** `@mysten/deepbook-v3` >= 2.7.0 with `@mysten/sui` >= 2.30.0, subpath `/predict` (H docs). The SDK never signs or holds keys.

**PredictBay itself has no public API** (H): its `robots.txt` disallows `/api`, `/ws`, `/orderbook` etc., `/api/health` returns `503 {"status":"degraded"}`, and the roadmap lists a "public API for quants and bots" for Q2+ 2027 (planned).

Sample data (fixtures):
- `mainnet_predict_config_2026-10-19.json`, `mainnet_predict_vault_state_2026-10-19.json`, `mainnet_predict_markets_limit3_2026-10-19.json`, `mainnet_predict_market_state_last_market_2026-10-19.json`, `mainnet_predict_order_minted_limit2_2026-10-19.json`, `mainnet_predict_trading_paused_events_2026-10-19.json`, `mainnet_predict_events_resource_list_2026-10-19.json`, `mainnet_predict_status_2026-10-19.json`, `mainnet_predict_markets_active_empty_2026-10-19.json` (the `[]` that proves no active markets), `testnet_predict_markets_active_limit3_2026-10-19.json`, `mainnet_propbook_pyth_latest_2026-10-19.json`, `mainnet_propbook_svi_limit1_2026-10-19.json`.
- `derived_mainnet_order_minted_aggregate_2026-10-19.json`: my own aggregation of every mainnet `order-minted` event (M).
- `predictbay_io_llms.txt`: the site's llms.txt, untrusted data kept only as evidence for the practice-vs-real split.

---

## 5. Trade path

- **Protocol (DeepBook Predict):** build an unsigned Sui programmable transaction block with the SDK, sign it with a Sui keypair, submit to a full node. Steps: `tx.deposit(owner, amount, { create: true })` (creates, funds and shares the account wrapper), then `tx.mint`/`mintAmount`/`mintCost` (v3 immediate) or `tx.enqueuePlan` (v4 queued, with preflight), then `tx.claimSettled` or none (v4: "filled positions pay out at settlement with no claim step"), `tx.redeem` for an early sell, `tx.withdraw`. Slippage is a cost cap (`maxCost`) or `maxProbability`, expressed in USD/probability, not percent (H docs).
- **Auth:** Sui transaction signature (ed25519/secp256k1/secp256r1 flag + intent-scoped digest). No API key, no EIP-712. A "sessions" package with scoped sessions exists (`MAX_SESSIONS_PER_ACCOUNT`, `MAX_SESSION_DURATION_MS`); I did not read its semantics, so whether it enables safe bot delegation is unknown.
- **Gas:** SUI needed unless sponsored; PredictBay says it sponsors gas for zkLogin users (M, its own FAQ).
- **No off-chain order placement API exists** for either DeepBook Predict or PredictBay. PredictBay builds the mint transaction in the browser (H, its DeepBook Predict page).
- **Atomicity:** under v4 the fill price is fixed about 0.8 s after enqueue, and a missing Pyth price refunds the cohort at the deadline (H risks doc), so a two-leg cross-venue arbitrage cannot be atomic and leg-risk is real.

---

## 6. PayBox reachability

**No.**
- PayBox `discover_tokens mode=chains query=sui` returned `total_count 0` on 2026-10-19; the tool states the catalog is not a support allowlist, so this is strong evidence rather than proof (H). The sibling note for SuiBets reached the same result (11 chains listed, none Sui).
- DeepBook Predict is Move code on Sui, not EVM. No EVM wallet on Base/Ethereum/BNB/Arbitrum/Polygon can send it a transaction proposal or a signed order. Funds would first have to be bridged to Sui USDC (CCTP/other bridge; PayBox bridging to Sui unverified), and the signer would have to be a Sui-capable key.
- A PayBox Solana ed25519 key could in theory sign a Sui digest only if PayBox exposed raw-message signing for that purpose; not verified, not tested (signing tools are out of scope). Treat as unreachable.

---

## 7. Fees

| Fee | Formula / value | Payer | Tag |
|---|---|---|---|
| Trading fee | Charged at each finite boundary. Observed `trading_fee / quantity = 0.10 x sqrt(p(1-p))` with p the boundary probability. Verified on two mainnet mints: p=0.832695, fee 253,062 / qty 6,780,000 = 0.037323 vs 0.10x0.37325; p=0.641312, fee 346,282 / qty 7,220,000 = 0.047964 vs 0.10x0.47962. Docs example: 10% base fee at a 0.8/0.2 boundary = 0.04 per contract. Peaks at p=0.5 (0.05 per $1 payout). There is a floor (`min_fee`) and a ramp near expiry (`expiry_fee_window_ms` 60000, max multiplier 3x). The `base_fee` field in `market_created` reads 204000000 (0.204 at 1e9 scale), which does not equal the 0.10 coefficient I observed; the mapping between them is not explained in the docs I read | trader, additive to the premium | H data / M formula |
| Premium | `quantity x entry_probability` (e.g. 5,645,668 for qty 6,780,000 at p=0.8327) | trader | H |
| Fee subsidy | sponsor-funded reduction of trading fee (`fee_incentive_subsidy`); mainnet reserve $8,910.64 at last flush | sponsors | H |
| Builder fee | 10% of trading fee, capped at 0.5% of quantity, on top | trader | H docs |
| Referral | 10% of trading fee (net of subsidy), carved out of protocol fees, no extra cost to trader | protocol | H docs |
| Order fee (v4 queued) | 0.02 USDC per queued mint or early sell | trader | H testnet `GET /config` |
| LP withdraw fee | `withdraw_fee_rate` 2,000,000 = 0.2% (1e9 scale); supply fee 0 | LP | H vault state (M interpretation) |
| Congestion surcharge | disabled on mainnet, retired on v4 | n/a | H docs |
| Gas | SUI, small | trader | M |

Cumulative mainnet: $19,595 trading fees on $45,058 net premium, so fees were about 30% of premium paid (H data, M aggregation). For an arbitrage scan, any DeepBook Predict leg near p=0.5 needs a cross-venue gap of more than about 5 cents per $1 just to cover the fee, before the other venue's costs. Ranges (two boundaries) pay the fee at each boundary.

---

## 8. Resolution and dispute risk

- **Oracle:** settlement uses the exact Pyth Lazer price at the expiry timestamp; if that is unavailable 30 s after expiry, the exact Block Scholes minute-boundary spot is used; if neither is usable the market stays unsettled and retries. `try_settle` is permissionless and safe to repeat. Freshness windows: 2 s spot/forward, 60 s SVI (H docs).
- **No dispute process** is described (H docs.sui.io design page: "does not describe any dispute process"). Risk is oracle correctness (Pyth/Block Scholes thin print or manipulation is consumed as-is) plus admin controls (H risks.md).
- **Admin powers:** `AdminCap` sets fees, subsidy, freshness, caps, pause/freeze (sole authority to lift), flush-operator and order-flow allowlists, delayed-execution policy, can refund waiting orders; `PauseCap` can only pause or freeze. Package is upgradeable (it was upgraded 2026-10-15). The current 19-day mainnet pause is such a switch (H).
- **Audits:** the repo contains an internal "predict-audit" process and an "order-flow audit" note (commit 4c7903b1, 2026-10-13). I found no third-party audit report. PredictBay's FAQ claims "audited smart contracts" with published reports; NOT FOUND to verify (searched: docs.sui.io pages read, repo docs listing; web search unavailable).
- **PredictBay layer:** ToS says market rules may include manual intervention, extensions or cancellations and holds/freezes on withdrawals (H ToS 8.4, 9.x). These apply to its own off-chain practice markets, and could apply to its custody-adjacent features; the protocol layer settles on-chain regardless.

---

## 9. Geo, ToS, automation

- **Protocol (DeepBook Predict):** permissionless on-chain contracts; I found no protocol-level geo block or ToS in the docs read. NOT FOUND (searched: the four docs.sui.io DeepBook Predict pages, repo README/docs listing).
- **PredictBay ToS (H, predictbay.io/terms):** Restricted Jurisdictions "include, at a minimum: the United States ... Australia, Belgium, France, Germany, Italy, the Netherlands, Ontario and Quebec, Poland, Russia, Taiwan, Thailand, and the United Kingdom". Bots: you must not "use bots or automation except as expressly authorized (for example, through approved APIs)". Scraping "at scale without written permission" is also prohibited. No approved API exists yet.
- PredictBay FAQ says "accessible globally", which conflicts with the ToS list; the ToS governs.
- **Implication:** an automated agent should go through the protocol directly (SDK + own Sui key), not through predictbay.io. Readers of the read API are fine; automated trading through the PredictBay UI is not permitted.

---

## 10. Liquidity (mainnet unless stated)

| Metric | Value | Source and date |
|---|---|---|
| Pool value | $47,190.78 (pool_value 47,190,776,465 raw) | vault state, last flush 2026-09-30 04:39 UTC (H) |
| PLP supply | 41,471.66 PLP | same |
| Idle USDC / active market NAV | $41,435.44 / $5,755.33 | same |
| Pool hard cap | $500,000 (`max_lp_pool_value`) | `/config` 2026-10-19 (H) |
| Per-market allocation | $2,000 initial cash, $10,000 max | `market_created` (H) |
| Open interest now | 0 (no active markets; last market settled) | `/markets?active=true` = `[]`, `/open-interest` = 0 (H) |
| Lifetime mints | 10,738 orders, 1,070 distinct owner addresses, 5,129 distinct expiry markets, 2026-09-17 02:55 to 2026-09-30 04:40 UTC | `order-minted` paged (M aggregation of H data) |
| Lifetime premium / fees / notional | $45,057.89 net premium, $19,595.14 trading fees, $209,294.24 payout notional | same |
| Peak day | 2026-09-29: 3,054 mints, $9,939 premium | same |
| DefiLlama | No Predict or PredictBay entry in `/protocols` (only DeepBook V2/V3 spot DEX, V3 TVL about $13.0M, a different product) | api.llama.fi 2026-10-19 (H) |
| PredictBay "volume" | Practice points only; "$26.1B" is simulated | PredictBay site (H) |

Caveats: owner addresses are transaction senders and may include sponsor/bot wallets, so "1,070 users" is an upper bound. The $45K figure counts mints only (not early sells). Volume since 2026-09-30 is zero because trading is paused.

---

## 11. Event categories and overlap with other venues

- **DeepBook Predict (real money):** BTC/USD only, 1-minute and 5-minute expiry digitals. Overlaps in concept with short-duration crypto-price binaries on Polymarket, Kalshi, Limitless, Predict.fun, PancakeSwap Prediction, Hyperliquid HIP-4 outcomes. No sports, politics or macro. A like-for-like comparison needs an exact strike/expiry/reference-price match; its reference is Pyth Lazer BTC/USD, which differs from the Chainlink/Coinbase/Binance references other venues use (M).
- **PredictBay "event markets" (practice only):** llms.txt lists 15,582 open questions: sports 11,035, politics 685, finance 369, crypto 300, ai 226 and more. "Chance" = share of a practice pool, not a real price (H, its llms.txt). These are not a usable price signal. My inference (L): the catalogue mirrors Polymarket (robots.txt disallows CLOB-style paths such as `/midpoint`, `/last-trade-price`, `/nonce`; ToS and FAQ mention Polygon; "real-money trading on Polygon is paused"), so it would add no independent information even if its prices were real.
- Roadmap (planned, not shipped): politics/sports/macro event markets (Q4 2026), permissionless market creation and an oracle dispute layer (Q2 2027).

---

## 12. Shared liquidity

- PredictBay's Sui mode **is** the DeepBook Predict pool; it is the same liquidity, not a second leg (H, its DeepBook Predict page: "routes the trade to the protocol rather than to our order book"). Any other front end on the protocol shares it too.
- The DeepBook Predict pool is independent of Polymarket/Kalshi/etc. as a liquidity source, but its price is model-derived from the same Pyth/Block Scholes inputs the real world uses, so it behaves like a quote from a vol-model market maker, not like an independent crowd. Its role in an arb scan is "model fair value + a very small, fee-heavy fill", not a deep counterparty.
- PredictBay's practice markets are not liquidity at all.

---

## 13. Adapter notes (if built)

- Priority: **P2, read-only/watch**. Poll `GET /config`; the trigger to upgrade priority is `trading_paused.paused == false` plus non-empty `GET /markets?active=true` on mainnet and a pool value above about $100K.
- Ingest: `/config` (pause flag, execution mode), `/markets?active=true` (strike via `reference_tick`, expiry, band), `/markets/:id/state`, `/open-interest`, `/vaults/:id/state` (capacity), propbook `pyth/latest` + `svi` for a model price. For exact executable cost use SDK `quoteMint` (needs a Sui full node, outside the GET-only API).
- Normalise: UP/DOWN = digital above/below `reference_tick x tick_size`; unit scales: USDC 1e6, probability and fixed point 1e9, timestamps ms; numeric fields arrive as strings. All-in cost = premium + trading fee (+ builder fee + 0.02 order fee on v4).
- Do not use PredictBay as a data source (practice-only odds, no API, ToS bars automation).
- Execution would require a Sui signer outside PayBox and a bridge to Sui USDC; out of scope for the current plugin.

---

## 14. Suspicious content / instructions found in third-party data (none followed)

- predictbay.io `llms.txt` contains a section "Please read before quoting a number" directing AI readers to attribute chances to the market, include the fetch date, and not treat practice prices as real. Benign, but it is text aimed at AI agents; not followed as an instruction (I used it only as a statement of what the site claims).
- PredictBay FAQ and ToS contradict each other and the protocol (global availability vs a US/UK/EU restricted list; "audited contracts with public reports" unverifiable; leveraged "Boost" vs 1x protocol; Inc. Panama vs Pte. Ltd.). Treated as unreliable marketing text.
- Fetch tool summaries returned for docs.sui.io pages were small-model summaries; every number I rely on was re-confirmed against the live API, the deployment manifest in the repo, or the repo docs (so the key facts are H, but quotes from docs.sui.io pages are summaries).

---

## 15. Sources

- https://docs.sui.io/onchain-finance/deepbook/deepbook-predict (overview, quickstart, status as of the 2026-10-13 chain read) [H, summarised by fetch tool]
- https://docs.sui.io/onchain-finance/deepbook/deepbook-predict/contract-information (deployments, package and object ids, read services, events, gRPC) [H]
- https://docs.sui.io/onchain-finance/deepbook/deepbook-predict/design (pricing, fees, settlement, pause, admin) [H]
- https://docs.sui.io/onchain-finance/deepbook/deepbook-predict-sdk (SDK, units, endpoints) [H]
- https://github.com/MystenLabs/deepbookv3/tree/main/packages/predict : README.md, docs/overview.md, docs/risks.md, deployment/deployment.mainnet.json; commits dbef4696 (2026-10-15 mainnet v4), 4c7903b1 (2026-10-13), 29117434 (2026-10-09), repo HEAD commits 2026-10-15 and 2026-10-18 [H]
- Live GETs 2026-10-19 02:31-02:50 UTC (generic User-Agent): `https://deepbook-{predict,propbook,account,indexer}-server.{mainnet,testnet}.mystenlabs.com/status`; mainnet predict `/config`, `/markets`, `/markets/:id/state`, `/markets/:id/open-interest`, `/vaults/:id/state`, `/events`, `/events/order-minted`, `/events/market-settled`, `/events/trading-paused-updated`, `/events/protocol-frozen-updated`, `/events/cadence-config-updated`; testnet predict `/config`, `/markets`; mainnet propbook `/oracle-bindings`, `/oracles/:id/pyth/latest`, `/oracles/:id/block-scholes/svi` [H]
- https://predictbay.io (home, /faq, /roadmap, /deepbook-predict, /terms, /robots.txt, /llms.txt, /sitemap.xml, /api/health, response CSP header) [H for what the site says; M for truth of its claims]
- https://predictbay.io/whitepaper/PredictBay-Whitepaper-draft.pdf (downloaded; text streams could not be decoded, so NOT read)
- https://www.wboc.com/online_features/press_releases/predictbay-emerges-from-stealth-with-26-1-billion-in-paper-volume-and-1-minute-sui-prediction-markets-taking-aim-at-polymarket-and-kalshi (HTTP 429) and the GlobeNewswire copy (HTTP 403): not read
- https://api.llama.fi/protocols (2026-10-19): no DeepBook Predict / PredictBay entry [H]
- PayBox `discover_tokens` (mode=chains, query=sui), 2026-10-19: 0 results [H]
- Sibling repo notes: docs/research/venues/suibets.md (Sui not in PayBox; DeepBook Predict status 2026-09-30 pause) [M]
- Not available this session: WebSearch (shared budget exhausted), so no independent news, audit reports, or third-party volume figures.
