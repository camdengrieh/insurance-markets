# Problyx (problyx.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## Verdict

- Kind: forecasting-nonmoney (play-money prediction markets). Priority: **skip** for arbitrage/execution; at most a P2 signal-only read feed (see below).
- Live: yes (H). Site up, "All systems operational" banner, public API returns active markets closing late Oct 2026, 1681 active markets per API total (H).
- Points ("PP") have no monetary value, cannot be redeemed, transferred or sold (H, terms Section 3). Prices are therefore not anchored to real money: no arbitrage leg, and no PayBox reachability.

## Market model (H, OpenAPI + live responses)

- Market: `outcomeType` binary or multi. Statuses: active, closed, resolved, cancelled, resolution_locked.
- Events group markets; `outcomeMode` exclusive (probabilities sum to ~100%) or independent.
- Pricing: pool-based AMM, not an order book. Binary markets expose `yesPool`/`noPool`; observed `yesProbability = noPool/(yesPool+noPool)` (e.g. 17571/(35512+17571)=0.331 matches 0.331) -> CPMM-style (M, inferred from numbers). Quote endpoint returns slippage: buying 100 PP of YES at p~0.314 gave 314.46 shares, pricePerShare 31.80 (cents-scale), priceImpact 0.068, newProbability 0.3152 (H). Payout presumably 1 PP/share (M: estimatedReturn == shares).
- Outcomes are DB rows (UUID), not tokens. Off-chain. No chain, no collateral other than PP (H: pmwisdom says off-chain virtual points; terms say no monetary value).
- Game modes layered on top (quiz, ladder, duels, daily drop, crew wars, arena...) per homepage (H, https://www.problyx.com/). Not relevant to the adapter.

## Read API (official-public)

- Docs: https://www.problyx.com/developers (H). OpenAPI 3.0: `{base}/public/v1/openapi.json`; index `{base}/public/v1` (H).
- Base URL: `https://problyxweb-production.up.railway.app` (H; Railway host, not problyx.com).
- Endpoints (all GET, H): `/public/v1/markets` (q, status, category, sort, limit<=100, offset<=10000), `/markets/{id}`, `/markets/{id}/quote?outcome=yes|no&amount=<PP>&action=buy|sell`, `/events`, `/events/{id}`.
- Response envelope `{success, data}`; list `data` = `{items,total,limit,offset}`. Errors: 401 bad key, 404 (private/pending too), 409 closed, 410 resolved, 423 settling, 429 rate limit.
- Auth/limits: anonymous 10 req/min/IP; `X-API-Key: pbx_...` 30 req/min/key (key created in profile settings, verified email, max 5 keys). Edge cache 15-30 s. Free tier is "evaluation"; higher limits, commercial use, webhooks, write access on request via the contact in the OpenAPI spec (H).
- Attribution: spec asks to link back to the market `url` when displaying data (H).
- No order book / depth endpoint, no trades history endpoint, no websocket (H for absence in docs and OpenAPI path list). Resolution data is in market fields `resolvedAt`, `resolvedOutcome`. Prices = probability fields plus the quote endpoint.
- Market fields: id, titleEn/Es, descriptionEn/Es, category, status, outcomeType, eventId, yesProbability, noProbability, yesPool, noPool, outcomes[{id,labelEn,labelEs,probability,pool,sortOrder}], totalVolume, uniqueTraders, totalTrades, closesAt, resolvedAt, resolvedOutcome, url.
- Fixtures: `docs/research/fixtures/problyx/` : `openapi.json`, `markets_active_sample.json`, `events_sample.json`, `quote_sample.json`.

## Trade path

- None. Docs: "The API is read-only. Trading is disabled until anti-farming rules are settled." (H, /developers). Write access only on request (H).
- Terms prohibit "bots, scripts, or any automated or third-party means to place trades" (H, https://www.problyx.com/terms).
- PayBox/EVM/Solana wallet: not reachable. No on-chain contracts, no signed orders, nothing to propose. paybox_reachable = no.

## Fees

- NOT FOUND (searched: terms page, developers page, OpenAPI). Quote response has no fee field. Irrelevant for play money.

## Resolution

- "Markets resolve based on publicly verifiable outcomes"; "resolution decisions made by Problyx administrators are final"; no appeal process described (H, terms). Centralised admin resolution; 423 resolution_locked state exposed. Resolution rules in descriptions look careful (e.g. AAA gas price, Nasdaq market cap) but are single-operator.

## Geo / ToS / automation

- 18+; no excluded country list; user responsible for local legality (H). Bot/script trading and unauthorised scraping prohibited; public API use is allowed under fair use (send a User-Agent, cache, follow ToS) (H). Commercial use needs agreement (H).
- Operator: PROBLYX LTD, Nicosia, Cyprus, registered 2026-05-02; founder listed only as "Pau"; no public audit found (M, https://pmwisdom.com/projects/problyx, page verified 2026-08-16). Very young venue (<6 months).

## Liquidity

- Play-money only. Top active markets by volume on 2026-10-19: 67.3K PP (7 traders), 50.7K PP (59 traders), 29.1K PP (32 traders) (H, API). Pools are tens of thousands of points; no USD value. Homepage shows volumes like 924P to 67.3KP (H).
- Does not share liquidity with any other venue.

## Event overlap (signal value only)

- Categories: Politics, Sports, Esports, World Cup, Crypto, Finance, Technology, Entertainment, Science, Other (H homepage). Examples: Ballon d'Or, Clasico, US Open, Amazon market cap, US gasoline price, papal trip. Overlaps with Polymarket/Kalshi on sports, finance and politics, but because points are free and the user base is tiny (single digits to ~60 traders per market), prices are crowd-noise, not tradeable. Possible use: a weak, free crowd-sentiment signal; low value.

## Adapter notes (if ever built as signal-only)

- Poll `/public/v1/markets?status=active&sort=volume&limit=100` at <=1 req per 30 s with a generic User-Agent; paginate by offset. Map `url` for attribution. Treat probabilities as informational only, flag `venueKind=playmoney` so scanners never count it as an arbitrage leg.

## Not found

- Fee schedule; trade history/book/websocket endpoints; on-chain contracts; any GitHub repo (not searched in depth; WebSearch budget was exhausted this session); independent volume stats; dispute process.

## Sources

- https://www.problyx.com/ (H, fetched 2026-10-19)
- https://www.problyx.com/developers (H)
- https://www.problyx.com/terms (H)
- https://problyxweb-production.up.railway.app/public/v1 , /public/v1/openapi.json , /public/v1/markets , /public/v1/markets/{id}/quote , /public/v1/events (H, unauthenticated GETs 2026-10-19)
- https://pmwisdom.com/projects/problyx (M, third-party directory)

## Suspicious content

- None observed in fetched pages or API responses.
