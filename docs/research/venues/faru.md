# Faru (tryfaru.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.
WebSearch was unavailable (session budget exhausted), so no third-party coverage was checked.

## Verdict
Live, but a tiny, custodial, NGN-denominated fiat app. It is not a crypto or on-chain venue, despite the "smart contracts" tagline. Priority: **skip**.

## Identity and liveness
- Nigerian event-contract site, "Bet on real-world events with smart contracts"; address in Kubwa, FCT, Nigeria. [H] https://www.tryfaru.com/
- Live: pages return 200; sitemap lastmod 2026-10-18; 7 markets with status "active". [H] https://www.tryfaru.com/sitemap/markets.xml, API below.
- Homepage stats: NGN 4.7K+ volume, 0 active traders, 94 contracts traded. [H] The stats look static/hardcoded (all 7 markets show 0 volume). [M]

## Kind and market model
- Kalshi-style YES/NO event contracts, grouped into multi-contract markets (`is_multi_contract`; e.g. EPL winner = 20 contracts, each with its own YES and NO). [H] API fixture.
- Each contract settles at NGN 100 per winning share. Prices are integers in kobo: 5000 = NGN 50, so a 100 NGN payout = 10000. [H] homepage "winning positions pay N100"; kobo scale is [M] inferred from last_yes_price=5000 shown as "N50".
- Order book: the frontend references `active-order-book`, limit purchase/sale with expiration, `/api/v1/orders`, `/api/v1/orders/bulk/update`, and Pusher/broadcasting channels. [H] bundle strings, endpoints themselves are authenticated (401).
- Contracts expose `last_yes_price`, `last_no_price`, `yes_ask`, `no_ask`. Every contract currently has 50/50 last prices and null asks, i.e. no resting liquidity at all. [H]
- Outcomes are rows in a database, not tokens. [M] No chain, token, or contract address appears anywhere on the site, bundles or GitHub org.

## Chains and collateral
- None on-chain found. Funds are NGN in a custodial wallet, funded by card or bank transfer; withdrawals by bank transfer with beneficiaries (routes `/account/deposit/card`, `/account/deposit/transfer`, `/account/withdraw/transfer`). [H] frontend route names in https://www.tryfaru.com/_nuxt bundles.
- NOT FOUND (searched: homepage, ToS, market page, Nuxt bundles, GitHub org): any chain name, token, contract address, or crypto deposit path. The org's only repo `Faru-Partnership/faru-event-horizon` is an unrelated Lovable/React landing template (last push 2025-08-05) with no contracts. [H] gh api.

## Read API
- Exists, but undocumented and unofficial in practice. The homepage footer shows "API Documentation / API Changelog / Status" under Developers, but the links are not real hrefs in the HTML, and `/docs`, `/api` on the site return the SPA 404 page; docs./api./status.tryfaru.com do not resolve. [H] NOT FOUND (searched: footer hrefs, those hostnames).
- Backend: Laravel on Laravel Cloud, base `https://faru.laravel.cloud/` (taken from the Nuxt runtime config). [H]
- Public unauthenticated GETs, JSON, CORS `*`, rate limit header `x-ratelimit-limit: 60` (per minute presumably). [H]
  - `GET /api/v1/markets` -> `{data:[market], links, meta}`; per_page 100, 7 markets. Market fields: id (uuid), ticker, title, description, status, frequency, pause_trading, is_multi_contract, starts_at, ends_at, payout_earnings_at, resolved_at, categories[], contracts[] (id, ticker `<market>-C<n>`, title, is_active, last_yes_price, last_no_price, yes_ask, no_ask), analytics{market_rank, market_value_locked}. [H] fixture `docs/research/fixtures/faru/markets.sample.json`
  - `GET /api/v1/categories` -> sports, politics, economy, finance, tech-science, elections, trump, tinubu, etc. [H] fixture `categories.sample.json`
  - Authenticated (401 "Unauthenticated" confirmed): `/api/v1/orders`, `/api/v1/portfolio/stats`. Other routes seen in bundle only: `/api/v1/markets/bookmarked`, `/api/v1/notifications`, `/api/v1/support`, `/api/v1/markets/contract-requests/create`. [H]
  - Per-contract order book / trades / history endpoints: NOT FOUND (searched: bundles, `/api/v1/markets/<ticker>` returns 404).
  - Websocket: Pusher-compatible broadcasting (`/broadcasting/auth`), channel names not determined. [M]
- Privacy note: the markets payload embeds `created_by`/`approved_by` objects with a person's phone and address; the fixture strips them. Do not log them.

## Trade path
- Programmatic trading: session-authenticated `/api/v1/orders` behind email/phone login (nuxt-auth); no public API key scheme or docs found. No `/api-key` route was found in Faru's own bundles. [H]
- No signing scheme, no on-chain path.

## PayBox reachability
**No.** Custodial NGN with card/bank rails; nothing a PayBox EVM/Solana wallet can sign or fund. Read-only price data would be technically reachable, but it carries no tradable depth.

## Fees
NOT FOUND. Site says only "discounts on fees for frequent traders". [H] homepage

## Resolution and disputes
- Operator-resolved (`resolved_by`, `resolved_at`, `payout_earnings_at`), users can submit a "Resolution Source" when requesting a new contract. No oracle, no dispute process documented. ToS has a "RuleBook" section and a "Trading Prohibition" section whose contents were not rendered. [H] https://www.tryfaru.com/terms-of-service
- Counterparty/operator risk is high: unlicensed-looking, custodial, tiny team. [M]

## Geo / ToS / automation
- Generic ToS (conduct, termination without notice). No stated geo-block or bot/API rules found. Nigeria-based; regulatory status unknown (no licence cited; "Compliance & Standards" page not located). [H]/[M]

## Liquidity
- All 7 markets: market_value_locked = 0, all contracts 50/50 with no asks, as of 2026-10-19. [H] API. Homepage claims NGN 4.7K (roughly USD 3) volume. [H]
- Shared with another venue: no evidence of it; independent but empty. [M]

## Event overlap (arbitrage relevance)
Only football outright markets (EPL, La Liga, Serie A, Bundesliga, Ligue 1 champions 2026/27; Men's and Women's Ballon d'Or 2026). These overlap Polymarket/Kalshi-type futures, but with zero quotes there is nothing to arbitrage. [H]

## Adapter priority: skip
No on-chain access, no depth, no documented API, custodial NGN. If ever revisited, a poll of `GET /api/v1/markets` (1 call/min) as a signal-only feed is trivial, but the prices are default 50/50 and carry no information.

## Open questions
- What do the "API Documentation" / "Compliance & Standards" footer links point to (not exposed as hrefs)?
- Do real quotes appear once traders exist (watch `yes_ask`/`no_ask`)?

## Sources
- https://www.tryfaru.com/ , /terms-of-service , /markets/epl-champions-20260813 , /sitemap/markets.xml , /robots.txt [H]
- https://faru.laravel.cloud/api/v1/markets , /api/v1/categories (200); /api/v1/orders , /api/v1/portfolio/stats (401) [H]
- Nuxt JS bundles served from https://www.tryfaru.com/_nuxt/ (route and endpoint strings only) [H]
- GitHub org Faru-Partnership, repo faru-event-horizon (README + tree via gh api) [H]
