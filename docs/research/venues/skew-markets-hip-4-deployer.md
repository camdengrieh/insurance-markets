# Skew Markets (HIP-4 deployer) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran ~01:30-01:40 UTC). READ-ONLY: web/doc reads, static reading (never executing) of the public app JS bundle, `gh api` file reads, unauthenticated GETs, and short unauthenticated WebSocket `subscribe` frames to the public Hyperliquid WS (an HTTP GET upgrade; I never used the WS `post` method). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/computation from first-hand data; **L** = weak, single-source or stale. "NOT FOUND (searched: ...)" = not documented where I looked.

Scope note: Skew is a *deployer* inside Hyperliquid HIP-4, not a separate exchange. The protocol-level facts (asset ids, merged Yes/No book, WS limits, signing, USDC funding, base fee structure) are already written up in `docs/research/venues/hyperliquid-outcomes-hip-4.md` and `docs/research/venues/outcome-xyz.md`; this file only records what is Skew-specific and re-checks the numbers for Skew's slice.

Method limits: Hyperliquid's `POST /info outcomeMeta` is POST-only and forbidden here, so I could not read Skew's market titles/descriptions from chain. Skew attribution of live coins uses the outcome-id list published on loris.tools/hip4/skew (M); it matched Loris's "61 currently active" exactly against the live coins (see section 10). A web-search budget limit stopped further news searching late in the session (news claims below rest on the pages I did fetch).

---

## 0. Bottom line

1. **Live, but tiny and in private beta.** Mainnet trading since 2026-08-30 19:39 UTC per Skew's own docs (H, docs.skew.trade/markets/btc-hourly). App at app.skew.trade is a waitlist/beta front end (H: `/api/v1/auth/waitlist` paths in its bundle; hint says beta). Live Hyperliquid books for 61 Skew Yes-coins exist right now (H, my WS capture 2026-10-19 01:33 UTC).
2. **Not an independent leg.** Skew markets are ordinary HIP-4 outcome coins (`#<10*outcome+side>`) on HyperCore's shared exchange, tagged with `venue "skew"` (H, docs). Same books API, same account, same collateral as every other HIP-4 deployer. One `hyperliquid-hip4` adapter covers it; a separate Skew adapter would double count (H/M).
3. **Very thin.** Loris 30-day Skew volume $359K "notional", 6,448 trades, 223 traders, EOD OI ~$4.1K, fees $57 (M, Loris page data stamped 2026-10-19 00:36 UTC) = roughly 0.6-0.8% of all HIP-4 (sibling note: $45-60M/30d, M). My live capture: only ~10 of 61 live Skew books have any shares outstanding (5,685 Yes shares, ~$5.7K collateral, 96% of it in one market) and the 24h notional on those coins is $79 (H data, M interpretation). 41 of 61 books are wing-only (bid ~0.01-0.03 / ask ~0.97-0.99); the 11 books with a real two-sided quote are 10-13 cents wide.
4. **Product = short-dated BTC / S&P 500 / Nasdaq-100 above-strike ladders**, settled by Skew itself from a Hyperliquid perp tape or Pyth over a 90-second window. Overlap with other venues is crypto-price and equity-index only; no sports, politics or macro (H, docs + app whitelist).
5. **Platform API is login-gated** (`api.skew.trade` returns 403 "authentication required" unauthenticated; H). Public data = Hyperliquid's own keyless WS/info API.
6. **adapter_priority = skip** (as its own adapter). Keep "deployer = skew" as a tag/filter inside the HIP-4 adapter and treat Skew quotes as untrusted for edge detection (wing quotes make phantom arbitrage). Reasons in section 14.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Skew docs: "Live and trading since 2026-08-30 19:39 UTC ... one market has been open continuously since"; "All six families above are live on mainnet" | https://docs.skew.trade (llms-full.txt, fetched 2026-10-19) | H (operator claim) |
| Live Hyperliquid coins matching Skew's outcome-id list: **61 Yes-coins** (outcome ids 11422-14246), mids moving, books updating; newest id 14246 minted within the hour | my WS capture 2026-10-19 01:33-01:36 UTC; fixtures `ws_skew_*` | H data / M attribution |
| Loris: 2,459 Skew markets tracked in 30 days, 61 active, data updated 2026-10-19 00:36 UTC | https://loris.tools/hip4/skew | H (page text) |
| app.skew.trade index `last-modified` 2026-10-16T20:12:20Z; docs.skew.trade served `last-modified` 2026-10-19 (Vercel) ; Terms updated 2026-09-02 | HTTP headers | H |
| Skew front-end builder code (`0x094A...F713`) shows non-zero outcome volume on every sampled day 2026-10-06..10-18 (peak $18.3K on 10-07) and zero on the 8 sampled days 2026-09-01..10-05 | hl-indexer.llama.rip GET, fixture `hl-indexer_skew_builder_outcome_daily_...json` | H (data) |
| Hyperion DeFi HAUS agreement with Skew announced 2026-07-15 | GlobeNewswire release via QuiverQuant; The Block 2026-07-15 | M |
| Hint: "second builder live after Outcome ... 40k private-beta registrants as of 2026-08-06" (KuCoin/Odaily) | NOT re-verified (searched: Datawallet article, The Block, QuiverQuant; search budget exhausted). Datawallet (updated 2026-09-03) does say Skew deployed on 2026-08-30, the day after Outcome.xyz's 2026-08-29 first permissionless deployment | L / M |
| x.com/SkewTrade | WebFetch returned HTTP 402 Payment Required; no body, I stopped there (no payment requirements to record) | - |

