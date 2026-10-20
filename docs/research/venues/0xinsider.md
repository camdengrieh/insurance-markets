# 0xinsider - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads and unauthenticated GETs to documented public routes only (generic User-Agent `insurance-markets-research/0.1`). No account, key, sandbox-key registration (the docs advertise a POST registration route; I did not call it), signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data. WebSearch was unavailable (session budget exhausted), so everything below rests on the official site, docs, OpenAPI spec and Wikidata, with no independent corroboration.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak/stale.

---

## 0. Bottom line

1. **0xinsider is NOT a venue.** It is a paid analytics / data product that reads public Polymarket activity (sports and esports only). It has no markets, no order book, no settlement, no collateral and no trading. Its own footer says it "places no orders" and is not a sportsbook or financial advisor (H, https://0xinsider.com/terms-of-service, via page summary; https://0xinsider.com/ ).
2. **Polymarket only.** `GET /api/v1/coverage` lists exactly one platform, `polymarket` (H, fixture `api-v1-coverage.json`). Every market object carries `platform: polymarket` and Polymarket CLOB token ids. Therefore it is **not an independent arbitrage leg**; it is a Polymarket-derived signal layer.
3. **adapter_priority = P2 (signal-only).** Possible value to the aggregator: wallet grades / smart-money flow / "sharp money" and a clean sports game-to-market mapping (home/away/draw legs with token ids). The price/book data is a cached copy of Polymarket's own CLOB, which the Polymarket adapter reads directly and for free. The signal layer needs a Pro key (US$99/mo, US$25/wk) and its terms bar redistribution.

---

## 1. Is it still live? (2026)

- Public API health: `GET https://api.0xinsider.com/api/v1/health` returned HTTP 200 `status: ok`, 33 background jobs healthy, 0 stale, on 2026-10-19 (H, fixture `api-v1-health.json`).
- Pick-of-the-Day ledger (public) has a sealed entry dated `pick_date: 2026-10-19`, `sealed_at 2026-10-19T07:00:53Z`, and 590 total entries (H, fixture `pick-of-the-day-ledger-last3.json`).
- Wikidata Q141539879 exists (label "0xinsider", description "analytics website for sports and esports prediction markets on Polymarket"), last modified 2026-09-23 (H, https://www.wikidata.org/wiki/Special:EntityData/Q141539879.json).
- Verdict: **live**, actively maintained (H). Age of the product: ledger starts 2026-06-23 (H), so the product is roughly four months old; no long track record (M).

## 2. Kind and market model

- Kind: **aggregator-or-data (analytics / signals)**. Not a market. N/A for binary/categorical/AMM/order book (H).
- Data model it exposes (mirrors Polymarket): market keyed by Polymarket `condition_id`; outcomes with Polymarket CLOB `token_id` (ERC-1155 asset id, decimal string); prices 0..1 USDC per share. Soccer 1X2 is modelled as independent YES legs with `side` home/draw/away, and `draw_offered` (H, https://0xinsider.com/llms-full.txt, `GET /api/v1/games`; sandbox fixture `sandbox-games.json`, which is synthetic sample data, not live).
- Sports and esports only (soccer, NFL, NBA, MLB, tennis, UFC, cricket, CS2, Valorant, Dota 2, LoL etc.). Search facets may include other categories, but the product's stated scope is sports and esports (H, https://0xinsider.com/llms.txt). Politics, crypto-price and macro are NOT covered as a stated product (M: absence of mention; not verified against live search results, which need a key).

## 3. Chains and collateral

None of its own. Underlying data is Polymarket on Polygon, USDC collateral (M: inferred from Polymarket token ids; the 0xinsider docs say "USDC per share"). H for the "USDC per share" wording (llms-full.txt).

## 4. Read API

- Exists: **official-authenticated** (public discovery/health/coverage/ledger only) (H).
- Docs: https://docs.0xinsider.com ; machine-readable https://0xinsider.com/llms-full.txt , https://0xinsider.com/llms.txt , https://0xinsider.com/agents.md ; OpenAPI 3.1 https://0xinsider.com/api/v1/openapi.json (2.1 MB, fetched, HTTP 200) (H).
- Base URL: `https://api.0xinsider.com` (H, discovery fixture). Keyless synthetic sandbox: `https://0xinsider.com/sandbox/api/v1/...` (H; responses carry `X-Oxi-Sandbox: true`).
- Public (no key) routes: `GET /api/v1` (route index), `/api/v1/health`, `/api/v1/coverage`, `/api/v1/pick-of-the-day/ledger[/{pick_id}]`, `/api/v1/openapi.json`, MCP handshake (initialize/ping/tools/list on `/api/v1/mcp`) (H).
- Key authenticated endpoints (Pro unless noted) (H, llms-full.txt and discovery `authenticated_routes`):
  - Markets: `GET /api/v1/markets/search`, `/markets/explore`, `/market/{condition_id}/snapshot` (outcome `current_price`, `top_of_book`, `liquidity.volume_usd/liquidity_usd/volume_24h_usd`, freshness flags), `/market/{condition_id}/candles`, `/market/{condition_id}/flow`, `/holders`, `/intel`, `/context.md`.
  - Games: `GET /api/v1/games`, `/games/{event_slug}` (both sides, live score, linked Polymarket markets and token ids).
  - Trades/signals: `/large-positions`, `/suspicious-trades`, `/insider-radar`, `/markets/sharp-money-flows`, `/markets/smart-money-flows`, `/leaderboard`, `/trader/{address}/...` (grades S..F), `/pick-of-the-day`, `/events/feed/since`, `POST /datasets/whale-trades`, exports.
  - `GET /api/v1/edge-hunter` (Max plan only, 403 `max_plan_required` for Pro).
  - Resolution: no dedicated resolution endpoint found; market `status` is `active` or `closed` ("closed once Polymarket has closed trading or the market has resolved") (H). NOT FOUND (searched: llms-full.txt market sections): any resolved-outcome/payout field for markets.
- Streaming: **SSE** live feed (`text/event-stream`, resumable via Last-Event-ID; event types such as `LargeTradeInsertedV2`, `wallet_grade_changed`); **no websocket** ("this is not WebSocket") (H, llms-full.txt). Webhooks (signed, with secret rotation) and remote MCP (Streamable HTTP) also exist (H).
- Auth: `Authorization: Bearer oxi_sk_live_...` API key or OAuth 2.1 + PKCE; key in query string is rejected; paid data needs an active Pro/Max plan, lapsed plan returns 402 `subscription_required` (H).
- Rate limits: Pro 100 req/min per user, Max 200; batch reads 25 items (2,500 / 5,000 item units per min); monthly quota Pro 500,000 and Max 2,000,000 requests, overage USD 0.20 per 1,000 if pay-as-you-go is on; public routes had `ratelimit-limit: 1200` per IP observed, health 120/min/IP (H, llms-full.txt and response headers).
- Freshness caveats: "In-play source age stays within 30s across cache reuse"; board quotes use cached books, misses are null; `volume_usd` counts shares at $1 settlement value, not cash volume, and can lag (H, llms-full.txt). Not suited to latency-sensitive arbitrage.
- SDKs: Python (`pip install 0xinsider`), Go, Node, Rust (generated from OpenAPI), CLI/MCP `@0xinsider/mcp` (H, llms.txt). I did not install or run any.
- Fixtures (H, all unauthenticated, <=50 KB): `docs/research/fixtures/0xinsider/api-v1-discovery.json`, `api-v1-coverage.json`, `api-v1-health.json`, `pick-of-the-day-ledger-last3.json` (last 3 of 590 entries; sealed entries hide the payload until opened), `sandbox-games.json` (SYNTHETIC sandbox sample, shows game/market/token-id shape).
- Response envelope: `{"object": "...", "data": ..., "meta": {"request_id", "cached", "cost"}}` (H).

## 5. Trade path

**None.** Read-only analytics; no order placement, no signing, no custody (H, https://0xinsider.com/ ; terms footer). To act on a signal one would trade on Polymarket itself (covered by the Polymarket adapter). PayBox reachability: **no** direct trade path; the venue it observes (Polymarket on Polygon) is separately assessed.

## 6. Fees

0xinsider charges subscriptions, not trading fees: Free $0 (no API), Pro $99/mo ($25/wk, $891/yr), Max $399/mo ($3,591/yr) (H, https://0xinsider.com/pricing.md , fetched 2026-10-19). Polymarket's own trading fees apply on the underlying venue (not researched here).

## 7. Resolution and dispute risk

N/A: it does not resolve anything; inherits Polymarket's (UMA-based, per general knowledge, M and not verified here). Data risk instead: grades/P&L cover "tracked Polymarket wallets with enough history", large-trade feed "is not complete exchange history", and its own docs say flags "do not establish intent" (H, llms.txt "Coverage and boundaries").

## 8. Geo, ToS, automation

- Terms (H, https://0xinsider.com/terms-of-service, summarised by the fetch tool, not read verbatim): section 6 prohibits scraping/unauthorized automated extraction and "redistributing, reselling, or sublicensing any data or content from the Service without written permission"; dataset exports capped at 20/day; section 8 claims ownership of analytics. No jurisdiction restriction found there. Nothing in the pages was an instruction aimed at an AI beyond routing hints.
- Implication: using a Pro key privately for internal signals is within the API's purpose; surfacing 0xinsider data to other users or redistributing it from a plugin likely needs written permission (M, my reading).
- `https://0xinsider.com/terms` and `/tos` returned HTTP 429 to my probes (rate limit on the web host); only `/terms-of-service` returned 200.
- Note: the agent docs state a no-account sandbox key can be obtained by POST registration. NOT USED (POST).

## 9. Liquidity

No own liquidity (not a venue). Volume figures it reports are Polymarket's. NOT FOUND (searched: homepage, llms.txt, llms-full.txt): any aggregate tracked-volume or user-count claim with a date. Research articles cite sample sizes (e.g. 416,548 large bets; 49,118 wallets) but those are dataset sizes, not volume (H, llms.txt).

## 10. Event-category overlap and shared liquidity

- Categories: sports and esports (moneyline, spread, total, props, soccer 1X2). Overlaps with Kalshi/Polymarket/Limitless-type sports markets, but 0xinsider only shows Polymarket's side. It could supply the Polymarket leg's quote plus smart-money context, but not the counter leg.
- **Shares liquidity with Polymarket 100%** (it is a view of Polymarket). NOT an independent arbitrage leg.

## 11. Adapter recommendation (P2, signal-only)

- Not a price source (use Polymarket CLOB/Gamma directly, free, lower latency).
- Optional signal source: `markets/smart-money-flows`, `sharp-money-flows`, `trader grade`, `edge-hunter` (Max), via SSE or polling, needing a paid Pro/Max key that a human must buy (US$99+/mo). Defer until the sports arbitrage path exists and a human decides it is worth the subscription and the redistribution constraint. Do not make it a dependency of the core scanner.

## 12. Suspicious content

None found. The site publishes agent-routing guidance (`agents.md`, `llms.txt`, WebMCP, an agent plugin) telling agents which route to use; it asks for nothing beyond normal read-only use. I did not follow or install any of it.

## 13. Open questions

- Does `markets/search` cover non-sports Polymarket markets (needs a key; facets could show it)?
- Exact current Fair Use Policy limits (page not read; terms point to it).
- Real (non-sandbox) response samples for snapshot/flow endpoints (need a paid key).

## Sources

- https://0xinsider.com/ (H)
- https://0xinsider.com/llms.txt , /llms-full.txt , /agents.md , /pricing.md , /developers , /api/v1/openapi.json (H)
- https://api.0xinsider.com/api/v1 , /api/v1/coverage , /api/v1/health , /api/v1/pick-of-the-day/ledger (H, unauthenticated GET, 2026-10-19)
- https://0xinsider.com/sandbox/api/v1/games , /sandbox/api/v1/markets/search (H, synthetic data)
- https://0xinsider.com/terms-of-service (H via fetch summary)
- https://www.wikidata.org/wiki/Special:EntityData/Q141539879.json (H)
