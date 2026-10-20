# pmxt (pmxt.dev) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs, `gh api` raw file reads, WebFetch. No accounts, API keys, wallets, signing, POST/PUT/DELETE. WebSearch budget ran out mid-task, so no web-search corroboration was possible (everything below is from first-party docs, repo files, registries and one explorer page).

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

**adapter_priority: P2 (signal-only), and NOT an independent arbitrage leg.** pmxt is an aggregator ("CCXT for prediction markets"), not a market. It has no liquidity of its own; every price it shows comes from a venue we should talk to directly. Its useful parts for this project are:

1. **Router matching catalog** (`GET /v0/matched-market-clusters`, relation taxonomy identity / complement / subset / superset / overlap / disjoint with confidence scores): a candidate generator for our own market-linking, usable only with a pmxt API key (H).
2. **MIT adapter code** (`pmxt-core`, 16 venue wrappers): a reference for field mappings of venues we have not integrated (Smarkets, Probable, Hyperliquid, Gemini Titan, Rain, Hunch, Metaculus). Do not copy it blindly (see the Baozi note: pmxt's price mapping there inverts the venue's own definition).
3. Not recommended: hosted trading (see Trade path), hosted data as a runtime dependency (ToS, credits, freshness signals below), `pmxt-core` as an in-plugin dependency (Node sidecar; consistent with `docs/research/10-aggregation-landscape.md` section 1.1).

Why not higher: personal-use-only plans, a ToS that bans bots/commercial use and compilation of data, a hosted price feed that was disconnected when probed, a hosted escrow with about 128 USDC in it and no transaction for 67 days, quiet `main` since 2026-07-18, and matching quality that cannot be verified without a key.

## Identity and liveness (still live: yes, with caveats)