Verdict: **still_live = true** (operating, auto-minting hourly, but near-zero activity).

---

## 2. Kind and market model

- **Kind (H):** on-chain CLOB, native to HyperCore, via HIP-4 outcome markets. Skew deploys and settles markets; Hyperliquid matches and clears. No Skew matching engine, no AMM, no parimutuel. See sibling note for protocol detail.
- **Outcome tokens (H, docs.skew.trade/markets/btc-hourly + HL asset-ids):** each market `N` (outcome id) has Yes = encoding `10*N` (coin `#10N`, asset id `100,000,000+10N`) and No = `10N+1`. Binary only today ("This is the shape of every market listed today"). Ladders = several independent binary markets at different strikes with the same expiry. Scalar and multi-outcome "question" shapes are described as future ("documented as they list").
- **Template (H):** all live markets use validator-voted template `binaryPrice` (Loris shows `template:binaryPrice` for every top Skew market). Rendered name: `BTC above {strike} at {YYYYMMDD-HHMM}?`; immutable on-chain keywords `perp`, `priceDescription`, `seconds:90`, `threshold`, `time` (docs).
- **Venue / dex name (H, docs):** outcomes carry `venue "skew"` (mainnet) and `pewt` (testnet). HL rule: venue name is 2-4 lowercase letters, unique across all deployers including deactivated ones (HL deployer-actions page).
- **Live market families (H, docs.skew.trade/markets/overview; matches the app's hard-coded whitelist of BTC / US500 / NSDQ):**

| Family | Cadence / expiry | Strike rule | Rungs | Feed |
|---|---|---|---|---|
| BTC Hourly | hourly except 06:00 UTC (23/day) | exact: trailing-90s trade VWAP at mint, whole dollars | 1 (one market at a time) | HL BTC perp trade tape, size-weighted VWAP |
| BTC 4-Hour | 00:30, 04:30 ... 20:30 UTC | `round(VWAP,75)` offsets -250/0/+250 | 3 | same perp tape |
| BTC Daily | 06:00 UTC | `round(ref,250)` offsets -600/+600 (no middle) | 2 | HL BTC perp 1-minute candles, confidence-weighted |
| BTC Weekly | Mon/Wed/Fri 06:00 UTC, 168 h lanes | `round(TWAP,250)` offsets -2300/0/+2300 | 3 x 3 lanes | Pyth `Crypto.BTC/USD` |
| US500 Weekly | Mon/Wed/Fri 16:00 America/New_York (20:00 UTC EDT / 21:00 EST) | `round(TWAP,35)` offsets -75/0/+75 | 3 x 3 lanes | Pyth `Equity.Index.US500/USD` (hedge `xyz:SP500`) |
| NSDQ Weekly | same schedule | `round(TWAP,245)` offsets -525/0/+525 | 3 x 3 lanes | Pyth `Equity.Index.US100/USD` (hedge `xyz:XYZ100`) |

- **Docs vs app schedule mismatch (H, static read):** the app's cadence whitelist (`market-catalog` chunk) lists BTC cron strings `0 * * * *`, `0 0,4,8,12,16,20 * * *` (4h on the hour, docs say :30), `0 12 * * *` (daily at 12:00, docs say 06:00 UTC), `0 16 * * 1,3,5` and `0 8 * * 1,5` (docs say Mon/Wed/Fri 06:00 UTC), and `0 16 * * 1,3,5` for US500/NSDQ. Cron timezone is unstated (NOT FOUND), so either the docs are stale or the strings use another zone. The adapter must take `expiry` from each market row, never from the documented schedule.
- **Catalog drift (H/M):** the hint mentions ZEC/Pyth markets. Current docs and app whitelist list only BTC/US500/NSDQ; Loris shows earlier (expired) Skew markets "HYPE above $88 on Sep 25 at 8:00 PM UTC?" and "XYZ:SP500 above $7,740 ... Sep 25" (H, loris.tools/hip4/3991, /4139). So the catalog has changed since launch; do not hard-code families.
- **Price/size domain:** probabilities 0-1, USDC quote, integer share sizes, live ticks 5 significant figures (e.g. 0.58016, 0.00333) (H, my capture). Skew's app enforces "price in X cent increments" and a market minimum order value in USDC (strings in bundle; exact values NOT FOUND).

---

## 3. Chains and collateral

- Trading and settlement: **HyperCore** (Hyperliquid L1). Collateral/quote **USDC** (H: Skew docs "Yes redeems 1 USDC"; app catalog hard-codes `quoteToken: USDC`). Sibling note covers the USDH-to-USDC history.
- Funding in via the Skew app: USDC on **Arbitrum** (chainId 42161) through **Circle CCTP** (`iris-api.circle.com`) (H, static read of `funding-domain` chunk + CSP). The `/api/v1/accounts/deposit-chains` and `deposit-address/{x}` endpoints exist (H paths); the list of other chains is NOT FOUND (authenticated). Hyperliquid's own funding rules (Arbitrum-only for wallet users, min 5 USDC) are in the sibling note.
- Wallets in the app: WalletConnect wallets and Turnkey embedded wallets (CSP allows `api.turnkey.com`, `relay.walletconnect.org`; bundle has a Google OAuth flow) (H static read).
- Deployer security: "runs on-chain under a 3-of-5 multisig, with all five sub-deployer grants pointing at the deployer the pod signs with" (H, docs, operator claim). Stake: HL requires 500,000 HYPE, locked >= 183 days, and states HIP-3 stake "does not double-count" for outcome deployment (H, HL deployer-actions page). Hyperion's 500,000 HYPE HAUS deal was announced as a **HIP-3 perps** bond with HIP-4 listed as a later path "as that infrastructure matures" (H, release summary via QuiverQuant, The Block); Datawallet says Hyperion supplies the HIP-4 stake (M, single source). Which stake backs the HIP-4 venue is unresolved (NOT FOUND).

---

## 4. Read API

**Official public read = Hyperliquid's keyless API** (H; Skew docs say "Books, orders, fills - straight Hyperliquid, no auth"). Skew's own platform API is authenticated.

| Item | Detail | Tag |
|---|---|---|
| Docs | https://docs.skew.trade (index https://docs.skew.trade/llms.txt, full text https://docs.skew.trade/llms-full.txt); HL docs https://hyperliquid.gitbook.io/hyperliquid-docs | H |
| HL base URLs | `POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`; testnet `api.hyperliquid-testnet.xyz` | H |
| Universe | `POST /info {"type":"outcomeMeta"}` then filter `venue == "skew"`; each entry carries the identity keywords (Skew docs). Not run by me (POST). Per-outcome `feeScale` is also in this response (HL deployer-actions page + Skew sample row). WS `outcomeMetaUpdates` sends no snapshot (sibling capture). | H docs / not verified live |
| Books/prices | WS `l2Book`, `bbo`, `trades`, `activeAssetCtx`, `allMids` on `#<enc>` coins; REST `l2Book`. Confirmed live shapes for Skew coins (below). | H |
| Resolution read | `POST /info {"type":"settledOutcome","outcome":N}` (the app bundle calls it); Skew's authenticated archive additionally exposes `resolvedValue` and `settleReason` | H (bundle + docs) |
| Limits | HL: 1200 weight/min per IP REST; WS 10 connections, 1000 subscriptions, 2000 msgs/min (sibling note, H). Skew's own limits: NOT FOUND (a `/api/v1/test_rate_limits` path exists in the bundle, no figures). | H / NF |
| Skew platform API | `GET https://api.skew.trade/api/v1/markets?status=MARKET_STATUS_LIVE&network=mainnet` with `Authorization: Bearer <session token>`; single market `GET /api/v1/markets/{outcome}?network=mainnet`. **Unauthenticated GET returned HTTP 403 `{"message":"TradeService:: PermissionDenied: authentication required"}`** (H, fixture `api_skew_trade_markets_unauthenticated_403.json`). Session token comes from `GET /api/v1/auth/nonce?address=` + `POST /api/v1/auth/verify` (wallet signature) or `/api/v1/auth/turnkey`; plus waitlist endpoints. I did not authenticate. | H |
| Skew market-data service | `https://marketdata.skew.trade` + `wss://marketdata.skew.trade`: serves chart data "for assets Hyperliquid does not carry"; BTC/US500/NSDQ charts come from HL `candleSnapshot`. Root path returns 404; no public docs. | H (docs + CSP) / NF (endpoints) |
| Market row shape (docs example, not live) | `{outcome, network, venue:"skew", title, shape:"MARKET_SHAPE_BINARY", status, threshold, expiry, twapSeconds, feeScale, yesCoin, noCoin, yesAssetId, noAssetId, underlying{symbol,displayName,assetClass,chartSource,chartSymbol}, schedule{cadence,description,upcoming[]}}`. Note the example shows `feeScale:"10"` while the same page says the live scale is 1 (docs inconsistency). | H (docs example) |
| Third-party analytics | Loris page `loris.tools/hip4/skew` (HTML only; the Loris API needs a key `X-Api-Key` and does not document HIP-4 endpoints). DefiLlama indexer has per-builder (not per-deployer) outcome volume, see section 10. | H |

### Live shapes confirmed (fixtures in `docs/research/fixtures/skew-markets-hip-4-deployer/`)

| Fixture | What it shows | Source |
|---|---|---|
| `ws_skew_live_yes_mids_2026-10-19.json` | 61 live Skew Yes coins with Yes/No mids (sum 1.0) from one `allMids` message | WS (live) |
| `ws_skew_activeAssetCtx_2026-10-19.json` | `activeSpotAssetCtx` for all 61 (`dayNtlVlm`, `circulatingSupply`) | WS (live) |
| `ws_skew_l2Book_4_samples_2026-10-19.json` | real `l2Book` for 3 quoted books and the freshest (wing-only) book | WS (live) |
| `derived_skew_liquidity_summary_2026-10-19.json` | totals and spread distribution **derived by me** | derived |
| `api_skew_trade_markets_unauthenticated_403.json` | the 403 | GET (live) |
| `loris_skew_30d_snapshot_2026-10-19.json` | Loris stats + top-25 table + resolved titles | GET (HTML) |
| `hl-indexer_skew_builder_outcome_daily_...json` | Skew front-end builder-code outcome volume by day | GET (indexer) |
| `skew_frontend_config_extract_2026-10-19.json` | hosts, API paths, whitelist, builder config read statically from the app bundle | static read |
| `docs_skew_trade_llms.txt`, `DOCS_NOT_LIVE_platform_api_and_hl_calls_btc-hourly.md` | doc index; doc example (not live) | docs |

---

## 5. Trade path (programmatic)

- **Orders = ordinary Hyperliquid spot-style orders on asset id `100,000,000 + 10N (+1)`** posted as signed L1 actions to `POST https://api.hyperliquid.xyz/exchange` (Skew docs: "orders via the standard /exchange spot flow on assetId ..."; the app bundle uses `order`, `cancel`, `modify`, `approveAgent`, `approveBuilderFee`, `setReferrer`). Signing scheme and agent-wallet mechanics: see sibling note section 5 (phantom-agent EIP-712, domain `Exchange` chainId 1337; user-signed actions use `HyperliquidSignTransaction`) (H).
- **No Skew-specific trading API is needed or documented**; Skew's authenticated REST is for catalog, account, waitlist, referrals and deposits only (H paths).
- **Skew front end uses a builder code** `0x094A6c6b6781e3A675192B92294cAD3Ba12CF713`; the bundle sets its builder fee to 0 for spot and asks users to approve a maximum of 1% (H static read of constants `oy={spot:0,perp:0}`, `sy={spot:1e3,perp:100}`). An API trader who does not attach this builder code pays no builder fee.
- **Beta gating:** the app requires sign-in and is waitlisted (H paths). HL-level order placement is not gated by Skew, but the Terms prohibit unauthorized automated access to the Services (section 9).

---

## 6. Reachability from a PayBox wallet

**Verdict: partial (same as all HIP-4).**

1. HyperCore is not an EVM chain: no transaction proposals can place or cancel Skew orders (H/M; sibling note section 6).
2. PayBox `discover_plugins("hyperliquid")` today returns one **official, disabled** plugin "Browse Hyperliquid spot markets, prices, and token metadata" with no trade tool (H, live call 2026-10-19; I did not enable or call it).
3. Funding is reachable: USDC on Arbitrum is in PayBox's chain set; Skew's app deposits through Circle CCTP from Arbitrum (H static read).
4. Signing: an order needs EIP-712 typed-data on an L1 action (PayBox `request_wallet_sign` supports typed data/raw per `docs/research/06-paybox-platform.md`), practically via a one-time `approveAgent` plus a locally held agent key; a per-order PayBox approval cannot meet arbitrage latency (M).
5. Skew-only extras: the Skew login nonce/verify flow is a wallet message signature (M/H paths) but is only needed for Skew's own API, which an aggregator does not need. Geo checks include an **address block** (UI string "Trading isn't available for this address") (H static read).

---

## 7. Fees

- **Structure (H, docs.skew.trade/markets/btc-hourly + HL fees/deployer pages):** nothing on open (buy Yes or No). Fee only on **close** (taker/maker), **settlement** (taker rate on payout notional) and **merge**. No maker rebates on outcomes.
- **Formula (Skew docs, H as operator statement):** `fee = (your spot tier rate) x (1 + deployerFeeScale) x (1 - discounts)` with **`deployerFeeScale = 1`** (lowered from the chain ceiling of 10 on 2026-08-30 before first mint), i.e. 2x the user's normal spot rate, half to Hyperliquid and half to Skew. At tier 0: **14 bps taker / 8 bps maker**; settlement counts as taker. Skew's verified example: $186 settlement, tier-1 taker, 4% referral discount, fee $0.21427199 = 6 bps x 2 x 0.96 (I checked the arithmetic: 186 x 0.0012 x 0.96 = 0.214272) (H arithmetic / M source).
- **Conflicts to handle at runtime:**
  - Skew's formula uses `(1 + scale)`; HL's deployer-actions page says users pay `base x (scale + max(scale,1))` (equal at scale 1, different above 1). Skew's own number for scale 10 (77 bps = 11 x 7 bps) contradicts HL's 20x. Irrelevant while scale = 1, but read `feeScale` per market, not a constant (Skew: "Fees are frozen per market").
  - Skew assumes the base outcome rate equals the spot rate; one third-party guide (sibling note, M) says HL set outcome fees at half of spot. Read live `userFees`.
  - The docs sample row shows `feeScale "10"`.
- **Skew front-end builder fee:** 0 (bundle, H static read).
- **Empirical:** Loris 30d fees $57.08 on $359K notional (1.6 bps; consistent with fee-on-close only and very little closing) (M). Terms section 18 also allows "protocol, deployer, trading, builder/interface ... fees" and say rates "can change" (H).
- Who pays: the closer/holder at settlement; the aggregator should model a hold-to-expiry leg as paying ~14 bps taker at tier 0 on payout (not on cost).

---

## 8. Resolution mechanism and dispute risk

- **Deployer-settled by Skew, automatically (H, docs):** a reconcile loop (30 s tick) waits for proof the window closed, computes the value, and calls the deployer's `settleOutcome`; measured 48-68 s after expiry. A replacement hourly is minted in the same pass (1 s of empty book). Settlement is via sub-deployer grants under a 3-of-5 multisig. No trader dispute window exists at protocol level (sibling note); validators can slash a deployer for malformed or wrongly settled markets (HL deployer-actions "slashable", M for how enforced).
- **Rule (H, docs):** price **strictly above** strike => Yes (1); equal or below => No (0). No dead zone. **Void = 0.5 to both sides** only if the final window lacks evidence (< 12 of 18 five-second buckets for perp VWAP; < 12 of 19 samples for Pyth) after 3 retries. No cancel: "A minted market always settles: 1, 0, or 0.5."
- **Feed differs by family (H, docs) and is not the same as other venues' references:**
  - Hourly/4h: size-weighted VWAP of every Hyperliquid BTC **perp** print in the 90 s ending at expiry (live websocket buffer with a gap rule: any window overlapping a socket outage voids at 0.5).
  - Daily: HL BTC perp 1-minute candle closes, inverse-variance weighted.
  - Weekly BTC/US500/NSDQ: Pyth confidence-weighted TWAP with a 10% EMA blend, 90 s window. Docs say Pyth Hermes began requiring API keys in August 2026 and an earlier outage "took every settlement depending on it down".
- **Wording mismatch (H, docs admit it):** the validator-voted on-chain template text says "90-second **TWAP** of the Hyperliquid BTC perp trade price"; Skew computes a **size-weighted VWAP** and states the arithmetic in its docs as normative. A counter-party venue (Polymarket/Kalshi) uses different references, times and tie rules (Skew: equality = No). Treat same-title pairs as different payoffs; compare 90-second perp VWAP vs the other venue's spot index/close.
- **Skew retains discretion (H, Terms 9-10):** Skew "may determine, publish, submit, administer, or facilitate a Market's resolution", may "publish clarifications", and the Market Rules (not the title) control. This is operator-trust risk; a mis-minted market "can only settle by its own published terms".
- Strikes at mint: the hourly strike is the trailing 90 s VWAP (so ATM ~50/50 and not a round number); other families use a coarse grid with fixed offsets. Matching to other venues requires `(underlying, expiry, threshold, comparator, reference)` normalisation, not title matching.

---

## 9. Geo, ToS and automation (primary sources, H)

- Terms of Service (Skew Technologies, Inc.), effective and last updated **2026-09-02**, https://skew.trade/terms. The contact fields are still placeholders (`[LEGAL EMAIL]`, `[COMPANY MAILING ADDRESS]`): beta-grade legal docs.
- **Eligibility (s.4):** not "located, organized, incorporated, resident, or ordinarily resident in a jurisdiction from which access to the Services is prohibited by Skew, Hyperliquid, applicable law, or applicable third-party service providers"; also "not otherwise a person prohibited from accessing Hyperliquid". **No country list is published** (NOT FOUND in terms, privacy, docs).
- **Geo (s.5):** access may be restricted by location using "IP addresses, network information, wallet information, information provided by Hyperliquid APIs or infrastructure"; VPN/proxy/location spoofing prohibited. The app bundle performs a location check and an address-level block. Hyperliquid's own restrictions (US and Ontario residents, plus an open-ended outcome-market "Excluded Persons" list) are in the sibling note.
- **Automation (s.22):** "Skew may make APIs or other automated interfaces available. If you use automated systems, you are responsible for ... complying with rate limits; complying with Market Rules ... You may not scrape, overload, disrupt, reverse engineer, circumvent, or access the Services through unauthorized automated methods." No public Skew trading API exists; reading Hyperliquid directly is outside the Skew "Services", but this is a legal reading, not resolved here (M).
- Venue/law: Delaware law, exclusive Delaware courts, jury waiver, class waiver (s.34-35).
- Skew states it "operates independently of Hyperliquid and is not your broker, custodian, or adviser" (M, summary of Terms).

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| 30-day volume ("notional"; definition not stated) | **$359.02K**, 6,448 trades, 223 unique traders; fees $57.08 | https://loris.tools/hip4/skew HTML, data updated 2026-10-19 00:36 UTC (a second rendering showed $360.22K / 6,474 / 224 / $57.14, stamped 2026-10-18 21:51 UTC) | M |
| Markets | 2,459 tracked in 30 days; 61 currently active | same | M |
| End-of-day open interest | **$4.08K** (second rendering $3.37K) | same | M |
| Top markets (30d) | the 25 largest are $4-20K each (e.g. outcome 3991 HYPE>$88 Sep 25: $19.5K, 20 trades, 8 traders; outcome 4139 XYZ:SP500>$7,740: $19.1K) | Loris table + market pages, 2026-10-19 | M |
| Early listings | "roughly $12,000 in total" in the first days | Datawallet, updated 2026-09-03 | M |
| Share of HIP-4 | Skew = 61 of 334 live outcomes (18%) but ~0.6-0.8% of 30-day HIP-4 volume ($359K vs $45-60M) and ~0.2% ($5.7K of ~$2.35M) of open interest | my WS capture 2026-10-19 vs sibling note figures | M (derived) |
| Live 24h notional, 61 Skew Yes coins | **$78.67** (4 coins non-zero) | my WS `activeAssetCtx`, 2026-10-19 ~01:33 UTC | H data / M interpretation (excludes markets already settled today) |
| Open interest proxy | 5,685 Yes shares outstanding = **~$5.7K**, on 10 coins; one market holds 5,457 | same | M (derived) |
| Book quality | 41 of 61 books wing-only (e.g. bid 0.0257 / ask 0.9899, plus penny walls such as 100,000 shares at 0.99999); **11 books with a real two-sided quote, spreads 9.8-13.5 cents**, ~$0.4-1.1K per side within 15c of touch; freshest hourly (outcome 14246) had no ATM quote at capture | same, fixtures | H |
| Skew front-end flow (builder code) | $0-$1K/day except 2026-10-07 $18.3K, 10-09 $6.7K, 10-13 $6.3K; zero on the 8 sampled days 2026-09-01..10-05; sum over the 21 sampled days $33.9K | DefiLlama hl-indexer builder endpoint, fixtures | H (data) |
| Fee revenue | $57 / 30 days | Loris | M |
| Reported depth claims | "$12k to $5.6M" per 90-second window | Skew docs - this is the BTC *perp* tape that settles the markets, not Skew market depth | H (do not confuse) |

Caveats: the per-outcome OI endpoint on hl-indexer (`/v2/data/openInterest/outcome/daily/...`) returned negative per-outcome values and a total (~$7.0M) inconsistent with live circulating supply (~$2.35M in the sibling note), so I did not use it (L). Loris's "notional" may be share count at $1 face value rather than price x size.

---

## 11. Event categories and cross-venue overlap

| Skew family | Overlaps | Arb quality |
|---|---|---|
| BTC hourly / 4-hour / daily above-strike | Polymarket, Kalshi, Limitless, Predict.fun, Opinion crypto ladders; Outcome.xyz BTC series on the same exchange | Poor: perp-VWAP reference (not spot index), 90 s window, strict-above, non-round hourly strike, no depth at the money |
| BTC weekly (Mon/Wed/Fri 06:00 UTC) | same venues' weekly/daily BTC strike markets | Fair on paper (Pyth TWAP, grid strikes), but no liquidity |
| US500 / NSDQ weekly (16:00 ET close) | Kalshi index range/above markets, Polymarket S&P/Nasdaq markets | Fair on paper; basis to the venue's own close and 90 s Pyth TWAP; books were the thin 11 quoted ones |
| Sports, politics, macro, culture | none listed ("macro questions, scalars - documented as they list") | n/a |

---

## 12. Does it share liquidity with another venue?

**Yes: it is part of Hyperliquid HIP-4 (same HyperCore exchange, same order-book engine, same USDC, same user accounts, same builder-code system).** Skew's outcome ids are distinct books from Outcome.xyz's, so Skew-vs-Outcome.xyz prices are technically different markets (and a Skew BTC hourly vs an Outcome.xyz BTC market is an intra-HIP-4 relative-value pair with no bridge needed), but for the aggregator they are **one venue and one adapter**, not independent legs. I found no evidence that Skew books mirror Polymarket, Kalshi or any other venue (NOT FOUND: searched Skew docs/terms, HL docs). Skew's hedge for index markets is the HIP-3 perp (`xyz:SP500`, `xyz:XYZ100`) - a hedging instrument, not shared liquidity.

---

## 13. Adapter spec (inside the hyperliquid-hip4 adapter)

- **Tag, do not fork:** attach `deployer = "skew"` from `outcomeMeta[].venue`; keep a deployer registry (`outcomexyz`/"OUT", `skew`, `txyz`, ...). Loris lists three HIP-4 deployers (Outcome.xyz, Skew Markets, Events by TradeXYZ) (H).
- **Parse Skew templates:** `name = "template:binaryPrice"`; description keywords `perp`, `priceDescription`, `seconds`, `threshold`, `time` (`YYYYMMDD-HHMM` UTC) [inferred from docs; not read live]. Normalise to `(underlying, comparator=">", threshold, expiry_utc, window_s=90, reference ∈ {HL-perp-trade-VWAP, HL-perp-1m-candles, Pyth-TWAP}, equality=No, void=0.5)`.
- **Quotes:** subscribe `l2Book` on Yes coins only; derive No = 1 - Yes. Reject a book from edge calculation unless: both sides within 0.02-0.98, spread <= ~5c, and >= a minimum notional within 5c of touch (Skew's wing quotes at 0.01/0.97-0.99 and 100,000-share penny walls create phantom edge). Skew's useful liquidity is under ~$1.5K per book.
- **Fees:** per market `feeScale` from `outcomeMeta`, user tier from `userFees`; fee on close/settlement only.
- **Timing:** expiry minute-exact; settlement at +48-68 s; hourly roll gap ~1 s; BTC 4h expiries at :30; 06:00 UTC reserved for the daily/weekly.
- **Settled results:** persist `settledOutcome` on `outcomeSettled` (HL L1 prunes details); Skew's `resolvedValue` is only in its authenticated archive - recompute from the public perp tape if needed.
- **Skip entirely:** Skew's platform REST (auth + waitlist) and marketdata service.

---

## 14. Priority

**adapter_priority = skip** (as a stand-alone adapter). Reasons: (a) shares liquidity with Hyperliquid HIP-4, so it is not an independent leg and the HIP-4 adapter already covers it; (b) its own liquidity is negligible (~$4-6K OI, $0.36M/30d, 24h live-coin notional $79, 41/61 books wing-only, quoted books 10-13c wide); (c) resolution is run by Skew itself with a TWAP/VWAP wording gap and reserved discretion; (d) platform API is login/waitlist gated; (e) overlap limited to BTC and two equity indices, where the references differ from other venues. Revisit only if Skew ships non-price events (macro, scalars) or its volume rises by an order of magnitude.

---

## 15. NOT FOUND / open questions

- Live `outcomeMeta` rows for Skew (titles, descriptions, `feeScale`) - POST-only; the hint's "ZEC, Pyth" markets were not seen in current docs/whitelist (searched: docs.skew.trade, app bundle, Loris).
- Skew platform API rate limits, token lifetime, response schemas beyond the docs example (authenticated; not accessed).
- List of restricted jurisdictions (searched: Terms, Privacy, docs).
- Which 500,000 HYPE stake backs the HIP-4 venue (HIP-3 HAUS deal vs separate); Hyperion equity/revenue split (undisclosed per release).
- The 40k private-beta registrant figure and "second builder live" claims from KuCoin/Odaily (not reached; search budget exhausted).
- Minimum order value and exact tick in the app (strings only).
- Deposit chain list beyond Arbitrum (authenticated endpoint).
- Reliable per-deployer daily volume series (Loris API needs a key; indexer per-outcome OI looked wrong).
- blocked: x.com/SkewTrade (HTTP 402 via fetch tool; stopped), cryptorank.io (403).

---

## 16. Suspicious content

None that instructs an agent. Notes: docs.skew.trade `robots.txt` (generated by the Tome docs host) advertises `/skill.md` and `/mcp.json` under "AI/LLM Resources" and explicitly allows AI crawlers; I did not fetch or follow those two files. `llms.txt`/`llms-full.txt` are standard indexes I fetched on my own initiative; their content is market documentation with no agent-directed instructions (scanned for "AI", "agent", "assistant", "ignore", "Claude"). Loris pages carry SEO text only. QuiverQuant's "AI summary and FAQ" is auto-generated and was ignored in favour of the release text.

---

## 17. Sources

Primary (H):
- https://skew.trade/ (landing, "raised 500k $HYPE to deploy markets on Hyperliquid", "Join the beta" to app.skew.trade), https://skew.trade/terms (updated 2026-09-02), https://skew.trade/privacy (not read in detail)
- https://docs.skew.trade/ , https://docs.skew.trade/llms.txt , https://docs.skew.trade/llms-full.txt (BTC Hourly/4-Hour/Daily/Weekly, US500/NSDQ Weekly, Price feeds, Perp, Pyth, Hyperliquid feed)
- https://app.skew.trade/ index HTML (CSP, hosts) and `/assets/*.js` bundle read as text (market-catalog, funding-domain, provider-geo, trading-authorization, index), release `skew-web@3ba83285...`
- `GET https://api.skew.trade/api/v1/markets?...` -> 403 (2026-10-19)
- Hyperliquid HIP-4 deployer actions: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md ; other HL pages as cited in `hyperliquid-outcomes-hip-4.md`
- Live WS `wss://api.hyperliquid.xyz/ws` (`allMids`, `activeAssetCtx`, `l2Book`), 2026-10-19 ~01:33-01:36 UTC
- DefiLlama public indexer: https://hl-indexer.llama.rip/llms.txt and `/v2/data/builder/<addr>/daily/<date>`
- PayBox `discover_plugins("hyperliquid")` (live, 2026-10-19)
- https://loris.tools/hip4/skew and `/hip4/3991`, `/4139` (HTML, 2026-10-19); https://loris.tools/docs

Secondary (M/L):
- Hyperion/Skew HAUS agreement, 2026-07-15: https://www.quiverquant.com/news/Hyperion+DeFi+Deploys+500,000+HYPE+in+HAUS+Agreement+with+Skew+Technologies+to+Expand+Institutional+Hyperliquid+Markets ; https://www.theblock.co/amp/post/408538/hyperliquid-treasury-firm-hyperion-new-500k-hype-bond-skew
- Datawallet HIP-4 explainer, updated 2026-09-03: https://www.datawallet.com/crypto/hip-4-explained-hyperliquid-upgrade
- Search listings (titles only, not opened): cryptorank, crypto.news, cryptonomist, coincentral, hokanews, biggo (2026-07)
- Sibling notes: `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/venues/outcome-xyz.md`

## 18. Privacy

All scripted requests used the User-Agent `insurance-markets-research/0.1`. The WS script was grepped for `@` and personal names before running (no hits); the node WebSocket client was given the same User-Agent header. No personal identifier appears in any request, URL, query string, search query or fixture (the only `@` in the fixtures is the app's Sentry release id `skew-web@3ba83285...`). The builder address in the fixtures is Skew's public front-end code from its JS bundle, not a user address; no user wallet address was read or written.
