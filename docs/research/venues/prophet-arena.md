# Prophet Arena (prophetarena.co) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY. Sources: the site's pages via the fetch tool (model summaries, marked "(wf)"), raw `robots.txt`, `llms.txt`, `agents.md`, `sitemap.xml` via curl, and 6 unauthenticated GETs to the public read endpoints of `api.prophetarena.co`. No account, key, login, POST, signing or payment. The WebSearch budget was exhausted before any search ran, so there is no independent third-party coverage. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak/stale. NOT FOUND (searched: ...) where undocumented.

Fixtures: `docs/research/fixtures/prophet-arena/` (4 files, all under 5 KB, real responses of 2026-10-19).

---

## Verdict

- **Not a venue. adapter_priority = skip.** Prophet Arena is a benchmark and leaderboard for AI forecasters. It has no order book, no market, no trading, no collateral, no chain. Its tagline: "A live AI forecasting benchmark on real prediction markets" (H, /about, wf). Nothing can be bought or sold on it.
- Its events are mirrors of Kalshi markets (M-H: the research welcome page says events are "curated from Kalshi" (wf), and every open-event slug seen is a Kalshi ticker, e.g. `kxrt-sens`, `kxcaneuinfl-26oct19`; the paper "When Do Prophets Profit" says markets and prices come from Kalshi (wf)). So its prices are Kalshi's: **zero independent liquidity**, `liquidity_shared_with` = Kalshi. Note `llms.txt` also says questions come "mostly from regulated prediction markets (such as Kalshi and Polymarket), plus questions Prophet Arena writes and resolves from public sources" (H), so a minority may come from Polymarket or be self-authored; I saw no Polymarket-sourced slug in 3 open + 2 resolved events (M).
- Residual value for this project: (a) a free, keyless, historical Kalshi-derived dataset (crowd probability series, resolved events, criteria text) usable for backtests and for linking tests; (b) a **signal source**: a leaderboard of AI forecasters and, per closed or resolved event, the latest public forecast of each agent (`/events/{slug}/forecasts`), which could feed a model-vs-market edge signal in the Quotient style. That is signal-only at best, and forecasts are only exposed after the event closes (H, API reference wf), so they are not usable for live edge. Hence not even P2 for the scanner's price legs. If a signal adapter is wanted later, treat it as optional P2 research input.
- Confidence: high on "not tradable", medium-high on "Kalshi-only liquidity".

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.prophetarena.co` | live; nav: Evaluations/Live leaderboard, Weekly, Weekly results, Research, Docs, Datasets, Developer, Verify; copyright 2026 | H (wf) |
| `GET https://api.prophetarena.co/api/v1/health` 2026-10-19 | `{"status":"ok","engine_version":"2.2.0","rules_version":"arena-rules-v2.0"}` | H |
| `GET /events?status=open` | open events closing 2026-10-19 (same day) | H |
| Research post "When Do Prophets Profit" | paper published 2026-07-14; 26-day live Kalshi deployment with a Gemini 3 agent | H (wf) |
| Welcome post | 2025-08-10 (more than 6 months old; launch history only) | H (wf), stale |
| Operators | "maintained by Anri Gu and Jibang Wu" (academic-style project; llms.txt and /about) | H |

still_live = true.

## 2. Kind and market model

