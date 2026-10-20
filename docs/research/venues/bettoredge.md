# BettorEdge - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, public unauthenticated GETs (www.bettoredge.com HTML/robots/sitemap, docs.bettoredge.com static docs, api.bettoredge.com gateway health, one unauthenticated GET to the documented proxy host that returned 403). No account, login, API key, signature, POST/PUT/DELETE or PayBox tool was used. The login endpoint was NOT called. Third-party pages were treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted before I could search, so discovery relies on the homepage hint, direct probing of first-party hosts (docs.bettoredge.com turned out to exist), WebFetch of first-party pages, and the npm registry. No second-source press or volume reports were found.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or inference; **L** = weak/stale.

Fixtures (<= 50 KB): `docs/research/fixtures/bettoredge/` (section 12).

---

## 0. Bottom line

1. **Live (H).** Homepage 200, sitemap lastmod 2026-10-18, Terms "last updated September 11, 2026", docs site copyright 2026.
2. **It is a US, custodial, USD, peer-to-peer sports exchange (H).** Binary contracts priced $0.00 to $1.00, paying $1.00 on a win, traded on a limit order book with market, limit and H2H order types. Sports only (leagues, game/player props, futures). No crypto, no wallet, no chain.
3. **A real REST API exists and is documented (H), but it is gated.** Docs at https://docs.bettoredge.com, base URL `https://proxy.bettoredge.com`. API access is "not enabled by default": you email support for an API key; real-money order placement additionally needs IP whitelisting "to ensure compliance with legal trading locations". Even market data needs the API key (unauthenticated GET returned 403), so there is no public read API.
4. **Not reachable through PayBox.** Funds are fiat USD (card/bank deposit, bank withdrawal), identity-verified US account. No signed-order or transaction-proposal path.
5. **Independent liquidity (M).** Its own peer-to-peer book; no sign it is routed to another venue. Third-party vendors supply the lines/event data only. Depth is unknown and likely thin outside marquee games.
6. **ToS is hostile to commercial or automated use** while the API docs invite automation; this conflict is unresolved (section 9).
7. **adapter_priority = P2.** Sports-only, per-account gated key, no wallet path, unquantified liquidity, ToS limits. Worth revisiting as a read-only signal/price leg for sports props if the operator grants a key and confirms commercial use is allowed.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.bettoredge.com/` | 200. "The Social Sports Betting Marketplace"; states "$100M+ matched", "35,000+ bettors", "1M+ orders" (page-summary of homepage, no date on the stats). | H (page), M (summary of stats) |
| `https://www.bettoredge.com/sitemap.xml` | 200; `pages.xml` and `blog.xml` lastmod 2026-10-18 | H |
| Terms of use | "Last updated: September 11, 2026"; operator Trifecta Sports, LLC (d/b/a BettorEdge), 718 N. Washington Ave, Minneapolis, MN | H (via WebFetch summary of https://www.bettoredge.com/terms-of-use) |
| `https://docs.bettoredge.com/` | 200 Docusaurus site, "REST API Reference for BettorEdge Prediction Markets", copyright 2026; changelog shows only v0.1.0 (initial release; no dates) | H |
| `https://api.bettoredge.com/` | 200 `{"status":"ok","service":"gateway","services":["auth","markets","sports","competitions","payments","social","pulse","websocket"]}` | H |
| npm `bettoredge-value-finder` | Created 2026-01-23, MCP server "Find +EV betting opportunities on BettorEdge prediction markets"; third-party, not read, listed only as evidence the API is being used by outsiders | H (registry metadata) |

Verdict: **still_live = true.** All primary sources < 6 months old.

---

## 2. Kind and market model

- **Kind**: sportsbook-exchange / peer-to-peer sports betting marketplace. The docs themselves call it a "prediction markets platform where users can buy and sell positions on the outcomes of sporting events" (H, https://docs.bettoredge.com/intro/). The marketing site says "bet against people, not the house" and mentions "Prediction Market" only as a calculator tool (H).
- **Contract**: price in $0.00-$1.00 per contract, winning contract pays $1.00. Docs: "Contracts = Amount / Price" (e.g. $100 at $0.65 = ~153 contracts, rounded down) (H, https://docs.bettoredge.com/guides/place-first-order/).
- **Order types** (H, intro): market, limit (rests in the book), H2H (direct challenge to a named user). Positions can be sold back before settlement. Parlays exist in the app (help center category "Parlays on BettorEdge Markets", H for the category's existence; mechanics NOT FOUND).
- **Hierarchy** (H, https://docs.bettoredge.com/guides/bettoredge-markets/): League -> Contest (`team` | `tournament` | `match`) -> Market (Winner, Spread, Total, Stat; many player props) -> Side (over/under, yes/no, home/away) -> Side type and participant (`athlete` | `team` | `side`) -> Variable (the line, "0" for non-variable markets).
- **Outcome identifier ("tokenisation")**: a 7-part colon string, the `order_context_hash`:
  `{contest_type}:{contest_id}:{market_id}:{side}:{side_type}:{side_id}:{variable}`, e.g. `team:lakers_nuggets_20240115:12345:over:athlete:2954:26.5` (docs example). Lines are free-form: "Trade at any line you want, not just the suggested ones"; a new line creates a new market on first order (H). Implication for the aggregator: a market is not a fixed list; any (market, side, line) tuple is addressable, and the `variable_options` array is only a suggestion.
- **Binary only in practice.** Each hash is one side of a two-sided market; the opposite side is a separate hash. Whether Yes + No complements are guaranteed to sum to $1.00 (i.e. whether a buy of one side is the mirror of a sell of the other) is NOT FOUND.
- **Spread/total pushes**: NOT FOUND (whole-number lines may push; refund mechanics undocumented).

## 3. Chains and collateral

None. Collateral is custodial USD in a BettorEdge account (balance, promo balance, and non-tradable "Edge Coins" practice currency; API orders use USD balance first, then promo; Edge Coins unsupported via API) (H, https://docs.bettoredge.com/guides/understanding-balance/). Deposits from a linked card or account, withdrawals to a linked bank account (H, Terms sections 2.3-2.5 via WebFetch summary). No token, no contract, no chain. The `payments` service in the gateway list is internal.

## 4. Read API

| Field | Value |
|---|---|
| Exists | **official-authenticated** (key required even for reads) |
| Docs | https://docs.bettoredge.com (sitemap: intro, 4 API reference pages [authentication, contests, markets, players], 6 guides, changelog) |
| Base URL | `https://proxy.bettoredge.com` (H, docs). Also reachable: `https://api.bettoredge.com/` gateway health (H). Service prefixes: `/markets/v1`, `/events/v1`, `/players/v1`. |
| Auth for reads | Header `x-api-key: <key>` (guides) ; the API reference pages instead say "Bearer token" for the same endpoints. The two docs disagree (see open questions). Unauthenticated GET `/markets/v1/markets/available` returned `403 {"message":"Failed to Authenticate"}` (H, probed). |
| Rate limits | NOT FOUND (searched all docs pages fetched: intro, access, auth, markets, contests, balance, liquidity, place-order, changelog) |
| Websocket | NOT FOUND in docs. The gateway health response lists a `websocket` service (H), but no protocol/URL/channel is documented. The liquidity guide says a full Order Book endpoint is "coming soon" (H). |
| Pagination | NOT FOUND |

Key endpoints (all H, https://docs.bettoredge.com/api/markets/ and /api/contests/):

- `GET /events/v1/leagues/?status=active` : leagues (`league_id`, `league_name`, `sport`, `external_id`, `external_odds_id`, ...). Note: an unauthenticated probe of this path returned a Heroku 503 "Application Error" HTML page (H, probed 2026-10-19); possibly just the unauthenticated path failing upstream, not evidence about the authenticated service.
- `GET /markets/v1/markets/all?status=active` : market-type catalogue (type Spread/Winner/Total/Stat, level team/event/exotic/athlete/h2h, `external_mapping` to `sportradar` or `bet_scope`, `resolver`, `resolver_timing`, `max_order`).
- `GET /markets/v1/markets/available?league_ids=1,2` : the main feed. Per contest: `contest_type`, `contest_id`, `contest_hash`, `contest_title`, `scheduled_datetime`, `teams[]`; per market: `market_id`, `market_description`, `variable_required`, `variable_options[]`, `liquidity`, `volume`, `active`, `market_hash`, `side_type_options`, `sides[].liquidities[]` = {`order_context_hash`, `variable`, `price`, `available`, `title`, `side_id`}.
  - **Best price only**: `liquidities` "shows only the best available price for each market/side/variable combination" (H). Without `league_ids` only contests that have resting orders are returned; with `league_ids` all contests incl. empty ones.
  - **No depth**: full order book endpoint "coming soon" (H). Aggregator can see top-of-book price and size only.
  - **No trades endpoint** documented (NOT FOUND); `market.volume` field exists but its window (24h? lifetime?) is undocumented.
  - **No resolution/outcome endpoint** documented (NOT FOUND); only `resolver` / `resolver_timing` fields on the market catalogue.
- `GET /markets/v1/portfolio/me`, `GET /players/v1/players/player/balance/me`, `GET /players/v1/players/player/me` : account-scoped.

Docs also contain "Players" and "Contests" reference pages; Contests page (fetched) documents only Get Leagues, though the changelog says Contests also covers "events, tournaments, matches, and bulk operations" (not documented in fetched page).

## 5. Trade path

Programmatic order placement **exists** (H):

- Login: `POST /players/v1/authenticate/login`, HTTP Basic (base64 `username:password`) plus body `{"attribute":"username"}`, returns `access_token`, `refresh_token`, `expire_datetime`. Means a **password-based session**, not wallet signatures. (Not called.)
- `POST /markets/v1/orders/order/place` body `{order_context_hash, price, amount, market_type:"FOR_MONEY", expire_time?}`. `amount` is dollars of cost basis, `price` a 0-1 limit. Response shows only acceptance (`placement_status`, `order_context.status:"approved"`); fills are asynchronous and must be read from the portfolio endpoint (H).
- `POST /markets/v1/orders/order/sell` (`order_context_hash`, `price`, `amount`, `expire_time`), `POST .../order/cancel` (`order_id`), `POST .../bulk/cancel` (`order_ids[]`).
- Gating: account must have `api_enabled: true` (support request); trading endpoints need the **public IP whitelisted** via support, with the stated purpose of enforcing legal trading locations (H). Whitelist implies a fixed egress IP in a permitted US state; cloud/VPN egress is likely unsuitable.
- No FOK/IOC semantics documented; no client order id; no documented idempotency. NOT FOUND.

## 6. PayBox reachability

**no.** BettorEdge is fiat/custodial. There is no EVM or Solana contract, token, EIP-712 order or on-chain deposit address (NOT FOUND in docs, site, or Terms: searched docs.bettoredge.com pages and Terms). A PayBox wallet cannot trade it via transaction proposals or signed orders. A PayBox `pay_x402`/card route is also irrelevant (no 402 observed). At most, the adapter could be read-only (prices) while any execution is a manual or human-account action.

## 7. Fees

- No schedule published. Marketing says "no built-in vig" / "lower fees" (H, homepage, features page). Terms 3.8: "A percentage of positions may be deducted for platform use", rate changeable and "may depend on location, premium status, or other criteria" (H, Terms via WebFetch summary; I did not independently verify the verbatim wording). Premium page exists (https://www.bettoredge.com/premium); contents not read.
- Whether the fee is taken on winnings, on matched volume, on both sides, or only on the taker is **NOT FOUND**. Help center "Markets Overview" says the P2P model "eliminates the high fees charged by traditional sportsbooks" with no figure (H via summary).
- Aggregator must treat fee as unknown and parameterised; edges must be computed net of an unknown percentage. Any arbitrage calculation is unsafe until measured with a funded account (out of scope for this read-only pass).

## 8. Resolution mechanism and dispute risk

- Centralised settlement by the operator. The market catalogue has `resolver` and `resolver_timing` ("live, post-game, etc.") and `external_mapping` to sportradar / bet_scope, suggesting data-vendor-driven automated grading (H for the fields, M for the inference). Terms 5.2: betting lines "come from third-party vendors and are for educational purposes only" (H via summary).
- Grading rules live on a separate "General Rules" page that Terms 16.6 refers to; I did not locate or read it. NOT FOUND.
- Erroneous-order policy (Terms 16.2): an order may be deemed erroneous if an obvious/significant error means it is not a fair price (H via summary). This matters for arb: a stale or mispriced fill can be voided.
- Disputes: binding individual AAA consumer arbitration, class waiver, Minnesota law, liability cap = greater of fees retained or $100 (Terms 12, 16.3, 16.5) (H via summary). No on-chain recourse. Risk: **high counterparty/custodial and void-bet risk, no transparency.**
- Settlement timing/payout latency, treatment of postponed games, player DNP (did-not-play) on props: NOT FOUND.

## 9. Geo, ToS, automation

- US only in practice: "legal in 45+ states" claimed; page states the service is "not offered" in **Arizona, Louisiana, South Carolina** (H via WebFetch of https://www.bettoredge.com/bettor-edge-legal-by-state). Must be 18+, identity-verified. No licence or regulator is named on that page or in Terms (H via summary; legal basis NOT FOUND). Regulatory classification (sweepstakes/skill/exchange) is unstated.
- Terms 8.3(b)(vi) (H via summary) prohibits using "software or automated agents or scripts" to create multiple accounts and to run "automated searches, requests, or queries" / scrape or mine data; 3.1/4.6 limit use to personal, **noncommercial** purposes, with commercial use needing prior written approval; 3.3 bars building a competing product. The API docs, however, explicitly advertise "Automate your trading strategies" and "Algorithmic trading" to API-enabled accounts. Reading: the official API with a granted key is the sanctioned automation path, but a commercial aggregator service would need written approval. I cannot resolve this from the documents.
- robots.txt (www): `Disallow: /api` for all agents, including named AI crawlers (H). That is the website's path, not the proxy host.
- IP whitelisting requirement means a deployed bot must run from a US IP in a permitted state, which also bakes in geo-compliance (H).
- Operator contact for permissions: support address listed in docs/Terms (not reproduced here).

## 10. Liquidity (with dates)

- Homepage claims (2026-10-19, undated by the site, page-summary M): "$100M+ matched between bettors", "35,000+ bettors", "1M+ orders placed". These look **cumulative lifetime** figures; no current OI, daily volume or TVL is published. NOT FOUND (searched: homepage, features, help center market overview, docs).
- No leaderboard or public market page with live volume was found. The per-market `volume` and `liquidity` fields exist in the authenticated feed only.
- Help center admits "Matching can take longer on less popular events" (M via summary). Props at arbitrary lines imply many one-sided or empty books.
- Judgement (L): thin versus Kalshi/Polymarket sports, sparse beyond NFL/NBA/MLB/NHL/college headline games.

## 11. Event categories and overlap

Sports only (H, homepage list): NFL, MLB, NBA, WNBA, NHL, UFC, tennis, college football, college hockey, March Madness, plus player props, parlays, futures ("tournament" contests), pick'ems, auction squares, H2H challenges. Politics, crypto price, macro, entertainment: none found.

Overlap for arbitrage:
- **Sports moneyline / spread / total** with Kalshi, Polymarket (global+US), Limitless-like venues, and traditional books. Because BettorEdge is a P2P book that lets users post any line, matching to other venues requires a (game, market, line) key join, and half-point lines may not exist elsewhere.
- **Player props** (points/rebounds/yards at free-form lines) overlap with the few venues listing props; mostly a price-signal use.
- Futures (championship winners) overlap with Polymarket/Kalshi.

**Shared liquidity**: no evidence BettorEdge routes to or mirrors another venue (M); lines come from vendors for display only. Treat as an **independent** leg in principle, but with unknown depth and unknown net fee.

## 12. Fixtures saved

`docs/research/fixtures/bettoredge/`
- `api_gateway_health.json` : real `GET https://api.bettoredge.com/` response (H).
- `proxy_markets_available_unauth_403.txt` : real unauthenticated `GET https://proxy.bettoredge.com/markets/v1/markets/available` response, 403 `Failed to Authenticate` (H).
- `docs_example_markets_available_response.json` : **documentation example, not a live response**, trimmed from the Understanding Liquidity guide; shows the intended feed shape.

No live market-data fixture exists because the feed needs an API key.

## 13. Adapter implications (if it is ever built)

- Read adapter: poll `/markets/v1/markets/available?league_ids=...`; normalise `price` (already 0-1) for the side's `order_context_hash`; top-of-book size = `available` (units: docs say "Amount of liquidity", treated as dollars in the example; confirm). Derive the complement side from the other `sides[]` entry. No depth, no trades, no resolution feed, so aggregation is best-price only.
- Identity: use `contest_id` + `market_id` + `side_id` + `variable` as the key; link to other venues through `scheduled_datetime`, `teams[]`, and `external_mapping` (sportradar ids are potentially a join key with other sports data).
- Execution: out of scope for PayBox. A custom executor would hold a username/password session plus API key plus fixed IP, which conflicts with the project's wallet-signing model.

## 14. Open questions

1. Is a key obtainable for a commercial aggregator, and does written approval under Terms 4.6 cover it? Which of `x-api-key` vs `Authorization: Bearer` applies to market-data endpoints (docs disagree)?
2. Rate limits, websocket protocol (gateway lists a `websocket` service), and the timing of the "coming soon" order-book endpoint.
3. Fee formula and who pays (Terms 3.8 gives no rate).
4. General Rules page: grading, pushes, DNP, postponed games, void/erroneous order policy.
5. Real depth and current volume per league.
6. Unit of `available` and `volume`.

## Sources

- https://www.bettoredge.com/ (H; homepage via WebFetch)
- https://www.bettoredge.com/features (H; via WebFetch)
- https://www.bettoredge.com/terms-of-use (H; via WebFetch summary, section numbers as reported by it; not read verbatim)
- https://www.bettoredge.com/bettor-edge-legal-by-state (H; via WebFetch summary)
- https://www.bettoredge.com/robots.txt , https://www.bettoredge.com/sitemap.xml (H)
- https://docs.bettoredge.com/ , /intro/ , /guides/getting-started-api-access/ , /guides/authentication/ , /guides/bettoredge-markets/ , /guides/understanding-liquidity/ , /guides/understanding-balance/ , /guides/place-first-order/ , /api/authentication/ , /api/markets/ , /api/contests/ , /changelog/ , /sitemap.xml (H; HTML fetched and text-extracted directly)
- https://api.bettoredge.com/ (H; live health response)
- https://proxy.bettoredge.com/markets/v1/markets/available (H; unauthenticated 403)
- https://bettoredge.tawk.help (category pages and /article/market-overview, H via WebFetch summary; article text on fees/settlement absent)
- https://www.npmjs.com/package/bettoredge-value-finder metadata via `npm view` (H for registry metadata; package code not read; third-party author data intentionally not recorded)
- docs/research/venues/1win-markets.md in this repo (format reference only)

## Suspicious content

None found. The docs contain only ordinary API instructions; no text aimed at AI agents. (The npm package keywords mention "claude" and "anthropic", which is ordinary marketing of an MCP server, not an instruction; package was not executed.)
