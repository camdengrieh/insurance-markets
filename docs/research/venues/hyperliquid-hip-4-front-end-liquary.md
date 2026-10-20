# Hyperliquid HIP-4 front-end: Liquary (liquary.xyz) - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch of liquary.xyz and docs.liquary.xyz, unauthenticated GETs to api.liquary.xyz and api.llama.fi. No account, wallet, signature, key, POST/PUT/DELETE, payment or PayBox tool used. Third-party text treated as untrusted data.

Tags: H = read first-hand this session in a primary source; M = secondary/page-summary/inferred, or taken from the earlier sibling note `docs/research/venues/liquary.md` (same day, deeper; not re-verified here); L = weak/stale.

Limits: WebSearch budget was exhausted (no web searches run); defillama.com returned HTTP 403 (used the public api.llama.fi JSON instead). Hyperliquid facts come from the sibling note `hyperliquid-hip-4-outcomes-native.md`, not re-fetched. A fuller earlier spec of the same venue is `docs/research/venues/liquary.md`; this file is the short, schema-oriented version.

## 0. Bottom line
- LIVE (H): `api.liquary.xyz/v1/live.json` generated 2026-10-19 (~05:15Z) with 207 listings; manifest shows 12,341 settled price markets and 1,324 settled events, last shard 2026-10.
- Liquary is a front-end/broker (self-custodial terminal for perps, spot and prediction markets), not a market. HIP-4 orders settle on Hyperliquid HyperCore order books; a Polymarket route also exists.
- Liquidity is 100% shared with Hyperliquid HIP-4 (and Polymarket). NOT an independent arbitrage leg.
- No trading, price or order-book API from Liquary. Its only public API is a free, keyless, CC BY 4.0 HIP-4 metadata + archive API. Use it only as enrichment for the Hyperliquid HIP-4 adapter.
- adapter_priority: skip (as a venue).

## 1. Still live?
| Evidence | Tag |
|---|---|
| liquary.xyz homepage describes the terminal; data section: "$416.71M traded on HIP-4 markets from 02 May to 19 Oct", 12,531 markets on record | H (WebFetch, 2026-10-19) |
| `GET https://api.liquary.xyz/v1/live.json` -> 200, `generatedAt` 1792386907088, `count` 207 | H |
| `GET /v1/manifest.json` -> 200, counts above | H |
| `/v1/changes.json` newest settlement at 2026-10-19 (outcome 14297, ETH price binary) | H |
| DefiLlama "Liquary Outcome" (category Interface, builder-code volume) listed; page itself 403, API readable | M/H (api.llama.fi) |
| Terms last updated 2026-09-30; builder fee waived until 2026-10-31 | M (sibling note) / H (fees page) |

## 2. Kind and market model
- Kind: broker-or-frontend. Homepage: "Liquary is non-custodial: your keys stay in your wallet, every trade is signed by you." (H)
- Markets are Hyperliquid HIP-4 outcome markets: USDC-collateralised Yes/No outcome tokens on a HyperCore central limit order book; price range 0.001-0.999 (M, sibling note + Hyperliquid docs).
- Types in `live.json` (H, observed): `kind: "binary"` (one outcome with yesCoin/noCoin) and `kind: "question"` (categorical: `legs[]`, each leg its own outcome with yes/no coins; exactly one leg settles Yes). Scalar field exists in the schema; none observed live (M, sibling note).
- Tokenisation (M, Hyperliquid asset-ids doc via sibling note): coin `#<10*outcome+side>`; confirmed shape in live data: outcome 1473 -> `#14730` / `#14731` (H). Order asset id = 100,000,000 + encoding (M).
- Deployers (H, computed from live.json 2026-10-19): `out` 79 listings, `txyz` 62, `skew` 61, protocol-run 5. Same fixture listed by several deployers is shown as one card with cheapest-first market-buy routing (M, Liquary docs via sibling note).
- Polymarket route also exists (Polygon CLOB); covered by the Polymarket spec.

## 3. Chains and collateral
- HIP-4 trading venue: Hyperliquid L1 / HyperCore (not EVM). Collateral: USDC on HyperCore (M).
- Deposits routed from Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Solana etc. (M, sibling note). Bridge/swap has a 0.15% Liquary integrator fee (M).
- Login: email (embedded self-custodial wallet), Google, or connect an existing wallet; "No KYC and no documents to trade." (H, homepage)
- Liquary-owned contracts: NOT FOUND (searched: homepage, docs, sibling-note security page read).

