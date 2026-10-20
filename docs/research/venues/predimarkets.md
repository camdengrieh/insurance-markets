# Predimarkets - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: predimarkets.com home page and /terms (curl + WebFetch summariser), npm registry JSON, the vendor's public GitHub SDK source (read via `gh api` raw only, nothing cloned or run), and unauthenticated GETs to api.predimarkets.com (generic User-Agent `insurance-markets-research/0.1`). No account, key, wallet, signature, POST or payment. Third-party text treated as untrusted data. The shared WebSearch budget was exhausted, so there is no search-engine corroboration.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak/stale. `(wf)` = through the WebFetch summariser, not raw.

Fixtures (<1 KB): `docs/research/fixtures/predimarkets/markets-401.json` (the 401 body from `GET /v1/markets`), `docs/research/fixtures/predimarkets/health.json` (`GET /health`).

---

## 0. Verdict

**adapter_priority: skip.** Predimarkets is a B2B infrastructure vendor, not a venue with public markets.

1. **Live but as a vendor (H).** Home page 200 on 2026-10-19; API host healthy; npm SDK published 2026-07-12; SDK repo created 2026-07-12. Young product (about 3 months of public footprint).
2. **No public read API (H).** Every `/v1/*` call needs a partner token; unauthenticated `GET /v1/markets` returns 401 `UNAUTHORIZED`. No public docs site, OpenAPI or llms.txt found (`/docs`, `/openapi.json`, `/v1/openapi.json` 404; `docs.predimarkets.com` does not resolve).
3. **No on-chain trade path and no chain disclosed (H).** Home page names no chain. Trading is a custodial partner API: the partner key authenticates the operator, the operator supplies its own `partner_user_id`. There is no wallet signing, so a PayBox wallet cannot trade it.
4. **Liquidity not independent or published (H).** Home page states no volume, liquidity or market count (wf). "Dedicated liquidity" is sold per operator. Named operators: 5050 Markets (Kenya) and MulaBet; both sit behind Cloudflare/blocked from my fetch (5050markets.com 403, mulabet.com TLS failure), so I could not look at what they list.
5. **Becoming a partner is the only way in**: Terms require a Partner Program enrolment and a minimum $100 USDC collateral deposit (H, /terms (wf)). That is account creation plus a payment, out of scope for this read-only work.

**Revisit only if** Predimarkets publishes a public market-data feed (or an operator exposes one) with meaningful volume. Even then it is a signal-only source for Kenyan/African retail markets (sports, local equities), not an arbitrage leg.

Confidence: high that there is no public API and no wallet trade path; medium on market model details (inferred from SDK source).

---

## 1. Kind and market model

- Kind: infrastructure vendor ("matching, oracle resolution and settlement ... You run the brand. We run the machinery.") for betting companies, prediction markets and liquidity providers. H, https://predimarkets.com/ (wf).
- Market types: binary and multi-outcome (categorical). H, SDK `multiOutcome` flag and `/parimutuel-categorical/*` paths, https://github.com/musakkka/predimarkets-sdk (src/index.ts). Home page says "two outcomes or many" (wf).
- Pricing model: the SDK routes quotes and market state through `/parimutuel/*` and `/parimutuel-categorical/*`; npm 0.1.0 keywords included "parimutuel" (removed in 0.2.0). Orders are "money staked 1:1" and the return multiplier is "locked in at the moment the bet is placed"; home page says prices move with user trades (wf). Conclusion: parimutuel-style pool with a locked return multiplier, not a CLOB or AMM. M (inferred from SDK naming and docs strings). The SDK also exposes `GET /markets/{id}/orderbook` and legacy share-based `quantity`/`price` limit orders ("Legacy share-based markets only"), so older markets may have used an order book. H that the endpoint exists in the SDK; its behaviour unverified.
- Tokenisation: none. Positions and tickets are database records (`/positions`, `/trades`, `/parimutuel/markets/{m}/tickets/{id}/value`). H (SDK).
- Outcome status: `eliminated: true` flag on dead runners; market status `open|closed|resolved|voided|scheduled`. H (SDK types).

## 2. Chains and collateral

- Chains: NOT FOUND (searched: home page, /terms (wf), npm readme, SDK source). Nothing on-chain is referenced.
- Collateral: partner deposits a minimum of $100 USDC as initial collateral; settlements run from the collateral pool (/terms (wf), H). End-user money handling is the operator's concern (operator-held balances; `INSUFFICIENT_BALANCE` error in SDK). Operator currency examples (KES, M-Pesa) not verified.

## 3. Read API

