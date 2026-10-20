# OpticOdds - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages and developer docs, public unauthenticated GETs (docs `.md` pages, `llms.txt`, sitemap, and two un-keyed API calls that returned 401). No account, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party/vendor pages were treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted before my first search ran, so there is no independent (third-party) corroboration. Everything below comes from first-party OpticOdds pages.

Tags: **H** = read first-hand in a primary source this session; **M** = small-model page summary or my inference; **L** = weak/stale. Note: WebFetch returns a small-model summary, so where I only have WebFetch (not the raw `.md` I downloaded with curl) I tag H only if the raw text agrees.

---

## 0. Bottom line

1. **Not a venue. It is a paid B2B odds/data aggregator (H).** OpticOdds does not run a market, hold funds or settle anything. It normalizes odds and order books from 200+ sportsbooks and ~21 prediction-market/exchange venues into one API. Its role here is a **signal and cross-venue-matching source**, not a trading leg.
2. **Still live (H).** Developer docs refreshed 2026-10-08 (sportsbooks page "Refreshed October 2026"), prediction-market-maker guide updated 2026-07-30, non-sport guide updated 2026-08-07, main site sitemap lastmod 2026-08-28, footer (c) 2026.
3. **The valuable bit for this project: `canonical-events`.** A server-side matcher that groups the same event across **Kalshi and Polymarket** (non-sport) under `canonical_id` / `canonical_market_id` with a 0-1 `confidence`. That is exactly the market-linking problem in docs/market-linking-design.md, offered as a paid feed. Matching only covers 2 platforms (Kalshi, Polymarket); sports odds cover ~21.
4. **Cannot be used without a commercial key.** Every endpoint returns 401 "API key is required" unauthenticated. Pricing is gated behind a sales form. Non-sport prediction-market endpoints are additionally "enabled per API key" (403 otherwise). Per-key access, unknown cost.
5. **No trade path, no wallet path (H).** It is read-only data. It returns native exchange ids (`source_ids`) so a caller can route orders on the real venue.
6. **adapter_priority = P2 (signal-only).** High-quality, low-latency, multi-venue normalized books and a ready-made cross-venue matcher, but (a) paid/gated, (b) no independent liquidity, (c) the underlying venues (Kalshi, Polymarket, Limitless, Opinion...) are already covered directly by other adapters. Worth integrating only as an optional enrichment/validation source for market linking, not as a priority.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://opticodds.com/` | Product site: Sports Betting API, Odds Screen, Bet Builder/SGP, Copilot, "AI Connector (MCP)"; claims 200+ companies and 200+ sportsbooks; "(c) 2026" | H (WebFetch summary) |
| `https://developer.opticodds.com/sitemap.xml`, `/llms.txt` | 200; llms.txt lists guides "Refreshed October 2026" | H |
| Doc front-matter `updatedAt` | sportsbooks.md 2026-10-08; non-sport-prediction-markets.md 2026-08-07; opticodds-for-prediction-market-makers.md 2026-07-30 | H |
| `https://opticodds.com/sitemap.xml` | contains lastmod 2026-08-28 entries | H |
| `GET https://api.opticodds.com/api/v3/sportsbooks` and `/prediction-markets/categories` (no key) | HTTP 401 JSON `{"error":"API key is required"}`; API is up | H |

Verdict: still_live = true. Nothing older than ~3 months used.

---

## 2. Kind and market model

- **Kind: sports-betting / prediction-market data aggregator and trading-tools vendor (H).** Products: odds API (REST + SSE push; also queue/push delivery per homepage), Odds Screen, SGP/bet-builder pricer, Copilot (automated odds creation and settlement for operators), injuries, results/grader, MCP connector. Customers named on the homepage include Kalshi, PrizePicks, Stats Perform, Dabble, Sportsbet.io (H, homepage; testimonials are marketing).
- **No market model of its own.** It relays the venues' models:
  - Sports flow (`/fixtures/odds`, `/stream/odds`): each selection is an `Odd` with decimal `price` (best price), `limits.max` (top-of-book size), `order_book` as `[[price, size], ...]` in **decimal odds**, and `source_ids {market_id, selection_id}` for the native exchange (H, PM-maker guide). Kalshi example: `market_id` = ticker `KXNBAGAME-25NOV30TORNYK-NYK`, `selection_id` = `yes`/`no`; Polymarket: CLOB token id.
  - Non-sport flow (`/prediction-markets/*`, `/stream/prediction-markets`): per-market full order-book snapshots with per-outcome `best_bid`, `best_ask`, `spread`, `last_trade_price`, `tick_size`, `bids[]`, `asks[]` as `{price (0-1), size}`; binary markets expose `yes` and `no` outcome books (H, streaming guide).
