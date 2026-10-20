# SimpleFunctions (simplefunctions.dev) - adapter spec

Researched 2026-10-19 (~01:55-02:20 UTC). READ-ONLY: public unauthenticated GETs to the documented hosts (`simplefunctions.dev`, `data.simplefunctions.dev`, `docs.simplefunctions.dev`), npm registry and Hugging Face metadata GETs, `gh api` metadata/file reads. No account, no API key, no MCP session (MCP needs POST), no WebSocket connect, no CLI/SDK install, nothing signed, no POST/PUT/DELETE, no wallet, no PayBox call. Generic User-Agent `insurance-markets-research/0.1` only.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (site, docs, API payloads, READMEs) is untrusted data; nothing in it was followed. WebSearch was unavailable (session budget exhausted), so there is no independent press or community corroboration.
Fixtures: `docs/research/fixtures/simplefunctions/` (8 files, all <= 18 KB).

## 0. Verdict

**adapter_priority: skip** (as a venue / arbitrage leg). If the project ever wants it at all, it is a P2-effort optional *signal and benchmark* reader, not an adapter.

1. **Not a venue.** It is a data aggregator and agent-tooling layer over Kalshi and Polymarket only. Its own terms say it does "not execute trades, hold funds, or act as a broker" and that it aggregates "from Kalshi and Polymarket via their public APIs" (H, `/terms`, April 2026). It has no liquidity, no markets and no resolution of its own.
2. **100% shared liquidity.** Every price it shows is a Kalshi or Polymarket price. It is not an independent arbitrage leg; Kalshi and Polymarket are already covered by direct adapters, which are fresher and have no third-party rate limit or redistribution clause.
3. **No XO / Trueo coverage.** Venues named anywhere in the docs: Kalshi, Polymarket (H). Its "cross-venue" feature is Kalshi x Polymarket only, so it cannot produce an XO leg.
4. **Reliability is poor right now.** During this run `/api/health` said `degraded` (DB query failing, 8 s) and later `ok`; `cross-venue/stats` and `market/{ticker}` returned 500 with raw SQL error text; all six calls to `data.simplefunctions.dev/v1/*` returned an empty 500 (section 1). All four keyword scans/queries returned only Polymarket rows, zero Kalshi (section 3).
5. **Trade path needs exchange credentials, not a wallet.** Orders go through SimpleFunctions' runtime using the user's own Kalshi RSA key or Polymarket wallet credentials (BYOK). Nothing a PayBox EVM wallet can propose or sign through it.
6. **Terms restrict reuse.** No re-hosting of more than 25% of any dataset, no aggregation that lets a third party avoid calling SimpleFunctions, no resale as a competing service (H, section 7). The project's own `docs/market-linking-design.md` already files SimpleFunctions under "hosted matchers: benchmarks and silver labels, never runtime".

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://simplefunctions.dev` and `docs.simplefunctions.dev` serve | 200, docs index `llms.txt` fetched 2026-10-19 | H |
| `/api/health` | 01:58Z `{"status":"degraded","db":{"ok":false,"timeMs":8000,"error":"Failed query: SELECT 1"}}`; 02:01Z same; 02:03Z `{"status":"ok","db":{"ok":true,"timeMs":3}}` (fixtures `api-health-degraded.json`, `api-health-ok.json`) | H |
| `GET /api/public/market/{conditionId}?depth=true` | 500 at ~02:00Z, body leaks a failed `market_indicators` SQL query (`public-market-detail-500-db-error.json`) | H |
| `GET /api/public/cross-venue/stats` | 500 twice (02:00Z, 02:04Z), `Failed query ... FROM cross_venue_pairs` | H |
| `GET /api/public/cross-venue/pairs` | 500 at 02:00Z; 200 with `"total":0,"pairs":[]` at 02:03Z (preset `arb`) and 02:04Z (preset `browse`) (`public-cross-venue-pairs-arb-empty.json`). An empty table cannot be told apart from a DB fault, so pair quality is unverified | H |
| `data.simplefunctions.dev/v1/heartbeat`, `/markets/featured`, `/markets?q=fed`, `/search?q=bitcoin` | HTTP 500, empty body, 5 attempts 01:58-02:05Z; `/healthz` returns a 404 HTML page although the docs list it | H |
| `GET /api/status` | timed out at 30 s | H |
| `GET /api/public/odds` | 500 after 16 s; `GET /api/agent/world` timed out at 25 s | H |
| Fresh content | `newmarkets` returned Polymarket markets listed at 2026-10-19T02:00Z | H |
| Hugging Face datasets (`SimpleFunctions/*`) last modified | sf-index-history 2026-10-08, world-state-daily 2026-10-09 (documented as daily), settled-markets 2026-10-12 | H |
| npm `@spfunctions/cli` | created 2026-03-12, 138 versions, latest 3.0.47 published 2026-05-27 (nothing newer; ~4.7 months). `@spfunctions/sdk` latest 1.0.1 and `@spfunctions/agent` latest 1.0.2, both last modified 2026-05-27 | H |
| Terms of Service | "Last updated: April 2026" (6 months old, borderline stale) | H |
| Realtime data docs | "Last verified: 2026-05-06" (5.5 months) | M |

