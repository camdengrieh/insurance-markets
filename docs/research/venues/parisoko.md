# Parisoko (parisoko.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Verdict: **adapter_priority = skip** (fiat/M-Pesa custodial app, no public API, no on-chain leg, not reachable from PayBox).

## Summary
- Parisoko describes itself as "a prediction market where Kenyans forecast outcomes in sports, crypto, business, and current events" [H, homepage meta description, https://parisoko.com].
- Site is up on 2026-10-19 (HTTP 200, Next.js app) [H]. Sitemap lastmod is 2026-06-03 [H, https://parisoko.com/sitemap.xml]; it lists /trending, /categories, /closing-today, which return 404 today [H], so the sitemap is stale or the routes were renamed.
- The homepage is a client-side-rendered shell (BAILOUT_TO_CLIENT_SIDE_RENDERING); no market data, volumes or terms are visible without running JS [H]. So "live" = the app is deployed; whether markets are actively traded and with what volume is NOT FOUND.
- GitHub org Adisia-io (created 2022-09-25) has 0 public repos [H, gh api]. The link between Adisia and Parisoko is only the lead in the task hint [L]; not confirmed.

## Kind / market model
- Kind: centralised, fiat-denominated (KES) prediction app. [M, inferred from bundle strings below]
- Evidence from the public JS bundle (untrusted but first-party code, read as data) [H for the strings, M for interpretation]:
  - Payment constants `MPESA_STK`, `CARD`, status `PROCESSING/PENDING/SUCCEEDED/FAILED/EXPIRED`; wallet UI rendered as "KES <amount>".
  - Flow: "prediction slip" -> place a prediction -> response contains `quote` {quoteId, expiresAt, amountNet, feeAmount}; outcomes carry `label` and `odds` (implied probability as a number).
  - Feed has categories/subcategories, `savedOnly`, `privateOnly` (private markets exist), cursor pagination.
- Market model (order book vs AMM vs parimutuel): NOT FOUND (searched: homepage, JS bundle for parimutuel/orderbook/AMM terms; the search tool budget was exhausted so no third-party coverage was found). The quote-based "place" flow suggests house/quote pricing, not a public CLOB [L].
- Outcome tokenisation: none evident; positions are database rows tied to a phone-number account [M].

## Chains and collateral
- No chain, token or contract referenced anywhere in the site, bundle or CSP [H for absence in what I read]. Collateral = KES via M-Pesa STK push or card [H strings]. Login is phone-number based (`/api/v1/auth/phone/start|verify|status|resend`) [H strings].
- CSP connect-src allows `https://pocketbase.apps.parisoko.com` [H], so a PocketBase backend/realtime host likely exists. Not probed.

## Read API
- Official public API: NOT FOUND (searched: homepage links, robots.txt, sitemap, /docs, /api/markets, GitHub org). `/docs` and `/api/markets` just return the SPA shell/404 page.
- Internal BFF endpoints seen in the bundle (undocumented, session-cookie/NextAuth, same-origin) [H strings]:
  `/api/v1/predictions/trending`, `/api/v1/predictions/taxonomies`, feed under `/api/v1/predictions/...` (q, categoryId, subcategoryId, sort, limit, cursor), `/api/v1/market-configs/resolve`, `/api/v1/highlights/dashboard`, `/api/v1/prediction-slip`, `/api/v1/predictions/place`, `/api/v1/wallet/breakdown`, `/api/v1/me/watchlist/ids`, `/api/v1/notifications*`.
- I did NOT call these: robots.txt says `Disallow: /api/` [H] and they are undocumented, so no fixtures were saved. fixtures_saved = none.
- Websocket: NOT FOUND (CSP allows `ws:`/`wss:` generically; PocketBase realtime possible).
- Rate limits: NOT FOUND.

## Trade path
- No programmatic trading API. Only the web/PWA UI (manifest: "Parisoko App", standalone PWA) with phone login + M-Pesa STK push [H]. Automating it would mean scraping/driving a consumer account; not appropriate.

## PayBox reachability
- No. No EVM/Solana transaction, signed-order or x402 interface; funds enter through Kenyan mobile money/card in KES. [M]

## Fees
- A `feeAmount` is returned in each placement quote (amount net of fee) [H string]; formula/rate NOT FOUND (terms not readable without JS; /terms is client-rendered).

## Resolution / dispute
- NOT FOUND. `/terms`, `/privacy`, `/support` routes exist in the app [H strings] but their content is not server-rendered. Assume centralised operator resolution [L].

## Geo / ToS / automation
- Positioned for Kenyan users (`og:locale en_KE`) [H]. Terms text NOT FOUND. robots.txt disallows /api/, /auth/, /dashboard/, /admin/ [H]. Kenya gambling regulation (BCLB) status of the product: NOT FOUND (no search budget).

## Liquidity
- Volume/OI/TVL: NOT FOUND (no public numbers on any page I could read). Assume thin/retail, KES-only [L].

## Event overlap (arbitrage relevance)
- Claimed categories: sports, crypto, business, current events [H meta]. Possible overlap with global venues on crypto price and major sports, but unusable without an API and with KES-only, closed-loop funding. Local Kenyan events have no overlap. At most a manual signal-only source.

## Shared liquidity
- Appears independent (own custodial book) [L], but this is moot.

## Open questions
- Does a PocketBase public collection list markets? (not probed; undocumented host)
- Fee schedule, resolution rules, and licensing (terms unreadable).
- Is there any partner/B2B API? (no evidence)

## Sources
- https://parisoko.com (homepage HTML, meta tags, CSP header, 2026-10-19) [H]
- https://parisoko.com/robots.txt, /sitemap.xml, /manifest.json [H]
- https://parisoko.com/_next/static/chunks/*.js (public bundle, read as untrusted data) [H for strings]
- gh api users/Adisia-io (org created 2022-09-25, 0 public repos) [H]
- WebSearch was unavailable (session budget exhausted), so no third-party sources.
