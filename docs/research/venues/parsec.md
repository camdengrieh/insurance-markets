# Parsec (parsec.fi, and the separate Parsec API at parsecapi.com)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary or inferred, L = weak or stale.

## Verdict

- **adapter_priority: skip.**
- The name "Parsec" covers two unrelated-looking products. Neither is a venue and neither is usable today.
  - **Parsec (parsec.fi / parsec.finance)**: a DeFi, NFT and on-chain analytics terminal (later a block explorer) with a Polymarket analytics view. Its company announced a wind-down in mid-February 2026 and said it would stop operating by the end of that month [H: first-party-adjacent post, see Sources]. The domain is still behind a Cloudflare challenge, so I could not read it.
  - **Parsec API (parsecapi.com, GitHub org `parsecular`)**: a unified prediction-market data and order-routing API over Polymarket, Kalshi, Opinion, Limitless and Predict.fun. Last code commit and release 2026-03-16 (v0.17.0). Every hostname fails DNS on 2026-10-19 [H: probes].
- Even when alive, neither had independent liquidity (an aggregator and an analytics tool), so neither could be an arbitrage leg. Read Polymarket, Kalshi, Opinion, Limitless and Predict.fun directly.
- Only reuse: a few schema ideas from the dead Parsec API (see "Ideas worth borrowing"). Do not depend on any Parsec host.

## Is it live (2026)?