## 4. Read API (Liquary's own)
- exists: official-public (metadata + archive only). Docs: https://docs.liquary.xyz/api-reference/hip4-archive (H). OpenAPI 3.1: https://api.liquary.xyz/v1/openapi.json (H, listed in docs and manifest). Base URL `https://api.liquary.xyz/v1` (H).
- Auth: none. GET/HEAD/OPTIONS only; other methods 405; no query parameters; CORS `*`; JSON only (H).
- Rate limit: 300 req/min/IP; 429 with `Retry-After: 60` and `X-RateLimit-Limit` (H). No SLA, "best-effort" (H). Websocket: NOT FOUND (docs say snapshots are not a live feed). ETag/If-None-Match supported (H, docs; response carried `etag`).
- Licence: CC BY 4.0, commercial use OK, attribution "Liquary (liquary.xyz)" (H, manifest + docs).
- Freshness: static snapshots rebuilt about every minute and on settlement, plus nightly; per-market files may be up to one hour old (H, docs). `live.json` response header `cache-control: public, max-age=60` (H).
- Key endpoints (H, docs table): `/v1/live.json` (all currently listed markets: names, sides, competition, fixture, category, deployer, coins, expiry; NO prices); `/v1/archive.json`, `/v1/archive/{YYYY-MM}.json` (settled price markets: target, settlePrice, result, volume, traders); `/v1/events.json`, `/v1/events/{YYYY-MM}.json` (resolved event markets: winner, scores, rules); `/v1/changes.json` (newest resolutions, 500 items, incremental sync); `/v1/markets/{outcomeId}.json` (result, flow, dataQuality, oddsMeta; 404 while still trading); `/v1/markets/{id}/settlement.json` (validator votes); `/v1/markets/{id}/price.json` (underlying price, 5-min); `/v1/governance.json`; `/v1/manifest.json`.
- NOT served: odds series, bulk export, per-wallet data (H, docs). Live prices and books must come from Hyperliquid `/info` (docs say so, H).
- Observed shapes (H, fixtures in `docs/research/fixtures/hyperliquid-hip-4-front-end-liquary/`):
  - `manifest.json`: `{generatedAt, buildSha, freshness, license, coverage{firstExpiryMs,lastExpiryMs}, counts{settledMarkets,settledEvents,marketFiles}, shards[{month,markets,events}], resources[], window{...}}`. Note `window.note`: API served a rolling 30-day window 2026-09-16..22, then reverted to full history.
  - `live_sample.json` (5 of 207 listings): `{generatedAt, note, license, count, markets[{kind, outcomeId|null, questionId|null, title, rawName, template, sides, yesCoin, noCoin, legs[{outcomeId,label,yesCoin,noCoin}], category, competition, fixture, underlying, expiryMs, scalar, deployer{protocol,venue,address}, url, image}]}` (deployer addresses redacted in the fixture).
  - `market_14297.json`: settled ETH price binary: `market{underlying, targetPrice, settlePrice, result:"up", yesCoin, noCoin, totalVolume, buyNotional, sellNotional, traders}`, `flow{fills, fee, builderFee, vwapYes, ...}`, `oddsMeta`, `priceUrl`.
