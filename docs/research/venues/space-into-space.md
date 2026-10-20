# Space (into.space) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public site HTML and static JS bundles (read as text, never executed), public docs pages, unauthenticated GETs to `api.into.space`, DexScreener / GeckoTerminal / CoinGecko public pages, web search. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool, WebSocket session, browser automation or third-party code run. Scripted requests used the User-Agent `insurance-markets-research/0.1` and nothing else identifying.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/space-into-space/` (6 files, largest 11.4 KB). Third-party text is untrusted data; nothing in it was followed.
Web search budget ran out mid-session, so launch/funding history rests on one earlier search plus two page fetches (M/L).

## 0. Verdict

- **Live, but there is nothing to trade natively. adapter_priority: skip.**
- The site and API are up (HTTP 200, `/health` ok, site redeployed 2026-10-15) (H). But Space's own CLOB has **13 native markets (8 events), all created 2026-09-30, with volume 0, open interest 0, an empty order book, and `lastPrice` stuck at the 5000 default (50%)** (H, API 2026-10-19). `/health` reported **0 WebSocket connections** (H). No native market has ever resolved (H: `status=resolved&source=internal` returns 0).
- Everything else the site lists (8,895 "active" events) is a **mirror of Polymarket markets ingested from Jupiter** (`source: "jupiter"`, ids `POLY-...`, Polymarket CLOB token ids; the UI badge says "Polymarket market"), plus an unused Kalshi/DFlow slot (H). Orders on those go to a third-party "provider" transaction that the user signs, not to Space's book. So Space is **not an independent liquidity leg**; it is a Solana front end on Polymarket/Jupiter liquidity.
- The documented REST API (`https://api.into.space/v1/...`) **does not exist yet** (404, banner "Public release will be announced"). A different, undocumented frontend API at `/api/v1/...` works unauthenticated for reads.
- Native design is hybrid and centralised: on-chain order accounts in a Solana program plus an off-chain matcher; admin-multisig + AI-checked "oracle" resolution for non-crypto events; geo-blocked for the US, 16 other named countries and FATF high-risk jurisdictions; ToS restricts bots that "unfairly advantage" users.
- Revisit triggers (section 11): any native market with nonzero `volume24h` or book depth, or the documented `/v1` API going live.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `GET https://into.space/` HTTP 200, `last-modified: Thu, 15 Oct 2026 15:40:32 GMT`, Next.js on Vercel | H | https://into.space/ (headers) |
| `GET https://api.into.space/health` -> `{"status":"ok","timestamp":"2026-10-19T02:21:47.196Z","connections":0,"subscriptions":0,"redis":"connected","database":"connected","betaGate":"disabled","ingestion":{"jupiter":{"lastSuccessfulSync":"2026-10-19T01:07:05Z","consecutiveFailures":0},"dflow":{"lastSuccessfulSync":null,...}}}` | H | fixture `health.json` |
| Docs live, 2026 content: claim dApp for the public sale closed 2026-10-15; manual claim support to 2026-12-14 | H | https://docs.into.space/claim-dapp-sunset.md |
| SPC token trades: Orca pool created 2026-04-29, Raydium (SPC/SOL) pool created 2026-07-21 (DexScreener `pairCreatedAt`) | H | https://api.dexscreener.com/latest/dex/tokens/2MU93nLHhDsHzgEYBKbVbwLDd2pi71ubGp8SkEv9dZwQ |
| Native markets: 13 created 2026-09-30, zero volume/OI, none resolved | H | fixtures `markets_source-internal_limit2.json`, `events_source-internal_active.json` |
| `/api/competitions` returns `{"success":true,"data":[]}` (no competition running) | H | https://api.into.space/api/competitions |
| Referral leaderboard top wallet: 615 trades / 615,000 points (tiny; not tied to a market volume) | H | https://api.into.space/api/referrals/leaderboard |

