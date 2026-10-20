# OrbCast (orbcast.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads, unauthenticated GETs to orbcast.xyz and its public API host. No account, wallet, key, signature, POST/PUT/DELETE or payment. WebSearch budget was exhausted, so there are no third-party press or traffic sources. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.

## 0. Bottom line

1. **Live, but small and young.** The site returns 200 (H) and the API reports `healthy` (H). The repo was created 2026-09-02 and last pushed 2026-09-24 (H). One star, one fork (H).
2. **It is a front-end and broker on Hyperliquid HIP-4, not a venue.** It has no order book, AMM, contracts or market data of its own. Prices, books and fills are Hyperliquid's. The UI talks directly to `api.hyperliquid.xyz` (CSP `connect-src`, H). OrbCast earns a **builder-code fee** on orders (3 bps default, H).
3. **Duplicate liquidity.** It is the same book as native Hyperliquid HIP-4 outcomes (spec: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`). It is not an independent arbitrage leg and has no read API worth adapting.
4. **adapter_priority = skip.** Do not build an OrbCast adapter. Build the native Hyperliquid HIP-4 adapter instead; if our plugin ever routes orders through HL, attaching our own builder code is the only relevant OrbCast idea. At most, OrbCast could be an optional "front-end label" in the venue registry.

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `GET https://orbcast.xyz` -> HTTP 200, Vercel static SPA, `last-modified: Wed, 30 Sep 2026 19:43:00 GMT`, title "OrbCast", description "Prediction markets on sports, crypto, stocks, and the economy. Back your call with Yes or No." (fixture `site_index_head.html`) | H |
| `GET https://backend-production-4b0a.up.railway.app/api/health` -> `{"status":"healthy","service":"orbcast-api"}` on 2026-10-19 (fixture `api_health.json`) | H |
| `GET /api/version` -> deployed commit `f48771ad...` of `LWL-OrbCast/orbcast`, branch main (fixture `api_version.json`). The latest commit in the repo is 2026-09-24 "events for football". | H |
| Repo `LWL-OrbCast/orbcast`: created 2026-09-02, pushed 2026-09-24, MIT, 1 star, 1 fork, 5 open issues. README version "0.1.5" in commit log. https://github.com/LWL-OrbCast/orbcast | H |
| Traffic, user counts, volume through OrbCast: **NOT FOUND** (searched: repo docs, API endpoints, site; web search unavailable). | - |

Verdict: **still_live = true**, early-stage (about 7 weeks old, small footprint). The repo is positioned as an open-source "reference" a fork can rebrand (`docs/FORKING.md`), so the live site is one deployment of a template (M).

## 2. Kind and market model

- **Kind (H):** mobile-first (Expo / React Native) plus Vite desktop front-end and FastAPI backend over Hyperliquid HIP-4 outcome markets. README: "Outcome markets only... Orders and HIP-4 actions are signed on-device (agent key). The backend does **not** place outcome orders." https://github.com/LWL-OrbCast/orbcast (README.md, AGENTS.md)
- **Market model:** inherited unchanged from HIP-4 (H via repo docs): fully collateralised, dated, no leverage, no liquidations; asset id `100_000_000 + 10*outcome + side`; read via `outcomeMeta`, `outcomeTemplates`, `settledOutcome`; user actions `userOutcome` split/merge/mergeQuestion/negate. Binary Yes/No plus multi-outcome questions; central limit order book on HyperCore. Full model in the native HIP-4 spec.
- **Catalog (H, ROADMAP.md / AGENTS.md):** chips All, Crypto, Stocks, Economics and sports. "Stocks = HIP-4 books whose oracle is a HIP-3 coin (`xyz:SNDK`)". Football (EPL, La Liga, Serie A, UEFA club, Nations League) uses API-Sports for **fixture chrome only, not odds** (AGENTS.md rule 10). Which deployer venues it lists (`out`, `txyz`, `skew`...) is read live from `outcomeMeta`; README says to trust live data and show an empty state if a sports filter is empty.
- Whether OrbCast filters out any venues or markets: NOT FOUND (searched: `hip4.ts` for venue filtering was not read in full; only grep of its header). Treat as showing all listed `outcomeMeta` rows (M).

## 3. Chains and collateral

- Trading and settlement on **HyperCore** (Hyperliquid L1), quote **USDC** (H via HIP-4 / native spec).
- Deposit rail (H, `docs/HL_BUILDER.md`): user holds USDC on **Arbitrum** (Privy embedded EOA); app builds an EIP-2612 permit for Bridge2 (`0x2df1c51e09aecf9cacb7bc98cb1742757f163df7`, per `server.py` default, which the native spec lists as the deprecated legacy bridge, M); a **backend relayer** submits permit and deposit and pays gas; minimum 5 USDC. Endpoint `POST /api/bridge2/deposit-with-permit` (not called by me).
- Withdrawals are signed client-side by the master EOA and sent to the HL exchange endpoint (H, HL_BUILDER.md).
- Wallet: Privy embedded self-custody EVM wallet (email, Google, Apple login) and WalletConnect for external wallets (CSP lists `relay.walletconnect.*`, H). EVM only (ROADMAP).

## 4. Read API

**Official/public read API for market data: none.** (Searched: openapi paths of the backend, `server.py` route list, repo docs.)

- Base URL of its own backend: `https://backend-production-4b0a.up.railway.app` (also the img host in the site CSP, H). OpenAPI is public at `/openapi.json` and the title is "OrbCast API" v1.0.0 (fixture `openapi_paths.json`, H). Only a few GET routes are unauthenticated and none carry market data:
  - `GET /api/health`, `GET /api/version` (commit hash), `GET /api/app-version`
  - `GET /api/builder-config` -> `{"address":"0xD2E580FD...","fee":30,"base_fee":30,"discount":0}` (fixture `api_builder_config.json`, H)
  - `GET /api/sports/football/epl`, `GET /api/sports/football/events/{fixture_id}`: API-Sports fixture and score overlay, not odds (not called, M)
  - Authenticated or user-specific (Privy JWT): `/rewards/*`, `/onboarding/*`, `/wallet/*`, `/push/*`, `/notifications/*`, `/demo/*`, `GET /forex/rates`. None relevant to pricing.
- **Market data comes from Hyperliquid directly:** the site's CSP allows `https://api.hyperliquid.xyz`, `wss://api.hyperliquid.xyz`, testnet equivalents, Privy, WalletConnect and Alchemy Arbitrum RPC (H, fixture `site_index_head.html`); `hlEndpoints.ts` hard-codes `https://api.hyperliquid.xyz/{info,exchange}` and `wss://api.hyperliquid.xyz/ws` (H). Client calls `hlInfo({type:'outcomeMeta'})`, spot volume, `settledOutcome` and a tape (`recentTrades`) (H, `frontend/src/lib/hip4.ts`).
- So an aggregator should use **Hyperliquid's** API (keyless WS `l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`; rate limits 1200 weight/min/IP REST, 1000 WS subscriptions per IP; see native spec section 4). There is nothing OrbCast-specific to read, and no OrbCast per-venue price differs from HL mid.
- Websocket of its own: none (NOT FOUND in route list).
- Rate limits of the OrbCast backend: NOT FOUND (no documentation; `Vary: Origin` suggests CORS-gated, not tested).

## 5. Trade path (programmatic)

- **OrbCast has no trading API.** Orders are placed directly on Hyperliquid by the client with a locally held **agent key** (`approveAgent`-authorised, signs trades only, cannot withdraw; HL_BUILDER.md, H). The master Privy EOA signs `approveAgent`, `approveBuilderFee`, withdrawals and Bridge2 permits.
- An agent could therefore trade the same books through Hyperliquid directly (EIP-712 L1 action signing, msgpack "phantom agent", `POST /exchange`), see native spec section 5. Going through OrbCast adds nothing but a builder fee.
- **Builder code (H):** default address `0xD2E580FDcBaf787B4eAbdECd25916587492363Ed`, fee 30 tenths-of-bp = 3 bps = 0.03%, public via `/api/builder-config`; the same address is printed as the project's donation address in the README. The commit log shows "change builder address" on 2026-09-23, so the address can change; clients pin it from app env and ignore a different server value (HL_BUILDER.md, H). The user must `approveBuilderFee` once.

## 6. PayBox reachability

**Verdict: partial (identical to native Hyperliquid HIP-4), no OrbCast-specific path.**

- OrbCast's web app logs in with Privy or WalletConnect. Driving it through a PayBox wallet would need browser automation (out of scope) and gains nothing, because the real API is Hyperliquid's.
- A PayBox EVM wallet could sign the Hyperliquid typed-data actions (`approveAgent` etc.) via `request_wallet_sign` (intents `typedData`/`raw`, per the native spec M/H), but orders are HyperCore signed actions, not EVM transaction proposals. Funding is reachable: USDC on Arbitrum (in PayBox's chain set).
- Skip OrbCast; see `hyperliquid-hip-4-outcomes-native.md` section 6.

## 7. Fees

- **HL protocol fees:** same as native HIP-4: no fee on opening an outcome position, fees on closing or settling; fee rate per market includes `deployerFeeScale` (native spec section 7; observed live 2026-10-19 as 1.0, i.e. 2x base, M).
- **OrbCast add-on (H):** builder fee 3 bps (0.03%) by default, on orders where the builder is attached. `HIP4.md` in the OrbCast repo says builder fees apply "on sells **and** buys (charged in quote)"; the official HL HIP-4 page (per the native spec) says builders earn "on sell orders" only. These conflict; which is true is **NOT FOUND** (not verified against the exchange). Rewards can give a fee `discount` (0 in the live config).
- A direct HL API trade pays no builder fee, so OrbCast is strictly more expensive than going direct.

## 8. Resolution and dispute risk

Entirely inherited from Hyperliquid HIP-4 (native spec section 8): protocol auto-settle for recurring series, validator-voted templates, and deployer-settled markets with no trader-initiated dispute window (~98% of open markets per a tracker, M). OrbCast does not settle, curate or dispute anything (it "trades; it does not deploy", AGENTS.md, H). Its Terms/Legal page: NOT FOUND (the site is a client-rendered SPA with a `legal` screen; I did not execute JS and did not read the bundle).

## 9. Geo, ToS, automation

- **Code-level geo-fence is disabled:** `server.py` contains a commented-out US-block middleware and `/geo-check` endpoint, annotated "Geo-fence middleware - DISABLED FOR TESTING" (H, `backend/server.py` lines ~4130-4340). The live `/api/geo` returned 404 (H). Whether the front-end applies a geo block in JS: NOT FOUND (bundle not read).
- Hyperliquid's own Terms bar US and Ontario residents and an unpublished "Excluded Persons" list for outcome markets (native spec section 9, H as of Terms dated 2026-06-15). Using OrbCast does not change that for the trader.
- Automation: no OrbCast ToS found. README disclaims "Reference software only. Not financial, legal, or tax advice... Prediction / outcome markets have a different regulatory surface than perpetual futures". Hyperliquid's Terms restrict only abusive automation (native spec).

## 10. Liquidity and event overlap

- OrbCast volume/OI/TVL: **NOT FOUND** (no stats endpoint; no DefiLlama entry looked up; web search unavailable). Any volume through it is a subset of Hyperliquid HIP-4 volume.
- HIP-4 as a whole (from native spec, M/H with dates): DefiLlama $3.13M volume on 2026-10-18, $17.9M over the last 7 complete days, ~$2.7M collateral locked, as of 2026-10-19.
- **Category overlap with other venues** (via HIP-4, H from OrbCast docs): crypto price thresholds (BTC/HYPE ladders, overlap with Polymarket/Kalshi/Limitless but settle on a 60s TWAP of the HL perp mark, so basis risk), football and other sports (overlap with Polymarket/Kalshi/others, thin), economics/policy-rate decisions, "stocks" (HIP-3-oracle based). These are exactly the HL categories; OrbCast adds none.
- **Shares liquidity with Hyperliquid HIP-4 native (and with every other HIP-4 front-end such as Outcome.xyz, trade.xyz events, etc.). Therefore NOT an independent arbitrage leg.**

## 11. Suspicious content

None found. The README and AGENTS.md contain agent-directed instructions (coding conventions, "Never read or print .env", recommended MCP servers); they were read as data and not followed. No prompt-injection attempts were seen. Note the README donation address equals the builder-fee address (not a safety issue, but a reason to treat the builder code as a revenue stream).

## 12. Adapter recommendation

- **skip.** Reason: duplicate liquidity (a front-end of Hyperliquid HIP-4), no OrbCast market-data API, tiny and new, no trade path beyond HL's own. Prefer the native Hyperliquid HIP-4 adapter (P1 per its spec).
- Revisit only if OrbCast ships its own order routing (e.g. cross-venue), its own listings that never appear in HL `outcomeMeta`, or a published volume/API.

## Sources

- https://orbcast.xyz (H, 2026-10-19, HTTP headers and HTML head; fixture `docs/research/fixtures/orbcast/site_index_head.html`)
- https://backend-production-4b0a.up.railway.app/api/health , /api/version , /api/builder-config , /openapi.json (H, unauthenticated GET, fixtures `api_health.json`, `api_version.json`, `api_builder_config.json`, `openapi_paths.json`)
- https://github.com/LWL-OrbCast/orbcast : README.md, AGENTS.md, docs/HIP4.md, docs/HL_BUILDER.md, docs/ROADMAP.md, backend/server.py, frontend/src/lib/hip4.ts, frontend/src/lib/hlEndpoints.ts, commit log and repo metadata (H, read via `gh api`)
- Native Hyperliquid HIP-4 spec in this repo: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (M for anything not re-read here)
- Not searched / unavailable: third-party coverage, traffic, volume (WebSearch budget exhausted).
