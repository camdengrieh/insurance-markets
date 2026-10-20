# CRISP (crisp.trade / app.crisp.trade) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

- adapter_priority: **skip**. CRISP is a front-end/terminal that routes orders into the Polymarket CLOB (builder code attribution). It is NOT an independent liquidity venue. Its prices, books, token IDs and conditionIds are Polymarket's. The Polymarket adapter already covers everything CRISP lists.
- Only residual value: (a) CRISP's `/api/events` is a convenient Polymarket-mirror feed but is undocumented and unofficial, so use Polymarket Gamma/CLOB directly; (b) "smart money" / copy-trade claims (M, third-party) might be a signal source, but no public API for them was found.

## Live status

- Live (H): `https://app.crisp.trade/` returned HTTP 200 on 2026-10-19 (Vercel/Next.js). Title "CRISP | Predicts + Rewards". Home sections: LoL Worlds 2026 ("Coming soon"), Crypto, Esports, NFL, NBA, EPL; nav Home/Explore/Rewards/Search/You (portfolio).
- `www.crisp.trade` 307-redirects to `app.crisp.trade` (H, via WebFetch).
- Live market data flowing: `/api/events` returned 24 events with `fetchedAt` 2026-10-19T07:14Z, `stale:false`; 24h volume across those 24 items ~ $18.7M (all Polymarket volume, not CRISP volume) (H).

## Kind and market model

- Kind: aggregator/front-end ("other") over Polymarket. Every event in the sampled `/api/events` page had `venues: ["polymarket"]` (24/24) (H).
- Market model = Polymarket's: binary/categorical outcomes as CTF outcome tokens; each outcome has a Polymarket `tokenId` (ERC1155 id, decimal string) and each market has Polymarket `conditionId`; central limit order book (H, fixture `crisp-api-events.sample.json`).
- The frontend code has display config for other venue names (Polymarket, Hyperliquid, Kalshi, Limitless, Gemini, Predict.fun appear as strings/icons/link builders) (H, read from public JS bundle as text only), but live data sampled shows only Polymarket. The third-party directory says the X bio names Predictstreet and Predict.fun and claims >$300k traded on Predictstreet via CRISP (M: polymart.app listing, unverified). Treat any non-Polymarket routing as unconfirmed.
- Also a "crypto windows" feature (`/api/crypto/windows`, `/api/crypto/history`, websocket `wss://partner-api.crisp.trade/v1/crypto`) - probably short-window crypto up/down markets mirrored from Polymarket; not inspected further (L).

## Chains and collateral

- Polymarket underlying: Polygon, USDC-denominated (inferred from Polymarket CLOB; the CRISP client code references `polymarket.availableUsdc` for the account balance) (M/H for the string).
- CRISP login via Privy (email/Telegram/wallet endpoints `/api/auth/email-request`, `/api/auth/wallet-request`, `/api/auth/telegram-start`), imports/embeds wallets (`shareembedded`, `polymarketimported` providers in code), account setup/deposit/withdrawal endpoints (`/api/account/*`) (H, JS strings). Custody model unclear: third-party page claims "non-custodial" with no published audit (M). The server-side `/api/trade/execute` + `/api/account/recover-order` + "command state" objects suggest CRISP's backend places orders on the user's behalf using a session/delegated key (L, inferred).

## Read API

- exists: **unofficial-only**. No developer docs found (NOT FOUND, searched: crisp.trade root redirect, /docs, /terms and /llms.txt (both return the SPA shell with HTTP 200, no actual content), polymart.app listing, web search). The polymart listing says no public API or docs (M).
- Unauthenticated JSON used by their own web app (H, GET 2026-10-19, no auth, no key):
  - `GET https://app.crisp.trade/api/events` -> `{items:[...], nextCursor, fetchedAt, stale}`; ~1.9MB per page of 24 events, with embedded markets, outcome `tokenId`, `price`, `conditionId`, `acceptingOrders`, `volume`, `volume24h`, `resolutionSource`, `gameState`. Params seen in JS: `q`, `league`, `cursor`, `saved`.
  - `GET https://app.crisp.trade/api/events/{slug}` and `/api/events/{id}/markets?cursor=` (code only, not called).
  - `GET https://app.crisp.trade/api/discovery` -> categories (16: trending, new, politics, sports, crypto, esports, iran, finance, geopolitics, tech, elections, pop-culture, economy, weather, mentions, art) + featured events (H).
  - `GET https://app.crisp.trade/api/crypto/config` -> `{"wsUrl":"wss://partner-api.crisp.trade/v1/crypto"}` (H, fixture).
  - Seen in code only: `/api/featured`, `/api/featured/btc`, `/api/home/games`, `/api/charts`, `/api/team-artwork`, `/api/crypto/history`, `/api/crypto/windows`.