- Site https://www.pmxt.dev returns 200 (H, curl 2026-10-19). `https://pmxt.dev` 307-redirects to `www`.
- API host `api.pmxt.dev` is up: `GET /health` -> 200 `{"status":"ok", "priceWatcher": {...}}` (H, fixture `api-health-2026-10-19.json`). **But the same payload shows `priceWatcher.connected: false`, `staleSince: 2026-10-18T07:31:15.211Z`, `reconnectAttempts: 407`, `cacheSize: 0`, `lastFlushAt: null`** at 2026-10-19 02:57 UTC, i.e. the live-price watcher had been down about 19 hours with 407 failed reconnects. `status: ok` therefore does not mean prices are fresh (H for the numbers; M for what the watcher feeds, likely the WS/catalog price layer; the docs do not describe this field).
- Trade host `trade.pmxt.dev`: DNS resolves (A record), but `GET /` and `/health` timed out twice at 10 s and 20 s from this sandbox (H observation; cause unknown: sandbox egress, firewall, or host down). Not conclusive.
- Repo `pmxt-dev/pmxt`: created 2026-01-08, 2,170 stars, MIT, not archived, repo `pushed_at` 2026-09-30 (H, `gh api`). **Latest commit on `main` is 2026-07-18** ("docs: auto-update for v2.54.0"); the 09-30 push was to another branch (H, commits API; other branches last pushed 2026-05-22 to 2026-09-30 per `docs/research/10-aggregation-landscape.md`). Latest release tag `v2.54.0f` 2026-07-18 (H). npm `pmxtjs` latest 2.54.0, modified 2026-07-18; PyPI `pmxt` 2.54.0 (H).
- Open issues 1,430 (H); the newest ones (#2574-#2578, 2026-10-18 16:09 UTC) were created within a second of each other by the maintainer account and are titled like spec-drift items ("Hunch getStats ... is not implemented in core or either SDK"), so they look scripted and say little about user demand (M).
- Adoption (H, npm and pypistats APIs, GET): `pmxtjs` 6,935 downloads for 2026-09-17..2026-10-16, 1,094 for 2026-10-10..2026-10-16; PyPI `pmxt` 5,979 last month, 139 last day. Modest.
- Docs staleness: `docs/MIGRATE_FROM_DOMEAPI.md` says "No API key for market data"; the live API now returns 401 `missing api key` for catalog reads (H, both). The migration doc is out of date.
- Dome context: the repo's migration doc says Polymarket acquired DomeAPI and discontinued it (repo text states "March 31, 2025", while `docs/research/10-aggregation-landscape.md` records announcement 2026-02-19 and end of life 2026-04-28: the repo date looks wrong; not important here).

## Kind and market model

- Kind: **aggregator / data and execution gateway** over 16 "pass-through" venues; a Postgres "catalog" ingests 7 of them by polling (H, https://pmxt.dev/docs/concepts/venues and repo `docs/concepts/venues.mdx`).
  - Pass-through wire keys (16): polymarket, kalshi, kalshi-demo, limitless, probable, baozi, myriad, opinion, metaculus, smarkets, polymarket_us, gemini-titan, hyperliquid, suibets, rain, hunch.
  - **Catalog venues (7, polling): polymarket, kalshi, opinion, limitless, smarkets, probable, myriad.** The Router (search, matching, price compare) only covers these 7 (H).
  - Hosted writes: Polymarket, Opinion, Limitless only (H, `docs/concepts/hosted-trading.mdx`, `README`).
- Unified schema Event -> Market -> Outcome (H, `docs/concepts/unified-schema.mdx`). `UnifiedMarket` fields: `marketId, eventId, title, slug, description, url, image, category, tags, volume, volume24h, liquidity, resolutionDate, tickSize, status, contractAddress, outcomes[]`. `UnifiedOutcome`: `outcomeId, marketId, label, price (0-1 for binary), priceChange24h, metadata`.
- Binary and categorical (multi-outcome events with child markets) are representable; scalar is not documented (NOT FOUND, searched unified-schema and venues docs). Underlying order-book vs AMM vs parimutuel model is per venue and pmxt flattens it (e.g. Baozi pari-mutuel is shown as a synthetic book per the Baozi note) - so `price` is only comparable between venues after a per-venue check.
- IDs: **hosted/Router rows use PMXT UUIDs for `marketId`/`outcomeId`; venue clients and pass-through use venue-native IDs** (H, unified-schema Note and `docs/concepts/catalog-uuid-vs-venue-id.mdx` exists). Mixing the two address spaces is a documented trap.
- `liquidity` is "venue-specific, compared like-for-like" (H) i.e. not a standard depth measure; compute depth from order books instead.

## Chains and collateral

- pmxt itself has no chain or token. Collateral is whatever each venue uses.
- Hosted trading uses one **Polygon (chainId 137) `PreFundedEscrow` ("HomeEscrow")** holding **USDC.e** `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`, address `0x3ad326f78b1390b9a5dc5f00e7f62f8632de23e2`, with a BSC (chainId 56) `VenueEscrow` `0x6a273643d84edbb603b808d8a724fb963c7a298a` holding Opinion outcome tokens, and a Base escrow holding Limitless tokens (H, `docs/concepts/hosted-trading.mdx`). Operator is one EOA (immutable in the contracts); settlement oracle for cross-chain buys is a separate EOA (H, same page). These are public contract addresses from vendor docs, not user data.
- On-chain check (M, WebFetch of Polygonscan 2026-10-19, summary of the page, not an RPC read): address is a contract, **source not verified on Polygonscan**, created about 135 days earlier (creator = the documented operator address), **127.68 USDC.e balance, 2,479 transactions, latest transaction a "Claim Withdrawal" on 2026-08-12 (67 days before the check)**. Docs say "Unaudited as of 2026-06-09" (H). Polygonscan tx list and Blockscout were behind bot challenges (403 / Cloudflare), so I did not retrieve the transaction list and did not try to bypass it.
- Open question: Polymarket's current collateral on the CLOB v2 client (`@polymarket/clob-client-v2` is a dependency of `pmxt-core`, H) may no longer be USDC.e (the explorer page also showed a small pUSD balance, M). The pmxt docs still say USDC.e. Whether hosted Polymarket trading is currently functional is not established.

## Read API

- Docs: https://www.pmxt.dev/docs (source in `docs/` of the repo; `llms.txt` / `llms-full.txt` exist there). OpenAPI: `docs/api-reference/openapi.json` (v2.54.0, 631 KB, pass-through), `openapi-hosted.json` (Router; saved as fixture), `openapi-hosted-trading.json` (trade host, 82 KB, not saved: over the 50 KB limit).
- Base URLs (H, `docs/authentication.mdx`): `https://api.pmxt.dev` (reads, Router, MCP, pass-through `/api/*`), `https://trade.pmxt.dev` (hosted writes and hosted account state: `/v0/trade/*`, `/v0/user/*`, `/v0/orders/*`), `wss://api.pmxt.dev/ws?apiKey=KEY` (H, `api-reference/websocket.mdx`; **the key travels in the query string**, so it can land in proxy logs). Self-hosted: `http://localhost:3847`, WS `ws://localhost:3847/ws`.
- **Auth: Bearer `pmxt_live_...` on every request to `api.pmxt.dev` except `/health`** (H docs + H observation: `GET /v0/markets?limit=1`, `/v0/events`, `/v0/matched-market-clusters` all returned 401 `{"error":"missing api key"}` unauthenticated; fixture `api-v0-markets-unauth-401-2026-10-19.json`). `X-Api-Key` also accepted. Key creation is via the dashboard (account needed; I did not create one). **No unauthenticated market-data response shape could be confirmed**; response shapes below come from the vendor docs and OpenAPI, not from live calls.
- Key endpoints (H, docs):
  - Catalog (GET, Postgres, "~10 ms p95"): `GET /v0/markets`, `GET /v0/events` with `query, limit (default 50, max 500), offset, closed, category, exchange`; response `{ "data": [...], "meta": {count, limit, offset} }`; market has `marketId, eventId, title, volume24h, outcomes[{outcomeId,label,price,priceChange24h}]`.
  - Matching: `GET /v0/matched-market-clusters` (params `marketId|slug|url, relation(s), minConfidence, venues, excludeVenues, minVenues, withOrderbook, includeRawMatches, updatedSince, sort=volume|confidence, limit=50, offset, edgeLimit`) and `GET /v0/matched-event-clusters`. Cluster shape: `clusterId (mcl_...), canonicalTitle, category, relations[], confidence, volume24h, markets[{marketId, sourceExchange, title, slug, outcomes[...]}], rawMatches[{marketAId, marketBId, relation, confidence}]`.
  - Router helpers under `/api/router/*`: `fetchMarketMatches, fetchEventMatches, compareMarketPrices (POST), fetchRelatedMarkets, fetchMatchedMarkets, fetchMatchedPrices, fetchHedges, fetchArbitrage`. **`fetchArbitrage`, `fetchHedges` and `fetchMatchedPrices` are marked `deprecated: true` in the OpenAPI (H)**; the docs say "PMXT does not pick a best opportunity for you" and "Today the Router is read-only. Smart order routing ... is on the roadmap".
  - Pass-through (live venue data): `POST /api/{exchange}/{method}` with body `{"args":[...], "credentials":{...}}` and envelope `{"success":true,"data":...}` (H, `api-reference/overview.mdx`); the OpenAPI lists many of the `fetch*` methods as `GET /api/{exchange}/fetchMarkets` etc. (H, `openapi.json`), so docs and spec disagree on verb (M; test before building). Methods: `fetchMarkets, fetchEvents, fetchMarket, fetchEvent, fetchOHLCV, fetchOrderBook(s), fetchTrades, fetchPositions, fetchBalance, createOrder, buildOrder, submitOrder, cancelOrder, ...`.
  - Per-venue method support (H, `core/COMPLIANCE.md`, auto-generated; saved as fixture): `fetchMarkets/fetchEvents` on all 15 listed; `fetchOrderBook` on all but Metaculus; `fetchTrades` only on Polymarket, Kalshi, Limitless, Probable, Baozi, Myriad, Smarkets, Hyperliquid, Rain, Hunch (not Opinion, PolymarketUS, GeminiTitan, SuiBets, Metaculus); `watchOrderBook` on Polymarket, PolymarketUS, Kalshi, Limitless, Probable, Baozi, Myriad, Opinion, GeminiTitan, Rain, Hunch (not Smarkets, Hyperliquid, SuiBets, Metaculus).
  - Historical data: `POST /v0/sql` (read-only ClickHouse) is **Enterprise-only** (403 `sql_access_denied`, 5 s query cap) (H, `openapi-hosted.json`). Pricing page also advertises "deep historical candlestick data" and "historical order book snapshots" (H, https://www.pmxt.dev/pricing; endpoints for them not located). Also `/api/feeds/*` (oracle / price feeds, e.g. `fetchOracleRound`) exists; not investigated.
- WebSocket protocol (H): JSON frames `{"id","action":"subscribe","exchange","method":"watchOrderBook","args":[outcomeId, depth]}`; events `{"event":"data","id","method","symbol","source","data":{bids:[{price,size}],asks,timestamp}}`.
- **Rate limits / credits (H, https://www.pmxt.dev/pricing and `docs/rate-limits.mdx`)**, per API key across both hosts: Free $0 = 25,000 credits/month, 60 req/min, 5 WS streams; Starter $29.99 = 250,000, 300/min, 20; Pro $99.99 = 1,000,000, 1,000/min, 100; Enterprise custom; annual billing -20%. **1 REST call = 1 credit; 1 WS message = 0.1 credit**; health free. 429 bodies: `rate_limit_exceeded` (per-minute) and `monthly_quota_exceeded`. My arithmetic: free tier = 250,000 WS messages/month, i.e. roughly 2.9 days of a single 1 msg/s stream; about 830 REST calls/day, enough for one matched-cluster poll every 2 minutes and nothing else.
- Freshness: catalog ingestion is polling (H); interval not documented (NOT FOUND, searched venues, router/overview, unified-schema, rate-limits). The `priceWatcher` outage above is the only direct freshness evidence.

## Trade path

- **Hosted (default) flow** (H, `docs/concepts/hosted-trading.mdx`, `guides/signing.mdx`, `openapi-hosted-trading.json`): `POST trade.pmxt.dev/v0/trade/build-order` (target = catalog UUID or `venue` + `venue_outcome_id`, `side`, `order_type`, `amount`, `denom`, `price`, `slippage_pct`, `user_address`) returns `{built_order_id, typed_data, pull_typed_data?, quote{best_price, expected_avg_price, expected_slippage_pct, estimated_cost_or_proceeds, fillable, liquidity, fee_amount, tick_size}}`; client signs the EIP-712 `typed_data` (domain = Polygon PreFundedEscrow, chainId 137; Opinion SELL needs a second signature on the BSC `VenueEscrow` domain, chainId 56) and calls `POST /v0/trade/submit-order` with `{built_order_id, signature}`; PMXT's operator submits to the venue and pays gas. Also `POST /v0/orders/cancel/build`, `GET /v0/user/{address}/balances|positions|trades`, `GET /v0/orders/open`, `GET /v0/orders/{id}`. Funding: `escrow.approve_tx` / `deposit_tx` / `withdraw_tx` return **unsigned EVM transactions** (chainId 137) that the user signs and broadcasts; withdrawal is request -> ~1 hour timelock -> claim (H, `guides/escrow-lifecycle.mdx`).
- Signing: SDK accepts `private_key` or a custom `signer` (`sign_typed_data(typed_data) -> hex`; "hardware wallet, HSM, MPC" supported) (H, `guides/signing.mdx`).
- Venues: Polymarket (same chain, CTF exchange), Opinion (cross-chain Polygon<->BSC, operator-fronted capital, oracle-attested DvP for buys, "honest oracle" trust assumption; sells have an operator-trusted gap), Limitless (cross-chain Polygon -> Base, ERC-7683, "v1 trust asterisk": operator performance risk) (H, hosted-trading page).
- Self-hosted: SDK spawns local `pmxt-core` sidecar; you pass raw venue credentials (Polymarket key, Kalshi RSA, Limitless API creds, Smarkets session, ...), "PMXT never stores venue credentials" (H, authentication.mdx). In that mode pmxt adds nothing over calling each venue's own API.
- Trading is not routed across venues: "Order routing is coming" (H). No cross-venue atomicity, no combined arbitrage execution.

### Reachable through PayBox? **partial**

- Mechanically yes for hosted writes: the flow is prepare (build-order returns typed data) -> `request_wallet_sign` `typedData` (any domain/chainId, per `docs/research/06-paybox-platform.md`) -> submit, plus unsigned Polygon txs for approve/deposit that fit a PayBox EVM transaction proposal. Same agent-orchestrated pattern as the XO plan; a plugin sandbox cannot hold the signature itself.
- Blockers: (a) every call needs a per-user or per-author `pmxt_live_` bearer key (credential custody, same class as XO gate 1) and the plan terms are "personal use only"; (b) funds must sit in an unaudited, unverified-source escrow run by one EOA operator (TVL about 128 USDC, last observed tx 2026-08-12, M); (c) the `pmxt_api_key` "can read any associated wallet's hosted data" (H, signing.mdx Warning); (d) only 3 venues are writable and all three we can call directly; (e) typed-data blind signing of an opaque order struct under an `autonomous` grant is a prompt-injection risk (see doc 06). **Recommendation: trade each venue through its own adapter and PayBox signing; do not add the pmxt escrow hop.**

## Fees

- pmxt's own fee: **exists but not specified.** The build-order quote has `fee_amount` described as "Estimated PMXT + venue fee for the order, in USDC dollars" (H, openapi-hosted-trading.json). Pricing page and docs state no trade fee or builder-fee rate (H, pricing page fetch: "does not mention any builder fee or take-rate"). NOT FOUND (searched: pricing page, hosted-trading, escrow-lifecycle, trading-quickstart, signing, authentication, OpenAPI, grep for fee/commission/bps). Escrow contracts have "no fee setter" (H, hosted-trading page), so any PMXT fee is taken off-chain or inside the signed order parameters (M, inference; verify by calling build-order with a key).
- Venue fees pass through unchanged (Polymarket, Kalshi, etc.; "executed price (net of venue fees)" in `fetchMyTrades`, H llms.txt text).
- Data plan fees: see Rate limits. Gas for hosted orders is paid by PMXT's operator; deposit/withdraw gas is paid by the user on Polygon (H).
- Cross-chain legs (Opinion, Limitless) carry operator working-capital and delivery risk but no documented fee (NOT FOUND).

## Resolution mechanism and dispute risk

- pmxt does not resolve anything; each underlying venue does (UMA for Polymarket, CFTC-regulated settlement for Kalshi, etc. - see those venue notes). pmxt exposes `status` and `resolutionDate` as venue fields, and "settlement outcomes" appear in its ToS definition of Content.
- **The risk specific to pmxt is match risk**: Router "identity" relations come from "embedding-based similarity and LLM-verified relation classification" (H, router/overview.mdx). An LLM-classified identity can still hide different resolution sources, time zones, thresholds or tie rules (e.g. "BTC > $100k by Dec 31" vs "above $100,000 on Dec 31" is the docs' own identity example, which differs on touch-vs-close). No precision/recall figure, no validation set and no resolution-criteria diff is published (NOT FOUND, searched router/matching, router/overview, event-matching). Treat clusters as candidates only; our linker must compare resolution text and sources itself. The docs' own Kalshi example price (0.25 vs 0.24) is illustrative, not live.
- ToS section 14: data is "as-is" from third-party exchanges; no liability for "discrepancies between our API data and the source exchange" (H).

## Geo, ToS and automation

- ToS (H, https://www.pmxt.dev/terms, "Last updated: February 12, 2026", about 8 months old, may have changed):
  - License: access and ingest API Data "via our authorized endpoints solely for your internal business purposes or personal trading analysis"; no "copied, reproduced, aggregated, republished ... or otherwise exploited for any commercial purpose" without written permission (section 2).
  - Prohibited (section 4): access "through automated or non-human means, whether through a bot, script or otherwise"; "systematically retrieve data ... to create or compile ... a collection, compilation, database"; use "in connection with any commercial endeavors except those ... endorsed or approved by us"; "any revenue-generating endeavor or commercial enterprise"; "undue burden" on the Services. The "no bots/scripts" clause sits awkwardly with selling an API and SDKs; read it as ambiguous, not as clearance.
  - Pricing page: "All plans are for personal use only." (H)
  - Jurisdiction: generic "not intended for ... any jurisdiction ... contrary to law"; U.S. law, California courts, AAA arbitration. No country block list (H). Underlying venue geo-rules (Polymarket, Kalshi, Opinion, Limitless) still apply and are not waived by routing through pmxt.
  - Consequence: a PayBox plugin that serves many users from one pmxt key, or stores pmxt-derived matches/prices in our database, likely needs written permission. The ToS names a contact individual's personal email; deliberately not copied here.
- Security note from the vendor's own changelog (H, `changelog.md` 2.53/2.54): a community PR that exposed venue session credentials over an HTTP endpoint keyed by public wallet address was caught before merge. Shows review exists, also shows the hosted surface is credential-adjacent.

## Liquidity

- pmxt has none of its own. Catalog volume fields mirror venues.
- Hosted-escrow footprint (M, Polygonscan 2026-10-19 via WebFetch): 127.68 USDC.e balance, 2,479 txs lifetime, last observed tx 2026-08-12.
- Usage: npm 6,935 / month, PyPI 5,979 / month (H, 2026-10-16 / 2026-10-19 windows). Product Hunt launch (badge in README); homepage counters render 0 without JS (not usable).

## Event categories overlapping other venues

The Router catalog is exactly the set of overlap: Polymarket x Kalshi x Opinion x Limitless x Smarkets x Probable x Myriad. Docs' examples: crypto price levels (BTC), macro (Fed rate cuts), politics (elections, nominees), geopolitics (Iran), sports (NBA via `markets(query="nba")`, Smarkets as a sports exchange) (H docs examples; no live counts verified). The category field is "normalized" (`Sports`, `Politics`, `Crypto` ...) and filterable (H). XO is not a pmxt venue, so XO overlap must come from our own linker (see `docs/research/10-aggregation-landscape.md`).

## Shares liquidity with

Every venue it fronts: Polymarket (incl. Polymarket US), Kalshi, Opinion, Limitless, Probable, Myriad, Smarkets, Baozi, Metaculus, Gemini Titan, Hyperliquid, SuiBets, Rain, Hunch. **Using pmxt as a leg double-counts those venues. It is a lens on them, not another book.**

## Integration notes for the aggregation layer

1. Use as optional candidate generator: poll `GET /v0/matched-market-clusters?relation=identity&minVenues=2&sort=volume&withOrderbook=true` at low frequency (free tier fits roughly one call per 2 minutes), then verify each pair from the venues' own books and rules. Requires one author-held key; confirm commercial permission first.
2. Treat all pmxt prices as stale-until-proven-fresh; pull books from venue adapters.
3. Keep our own relation taxonomy aligned with pmxt's (identity / complement / subset / superset / overlap / disjoint) to ease cross-checking.
4. Store pmxt-derived data only as transient candidate hints, not as a redistributed dataset (ToS section 2/4).
5. Before any reliance: with a real key, (a) sample `matched-market-clusters` and compare against our linker; (b) record `priceWatcher` health over a day; (c) confirm verb and shape of pass-through `fetchOrderBook`.

## Not found

- NOT FOUND (searched: pricing, hosted-trading, escrow-lifecycle, OpenAPI, docs grep): the PMXT fee formula / bps.
- NOT FOUND (searched: venues, router docs, rate-limits): catalog polling interval, matching accuracy metrics, latency SLA, uptime/status page.
- NOT FOUND (searched: unified-schema, venues): scalar-market representation.
- NOT FOUND (searched: repo `docs/` listing): audit report for the escrow contracts (docs say unaudited as of 2026-06-09).
- NOT FOUND: any unauthenticated market-data endpoint other than `GET /health` (so no live market fixture).
- Blocked: Polygonscan tx list (403), Blockscout API (Cloudflare challenge): not bypassed.

## Open questions

- Is `trade.pmxt.dev` reachable from normal networks (timed out twice from this sandbox)?
- Why was `priceWatcher` disconnected for 19+ hours; does it affect `/v0/markets` prices and Router comparisons?
- Does hosted Polymarket trading still work given Polymarket's collateral/CLOB v2 changes (escrow holds USDC.e)?
- Does the hosted `/v0/matched-market-clusters` have usable precision (needs a key to test)?
- Would pmxt grant written permission for commercial / multi-user use of API data?
- Real PMXT trade fee (needs `build-order` quote with a key).

## Fixtures (docs/research/fixtures/pmxt/)

- `api-health-2026-10-19.json` - live `GET https://api.pmxt.dev/health` (259 bytes).
- `api-v0-markets-unauth-401-2026-10-19.json` - recorded 401 for unauthenticated catalog read.
- `openapi-hosted-router-2026-07-18.json` - vendor OpenAPI for the Router and SQL endpoints (40 KB, repo `docs/api-reference/openapi-hosted.json`, spec version labelled 49fbcd4).
- `COMPLIANCE-venue-support-matrix.md` - per-venue method support matrix from `core/COMPLIANCE.md` (4 KB; includes the list of env var NAMES the repo's tests use, no values).

## Sources

- https://pmxt.dev/docs/concepts/venues (via WebFetch) and https://www.pmxt.dev/pricing, https://www.pmxt.dev/terms (curl, 2026-10-19)
- Repo https://github.com/pmxt-dev/pmxt (read with `gh api` raw): `readme.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `changelog.md`, `core/COMPLIANCE.md`, `core/package.json`, `docs/authentication.mdx`, `rate-limits.mdx`, `security.mdx`, `introduction.mdx`, `trading-quickstart.mdx`, `concepts/{hosted-trading,unified-schema,venues}.mdx`, `guides/{escrow-lifecycle,signing,self-hosted}.mdx`, `router/{overview,matching,prices,search}.mdx`, `api-reference/{overview,websocket,configuration}.mdx`, `api-reference/openapi.json`, `openapi-hosted.json`, `openapi-hosted-trading.json`, `docs/MIGRATE_FROM_DOMEAPI.md`; GitHub repo, commits, releases, issues, org-repos APIs
- Live GETs: https://api.pmxt.dev/health, https://api.pmxt.dev/v0/markets (401), /v0/events (401), /v0/matched-market-clusters (401); https://trade.pmxt.dev (timeout)
- Registries: https://registry.npmjs.org/pmxtjs, https://api.npmjs.org/downloads/point/last-month/pmxtjs, https://pypi.org/pypi/pmxt/json, https://pypistats.org/api/packages/pmxt/recent
- Polygonscan address page for the escrow contract (via WebFetch summary, M)
- Project context: `docs/research/10-aggregation-landscape.md` (section 1.1, which reached the same "do not depend on pmxt at runtime" conclusion independently), `docs/research/06-paybox-platform.md` (PayBox typedData signing)

## Privacy and safety log

- All scripted requests used User-Agent `insurance-markets-research/0.1`; no email, name, username or home path in any request. The ToS page lists a third party's personal email; not recorded. No `.env` or key files read (the repo's `.env.example` was not fetched). No AI-directed instructions were found in the pages read.