Launch date of trading: NOT FOUND (searched: site, docs, CoinGecko, web search). Context: a Whales Market article dated 2025-12-19 says the token had not launched and no mainnet/testnet status was public (M); the project's X posts from 2025-12-16 and 2026-01/02 are promotional (M, dates from tweet ids). The site has a `/beta` route but `betaGate` is "disabled".

## 2. Market model

- **Kind:** onchain-clob (hybrid). Central limit order book, price-time priority, makers 0%, takers dynamic fee (H, https://docs.into.space/en/architecture/clob.md and `/features/clob`). Order accounts live on Solana; matching is triggered through the backend (`POST /api/v1/orderbook/{market}/{outcome}/match`) (H, from site JS, not executed).
- **Binary and multi-outcome.** A multi-outcome event is a set of binary YES/NO markets (one order book per outcome, both sides) with "share conversion" of NO shares on one outcome into YES on the others, Polymarket neg-risk style (H, https://docs.into.space/en/features/multi-outcome.md). Live example: "Presidential Election Winner 2028" = 5 native markets (Vance, Newsom, Rubio, Ossoff, AOC) (H). No scalar markets.
- **Tokenisation:** SPL tokens, one YES and one NO mint per market; mint 1 USDC -> 1 YES + 1 NO, burn the pair for 1 USDC (H, https://docs.into.space/en/architecture/spl-structure.md). Market address is a PDA of the program (seeds `market`, creator/quote mint, id) (H, JS). Order-book prices are in 1/10000 units (5000 = $0.50); YES + NO = 10000 in samples (H).
- **Collateral quote token per market:** native markets seen today are quoted in **SPC, not USDC** (`quoteMint 2MU93nLH...`, `quoteSymbol "SPACE"`, 6 decimals), although the docs and ToS say core markets run in USDC and SPC-quoted markets are "exclusive" special markets (H, API vs https://docs.into.space/en/token/utility.md). Mirrored markets are quoted in USDC (`EPjFWdd5...`) (H).
- **Leverage (up to 10x):** documented margin model with initial margin 20%, maintenance 10%, partial liquidation 25% steps with a 10% penalty to an insurance fund (H, https://docs.into.space/en/architecture/leverage.md and `/build/security.md`). The docs contradict themselves (10x max vs 20% IM = 5x). Code for margin vaults exists in the front end (H), but there is no open interest anywhere, so live leverage is unverified. A leveraged leg cannot be a clean arbitrage hedge (liquidation risk).
- **Safety features documented:** circuit breakers (10% in <60 s, 25% in <5 min), call-auction fallback, fee x3 / x5 in the last 10 / 5 minutes before resolution, 5% default slippage guard (H, `/build/security.md`).

## 3. Chains and collateral

- **Chain:** Solana mainnet only (H). Program id in the front end config: `SPCS5FhX4cfsG73NBrKVu3e9EjcauamWtp5Vf794WCv` (PDAs `market`, `vault`, `margin_vault`, `liquidity_vault`, `position`, `config`, `access_registry`) (H, site JS chunk `1a56a8c0ea9146fe.js`). I could not confirm the program is deployed or who holds upgrade authority: Solscan returned 403 and an RPC check needs a POST (NOT FOUND). A second id, `C5Gs9eLqW4rqEhPiZiaQnptdf5ectbyTpyQQf83PhDRm`, appears with `eventAuthority` in the order code (likely the Anchor event authority or a second program; M).
- **Collateral:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) per docs/ToS; SPC token `2MU93nLHhDsHzgEYBKbVbwLDd2pi71ubGp8SkEv9dZwQ` for SPC-quoted markets (H).
- **SPC token:** supply 999,987,455 (6 decimals); CoinGecko `space-4` (listed as "SPACE"; docs and DEXes call it SPC/$SPC) (H, GeckoTerminal).
- **Non-custodial** per ToS (H), but the admin pages (`/admin/resolve-market`, `/admin/fund-liquidity-vault`, `/admin/oracle-registry`, `/admin/update-config`) show a centrally administered program (H, route list in `_buildManifest.js`).

## 4. Read API

Two APIs exist. Only the second one works.

**A. Documented REST/WS (NOT LIVE).** Docs: https://docs.into.space/en/api/rest.md and `/en/api/websocket.md`; index https://docs.into.space/llms.txt (Mintlify). Base `https://api.into.space/v1`, WS `wss://ws.into.space/v1`. Endpoints: `GET /markets`, `/markets/{id}`, `/markets/{id}/orderbook`, `/markets/{id}/trades`, `/markets/{id}/candles`, `GET /stats`. Both pages carry the banner "Public release will be announced on our official X/Twitter and in Telegram + Dicsord" (sic), and the examples are template data (`btc-150k-2025`). Live check 2026-10-19: `GET https://api.into.space/v1/markets` and `/v1/stats` return Express `404 Cannot GET` (H). Documented limits (unverifiable): public 100 req/min, authenticated 500 req/min, `X-RateLimit-*` headers, 10 concurrent WebSocket connections per user. The developer guide itself says "While the platform is in development" (H, https://docs.into.space/en/build/resources.md).

**B. Undocumented frontend API (works, unauthenticated reads) - observed 2026-10-19.** Base `https://api.into.space`. No auth header, no rate-limit headers seen. Endpoints taken from the site's own JS and then probed:

| Endpoint | Result | Notes |
|---|---|---|
| `GET /api/v1/events?status=active&source=internal&limit=100` | 200, `{events:[...], total:8}` | fixture `events_source-internal_active.json`. Event fields: `id, externalId, source, title, category, volume, volume24h, status, closeTime, tags, marketsCount, topMarkets[{id, title, marketAddress, outcomes[{id,label,openInterest}], totalVolume, quoteDecimals, quoteSymbol}]`. `source` values: `internal`, `jupiter`; `dflow`/`polymarket`/`kalshi` return 0. |
| `GET /api/v1/events?status=active&source=jupiter&limit=2` | 200, `total: 8895` | fixture `events_source-jupiter_active_limit2.json`. Params: `status, source, sort (trending), limit (100 ok), offset, category, search`. |
| `GET /api/v1/events/{id}` | 200 `{event:{...}}` | |
| `GET /api/v1/events/subcategories` | in JS, not probed | |
| `GET /api/v1/markets?limit=&status=&source=` | 200, `{markets:[...], total}` (824,322 rows by default) | fixtures `markets_limit2_default-source-jupiter.json`, `markets_source-internal_limit2.json`. Market fields: `id, marketAddress, marketId, creator, title, description, category (int), status (int: 0 Active, 1 Pending Resolution, 2 Disputed, 3 Resolved, 4 Invalid), endDate, totalVolume, totalCollateral, totalOpenInterest, maxOpenInterest, insuranceFund, resolvedOutcome, resolutionSource, challengeBond, challenger, creatorFeeBps, outcomes[{id,label,lastPrice,openInterest,clobTokenId}], quoteMint, quoteDecimals, quoteSymbol, source, externalId, autoResolve, strikePrice, priceFeed, resolveAt`. |
| `GET /api/v1/markets/{id}` | in JS, not probed | |
| `GET /api/v1/orderbook/{marketId}/{outcomeId}?depth=N[&tokenType=]` | 200, `{"orderBook":{"bids":[],"asks":[]}}` | fixture `orderbook_576748_0_empty.json`. Shape differs from the docs (wrapper key, no `spread`/`midPrice`). The bid/ask level shape is NOT FOUND (every book is empty; JS reads `price`, `size`, `quantity`). |
| `GET /api/v1/orderbook/{m}/{o}/price` | 200 `{"price":5000}` | |
| `GET /api/v1/orderbook/{m}/{o}/history?period=` | in JS, not probed | |
| `GET /api/v1/external-price-history/{marketId}?outcomeId=&interval=` | 200 `{"history":[],"outcomeLabel":"Yes"}` | mirrored markets |
| `GET /api/v1/positions/user/{pubkey}`, `/orders/user/{pubkey}`, `/external-positions?pubkey=` | in JS | per-wallet public reads; not probed |
| `GET /health` | 200 | fixture `health.json` |
| `GET /api/v1/tokens/spc/price` | 200 `{"price":null,...}` | |
| `GET /api/v1/stats` | 404 | no platform stats endpoint |

- **Trades feed:** NOT FOUND (searched: all downloaded JS chunks, docs). No `/trades` route exists in the live API.
- **WebSocket:** `wss://api.into.space/ws` (from the site's WebSocketManager, H); the docs' `wss://ws.into.space/v1` is the unreleased one. Message format on the live socket: NOT FOUND (not connected, to stay within the no-session rule); `/health` shows 0 connections and 0 subscriptions.
- **Data quality of the mirror (500 sampled active mirrored events, sort=trending):** 99 have a `closeTime` in the past yet status "active"; 13 have no `closeTime`; `volume24h` is "0" for all 500; `status=resolved` returns events whose `status` is still "active" (H, my samples). The mirrored `volume` figures are in unclear units (e.g. 1.295e15 raw) and are Polymarket/Jupiter volume, not Space volume. Do not treat the mirror as a price source: go to Polymarket or Jupiter directly.
- **Doc errors worth knowing:** `minting-burning.md` says to "buy both for $1.05 and burn for $1.00" (a loss; the real arbitrage is mint at $1.00 and sell both for $1.05). Fee-curve prose numbers disagree with the formula (section 6).

## 5. Trade path

- **Auth (read from the site JS, not executed):** Sign-In-With-Solana style. `POST /api/auth/nonce {walletAddress}` -> `{nonce, message}`; wallet `signMessage` (ed25519, base58 signature) -> `POST /api/auth/verify {walletAddress, message, signature, nonce}` -> `{token, user}`; then `Authorization: Bearer <JWT>`; `POST /api/auth/refresh`, `/api/auth/me`, `/api/auth/logout` (H).
- **Native order (H, from JS):** (1) client builds and signs a Solana transaction that creates the order account on the Space program (limit: price in 1/10000, quantity in 6-decimal shares; market buy: USDC amount + `maxSlippageBps`, optionally a prior `POST /api/v1/orderbook/{m}/{o}/quote`); (2) `POST /api/v1/orders/limit` or `/orders/market` with `{market_id, outcome_id, side, size, price, on_chain_order, order_id, num_outcomes, token_type}` and header `x-pubkey: <wallet>`; (3) `POST /api/v1/orderbook/{m}/{o}/match`; cancel is `DELETE /api/v1/orders/{id}` with `x-pubkey`. The order endpoints appear to identify the caller by the `x-pubkey` header alone rather than the bearer token (H in JS; server behaviour not tested). Not an API-key/HMAC model; no REST order endpoint a bot can call without producing Solana transactions.
- **Mirrored-market order:** `POST /api/v1/external-trade/order {marketId, ownerPubkey, side, direction, amount}` returns a base64 Solana transaction "from provider" (min $5 buy in the UI); the user signs, sends, then `POST /api/v1/external-trade/confirm {signature, ownerPubkey, isTrade, filledValueUsd}`. The front end also holds the Jupiter prediction program id `JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD` (H string, M that this is where the tx executes). Space is only a router here.
- **PayBox reachability: partial (Solana wallet only, no plugin; not worth building).** An EVM wallet on Base, Ethereum, BNB, Arbitrum or Polygon cannot trade Space at all: Solana program, ed25519 login, USDC/SPC on Solana, no EVM contracts, no cross-chain deposit. A PayBox Solana wallet could in principle sign the login message (`solanaMessage`) and order transactions (`solanaTransaction` / `kind: solana` proposals, <= 1,232 bytes, single signer; per `docs/research/06-paybox-platform.md`), but PayBox has no Space plugin and the native book has no counterparties. I did not call any PayBox tool.

## 6. Fees

- **Makers: 0%.** **Takers (market orders): dynamic by price p (in percent probability)** (H, https://docs.into.space/en/features/dynamic-fees.md, formula plus the page's own chart code):
  - buy fee % = 0.02 + (2.00 - 0.02) x (1 - (p/100)^1.3) -> 2.00% at p=0 down to 0.02% at p=100; p=20: 1.76%, p=30: 1.59%, p=50: 1.20%, p=80: 0.52% (my arithmetic from the formula).
  - sell fee % = 0.02 + (1.00 - 0.02) x exp(-0.5 x ((p-50)/25)^2) -> 1.00% at p=50, about 0.50% at p=20 or p=80 (sigma=25 comes from the chart code; the prose never states it).
  - The prose examples ("0.10% at 80", "0.04% sell at 80", "0.12% sell at 20") do not match these formulas. Which one the contract charges: NOT FOUND (fee parameters are on-chain config; unread). Fee base (notional vs shares) is not stated.
- Fee escalation near resolution: taker fee x3 under 10 min, x5 under 5 min (a documented option, "markets can implement") (H).
- **Who gets it:** ToS: 50% buys and burns SPC, 50% to treasury; docs: 5% of platform fees to the insurance fund (H, https://docs.into.space/en/resources/tos.md, `/build/security.md`). Liquidation penalty 10% of liquidated value to the insurance fund. `creatorFeeBps` exists in the market schema (0 on all samples).
- Gas: Solana tx fees (and rent for order accounts); no gas sponsorship mentioned. Mirrored (Jupiter/Polymarket) trades carry the provider's own fees: NOT FOUND.
- Liquidity rewards for resting limit orders and a points/airdrop program exist (H, docs `features/rewards.md`, `airdrops.md`; terms not read in detail). Points can distort quoted prices in a way that is not arbitrage-relevant.

## 7. Resolution and dispute risk

- **Two paths (H, https://docs.into.space/en/concepts/resolution.md, `/resolution/*.md`):**
  - Deterministic (crypto price, on-chain): Pyth primary, Switchboard fallback, median, 15-minute TWAP ending at expiry, pause and manual review if feeds differ by more than 2%, extend window if the oracle is down, mark invalid if too few updates.
  - Oracle (politics, sports, culture): a 2-of-3 operator multisig submits outcome + evidence URL + content hash; an AI checks the evidence against whitelisted sources; on-chain submission; 24-48 h challenge period where users can "flag" and admins may override. Docs say this happens "within 24h of expiry".
  - `/win-loss-after-market-resolution` help page: "An admin resolves the market ... After a waiting period, the market is finalized"; winners redeem $1 per share from Portfolio.
- **Risk is high relative to UMA/Kalshi-style venues:** the operator can extend the resolution period "at its sole discretion", pick an alternative data source, or void a market and return collateral "at the last recorded position value net of fees"; decisions are "final and binding"; invalid market refunds are claimed to be full purchase price in the docs but "net of fees" in the ToS (H, contradiction). Governance: 3-of-5 admin multisig, 48 h / 72 h timelocks (documented, unverified on-chain). Operator: Synapse Labs Inc (Panama); disputes by ICC arbitration, Panama City, Panamanian law (H, ToS).
- The market account has `challengeBond`/`challenger` fields (H, API) which suggests an on-chain bond path, but the docs describe flagging, not bonds (NOT FOUND for the bond rules).
- Resolution of mirrored markets follows Polymarket/UMA, not Space.

## 8. Geo, ToS, automation

- **US persons prohibited** (citizen/resident, US entity, or physically accessing from the US) because Space is "not registered with the CFTC". Also unavailable in the UK, France, Portugal, Hungary, Australia, Canada, China (incl. HK/Macau), Singapore, South Korea, Taiwan, Russia, Belarus, Iran, North Korea, Syria, Cuba, and FATF call-for-action jurisdictions. VPN use is "a material breach". Age 18+. (H, https://docs.into.space/en/resources/tos.md)
- **Automation:** prohibited conduct includes "use automated bots or scripts to interact with the Platform in a way that disrupts, overloads, or unfairly advantages you relative to other Users, except where Space has expressly permitted this in writing", plus spoofing, layering, quote stuffing, wash trading (H). Meanwhile https://docs.into.space/en/build/overview.md encourages bots and "arbitrage scanners". Read-only polling for research is low risk; an arbitrage bot trading the native book would need written permission to be safe (M).
- No `robots`/API terms found beyond the above (NOT FOUND, searched: docs index, ToS, privacy policy not read in full).
- Operator liability cap: greater of fees paid in the prior 30 days or USD 100 (H, ToS).

## 9. Liquidity (all 2026-10-19 unless stated)

| Metric | Value | Tag | Source |
|---|---|---|---|
| Native markets (live) | 13 markets / 8 events | H | `api.into.space/api/v1/markets?source=internal` |
| Native volume, OI, 24h volume | 0 / 0 / 0 on every market | H | same |
| Native order-book depth | empty | H | `/api/v1/orderbook/576748/0` |
| Mirrored events "active" | 8,895 (not Space liquidity; 20% of a 500 sample past their close time) | H | `/api/v1/events?source=jupiter` |
| Platform TVL / total volume | NOT FOUND (no stats endpoint; no DefiLlama check made) | - | - |
| SPC token market cap / FDV | about $0.59M / $0.75M (GeckoTerminal), $0.62M mcap (CoinGecko) | H | https://api.geckoterminal.com/api/v2/networks/solana/tokens/2MU93nLHhDsHzgEYBKbVbwLDd2pi71ubGp8SkEv9dZwQ ; https://www.coingecko.com/en/coins/space-4 |
| SPC DEX liquidity / 24h volume | Raydium SPC/SOL pool $212K liquidity, 24h $96; Orca SPC/USDT $763; token 24h volume about $98 | H | DexScreener |
| Funding | $3M seed (Phemex headline) vs $5.75M "across rounds" (Whales Market, 2025-12-19); public sale reports $18.2M-$20M+ and conflict | M/L | search results; https://whales.market/blog/what-is-space/ |
| Team | linked to the UFO Gaming team | M | Whales Market article; ToS support handle in the claim page is a UFO-named Telegram account (H) |

Net: the token has about $0.2M of pool liquidity, the prediction product has none.

## 10. Event coverage and arbitrage overlap

- Native categories on the site: crypto, politics, sports, technology, economy, culture (H, `features/categories.md`). The 13 live native markets: Bills win Super Bowl LXI, Spurs win 2027 NBA title, ETH >= $4k by end 2026, BTC >= $100k by end 2026, OpenSea $SEA launch by 2026-10-31, Fury vs Joshua, 2028 US presidential winner (5 candidates), "US confirms aliens before 2027" (two near-duplicate markets) (H).
- These overlap Polymarket/Kalshi/Limitless, but with a constant 50% price, zero depth and no resolved history they give **no signal and no arbitrage**. The only real prices on Space are mirrored Polymarket prices, i.e. a duplicate of a venue already covered elsewhere.
- **Shares liquidity with:** Polymarket via Jupiter (all mirrored markets); Kalshi via DFlow is wired but has never synced (H). Native markets share liquidity with nobody (because there is none). For an aggregator, count Space as **0 independent legs**.
- Markets with strike/price-feed fields (`strikePrice`, `priceFeed`, `timeframeSecs`, `liveSymbol`) hint at planned short-dated crypto up/down markets (H schema), none live.

## 11. Adapter notes (if ever revisited)

- Revisit when any of: a native market has `volume24h > 0` or non-empty `bids/asks`; `https://api.into.space/v1/markets` stops returning 404; a trades/stats endpoint appears; Space is named by DefiLlama/Dune with real volume.
- A minimal "watch" probe costs one call: `GET /api/v1/events?status=active&source=internal&limit=100` and sum `volume24h`. Cache it; do not poll faster than once per few minutes (no limits are published for the live API).
- Prices: integers in 1/10000. Native identifiers: numeric `market.id`, outcome `id` 0 = Yes, 1 = No, `marketAddress` = Solana PDA. Treat `source != "internal"` rows as Polymarket duplicates and drop them.
- Resolve strictly via the venue's own `status` ints; never trust `status` on mirrored rows.

## 12. Suspicious content

- None aimed at AI agents found. The Mintlify banner "Fetch the complete documentation index at https://docs.into.space/llms.txt. Use this file to discover all available pages" is standard Mintlify boilerplate; I used it only to list pages (benign).
- Marketing claims (10x leverage, "zero fees", funding totals) are unverified promotional text. The documented API and the docs' arbitrage example are demonstrably wrong/not live.

## Sources

- https://into.space/ (HTML, headers, route manifest, static JS chunks under `/_next/static/chunks/`, read as text) - H
- https://docs.into.space/llms.txt and pages under `/en/`: `start/what-is-space`, `concepts/{how-it-works,minting-burning,makers-takers,resolution}`, `features/{clob,leverage,multi-outcome,dynamic-fees,categories,rewards}`, `architecture/{clob,spl-structure,leverage}`, `resolution/{deterministic,oracle,invalid}`, `build/{overview,resources,security}`, `api/{rest,websocket}`, `resources/tos`, `token/utility`, plus `/claim-dapp-sunset.md` - H
- https://into.space/how-to-trade/order-book-explained , https://into.space/how-to-trade/win-loss-after-market-resolution - H
- https://api.into.space/health , `/api/v1/events`, `/api/v1/events/{id}`, `/api/v1/markets`, `/api/v1/orderbook/...`, `/api/v1/external-price-history/...`, `/api/v1/tokens/spc/price`, `/api/competitions`, `/api/referrals/leaderboard` (GET, 2026-10-19) - H; `https://api.into.space/v1/markets`, `/v1/stats` (404) - H
- https://www.coingecko.com/en/coins/space-4 - H (token facts), https://api.geckoterminal.com/api/v2/networks/solana/tokens/2MU93nLHhDsHzgEYBKbVbwLDd2pi71ubGp8SkEv9dZwQ - H, https://api.dexscreener.com/latest/dex/tokens/2MU93nLHhDsHzgEYBKbVbwLDd2pi71ubGp8SkEv9dZwQ - H
- https://whales.market/blog/what-is-space/ (2025-12-19) - M/L
- Search-result headlines only (not opened): https://x.com/intodotspace/status/2001041668875903052 , https://www.bitget.com/news/detail/12560605115286 , https://phemex.com/news/article/space-raises-3-million-to-launch-leveraged-prediction-market-on-solana-45389 , https://blockchain.news/flashnews/solana-sol-defi-alert-space-leveraged-prediction-market-raises-18-2m-729-oversubscribed-as-whales-add-2-2m - L
- https://solscan.io/account/SPCS5FhX4cfsG73NBrKVu3e9EjcauamWtp5Vf794WCv - 403, not read
- Jupiter + Polymarket context (not Space): https://invezz.com/news/2026/02/02/jupiter-integrates-polymarket-bringing-on-chain-prediction-markets-to-solana/ (search result, M)
- Repo context: `docs/research/06-paybox-platform.md` (PayBox Solana signing intents)

## NOT FOUND

- Launch date of trading; platform TVL/total volume; live WebSocket message format (`wss://api.into.space/ws`); bid/ask level shape (all books empty); trades endpoint; on-chain fee parameters; program deployment/upgrade authority; Space-specific bot permission; fee rules on mirrored trades; dispute-bond rules; GitHub repo or audit (searched: CoinGecko links, site JS, docs index, footer; CoinGecko lists no GitHub).

## Open questions

- Is the native CLOB being wound down in favour of the Jupiter/Polymarket front end (admin page `migrate-markets`, SPC-quoted seed markets, claim dApp sunset on 2026-10-15)? No statement found.
- Does the live `/v1` API ever ship, and will it expose real native books?