- **Venues covered, sports flow (H, sportsbooks.md "Prediction Market Reference Table", Oct 2026):** betdex, betfair_exchange (+ lay, AU, AU lay), draftkings_predictions, fd_predicts, gemini_exchange, kalshi, limitless_exchange, matchbook_exchange, novig, opinion_labs, orbit_exchange, polymarket, polymarket_usa, prophet_x, robinhood, sx_bet, tailgate_exchange, underdog_predictions. (The PM-maker guide's own shorter table, updated 2026-07-30, lists 11; the Oct sportsbooks table is the newer.)
- **Venues covered, non-sport flow (H):** only `kalshi` and `polymarket`.
- **Scope caveat (H):** the PM-maker guide says "OpticOdds currently supports sports markets on prediction market exchanges ... Politics / Entertainment / Economics / Crypto: Coming soon" - this is **stale/contradicted** by the newer (2026-08-07) non-sport guide, which says politics, economics, finance, crypto, tech, culture, climate, health, geopolitics, companies are covered for Kalshi and Polymarket. Treat the non-sport guide as authoritative, but its live coverage per category is unverified ("a category may contain zero events").

Fixture samples (documentation examples, NOT live responses) are in `docs/research/fixtures/opticodds/`.

---

## 3. Chains and collateral

None. OpticOdds holds no funds and has no chain presence. Collateral/chain are those of the underlying venues. Its `size` fields are "in the exchange's base currency" (USD for Kalshi, USDC for Polymarket, GBP for Betfair - per guide example) (M). No conversion layer is documented: a consumer must normalize currencies itself.

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Docs | https://developer.opticodds.com/ (ReadMe-style; `llms.txt` index; every guide also available as `.md`) | H |
| Base URL | `https://api.opticodds.com/api/v3` (v3; migration guide from v2 exists) | H |
| Auth | API key, header `X-Api-Key` (recommended; non-sport guide says do NOT use query param because keys leak into logs) or query param `key`. Without key: 401 `{"error":"API key is required"}` | H |
| Access gating | Non-sport `/prediction-markets/*` "enabled per API key; 403 -> contact your OpticOdds representative" | H |
| Pricing | Not public. `https://opticodds.com/pricing` is a sales/demo form (company size, services). Developer FAQ mentions a free trial for new users (M, WebFetch of docs index). Cost: NOT FOUND | H/M |
| Rate limits | Stated only in the PM-maker guide: **streaming 250 requests per 15 s; historical endpoints 10 requests per 15 s**. General REST limit: NOT FOUND (searched: authentication guide, reference index, llms.txt). Max 5 `sportsbook` values per odds request; `canonical_id` / `event_id` max 25 per request | H |
| Streaming | **SSE, not WebSocket** (H). `/stream/odds/{sport}`, `/stream/results/{sport}`, `/stream/futures/{sport}`, `/stream/prediction-markets`. Sports stream: group up to 10 leagues per connection; `last_entry_id` resume supported. PM stream: one `category` per connection (required), optional `platform=kalshi|polymarket`, `source_event_id`, `source_market_id`, `canonical_id`; events `connected` (`retry: 5000`), `ping` ~5 s, `snapshot` (full book, replace not patch); **no replay** (`entry_id` empty); reconnect if no traffic ~15 s | H |

Key endpoints:

- Discovery: `GET /sports`, `/leagues`, `/sportsbooks`, `/sportsbooks/active`, `/markets`, `/markets/active`, `/markets/settleable`, `/market-types`, `/fixtures`, `/fixtures/active` (H, reference index).
- Prices/books (sports): `GET /fixtures/odds?fixture_id=..&sportsbook=kalshi&sportsbook=polymarket&odds_format=DECIMAL|PROBABILITY|AMERICAN..&exclude_fees=true|false` (H). `odds_format=PROBABILITY` exists, useful for normalizing.
- Historical: `GET /fixtures/odds/historical` - "full tick-level price history" (H).
- Results/settlement: `/fixtures/results`, `/grader/odds`, `/markets/settleable`, `/stream/results/{sport}` (H, listed; response shapes not read).
- Non-sport PM: `GET /prediction-markets/categories` (no params; returns `{"data":["politics","economics","finance","crypto","tech","culture","climate","health","geopolitics","companies","other"]}`), `/prediction-markets/canonical-events/ids?category=..`, `/prediction-markets/canonical-events?canonical_id=..` (only events spanning >= 2 platforms are returned), `/prediction-markets/events/ids`, `/prediction-markets/events?event_id=platform:source_event_id`, `/stream/prediction-markets?category=..` (H).
- Trades: **no trade-tape endpoint documented** for PM data; only `last_trade_price` per outcome in the snapshot (H). Per-trade history: NOT FOUND.
- Resolution of non-sport markets: `/events` returns title/description/category/markets/question only; **no resolution status or outcome field is documented** (H via WebFetch of reference page). The adapter must take resolution from Kalshi/Polymarket directly.

Quirks worth recording for the adapter (H unless stated):
- `canonical_id` in the PM stream is **"not populated"/empty in practice** - join via REST canonical-events (the streaming guide itself says so; the OpenAPI example contradicts it).
- Sports prices are **decimal odds with fees included by default**; `exclude_fees=true` for raw exchange prices. The fee model is not documented (which venue fee formula is applied, taker vs maker): NOT FOUND.
- Sports-flow `price` = decimal odds (e.g. 1.31) while PM-stream books are probability dollars 0-1. Two conventions in one API.
- `order_book` first tuple is best price; sizes in exchange base currency.

Fixtures: no unauthenticated 2xx exists. I saved the two 401 responses plus excerpts of the vendor docs' example payloads (clearly marked as documentation, not observed live data).

---

## 5. Trade path

**None (H).** OpticOdds is read-only data. It returns native identifiers (`source_ids`, `source_market_id`, Polymarket CLOB token id, Kalshi ticker) "so you can route orders directly" on the exchange's own API (guide wording). Copilot and the SGP pricer are operator tooling (odds creation/settlement/pricing), not order placement on exchanges. Placing a trade requires the underlying venue's own adapter (Kalshi API key + RSA signing, Polymarket CLOB L1/L2 + EIP-712, etc. - covered by the parallel workflow).

## 6. PayBox reachability

- **paybox_reachable = no** as a trading venue (nothing to sign or send).
- It is a paid API: payment is by commercial contract/invoice via a sales form (M). I found no x402/402 flow; no 402 was observed (401 only). Whether PayBox `use_service` could pay for it: NOT FOUND, not tested (would require a key; out of scope).
- A key would have to be provided as a secret to the plugin (read-only, no money-moving).

---

## 7. Fees

- OpticOdds subscription fee: not public (sales-gated). NOT FOUND.
- Underlying venue fees: relayed inside `price` by default; `exclude_fees=true` removes them. Formula and which side pays are not documented (H that the flag exists; fee model NOT FOUND). For an arbitrage scanner, take fees from each venue's own adapter and set `exclude_fees=true` to avoid double counting.

## 8. Resolution mechanism and dispute risk

OpticOdds does not resolve anything. Resolution = that of Kalshi/Polymarket/etc. The risk specific to OpticOdds is the **matching risk**: `canonical_market_id` equality is asserted to mean "these two markets settle on the same thing" (H, guide), but the same guide gives a `confidence` score and recommends gating (e.g. >= 0.95) because "lower values indicate a fuzzier match". Kalshi and Polymarket frequently differ in resolution source/cutoff/ambiguity rules; a high-confidence title match is not proof of identical settlement. The project's own market-linking design should still compare rules text (the `/events` endpoint exposes `description` which often carries the rules, example shows it truncated with "..." (H)).

## 9. Geo / ToS / automation

- The only ToS text I could read (`https://opticodds.com/terms-of-service`, WebFetch summary, M) appears to be the website/consumer Odds Screen terms and contains: "You may not use the Service for any revenue-generating endeavor or commercial enterprise." It excerpted only through Section 5 (Subscriptions). Whether an enterprise API contract overrides this, and whether redistribution of the data or use in a trading/arbitrage bot is allowed: **NOT FOUND**. Must be settled by contract before any production use. Redistribution of the data (e.g. showing OpticOdds-derived prices in a shared PayBox plugin UI) is a likely licensing issue.
- Geo restrictions on the API: NOT FOUND. It is B2B; the data is odds, not wagering.
- Automation: API and SSE are designed for bots (guide even has market-making and arbitrage examples) (H).

## 10. Liquidity

OpticOdds has no liquidity of its own. Volume/OI/TVL: N/A. (Homepage claim "200+ sportsbooks / 200+ companies" is marketing, M.) The depth it relays is that of the underlying venues, e.g. the guide's illustrative Kalshi book `[[1.31,108.25],[1.293,91866.72],...]` is a documentation example, not a market statistic (L).

## 11. Event categories and overlap

- Sports (all major leagues, ML/spread/totals/props): Kalshi, Polymarket, Limitless, Opinion, SX Bet, Novig, BetDEX, Betfair, Matchbook, Sporttrade-type exchanges, DraftKings/FanDuel/Underdog/Robinhood/Gemini predictions, plus 200+ traditional sportsbooks. This is the best arbitrage surface: **exchange prices next to sharp bookmaker prices** (Pinnacle-style fair value) - a useful "signal" for the fair-value model.
- Non-sport (politics, economics, finance, crypto price levels, tech, culture, climate, health, geopolitics, companies): Kalshi and Polymarket only, with canonical matching.
- It does **not** cover XO Market, Quotient, Manifold, PredictIt, Myriad, Trueo (not in the sportsbook list; Limitless and Opinion Labs are listed for sports) (H, absence in the Oct 2026 list).

## 12. Shared liquidity

N/A (not a venue). It is a read-through of venues that are already separate adapters. **Adding it as a "leg" would double-count** Kalshi/Polymarket/Limitless/Opinion/SX Bet etc. It must be modelled as a signal/enrichment source, never as an independent arbitrage leg. Also note it is a derived feed with unknown latency versus the venue's own API (a latency field exists via `include_latencies=true`; "sub-second" is a marketing claim, M).

---

## 13. Adapter spec (if integrated)

Role: `source_kind = "aggregator-signal"`, read-only, never a leg.

1. Config: `OPTICODDS_API_KEY` (from PayBox secret store, never logged), header `X-Api-Key` only.
2. Link seeding: poll `/prediction-markets/categories` -> `/canonical-events/ids?category=` -> `/canonical-events?canonical_id=` (batches of 25). Store `{canonical_id, canonical_market_id, platform, source_market_id, confidence}`. Use as *candidate* links into the market-linking pipeline; require own rules-text verification (do not auto-trust >= 0.95).
3. Price signal: SSE `/stream/prediction-markets?category=X&platform=...` (one connection per category); keep latest snapshot per `market_id`; derive mid/spread; flag staleness at >15 s silence. Reconnect re-hydrates, no gap recovery.
4. Sports fair value: `/fixtures/odds` with `sportsbook=` set to sharp books plus exchanges, `odds_format=PROBABILITY`, `exclude_fees=true`; compare exchange price against sharp-book consensus.
5. Compliance gate: do not ship until the contract confirms data use and redistribution rights.

## 14. Open questions

1. Price, trial terms and whether a key with PM endpoints enabled is obtainable. Is the free trial real?
2. General REST rate limit and SSE connection caps.
3. Whether data may be used in a trading bot / redistributed (enterprise contract vs the web ToS).
4. How `confidence` is computed; how many canonical events actually exist per category today (cannot be sampled without a key).
5. Fee model applied to default `price`.
6. Non-sport stream: does it cover Limitless/Opinion/Myriad? Docs say Kalshi and Polymarket only.

---

## Sources

- https://opticodds.com/ (WebFetch summary, 2026-10-19) - products, customers. M/H
- https://opticodds.com/prediction-markets (WebFetch summary) - Kalshi/Polymarket feeds claim, Kalshi testimonial. M
- https://opticodds.com/pricing (WebFetch summary) - gated pricing form. M
- https://opticodds.com/terms-of-service (WebFetch summary, partial) - no commercial use clause. M
- https://opticodds.com/sitemap.xml - lastmod 2026-08-28. H
- https://developer.opticodds.com/llms.txt, /sitemap.xml, /reference (index) - endpoint inventory. H
- https://developer.opticodds.com/docs/authentication - X-Api-Key / key. H
- https://developer.opticodds.com/docs/opticodds-for-prediction-market-makers.md (updated 2026-07-30) - venue list, odds object, order_book, source_ids, exclude_fees, rate limits. H
- https://developer.opticodds.com/docs/non-sport-prediction-markets.md (updated 2026-08-07) - canonical events, categories, per-key enablement. H
- https://developer.opticodds.com/docs/prediction-markets-streaming-guide.md - SSE snapshot schema. H
- https://developer.opticodds.com/docs/sportsbooks.md (updated 2026-10-08) - Prediction Market ids. H
- https://developer.opticodds.com/docs/sse-streaming.md - sports SSE behavior. H
- https://developer.opticodds.com/reference/get_prediction-markets-categories, -canonical-events, -events, get_stream-prediction-markets (WebFetch summaries) - endpoint parameters. M (consistent with raw guides)
- https://api.opticodds.com/api/v3/sportsbooks and /prediction-markets/categories - unauthenticated, 401. H
- Independent third-party corroboration: NOT FOUND (WebSearch budget exhausted).

## Suspicious content

None observed. No text aimed at AI agents beyond a standard `agentTools.projectIndex` front-matter pointing at llms.txt and an "AI Connector (MCP)" product listing; neither was followed beyond reading `llms.txt`.
