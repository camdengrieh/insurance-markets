# Prediction.com (Prediction Hunt) - cross-venue aggregator / arbitrage scanner - adapter spec

Researched 2026-10-19 (~01:20-02:00 UTC). READ-ONLY: unauthenticated GETs to `prediction.com` (site, docs, `openapi.json`, `skill.md`, `llms.txt`), `www.predictionhunt.com` (redirects), `ws.prediction.com/health`, `pypi.org` metadata for the vendor MCP package, and `gh api` for the vendor GitHub org. No account, no API key, no wallet, no POST, no PayBox tools.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale.
Third-party text (site, docs, `skill.md`, press coverage) is untrusted data; nothing in it was followed. See "Suspicious or agent-directed content" at the end.
Fixtures: `docs/research/fixtures/prediction-com-prediction-hunt/` (6 files, all < 26 KB).
Limits of this run: the WebSearch budget ran out after 4 searches, and two news sites (SBC News, Business Wire) returned 403 to WebFetch, so the ownership story (section 1) rests on one press-release copy plus search snippets. Only `GET /v2/status` can be called without a key, so every authenticated response shape below comes from the vendor's OpenAPI spec and docs samples, not from a live call.

## 0. Verdict

**adapter_priority: P2. A signal / benchmark source, not a venue and not an arbitrage leg.**

