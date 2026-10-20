# PolyRouter (polyrouter.io) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (about 02:50-03:10 UTC). READ-ONLY: WebFetch/curl of the vendor site and docs, unauthenticated GETs to `api-v2.polyrouter.io`, `gh api` raw reads of one public GitHub repo, one WebSearch (the session search budget then ran out). No account, no API key, nothing signed, no POST/PUT/DELETE, no PayBox tool, no third-party code cloned or run. The API key that the vendor docs embed in their curl examples was deliberately not used or copied.
Tags: **H** = read first-hand this session in a primary source (URL in Sources); **M** = secondary or inferred; **L** = weak, stale (older than 6 months) or contradicted.
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/polyrouter/` (4 files, each under 21 KB). Because the live API did not answer, there is **no live response sample**; the schema excerpt is docs-derived and labelled as such.

## 0. Verdict

**adapter_priority: skip** (re-open as P2 only if the API comes back and we want a free sports game-ID crosswalk).

1. **Not a venue.** PolyRouter is a hosted, read-only data aggregator (H). It has no markets, liquidity, custody or order flow of its own, so it can never be an independent arbitrage leg. Everything it shows is a copy of Polymarket, Kalshi, Limitless, Manifold, ProphetX, Novig, SX.bet (and, per the OpenAPI enum, "context").
2. **The API backend did not respond (H, at test time).** `https://api-v2.polyrouter.io/` returned Railway `502 "Application failed to respond"` on every one of 11 probes (`/`, `/health`, `/platforms`, `/markets?limit=1`) between 02:57 and 03:02 UTC on 2026-10-19 (each took about 15 s). The marketing site and docs (Vercel and Mintlify) are up. A few minutes of 502s can be transient, so confidence that it is dead is medium; confidence that it was down for us is high.
3. **Quiet maintenance (H).** Newest changelog entry is v2.0.0 on 2026-01-06 (9 months old, L/stale). The only public repo (`fieldviolence/polyrouter-mcp`, 31 stars) was last pushed 2026-01-11. The OpenAPI spec has items the changelog never mentions (`/search`, `/historical-orderbook`, platform `context`), so something changed after January, date unknown.
4. **No trade path (H).** The vendor's own agent skill says "Do not use PolyRouter for: placing trades, executing orders, or managing user accounts (it's read-only)". The companion MCP trades directly on Kalshi and Polymarket with the user's own credentials, not through PolyRouter.
5. **Gated by an API key from a browser sign-up (H).** Every endpoint needs `X-API-Key`. The key is issued on polyrouter.io; I did not sign up. Free, 100 requests/min.
6. **What is worth borrowing** (design only): the normalised `Market` field list (`fee_rate`, `trading_fee`, `withdrawal_fee`, `resolution_criteria`, `resolution_source`, `trading_start_at`, `trading_end_at`, `liquidity`, `open_interest`), the yes/no orderbook shape with `tick_size`/`min_order_size`/`neg_risk`, and the sports game ID `{AwayTeam}v{HomeTeam}{YYYYMMDD}@{LEAGUE}` plus the `/league-info` team-ID crosswalk. Our own adapters for the same venues make the dependency unnecessary.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Marketing site | `https://www.polyrouter.io/` 200 (Vercel, Next.js); footer "© 2025 PolyRouter", "Part of Context Markets", links to docs, Discord, X; no pricing, terms, privacy, status or robots page (all 404) | H |
| Docs | `https://docs.polyrouter.io/` 200 (Mintlify), `llms.txt`, `openapi.json` 200, "Open Beta: PolyRouter is free and open to everyone" | H |
| API v2 | `https://api-v2.polyrouter.io/{,health,platforms,markets?limit=1}` all 502 "Application failed to respond", Railway edge `server: railway-hikari`, about 15 s each, 2026-10-19 02:57-03:02 UTC (fixture `api-v2-502-probe-2026-10-19.json`) | H |
| API v1 (legacy) | `api.polyrouter.io` CNAME to a Supabase project; TLS handshake fails. Changelog told users to move to v2 on 2026-01-06 | H |
| Changelog | v0.1.0 2025-10-21 (beta launch), v0.2.0 2025-10-28, v0.3.0 2025-11-05, v0.4.0 2025-12-09, v2.0.0 2026-01-06 (last entry) | H |
| GitHub | `fieldviolence/polyrouter-mcp` created 2026-01-07, last push 2026-01-11, MIT, not archived, 1 open issue | H |
| Third-party mention | Interexy guide "Updated June 12, 2026" still lists it as open beta: "no SLA, future pricing unknown", "Not suitable for high-traffic production deployments without custom arrangement" | M |
| QuickNode directory | says "launched in 2023", "1,000 to 10,000 users"; contradicts the changelog (beta launch 2025-10-21) | L |

