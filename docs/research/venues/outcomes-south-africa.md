# Outcomes South Africa (outcomes.co.za) - venue spec

Researched 2026-10-19. Read-only: unauthenticated GETs to outcomes.co.za and static JS bundle text reading only. Tags: H = read first-hand this session, M = inferred, L = weak/stale.

## Verdict

Priority: **skip** (revisit if mainnet launches). The site is live (H) but is a **testnet/demo product with zero real liquidity**: no mainnet contracts, no deposits, no live trading, every market sits at 50/50 with volume 0 and 0 of 39 markets tradeable. Not a usable arbitrage leg today.

## Liveness

- https://outcomes.co.za returns HTTP 200 on 2026-10-19; title "Outcomes | Prediction Markets for South Africa"; description "South Africa's prediction market for local and global events across sport, finance, politics, weather, and culture." (H). Sitemap lastmod 2026-09-21 (H).
- Backend is live and rotating markets: board fetchedAt 2026-10-19T05:07Z, 39 active markets, 66 metadata rows loaded (H, /api/v1/markets/board and /api/v1/config).
- The marketing description lists sport and politics, but the live categories endpoint only exposes crypto, finance, weather (H). Sport/politics NOT FOUND in the live catalogue.
- GitHub org "South Africa's first hyperlocal prediction markets platform" (hint, 2026-07-07): NOT FOUND (searched: gh search repos/users for outcomes-za, "outcomes.co.za", "outcomes prediction market south africa"; WebSearch budget was exhausted so no web search was possible). No contract source or public repo verified.

## Kind and market model

- Kind: on-chain prediction market, Gnosis Conditional Tokens (CTF) plus FPMM (fixed product market maker, an AMM), with UMA OOv3 oracle adapters. Source: frontend config in https://outcomes.co.za/assets/index-Be-RVd3T.js: `contractCapabilities:{conditionalTokens:"deployed", fpmm:"deployed", multiOutcome2To16:"deployed", umaAdapters:"deployed"}` on Polygon Amoy (H as to what the config says; actual contracts not independently verified on-chain).
- Binary YES/NO only in the live catalogue. Outcome ids: `<questionId 0x..>:YES` / `:NO`; prices are integers 0-100 (cents). The code supports 2-16 outcomes but none are listed (H).
- Live series (H, /api/v1/config `metadataManagedSeriesPresent`): bitcoin-up-1d, ethereum-up-1d, gold-up-1d, dji-up-1d, ndx-up-1d, plus daily 30C temperature and rain markets for Bloemfontein, Cape Town, Durban, Gqeberha, Johannesburg, Pretoria. Board also shows 60/240/1440-minute Up/Down for BTC/USD, ETH/USD, DJI, Gold, Silver, JSE40, JSEAS, NDX, USDZAR.
- No order book (no clob/orderbook strings in the bundle, H). Pricing is AMM-based (M, from FPMM capability flag).

## Chains and collateral

- Active chain: **Polygon Amoy testnet, chainId 80002** (H: /api/v1/config returns chainId 80002; bundle default `B1("polygon-amoy")`).
- Also configured: Celo Sepolia (testnet, MiniPay). Polygon mainnet and Celo mainnet manifests are `polygon-mainnet-not-deployed-v1` / `celo-mainnet-not-deployed-v1` (H).
- Collateral: USDC (6 decimals) in config, but `supportedCollateralTokens: []` and `collateralToken: null` for all markets in the live config (H). Test token only on testnet.
- Factory (public, from config): Amoy factory address is exposed in /api/v1/config (see fixture config-live.json). Not verified on-chain.

## Read API

- Official docs: NOT FOUND. https://outcomes.co.za/docs is a client-rendered SPA page with no extractable text (searched: WebFetch /docs, /terms, sitemap, robots.txt, llms.txt which returns the SPA shell). No OpenAPI, no developer docs, no API key programme.
- Undocumented first-party JSON API used by the web app (H, response shapes confirmed with unauthenticated GET, UA insurance-markets-research/0.1):
  - `GET https://outcomes.co.za/api/v1/markets/board?status=active` - grouped feed: `categories[]`, `eventGroups[]` (each with `markets[]` with `outcomes[]` carrying `price`, `change24h`, `status`, `questionId`), plus legacy flat `markets[]`. About 230KB.
  - `GET /api/v1/markets?status=all|active&limit=N&q=..&refresh=true` - flat list: `{id, question, category, outcomes[{id,label,probability,change24h}], opensAt, closesAt, volume, priceHistory[]}`.
  - `GET /api/v1/markets/{id}` - exists in bundle; my probe with an event-group market id returned `{"status":"error","message":"Market not found"}` (id format uncertain; not further tested).
  - `GET /api/v1/config?mode=LIVE|DEMO` - backend readiness and safety flags (very informative, see below).
  - Authenticated (Privy login, Bearer token): /api/v1/auth/privy/verify, /auth/refresh, /auth/logout, /auth/profile/wallet, notifications (H, bundle only).
- Auth for reads: none needed. CORS is `access-control-allow-origin: https://outcomes.co.za` only, which does not block server-side clients. CORS headers mention `X-Outcomes-Api-Key` (H), so an API-key mechanism may exist; no docs.
- Rate limits: headers `X-RateLimit-Limit/Remaining/Retry-After` are exposed via CORS (H) but values were not observed on my responses. Board is cached `public, max-age=10, s-maxage=60` (H).
- WebSocket: NOT FOUND in the bundle's API paths.
- Data quality warning: `priceHistory` has daily points with fixed offsets and tiny drift (47.9-50) on markets whose price is exactly 50 and volume 0, so it looks synthetic/placeholder (M). Do not use it as a signal.
- Fixtures saved (trimmed, <50KB): `docs/research/fixtures/outcomes-south-africa/board-trimmed.json`, `docs/research/fixtures/outcomes-south-africa/config-live.json`.