- Exists: **official-authenticated** (partner token only).
- Base URL: `https://api.predimarkets.com` with `/v1` prefix (H, SDK `DEFAULT_BASE_URL`; server answered). Health: `GET /health` returns 200 `{"status":"ok",...,"services":{"database":..,"redis":..}}` (H, fixture).
- Docs URL: NOT FOUND (searched: predimarkets.com nav, `/docs`, `/openapi.json`, docs.predimarkets.com). The only documentation is the npm README / SDK source: https://www.npmjs.com/package/predimarkets and https://github.com/musakkka/predimarkets-sdk (MIT, v0.2.0).
- Auth: `Authorization: Bearer <partner API key>`; the server's 401 text says the token may also be given via cookie `predimarkets_token` or a query parameter (H, fixture). Server-side keys only.
- Key endpoints (all H from SDK source, not exercised because they need a key):
  - `GET /v1/markets?status&limit&offset&category`, `GET /v1/markets/search?q=`, `GET /v1/markets/{idOrSlug}`
  - `GET /v1/markets/{id}/price-history?outcome_id&timeframe=1H|1D|1W|1M|ALL`, `GET /v1/markets/{id}/orderbook`
  - `GET /v1/parimutuel/markets/{id}` and `/v1/parimutuel-categorical/markets/{id}` (live state per outcome), `GET /v1/parimutuel/quote` and `/v1/parimutuel-categorical/quote` (`market_id,outcome_id,stake`)
  - `GET /v1/positions`, `GET /v1/trades` (both filtered by `partner_user_id`; likely the operator's own data, M)
  - `GET /v1/markets/{id}/milestone-live` (README example)
- Market object fields (SDK type): `id,title,slug,description,market_type,source,status,trading_ends_at,resolution_at,resolution_criteria,resolution,outcomes[{id,label,current_price,potential_return,total_volume,eliminated}],total_volume,traders`.
- Rate limits: NOT FOUND in docs; Terms say circumventing rate limits is prohibited and excessive use may be throttled (H (wf)). No `X-RateLimit` headers seen on the 401.
- WebSocket: "REST and WebSocket API access" is listed on the pricing section (wf, H); no WS URL or message format documented anywhere. Webhooks: HMAC-SHA256 over raw body in `x-predimarkets-signature`; events `market.resolved`, `positions.refund` (H, README).
- Unauthenticated sample saved: only the 401 body (no market data is public).

## 4. Trade path

Programmatic but partner-only: `POST /v1/orders` with `{market_id, outcome_id, partner_user_id, side, order_type, amount, max_spend}` under a Bearer key (H, SDK). No EIP-712 or wallet signature. PayBox reachability: **no**. There is no address to send a transaction to and the venue only accepts operator API keys; a PayBox wallet could at best fund the $100 USDC partner collateral through a manual off-platform arrangement (no mechanism documented), which is not a trading path.

## 5. Fees

- No public schedule. "Pricing depends on settlement volume", custom quoted via sales (wf, H).
- Partner keeps 45% of trading fees generated by its users (so Predimarkets keeps 55%) (/terms (wf), H). Per-bet fee exists: the quote returns a `fee` field (SDK type, H) and `max_spend` caps "total spend including fees". Rate unknown. Paid by the bettor, embedded in the quote.

## 6. Resolution and dispute risk

- Oracles read social counts, crypto and equity prices (including Nairobi Securities Exchange) and live sports data; stale feed pauses the market rather than resolving (home page (wf), H). Human moderation desk reviews question, deadline and source before listing; disputes decided by people and published against the market; voiding is recorded (wf).
- Risk: centralised, operator-and-vendor discretion, markets can be paused or voided; terms allow changes and termination at any time. No on-chain recourse. Resolution criteria for a given market are only visible via the authenticated API (`resolution_criteria`).

## 7. Geo, ToS and automation

- Terms are written for Partners, not end users; no country list; partners must hold their own licences and do KYC/AML; disputes via AAA arbitration, Delaware law (https://predimarkets.com/terms, wf, H).
- Automation: API keys required, do not circumvent rate limits; scraping not explicitly addressed (wf). Third-party use of operator-brand front ends (5050 Markets etc.) would be governed by those operators' own terms, which I could not read.
- Home page claims "live in 9+ countries" and 99.999% settlement-path uptime; unverified marketing claims. L/M.

## 8. Liquidity

NOT FOUND (searched: home page, npm, SDK source, /terms). No volume, OI, TVL, trader count or market count is published. The "1,284,910 / 1,300,000" figure on the home page is an illustrative diagram counter, not volume. Treat as thin and unmeasurable.

## 9. Event overlap and shared liquidity

- Categories evidenced: live sports (e.g. SDK doc example "will-france-win-the-world-cup-2026"), social-count markets, crypto and equity price markets, NSE (Kenya) equities, politics-style search example ("who wants to be president") (H, SDK docs/home page). These overlap global venues only for headline sports and crypto price events.
- Shared liquidity: "dedicated liquidity" and "liquidity network" language suggests operators may share a Predimarkets pool; whether it routes to an external venue is NOT FOUND. Pari-mutuel pools are not hedgeable against order-book venues at the quoted multiplier without taking the full fee/lock-in risk, so it would not be a clean arb leg even if accessible.

## 10. Sources

- https://predimarkets.com/ (H, curl + wf, 2026-10-19)
- https://predimarkets.com/terms (H, wf, 2026-10-19)
- https://registry.npmjs.org/predimarkets (H; versions 0.1.0 and 0.2.0 both 2026-07-12; README read in full)
- https://github.com/musakkka/predimarkets-sdk (H; src/index.ts v0.2.0; repo created 2026-07-12, 1 star; maintainer GitHub account is personal, the npm account is "predimarkets")
- https://api.predimarkets.com/health and /v1/markets (H, unauthenticated GET, 2026-10-19)
- https://5050markets.com, https://www.5050markets.com (403), https://mulabet.com (TLS error): operator sites not readable.
- Not read: /privacy.

## 11. Open questions

- Does any operator (5050 Markets, MulaBet) expose a public market feed? Needs a browser-grade fetch, which is out of scope.
- WebSocket URL and message schema, rate-limit numbers, fee rate, sandbox URL: all gated behind partner onboarding.
