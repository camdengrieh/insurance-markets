# Stride Markets (ATLASSTRIDE TECHNOLOGIES LIMITED) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to the marketing site, its static JS bundles (read as text, never executed), the App Store lookup API, and the API host. No account, wallet, key, signature or PayBox tool. WebSearch was unavailable (session budget used up), so no press, social or third-party coverage was read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/stride-markets-atlasstride-technologies-limited/`
- `api_stride_markets_suspended_2026-10-19.html` - the API host's response to `GET /internal/api/v1/markets`.
- `itunes_lookup_ng_2026-10-19.json` - App Store lookup (screenshots stripped).

---

## 0. Bottom line

1. **Marketing site is up, but the backend API is suspended, and the app has had no release since Aug 2025.** `https://api.stride.markets/internal/api/v1/markets` (the base URL hard-coded in the site's JS) returns HTTP 503 with "Service Suspended - This service has been suspended by its owner." (H, 2026-10-19). Last iOS release 1.2.0 on 2025-08-04 (H). The sitemap's lastmod is 2025-08-11 (H). So the venue is functionally dead as a tradeable market. The only 2026 signal is a renewed Let's Encrypt cert on www (issued 2026-09-01), which shows the web frontend is still deployed, not that markets run (H).
2. **Own product, not an aggregator.** The JS contains routes for its own order book (`/markets/{id}/orderbook`, `/markets/{id}/orders`), admin market create/approve/resolve, and price history. It does not appear to route to Polymarket or Kalshi (no such strings in the app bundle, M - absence in minified JS is not proof). Fixed-odds and parlay "tickets" per the app-store notes (H).
3. **adapter_priority = skip.** API suspended, no documented public API, fiat/NGN-oriented custodial product, no on-chain component found, no liquidity data.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.stride.markets/` | HTTP 200, Next.js shell, title "Stride Markets", meta "A platform for trading and investing in prediction markets"; body is JS-rendered, no static content (same shell for /how-it-works, /about, /careers, /support, /regulatory-framework, /terms) | H |
| TLS | www cert issued 2026-09-01 (Let's Encrypt, valid to 2026-11-30); apex `stride.markets` resolves to a different IP (192.64.119.196) with an EXPIRED cert (notAfter 2025-05-27) | H |
| `https://api.stride.markets/*` | HTTP 503 "Service Suspended ... by its owner" for `/`, `/internal/api/v1`, `/internal/api/v1/markets`, `/docs`, `/health` (looks like a hosting-platform suspension page) | H |
| sitemap.xml | 7 URLs, lastmod 2025-08-11T07:18:41Z; no later date | H |
| App Store NG (id6747284701) | v1.2.0 released 2025-08-04, v1.1.0 2025-07-25, v1.0 2025-07-14; 2 ratings (5.0); price free; currency NGN; 17+ "Gambling", "Frequent/Intense Contests" | H (itunes lookup API + store page) |
| Google Play `stride.markets.android` | store page returned HTTP 404 on 2026-10-19 (possibly region-blocked from this client or delisted; cannot tell) | L |
| Links in JS | X `@stride_markets`, Instagram `stridemarkets`; PostHog analytics, Sentry, Vercel analytics | H |

Verdict: **not live as a functioning market** (backend suspended). Treat as dead unless the API host comes back.

## 2. Kind and market model

- Kind: centralized/custodial regional prediction-market app (users "create an account, fund a wallet, place trades, withdraw profits" - H, App Store description). No chain or smart contract named anywhere (NOT FOUND, searched: App Store text, site JS bundles, terms route is JS-only).
- Model per app-store notes and API route names: order book with limit orders (v1.1.0), fixed-odds markets and parlay stacking (v1.2.0) (H). Outcome tokenisation: NOT FOUND; likely internal ledger shares (L, inferred from custodial flow).
- Binary vs categorical vs scalar: NOT FOUND.
- Categories claimed: sports, politics, entertainment, economics, technology; "local and global markets" for Africa (H, App Store).

## 3. Chains and collateral

NOT FOUND. App Store currency tag is NGN (the listing's storefront currency, not necessarily the trading currency). Bundle mentions only the word "polygon" in SVG-element lists (not the chain). (searched: JS bundles for polygon/solana/base/usdc/usdt/fiat providers; hits only SVG tags.)

## 4. Read API

- Exists: **unofficial-only / none documented.** No docs site found. The frontend talks to a private REST API (H, read from the site's page chunk):
  - Base: `https://api.stride.markets/internal/api/v1` (axios, `withCredentials: true`, i.e. cookie session).
  - Response envelope: `{status, message, data}`; `status:"error"` throws; 401 -> "Unauthorized. Please log in or create an account", 403 -> forbidden.
  - Market endpoints seen: `GET /markets` (query: status, category, featured, tag, search, time_frame, sort_by, sort_order, limit, offset), `GET /markets/{id}`, `GET /markets/slug/{slug}`, `GET /markets/{id}/price-history?timeFrame=`, `GET /markets/{id}/recent-trades`, `GET /markets/{id}/similar`, `GET /markets/stats`, `GET /markets/{id}/orderbook`.
  - Authed/user: `POST /markets/{id}/orders`, `DELETE /markets/{id}/orders/{orderId}`, `GET /markets/{id}/orders`, `GET /user/orders`, `/user/markets/...`, `/auth`.
  - Admin (not for us): `/admin/markets`, `/approve`, `/suspend`, `/resolve`, `/payout-analysis`.
- Whether the `GET /markets*` endpoints were public when the API was up: unknown. Response shapes: **could not be confirmed**; the host returns only the suspension page (fixture saved). No samples of real data.
- Websocket: NOT FOUND. Rate limits/auth docs: NOT FOUND.
- Docs URL: none.

## 5. Trade path

Cookie-session REST (`POST /markets/{id}/orders`) behind account login; no wallet signature scheme found. The API is suspended, and we must not create accounts. Programmatic trading: effectively none.

## 6. PayBox reachability

**No.** No on-chain contract or signed-order scheme found, and the API is down. Nothing for an EVM/Solana wallet to propose or sign.

## 7. Fees

NOT FOUND (App Store lists no fees; terms page is JS-rendered and its text was not retrievable without executing JS).

## 8. Resolution and dispute risk

Admin-operated: the API has `POST /admin/markets/{id}/resolve` and a payout-analysis endpoint, indicating operator-resolved markets (H for route existence, M for interpretation). No oracle or dispute process documented. High operator/counterparty risk.

## 9. Geo / ToS / automation

Targeted at African users (H, App Store). A `/regulatory-framework` page exists but its content is JS-only and was not read. Terms not retrieved. robots.txt: allows all except auth/wallet/portfolio/settings/notifications/onboarding/admin paths (H). Automation rules: NOT FOUND.

## 10. Liquidity

NOT FOUND. No volume, OI or TVL published anywhere reachable; the App Store shows 2 ratings, suggesting negligible usage (L/M). No DefiLlama or analytics source read (searched: none available this session).

## 11. Overlap and shared liquidity

Claimed categories (sports, politics, economics) overlap other venues, but with no readable prices there is no arbitrage leg. Local African markets (e.g. Nigerian events) may be unique but are unreadable. Whether it mirrors Polymarket/Kalshi liquidity: NOT FOUND; app bundle shows no such references (M). Looks like its own book.

## 12. Revisit triggers

Re-check if `api.stride.markets` stops returning the suspension page, a new app version ships, or a public docs link appears. Cheap probe: `curl -A insurance-markets-research/0.1 https://api.stride.markets/internal/api/v1/markets?limit=1`.

## 13. Suspicious content

None found. The site contains no AI-targeted instructions in the HTML/JS read. (Note: the shared scratchpad directory held unrelated files from other agents; they were ignored and not used as evidence.)

## Sources

- https://www.stride.markets/ , /sitemap.xml , /robots.txt , and static JS chunks under /_next/static/chunks/ (esp. app/page-5e81e43cba3dd46a.js) - H, fetched 2026-10-19
- https://api.stride.markets/internal/api/v1/markets - H (503 suspended), 2026-10-19
- https://apps.apple.com/ng/app/stride-markets/id6747284701 and https://itunes.apple.com/lookup?id=6747284701&country=ng - H, 2026-10-19
- https://play.google.com/store/apps/details?id=stride.markets.android - 404 on 2026-10-19 (L)
