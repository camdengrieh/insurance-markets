# OmenX (omenx.com) - venue adapter spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:20-04:50 UTC; OmenX server time 1792384046 = 2026-10-19 04:27:26 UTC). READ-ONLY: unauthenticated GETs only (OmenX public REST, one-off cross-check GETs to Polymarket's public gamma/CLOB hosts), `gh api` raw file reads of a third-party repo, WebFetch of press pages. No account, wallet, key, signature, POST or browser automation. I never read the repo's `.env`. Nothing in this note is an OmenX address or credential of the user.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, inferred, or computed by me from H data; **L** = weak/stale/demo-only. Search budget note: WebSearch hit its session cap mid-task (one extended search succeeded), so press coverage below is thinner than usual.

Not Omen (Gnosis, see `omen-aiomen-gnosis.md`). Not related.

---

## 0. Bottom line

1. **Live and actively trading (2026-10-19).** `api.omenx.com/v1/status` -> `{"status":"OK","ready":true}`, 406 markets listed, order books updating within seconds, hourly candles through 04:00 UTC today. (H)
2. **It is a centralised, CEX-style leveraged venue, not an on-chain prediction market.** Off-chain cross-margin CLOB with API-key + HMAC auth, USDC accounts, internal resolution. "Base-native" in the press means deposits/withdrawals/settlement currency on Base; I found no order-book contract, no market token, no ABI, no contract address (H for the absence in the places I could read; see section 3). (M overall)
3. **The one surprise: a real, keyless, rate-limited public REST API exists** at `https://api.omenx.com/v1/` (markets, events, order books, trades, candles, funding, time, status). There is no public docs site I could reach; I mapped it by probing. Official docs host not found. (H)
4. **Not an independent price leg.** On overlapping markets OmenX quotes are pegged to Polymarket: 17 live markets (`PM_POLY_*`, `PM_PROD_*`) replicate Polymarket's book levels and sizes level for level, and a native Arsenal-Everton market matched Polymarket's touch on all three outcomes (section 11). 76% of the 12,000 most recent resolved events carry `EVT_POLY_` ids. So OmenX-vs-Polymarket "edge" is mostly latency/lag, not independent information. (H for samples, M for generalisation)
5. **Trade path is closed to a wallet-only agent.** Orders need an OmenX API key (`X-OMENX-API-KEY` + HMAC-SHA256) issued after login + TOTP 2FA + a deposit; the trading tier needs a deposit, >= $100 equity and one filled trade, and requires an IP whitelist. No signed-order / wallet-signature path found. PayBox can at most fund the account. (M, from a third-party blueprint repo that matches the live API; section 5)
6. **adapter_priority = P2** (read-only / signal adapter is cheap because the API is keyless; do not count OmenX as an arbitrage leg).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.omenx.com/v1/status` | `{"status":"OK","ready":true,"components":{"openapi":"up","nova":"up","vault":"up","stark":"up"},"server_ts_ms":1792384046890}` (fixture `status_2026-10-19.json`). Component names are as served; I do not know what nova/vault/stark are. | H |
| `GET /v1/markets` pages | 406 markets: 368 TRADING, 34 CLOSE_ONLY (reason RISK_CONTROL), 3 IN_REVIEW (RISK_CONTROL), 1 FROZEN (MANUAL_EMERGENCY) | H |
| `GET /v1/events` | 187 events, all TRADING; settle dates 2026-10-04 .. 2027-01-01 (a few past-dated events still TRADING, e.g. Brazil election event settle 2026-10-04, a LaLiga match dated 10-10: stale or awaiting resolution) | H |
| Latest candle/trade | trades timestamped within seconds of probe; 1h candle for 04:00 UTC present | H |
| History | `GET /v1/events?status=RESOLVED` returns > 12,000 resolved events (I stopped at 60 pages of 200); settle dates from 2026-06-03; earliest `created_ts_ms` 2026-05-03 | H |
| Site | `https://www.omenx.com` and `beta.omenx.com` return Cloudflare managed challenge (HTTP 403, `cf-mitigated: challenge`) to scripted clients; both resolve to Cloudflare IPs. `omenx.com` -> 301 -> `www.omenx.com` | H |
| Press | GlobeNewswire release republished 2026-05-19 (mainnet launch, Base, 5x at launch -> 10x planned; angel round Paramita VC, Penrose Ventures, M77 Ventures; founder "James"; media contact via EMERGE Group). Commissioned/sponsored content. https://cryptobriefing.com/omenx-launches-mainnet-as-the-first-live-leveraged-prediction-market-platform/ , https://www.manilatimes.net/2026/05/19/tmt-newswire/globenewswire/omenx-launches-mainnet-as-the-first-live-leveraged-prediction-market-platform/2347106 | H (that the release says this), M (claims) |
| Testnet | Public testnet announced 2026-03-30 (KuCoin flash); Base Sepolia (airdrops.io, Bitrue promo) | M |
| Third-party review | CoinGape "best leveraged prediction market platforms", updated 2026-09-04, ranks OmenX 5th of 5, "not audited", "internal" resolution; cites "$300.6M total volume", "7.6k unique traders", "52 active markets" with no sources or dates | M/L |