Net: the web service and docs are live and being served, the product is young (everything created March-May 2026), but the backend was visibly unhealthy on the day and the daily public datasets look about 7-10 days behind. Live = yes, dependable = no. Confidence in "still live": H. Confidence in "healthy": low.

## 2. What it is

- **Kind**: aggregator-or-data over centralized venues (Kalshi, Polymarket). "Compress, Compute, Execute." (H, landing page). Products: market search/scan/screen, a "Probability Index" (`/odds`: one liquidity-weighted YES probability per question across Kalshi + Polymarket, refreshed every 15 min), a SimpleFunctions Index (four gauges), regime labels, indicators (IY, CRI, EE, LAS), a "thesis" engine (causal trees plus LLM evaluation, edges versus market prices), a Kalshi x Polymarket pair matcher, agent runtime/CLI/SDK/MCP, a web trading terminal (`app.simplefunctions.dev`), "Portfolio Autopilot" (cloud agent trading a user's Kalshi key), enterprise "cross-venue routing" via sales (H, landing page, docs index).
- **Market model**: none of its own. It normalises venue objects: Kalshi tickers (`KXFEDDECISION-26DEC10-T0` style) and Polymarket `conditionId` (66-char hex) share one `ticker` field (H, docs `market-detail`). Binary YES price only; outcomes are not tokenised by SimpleFunctions. Polymarket execution needs the CLOB token id and an explicit limit price (H, docs `execution-intents`).
- **"Edge"** in its API means thesis-implied mispricing (`edges[]`, `ee` expected edge in cents, `eeSource` of `thesis` or `regime`), i.e. LLM/analyst opinion, not a riskless cross-venue spread. Cross-venue gaps are a separate field (`crossVenue.isArbReady`, `cvr`, `crossVenueGap`) (H, docs; not verified live because of the outages).
- **Chains / collateral**: none. It is off-chain software; USDC/USD settlement happens on Kalshi (USD) and Polymarket (Polygon USDC) (M, venue facts from other workflows).
- **Operator / provenance (M/L)**: "Simple Functions" (copyright footer); Delaware law; vendor contact address is listed in the docs. GitHub org `spfunctions` created 2026-03-14 (H, see section 9 for oddities). The awesome-list that surfaced it (`aland4747/awesome-prediction-markets`, 1 star, account created 2026-04-09 with 1 repo, pushed 2026-10-12) lists SimpleFunctions first under "Multi-Venue", links a Colab badge hosted under the `spfunctions` account and uses SimpleFunctions' own endpoints in its Quick Start, so treat that list as vendor promotion, not independent evidence (M).

## 3. Read API

| Item | Value | Tag |
|---|---|---|
| Official public API | **Yes, partly keyless.** Core `/api/public/*` and `/api/agent/*` reads need no key; a Bearer key (`sf_live_...`) raises limits and unlocks `refresh=true`, the `model` param and user-scoped routes | H |
| Docs | `https://docs.simplefunctions.dev` (Mintlify; machine index `https://docs.simplefunctions.dev/llms.txt`; every page also at `.md`). OpenAPI at `https://simplefunctions.dev/openapi.json` (60 paths, GET-heavy, 51 KB, not stored: over the 50 KB fixture cap) | H |
| Base URLs | `https://simplefunctions.dev` (analytics/agent), `https://data.simplefunctions.dev/v1` (raw market data), `wss://app.simplefunctions.dev/ws` (WebSocket; docs say not `wss://data.../v1/ws`), MCP `https://simplefunctions.dev/api/mcp/mcp` | H |
| Keyless endpoints worth knowing | `GET /api/public/scan?q=` (keyword or `category=`; `series=` returns 400 "q required"), `/api/public/query?q=&limit=` (LLM-backed natural-language search), `/api/public/market/{ticker}?depth=true` (price, 5-level book, indicators, regime, `crossVenue` counterpart), `/api/public/market/{ticker}/history` (7-day), `/api/public/market/{ticker}/candles?venue=&timeframe=&limit=`, `/api/public/markets?tickers=A,B` (max 20), `/api/public/newmarkets`, `/api/public/cross-venue/pairs?preset=arb|world|detail|browse&min_conf=&limit<=500&offset=`, `/api/public/cross-venue/stats`, `/api/public/odds`, `/api/public/index`, `/api/public/contagion`, `/api/agent/world`, `/api/agent/world/delta?since=`, `/api/agent/inspect/{ticker}` | H (paths from docs and OpenAPI; shapes verified only for scan, query, newmarkets, pairs-empty) |
| Data host REST (docs) | `/v1/heartbeat`, `/v1/markets?q=&venue=`, `/v1/markets/featured`, `/v1/markets/{ticker}`, `/v1/search`, `/v1/snapshot`, `/v1/movers`, `/v1/orderbook/{ticker}` (`bids`/`asks` as `[price,size]`), `/v1/candles/{ticker}`, `/v1/trades/{ticker}`. Prices 0-1, `closeTime` unix s, `ts` unix ms. **All returned empty 500 today** | H docs / not confirmed live |
| WebSocket | `{"action":"subscribe","topics":["featured","ticker:T","orderbook:T","trade:T","candle:T:1m"]}`; 5 concurrent connections, 200 topics each; Kalshi + Polymarket "normalised into one ticker namespace, but not all fields are available from both venues". **Not connected** (data host failing) | H docs / untested |
| Auth | Bearer `sf_live_...` (API key from `sf login` or dashboard) for account routes; the auth page says the data host takes `sft_live_...` while the realtime page says public REST callers need nothing (edge proxy injects a token). Live result was 500, not 401, so the contradiction is unresolved | H docs / contradiction |
| Rate limits | Docs: `/api/public/query` 10/min anonymous, 60/min authenticated; `query-econ` 30/min; `query-gov` 10/min; data host `markets/candles/orderbook` 240/min, `snapshot/movers/search` 120/min; others "platform fair-use". Terms: "60 requests per minute on the free tier". Observed: anonymous `query`, `scan` and `cross-venue/stats` all returned `x-ratelimit-limit: 60` (so the doc's 10/min anonymous number is not what the header showed). 429 contract: `Retry-After` plus `{"ok":false,"error":{"code":"RATE_LIMITED"}}` | H |
| Latency (observed) | scan 6-9 s, query 10-18 s (LLM-backed), newmarkets 23 s, pairs 0.5-5 s, market detail 16 s then 500. Not suitable for a tight arbitrage loop | H |
| Caching | `public, s-maxage=60` on markets/scan/screen, 30 s on index/regime, 15-min refresh of hub data (landing page) | H docs |
| Resolution data | `status` is `active|closed|settled`; settled history only as monthly Hugging Face file `SimpleFunctions/settled-markets` (CC-BY-4.0 plus extra terms) | H docs |

**Verified response shapes (fixtures)**
- `public-scan-q-oil.json` (17.5 KB): `{query, markets[], totalRaw, filters, latencyMs, contextSuggestion, nextActions}`; each market `{title, venue:"polymarket", ticker:<conditionId>, slug, price (integer cents), priceMillicents, volume (USD, cumulative), volume24h, spread (cents), status:"open", closeTime:"YYYY-MM-DD", eventTitle, pageUrl, apiUrl, inspectUrl}`. **Units differ from the docs**: docs say `price` is 0-1 on market-detail and the data host; scan returns integer cents.
- `public-query-fed-rate-cut.json` (3.7 KB): LLM envelope `{query, contextSuggestion, answer, keyFactors[], citedPrices[], kalshi[], polymarket[], traditional[], x[], theses[], content[], meta{sources:["polymarket"], mode, latencyMs, queryUnderstanding:"llm"}}`. `kalshi` was `[]` and `meta.sources` listed only polymarket even for a Fed-rate query where Kalshi has deep markets.
- `public-newmarkets-limit-3.json`, `public-cross-venue-pairs-arb-empty.json` (shape `{generatedAt, filter{minConfidence,maxDtDays,limit}, presets[], total, limit, offset, pairs[], nextActions}`), `api-health-*.json`, and two 500 error bodies.
- **Venue mix observed**: scans/queries for "oil", "bitcoin 100k", "Trump president 2028" and "fed rate cut" returned 20+5+13+3 rows, every one `venue:"polymarket"`. I never saw a Kalshi row. Cause unknown (Kalshi data comes from the same DB that was failing, M); the landing page claims Kalshi is ~97% of tracked contracts (H, but unverified). The cross-venue pair format (`kalshi_ticker`, `poly_ticker`, `confidence_score`, `match_method` in `structural|fts-llm|llm-fallback|fuzzy-outcome`, `llm_rationale`, `direction`, `close_time_delta_sec`) is known only from the leaked SQL and the OpenAPI text, not from a populated response.

## 4. Trade path and PayBox

- **Programmatic orders (H, docs)**: `POST /api/intents` (Bearer `sf_live_`) with `venue` (`kalshi|polymarket`), `marketId` (Kalshi ticker or Polymarket CLOB token id), `direction`, `action`, `targetQuantity`, optional `maxPrice`, trigger fields, `autoExecute` (default false on raw intents). A runtime (`POST /api/runtime/exec`, SDK `sf.execution.place`, `sf buy/sell`, web terminal ticket, or cloud Portfolio Autopilot) then places the venue order. Live routing "still requires exchange credentials in that runtime context, such as encrypted cloud secrets or a local/self-hosted runtime controller". SimpleFunctions itself says it is "a governed workflow path, not the fastest possible venue client" and recommends raw venue APIs for HFT/market making.
- **Credentials model (H, docs `authentication`)**: Kalshi = user's RSA private key (local, or AES-256-GCM-encrypted upload for autopilot); Polymarket = "BYOK wallet", local-only credentials in the CLI or wallet-connect on the web terminal. No hosted custody.
- **Risk gates (H, docs)**: fail-closed per-order checks (defaults: single order $200, total exposure $3,000, per market $1,000, daily loss $150, 20 positions, drawdown halt $500). Irrelevant to us except as extra rejection reasons.
- **PayBox reachability: no** for trading. There is no on-chain surface, no transaction proposal and no signed-order endpoint that an EVM wallet could use; the only trade route is to hand exchange credentials to SimpleFunctions' runtime, which PayBox should never do. Anything the project wants to execute on Kalshi or Polymarket must go through those venues' own adapters. **Reads** need no wallet, only HTTPS GET; whether the PayBox plugin runner allows fetching `simplefunctions.dev` is not checked here.
- **x402**: no HTTP 402 seen on any call and no x402 mention in the docs I read. NOT FOUND (searched: docs index, auth, pricing, rate limits, terms).
- Not tested: MCP (needs POST), CLI, SDK, any authenticated route.

## 5. Fees

- SimpleFunctions: free developer tier; "up to 15 million tokens of AI inference" free, then "billed per token" (H, terms section 4). The pricing page says "In development" and quotes custom enterprise plans by email only (H). No subscription price, no per-request price and no execution fee or order markup is documented. NOT FOUND (searched: terms, `/enterprise/pricing`, `/enterprise/compliance`, `execution-intents`, `trade-intents`, FAQ).
- All trading costs are the underlying venue's (Kalshi fee schedule, Polymarket fees) and are covered by the other workflow; SimpleFunctions' `ee`/`edge` figures are quoted before venue fees (M: nothing in the docs says they include fees).

## 6. Resolution mechanism and dispute risk

SimpleFunctions does not resolve anything. Outcomes are whatever Kalshi (CFTC-regulated DCM; rulebook resolution) and Polymarket (UMA optimistic oracle with disputes; M from other workflows) decide; SimpleFunctions only mirrors `status: settled`. Risks that are specific to this layer: (a) its cross-venue matcher is LLM-based (`match_method` includes `llm-fallback`, `fuzzy-outcome`) and publishes `confidence_score` rather than rule-level equivalence, so "arb-ready" pairs can still differ in resolution source, time zone or threshold wording (H docs; precision unmeasured, and no matcher in this class publishes precision per `docs/research/16-linking-methods-services.md`); (b) the docs and terms say its data "may be delayed, incomplete, or incorrect".

## 7. Geo, ToS, automation (quoted sparingly)

- Terms (H, `https://simplefunctions.dev/terms`, "Last updated: April 2026"): free tier is "currently 60 requests per minute"; users may not "resell or redistribute SimpleFunctions data or API responses as a competing service", "scrape, or overload our infrastructure", or "automate account creation to circumvent usage limits"; no financial advice; "We do not execute trades, hold funds, or act as a broker"; liability capped at 12 months of fees; Delaware law; 14 days' email notice for material changes.
- Data licence (H, terms section 13): public data (`/api/public/*`, `/api/agent/*`, `/api/mcp/*`, `llms.txt`, `openapi.json`, HF/Kaggle datasets) is CC-BY-4.0 **plus** a contractual "no competing re-host" term: no serving it as an API/dataset/service that substitutes for a SimpleFunctions endpoint; "substantial" = more than 25% of the records of any dataset or any aggregation that lets a third party avoid calling SimpleFunctions. AI training and evaluation are expressly permitted. Time-sensitive outputs (ideas, regime scans, Index values, cross-venue verifications) get 24 hours' protection. Implication: a private signal feed is fine; relaying its pairs or index through a public aggregation API is not.
- Geo: the terms state no geographic restrictions (H). The compliance page says availability follows "where Kalshi and Polymarket users can transact" and that "Polymarket global CLOB access is subject to Polymarket's current geographic and terms restrictions" (H, docs). Venue KYC/geo rules apply to any trade.
- Automation: documented and encouraged for reads (agent API, CLI, MCP); anything beyond the published limits requires emailing the vendor. Treat the 60 req/min figure as the budget.

## 8. Liquidity, overlap, shared liquidity

- **Own liquidity: none.** Tracked-universe size: data-host heartbeat example `markets_tracked: 9333` (docs example, 2026-05, L); landing page says Kalshi is ~97% of tracked contracts (M, unverified). Row-level volumes in the scan fixtures are Polymarket cumulative USD volumes passed through (e.g. 2028 Democratic-winner rows of ~$14-19 M each on 2026-10-19, H). Hugging Face downloads 386-806 per dataset (H) suggest a small user base (M).
- **Categories that overlap other venues** (inherited from Kalshi and Polymarket): US politics and elections (2028 nominee/winner), macro (Fed decisions, rate cuts, CPI), crypto price and up/down markets, commodities (oil), sports. No XO/Trueo-relevant categories are added.
- **Shared liquidity**: shares 100% with **Kalshi** and **Polymarket**. It is NOT an independent arbitrage leg. Its only genuine contribution is metadata: a pre-matched Kalshi x Polymarket pair table (currently empty/failing) and a blended probability index.

## 9. Suspicious content and provenance oddities

- `docs.simplefunctions.dev`, the landing page and the awesome-list README contain "paste this in your terminal" agent instructions (`curl -L simplefunctions.dev/api/agent/world`, `sf portfolio enable`, `npm install -g @spfunctions/cli`, "claude mcp add simplefunctions --url ..."), a "For agents" link to `/llms-full.txt`, and a Telegram-notification demo. Not followed (`sf portfolio enable` would upload an exchange private key; never do that for this project). Only the documented read-only GETs listed above were run. `llms-full.txt` was not fetched.
- `gh api orgs/spfunctions/repos` returns only two repos, both prefixed `come-to-telegram-rickluminari1--` (`.github`, last push 2026-06-16; `Awesome-Prediction-Market-Tools`, "PRs reviewed within 48h", last push 2026-04-14). `repos/spfunctions/simplefunctions-cli` (the `repository.url` in the npm metadata) and `repos/spfunctions/awesome-prediction-markets` (the Colab badge target in the awesome-list README) both return 404. Either the repos were removed and the org was repurposed or the org was tampered with; cause unknown (M). Do not install `@spfunctions/*` packages without source review, and do not click the Colab link.
- API error responses leak raw SQL (`Failed query: select "ticker", "slug", ... from "market_indicators"`) and table names (`cross_venue_pairs`, `market_indicators`, `marketRegimeSnapshots`): a hygiene signal, not an attack on us.
- The terms/legal pages and docs publish a vendor email for support and licensing; not used.

## 10. NOT FOUND and open questions

- NOT FOUND (searched: docs index, auth, pricing, rate limits, terms, compliance, FAQ): any execution fee or order markup; any uptime SLA number; an x402 or on-chain payment option; any venue other than Kalshi and Polymarket; any statement of matcher precision.
- NOT FOUND (searched: `gh api` for `spfunctions/simplefunctions-cli`): current source for the CLI/SDK (repo 404), so what the closed-source runtime does with Polymarket credentials is unaudited.
- NOT VERIFIED live: any Kalshi row in the public API, a populated `crossVenue` object, `/api/agent/world`, `/api/public/odds`, the data host REST/WS, MCP tools (docs claim 101 tools), authenticated routes, `sf_live_`/`sft_live_` key flow, whether the docs' `isArbReady` ever yields a genuine arbitrage.
- Open: is the 500 storm a one-off outage (health flipped to `ok` once) or a structural problem; does the data host require `sft_live_` despite the realtime page; why does anonymous `x-ratelimit-limit` read 60 when the rate-limit page says 10/min for `query`.

## 11. Sources

- Landing page: https://simplefunctions.dev (H, via WebFetch summary 2026-10-19)
- Terms of Service (April 2026): https://simplefunctions.dev/terms (H, WebFetch and raw HTML check)
- Docs index: https://docs.simplefunctions.dev/llms.txt (H) and pages `/api-reference/overview`, `/api-reference/public-market-data`, `/api-reference/market-detail`, `/api-reference/execution-intents`, `/reference/realtime-data`, `/enterprise/rate-limits`, `/enterprise/pricing`, `/enterprise/compliance`, `/guides/authentication`, `/build/trade-intents`, `/concepts/risk-gates`, `/concepts/snapshots`, `/cli/mcp-server`, `/resources/faq`, `/resources/status` (H, `.md` variants, 2026-10-19)
- OpenAPI: https://simplefunctions.dev/openapi.json (H)
- Live probes: `https://simplefunctions.dev/api/health`, `/api/public/scan`, `/api/public/query`, `/api/public/newmarkets`, `/api/public/market/{id}`, `/api/public/cross-venue/{pairs,stats}`, `/api/public/odds`, `https://data.simplefunctions.dev/v1/*` (H, 2026-10-19 01:58-02:20Z; fixtures under `docs/research/fixtures/simplefunctions/`)
- npm registry metadata for `@spfunctions/cli`, `@spfunctions/sdk`, `@spfunctions/agent` (H); Hugging Face dataset metadata `huggingface.co/api/datasets/SimpleFunctions/{sf-index-history,world-state-daily,settled-markets}` (H); `gh api` for `orgs/spfunctions`, `users/aland4747`, `repos/aland4747/awesome-prediction-markets` (H)
- Discovery lead: https://github.com/aland4747/awesome-prediction-markets README (H read; promotional, see section 2)
- Prior project notes: `docs/research/16-linking-methods-services.md` (K11), `docs/market-linking-design.md` (hosted matchers row), `docs/research/05-paybox-reference-plugins-b.md` (L-tagged mention)