- Rate limits: NOT FOUND. Undocumented, can change without notice; do not depend on it.
- Websocket: the browser connects directly to Polymarket's `wss://ws-subscriptions-clob.polymarket.com/ws/market` for live prices (H, JS), confirming the book is Polymarket's.
- Better route: consume Polymarket Gamma/CLOB/WS directly (covered by the Polymarket workflow).

## Trade path

- Authenticated endpoints (code only; NOT called): `POST /api/trade/quote`, `/api/trade/execute`, `/api/trade/orders`, `/api/orders/cancel`, `/api/orders/replace`, `/api/account/order`, `/api/account/positions`, `/api/account/redeem`, `/api/account/deposit`, `/api/account/withdrawal*`, `/api/auth/session` (H, JS strings only).
- Auth is a Privy-backed session cookie (email/wallet/Telegram). No API key program or agent API documented. Third-party page says an "agent/AI module" and Telegram bot exist in closed alpha (M).
- Not integrable via PayBox: an EVM wallet through PayBox could instead trade Polymarket directly (signed CLOB orders on Polygon, optionally with CRISP's builder code), which is the Polymarket adapter's job. Using CRISP adds a custodial/session intermediary with no benefit. paybox_reachable: partial (only via the Polymarket path, not CRISP).

## Fees

- Polymarket builder-fee layer (H, Polymarket docs via search result, https://docs.polymarket.com/programs/builders/fees): builders may charge taker up to 100 bps and maker up to 50 bps, on top of platform fees; default 0; rate changes limited to once per 7 days; builder code is part of the signed V2 order struct; Polymarket can revoke/disable codes.
- CRISP's actual rate: NOT FOUND in first-party sources. Third-party listing claims 0.5% on successful executions (M/L, polymart.app, unverified). Frontend code has `feeBps` for a swap/deposit UI (H, string only; purpose unclear).
- Builder profile is publicly visible via Polymarket (rate could be verified on the profile; not done here).

## Resolution mechanism

- Same as Polymarket (UMA optimistic oracle; UI string "polymarket dispute" in CRISP code hints at disputed-market handling) (M). Per-market `resolutionSource` and `description` rules are passed through verbatim (H, e.g. NFL market resolves 50-50 on tie/cancel). Dispute risk = Polymarket's.

## Geo / ToS / automation

- NOT FOUND: no terms/privacy/geo text retrievable (/terms returns app shell). Inherits Polymarket geo restrictions presumably (M/L). Scraping `/api/events` is unauthenticated but undocumented; no ToS found either permitting or forbidding it.

## Liquidity

- Polymarket builder leaderboard (H, https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100, fetched 2026-10-19): rank 118 "Crisp.trade", cumulative routed volume $1,992,022, 133 active users, verified:true. (Fixture saved.) Day/week windows returned empty arrays on 2026-10-19 (query `timePeriod=week`/`DAY`), so recent activity could not be confirmed this way (L).
- ~$2.0M lifetime routed volume is tiny. All depth is Polymarket's.

## Event coverage / arbitrage

- Categories: sports (NFL, NBA, EPL, MLB, WTA, esports incl. CS2/LoL), crypto, politics, finance, economy, geopolitics, etc. (H, /api/discovery) - all a mirror of Polymarket. No distinct pricing, so no cross-venue arbitrage vs. Polymarket (identical book); arbitrage only exists vs. other venues, which Polymarket's own adapter provides.
- liquidity_shared_with: Polymarket (CLOB, builder-code attribution).

## Suspicious content

- None found. The polymart.app directory page mentions an `llms.txt` in its footer but no agent-directed instructions were observed. `https://app.crisp.trade/llms.txt` returned the normal app HTML shell, not a real file.

## Not found

- Official docs/API reference, terms of service, geo-restriction list, CRISP's own fee schedule, rate limits, any non-Polymarket live routing, custody model confirmation, security audit.

## Sources

- https://app.crisp.trade/ (H; homepage, live 2026-10-19)
- https://app.crisp.trade/api/events , /api/discovery , /api/crypto/config (H; unauthenticated GETs 2026-10-19)
- https://app.crisp.trade/_next/static/chunks/... public JS bundles, read as text only, not executed (H for strings; behavior inferred = M)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100 (H)
- https://docs.polymarket.com/programs/builders/fees and /trading/orders/attribution (H via search-result summary, not opened directly: treat as M)
- https://polymart.app/crisp-trade (M; third-party directory, promotional, unverified)

## Fixtures

- docs/research/fixtures/crisp-crisp-trade/crisp-api-events.sample.json (trimmed, 2 events)
- docs/research/fixtures/crisp-crisp-trade/crisp-api-crypto-config.json
- docs/research/fixtures/crisp-crisp-trade/polymarket-builder-leaderboard-crisp.json