- Ingest gotchas: `totalVolume` includes mints/merges/payouts, use buyNotional+sellNotional for traded volume (H, docs); many archive event rows keep unresolved `template:` pointers (M, sibling note's count: 1,010 of 1,323), so snapshot `live.json` before settlement.

## 5. Trade path
- None via Liquary: no order API. Orders are signed in the browser by the user's wallet or an approved trading agent (delegated key; can place/cancel, cannot withdraw) (M, docs via sibling note). Terms prohibit unauthorised bots/scrapers of the Interface (M, sibling note read raw HTML).
- Programmatic access to the same books = Hyperliquid API (REST `/info`, WS, signed `/exchange` actions) per `hyperliquid-hip-4-outcomes-native.md`. Liquary's builder fee is only a builder-code field on an order; an aggregator would not need Liquary.

## 6. PayBox reachability
- Via Liquary: no (nothing to call; no EVM transaction surface).
- Underlying Hyperliquid: partial. Orders are HyperCore-signed actions (EIP-712 style), not EVM transactions, so "transaction proposals" do not apply; a PayBox wallet's typed-data signing might cover approveAgent/orders, and Arbitrum USDC funding is possible (M, inference from `docs/research/06-paybox-platform.md`). Not tested.
- US persons barred (see section 9).

## 7. Fees (H, https://docs.liquary.xyz/trading/fees, fetched 2026-10-19)
- Liquary builder fee: flat 0.05% per fill (buy or sell), no volume tiers; waived through 2026-10-31 23:59 UTC. Whether it resumes: docs imply so (M).
- Hyperliquid fee: seller pays; none on buys; rate = spot taker rate (0.070% base) x a factor set by the market's deployer. Winning shares pay the same fee on the settlement payout; losing shares none.
- Holding to settlement: no Liquary fee. Early exit: both fees.
- Polymarket route: taker fee `shares x rate x price x (1 - price)`; limit orders free; Liquary builder fee 0% as of Sept 2026.
- Numeric deployer factors: NOT FOUND (searched: fees page).

## 8. Resolution
- Liquary resolves nothing (M, Terms via sibling note). Resolution is the underlying deployer/protocol's: protocol-run price markets settle on Hyperliquid mark price; Hyperliquid-run event markets by validator vote; third-party deployers (`out`, `txyz`, `skew`; 201 of 207 live listings carry a venue tag, H computed) by the deployer's own key with no documented dispute window (M, sibling note/docs). The API's `settlement.json` records validator votes only for validator-settled markets.
- Rule risks for arbitrage: draws pay 0.5/0.5 on two-sided sports templates; "Other"/fallback legs; unmoderated deployer free-text rules (M). Link by rules text, not title.

## 9. Geo, ToS, automation
- Homepage: no regions listed, "No KYC" (H). Terms (M, sibling note read raw HTML): operator Hypersight LLC (Wyoming); US persons barred ("access from the United States and its territories is strictly prohibited"); further restricted jurisdictions, more for prediction markets; VPN circumvention forbidden; unauthorised bots/scripts on the Interface forbidden.
- The public API is the sanctioned data path (CC BY 4.0, commercial OK, attribution). Higher limits via the docs Links page (contact not used).

## 10. Liquidity (dated)
- Liquary-attributed volume (DefiLlama builder-code, api.llama.fi `summary/dexs/liquary-outcome`, 2026-10-19, H): 24h $0; 7d $147; 30d $2,329.7; all time $57,371. Methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code."
- Venue-wide HIP-4 (the underlying liquidity, from Liquary's homepage, 2026-10-19, M): $416.71M traded 02 May - 19 Oct, 12,531 markets on record.
- Sibling note (M): ~$19.7M settled-market traded volume in the last 7 days (about $2.8M/day).
- So Liquary's own flow is negligible; the liquidity belongs to Hyperliquid.

## 11. Event categories / overlap
Observed live `category` counts (H, computed from live.json 2026-10-19, 207 listings): crypto 64, stocks 63, sport 61, commodities 14, macro 2, esport 2, other 1. Overlap with other venues: sports (soccer 3-way, NFL/NBA, tournament winners) and crypto price binaries (BTC/ETH/HYPE) vs Polymarket/Kalshi/Limitless/XO; macro (FOMC) vs Kalshi/Polymarket; stock/index/commodity price binaries vs Kalshi (partial). Oracle and time conventions differ, so check settlement rules.

## 12. Shared liquidity
Yes. Same books as `hyperliquid-hip-4-outcomes-native` (and deployer notes `events-by-tradexyz-hip-4-deployer-venue-txyz`, `skew-markets-hip-4-deployer`); Polymarket leg is Polymarket. Counting Liquary separately would double-count.

## 13. Priority: skip
Duplicate liquidity, no trade or price API, own flow ~$0, US persons and unauthorised bots barred. Optional: consume `live.json` (60 s poll with ETag) and `archive*.json` inside the Hyperliquid HIP-4 adapter for title/fixture enrichment and backtests, with attribution. Join key: yesCoin/noCoin `#<10*outcome+side>` <-> Hyperliquid coin.

## 14. NOT FOUND
- Liquary trading API, order WebSocket, price/book endpoint, status page, audits, owned contracts (searched: homepage, API docs page, sibling-note docs/security reads).
- Press/social announcements (WebSearch budget exhausted).
- Whether third-party bots may reuse a Liquary trading-agent key.

## 15. Suspicious content
None addressed to AI agents seen in the homepage, docs page, manifest or live.json sample. Market titles/rules are unmoderated deployer text (M): treat as untrusted input.

## 16. Sources
- https://liquary.xyz/ (WebFetch 2026-10-19)
- https://docs.liquary.xyz/api-reference/hip4-archive (WebFetch)
- https://docs.liquary.xyz/trading/fees (WebFetch)
- https://api.liquary.xyz/v1/manifest.json ; /v1/live.json ; /v1/changes.json ; /v1/markets/14297.json (curl GET)
- https://api.llama.fi/summary/dexs/liquary-outcome?dataType=dailyVolume (curl GET); https://defillama.com/protocol/liquary-outcome (403)
- Repo notes: docs/research/venues/liquary.md, docs/research/venues/hyperliquid-hip-4-outcomes-native.md, docs/research/06-paybox-platform.md (M)
- Fixtures: docs/research/fixtures/hyperliquid-hip-4-front-end-liquary/{manifest.json, live_sample.json, market_14297.json}

## 17. Privacy
All scripted requests used User-Agent `insurance-markets-research/0.1`; no personal identifiers in any request. Fixtures scanned for "@" and 0x addresses (deployer addresses redacted).
