# Puul (joinpuul.com) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session (URL cited), M = secondary/inferred, L = weak/stale.

## Verdict

- Puul is NOT a prediction market venue in the sense the aggregator needs. It is a white-label B2B "Partner API" (prediction markets + lottery pools) that fintech/mobile apps embed, aimed at Nigeria/Africa (NGN, KES, GHS, ZAR plus USDC/USDT). Operator: Ivorychain Technologies Inc. (H, https://www.joinpuul.com/).
- Market model is parimutuel, operator-curated, with a 10% take-out. No order book, no on-chain tokens, no wallet-signed orders (H, SDK + public API payloads).
- All read endpoints that matter (live markets, odds, ticker, price history) require partner OAuth credentials issued after partner verification. Only a legacy unauthenticated `GET /api/v1/markets` exists, and as of 2026-10-19 it returns `[]` for live markets (H).
- Last market ever created was 2026-04-25 (H, fixtures). No live or frozen market on 2026-10-19; consumer app "launching soon" (H). Effectively dormant or pre-launch. Adapter priority: skip.
- Brand/domain mapping resolved: the discovery hint "puul.io redirects to dappback.com" is irrelevant; the real domain is joinpuul.com, and the npm packages and GitHub org Puul-Market point to it (H, npm registry; org exists but has no public repos, see below).

## Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| Site | https://www.joinpuul.com/ returns 200; copy "© 2026", "App Launching Soon", claims 50K+ end users, 2.5B+ NGN volume, <50ms latency (marketing, unverified) | H (page), L (claims) |
| Company | Ivorychain Technologies Inc.; contacts at joinpuul.com | H |
| GitHub | github.com/Puul-Market/puul returns 404 via gh API and WebFetch; org `Puul-Market` exists (id 257529128) with zero public repos. npm `homepage`/`repository` point at this repo, so the repo is private or deleted. | H |
| npm | `@puul/typescript-sdk` 1.4.0 (2026-03-02), 1.5.0, 1.6.0 (2026-03-04, latest). Other pkgs: `@puul/react-native-sdk` 1.5.0, `@puul/mcp-server` 1.1.0, `@puul/widgets`, `@puul/widgets-react`. Monthly downloads 6-13. All published 2026-03-02..04, no releases since (so roughly 7.5 months stale). | H (https://registry.npmjs.org/@puul%2ftypescript-sdk and registry search) |
| API host | https://api.joinpuul.com/api/v1 ; `/health` returns `{"status":"ok"}` on 2026-10-19 | H |
| Docs | `docs.joinpuul.com` (named on site and in OpenAPI contact) does NOT resolve in DNS (curl error 6). Swagger UI is live at https://api.joinpuul.com/api/docs and the spec at https://api.joinpuul.com/api/docs-json | H |
| Press / third-party coverage | NOT FOUND (searched: web search "Puul prediction markets lottery pools Partner API", "joinpuul.com Puul Ivorychain Technologies Nigeria prediction market launch"; only the homepage describes the product). One unverified hint of a link to Ivorypay via Crunchbase listing. | M/L |

## Kind and market model

- Kind: B2B white-label prediction-market + lottery infrastructure (centralised, custodial omnibus ledger). (H)
- Market types seen in API payloads: `binary` (YES/NO outcomes) and `categorical` (N outcomes). No scalar seen. (H, fixtures `public-markets-settled.json`)
- Mechanism: parimutuel. Each outcome has `pool_amount`; payout multiplier = total_pool / outcome_pool (SDK type comment, H). Odds move as stakes are added; "shared liquidity, no house risk" in site copy (H). A binding quote locks odds for a window (OpenAPI says 60 seconds, SDK README says 10s; conflicting) (H).
- Outcome tokenisation: none. Outcomes are UUID rows in the operator's database; positions are "predictions" tied to a partner-linked user. No ERC-20/1155, no on-chain position. (H)
- Market creation: operator/partner-curated (`scope: global`, `owner_partner_id`, `created_by`); site example shows partners can create markets via client. Questions are Nigeria-centric (fuel price in Naira, 2027 Nigerian election, Nigerian football, Nigerian celebrities) plus some global crypto/EPL/Arsenal questions. (H)

## Chains and collateral

- Currencies accepted for stakes: NGN, USDC, USDT, KES, GHS, ZAR (H, SDK `Currency`, OpenAPI enum). Market `currency`/`asset_id` observed = USDC on all 30 historical markets (H).
- Crypto funding is to a partner "omnibus" wallet via a permanent deposit address; default network `BSC_MAINNET`, token USDC; `/wallet/deposit-address/networks` lists other combos but the endpoint needs auth, so the full list is NOT FOUND. (H for BSC default)
- Fiat funding: bank-transfer "pending prediction" (JIT funding) with payment reference (H, SDK README).
- Users never hold on-chain positions; the partner's omnibus balance is debited when a prediction is placed ("debits the partner omnibus balance") (H, OpenAPI).

## Read API

- Exists: official, authenticated (partner OAuth2 client_credentials; credentials only after partner verification, sandbox first, "within 24 hours" per site). (H, https://www.joinpuul.com/ and spec)
- Docs URL: https://api.joinpuul.com/api/docs (Swagger UI), spec https://api.joinpuul.com/api/docs-json (H). `docs.joinpuul.com` is dead (H).
- Base URL: `https://api.joinpuul.com/api/v1` (H, SDK DEFAULT_BASE_URL).
- Auth: `POST /partner/oauth/token` with `{client_id, client_secret, grant_type:"client_credentials"}` returns a JWT valid 1 hour; then `Authorization: Bearer`. Webhooks signed with HMAC-SHA256 hex in `x-puul-signature`. (H, SDK source + spec)
- Key endpoints (all `/api/v1/partner/...`, bearer required):
  - `GET /markets?status=live|frozen|closed|settled|void&countries=NG,GH&format=text` - markets with outcomes, odds, volume, multipliers, participant counts
  - `GET /markets/{id}`, `/markets/{id}/ticker`, `/markets/{id}/odds?outcome_id&stake` (projected multiplier), `/markets/{id}/price-history?interval=5m|15m|1h|6h|1d&limit<=500` (reconstructed pool history)
  - `GET /positions`, `/predictions`, `/lottery/pools`, `/lottery/pools/{id}/results`, `/fx/rate`
  - Webhook events: `prediction.settled`, `prediction.voided`, `market.closed`, `market.settled`, `deposit.confirmed`, `withdrawal.completed`
- Unauthenticated read: a legacy `GET https://api.joinpuul.com/api/v1/markets?status=...` works without auth (H, tested 2026-10-19). It returns the full internal market rows including `pool.yes_pool/no_pool`, per-outcome `pool_amount`, `fee_bps`, `takeout_rate`, `resolution_*` fields. Live and frozen return `[]`; closed returns 1, settled 22, void 7. It is not in the OpenAPI spec, so treat as undocumented and unstable. Invalid `status` yields HTTP 500 with a DB enum error (leaks internals; do not probe further).
- Rate limits: NOT FOUND (spec only mentions a 429 on the token endpoint; no numbers). WebSocket: site claims "WebSocket streams for real-time odds and settlement events" (H, marketing) but no WS endpoint appears in the OpenAPI spec or SDK; NOT FOUND.
- Fixtures (H, saved 2026-10-19): `docs/research/fixtures/puul/` - `openapi-partner-api.json` (46 KB, full spec), `public-markets-settled.json` (22 markets), `public-markets-void.json`, `public-markets-closed.json`, `public-markets-live-empty.json` (`[]`), `partner-markets-unauth-401.json`, `health.json`.

Response shape (public markets row, abridged): `id, question, category, scope, country_code, target_countries[], currency, market_type, fee_bps (1000), asset_id, status, close_time, freeze_at, resolution_rules, resolution_sources, void_conditions, winning_outcome_id, proposed_winning_outcome_id, proposed_settlement_evidence, takeout_rate "0.1000", settled_at, pool{yes_pool,no_pool,total_predictions}, outcomes[{id,slug,label,pool{pool_amount,total_predictions,fees_accrued}}], market_group_id`.

## Trade path

- Programmatic: yes, but only for approved partners via REST: `POST /partner/predictions/quote`, `POST /partner/predictions` (fields marketId, outcomeId or side YES/NO, stakeAmount minor units, stakeCurrency, idempotencyKey, optional quoteId, maxSlippageBps default 500). Parimutuel: no cancel or order book; predictions are immediately live. (H)
- Auth: OAuth2 client credentials plus linked-user sessions (`/partner/link-tokens`, `/partner/sessions`). Users are KYC'd through a session-based identity flow (H, site). No wallet signatures anywhere.
- PayBox reachability: **no**. A PayBox EVM/Solana wallet cannot place orders. The only on-chain touchpoint is an ERC-20 USDC transfer to a partner omnibus deposit address (BSC by default), which credits the *partner* account, not a user, and requires a verified partner account first. It would be a custodial deposit with no position token and no proof-of-ownership on chain. Not a transaction-proposal or signed-order venue. (M, inferred from H API docs)

## Fees

- Take-out: `fee_bps = 1000` / `takeout_rate = 0.1000` on every observed market, i.e. 10% of pool, paid by bettors (taken from the pool before payout) (H, fixtures). Partners receive a revenue share of up to 50% of the take-out by volume tier (H, site). Effective cost to an arbitrageur is far higher than CLOB venues because a 10% parimutuel rake destroys most cross-venue edges.
- Withdrawal fees: `GET /wallet/withdrawal-fees` exists (partner side, amounts NOT FOUND). Deposit fees NOT FOUND.

## Resolution

- Operator-run. Market rows carry `resolution_rules`, `resolution_sources`, `void_conditions`, `proposed_winning_outcome_id`, `proposed_settlement_evidence`, `settlement_evidence`; in all 30 sampled markets these were `null`, so no published rules or evidence. Settlement is a centralised admin action (`resolved_at`, `closed_at`, `settled_at`), and markets can be `void` (full stake refund per SDK comment). No on-chain oracle, no dispute process documented (NOT FOUND, searched: spec, SDK README, site). Dispute risk: high (single operator discretion; 7 of 30 historical markets, 23%, were voided). (H)

## Geo / ToS / automation

- Targeted at Nigeria/Ghana/Kenya/South Africa; markets carry `target_countries` (mostly `ALL`) and `country_code: NG`. Site says KYC/AML and "jurisdiction-specific compliance" via partners; no supported/restricted-country list published (H).
- No public ToS or automation policy found (NOT FOUND, searched: site, spec). Access requires partner agreement; scripted use of the partner API for arbitrage would be outside the intended B2B use and not available without a verified partner account. Nigerian prediction-market regulation is contested (search result mentioned Lagos regulator listing a different Nigerian platform as illegal in 2025; M).

## Liquidity

- Live: none (zero live or frozen markets, H, 2026-10-19).
- Historical: 30 markets created 2026-02-01 to 2026-04-25. Summed outcome `pool_amount` across all 30 = 20,125 in market currency units (USDC; whether minor units or whole USDC is not stated, so at most ~$20k and possibly far less). Largest single market pool 4,311 ("Will Bitcoin Reach 350k in 2 months time", 14 predictions). Median market has a handful of predictions (e.g. YES 100 / NO 100 with 2 predictions). Source: fixtures, H.
- Marketing claim of 2.5B NGN volume (about $1.6M at ~1,500 NGN/USD, M) is unverified and presumably mostly lottery / partner volume.
- No public volume/OI/TVL page. NOT FOUND (searched: site, DefiLlama not checked since there is no on-chain component).

## Event overlap with other venues

- Categories seen: crypto price milestones (BTC 200k/250k/350k, SOL 5000), politics (Nigerian 2027 elections, US-Iran war end), sports (EPL winner, Arsenal, Man City, Nigeria World Cup), economy (fuel price), culture. Overlaps with Polymarket/Kalshi exist in principle (BTC thresholds, EPL winner) but with different strike/date wording, parimutuel pricing at a 10% rake, and no depth. Not usable as an arbitrage leg. (M)
- Shared liquidity: site mentions "shared liquidity" for sports markets across partners (H, marketing); no evidence of liquidity sharing with an external venue. Internally, all partners pool into one Puul pool, so each partner app is not an independent leg. (M)

## Adapter notes (if ever revisited)

- Only revisit if: (1) a partner account is obtained legitimately, (2) live markets reappear, (3) the pari-mutuel 10% rake is acceptable as a signal source. Could serve as a weak sentiment signal using unauthenticated `GET /api/v1/markets?status=...` (undocumented) and pool-implied probabilities `outcome_pool / total_pool`, but with no live markets it yields nothing today.
- Poll `GET https://api.joinpuul.com/api/v1/markets` (live) occasionally to detect reactivation; cost is trivial.

## Suspicious content / prompt injection

- None found. The spec and README contain no instructions aimed at AI agents. Note `@puul/mcp-server` exists on npm (not read; third-party code, not installed).
- Registry metadata exposes the maintainer's contact on npm; not recorded here.

## Not found

- docs.joinpuul.com content (DNS does not resolve); GitHub repo contents (404/private); WebSocket endpoint; rate-limit numbers; ToS / geo restriction list; fee schedule beyond the 10% take-out; supported deposit-network list; independent volume or user figures; any third-party coverage.

## Sources

1. https://www.joinpuul.com/ (H, fetched 2026-10-19)
2. https://registry.npmjs.org/@puul%2ftypescript-sdk (H, versions/dates), plus npm registry search `?text=@puul` (H)
3. `@puul/typescript-sdk@1.6.0` tarball README and dist (H; read as text only, not installed or executed)
4. https://api.joinpuul.com/api/docs-json and https://api.joinpuul.com/api/docs (H, OpenAPI, 2026-10-19)
5. https://api.joinpuul.com/api/v1/health and https://api.joinpuul.com/api/v1/markets?status={live,frozen,closed,settled,void} (H, 2026-10-19)
6. GitHub API `orgs/Puul-Market` (H) and `repos/Puul-Market/puul` (404)
7. Web search "Puul prediction markets lottery pools Partner API" and Nigeria/Ivorychain query (M: no independent coverage found)