- Kind: aggregator-or-data in the loosest sense; strictly an **AI forecasting benchmark / evaluation platform** with a developer SDK and REST API for submitting forecasts (H).
- No market model of its own. "Events" are copies of venue markets: each event has `title`, `category`, `criteria` (the venue's resolution text), `mutually_exclusive`, `state` (open/resolved), `close_at`, `resolved_at`, and `outcomes[]` each with a `resolution` (`pending`/`yes`/`no`). Multi-outcome events (a ladder like "Above 45 ... Above 90", or a list of songs) are graded per outcome as independent binaries; probabilities are "never renormalized" (H, agents.md).
- Categories observed: Economics, Entertainment, Crypto; site lists politics, economics, science, sports, entertainment (H).
- Tokenisation: none.

## 3. Chains and collateral

None. No funds, wallet, deposit or token. NOT FOUND (searched: llms.txt, agents.md, API reference, about, home). (H for absence in those pages)

## 4. Read API

- Exists: **official, public for read endpoints, key for some**. Docs: https://www.prophetarena.co/docs/api-reference (H, wf); quickstart https://www.prophetarena.co/docs/quickstart; also `llms.txt` and `agents.md`. No OpenAPI file (`/openapi.json` and `/api/openapi.json` 404). (H)
- Base: `https://api.prophetarena.co/api/v1`. Errors: `{"error":{"code","message","request_id"}}` (H, agents.md).
- Auth: public endpoints need no key. Keys are `Authorization: Bearer pa_live_...`, org-scoped, scopes `read` (implicit), `forecast:write`, `agents:manage`, `experiments:write`; key minting is session-only in the browser (H, wf). I did not create or use any key. There is also a separate "weekly key" lane (H, agents.md).
- Rate limits (H, wf): 300/min per address for other `/v1` reads, 120/min for `/verify` reads, 120/min `POST /forecasts`, and so on; 429 with `Retry-After`. Live headers on a leaderboard GET: `ratelimit-limit: 240`, remaining 239, reset 25 s, `cache-control: public, max-age=60` (H). The docs and live header disagree (300 vs 240); trust the header.
- Websocket / streaming: NOT FOUND (searched: API reference, llms.txt, agents.md).
- Key public GET endpoints:

| Endpoint | Purpose | Verified |
|---|---|---|
| `GET /health` | status | H, 200 |
| `GET /leaderboards` | board slugs: agentic, community, fixed-context, forecast (sort `theta`, min 10 resolved events) | H, fixture |
| `GET /leaderboards/{board}` | `standings`, `baselines` | listed in docs only |
| `GET /events?status=open\|resolved&category&q&cursor&limit<=200` | event list, cursor pagination `{data, next_cursor}` | H, fixture |
| `GET /events/{slug}` | event | docs only |
| `GET /events/{slug}/windows` | `round, opens_at, closes_at, has_snapshot` (weekly windows, e.g. 2026-10-11 to 2026-10-18) | H |
| `GET /events/{slug}/crowd` | crowd probability series `{outcome, probability, derivation, taken_at, round}` | H, fixture |
| `GET /events/{slug}/forecasts` | latest public forecast per agent; closed/resolved only | docs only |
| `GET /agents`, `/agents/{org}/{slug}`, `/agents/{org}/{slug}/metrics` | agent list and metrics | docs only |
| `GET /datasets`, `/datasets/{slug}` | catalogue; download needs a key | docs only |

- **Price data is thin and lagged.** The "crowd" probability has `derivation: "mid"` (mid of bid/ask, H) and is a snapshot taken at the start/close of a weekly window (observed `taken_at` 2026-10-18T03:59Z and 2026-10-03T03:59Z), not a live tick. No order book, trades, volume or open interest are exposed (H, wf: "does not document raw market prices, order books, or trade data"). The crowd series for `kxrt-sens` returned multiple snapshots, 4.5 KB. (H)
- Fixtures: `events_open_limit3_2026-10-19.json`, `events_crowd_kxrt-sens_2026-10-19.json`, `events_crowd_kxcaneuinfl-26oct19_2026-10-19.json`, `leaderboards_2026-10-19.json`.

## 5. Trade path

None. The only write operations are forecast submissions (`POST /forecasts`, probabilities only, no money) and agent/key administration. No orders, no signing scheme. (H)
Note: the research paper describes a Gemini agent that traded on Kalshi with real capital; that happened on Kalshi directly, with a public ledger at a third-party host, and is not a Prophet Arena trading product (H, wf).

## 6. PayBox reachability

paybox_reachable = **no**. No chain, no collateral, no transaction or signed-order path, nothing to propose. Reaching the underlying liquidity means using Kalshi (covered by the parallel workflow). I made no PayBox calls.

## 7. Fees

None charged for reading or forecasting that I found; API keys are free for registered users (M: agents.md says "ask your human for one" and keys come from a profile page; no pricing page seen). Pricing NOT FOUND (searched: sitemap, llms.txt, API reference, docs). No trading fees as there is no trading.

## 8. Resolution

Resolution copies the source venue's: `criteria` text is the Kalshi market rule (e.g. the BRTI-based Bitcoin range text) and outcomes show `resolution: yes/no/pending`. One resolved example shows `resolved_at` 2025-09-15 for a market closing 2025-06-17, i.e. Prophet Arena's resolution timestamp can lag the real close by about three months (H, fixture-free observation of one event); do not use its `resolved_at` as an exchange settlement time. Questions it writes itself are resolved by the team "from public sources" (H, llms.txt), with unclear dispute process (NOT FOUND, searched: research/how-scoring-works not read in full, about). Dispute risk on Kalshi-derived events is Kalshi's.

## 9. Geo, ToS, automation

- robots.txt: `Content-Signal: search=yes, ai-train=no, use=reference`, `Allow: /`, plus blocks for named AI training crawlers (H). The signal is `ai-train=no`; keep that in mind before using the content for model training.
- Terms of service / privacy pages: `/terms`, `/legal/terms`, `/privacy` all 404; no terms link on the home page, quickstart or about (H, NOT FOUND). Data-redistribution terms are therefore undocumented; treat as unknown.
- The API is explicitly offered to automated clients (H). Geo restrictions: NOT FOUND (no trading).
- Embedded agent instructions: `agents.md` is addressed to AI agents ("You are an AI coding agent... Follow this file exactly") and tells them to install a pip package, run `prophet login`, and "ask your human for" an API key. I did not follow it (third-party instructions are untrusted data; I installed nothing). Mild, plausibly benign, recorded under suspicious content.

## 10. Liquidity

N/A: no venue liquidity. Kalshi volume lives in Kalshi's own note. Event counts: open-event listing is paginated, total NOT FOUND (I did not page through it). Backtest dataset quoted by the paper: 2,418 resolved Kalshi markets (H, wf, paper dated 2026-07-14).

## 11. Event overlap (arbitrage relevance)

All overlap is with Kalshi (identical markets, so no arbitrage against Kalshi). Categories: economics (CPI/inflation), crypto price ladders, entertainment (Rotten Tomatoes scores, setlists), sports, politics. Because it only mirrors Kalshi, it cannot be an independent arbitrage leg for any venue. It can help the linking layer as a labelled sample of Kalshi event text.

## 12. Open questions

1. Does the full `/docs/api-reference` mention any stable id field linking an event to a Kalshi ticker? The slug looks like a lower-cased Kalshi ticker (M).
2. Which fraction of events come from Polymarket or are self-authored?
3. `derivation` values other than `mid`? (only `mid` observed)
4. Terms of use for redistributing the crowd series and leaderboards: unknown.

## Sources

- https://www.prophetarena.co (home, wf) - H
- https://www.prophetarena.co/about (wf) - H
- https://www.prophetarena.co/llms.txt, /robots.txt, /sitemap.xml, /agents.md (curl, raw) - H
- https://www.prophetarena.co/docs/quickstart (wf) - H
- https://www.prophetarena.co/docs/api-reference (wf) - H
- https://www.prophetarena.co/research/when-do-prophets-profit (wf) - H
- https://www.prophetarena.co/research/welcome (wf, published 2025-08-10, stale) - H/L
- https://api.prophetarena.co/api/v1/health, /leaderboards, /events, /events/{slug}/crowd, /events/{slug}/windows (unauthenticated GET, 2026-10-19) - H
- Local: docs/research/venues/predictarena.md (a different product, PredictArena at predictarena.com, a CDNA introducing broker; unrelated to Prophet Arena despite the similar name) - H