## Trade path

- **None for real money.** `/api/v1/config` `demoSafety` (H, 2026-10-19): `liveTradingEnabled:false, chainWritesEnabled:false, moneyWritesEnabled:false, mainnetWritesEnabled:false, fiatRailsEnabled:false, depositsEnabled:false, withdrawalsEnabled:false, demoTradingEnabled:true, anonymousDemoTradingEnabled:false`.
- `contractReadiness`: activeMarketCount 39, tradeableMarketCount 0, blockedMarketCount 39, reason `missing_market_maker` for all 39 (H). `tradeExecutorUnavailableReason` says the live executor lacks a signer key (H).
- Trading appears to be server-side executed ("tradeExecutorMode: deterministic", Privy embedded wallet login) rather than user-signed orders (M). Demo mode uses an internal accounting engine (`demoTradesOnChain:false`).
- PayBox reachability: **no**. There is no mainnet chain, no collateral, no deposit path, and no user-signed order or transaction-proposal flow. Amoy is a testnet; a PayBox wallet has no reason or ability to hold value there. Login is Privy (email/Google), not wallet-signed (H, bundle).

## Fees

NOT FOUND (searched: bundle text for fee wording, /terms and /docs which are SPA shells). No fee formula published. Config shows `feeCurrency:false` for USDC on Amoy/Sepolia and `feeCurrency:true` (Celo fee abstraction) for Celo mainnet; that is gas currency, not a trading fee (H).

## Resolution

- UMA OOv3 adapters for settlement (H as config: `oracleCapabilities.umaOov3:"verified"` on Amoy; `umaAdapters:"verify-before-deploy"` on Polygon mainnet). Market description text: "settlement waits until after 02:30 SAST the following day so Tomorrow.io historical precipitation observations can be packaged for UMA settlement" (H, board). Chainlink data feeds/CRE and a "deterministic resolver" also exist in the config, some "code-only".
- Weather resolves from Tomorrow.io observations, but the backend reports `tomorrowConfigured:false` (H), i.e. the data source is not configured yet.
- Up/Down markets: "strictly higher ... A flat or lower price resolves No" (H, board description). Reference price source (exchange/index) is not named for crypto; ambiguity risk for cross-venue matching.
- Dispute risk: UMA optimistic oracle plus bespoke short-dated markets. Could not assess because nothing is live on mainnet.

## Geo, ToS, automation

- Terms and privacy pages exist (sitemap) but are client-rendered; text NOT retrievable. Signup flow requires confirming "I am 18 years or older" and "trading carries financial risk" (H, bundle). No automation/bot clause found (NOT FOUND). robots.txt allows all (H).
- South African regulatory status (gambling vs. derivatives licensing) NOT FOUND.

## Liquidity

- Volume: `volume: 0` on every market in the board and markets feeds; every outcome price is exactly 50 (H, 2026-10-19). OI/TVL: NOT FOUND; collateral is a testnet token, so any figure would not be real value.
- Shared liquidity: none known; it runs its own FPMM contracts (M). It uses Polymarket-style stack (CTF + UMA) but is a separate deployment, not shared liquidity.

## Event overlap (for arbitrage)

On paper overlap exists with crypto price direction (BTC/ETH hourly/daily up-down, competes with Polymarket, Kalshi, Limitless, Predict.fun) and finance (DJI, NDX, Gold, Silver, USDZAR, JSE40) plus South African city weather (little overlap elsewhere; Kalshi has some US weather). In practice there is no tradable or even priced liquidity, so no usable edge. Possible later use as a **signal-only** South African weather/JSE source if real volume appears.

## Adapter notes (only if it goes mainnet)

Poll `/api/v1/markets/board?status=active` every 60s (edge-cached 60s); key on `eventGroups[].markets[].outcomes[].questionId` and `outcomeSide`; treat price as cents; gate on `/api/v1/config.contractReadiness.tradeableMarketCount > 0`, `demoSafety.liveTradingEnabled`, and a non-80002 `chainId` before trusting any price. Re-check monthly.

## Suspicious content

None found. No instructions aimed at AI agents in HTML, JSON or JS bundle. (Note: `llms.txt` returns the SPA HTML shell, not an llms.txt.)

## Open questions

- Is a mainnet launch (Polygon 137 or Celo) scheduled, and under which regulator?
- Fee schedule and the full Terms/Docs text (SPA only).
- Whether an `X-Outcomes-Api-Key` programme exists for third parties.

## Sources

- https://outcomes.co.za (homepage, H)
- https://outcomes.co.za/sitemap.xml , /robots.txt , /site.webmanifest (H)
- https://outcomes.co.za/api/v1/markets/board?status=active (H, 2026-10-19)
- https://outcomes.co.za/api/v1/markets?status=all&limit=3 (H)
- https://outcomes.co.za/api/v1/config?mode=LIVE and ?mode=DEMO (H)
- https://outcomes.co.za/assets/index-Be-RVd3T.js (first-party frontend bundle, read as text only, H for what it contains, M for what it implies)
- https://outcomes.co.za/docs and /terms (fetched, SPA shell only, no content)
