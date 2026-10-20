# Kiyotaka (kiyotaka.ai, now redirects to openmarket.xyz)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary or inferred, L = weak or stale. Read-only: public unauthenticated GETs only. No account, key or signing.

Note: a longer earlier write-up of the same entity exists at `docs/research/venues/kiyotaka-prediction-market.md` (and a sibling `openmarket-formerly-kiyotaka-prediction-market.md`). This file is the canonical `kiyotaka` slug. I re-verified its key facts this session (redirects, builder volume) and they match.

## Verdict

- **adapter_priority: skip.** Kiyotaka's prediction-market product was a Polymarket front-end (builder-code overlay). It has no liquidity or order book of its own. Its attributed Polymarket volume stopped in early July 2026, and the operator's current product has been renamed OpenMarket, whose terms list Polymarket as a data source only.
- **Not an independent arbitrage leg.** All fills go to Polymarket's CLOB. Read Polymarket directly (covered by the parallel workflow).
- **Residual value:** the vendor's paid market-data API (Kiyotaka API / OpenMarket Data API) includes Polymarket analytics. It is a possible signal source but needs a paid key for the Polymarket analytics endpoints, and Polymarket's own data API gives similar data free. Not worth an adapter.

## Is it live (2026)?

- Domain: `https://kiyotaka.ai/` and `https://kiyotaka.ai/api` both return `301` (nginx) on 2026-10-19 [H: curl -I], redirecting to `https://openmarket.xyz/` [H: WebFetch redirect notice]. A web search still surfaces `kiyotaka.ai/api` and an April 2026 post saying "Kiyotaka API is live ... first-class support for Hyperliquid and Polymarket builders" [M: search snippet, https://x.com/openmarket_xyz/status/2043704207182811595; the post itself returned HTTP 402 to WebFetch, not read]. So the data business is alive, rebranded.
- Polymarket builder feed (unauthenticated): Kiyotaka's builder code shows monthly volume of $2.5k (Dec 2025), $748k (Jan), $587k (Feb), $751k (Mar), $598k (Apr), $953k (May), $4.8k (Jun), $6.66 (Jul 2026), and no rows after July [H: https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH, fetched 2026-10-19]. Other builders appear in later months, so the gap is real (the feed returned 2,920 rows in total).
- A second builder named "OpenMarket" (a different code) shows $160k (May), $3.65M (Jun), $2.60M (Jul) with only 1-2 active users and nothing later [H, same feed]. The ownership link is inferred from the name [L].
- DefiLlama still lists "Kiyotaka Prediction Market" (id 7888, category Interface, chain Polygon, tag "Polymarket Builder", description "a prediction platform powered by Polymarket", empty TVL) [H: https://api.llama.fi/protocol/kiyotaka-prediction-market]. The listing is stale. The fees and dexs summary endpoints under the short slug `kiyotaka` return "not found"; the earlier note found them under `kiyotaka-prediction-market` with the last volume point 2026-07-06 [M: from the earlier note, not re-fetched].
- Operator and rename: per the earlier note, OpenMarket's terms name Thalamus Technologies, Inc. and state order entry is limited to Hyperliquid and Alpaca [M here: not re-read this session; H in earlier note via https://openmarket.xyz/terms].
- Conclusion: the company and domain are alive; a Polymarket trading venue called Kiyotaka is effectively discontinued [M, since I did not log in to the app].

## Kind and market model

- Kind: broker-or-frontend (Polymarket builder-code front-end), folded into a charting and analytics platform [H: DefiLlama record].
- Market model: none of its own. Markets are Polymarket's binary and neg-risk categorical outcome tokens on Polymarket's central limit order book (see the Polymarket spec).
- Mechanism: the front-end attaches a `bytes32` builder code to orders and earns a builder fee on matched volume [H: https://docs.polymarket.com/programs/builders/overview.md, per earlier note].
- Kiyotaka builder code `0x2096c1dd5e4d0c660ce764ab20a3a95853d11e27724b3c73cad543352da1555f`; "OpenMarket" builder code `0xc1d36415252eaf505b23758bdf8f124f2e8661f65eb634b12064c629c475b290` (both public on Polymarket's builder feed) [H].

## Chains and collateral

- Polygon (DefiLlama chain field) [H]. Collateral is Polymarket's. No contracts of its own (DefiLlama `address: null`) [H].

## Read API

- **Venue read API: none** (no venue). Read Polymarket.
- **Data API (analytics product):** base `https://api.openmarket.xyz` (alias `https://api.kiyotaka.ai`), docs https://openmarket.xyz/docs/introduction.md [H per earlier note]. Auth header `X-OpenMarket-Key`; Free tier 10 weight/min and 1,000/day, Basic $99/mo, Standard $199/mo, Advanced $599/mo up to 1,500 weight/min [H per earlier note: https://openmarket.xyz/docs/rate-limits.md]. Polymarket analytics endpoints (`/v1/polymarket/analytics/{leaderboard,trader-profile,positions,market-summary,...}`) need Standard or Advanced and carry no live prices, books, trades or resolution feed [H per earlier note].
- Unauthenticated check this session-lineage: `GET /v1/polymarket/analytics/platform-summary` returns `401 missing or invalid api key` (fixture `openmarket-api-unauthenticated-401.txt`). No public response shape to sample for the Kiyotaka API itself.
- Public shapes that do exist and are saved: Polymarket builder feed rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` (fixture `polymarket-builders-volume-rows.json`, leaderboard rows in `polymarket-builders-leaderboard-rows.json`) and the DefiLlama protocol record (`defillama-protocol.json`). These endpoints are not in Polymarket's documented index, so stability is uncertain [L].
- WebSocket: crypto channels only; no Polymarket channel documented [NOT FOUND, searched: docs ws overview, per earlier note].

## Trade path

- **None.** No Kiyotaka or OpenMarket prediction-market order API. Trade the same liquidity on Polymarket directly (EIP-712 signed CLOB orders; Polymarket adapter's job). Attaching Kiyotaka's builder code would only pay Kiyotaka a fee.
- **PayBox reachable: no, via this venue.** Nothing to propose or sign. A Polygon EVM wallet could reach Polymarket itself.

## Fees

- Builder fee on Polymarket trades: set by the builder, max 100 bps taker and 50 bps maker, additive to Polymarket's fee [H per earlier note: https://docs.polymarket.com/programs/builders/fees.md]. Kiyotaka's actual rate: NOT FOUND (searched: DefiLlama methodology, terms). Implied about 0.25% from DefiLlama fees over volume [M, derived in earlier note].
- OpenMarket's current fees (0.02% Hyperliquid builder fee) do not apply to prediction markets [M].

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket's oracle process. Kiyotaka adds no resolution layer and (per the earlier note) holds no funds, so no own dispute risk.

## Geo, ToS and automation

- OpenMarket terms (28 Sept 2026, per earlier note, via a summary not verbatim) [M]: non-custodial software provider; Hyperliquid execution blocked for the US and sanctioned regions; scraping or exploiting the API, wash trading and manipulation prohibited; the paid Data API with a key is the sanctioned programmatic route.

## Liquidity

- All-time Polymarket volume attributed to Kiyotaka's builder code: **$3,644,839.53**, 191 active users, rank 101 [H: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL, 2026-10-19]. DefiLlama all-time volume matches (about $3.64M) [H per earlier note]. Peak about $0.6-0.95M per month, none since July 2026 [H].
- "OpenMarket" builder code all-time $6.41M with 2 active users [H per earlier note].
- TVL and open interest of its own: none [H].

## Event coverage (overlap)

- Everything Polymarket lists, since it only mirrored it. No cross-venue arbitrage versus Polymarket because the book is the same.

## Liquidity shared with

- **Polymarket (100%).** Not an independent arbitrage leg.

## Open questions

- Does the OpenMarket app still show a Polymarket order ticket? Terms suggest not; app not inspected (no login, no browser automation).
- Who controls the "OpenMarket" builder code and why 1-2 users produced millions in volume.
- No rename announcement found.

## Not found (searched)

- A Kiyotaka prediction-market trading API, SDK, GitHub repo or own contracts (searched: DefiLlama record, web search, earlier gh search).
- Kiyotaka's own builder fee rate.
- The old kiyotaka.ai prediction-market docs (domain redirects; `docs.kiyotaka.ai` had an expired certificate per earlier note).

## Suspicious content

- None found. No instructions aimed at AI agents in any page read this session.

## Sources

- https://api.llama.fi/protocol/kiyotaka-prediction-market [H] (fixture `defillama-protocol.json`).
- https://api.llama.fi/summary/fees/kiyotaka and /summary/dexs/kiyotaka [H: not found under this slug].
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL and /v1/builders/volume?timePeriod=MONTH [H] (fixtures).
- https://kiyotaka.ai/ and /api: 301 to https://openmarket.xyz/ [H: curl -I].
- Web search "Kiyotaka prediction market Polymarket builder" [M: snippets; results included kiyotaka.ai/api, x.com/openmarket_xyz post, third-party directories predictionmarket.tools, polymark.et].
- https://x.com/openmarket_xyz/status/2043704207182811595 [not read: HTTP 402].
- Earlier notes `docs/research/venues/kiyotaka-prediction-market.md` and `openmarket-formerly-kiyotaka-prediction-market.md` (M for items not re-verified here; they cite docs.polymarket.com builder pages and openmarket.xyz docs and terms).