Verdict: **still_live = true.**

Official site/docs: `https://www.omenx.com` (named in the venue's own Terms of Service text and in CoinGape's links to `/en/insights` and `/en/terms-of-service`); not readable by me (Cloudflare challenge). The domain named in the task, `omenx.io`, resolves (Cloudflare) but timed out for me; `api.omenx.io` (the host shown in the front-end blueprint's code samples) does NOT resolve. `omenx.app` / `omenx.ai` are parking redirects to `/lander`. `api.omenx.com` serves the real API (nginx; the root path shows the default nginx page). X account `@OmenX_Official` per airdrops.io (M; the X page loads as a JS shell, contents unreadable).

---

## 2. Kind and market model

- **Kind:** centralised leveraged prediction-market exchange ("binary perpetuals" plus a daily spot line). Server-side matching, cross-margin accounts, funding, liquidations. `onchain-other` in the discovery list is misleading. (H for the model fields below; M for "centralised")
- **Market objects (H, `/v1/markets`):** `market_type` is `BINARY_PERP` (357) or `BINARY_SPOT` (49); `outcomes: ["YES","NO"]`; `position_sides: ["LONG","SHORT"]`; `quote_currency` and `settlement_currency` USDC; `margin_mode_supported: ["CROSS"]`; `tick_size 0.001`; price range 0.0001..0.9999; qty in "shares" (step 0.0001); order types LIMIT/MARKET; TIF GTC/IOC/FOK on perps (GTC only on spot); `maker_only_supported`, `partial_fill_supported`; `leverage_supported` true for perps, false for spot; per-market `constraints_version`.
- **Event structure (H, `/v1/events`):** `event_type` BINARY (109) or MULTIPLE_CHOICE (78). A multiple-choice event is a set of independent YES/NO binary markets (e.g. a soccer match = 3 markets: home / away / Draw; Ballon d'Or 3; Anthropic valuation 4). Each market has its own book; there is no combinatorial/NegRisk-style link visible, so sum-to-one checks across a multi-choice event must be done by the aggregator.
- **Perps (357 live):** positions on the YES outcome; LONG = YES, SHORT = NO (the NO side is a short on the YES price; confirmed by the book carrying only `view_outcome_side: "YES"`). Funding endpoint: `funding_axis YES`, `funding_formula_version BASIS_PLUS_PLATFORM_CARRY_V1`, `basis_funding_bps`, `platform_carry_bps`, `current_estimated_funding_rate_bps`, `next_settlement_ts_ms` (all 0/null on the sampled market). Close-only mode is used heavily (34 markets) as risk control. (H)
- **Daily spot line (49 live):** "<Company> Up or Down (date)" for ~49 US stocks (AAPL, NVDA, TSLA, ..., SPCX, CBRS), `trade_mode SPOT`, fully-collateralised, no leverage, `base_price` taken at series start (`base_price_source_id`, `base_price_status CONFIRMED`), `settlement_status PENDING`, `freeze_ts_ms` and `official_close_price_u` / `tie_policy` / `cancel_policy` fields reserved for settlement. (H)
- **Tokenisation (M):** none visible. Positions are ledger entries, not ERC-20/ERC-1155 tokens. The blueprint repo's transparency pages describe on-chain `TradeLogged` / `PositionLiquidated` audit events, but the code that renders them uses mock hashes and a placeholder address (the Base USDC address), so I treat on-chain audit logging as unverified (L).
- Not scalar. Not AMM, not parimutuel.

Identifiers: market ids like `E9RQVPJCK_NN6` (event id + 3-char suffix), `US_AAPL_20261019`, `PM_POLY_2299953` (suffix = a Polymarket gamma market id; verified, section 11), `PM_PROD_117001`.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Base (press: "built natively on Base"; ToS text in the blueprint repo: "All trades are denominated and settled in USDC on the Base blockchain") | H (press says), M (ToS from third-party repo) |
| Collateral / quote | USDC (API: `quote_currency`/`settlement_currency` USDC) | H |
| Deposit routes | Blueprint repo: crypto deposit to an address allocated by **Cobo custody**, **Banxa** (card, deposit only), **Socket** (cross-chain bridge widget, "30+ chains" per airdrops.io); repo chain logos: Arbitrum, Avalanche, Base, Bitcoin, BNB, Ethereum, Polygon, Solana, Tron. Production deposit address generation in the repo is a mock. | L/M |
| Contracts | NOT FOUND (searched: press releases, CoinGape, airdrops.io, Bitrue, the public API for any address field, a GitHub code search for the product, the blueprint repo for real addresses - the only address in the code is Base's native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, used as a placeholder in a mock audit hook) | - |
| Custody | Custodial exchange account (internal ledger: `balance`/`spot_balance` per blueprint). CoinGape: not audited. | M |

The task hint "Base-native" is therefore accurate only for funding rails; there is no on-chain trading venue to proposal-sign into.

---

## 4. Read API

**Docs:** NOT FOUND. Searched: `docs.omenx.com`, `developer(s).omenx.com`, `dev`, `api-docs`, `openapi`, `ws`, `stream`, `app`, `trade` (all NXDOMAIN), `omenx.gitbook.io` (404), `api.omenx.com/{openapi.json,docs,swagger.json}` (404), www.omenx.com (Cloudflare challenge). A third-party Lovable front-end repo (section 5) contains a `/developers` portal mock that advertises a "REST Reference", "WebSocket Guide" and "Agent Integration"; those pages are not reachable by me.

**Base URL (H):** `https://api.omenx.com` (nginx, AWS ALB cookies, Cloudflare not in front of the API host from my vantage). Paths below are `/v1/...`. The repo mock uses `https://api.omenx.io/v1` which does not resolve; use `.com`.

**Public, keyless endpoints confirmed by me (H, all HTTP 200 on 2026-10-19):**

| Endpoint | Notes |
|---|---|
| `GET /v1/time` | `{"server_ts_ms":...}` |
| `GET /v1/status` | health + component map |
| `GET /v1/events?limit<=200&cursor=&status=&trade_mode=` | `status` accepted: TRADING (default), RESOLVED; SETTLED rejected (400). Cursor is a page number string (`next_cursor` "2", null at end). |
| `GET /v1/events/{event_id}` | single event incl. `market_ids`, `settle_ts_ms`, `winning_outcome`, `settlement_price`, `settlement_status`, base-price fields |
| `GET /v1/markets?limit<=200&cursor=&status=&event_id=` | `status=SETTLED/CANCELLED` requires `event_id` (400 otherwise); `limit` > 200 -> `INVALID_LIMIT` |
| `GET /v1/markets/{market_id}` | constraints incl. `constraints_version` |
| `GET /v1/markets/{market_id}/book` | `{bids:[[price,qty]...], asks:[...], sequence, sequence_id, ts_ms, book_update_ts_ms, book_state, view_outcome_side:"YES", position_side:"LONG"}`; full depth returned (18-28 levels per side on samples), strings for prices/qty |
| `GET /v1/markets/{market_id}/trades` | last 50 trades `{trade_id "<ts>:<seq>", price, qty_share, ts_ms}`; no taker side field |
| `GET /v1/markets/{market_id}/candles?interval=1m|5m|15m|1h|4h|1d&limit=` | OHLC + `volume_share` (volume in shares, not USDC); `interval` mandatory |
| `GET /v1/markets/{market_id}/funding` | funding fields above |

Response shapes saved in `docs/research/fixtures/omenx/` (section 13).

**Authenticated (not tested):** every other `/v1/*` path (`/v1/orders`, `/v1/positions`, `/v1/account/funding`, `/v1/ws`, ...) returns HTTP 401 `{"error_code":"MISSING_API_KEY","message":"Missing API key","retryable":false,"outcome_unknown":false,...}` - note unknown paths under `/v1` also 401, so a 401 does not prove the endpoint exists. Wrong subpaths under a known resource (e.g. `/v1/markets/{id}/ticker`) give JSON 404. (H)

**Auth and limits (H for headers, M for interpretation):** responses carry `x-omenx-rate-limit-limit: 30000`, `x-omenx-rate-limit-category: registered_public_rest`, `-remaining` (counted down 29997 -> 29989 over my probes), `-reset-ms` (minute-aligned epoch ms, so probably a per-minute window; per IP or global not stated) and duplicate `x-ratelimit-*` headers. I issued roughly 2,000 GETs over ~30 minutes at up to ~10 req/s without a 429. Error envelope fields `request_id`, `retryable`, `outcome_unknown` (the last is a trading-ack hint, suggesting an idempotent order API).

**WebSocket:** NOT FOUND (URL or topics). The repo mock lists topics `market.snapshot`, `market.book`, `orders`, `positions` and scopes `ws_public` / `ws_private`; "9 WS topics" and the hero latency/uptime numbers are explicitly flagged DEMO-STATE in the repo. `/ws` and `/stream` on the API host are nginx 404, `/v1/ws` is the generic 401. Poll REST: book sequence numbers are exposed so deltas can be detected.

Polling cost for an aggregator: 1 call for `/v1/events` (187 events, ~49 KB) + 3 calls for `/v1/markets` (406 markets) per refresh of the catalogue; 1 call per market for the book. 400 books at 1 req/s per market-set is well under 30,000/min.

---

## 5. Trade path

- **Programmatic placement exists but only via an OmenX-issued API key** (H that the API is key-gated; M for the scheme below). Scheme from the third-party blueprint repo `liyaideal/tradeomenx` (see "Provenance" below): headers `X-OMENX-API-KEY`, `X-OMENX-TS`, `X-OMENX-SIGN`; signature = HMAC-SHA256 of `{timestamp}{method}{path}{body}` with the key secret; endpoints `POST /v1/orders/preview` (dry run returning `pricing_snapshot_id`, `estimated_fill_price`, `estimated_margin_u`, `fee_preview_u`, `expires_in_ms: 3000`), `POST /v1/orders` (idempotent by `client_order_id`, plus `Idempotency-Key`), `DELETE /v1/orders/{id}`, `GET /v1/positions`, `GET /v1/account/funding`. Order body: `market_id`, `outcome_side YES|NO`, `order_type LIMIT|MARKET`, `limit_price`, `size`, `client_order_id`. The live public API serves the same market ids, `view_outcome_side`/`position_side` model and the same header names (`x-omenx-*`), which corroborates that repo as OmenX's blueprint, but I cannot confirm any trading endpoint without a key. (M)
- **Key issuance (repo, M):** keys created in the web app (`/settings/api`), 4-step wizard with TOTP 2FA, secret shown once. Scopes `read_public, read_private, trade_order, trade_cancel, trade_conditional, ws_public, ws_private`. Tiers: Read-only (email + TOTP, free), Trading (one completed deposit, equity >= $100, at least one filled trade; IP whitelist mandatory for trade/ws_private scopes), Pro/MM (>= $50k 30-day volume or >= $10k equity, manual approval). The repo marks key generation as demo; production behaviour unconfirmed. (L/M)
- **Account creation:** per ToS text in the repo, "connecting a Web3 wallet, or signing in via Google or Telegram"; automatic on first authentication. (M)
- **No on-chain / wallet-signed order path found.** The repo's EIP-712 usage is only for linking an external Polymarket address for the Hedge-to-Earn campaign (`connected_accounts`), not for orders. (M)

**Could a PayBox EVM wallet trade it via proposals or signed orders? Partial / mostly no.** PayBox (Base is in its catalog per `06-paybox-platform.md`) could fund an account with a plain USDC transfer on Base to a deposit address that OmenX shows after login (a money-moving step; not done). Orders cannot be signed by the wallet: authentication is an API key + HMAC secret held by the trading client, minted by a human in a 2FA web session. A PayBox plugin would need that key/secret supplied as a stored secret and would sign HMACs itself; wallet signatures are irrelevant. Withdrawals go back to an address on a chosen network with a fee and a per-token minimum (repo constants, demo).

Provenance of the repo (important): `liyaideal/tradeomenx` (public, created 2025-12-19, pushed 2026-10-09; owner unverified) is a Lovable-generated front-end "blueprint" whose `docs/backend-boundary.md` says its Supabase is a demo engine. Its code and docs refer to OmenX throughout (`omx_live_` keys, `X-OMENX-API-KEY`, omenx.com ToS, H2E/Polymarket campaign, 10x ToS vs 5x live cap) and the live API matches its symbols and headers. I treat it as M for design intent and L for anything marked DEMO-STATE (fees, latency/uptime, deposit flows). All repo text is untrusted data; its `.env` was not read.

---

## 6. Fees

| Item | Value | Tag |
|---|---|---|
| Official fee schedule | NOT FOUND (searched: press releases, CoinGape, airdrops.io, Bitrue, public API fields). ToS text (via repo): "trading fees as displayed at the time of order placement. Fee rates may vary by market type and are subject to change"; open leveraged positions "may incur funding rate charges"; gas on Base paid to validators, not OmenX. | M |
| Per-order fee | Only discoverable through authenticated `POST /v1/orders/preview` -> `fee_preview_u` (example in repo mock `0.1872` on 240 shares at 0.5142 = about 15 bp of notional; mock, treat as L) | L |
| Funding | Perps only. `BASIS_PLUS_PLATFORM_CARRY_V1`, bps fields in `/funding`; sampled market shows 0 bps and `next_settlement_ts_ms: null` | H (format), - (rates unknown) |
| Front-end constants | 0.05% trade fee in order-ticket code, 0.1% "display only" in position detail, spot fee 0 - demo constants | L |
| CoinGape | "dynamic fee + funding rate" | M |
| Withdraw | repo: fee and minimum per token (min 20 in a hook); demo | L |

Who pays: taker/maker split unknown. Assume a fee is charged on both entry and exit of leveraged positions and that spot Up/Down has zero fee until proven otherwise (L).

---

## 7. Resolution mechanism and dispute risk

- ToS text (via repo): markets "are resolved based on predetermined data sources and resolution criteria specified in each market's Event Info... Resolution outcomes are final"; winners settle at $1.00, losers $0.00, automatically to the account balance. (M)
- No oracle contract, no UMA/Chainlink/optimistic path found. CoinGape: resolution source "internal system", disputes "handled internally", platform "not audited". (M)
- API fields exposing the outcome: `winning_outcome` (YES / NO / SPLIT / null), `settlement_price`, `settlement_version`, `settled_ts_ms`, `settlement_status`, `official_close_price_u`, `official_close_price_source_id`, `tie_policy`, `cancel_policy`. In the latest 12,000 resolved events: NO 5,720, YES 5,664, null 609 (5%; probably voided/cancelled, semantics unconfirmed), SPLIT 7. (H counts; M meaning)
- Spot stock line: blueprint says official close from Databento vs `base_price`; the sim in the repo is not the real rule. (L)
- Operational controls that matter for arbitrage: `CLOSE_ONLY`/`IN_REVIEW`/`FROZEN` with reasons `RISK_CONTROL` / `MANUAL_EMERGENCY`; 38 of 406 markets were non-tradable on probe, incl. three 5-minute crypto up/down markets in review. A hedge can get stuck. (H)
- Dispute risk: HIGH relative to on-chain venues (single operator decides; rules text per market is not in the public API; resolution source may differ from Polymarket's even for "the same" event, e.g. BTC up/down reference price). Perp positions are also subject to liquidation and funding, so a position is not guaranteed to be held to resolution.

---

## 8. Geo / ToS / automation

(All from the venue's ToS text as copied in the third-party repo `src/pages/TermsOfServicePage.tsx`; I could not read the live ToS. M.)
- Eligibility: 18+; user must not be in "any jurisdiction where the use of prediction markets or leveraged trading is prohibited or restricted by law"; OmenX "may restrict or deny access at sole discretion". No explicit country list found. US status unknown (NOT FOUND).
- Automation: prohibited activities include "Use bots, scripts, or automated tools to gain unfair advantages, **unless through officially supported APIs**" - API trading is allowed; wash trading, spoofing, layering, multi-accounting banned.
- Withdrawals can be delayed/restricted; disputes go to SIAC arbitration in Singapore, class-action waiver; leverage "up to 10x" in ToS vs 5x live cap (CoinGape).
- Incentives: the mainnet launch campaign pays volume-based bonuses/rebates ("first $5K of volume" etc.; repo FAQ) and a points/airdrop-farming programme exists (airdrops.io, Bitrue). Reported volume may therefore be inflated by incentive trading (M).
- Reading the public REST API: no ToS clause found against it; the API advertises a 30,000-per-window public quota. Keep the generic User-Agent.

---

## 9. Liquidity (all computed by me from the public API on 2026-10-19 ~04:30-04:45 UTC; M)

Method: for each of the 402 TRADING/CLOSE_ONLY markets I read the full book and 1d candles. "Within 5c" = USDC cost (price x shares) of resting orders within 5 cents of the mid, both sides. Sizes are in shares and prices are 0-1, so notional is USDC-equivalent exposure; with leverage the posted margin behind it can be a fraction. Resting size is displayed size, not tested by trading.

| Segment (live) | Markets | Median depth within 5c | Sum within 5c |
|---|---|---|---|
| Native sports (NBA, soccer, UFC, LoL) | 312 | $6.1k | $4.9M |
| Native crypto Up/Down (BTC/ETH/SOL, 5m..daily) | 21 (8 had no two-sided book) | $0.3k | $65k |
| Native US-stock daily Up/Down (spot) | 49 | $0.2k | $10k |
| Native other (Ballon d'Or, ...) | 3 | $27k | $113k |
| Polymarket-mirrored (`PM_POLY_*`, `PM_PROD_*`) | 17 | - | $2.7M (of which one Brazil-election market $1.6M) |

- Median touch spread 1c for sports, ~2c crypto and spot stocks; 212 of 402 markets quote <= 1c; 17 quote > 5c; 12 are one-sided or empty. (H data, M summary)
- **Volume (live markets only, price-band-mid x shares per UTC day; understates because markets that already resolved are excluded):** 2026-10-18: about $7.7M (of which $4.0M in two mirrored markets - Brazil election / F1, $2.8M spot stocks, $0.5M sports, $0.1M crypto); 2026-10-17: about $3.2M ($2.6M spot stocks); 2026-10-19 first 4.5 h: about $2.0M ($1.5M spot stocks). Spot-stock volume is large relative to the $10k of resting depth and trades arrive several per second with random sizes; I cannot say whether it is organic, market-maker flow or incentive volume. (M)
- Press figures: "$300.6M total volume", "7.6k unique traders", "4,000-7,000 daily traders", "52 active markets" (CoinGape, updated 2026-09-04, unsourced; 52 active markets conflicts with 406 listed today, so treat as stale/L). No TVL/OI endpoint; DefiLlama does not list OmenX (searched protocol list, 8,758 entries; its derivatives endpoint is paid, HTTP 402, not pursued). OI: NOT FOUND.

---

## 10. Event categories and overlap with other venues

Live catalogue by title (187 events): sports 113 (NBA 20, UEFA CL 18, UEL 18, UFC 11, LoL Worlds 8, Chinese Super League 8, Bundesliga 6, K League 6, LaLiga 6, Premier League 5, Serie A 5, Ligue 1 2) plus ~21 crypto Up/Down series; 49 US-stock daily Up/Down; politics/other: Brazil presidential election, F1 Drivers' Champion, Ballon d'Or 2026, Anthropic valuation thresholds.

| Category | Overlaps | Notes |
|---|---|---|
| Soccer / NBA / UFC / esports | Polymarket (Gamma has per-match 3-way markets), Kalshi, sportsbooks | Same event, same outcomes; resolution rules unknown (draw/extra-time/void) |
| BTC/ETH/SOL Up/Down 5m/15m/1h/4h/daily | Polymarket "Bitcoin Up or Down" series (verified a 15m window matches: OmenX 0.980/0.986 vs Polymarket CLOB 0.982/0.988) | Reference price/oracle likely differs; 5m markets also hit IN_REVIEW |
| US stock daily Up/Down | Polymarket / Kalshi daily stock up-down (not verified here) | Base price source id per stock; settlement rule unconfirmed |
| Politics / F1 / valuation | Polymarket (mirrored) | Not independent |
| Macro | none seen | - |

---

## 11. Does it share liquidity with another venue?

**Yes for 17 markets, and effectively pegged for sports.** (H samples)
- `PM_POLY_2299953` ("Anthropic valuation hit $2.5T") vs Polymarket gamma market 2299953 (Yes token) at the same minute: Polymarket bids 0.24 x 587.33, 0.23 x 9,451.24, 0.22 x 1,843.55, 0.21 x 531.29, 0.19 x 305; asks 0.25 x 20, 0.26 x 30, 0.27 x 204, 0.28 x 772.08, 0.29 x 4,249.77. OmenX: bids 0.24 x 234.93, 0.23 x 6,615.87, 0.22 x 1,843.55, 0.21 x 531.29, 0.19 x 305; asks 0.25 x 8, 0.26 x 21, 0.27 x 204, 0.28 x 772.08, 0.29 x 4,249.77. Identical prices and most identical sizes; the differences at the touch look like OmenX-native orders and self-trade netting. Second market (`PM_POLY_2299956`) the same pattern (fixture `book_mirror_check_PM_POLY_2299953_vs_polymarket_2026-10-19.json` holds the first).
- `PM_PROD_117001` (Kimi Antonelli F1 title) OmenX 0.975/0.979 = Polymarket 0.975/0.979.
- Native-id soccer match Arsenal v Everton: OmenX Arsenal 0.70/0.71, Draw 0.20/0.21, Everton 0.09/0.10 = Polymarket 0.70/0.71, 0.20/0.21, 0.09/0.10 (depth differs, so it is its own book but quoted off Polymarket's).
- 9,102 of the 12,000 most recent resolved events have `EVT_POLY_<id>` ids; the "Hedge-to-Earn" campaign (press release) targets Polymarket position holders and the repo has an `event_mappings` table for Polymarket/Kalshi events.
- Inference (M): OmenX market makers (or the platform) price off Polymarket and mirror some Polymarket books wholesale. Treat any OmenX vs Polymarket gap as a latency or fee artefact; OmenX is **not an independent probability source**. Possible genuine value: leverage/short access to Polymarket-priced outcomes, and OmenX-only listings (e.g. 49 stock Up/Down, 21 crypto windows) that could differ from Polymarket's on odd moments.

---

## 12. Adapter notes and priority

**adapter_priority: P2.** Reason: independent order book technically, but quotes are pegged to Polymarket; the trade path is a custodial account behind a human-gated API key (2FA, deposit, IP whitelist, jurisdiction clauses, no public docs); positions are leveraged perps with funding, liquidation and close-only risk controls; internal resolution with no dispute path. Upside: the public read API is excellent and free (full books, trades, candles, funding, resolved history), so a signal/reference adapter is a day of work. Revisit for P1 if: OmenX publishes trading API docs and a non-KYC key flow, volume outside mirrored/spot lines grows, or an independent (non-Polymarket-anchored) category appears.

If built (read-only):
- Poll `/v1/events` + `/v1/markets` (paged by `limit=200&cursor=n`) every few minutes; books per market on demand; watch `book_state`, `status` (skip non-TRADING, mark CLOSE_ONLY as non-tradable-open) and `constraints_version`.
- Normalise: price in 0-1 on YES; NO price = 1 - YES. Group multi-choice events by `event_id`; drop `PM_*`/`EVT_POLY_*` for independence tests but keep them as a "Polymarket proxy" quality check.
- Drop spot-stock markets from arb sets unless the settlement rule is confirmed; they are thin ($0.2k median depth).
- Treat `volume_share` as shares, not USDC.
- Resolution mapping: only after `status=RESOLVED` and `winning_outcome` non-null; handle SPLIT and null.
- Do not infer tradability from public reads.

---

## 13. Fixtures (real responses, each <= 50 KB) in `docs/research/fixtures/omenx/`

- `markets_sample_first3_of_406_2026-10-19.json` (trimmed `/v1/markets` page: 3 perps + 1 spot + 1 `PM_POLY_`)
- `events_sample_selected_2026-10-19.json` (6 representative events)
- `book_E9RQVPJCK_NN6_2026-10-19.json`, `book_US_AAPL_20261019_spot_2026-10-19.json`
- `trades_E9RQVPJCK_NN6_first15_2026-10-19.json`, `candles_1h_limit6_E9RQVPJCK_NN6_2026-10-19.json`, `funding_E9RQVPJCK_NN6_2026-10-19.json`
- `status_2026-10-19.json`, `time_2026-10-19.json`
- `book_mirror_check_PM_POLY_2299953_vs_polymarket_2026-10-19.json` (OmenX vs Polymarket top-5)
- `error_MISSING_API_KEY_GET_v1_orders_2026-10-19.json`, `response_headers_GET_v1_markets_2026-10-19.txt` (cookies stripped)

---

## 14. Sources

- OmenX public API, probed 2026-10-19: `https://api.omenx.com/v1/{time,status,events,markets,markets/{id},markets/{id}/book,trades,candles,funding}` (H)
- https://cryptobriefing.com/omenx-launches-mainnet-as-the-first-live-leveraged-prediction-market-platform/ (commissioned press release, 2026-05-19) (H that it says this; claims M)
- https://www.manilatimes.net/2026/05/19/tmt-newswire/globenewswire/omenx-launches-mainnet-as-the-first-live-leveraged-prediction-market-platform/2347106 (same release; roadmap includes "release API access") (M)
- https://www.bitget.com/news/detail/12560605418852 (BlockBeats summary, 2026-05-19) (M)
- https://coingape.com/best-leveraged-prediction-market-platforms/ (updated 2026-09-04; 5x live vs 10x ToS, CLOB on Base, internal resolution, unaudited, unsourced volume) (M/L)
- https://www.kucoin.com/news/flash/leveraged-prediction-platform-omenx-completes-million-dollar-seed-round (2026-03-30, seed round, Base planned) (M)
- https://www.bitrue.com/blog/what-is-omenx-prediction-market-innovation-2026 (promotional; testnet 2026-03-30, points) (L)
- https://airdrops.io/omenx/ (beta.omenx.com, X @OmenX_Official, no token announced) (L)
- GitHub `liyaideal/tradeomenx` files read via `gh api` raw: `README.md`, `docs/backend-boundary.md`, `docs/changelog/INDEX.md`, `docs/changelog/2026-07-20-api-surface-v2.md`, `src/pages/DevelopersPage.tsx`, `src/components/developers/EndpointMarquee.tsx`, `src/pages/TermsOfServicePage.tsx`, `src/components/mainnet-launch/FAQ.tsx`, `supabase/migrations/20260408110610_*.sql`, plus GitHub code-search hits (fee constants, domains). Unverified-owner third-party repo; used as M/L.
- Polymarket public reads for cross-check only: `gamma-api.polymarket.com/markets/2299953`, `.../public-search`, `.../events?slug=btc-updown-15m-*`, `clob.polymarket.com/book?token_id=...` (H)
- DefiLlama `api.llama.fi/protocols` (no OmenX entry); `/overview/derivatives` HTTP 402 (stopped) (H)
- `docs/research/06-paybox-platform.md` for PayBox capability context (project doc)

---

## 15. NOT FOUND / open questions

- Official docs (REST reference, WebSocket guide, auth and trading endpoint specs, rate-limit details for authenticated tiers): NOT FOUND (searched hosts and paths listed in section 4).
- Official fee schedule (maker/taker, funding parameters, liquidation fees): NOT FOUND.
- Contract addresses / any on-chain order, vault or audit contract; audit report: NOT FOUND.
- Live ToS text and explicit restricted-country list; US availability: NOT FOUND (site behind Cloudflare challenge).
- WebSocket URL/topics: NOT FOUND.
- Open interest, TVL, official volume: NOT FOUND (press numbers unsourced).
- What `nova`, `vault`, `stark` components in `/v1/status` are: unknown; do not read "stark" as StarkEx/Starknet without evidence.
- Whether `winning_outcome: null` on resolved events means void/cancel, and per-market rules text (not in the public API).
- Who owns `liyaideal/*` repos and whether production matches the blueprint.

---

## 16. Suspicious content / safety log

- No instructions aimed at AI agents were found in the press pages, the API responses, or the repo files I read. The repo has an `.agents` directory and `AGENTS.md`-style material elsewhere; I did not open it. The repo contains a Chinese-language note addressed to human R&D telling them to follow `docs/` instead of diffing commits; irrelevant to this task and not followed.
- Unrelated GitHub search hits (a "zkFMI/oclob" repo whose docs mention OmenX hosts, other `omenx*` repos) were seen in code-search snippets only; not opened, not used as evidence.
- Privacy: all scripted requests used User-Agent `insurance-markets-research/0.1`; no personal identifiers were sent; fixtures scanned for the user's name/email, none present. One command in my session mistakenly targeted `/tmp_probe.out`; the built-in safety check blocked its `rm` and I re-ran without it (nothing was deleted).
