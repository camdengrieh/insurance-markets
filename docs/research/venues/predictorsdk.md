# PredictorSDK - adapter spec (aggregator / data API)

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to docs/API/npm/GitHub, no signup, no key, no wallet.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, API payloads) was treated as data; no embedded instructions were found or followed.
Fixtures: `docs/research/fixtures/predictorsdk/` (2 files, both tiny).

## 0. Verdict

**adapter_priority: P2** (benchmark and signal source for cross-venue matching; not a trading leg and not an independent liquidity source).

1. Live (H): docs and API up on 2026-10-19; changelog has entries on 2026-10-14, 16, 17, 18; npm `@predictorsdk/client` 0.26.0 modified 2026-10-14.
2. It is a **read-only, key-gated, request-metered data API**. It has no order placement, no custody, no market of its own. It owns no liquidity, so it is not an arbitrage leg (H, section 5).
3. Value to this project: (a) a second opinion on **cross-venue event/outcome matching** for US sports (NBA, WNBA, NHL, MLB, NFL), including a per-submarket `settlement_equivalence` verdict and tie/overtime rule comparison; (b) **normalised fee models** per venue; (c) one-call top-of-book quotes for nine venues. Our own aggregation layer should not depend on it (free tier = 10 req/min, 1,000 req/month).
4. Limits: top of book only, no depth, no streaming, quote freshness varies by venue (Kalshi `as_of` can be days old), matching is sports-only (H).
5. It adds no new venue: all nine are covered by this workflow or already have notes under `docs/research/venues/` (sx-bet, prophetx, pred, alpha-arcade, hyperliquid-hip-4-*).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://docs.predictorsdk.com/` | HTTP 200, 2026-10-19 | H |
| `GET https://api.predictorsdk.com/v1/plans` (no key) | HTTP 200, JSON plan list (fixture) | H |
| `GET https://api.predictorsdk.com/v1/markets` (no key) | HTTP 401 `missing_api_key` (fixture) | H |
| Changelog newest entries | 2026-10-18 docs refresh; 2026-10-17 Pred NBA matching; 2026-10-16 ProphetX; 2026-10-15 Polymarket Protocol V2; 2026-10-14 Hyperliquid NFL matching, SDK 0.26.0 (https://docs.predictorsdk.com/llms-full.txt) | H |
| npm `@predictorsdk/client` | latest 0.26.0; created 2026-04-04; modified 2026-10-14; MIT; repo github.com/PredictorSDK/sdk-typescript | H (registry.npmjs.org) |
| GitHub org PredictorSDK | `sdk-typescript`, `sdk-python`, `sdk-go`, all MIT, pushed 2026-10-14 (SDKs only; the server is closed source) | H (gh api) |
| Product age | npm package created 2026-04; one changelog line says a param was renamed on 2026-10-09 (`platform` to `provider`) so the API is still churning | H/M |

## 2. What it is

- **Kind**: aggregator-or-data. Unified REST API over nine venues: Kalshi, Polymarket, Predict, SX Bet, Hyperliquid (HIP-4 outcomes), AlphaArcade, ProphetX, Limitless, Pred (H, https://docs.predictorsdk.com/ and /concepts/sources).
- **Market model**: it does not have one. It normalises venue markets to binary-style `outcomes[]` with `price`/`bid`/`ask`/`last` as 0-1 probabilities (`pricing.scale = probability_0_1`) (H, quickstart + getMarket doc). Venue-native models (Kalshi yes/no tickers, Polymarket CTF tokens, SX Bet outcomeOne/outcomeTwo, Hyperliquid spot-coin outcomes `#114580`, Pred parent:child hashes) are passed through as `outcome_id`.
- **Matching layer** (the differentiator): `GET /v1/matching-markets/sports` returns canonical events (`nba-okc-sas-2026-10-20`) with `submarkets` keyed like `moneyline|full|winner`, `spread|quarter:1|spread:gs|0.5`, `total|half:2|game_total:incl_ot|82.5`; each submarket lists `source_markets[]` per venue with `canonical_outcome_key` mapping per side (H, quickstart + sources). Matching is identity only; it carries no prices.
- **Coverage claims** (H, overview, 2026-10-18): NBA (Kalshi, Polymarket, Predict, SX Bet, ProphetX, Pred), WNBA, NHL, MLB (game line only), NFL (up to nine venues). Player props only when player and line verified on each venue. A game appears only when at least two venues list it. 2026-10-03 sample showed `pagination.total: 140` events; Pred NBA changelog says 16 games / 133 lines matched on 2026-10-17.
- **Non-sports**: the catalog and market detail cover all open markets of the nine venues (elections, crypto price etc.); catalog size "about 470,000 markets" (H, Python SDK page). Categories: sports, politics, crypto, finance, economics, weather, culture, technology, entertainment, other, unknown. There is **no non-sports matching**, so politics/crypto/macro arbitrage has to use our own linker (see `docs/market-linking-design.md`).
- **Extras**: Polymarket wallet profile and positions, Binance crypto prices (permissions `polymarket.wallet.read`, `polymarket.positions.read`, `crypto.prices.read`) (H, authentication page).

## 3. Chains and collateral

None of its own. It is off-chain infrastructure; chains/collateral are those of the nine venues (Polygon pUSD/USDC for Polymarket, Base USDC for Limitless and Pred, Algorand for AlphaArcade, SX Network for SX Bet, Hyperliquid L1, Kalshi USD) (M, from the docs' per-venue descriptions; each venue has its own note in this repo).

## 4. Read API (H unless stated)

- **Docs**: https://docs.predictorsdk.com ; OpenAPI https://docs.predictorsdk.com/openapi.yaml (301 KB, fetched) ; every page as Markdown (`.md` suffix) ; all docs in one file https://docs.predictorsdk.com/llms-full.txt ; changelog RSS https://docs.predictorsdk.com/changelog/rss.xml.
- **Base URL**: `https://api.predictorsdk.com` (all endpoints are `GET`; the OpenAPI/doc text also mentions two provider webhook callbacks which are not for clients).
- **Auth**: `Authorization: Bearer <API key>` on every request except `GET /v1/plans`. Keys come from signup at app.predictorsdk.com ("API Keys" > "Create API Key", shown once). **Not obtained this session (signup is out of bounds), so no authenticated response was fetched.** Per-endpoint permissions: `markets.matching.read`, `markets.read`, `events.read`, `crypto.prices.read`, `polymarket.wallet.read`, `polymarket.positions.read`; dashboard keys carry all.
- **Key endpoints**:
  - `GET /v1/plans` (public) - plan table.
  - `GET /v1/matching-markets/sports` - paginated matched events (`league`, `scheduled_date`, `participant` filters, `include_submarkets=true`, cursor pagination).
  - `GET /v1/matching-markets/sports/lookup?source_id={provider}:{id}` (up to 100 IDs; also `event_id`) - find the event for any venue ID.
  - `GET /v1/markets?provider=&category=&limit<=100&cursor=` - catalog. **Reads a stored snapshot, not the venue**; `snapshot.observed_at` gives the crawl age; closed/settled markets are not listed.
  - `GET /v1/markets/{market_id}` (composite `provider:native_id` or `?provider=`) - **live read from the venue per request**: `outcomes[].price/bid/ask/last`, `pricing{availability, scale, source, as_of, as_of_kind, observed_at, neg_risk}`, `liquidity_usd`, `volume_24h_usd`, `volume_total_usd`, `open_interest`, and `trading_fees`.
  - `GET /v1/events/{event_id}`, `GET /v1/categories`, `GET /v1/crypto-prices/binance`, `GET /v1/polymarket/wallet`, `GET /v1/polymarket/wallet/positions`.
- **Resolution data**: `status` on market detail (`open`, `closed`, `settled`); no separate resolution/dispute endpoint documented (NOT FOUND: searched llms-full.txt and endpoint list for resolution/payout/outcome fields beyond `status`). Plus the per-submarket rule comparison: `settlement_equivalence` and `rules.settlement` (game-line rules and player-prop guides).
- **Trades history**: NOT FOUND (searched endpoint list in llms.txt/openapi paths; only top-of-book `last`, 24h and total volume). **Order-book depth: none** (docs: "no depth beyond the best level").
- **WebSocket / streaming**: none. Changelog: "The API has no streaming endpoints" (H). Polling only.
- **Rate limits and plans** (H, `GET /v1/plans` on 2026-10-19 and /guides/plans):

  | Plan | $/mo | Req/mo | Req/min per key | Overage |
  |---|---|---|---|---|
  | Free | 0 | 1,000 | 10 | none; HTTP 402 `payment_required` with `action: upgrade_plan` when the cap is hit |
  | Starter | 29 | 100,000 | 60 | $0.25/1K |
  | Pro | 79 | 500,000 | 300 | $0.12/1K |
  | Business | 199 | 2,000,000 | 1,000 | $0.06/1K |
  | Enterprise | custom | custom | custom | custom |

  Failed and malformed requests count against the allowance. Rate-limit headers `X-RateLimit-Limit/Remaining/Reset`; 429 with `Retry-After`. A scanner polling 100 matched events every 30 s would need roughly Starter or Pro, and one market-detail call per venue market (a game has 2-8 source markets), so request cost multiplies quickly.
- **Error shape** (live, fixture `get-markets-no-key-401.json`): `{"code":"missing_api_key","message":"...","status_code":401}`; `X-Request-Id` header on every response. Strict parameter validation (unknown params return 400 `unknown_parameter`).
- **SDKs** (H): TypeScript `@predictorsdk/client`, Python `predictorsdk`, Go `github.com/PredictorSDK/sdk-go`, all generated from the OpenAPI spec, v0.26.0. We should call REST directly or generate our own client; the OpenAPI file is available, and we are told not to install third-party code in this research pass.
- **Response shapes**: from docs examples only (H as documentation, not confirmed live): matched event (`event_id`, `league`, `participants[]`, `submarkets[].source_markets[].outcomes[].canonical_outcome_key`, `pagination{limit,total,has_more,next_cursor}`, `snapshot.observed_at`) and market detail (`id`, `provider`, `status`, `outcomes[]`, `pricing`, `trading_fees`). Docs warn example IDs expire after the game.

## 5. Liquidity and independence

- PredictorSDK itself: **zero** (no market, no order book, no TVL). Market detail passes through each venue's `liquidity_usd` / `volume_24h_usd` / `open_interest`; no PredictorSDK-wide volume figure is published (NOT FOUND: searched docs and landing page).
- **Not an independent leg.** Every price is the underlying venue's price. Notable sub-venue overlaps it documents itself (H, /concepts/sources): Predict "names the Polymarket market each of its markets copies"; AlphaArcade game lines "reuse the token IDs of the Polymarket market they mirror"; Limitless matched NFL markets "each copies a Polymarket market for the same game". So within its own nine, at least Predict, AlphaArcade, Limitless are Polymarket-anchored for sports (consistent with `alpha-arcade.md` in this repo, which found AlphaArcade is a Polymarket mirror). Treat those as correlated, not independent, when counting arbitrage legs.
- Genuinely distinct order books among the nine (for sports): Kalshi, Polymarket, SX Bet, ProphetX, Pred, Hyperliquid HIP-4 (M, inferred from the docs' descriptions).

## 6. Trade path

**None.** The API is read-only: "PredictorSDK does not do" order signing/approvals (changelog 2026-10-15), and market detail says "Route the actual order through the venue's own book" (H). No order, signing or custody feature exists. A PayBox EVM wallet cannot trade through it. To act on a PredictorSDK finding the agent must use each venue's own adapter (Polymarket on Polygon, Limitless/Pred on Base, etc.), subject to each venue's note.

## 7. PayBox reachability

**no.** There is nothing to sign or send: no transaction proposals, no signed orders. The only paid step is a plan subscription via its own dashboard (card billing is implied by "Subscribe" CTAs; payment mechanics NOT FOUND, and no x402 / HTTP 402 payment-requirements flow is documented; its 402 means "upgrade plan" with a JSON body, not an x402 challenge). Reading needs a key held by our backend; a PayBox secret (`request_secret`) could store the key, but that is a design choice, not a PayBox integration.

## 8. Fees

- **PredictorSDK charges**: subscription + overage, table in section 4.
- **Venue trading fees** are exposed per market (H, /guides/trading-fees): `trading_fees{availability, taker{model,rate,exponent,rounding}, maker{...}, charge_basis, scheduled_change, source, observed_at}`; `fee = shares x f(price)` with models `quadratic` (rate x (p(1-p))^exp; Kalshi, Polymarket, AlphaArcade, Pred), `min_price` (rate x min(p,1-p); Predict), `notional` (rate x p; Hyperliquid), `none`. `availability`: `published`, `partial`, `account_specific` (SX Bet, Hyperliquid), `unavailable` (all ProphetX). `charge_basis`: `fill`, `settlement_profit` (SX Bet), `close_or_settlement` (Hyperliquid). Limitless taker leg is null. It excludes rebates, tiers, discounts, maker/taker choice, front-end builder fees. Docs' own example (August 2026): Kalshi MLB quadratic 0.035 pre-game then 0.07 in-game; Polymarket 0.05. This is directly reusable as a fee-model reference for our arbitrage edge calculation, but fees there are copied from venue records, so verify against each venue before trading.

## 9. Resolution and dispute risk

PredictorSDK does not resolve anything; each venue does. Its useful contribution is **rule-difference flags** between venues (H, /guides/game-line-rules, /guides/player-prop-matching): tie handling differs (Polymarket and Hyperliquid pay 0.5 each, ProphetX and SX Bet void, Kalshi lists tie as its own contract; Pred pays half on a tied NFL game), overtime treatment differs for 2H/Q4 lines, player-no-play differs, post-game stat revisions differ (Pred counts them). Matching is conservative: a Predict market whose twin differs is dropped, Hyperliquid only half-point lines, ProphetX only half-point lines. Dispute risk for an arbitrage built on it is therefore rule-mismatch risk on the legs, which the `settlement_equivalence` field is meant to surface (M: field exists per docs, not verified live).

## 10. Geo / ToS / automation

- Docs say keys are for programmatic use and "anyone holding a key can spend your plan's requests" (H). No automation prohibition appears in the docs.
- **Terms and Privacy pages: NOT READ.** https://predictorsdk.com/terms returns HTTP 200 but is a client-rendered SPA shell (title only to curl; WebFetch was rate-limited this session). Redistribution rights for the data, a non-compete clause against building a competing aggregator, and operator identity/jurisdiction are therefore unknown. **Must read the terms in a browser before using it commercially or caching/redistributing its output.** (NOT FOUND: operating company, jurisdiction; searched landing page, docs, npm metadata.)
- Geo: it is a data API; trading geo rules are each venue's (Polymarket global/US, Kalshi US, etc.). The API host sits behind Fly.io (Singapore edge seen in `fly-request-id`), no geoblock observed from this machine.

## 11. Event-category overlap (where arbitrage might exist)

- Matched, with real overlap: **US sports game lines** (NBA, WNBA, NHL, MLB, NFL) between Kalshi, Polymarket, SX Bet, ProphetX, Pred, Hyperliquid (NFL) etc.; NFL and NBA props between Kalshi and Polymarket (plus ProphetX NFL, Pred NBA points).
- Not matched by it, so no help: politics, crypto price, macro/economics, weather. Those are in its catalog (`category` filter) but each venue's row is separate; our linker has to pair them.
- Does it cover XO Market? Not among its nine venues (H). XO overlaps sports/crypto/politics-style questions, so the usefulness is as a **leg-pairing and rule-equivalence reference** for the venues XO might be compared against, not a direct XO feed.

## 12. Suspicious content

None found. Docs include an "Use with AI" page that offers the docs as Markdown for coding agents; it is ordinary documentation, no instructions aimed at agents beyond "copy this page into your tool".

## 13. Open questions

1. Terms of service text (see section 10): redistribution, caching, competing-product clause, operator entity.
2. Live response shape of `GET /v1/markets/{market_id}` and the matching list with a real key. Needs a free key (account signup, which this run could not do). Docs examples may omit fields.
3. Actual per-request cost for a scanner: does one `include_submarkets=true` list call count as one request (docs say each request counts once) and how large are the responses (the docs have a "Response size" section in /guides/filtering; not read in detail).
4. Whether Free-tier keys can be created without a card and without KYC (docs say "No card").
5. Quote staleness: docs say Kalshi `as_of` can be 15 hours to 137 days old on open markets; confirm `observed_at` freshness and that bid/ask are live by comparing to Kalshi directly.

## Sources

- https://docs.predictorsdk.com/ (landing, H) ; https://docs.predictorsdk.com/llms.txt (H) ; https://docs.predictorsdk.com/llms-full.txt (all pages incl. quickstart, authentication, concepts/sources, guides/trading-fees, guides/plans, guides/error-handling, API reference summaries, changelog; H)
- https://docs.predictorsdk.com/openapi.yaml (downloaded, 301 KB; used only for existence and size) (H)
- https://api.predictorsdk.com/v1/plans (live, 2026-10-19) and https://api.predictorsdk.com/v1/markets (live 401) (H)
- https://registry.npmjs.org/@predictorsdk/client (H) ; GitHub org PredictorSDK repos via `gh api orgs/PredictorSDK/repos` (H)
- https://predictorsdk.com/pricing and /terms (HTTP 200, content not readable without JS; not relied on)
- Repo cross-refs: `docs/research/venues/alpha-arcade.md`, `sx-bet.md`, `prophetx.md`, `pred.md`, `dome-api-polyrouter-pmxt-cross-venue-data-apis.md`, `oddpool.md`.

Fixtures: `docs/research/fixtures/predictorsdk/get-plans-2026-10-19.json` (public plans, 3 KB), `docs/research/fixtures/predictorsdk/get-markets-no-key-401.json` (401 error shape).
