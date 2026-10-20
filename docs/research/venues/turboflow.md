# TurboFlow (tf.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 02:5x UTC). READ-ONLY: doc reads, `gh api` raw file reads, static reads of the public web bundle, and unauthenticated GETs to `apis.turboflow.xyz`, `api.llama.fi`, `turboflow.gitbook.io`, `www.tf.xyz`. No account, wallet, API key, signature, POST/PUT/DELETE or money-moving PayBox tool was used (only the read-only `discover_plugins` / `discover_services` catalogue calls). Third-party text was treated as untrusted data; nothing in it was followed. WebSearch budget for the session was exhausted, so no fresh news search was possible (noted where it matters).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or inference from first-hand data; **L** = weak, unofficial or stale.

Relationship to an earlier note: `docs/research/venues/turboflow-prediction-markets.md` (same day, same venue, discovery slug) already exists. This note re-verifies its key claims independently, corrects two points (sports "Prediction" mechanics are partly visible in the client; the public trades feed is stale), and adds the weekly blackout config. The two agree on the verdict. Fixtures from this run are in `docs/research/fixtures/turboflow/`.

---

## 0. Bottom line

1. **Live and growing, but it is not a prediction market in the sense the aggregator needs.** The product DefiLlama calls "TurboFlow Prediction Markets" is **Event Contracts**: house-quoted, fixed-payout Higher/Lower price-direction bets (30 s to 1 h) on BTC, ETH, gold, silver and two Korean-equity-linked pairs. Counterparty is the platform / its market makers. There is no order book, no outcome token, no sell side for other users, and no event identity shared with other venues. (H)
2. **Volume is real: about 1.9M USD/day of event-contract stake** (2026-10-18, official metrics endpoint, H), 44.5M USD over 30 days (DefiLlama, H). But the per-order cap is 100 to 1000 USDT, and pricing carries a 5.8% to 17.6% overround (median 9.3%) in the live return-rate grid (H data, M derivation).
3. **No usable API for us.** No documented public API. Trading API is "beta, approved users only", gated at more than 100,000 USD cumulative volume plus an email application (H). A handful of undocumented unauthenticated JSON endpoints exist on `apis.turboflow.xyz` (config, klines, a stale trades list, daily metrics); the order path needs a Privy-issued session JWT (M/L). The realtime WebSocket handshake in the web client uses a client-embedded key and a signed timestamp (M), so it is not an open feed.
4. **Not reachable through PayBox for trading.** A PayBox BNB Chain or Solana wallet could at most send USDT/USDC to the user's TurboFlow deposit address. There is no contract call or signed order an agent could propose. (H docs + M inference.) PayBox has no TurboFlow plugin or service (H, catalogue search 2026-10-19: empty).
5. **US persons excluded by the Terms; the "prediction service" is geo-blocked by region in the client.** (H, bundle text.)
6. **adapter_priority = skip.** At most a watch-only feature feed later (poll `/public/pm/config?version=2`), but the return-rate skew is house inventory pricing, not an event probability, so it is a weak signal for edge detection.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Official metrics endpoint `GET https://apis.turboflow.xyz/defillama/metrics?date=2026-10-18` | 200. 624 DAU, 25,117 total users, 50,532 daily txs, event-contract volume 1,885,291 USD, perp volume 5,563,911 USD. Same endpoint for 2026-10-19 (partial day at 02:5x UTC): 403 DAU, 1,009,082 USD event volume. (fixtures `defillama_metrics_2026-10-18.json`, `..._2026-10-19_partial_day.json`) | H |
| DefiLlama `GET https://api.llama.fi/summary/dexs/turboflow-prediction-markets` | 24h 1,886,162; 7d 11,486,203; 30d 44,541,181; all-time (since 2026-03-25) 127,369,426 USD; change_1d -15.25%. Chains listed: Solana, BSC. (fixture `defillama_dexs_summary_trimmed_2026-10-19.json`) | H |
| Live config `GET /public/pm/config?version=2` | 200, 7 pairs all `enable: true`, rates differ from the earlier same-day note, i.e. it is actively re-quoted (fixture `pm_config_v2_2026-10-19.json`) | H |
| Funding | Pantera Capital post "Investing in TurboFlow", dated 2026-06-30, says Pantera is leading a 6M USD seed; claims "more than 15,000 registered users" and "over $19B in cumulative trading volume" during a six-month beta (company claim, mostly leveraged perps, L). Metrics endpoint shows 25,117 users on 2026-10-18, consistent in order of magnitude. (https://panteracapital.com/investing-in-turboflow/) | H (that it says this) / L (the figures) |
| GitHub org | `github.com/turboflow-xyz` created 2026-05-07, 3 repos, all forks (Solana explorer, two DefiLlama repos); explorer last pushed 2026-08-19. No API or contract repo. | H |
| Press (The Block 2026-06-22 funding story) | Seen only as a search snippet in the earlier run; not fetched here (403 on press sites earlier; no search budget now). | M |
| Staleness | Docs have no dated changelog. Event-contract volume series starts 2026-03-25 (DefiLlama), so the product is about 7 months old. | H |

Verdict: **still_live = true**, young (series starts 2026-03-25), and volume has risen steeply: DefiLlama's first daily point is 26,680 USD (2026-03-25) against 1,886,162 USD on 2026-10-18 (H, `totalDataChart`), roughly 70x.

---

## 2. Kind and market model

**Product map (H, https://turboflow.gitbook.io/whitepaper/llms.txt and product pages):** Classic Perps, Turbo Perps (1000x, zero fee, profit share), **Event Contracts**, and a beta **Prediction** section (sports/esports). DefiLlama files the Event Contracts + football under category "Prediction Market" (slug `turboflow-prediction-markets`), perps under "TurboFlow Perps" (Derivatives).

### 2a. Event Contracts (essentially all of the "prediction market" volume)

- Mechanics (H, https://turboflow.gitbook.io/whitepaper/turboflow/products/event-contracts): pick market, duration, stake, **Higher** or **Lower**. Enter Price = "market price when the order is accepted"; Exit Price = price at settlement time; both "determined through TurboFlow's oracle-based pricing system under the platform's official settlement rules". Correct direction pays the Return Rate locked at confirmation; wrong direction loses the full stake; "if the settlement result is unchanged under platform rules, the principal is returned". No margin, funding or liquidation.
- Model: **not** binary-with-complementary-tokens, not categorical, not scalar, not AMM, not order book, not parimutuel. It is a **fixed-payout, house-priced, taker-only** contract. Position = an account-ledger record (pair_id, duration, side, stake, locked return_rate); no transferable token (M: nothing in docs or client suggests one; `sellable` / `is_early_sell` flags in trade rows hint at an early-exit "resell" feature, L).
- Live grid (H, fixture `pm_config_v2_2026-10-19.json`): 7 pairs: BTC/USDT, ETH/USDT, XAU/USDT, GOLD/USD, SILVER/USD, SKHYNIX/USDT, SKHY/USDT. 46 pair-duration rows. Durations seen: 30, 60, 180, 300, 600, 900, 1800, 3600 s (docs list only 30 s to 1 h and only BTC, ETH, XAU, XAG: the live product is wider than the docs). Stake min 2 USDT, max 100 to 1000 USDT per order depending on pair/duration (BTC 5m max 1000, ETH 5m max 800). The `durations` array at pair level disagrees with the `order_configs` list (use `order_configs`).
- Pricing: each row has separate `ask_return_rate` (Higher side per the unofficial SDK mapping, L) and `bid_return_rate` (Lower). Examples at 2026-10-19 02:5x UTC: BTC 30s 0.80 / 0.91; BTC 5m 0.83 / 0.83; BTC 1h 0.77 / 0.83; ETH 30s 0.88 / 0.89. Break-even win probability for a stake at rate r is 1/(1+r). For BTC 5m that is 54.6% on each side, i.e. the two sides sum to about 109%. Across all 46 rows the implied overround is **5.8% to 17.6%, median 9.3%** (M, my arithmetic on H data). Config also carries `oracle_cfg.refresh_interval = 2` (seconds, M), and `rr_sum_total` targets 1.6 / 1.65 / 1.7 for ask+bid by duration (M).
- FAQ (H): return rate is "dynamically quoted based on real-time market conditions, rather than being fixed by the platform".
- Weekly blackout windows (H, `GET /public/pm/blackout/config`, fixture `public_pm_blackout_config_trimmed_2026-10-19.json`): metals and the Korean-equity pairs only trade inside listed windows for the current week (week_start 1792339200 = 2026-10-18 16:00 UTC to 2026-10-25 16:00 UTC; text appears to be UTC+8, M); no rule returned for BTC or ETH. A scanner must treat those pairs as closed outside the windows.
- Uniqueness caveat: the event is "price at accept time vs price at accept time + duration" for an arbitrary accept time. There is no shared market identifier with any other venue.

### 2b. "Prediction" (sports/esports) section

- Docs (H, https://turboflow.gitbook.io/whitepaper/turboflow/products/prediction): categories "may include" Football, LoL, F1, Dota 2, Basketball; odds format, order book/AMM and settlement source are not documented.
- Client bundle strings (M, static read of `https://www.tf.xyz/assets/main-DnmkLxn4.js`): the football page shows an "AMM trading panel": "buy prediction shares instantly at the live share price", Buy / Partial Sell / Sell All, "Real-time share price via WebSocket", a stage-structured tournament market, and the disclaimer "does not act as a counterparty to user trades". The same bundle contains a demo string ("Demo: order recorded locally (no on-chain action)") and sample prices that look like placeholders (e.g. "Arsenal 4.20 / Manchester City 4.80"), plus "{{sport}} Prediction Markets ... Coming soon" copy. Nav tag is `beta`. So the sports side looks like an AMM share market in development, partly demo.
- Real volume is negligible: `footballVolumeUsd` = 870 USD on 2026-10-18 and 15 USD on 2026-10-19 so far (H, metrics endpoint); 1,553 USD on 2026-10-17 (earlier note, M for this run).
- No public endpoint for the sports market list was found (searched: web bundle chunks `prediction`, `predictionMarkets`, `MarketsList`, `EventDetail`, `SportContext`; gitbook; llms.txt). NOT FOUND.

---

## 3. Chains and collateral

- Execution chain: TurboFlow's own **SVM-compatible** chain (H: https://turboflow.gitbook.io/whitepaper/turboflow/turboflow-core/execution-layer says "Compatible with the Solana Virtual Machine", "100,000+ TPS"). Chain id, RPC, program addresses, explorer URL: NOT FOUND in docs (searched: llms.txt, execution-layer, FAQ, deposits page, GitHub org). The bundle builds the SVM RPC URL as `https://rpc.tf.xyz/svm` with a websocket at `wss://rpc.tf.xyz/ws` for prod (H, bundle code; I did not call it), and a test host `svm-sit.turboflow-test.xyz`. The org's explorer fork is a retitled Solana explorer (M).
- Funding rails (H, https://turboflow.gitbook.io/whitepaper/turboflow/resources/deposits-and-withdrawals): deposit **USDT or USDC via Solana or BNB Chain** only. Quote currency USDT; USDC balances "may reflect a premium or discount" against USDT. Per-order stakes are in USDT (`coin_code "1"`).
- Wallet model (H, FAQ): Privy-generated wallet bound to the account after login; Pantera calls it self-custodial (L) but orders are submitted to a REST API with a session token (L, from unofficial SDK), so treat it as custodial-style account balance for integration purposes.
- Withdrawals: "certain withdrawal thresholds or behaviors may trigger additional review", "temporary restrictions" possible (H).
- DefiLlama TVL for "TurboFlow Perps" (not the prediction listing): 6.68M USD (BSC 5.89M, Solana 0.78M) on 2026-10-19 (H, `api.llama.fi/protocols`); the prediction-markets listing has no TVL.

---

## 4. Read API

**Official public API: none documented.** The docs list only a gated "API Trading" page (H, https://turboflow.gitbook.io/whitepaper/turboflow/professional-access/api-trading): "API access is currently in beta and available to approved users only"; eligibility "more than $100,000 in cumulative trading volume"; apply by email with UID and account email. Market Making and Builder Code are likewise application-only (H, llms.txt index). No OpenAPI, SDK or developer docs found.

Undocumented but unauthenticated. Hosts: `apis.tf.xyz` is what the production web bundle builds when the page is served from `tf.xyz` (and `apis.turboflow.xyz` when served from `turboflow.xyz`); DefiLlama's adapter uses `apis.turboflow.xyz`. Both hosts answered 200 and `/public/pm/blackout/config` was byte-identical on both (H). All fixtures here came from `apis.turboflow.xyz`. Envelope for all: `{"errno":"200","msg":"success","data":...}`; errors carry a string errno. Treat all as subject to change without notice.

| Endpoint | What | Verified | Fixture |
|---|---|---|---|
| `GET /public/pm/config?version=2` | Event-contract grid: pair_id, pair_name, enable, per-duration ask/bid return rates, min/max stake, `oracle_cfg`, `global_configs` | H, 200, 6.3 KB | `pm_config_v2_2026-10-19.json` |
| `GET /public/pm/blackout/config` | Weekly trading windows per pair (unix ranges + text) | H, 200, 9 KB | `public_pm_blackout_config_trimmed_2026-10-19.json` |
| `GET /public/pm/trades?page_num=1&page_size=N` | Recent trades list (id, pair_id, symbol, side, amount, duration, entry_price, return_rate, status, settled_price, realized_pnl). **Looks stale**: ignored `page_size=5` and returned 100 rows, all created 2026-10-16 15:06 to 15:09 UTC, i.e. about 3 days old at fetch time; BTC entry ~81.5k vs ~82.6k live. Not a live trade tape. | H (shape), M (staleness inference) | `public_pm_trades_trimmed_2026-10-19.json` (5 rows, handles redacted) |
| `GET /public/pm/ranks?limit=3` | Leaderboard (rank, total_amount, total_pnl, win_cnt, loss_cnt) plus `vol_24h` = 31,368,765.96 and `total_trader` = 111,765. These do not reconcile with the metrics endpoint (1.9M/day, 25k users); semantics unknown. | H (shape), L (meaning) | `public_pm_ranks_redacted_2026-10-19.json` |
| `GET /market/kline?spot_token_key=6&granularity=1m&limit=3` | OHLCV candles (`o,h,l,c,v,g,t`; t = unix seconds; `spot_token_key` = pair_id, 6 = BTC) | H, 200 | `market_kline_btc_1m_limit3_2026-10-19.json` |
| `GET /defillama/metrics?date=YYYY-MM-DD` | Daily aggregates: users, perp / event / football / prediction volume, fees, revenue. Built for DefiLlama. | H, 200 | `defillama_metrics_2026-10-18.json` |

Auth and limits: the public endpoints above need no header. Rate limit is undocumented. An earlier same-day run saw `{"errno":"10010004","msg":"Rate limit exceeded..."}` after about 14 requests in about 40 s from one IP (M, secondhand; I stayed at about 1 request per 3 s and was not limited, H). CORS response headers are present (`access-control-allow-credentials: true`, `access-control-max-age: 86400`). The site's robots.txt disallows `/api` on `tf.xyz` (not the `apis.` host) (H).

Authenticated paths seen in the web bundle (M, names only, not called): `/account/pm/order/submit`, `/account/pm/positions`, `/account/pm/histories`, `/account/frontend/setting`.

WebSocket: the web client connects to `wss://<api host>/realtime` and uses channel names such as `dex_all_ticker`, `dex_ticker.<pair>`, `dex_public_trade`, `dex_position`, `dex_trade`, `dex_asset` (M, bundle strings). The handshake builder in the bundle signs `method=GET&path=/realtime&timestamp=...&access-key=...` with a client-embedded key (M). I did not connect, and I did not copy or use that key. Message schema: NOT FOUND. Channels `dex_predict_*` named in an earlier note come from an unofficial README and do not appear in the official bundle (searched: all chunks I fetched).

NOT FOUND (searched: gitbook llms.txt and linked pages, tf.xyz llms.txt, robots.txt, web bundle and the prediction / event chunks, GitHub org): a documented market-list endpoint for sports; any order book or depth endpoint (none exists for Event Contracts); a resolution / settlement feed; an OpenAPI spec; official rate limits; on-chain program IDs.

---

## 5. Trade path

- **Official:** none for us. API Trading is beta, invite-by-email, 100k USD volume gate, so no programmatic path is available without an application the project has not made.
- **How the app does it (L/M):** Privy login, then REST with a bearer session JWT. The unofficial Rust SDK (https://github.com/linshengyyy/turboflow-rs, 11 stars, last push 2026-06-26, README in Chinese, self-described "reverse engineering", read via `gh api`, not cloned or run) documents `POST /account/pm/order/submit` with `Authorization: Bearer <JWT>` and a `uid` header and body `{account_id, amount, duration, order_way (1 Higher / 2 Lower), pair_id, pool_id: 1, coin_code: "1", return_rate (percent int)}`. Its README says to copy the JWT from browser dev tools. That is a human-session credential taken from a browser, outside the Terms ("unauthorized means"), and I did not test it.
- No per-order wallet signature (EIP-712 / ed25519 order) is evident (L). Slippage protection is the client-supplied `return_rate`. Documented confirmation latency 300 to 500 ms ("All trades require onchain confirmation") (H).
- Cancel: not applicable; contracts are not cancellable (an early-exit "resell" flow seems to exist for durations of 300 s or more: `global_configs.resell_min_duration_sec = 300`, `resell_rfq_duration_ms = 15000`; undocumented, L).

---

## 6. PayBox reachability

**paybox_reachable = no** (for trading).

- Funding only: a PayBox-managed BNB Chain (EVM) or Solana wallet could do an ordinary ERC-20 / SPL transfer of USDT or USDC to the user's TurboFlow deposit address (H docs list those rails; the deposit address is shown only after logging into the app, M). That is a plain transfer, not a trade.
- There is no on-chain contract call, EIP-712 typed order or Solana instruction documented that an agent could propose through PayBox to open a position. Execution is on TurboFlow's private SVM chain, not Base / Ethereum / Arbitrum / Polygon.
- PayBox catalogue check on 2026-10-19: `discover_plugins("turboflow")` returned no plugins; `discover_services("turboflow")` returned an empty curated catalogue (H). No money-moving PayBox tool was called.

---

## 7. Fees

- **Event Contracts:** the docs have no explicit fee line (the Fee Schedule page covers only Classic Perps and Turbo Perps, per its llms.txt description and earlier note, H). The cost is embedded in the sub-100% Return Rate: the 5.8% to 17.6% overround above (M derived).
- **Reported fees (H, metrics endpoint):** `eventContractsFeesUsd` = 25,254 USD on 1,885,291 USD volume on 2026-10-18 (1.34%); 15,086 on 1,009,082 so far on 2026-10-19 (1.50%). This does not reconcile with a 9% overround on balanced flow (open question: "fee" may be only part of house take, flow may be unbalanced, or volume double-counts entries and exits; DefiLlama says "entering and exiting a position are each counted as a trade").
- **Who pays / where it goes:** users; "All prediction-market fees accrue to the protocol (no rebates or LP-vault share)" (H, DefiLlama methodology; the metrics endpoint shows `lpVaultShareUsd` 0).
- Perps (out of scope): Classic 0.02% to 0.08% per side plus funding; Turbo Perps zero fee with profit share on winners (H, FAQ and llms.txt).
- Gas: not applicable on the venue (account ledger); deposits and withdrawals pay normal network fees on Solana / BSC.

---

## 8. Resolution, geo, ToS, automation

- **Resolution (H docs):** automatic at expiry from "TurboFlow's oracle-based pricing system under the platform's official settlement rules". Oracle source (Chainlink / Pyth / CEX composite), flat tolerance, and sports edge-case rules are NOT FOUND. There is **no dispute process**; the operator is the oracle and the settler. Docs for sports say only that "Rules for postponed, cancelled, interrupted, or otherwise exceptional events may vary depending on the relevant market".
- **Geo:** ToS text in the web bundle (read 2026-10-19; effective date not re-verified): users must "Not be a resident of, or located in, any jurisdiction where the use of our services would violate applicable laws (including, but not limited to, the United States and any sanctioned regions)." The client also has a `PredictionRestrictedPage` showing "Due to regulatory requirements, our prediction service is not yet available in your country/region." (H, bundle). The list of blocked regions is NOT FOUND.
- **Automation:** no explicit bot clause found. Relevant ToS strings (H, bundle): prohibited "Access or attempt to access any portion of the Platform through unauthorized means or bypass its security systems"; users must not use "multiple accounts to exploit or bypass system mechanisms", and node operators may "review, adjust, or amend related rules". Docs add review triggers for "attempts to bypass trading rules" and "abnormal trading behavior" (H, deposits page). Sanctioned programmatic path = approved API only.
- **Operational limits (H, config and FAQ):** `order_interval` 1000 ms; per-duration and platform-wide unsettled-position caps.

---

## 9. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Event-contract stake volume, 24h | 1,885,291 USD | official metrics endpoint, 2026-10-18 | H |
| Prediction total (event + football), 24h | 1,886,162 USD | DefiLlama, 2026-10-18 | H |
| 7d / 30d / since 2026-03-25 | 11.49M / 44.54M / 127.37M USD | DefiLlama, fetched 2026-10-19 | H |
| Perp volume, same day | 5.56M USD | metrics endpoint, 2026-10-18 | H |
| Football / sports volume | 870 USD (2026-10-18), 15 USD (2026-10-19 partial) | metrics endpoint | H |
| Users | 25,117 total, 624 DAU | metrics endpoint, 2026-10-18 | H |
| Open interest / depth | No OI or depth published. Per-order cap 100 to 1000 USDT; sum of all 46 per-order caps is 16,800 USDT. | live config | H |
| TVL (perps listing) | 6.68M USD | DefiLlama, 2026-10-19 | H |
| Leaderboard `vol_24h` | 31.37M USD | `/public/pm/ranks`, 2026-10-19 | L (does not reconcile) |

Volume methodology is stake notional, single-sided, with entries and exits both counted. It is a flow figure, not resting liquidity: the counterparty is the house, so "liquidity" is its risk appetite, shown only through the per-order caps.

---

## 10. Event overlap and arbitrage relevance

- Overlap categories: **crypto price only** (BTC, ETH). Gold, silver and the Korean-equity-linked pairs have no counterpart on the prediction venues in this project; sports/esports overlap exists in name only (volume under 2k USD/day, partly demo).
- Conceptual comparables (M, general knowledge, not verified this session; covered by the parallel workflow): short-dated "BTC/ETH up or down" windows on Polymarket and Kalshi. Those resolve on fixed clock windows against a named reference price; TurboFlow's Enter Price is the price at order acceptance against its own oracle. Reference price, window boundaries and oracle all differ, so no clean arbitrage identity exists: any cross-venue pairing is a basis trade with oracle and timing risk.
- Taker-only: you buy at the quoted rate, cannot post a bid, cannot sell the other side to other users, cannot provide liquidity. Edge must clear a 5.8% to 17.6% house overround before venue fees elsewhere.
- Only plausible exploitable edge: stale quotes (rates refresh about every 2 s) versus a fast price feed, i.e. latency arbitrage against the operator. That is the operator's explicit target for "abnormal trading behavior" controls and a ToS risk, and the venue can void or review. (L/M)
- Signal value (L): ask/bid skew may reflect house inventory or market-maker lean. Untested, noisy, and not a probability of any event.

---

## 11. Shared liquidity

Not shared with another prediction venue as far as found: the counterparty is TurboFlow's own pool / market makers (H FAQ: liquidity "supported through a working partnership with Susquehanna Crypto"; Pantera note names no partners). Backing is shared with TurboFlow Perps (same account balance and vaults, M). So it is an independent counterparty, but **not an independent arbitrage leg**, because there is no matching event identity and no sell side.

---

## 12. Adapter recommendation

- **adapter_priority: skip.**
- Why: no official public API; trading API gated by 100k USD volume plus email approval; ToS excludes US persons and forbids unauthorised access; no event identity shared with other venues; taker-only at a 6% to 18% house overround; operator-controlled oracle and settlement with no dispute path; tiny per-order size; no PayBox-reachable trade path; sports side is demo-grade and nearly volume-free.
- Revisit trigger: an official public API or a published sports market list with real volume; or a need for a crypto short-horizon sentiment feature.
- If ever done as watch-only (P2): poll `GET /public/pm/config?version=2` every 5 to 10 s and `GET /market/kline` for candles, respect the blackout config, store ask/bid skew as a weak feature. No trade integration without approved API access (contact address per docs; not contacted).

---

## Open questions

1. What oracle and price source define Enter / Exit Price, and what is the "flat" tolerance?
2. Official Trading API schema, auth (HMAC? JWT?) and rate limits once approved.
3. Why do reported fees (1.3% to 1.5% of volume) differ from the 6% to 18% implied overround? And what does `/public/pm/ranks` `vol_24h` (31M) measure?
4. Is the sports "Prediction" product live with real settlement, or still demo / beta? Where is its market list served? Is it truly an AMM share market with an operator that is "not a counterparty"?
5. Chain id, program addresses and explorer for the SVM chain; can positions and settlements be verified on-chain as the docs imply ("All TurboFlow trades require onchain confirmation")?
6. Which regions does the "prediction service" geo-block cover?
7. Is the `/public/pm/trades` list a deliberately cached sample, or broken?

---

## Suspicious / embedded-instruction content (recorded, not followed)

- `https://www.tf.xyz/llms.txt` has an "Information-Use Guidance" block addressed to AI products (treat the gitbook / live UI as source of truth; do not present investor commentary or historical metrics as audited facts). Benign and consistent with our tagging; ignored as an instruction.
- Every gitbook `.md` page starts with an AI-directed hint ("For the complete documentation index, see llms.txt..."). Benign navigation hint.
- Third-party README (`linshengyyy/turboflow-rs`) encourages scripted order placement with a JWT copied from the browser. Not followed; no code run.
- Web bundle embeds a client access key and a handshake-signing routine for the WebSocket. Observed as static text only; not used and not recorded here.
- Earlier run reported (unread) a third-party offensive-security recon file about TurboFlow's SVM bridge (`rickyananda/hermes-skills`, path under `red-teaming/solana-anchor-recon/references/`). I did not open it; flagging only as an unverified (L) security-risk signal for the bridge.

---

## Fixtures (`docs/research/fixtures/turboflow/`, each under 50 KB, user handles redacted)

- `pm_config_v2_2026-10-19.json` (live event-contract grid, 6.3 KB)
- `public_pm_blackout_config_trimmed_2026-10-19.json`
- `public_pm_trades_trimmed_2026-10-19.json` (5 of 100 rows; shows the stale-timestamp issue)
- `public_pm_ranks_redacted_2026-10-19.json`
- `market_kline_btc_1m_limit3_2026-10-19.json`
- `defillama_metrics_2026-10-18.json`, `defillama_metrics_2026-10-19_partial_day.json`
- `defillama_dexs_summary_trimmed_2026-10-19.json`
- `gitbook_llms_index_2026-10-19.txt`

---

## Sources

- H: https://www.tf.xyz/ (homepage HTML), https://www.tf.xyz/robots.txt, https://www.tf.xyz/llms.txt, https://www.tf.xyz/assets/main-DnmkLxn4.js and chunks `usePmApi-DFTq8pPF.js`, `PredictionRestrictedPage-CdTPM1ts.js`, `predictionMarkets-BVJH0fjL.js`, `prediction-dJhOneFq.js`, `MarketsList-3xTuT3iO.js`, `EventDetail-COXR2Zh-.js`, `SportContext-CWuO6Ym7.js` (static text reads; ToS and geo strings; endpoint names)
- H: https://turboflow.gitbook.io/whitepaper/llms.txt and pages `products/event-contracts`, `products/prediction`, `professional-access/api-trading`, `resources/deposits-and-withdrawals`, `resources/faq`, `turboflow-core/execution-layer` (fetched as `.md`)
- H: https://apis.turboflow.xyz/public/pm/config?version=2 , /public/pm/blackout/config , /public/pm/trades , /public/pm/ranks , /market/kline , /defillama/metrics (unauthenticated GETs, 2026-10-19)
- H: https://api.llama.fi/summary/dexs/turboflow-prediction-markets ; https://api.llama.fi/protocols (TurboFlow Perps and Prediction Markets entries)
- H: https://github.com/DefiLlama/dimension-adapters (`dexs/turboflow-prediction-markets/index.ts`, `helpers/turboflow.ts`, read via `gh api`)
- H: https://github.com/turboflow-xyz (org listing via `gh api`)
- H (that it says so), L (the figures): https://panteracapital.com/investing-in-turboflow/ (2026-06-30)
- L: https://github.com/linshengyyy/turboflow-rs (unofficial reverse-engineering SDK, README read via `gh api`)
- M: earlier same-day note `docs/research/venues/turboflow-prediction-markets.md` (cited only where marked "earlier note"; its facts that I re-verified are tagged H above)
- Could not fetch: https://defillama.com/protocol/turboflow-prediction-markets (HTTP 403 for the web page; the API was used instead); `app.tf.xyz` (does not resolve; the app is served at `tf.xyz`). WebSearch was unavailable (session budget exhausted), so no news search was run in this pass.