- **parsec.fi: unverified, probably wound down.**
  - `https://parsec.fi/`, `/polymarket`, `/api` and `/sitemap.xml` all return HTTP 403 with `cf-mitigated: challenge` (Cloudflare managed challenge) [H: fixtures/parsec/probe-2026-10-19.txt]. `robots.txt` returns 200 with only a Cloudflare content-signals comment block. `api.`, `docs.` and `app.` subdomains of parsec.fi do not resolve [H]. I did not try to get past the challenge (no browser automation allowed).
  - The company's own research publication (Substack, transferred to a former staffer) says: "Parsec Finance is winding down" and "after five years of operation, Parsec announced in mid-February that it was winding down, with the company ceasing to operate by month end." Post dated 2026-03-12 [H: https://blog.hepworthiron.capital/p/the-new-face-of-parsec-research; excerpt in fixtures/parsec/winddown-excerpt-2026-03-12.txt].
  - The same Substack feed shows "Parsec Weekly" ending at issue #144 on 2026-02-06 [H: https://parsec.substack.com/feed].
  - Counter-signal: a third-party tool list dated 2026-08-27 says "Parsec now bills itself as an AI researcher for onchain markets" and marks it "Unverified" [L: https://github.com/kairoslive/prediction-market-trading-tools-and-terminals]. That could mean a rebrand or a new owner of the domain after the wind-down. I could not confirm either. Treat parsec.fi liveness as unknown, product identity as unknown.
- **parsecapi.com: dead.**
  - `parsecapi.com`, `www.`, `docs.`, `app.`, `api.` all fail to resolve [H]. DNS-over-HTTPS shows the four AWS Route 53 nameservers answering REFUSED for the zone, i.e. the hosted zone is gone [H: dns.google, 2026-10-19].
  - RDAP: still registered, created 2026-01-27, expires 2027-01-27, last changed 2026-01-29 [H: https://rdap.verisign.com/com/v1/domain/parsecapi.com]. So the project existed for roughly 7 weeks of active development before the last commit on 2026-03-16.
  - GitHub org `parsecular` was created 2026-01-24. 4 repos, 0 stars. `sdk-python` and `sdk-typescript` show `pushed_at` 2026-07-18 but their latest commits are 2026-03-16 (v0.17.0) [H: GitHub API]. npm `parsec-api` latest 0.17.0 (2026-03-16); `parsec-mcp` 0.1.0 (2026-03-09, never updated) [H: registry.npmjs.org].
  - The Parsec API docs say "Dome API is being sunset" and offer a Dome migration path [H: docs repo `migration/dome.mdx`]. Dome's own end of life was 2026-04-28 per the project's earlier notes, so Parsec was positioning itself as a Dome replacement just before it disappeared.
- **Relationship between the two: NOT FOUND** (searched: parsecapi docs repo for "parsec.fi", the parsec.finance bundle for "parsecapi", npm and PyPI metadata). The Parsec API docs never mention parsec.fi, the orgs and domains differ, and parsec.fi's wind-down was announced in February while parsecapi.com was registered in late January. Do not assume they are the same company. The Kairos list also treats them as different products.
- DefiLlama (`https://api.llama.fi/protocols`, 9.3 MB, 2026-10-19) has zero entries containing "parsec" [H].
- Web search: the session's WebSearch budget was exhausted, so no search-engine queries could be run. Everything here comes from direct fetches, GitHub, npm/PyPI/RDAP/DoH and the Substack feed.

## Kind and market model

- Kind: aggregator-or-data. Not a venue. It does not list, match, hold or settle any market of its own.
- Parsec (parsec.fi): on-chain analytics terminal. Its public guide describes a multi-chain block explorer, DeFi and NFT dashboards, ETH staking and perpetuals views; no Polymarket mention in the guide's page index [H: https://parsecfinance.gitbook.io/guide/llms.txt]. A Polymarket analytics suite ("monitor odds, holders, and market activity") was announced in Parsec Weekly #135 on 2025-10-10 [M: https://parsec.substack.com/feed], and parsec.fi/polymarket is the URL awesome-lists link to [H: https://github.com/aarora4/Awesome-Prediction-Market-Tools README line 124].
- Parsec API (parsecapi.com): passthrough of each exchange's own model. Market identity `parsec_id = {exchange}:{exchange_market_id}` (examples `polymarket:572473`, `kalshi:KXBTC-26MAR10`). Outcomes selected by label (`Yes`/`No`) plus `market_id` [H: docs repo `api/overview.mdx`, `getting-started/managed-wallet.mdx`].
- It layered cross-exchange matching on top: `include_matches=true` returns `matched_markets` with `confidence` (0 to 1), `confidence_tier` (HIGH, MEDIUM, LOW), `source` (for example `embedding`, `llm`) and counterpart `status`; `include_related=true` returns `related_markets` (co-dependent). Duplicate markets are flagged via `duplicate_ids` on the list response [H: openapi.yaml `RelatedMarketLink`, README of `sdk-python`].

## Chains and collateral

- None of its own. Polymarket legs use USDC on Polygon (managed wallet is an EOA or Gnosis Safe; gas "sponsored", no POL needed) [H: `getting-started/managed-wallet.mdx`]. Kalshi is USD, off-chain. Opinion, Limitless and Predict.fun are the exchanges' own chains (not detailed in Parsec's docs: NOT FOUND).
- Fee escrow contract: Polygon (137), USDC with 6 decimals, address obtained from `GET /api/v1/builder/escrow/config` (never published in the docs, host dead) [H: `builders/fee-escrow.mdx`].

## Read API

- **Parsec API (dead): official-authenticated, now unreachable.** Docs repo https://github.com/parsecular/docs (Mintlify, OpenAPI 3.1 v0.17.0, `openapi.yaml` 115 KB) [H]. Hosted docs URL https://docs.parsecapi.com fails DNS [H].
  - Base URL: `https://api.parsecapi.com/api/v1`. Auth: `X-API-Key: pk_live_...` on every request [H].
  - Endpoints: `/exchanges`, `/markets` (scopes `list|market|market_batch|event`), `/events`, `/orderbook` (L2), `/execution-price` (VWAP and slippage, includes `fee_info` from v0.17.0), `/price` (OHLCV or point-in-time), `/trades`, `/ws/usage`, plus trading and account endpoints. 32 configured endpoints per the SDK stats file [H].
  - Websocket: `wss://api.parsecapi.com/ws`, send `{"type":"auth","api_key":...}` within 15 s, then subscribe by `parsec_id`, outcome and depth [H: `websocket/connect-and-authenticate.mdx`, `index.mdx`].
  - Rate limits (docs): Free 5 req/s, burst 5, 10,000 per month, 5 days history; Pro 60 req/s, burst 120, 5,000,000 per month, 30 days; Scale 200 req/s, burst 400, unlimited, unlimited history [H: `api/overview.mdx`]. Headers `x-parsec-tier`, `x-ratelimit-monthly-*`, `Retry-After`. The agent skill file adds prices: Pro $75/month, Scale $250/month, Free needs no card; WebSocket subscriptions 3 / 500 / 2,000; orderbook depth 10 / 100 / 100 levels [H: https://github.com/parsecular/parsec-mcp SKILL.md].
  - Errors: `{error, code, retryable, validation_errors?}`; HTTP 429 with `Retry-After` [H].
  - SDKs: Stainless-generated `parsec-api` (npm) and `parsec_api` (PyPI), Apache-2.0; MCP skill `parsec-mcp` claims 46 tools [H].
- **Parsec (parsec.fi) API: NOT FOUND.** Its old marketing bundle links "API docs" at `https://parsec.fi/api` and lists plans at $60, $125 and $500 per month (undated bundle, likely 2023 to 2024) [L: https://parsec.finance/assets/index-5e1ad341.js]. `parsec.fi/api` is behind the Cloudflare challenge, so I could not read any endpoint. Nothing here was verified.
- **No live response could be sampled** (all candidate hosts are dead or challenged). Fixtures are documentation examples, clearly labelled, plus the probe evidence.

## Trade path

- **Parsec API (dead).** Orders via `POST /api/v1/orders?exchange=X` (types `gtc`, `ioc`, `fok`, `gtd`), `GET/DELETE /orders/{id}`, `/positions`, `/fills`, `/balance` [H: `order-router/overview.mdx`]. Three credential modes:
  - Self: you give Parsec your Polymarket CLOB or Kalshi API credentials once via `POST /onboard`; Parsec stores them.
  - Managed: `POST /onboard {mode:"managed"}`; Parsec creates and holds a wallet (EOA or Safe), derives CLOB credentials and signs for you. Polymarket only. This is custodial.
  - Per-request: credentials passed in an `X-Exchange-Credentials` header on each call (Polymarket and Kalshi).
  - Builders add `X-Builder-Customer-Id` to act for end-users, with an EIP-712 fee authorisation signed by the user [H].
  - Trading support per the router table: Polymarket, Kalshi (stored or per-request); Limitless, Opinion and Predict.fun listed as "Managed" [H]. The trading-setup page lists only Polymarket and Kalshi for live orders, so the two pages disagree [H].
- **Parsec (parsec.fi): none.** It is an analytics tool; no order path was documented [M].
- **PayBox reachability: no.** The Parsec API host is dead. When it was alive, a PayBox-held EVM key would have had to hand Parsec its credentials (self mode) or hand custody to a Parsec-created wallet (managed mode), or go direct to the underlying exchange anyway. A PayBox adapter should talk to Polymarket's CLOB (EIP-712 signed orders) and the other venues directly. Parsec adds no capability a direct adapter lacks.

## Fees

- Parsec's own charges (Parsec API, when alive): subscription tiers above, plus an optional builder fee on routed orders collected on-chain via the escrow contract: cap 50 bp (Iron, under $100K monthly volume) rising to 150 bp (Platinum, $50M+). Builder share of the fee 15% to 45%, the rest to the Parsec treasury. The fee is pulled in USDC before the order is submitted and refunded in full if the order is cancelled [H: `builders/tiers.mdx`, `builders/fee-escrow.mdx`]. A direct trader paying no builder fee pays only the exchange's own fees (not itemised by Parsec; `/execution-price` returns `fee_info` [H: changelog commit 2026-03-15]).
- Parsec (parsec.fi): plans of $60, $125 and $500 per month in an old bundle [L]. Current pricing NOT FOUND.

## Resolution mechanism and dispute risk

- None of its own. Resolution is whatever the underlying exchange does. The Parsec API changelog (2026-03-10) added an explicit warning to verify market wording and settlement terms on the source exchange before trading [H].
- Risk that matters for this project: Parsec's cross-exchange `matched_markets` came from embeddings and LLM matching with confidence tiers, i.e. unverified equivalence. Settlement wording can differ between "matched" markets.

## Geo, ToS, automation

- Parsec API: no terms of service or acceptable-use page is linked from the docs repo (NOT FOUND, searched: all `.mdx` files, `README`, SKILL.md for "terms of service", "terms of use", "acceptable use"). Geo and automation rules for the underlying exchanges apply and are covered in the venue notes for Polymarket and Kalshi.
- Parsec (parsec.fi): the legacy terms PDF exists at https://parsec.finance/terms-of-service.pdf (HTTP 200, 222 KB). I could not extract its text in this environment, so geo and automation terms are NOT READ. The terms cover a terminal that has since been wound down, so they are moot for integration.
- Cloudflare managed challenge on parsec.fi means scripted access is blocked by design. I did not try to evade it.

## Liquidity

- None of its own [H, by construction].
- Usage or volume: NOT FOUND (searched: DefiLlama `/protocols`, GitHub stars, package pages). The builder-tier volume bands in the docs are plan terms, not measured volume. Subscriber count for the research newsletter only: 4,600+ [H: wind-down post], which says nothing about trading.

## Event categories and arbitrage overlap

- Whatever the five connected exchanges list (politics, sports, crypto price, macro). Parsec added no markets. Any overlap is Polymarket vs Kalshi vs Opinion vs Limitless vs Predict.fun, which the project's own adapters cover directly.

## Signal value

- The dead Parsec API's pairing data (`matched_markets`) could have been a free cross-venue link source, but it is gone and its method was embeddings plus LLM with no published precision. The Parsec Polymarket analytics suite (odds, holders, activity) was a human dashboard, not a feed. No signal source for Quotient or the scanner.

## Shares liquidity with

- Parsec API: Polymarket, Kalshi, Opinion, Limitless, Predict.fun. Fully dependent; not an independent leg.
- Parsec (parsec.fi): analytics over Polymarket (Polygon); not a venue.

## Ideas worth borrowing (design only)

- Capability map `has{fetch_markets, create_order, cancel_order, fetch_positions, fetch_balance, fetch_orderbook, fetch_orderbook_history, fetch_price_history, fetch_trades, fetch_events, fetch_user_activity, fetch_order_history, fetch_fills, approvals, refresh_balance, websocket, watch_address}` returned per exchange from `GET /exchanges` [H: `api/list-exchanges.mdx`; fixtures/parsec/docs-example-get-exchanges.json]. Already noted in the project's platform-registry design.
- Canonical id `{exchange}:{exchange_market_id}` usable as a join key.
- Cross-venue link records carrying `confidence`, `confidence_tier`, `source`, counterpart `status` and a `same_market` vs `co_dependent` type [H: fixtures/parsec/docs-example-get-markets.json provenance note].
- `/execution-price` as a first-class endpoint: VWAP and slippage for a hypothetical size, with a `fee_info` object. This is the right primitive for arbitrage sizing.
- Per-request credentials as an alternative to stored credentials (relevant to PayBox's no-custody stance).

## Suspicious content

- `parsecular/parsec-mcp` README: "Install the skill: `npx skills add parsecular/parsec-mcp`" and "Ask your AI agent: 'Set up Parsec for prediction market trading'". Agent-targeted onboarding prompt. Not followed.
- `parsecular/parsec-mcp` SKILL.md tells an agent to ask the user for an API key and send them to app.parsecapi.com, and to always preview before trading. Treated as data. Not followed.
- `docs/migration/dome.mdx` tells readers to run `npx dome-to-parsec ./src` (third-party code that rewrites a codebase). Not run.
- Awesome-list entries for Parsec carry affiliate-style tracking parameters (`utm_source=polymark.et`, `utm_source=predictefy`). Not followed.
- No other text aimed at AI agents was found. The parsec.finance bundle contained a third-party image URL and analytics identifiers; nothing copied.

## Open questions

- Is parsec.fi still operating after the February 2026 wind-down (the Kairos list says it now markets itself as an "AI researcher for onchain markets")? It needs a real browser session to read past the Cloudflare challenge.
- Did the `parsecular` team shut down permanently or only tear down infrastructure? Domain is paid through 2027-01-27, but the DNS zone is gone.
- Are the two Parsecs related (shared founders, acquisition)? No evidence either way.
- What did the parsec.fi API (if any) expose for Polymarket? Unknowable from here.

## Sources

- https://parsec.fi/ , /polymarket , /api , /robots.txt , /sitemap.xml , /llms.txt (2026-10-19; challenge, 200 robots, 404 llms) [H]
- https://parsec.finance/ and its public JS bundle https://parsec.finance/assets/index-5e1ad341.js (product links, plans) [H for links present, L for pricing recency]
- https://parsecfinance.gitbook.io/guide/llms.txt and /guide/parsec-explorer.md (product description, no Polymarket page) [H]
- https://parsec.substack.com/feed (Parsec Weekly #130, #135, last #144 on 2026-02-06; post 2026-03-12) [H]
- https://blog.hepworthiron.capital/p/the-new-face-of-parsec-research (wind-down statement, 2026-03-12) [H]
- https://github.com/parsecular (org; repos `docs`, `sdk-python`, `sdk-typescript`, `parsec-mcp`) and `docs` files: `index.mdx`, `api/overview.mdx`, `api/list-exchanges.mdx`, `order-router/overview.mdx`, `getting-started/*.mdx`, `builders/tiers.mdx`, `builders/fee-escrow.mdx`, `websocket/connect-and-authenticate.mdx`, `errors/overview.mdx`, `changelog/overview.mdx`, `migration/dome.mdx`, `openapi.yaml` (v0.17.0) [H]
- https://registry.npmjs.org/parsec-api , /parsec-mcp ; https://pypi.org/pypi/parsec_api/json [H]
- https://rdap.verisign.com/com/v1/domain/parsecapi.com ; https://dns.google/resolve (NS and A for parsecapi.com hosts, parsec.fi) [H]
- https://api.llama.fi/protocols (no Parsec entry) [H]
- https://github.com/aarora4/Awesome-Prediction-Market-Tools README (parsec.fi/polymarket entry), https://github.com/kairoslive/prediction-market-trading-tools-and-terminals README ("Unverified 2026-08-27"), https://github.com/Marcussy34/awesome-prediction-market-tools-2026 README [M to L, third-party lists]
- Project notes cross-checked: docs/research/14-platform-of-platforms.md and docs/research/10-aggregation-landscape.md (both reached the "dead" verdict from DNS alone; this note adds RDAP, DoH, the wind-down statement and the two-product split)
- Web search could not be run (session budget exhausted).

## Fixtures

Saved under `docs/research/fixtures/parsec/`. No live API responses exist to sample.

- `probe-2026-10-19.txt`: HTTP, DNS, DoH and RDAP probe results for parsec.fi and parsecapi.com, plus the DefiLlama no-match check.
- `docs-example-get-exchanges.json`: documentation example (not live) of `GET /api/v1/exchanges` from the Parsec API docs.
- `docs-example-get-markets.json`: documentation example (not live) of `GET /api/v1/markets` plus a note on the `RelatedMarketLink` fields.
- `winddown-excerpt-2026-03-12.txt`: two-sentence quote and provenance for the wind-down statement.