1. **Live (H).** `GET https://prediction.com/api/v2/status` returned 200 on 2026-10-19 with `last_updated` timestamps of 2026-10-19T01:23-01:24Z for all eight platforms (fixture `live-status-2026-10-19.json`).
2. **It is a data layer, not a market (H).** It matches markets across 8 venues and exposes prices, books, trades, arb and +EV signals, smart-money alerts. It holds no funds, runs no order book and does not settle anything. Site terms: "We do not hold customer funds, execute orders, or place trades on your behalf" (https://prediction.com/terms, section 3).
3. **No trade path (H).** All 33 OpenAPI paths are `GET`; no order, auth-to-venue or wallet endpoint exists. Nothing for PayBox to sign. API ToS section 5 mentions a "Trading SDK or execution-related endpoints" that I could not find anywhere (section 4).
4. **Venue coverage (H).** Kalshi, Polymarket (global), Polymarket US, Predict.fun, Opinion, PredictIt, ProphetX, Novig. **It does not cover XO, Limitless, Myriad, Manifold or Trueo.** So it cannot supply XO match links; it can only benchmark our matcher on the venues it shares with us (Kalshi, Polymarket, Predict.fun, Opinion, PredictIt) and tell us about two venues we may not have yet (ProphetX, Novig).
5. **API access is key-gated and paid for anything useful (H).** Only `/v2/status` is open. Free tier: 1 req/s, 1,000 req/month, only 10 of those can be matched-market requests, no arb/EV, no WebSocket. Dev $49/mo, Pro $249/mo.
6. **Terms conflict with our use (H, needs a lawyer or Enterprise licence).** API ToS section 7: unless Enterprise, data is "for your internal use or for display within your end-user application only. You may not scrape or redistribute the API data to build a standalone, competing data-aggregator or historical database." Our aggregation layer is functionally a competing cross-venue aggregator. Use it, if at all, as a human-supervised benchmark on a Dev key, never as a runtime dependency.
7. **Quality caveats (H).** Matching is "partly LLM-assisted" and "a small number of matches can be wrong" (vendor `skill.md`); ToS says arb/EV signals "may not account for order book depth (liquidity), trading fees, exchange-side slippage, or data latency". The vendor's own sample arb has a $0.13 leg and an 11% "arb" with `max_wager_usd: 0` (fixture `docs-sample-arb.json`).

## 1. Liveness and ownership

| Item | Finding | Tag |
|---|---|---|
| API alive | `GET /api/v2/status` 200, per-platform `status: "ok"`, all `last_updated` within ~1 minute of each other on 2026-10-19 | H (https://prediction.com/api/v2/status) |
| WebSocket host alive | `GET https://ws.prediction.com/health` returned 200 body `OK` (no auth, no subscription tested) | H |
| Domain move | `predictionhunt.com` and `www.predictionhunt.com` return 301 to `prediction.com`; `www.predictionhunt.com/api/docs` 301 to `prediction.com/api/docs`. The old API host still answers (`www.predictionhunt.com/api/v2/status` returned 200) and is documented as a "compatibility endpoint" | H |
| Brand | Site nav and the OpenAPI title still say "Prediction Hunt"; page titles say "Prediction.com". Hacker News "Show HN: PredictionHunt" dated 2025-10-08 by an unnamed founder ("my friend and I built") | H (site), M (HN: https://news.ycombinator.com/item?id=45516990) |
| Legal operator | "the Prediction Hunt/Prediction.com website, which is operated by SW Media Ltd" (Terms of Use, last updated 2026-07-30). No address, jurisdiction of incorporation or Genius Sports mention. Terms are governed by "the laws of the United States and the State of Delaware" | H (https://prediction.com/terms) |
| Genius Sports | Genius Sports press release dated 2026-09-17: launched "Prediction.com" through Legend, its consumer media and technology business; a "proprietary cross-venue, multi-leg pricing engine"; no venues named; no API mentioned; **neither "Prediction Hunt" nor "SW Media" appears** | H (https://www.geniussports.com/newsroom/genius-sports-launches-prediction-com-the-premium-prediction-market-platform-for-comparing-probabilities-event-contracts-and-insights/, read through WebFetch summary; copy at stocktitan.net agrees) |
| Genius/Legend coverage claims | Search snippets say 11 apps incl. Kalshi, Polymarket, Novig, Underdog, FanDuel Predicts, Fanatics; Legend bought for up to $1.2B (announced 2026-02-05) | L (search summaries only; articles not fetched) |
| Link between the two stories | **Unresolved.** Circumstantial: same domain, same launch month as the redirect; site outbound links use `c=Covers_PRED_Link` for Novig (Covers.com is listed as a Genius Sports property in the press release's About section). Against: Terms of Use names SW Media Ltd, not Genius or Legend, and dates from July 2026 | L |

So the answer to the hint ("operator not stated on page; Genius launched it") is: operator is stated in the Terms of Use as SW Media Ltd; Genius Sports publicly claims a launch of "Prediction.com"; whether Genius/Legend owns the Prediction Hunt product, licenses the domain, or runs a separate front-end on it is NOT FOUND (searched: Genius press release, site terms, About redirect, HN, 3 web searches). Practical consequence: counterparty and ToS owner for any paid API contract is unclear until Enterprise sales is asked.

## 2. What it is (kind and market model)

- **Kind**: `aggregator-or-data`. Web app (odds boards, "Pro view" sports board, arbitrage scanner, smart-money feed, picks, calculators, paper-trading simulator, news, "AI Agents" page) plus a REST + WebSocket API plus an MCP server (`prediction-hunt-mcp` on PyPI, MIT, v0.2.0; not installed or run). Outbound "Trade on X" buttons carry referral parameters (`referral=PRED35` for Kalshi, `r=predictionhunt...` for Polymarket, `partner_id=PredictionHunt` for ProphetX, `pid=Affiliate` for Novig, `utm_source=predictionhunt`). Revenue model is therefore affiliate + API subscriptions (M, inferred; the site says nothing explicit).
- **Market model**: not its own. It normalises each venue's contracts onto one shape: `Market` rows with `platform`, native `market_id`, `title` (outcome label), `event_title`, `status` in {active, resolved, cancelled}, `price` in **cents 0-100** with `yes_bid/yes_ask/no_bid/no_ask/last_price/volume/liquidity`, optional `rules` ({primary, secondary, sources[]}) via `include=rules` (H, OpenAPI `Market`, `MarketPrice`).
- **Cross-venue object**: `group_id` (integer) = a set of venue markets judged to be the same proposition; `events[]` have `confidence` in {high, medium, low} (docs say low is excluded); groups carry `market_class` (moneyline/spread/total/player_prop/other, null for non-sports), `line`, `side`, `player`, `team`, `period` (H, OpenAPI `MatchingEvent`, `MatchingGroup`).
- **Native-ID quirks that matter to an adapter (H, `skill.md` "Gotchas", treat as vendor claims)**: Kalshi `market_id` = market ticker; Polymarket = `condition_id` (outcome `token_id` separate); Polymarket US ids are prefixed `polymarket_us_`; Novig ids are prefixed `novig_` and are one market per outcome; PredictIt and ProphetX have no single-market `/orderbook`; on Polymarket US, Predict.fun and Novig only the YES side of the book is quoted.
- **Matching method**: undisclosed pipeline; `skill.md` says "partly LLM-assisted". ToS section 3: "provided on a 'Best-Effort' basis" and the vendor disclaims losses from "incorrect entity matching or differing platform rules". No precision/recall published (NOT FOUND, searched: site, docs, blog index in sitemap, llms.txt).

## 3. Read API

Official docs: https://prediction.com/api/docs ; LLM index https://prediction.com/api/docs/llms.txt ; OpenAPI 3.1 https://prediction.com/openapi.json (v10.0.0, 237 KB; also `/openapi.yaml`). All H.

| Item | Value |
|---|---|
| REST base | `https://prediction.com/api/v2` (recommended); `https://www.predictionhunt.com/api/v2` (compatibility, "remains supported"). v1 deprecated |
| WebSocket | `wss://ws.prediction.com` (legacy `wss://ws.predictionhunt.com`). Auth by `?api_key=` in the URL or an `auth` first frame. Subscribe: `{"action":"subscribe","channel":"prices","market_ids":[...]}` (or `group_ids`); ids may be native or `platform:id`. Envelope `{channel,type,ts,data}`. Server ping every 30 s. Updates are not replayed; after `*_STREAM_INTERRUPTED` warnings treat values as stale until `*_STREAM_READY` and refresh over REST |
| Auth | Header `X-API-Key: pmx_...` (preferred) or `?api_key=` (discouraged). Keys are created in a logged-in account ("Sign in" on site); I did not create one. Everything except `GET /v2/status` returns 401 without a key (live: `{"code":"auth.missing_api_key",...}`, fixture `live-401-missing-api-key-2026-10-19.json`). Note the Authentication docs page still shows the older 401 body without `code`; the Errors page and the live API use the `code` + `doc_url` envelope (40 stable codes listed) |
| Payment for tiers | NOT FOUND (searched: pricing, rate-limits, quickstart, MCP page for x402, Stripe, card, USDC; `/.well-known/x402` is 404). Assume card/Stripe-style checkout through the website; unverified |
| Docs inconsistency | The Free-key link in `skill.md` points to `https://prediction.com/pricing`, which is a 404; the working page is `/api/docs/pricing` (that page is client-rendered and only readable through the `/api` summary) |

**Endpoints (33 REST paths; OpenAPI, H):**

| Need | Endpoint | Notes |
|---|---|---|
| Health | `GET /status` | no key; per-platform `status`, `last_updated`, `active_markets` (all statuses ever ingested), `live_markets` (tradeable now) |
| Quota | `GET /rate-limit` | tier, per-second limit, month and per-group buckets |
| Catalog | `GET /markets` (`platform`,`status`,`category`,`q`,`limit`, `include=rules`), `GET /events` (`include_groups`, `event_type`, `status`, `date`, cursor `next_cursor`), `GET /search?q=` | matched-markets quota group applies to `events`, `search`, `matching-markets` |
| Matching | `GET /matching-markets` (exactly one of `q`, `polymarket_key`, `kalshi_key`), `GET /matching-markets/url?url=`, `GET /matching-markets/sports?sport=` | Free tier: 10 matched-market requests per month (H, `/api` page) |
| Prices | `GET /prices/bulk?ids=platform:market_id,...` (max 100), `GET /prices/history` (ISO-8601 `from/to`, `interval` string 1m/5m/15m/1h/1d) | OHLC; non-Kalshi history is YES-midpoint with null volume |
| Books | `GET /orderbook?platform=&market_id=` (polymarket, polymarket_us, kalshi, opinion, predictfun, novig), `GET /unified-orderbook?group_id=` (docs name Kalshi, Polymarket, Polymarket US, Opinion, Predict.fun) | levels are `[price_cents, contracts]` |
| Signals | `GET /arb`, `GET /ev` (Dev+), `GET /alerts/smart-money`, `GET /alerts/fade-finder` | `/arb` legs carry `price`, `side`, `liquidity_usd`, per-leg `fee_usd`; opportunity has `roi_pct` (net of entry fees, plus PredictIt 10% win fee), `total_cost`, `max_wager_usd`; response has `delay_seconds` ("Signal delay in seconds applied to the response"; sample shows 15) |
| Trades | `GET /trades` (unified feed, keyset pagination) | history starts 2026-05-19T00:00:00Z; unfiltered requests scan only the last 48 h (vendor claim) |
| Polymarket analytics | `/polymarket/{market-price,candlesticks,volume,open_interest,activity,leaderboard,top-holders,smart-activity,smart-money}`, `/wallet/{addr}/positions`, `/wallet/{addr}/identity` | wallet-level; privacy-sensitive data on third parties, not needed for us |
| Kalshi passthrough | `/kalshi/markets`, `/kalshi/markets/{ticker}`, `/kalshi/series` | combos excluded by default |

**WebSocket channels (H, https://prediction.com/api/docs/websocket):** Dev: `prices`, `kalshi_prices`, `kalshi_reference`, `smart_money`, `fade_finder`, `live_games`. Pro adds `arb`, `ev`, `orderbook`, `lifecycle`. Free: none. No standalone trades channel (trade messages ride `live_games`). Lifecycle (open/close/resolve) is Pro only.

**Rate limits and plans (H, https://prediction.com/api/docs/rate-limits and the `/api` page):**

| Tier | Price | Burst | Monthly | Signals/mo | WS (conns / subs per conn / subs per channel) |
|---|---|---|---|---|---|
| Free | $0 | 1 req/s | 1,000 (10 matched-market) | none | none |
| Dev | $49/mo | 20 req/s | 1M | 500 | 3 / 50 / 25 |
| Pro | $249/mo | 100 req/s | 5M | 5,000 | 10 / 200 / 100 |
| Enterprise | custom | custom | unlimited | unlimited | 50 / 1,000 / 500 |

Headers: `X-RateLimit-{Limit,Remaining,Reset}-{Second,Month}` plus `...-Matched-Markets-Month`, `...-Arb-Month`, `...-Ev-Month`; 429 carries `Retry-After`. The pricing copy says "Data is the same on every tier, and none of it is delayed", yet the `/arb` and `/ev` responses include `delay_seconds` (sample 15). Unresolved which is true for which tier (L).

**Freshness caveat (H, OpenAPI `MarketPrice`):** "A book without a valid, unambiguous capture in the last 7 days has null quote fields." That means a non-null quote can be up to 7 days old; a scanner must read the book timestamp (`/orderbook`, `/unified-orderbook` `timestamp`) rather than trust `price`. Also: crossed books and conflicting side observations are excluded, and NO prices on most venues are derived from YES.

**Live response shapes confirmed this session:** only `GET /v2/status` (fixture `live-status-2026-10-19.json`) and the 401 envelope. Authenticated shapes are taken from the OpenAPI spec (fixture `openapi-excerpt-v10.0.0.json`) and the docs' "recorded example" panels (fixtures `docs-sample-arb.json`, `docs-sample-matching-markets.json`, `docs-sample-unified-orderbook.json`), which are **documentation samples, not live captures** (the arb sample's `as_of` is 2026-04-03; the unified-orderbook sample is clearly synthetic, with a 2024 timestamp).

## 4. Trade path

**None.** (H) 
- OpenAPI: 33 paths, every one `GET`.
- Terms of Use section 3: not a broker, dealer or exchange; does not "execute orders".
- Site: "Trade on Kalshi / Polymarket US" buttons are outbound referral links; the paper-trading simulator is simulated.
- API ToS section 5 ("Trading SDK and Execution Liability") says "If you utilize the ... Trading SDK or execution-related endpoints ... All trades are executed directly on the third-party platform". I found no such SDK or endpoint: NOT FOUND (searched: OpenAPI paths, `llms.txt` x2, sitemap for "sdk", docs navigation, PyPI package description, vendor GitHub org `PredictionHunt` which has 0 public repos; the repo URL in the PyPI metadata returns 404). Treat as a placeholder or an unreleased product; it could appear later.

## 5. PayBox reachability

**paybox_reachable: no.** There is nothing to place, sign or fund. Possible narrow uses: (a) our own service calls its REST API with a vendor-issued key (a plain HTTPS GET, no PayBox signing); (b) PayBox `use_service`/x402 is not applicable because no x402 offer was found. To trade any matched leg, the agent would go to the underlying venue (each has its own auth: Kalshi API keys, Polymarket CLOB/EIP-712 on Polygon, Novig/ProphetX registered keys, and so on; see the sibling venue notes, not re-verified here). Chains and collateral of those underlying venues: not verified in this run; the aggregator itself is off-chain with no token.

## 6. Fees

- **For the service**: no trading fee because it does not trade. Cost is the subscription ladder above ($0 / $49 / $249 / custom). Payment method NOT FOUND. (H)
- **Fee formulas the vendor uses inside `/arb` (H as read, https://prediction.com/api/docs/v2/arb; correctness vs each venue's own docs is M and should be cross-checked with the sibling venue notes):**
  - Kalshi: `ceil(0.07 * Q * P * (1-P))` rounded up to the cent (Q contracts, P price 0-1).
  - Polymarket: `ceil(mult * Q * P * (1-P))` rounded up to the mill, `mult` default 0.05 (per-category in the calculators page: politics ~1.0% peak, crypto ~1.8%, sports ~0.8%, finance ~1.3%, culture ~1.3%, geopolitical exempt).
  - Polymarket US: `ceil(theta * Q * P * (1-P))` to the cent, theta per market, default 0.06.
  - Opinion: `ceil(Q * P * (1-P))` to the cent (calculator page also says $0.25 minimum fee per contract and $5 minimum purchase).
  - Predict.fun: `ceil((bps/10000) * Q * P)` to the cent, default 200 bps.
  - ProphetX: `0.02 * Q * (1-P)` (2% on profit).
  - PredictIt: no entry fee; 10% of net profit on a win (the calculator page mentions, but excludes, a 5% cash-out charge).
  - Novig: pregame no fee; live fee shown as $0.75 for 100 contracts at $0.50 in the calculator, which equals coefficient 0.03 x Q x P x (1-P) (H as displayed). The sibling Novig note records a live-fee change on 2026-10-15 (coefficient 0.03 to 0.06), so the calculator is likely stale on this point.
- **Who pays**: taker fees are per-leg and included in `roi_pct`; `fee_usd` is for one contract only and "fees are not linear in size", so a consumer must recompute at its own quantity.

## 7. Resolution and dispute risk

Prediction.com resolves nothing; each venue resolves its own markets. The risk it introduces is **false equivalence**: two venues' contracts can differ in settlement source, cut-off time and tie-breakers, and the matcher is best-effort. The site warns "Verify resolution criteria before trading. Events linked across platforms may resolve differently". `GET /markets?include=rules` returns `rules.primary/secondary/sources` per market (H, OpenAPI), which is the only structured hook for a resolution-compatibility check; whether the matcher compares rules is not documented (an older project note, doc 16, says rule comparison is "said to be part of matching"; I did not find that claim on the pages read today, so treat as L). A `lifecycle` WS channel (Pro) emits open/close/resolve events, and `/prices/history` carries resolved outcomes.

## 8. Geo, ToS and automation rules

All H unless noted.
- **API ToS (https://prediction.com/terms-of-service, last updated 2026-04-09):** automated API use is the intended use; anti-circumvention: "strictly prohibited from creating multiple accounts or using 'Sybil' tactics to bypass the limits of the 'Free' tier"; matching is "Best-Effort"; signals "may not account for order book depth ... trading fees ... slippage, or data latency"; section 6 requires users to comply with source-venue ToS and "not use the ... API to violate the geographic restrictions or jurisdictional prohibitions of the source exchanges"; **section 7: internal use or display in your own end-user application only, no building "a standalone, competing data-aggregator or historical database" without an Enterprise licence.**
- **Terms of Use section 7 (website, last updated 2026-07-30):** no scraping outside the API; no circumventing rate limits or paywalls; no redistributing or reselling data or derived signals to build "a competing aggregator or historical database without a written agreement".
- **Geo**: no country list; the site and API answered without any geo block (requests were served from a Cloudflare Bangkok edge, `cf-ray` suffix BKK); users are responsible for local law; promo banners carry venue-specific state exclusions (for example Kalshi: MI, WA, NV).
- **robots.txt**: `Allow: /` for general crawlers and named AI crawlers, with `/api/admin/`, `/api/ai-insights`, `/fragments/`, `/ingest/` disallowed. The vendor actively invites AI agents (hosted `skill.md`, MCP server, `/agents` page).
- **Risk for this project**: the project plan is a venue-agnostic aggregation layer; section 7 reads as prohibiting exactly that if built on this API's data. Using it for periodic calibration of our own matcher on a Dev key is arguably "internal use", but storing the output as a labelled dataset edges toward a "historical database". Ask the vendor in writing, or avoid persisting its output.

## 9. Liquidity and coverage

Prediction.com has no volume, OI or TVL of its own. The relevant numbers are what it covers, from its own status endpoint:

| Platform key | `live_markets` | `active_markets` (all ever ingested) | `last_updated` (UTC) |
|---|---|---|---|
| kalshi | 28,854 | 463,818 | 2026-10-19T01:23:59Z |
| polymarket | 20,202 | 550,032 | 2026-10-19T01:24:32Z |
| predictfun | 29,529 | 32,850 | 2026-10-19T01:24:32Z |
| prophetx | 2,573 | 267,860 | 2026-10-19T01:24:29Z |
| polymarket_us | 6,259 | 98,248 | 2026-10-19T01:23:51Z |
| novig | 1,125 | 42,995 | 2026-10-19T01:23:59Z |
| opinion | 376 | 1,887 | 2026-10-19T01:23:59Z |
| predictit | 555 | 562 | 2026-10-19T01:24:29Z |

H (https://prediction.com/api/v2/status, fixture `live-status-2026-10-19.json`). The vendor says `live_markets` is the count returned by `GET /markets?platform=X&status=active`, not a depth measure. The high Predict.fun count likely reflects many short-dated markets (M, unverified).

Industry volume context from the vendor's own Industry Data page (H as shown, M as accuracy; https://prediction.com/industry-data, read 2026-10-19): Kalshi and Polymarket "regularly top $600 million in daily volume and $3 billion in weekly volume" taker volume; Kalshi regularly tops $8B of contracts weekly; industry open interest peaked "near $2 billion in September 2026"; "Other brands have shrunk considerably since 2025". Vendor-computed, not audited.

## 10. Event categories and overlap (where arbitrage exists)

Site and API cover: sports (NFL, MLB, college football, tennis; moneyline, spread, total, player props via `/matching-markets/sports`), elections and politics (2026 midterms Senate/House/governor, 2028, international), economics and macro (Fed mentions, rates, inflation), crypto price and events, entertainment (awards, music), science and technology (H, `llms.txt` and sample data). Overlap is strongest where two or more of Kalshi, Polymarket, Polymarket US, Novig, ProphetX list the same game or the same political / Fed-mention market. The one real arb sample in the docs (Hegseth leaving the administration, Polymarket YES vs Kalshi NO) shows the typical pattern: a cross-listed US political market, thin books. Event-level matches exist only for venues in its 8; **XO, Limitless, Myriad, Manifold, Trueo are absent**, so no XO-leg arbitrage can come from it.

## 11. Shared liquidity

It adds none. Every price and book it shows is a copy of another venue's (Kalshi order book, Polymarket CLOB, and so on). It is **not an independent arbitrage leg**; it is a lens on legs we would also read directly from Kalshi, Polymarket, Predict.fun, Opinion, PredictIt (all covered by the parallel workflow) and from Novig and ProphetX (sibling notes `novig.md`, `prophetx.md`). Its only incremental information is the match graph (`group_id`), the `/arb` and `/ev` detections, and Polymarket wallet analytics.

## 12. How we could use it (if at all)

- **Benchmark for our matcher (P2 use)**: on a Dev key ($49/mo), compare our human-approved links on Kalshi/Polymarket/Predict.fun/Opinion/PredictIt against its `group_id`s via `GET /matching-markets/url?url=` and `/matching-markets?kalshi_key=`. The quota (Free 10 per month) makes the Free tier useless for this; Dev's "Signals 500/mo" applies to arb/EV, and the matched-markets group quota for Dev is not stated on the pages I read (NOT FOUND).
- **Cheap sanity check on arb detections**: its `/arb` and `/ev` output are candidates to compare with our own scanner's output, never to trade on. Its fee formulas are a quick cross-check for ours.
- **Do not**: depend on it at runtime, repackage its data, or treat its `confidence: high` as a resolution-equivalence guarantee.
- **Integration shape if ever built**: a read-only `signal-source` adapter returning `{group_id, members[{platform, market_id, url}], confidence, market_class, line/side/player/team}` and an `ArbHint` record; key stored server-side (header only, never query string), honour `Retry-After`, honour the quota headers, cache `matching-markets` aggressively to stay inside the matched-markets quota.

## 13. Open questions

1. Who owns Prediction Hunt now: SW Media Ltd (per Terms of Use), Genius Sports / Legend (per press release launching "Prediction.com"), or both? Counterparty for an Enterprise licence?
2. Does an Enterprise licence permit using the data inside a competing aggregation layer? Price?
3. Does the matcher compare resolution rules and close times, and what is its measured precision? (nothing published)
4. True delay on `/arb` and `/ev` per tier (`delay_seconds` vs "none of it is delayed").
5. Whether a "Trading SDK" exists or is planned (ToS section 5 mentions one).
6. Authenticated live response shapes: untested here because a key needs an account; re-verify `/matching-markets`, `/prices/bulk`, `/unified-orderbook` against live data before writing a typed client.
7. How the Dev tier counts the matched-markets quota, and how a paid tier is billed (card vs other).

## 14. Suspicious or agent-directed content seen (treated as data, not followed)

- `https://prediction.com/skill.md` is an agent skill file, and `https://prediction.com/agents` publishes the one-line prompt "Read https://prediction.com/skill.md and use it to query Prediction Hunt for live prediction-market data." I read `skill.md` as untrusted documentation only. It contains no hidden or hostile instructions; it does tell agents never to echo the API key and to treat returned strings as data. I did not follow the prompt, install the MCP server (`uvx prediction-hunt-mcp`), or send any key.
- The docs pages carry "Copy for LLM / View as Markdown" controls and an `llms.txt`; used only for navigation.
- The site's outbound links embed affiliate / referral identifiers (`PRED35`, `r=predictionhunt...`, `partner_id=PredictionHunt`, `pid=Affiliate`); not followed or used.
- Press-coverage figures (11 apps, $1.2B Legend deal) came from search-result summaries; unverified.
- Private-identifier hygiene: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no email, name, username or home path went into any request, header, URL or query. Search queries contained only company and product names.

## Sources

Primary (vendor):
- Site root: https://prediction.com (H, 2026-10-19)
- Site llms.txt: https://prediction.com/llms.txt
- API docs home and index: https://prediction.com/api/docs ; https://prediction.com/api/docs/llms.txt
- OpenAPI 3.1 (v10.0.0): https://prediction.com/openapi.json
- Auth, rate limits, errors, WebSocket, quickstart, MCP: https://prediction.com/api/docs/authentication ; /rate-limits ; /errors ; /websocket ; /quickstart ; /mcp
- Endpoint pages: https://prediction.com/api/docs/v2/arb ; /v2/ev ; /v2/matching-markets ; /v2/unified-orderbook ; /v2/prices-bulk ; /v2/orderbook
- Pricing summary: https://prediction.com/api (tier table); https://prediction.com/api/docs/pricing is client-rendered and was not readable as static HTML
- API Terms of Service (updated 2026-04-09): https://prediction.com/terms-of-service
- Terms of Use (updated 2026-07-30; names SW Media Ltd): https://prediction.com/terms
- Agent skill file and AI page: https://prediction.com/skill.md ; https://prediction.com/agents
- Fee calculator and industry data: https://prediction.com/calculators/market-fees ; https://prediction.com/industry-data
- Live endpoints: https://prediction.com/api/v2/status ; https://www.predictionhunt.com/api/v2/status ; https://ws.prediction.com/health
- Robots / sitemap: https://prediction.com/robots.txt ; https://prediction.com/sitemap.xml
- PyPI metadata for the MCP package: https://pypi.org/pypi/prediction-hunt-mcp/json (MIT, v0.2.0; repository link returns 404); GitHub org `PredictionHunt` (created 2025-10-22, 0 public repos) via `gh api users/PredictionHunt`

Secondary:
- Genius Sports press release, 2026-09-17: https://www.geniussports.com/newsroom/genius-sports-launches-prediction-com-the-premium-prediction-market-platform-for-comparing-probabilities-event-contracts-and-insights/ (M for the launch; says nothing about Prediction Hunt)
- Stock Titan copy: https://www.stocktitan.net/news/GENI/genius-sports-launches-prediction-com-the-premium-prediction-market-qpgsz5fy2rx2.html
- Search-result listings only (not fetched, 403 or budget): SBC News https://sbcnews.co.uk/marketing/2026/09/17/genius-sports-prediction-markets ; Sportcal https://www.sportcal.com/news/genius-sports-launches-prediction-markets-platform/ ; Business Wire https://www.businesswire.com/news/home/20260917877851/en/ (L)
- Hacker News launch thread, 2025-10-08: https://news.ycombinator.com/item?id=45516990 (M)
- Earlier project notes touching this vendor: `docs/research/10-aggregation-landscape.md` section 1.7 (5 venues per a May 2026 vendor blog, now 8), `docs/research/16-linking-methods-services.md` section 5 and K12.