## 2. Kind and market model

- **Kind** (H): hosted read-only aggregator / normalised data API. Free open beta. Sub-brand of "Context Markets" (footer text; Prediction Index lists Context as a live Base-chain binary AMM project, M, from an existing repo fixture; context.markets is a JS single-page app and I read no docs for it).
- **Market model**: passthrough and normalised. `Market.market_type` enum `binary | categorical | scalar`; `status` enum `open | paused | resolved | cancelled`; `outcomes[{id,name}]`; `current_prices` is a map keyed by outcome id to `{price, bid, ask}` with prices as 0-1 floats (H, OpenAPI). Order book vs AMM vs parimutuel is not a PolyRouter concept; it depends on the source venue (`metadata.ammType`, `metadata.clobTokenIds`, `metadata.conditionId` exist for Polymarket-style tokens).
- **Order book shape** (H, OpenAPI `OrderbookData`): `{market_id, platform, timestamp, yes:{bids,asks,depth}, no:{bids,asks,depth}, metadata:{min_order_size,tick_size,neg_risk}}`, each level `{price,size}`. How the `no` side is derived (mirror of `yes` or the venue's own NO token book) is not documented (NOT FOUND, searched: orderbook page, OpenAPI descriptions).
- **Outcome tokenisation**: not exposed beyond `clobTokenIds` / `conditionId` in `metadata` (Polymarket).

## 3. Read API

**Docs**: https://docs.polyrouter.io/ (OpenAPI at `/openapi.json`, split specs under `/openapi/*.json`, `llms.txt`, agent skill at `/.well-known/agent-skills/polyrouter/skill.md`, docs MCP card at `/.well-known/mcp/server-card.json`).
**Base URL** (H): `https://api-v2.polyrouter.io` (v1 `api.polyrouter.io` is gone).
**Auth** (H): `X-API-Key` header on every route, key from polyrouter.io sign-up (not performed). 401 is the documented unauthorised response. The homepage "No API keys required" tester works through the site's own server-side key or a legacy upstream, not as keyless API access (M, inferred from the site bundle: it embeds `upstreamBase` `https://api.polyrouter.io/functions/v1`, a Supabase URL and a Supabase anon token; none used).
**Rate limit** (H): 100 requests/min for all users ("Need more? reach out on X"). Interexy says 10 req/min (M); the official figure wins but re-measure. No 429 semantics, no rate-limit headers documented (NOT FOUND, searched: introduction, pagination, OpenAPI).
**WebSocket / streaming**: NOT FOUND (searched: llms.txt, OpenAPI, skill.md, docs index). One search summary claimed "real-time WebSocket streams" (L, unverified). Plan on polling.
**Pagination** (H): cursor (`limit`, `cursor`; response `pagination:{total,limit,has_more,next_cursor}`). The max `limit` is inconsistent across the vendor's own pages: 25 (pagination guide, skill.md, changelog v0.3.0), 250 (changelog v0.4.0), 100 (OpenAPI `/markets`), 1000 for `/trades`, 5000 for `/price-history`, 500 for `/historical-orderbook`.

| Endpoint | Coverage notes (H, OpenAPI + docs) |
|---|---|
| `GET /markets` | params `platform` (one of `polymarket,kalshi,limitless,manifold,context`; single value only), `status` (`open,closed,resolved,paused,unopened`), `query`, `include_raw`. Kalshi MVE markets are filtered out. The enum does **not** include prophetx/novig/sxbet, so "7 platforms" holds only for the sports routes (M, my reading of the spec) |
| `GET /markets/{id}` | single market |
| `GET /markets/{id}/orderbook` | Polymarket, Kalshi, Limitless, Manifold only; platform auto-detected from id if omitted |
| `GET /trades?market_id=` | market trade tape; `takerOnly` Polymarket only; docs say Kalshi and Polymarket |
| `GET /price-history` | OHLC for up to 10 market ids; interval 1, 60, 1440 minutes; with `bidAsk` and `openInterest` fields |
| `GET /historical-orderbook` | snapshots every 30 minutes, Polymarket and Kalshi only |
| `GET /events`, `/events/{id}`, `/series`, `/series/{id}` | Polymarket and Kalshi only |
| `GET /search?q=` | keyword search across platforms |
| `GET /list-games`, `/games/{id}` | NFL, NBA, NHL, MLB; per-game markets from polymarket, kalshi, prophetx, novig, sxbet; `market_type` moneyline/spread/total/prop; `odds_format` american/decimal/probability |
| `GET /list-awards`, `/awards/{id}`, `/list-futures`, `/futures/{id}` | Polymarket and Kalshi only |
| `GET /league-info` | canonical PolyRouter team IDs with per-platform IDs |
| `GET /profile/info`, `/profile/trades` | Kalshi and Polymarket user lookups |
| `GET /platforms`, `/health`, `/` | per-platform `status` and `features` flags; API health |

**Resolution fields on `Market`**: `resolution_date`, `resolved_at`, `resolution_criteria`, `resolution_source`, `status` (H, schema). No oracle, dispute state or settlement transaction fields (NOT FOUND, searched: OpenAPI schemas).
**Cross-venue matching**: NOT FOUND (searched: llms.txt page list, OpenAPI paths). The only cross-venue join is the sports game ID and team crosswalk. There is no arbitrage, divergence or matched-market endpoint.
**Live response shapes**: could not be confirmed (API 502). The docs show one illustrative `/markets` payload (`markets[]` with `id`, `platform`, `title`, `current_prices.yes.price`, `volume_24h`, `status`); the vendor's own sample for "US recession in 2025?" shows Yes 0.065 / No 0.935 (H, but docs-only, 2025 data).

## 4. Trade path

None (H). PolyRouter exposes no order, cancel, balance or position routes in OpenAPI, and `skill.md` says it is read-only. The `polyrouter-mcp` repo adds "Trading (Optional)" tools (`preview_order`, `confirm_order`, `cancel_order`, `get_balance`, ...) that call the Kalshi SDK and the Polymarket CLOB client directly with credentials in a local `.env` (a Polymarket EOA private key and a Kalshi RSA key), bypassing PolyRouter (H, README, CLAUDE.md, `src/trading/unified.ts`, `polymarket.ts`). That pattern is incompatible with our non-custodial PayBox flow and is not a PolyRouter capability.

## 5. PayBox reachability

**No.** There is nothing to sign or propose: no chain, contract, order schema or payment rail (no x402/402 seen; not tested on a keyless route because there is none). The only credential involved would be a PolyRouter API key, which is a data-access secret, not a wallet action. Any trading on the underlying venues belongs to those venues' own specs (Polymarket on Polygon via signed orders, Kalshi centralised, SX.bet on its own rollup, etc.).

## 6. Fees

- PolyRouter charges nothing (H, "free and open to everyone"; "generous free tier" with no numbers on the site). No paid schedule published (NOT FOUND, searched: site, docs, `/pricing` 404). Future pricing unknown (M, Interexy).
- It reports venue fees as data: `fee_rate`, `trading_fee`, `withdrawal_fee` on `Market` (H, schema). Their values and units are undocumented (NOT FOUND) and could not be sampled.

## 7. Resolution mechanism and dispute risk

PolyRouter does not resolve anything. Resolution is whatever the source venue does (UMA/Polymarket, Kalshi rulebook, Manifold creator, etc.). Risk for us is **mapping and staleness risk**: the same event can carry different `resolution_criteria` per venue, PolyRouter's copy can lag or be wrong, and the vendor's docs contain obvious errors (see section 12). Treat PolyRouter `resolution_*` fields as hints, never as the contract.

## 8. Geo, ToS, automation

- No terms of service, privacy policy or acceptable-use page found (H: `/terms`, `/privacy`, `/tos`, `/pricing`, `/status` on www.polyrouter.io all 404; docs have none). Nothing about redistribution, caching, commercial use or automation (NOT FOUND, searched: site, docs, llms.txt).
- Geo: none stated for the API. The underlying venues keep their own geo rules.
- Support channels: Discord, X (`polyrouter`), the maintainer's GitHub account. No SLA (M, Interexy).
- Operational note: do not make any production decision depend on a free beta with a Railway-hosted backend that was down when tested.

## 9. Liquidity

PolyRouter has no TVL, volume or open interest of its own (not applicable). Usage claims are marketing only: "thousands of developers" (site, L), "1,000 to 10,000 users" (QuickNode, L). Per-market `volume_*`, `liquidity`, `open_interest` fields exist in the schema but returned nothing because the API was down.

## 10. Event coverage and overlap (where arbitrage could exist)

Everything it covers is an overlap with another venue by construction (H, docs):
- **US sports** (NFL, NBA, NHL, MLB): the strongest part. Game markets from Polymarket, Kalshi, ProphetX, Novig and SX.bet joined by a standard game ID (moneyline, spread, total, player props). Docs warn Polymarket and Kalshi game markets "often" appear only the day of the game, and ProphetX/Novig/SX.bet lack history.
- **Awards (MVP etc.) and futures (championship, division, conference)**: Polymarket and Kalshi.
- **Politics, macro, crypto-price, culture**: through `/markets` and `/events` for Polymarket, Kalshi, Limitless, Manifold (and "context"), with no matching layer, so any join is ours to build.
- Not covered: XO Market (no mention anywhere), Opinion, Predict.fun, Myriad, PredictIt, Trueo.

## 11. Shared liquidity

100% shared. PolyRouter is a read-through copy of its source venues; it is **not an independent arbitrage leg** and adds no independent price discovery. It is a convenience feed only.

## 12. Data-quality and trust notes

- Vendor docs contradict themselves: the platform blurbs in `skill.md` are shifted by one row against `index.md` (e.g. `skill.md` calls Limitless "Tournament-based sports, 30-50 options per game" and SX.bet "Play-money markets", while `index.md` gives the tournament text to ProphetX and play-money to Manifold, and `skill.md` calls Novig a "Decentralized exchange, on-chain order books", which `index.md` says of SX.bet). Max page-size figures disagree (section 3). Treat docs as approximate.
- The OpenAPI spec `info.description` lists only four platforms while the docs say seven; the sports routes cover five.
- QuickNode's "launched 2023" is wrong against the changelog (L).

## 13. If we ever integrate (conditional design)

- Use only as an optional, swappable sports crosswalk behind our adapter interface; poll `/games/{id}` at under 100 req/min per key and treat every price as a signal to be re-confirmed at the venue's own book.
- Need a vendor-issued key via a browser sign-up (a human step). Store it with PayBox `request_secret`-style handling, never in the repo.
- Health-gate on `GET /health` and `GET /platforms`; fall back to direct venue adapters on any non-200.

## 14. Open questions

1. Is the 502 persistent? Re-probe `GET https://api-v2.polyrouter.io/health` over a few days.
2. Does a fresh free key work today, and are the 100 req/min and 25-item page limits real? (Needs a human sign-up; not done.)
3. Real `fee_rate` / `trading_fee` units, `no`-side derivation of the orderbook, and freshness (`last_synced_at` lag) are unverified.
4. What is "context" (platform enum) and how does Context Markets relate to PolyRouter ownership? Only the footer link and the enum value were seen.

## 15. Suspicious content

- Docs embed a live-looking API key (UUID form) in curl examples on the index, introduction, pagination pages and in OpenAPI examples. Not used, not copied into any file (grepped fixtures for UUIDs: none).
- The marketing-site JS bundle ships a Supabase URL and anon JWT plus legacy upstream URLs. Not used or copied.
- Docs auto-publish agent-targeted files (`llms.txt`, an agent card, a skill file, an MCP server card). They contained ordinary usage guidance ("Get your API key from polyrouter.io"); no instruction to take any action outside the task was acted on.

## Sources

- https://www.polyrouter.io/ (H, homepage text, bundle strings; `/terms`, `/privacy`, `/tos`, `/pricing`, `/status`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` all 404)
- https://docs.polyrouter.io/index.md , `/api-reference/introduction.md`, `/api-reference/pagination.md`, `/api-reference/changelog.md`, `/api-reference/platforms/list-platforms.md`, `/api-reference/markets/get-market-orderbook.md` (H)
- https://docs.polyrouter.io/llms.txt , `/openapi.json` (v2.0.0), `/openapi/sports.json`, `/openapi/markets.json` (H)
- https://docs.polyrouter.io/.well-known/agent-skills/polyrouter/skill.md , `/.well-known/agent-card.json`, `/.well-known/mcp/server-card.json` (H)
- https://api-v2.polyrouter.io/ (H, 502 probes 2026-10-19; fixture `api-v2-502-probe-2026-10-19.json`)
- https://github.com/fieldviolence/polyrouter-mcp (H via `gh api`: repo metadata, commits, README, CLAUDE.md, `src/trading/*`)
- https://context.markets/ (H that it is a JS SPA with title only; no docs read)
- https://interexy.com/how-to-integrate-prediction-market-aggregators (M, vendor-neutral article updated 2026-06-12; read-only, 10 req/min, open beta, no SLA)
- https://www.quicknode.com/builders-guide/tools/polyrouter-by-polyrouter (L, directory listing; "2023" and user counts contradicted)
- WebSearch "PolyRouter prediction market API polyrouter.io" (M summary only; a "WebSocket streams" claim and a "pilot program" claim were not confirmed anywhere first-hand)
- Existing repo notes: `docs/research/10-aggregation-landscape.md` section 1.4, `docs/research/14-platform-of-platforms.md`, `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (Context entry)
- Fixtures: `docs/research/fixtures/polyrouter/openapi-schema-excerpt-2026-10-19.json`, `changelog-2026-10-19.md`, `docs-llms-2026-10-19.txt`, `api-v2-502-probe-2026-10-19.json`

Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere. One stray scratch file was written to `/tmp` by mistake during a probe and deleted at once; everything else stayed in the session scratchpad.
