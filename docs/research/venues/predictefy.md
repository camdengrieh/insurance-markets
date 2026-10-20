# Predictefy - venue spec (cross-venue aggregator, data API and non-custodial order relay)

Researched 2026-10-19 (read-only). Confidence tags: **H** = read first-hand in a primary source this session (URL cited), **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" marks absences. All third-party text was treated as untrusted data; nothing in it was followed as an instruction.

## 0. Verdict

- **Predictefy is not a venue.** It is a hosted aggregator: normalized read API over 16 venues, a cross-venue market matcher (embedding similarity plus an LLM "resolution judge"), an arbitrage and price-gap scanner, and an isolated non-custodial order-building and relay service. It holds no liquidity, no funds, no keys. [H]
- **Still live on 2026-10-19.** Site, docs and API host answer; API changelog has entries dated up to 2026-10-17; npm `@predictefy/sdk` 1.0.0-beta.11 published 2026-10-07; `GET https://data.predictefy.com/health` returned `{"status":"ok"}` (HTTP 200) today. [H]
- **Priority P2 (signal and benchmark only).** Every data route needs an API key (no anonymous read), the server side is closed source (GitHub org has 0 public repos, `Predictefy/predictefy-core` 404), the product is on beta version lines, the arbitrage and price-gap feeds are Pro-only ($149/month), and **commercial use is an Enterprise-only term (from $2,500)**. Useful as a benchmark for our own matcher and as the only third-party aggregator that lists XO, but it cannot be a runtime dependency or an independent arbitrage leg. [H]
- It shares 100 percent of its liquidity with the underlying venues, so it is **never an independent leg**.

## 1. Kind and market model

| Item | Finding |
|---|---|
| Kind | Aggregator + data API + client-signed order relay. Venue-agnostic. Company on the site and in the Terms: Predictefy Inc., Wilmington, Delaware. [H: https://predictefy.com/en/terms] |
| Own market model | None. Unified schema normalizes each venue's market: `marketId`, `title`, `outcomes[{outcomeId,label,price,priceBasis}]`, `volume24h`, `liquidity`, `url`, `asOf`, `provenance`, `capabilities{read,trade,depth,history}`. Prices are probabilities 0..1. [H: https://docs.predictefy.com/llms.txt] |
| Order books | Outcome-keyed. Real CLOB depth on most venues; `synthetic: true` for reconstructed books (Rain; Myriad AMM markets). Synthetic books can never qualify as executable. [H: https://docs.predictefy.com/reference/venues/ via llms-full.txt] |
| Served venues (16 + `router`) | polymarket, kalshi, opinion, hyperliquid, limitless, polymarket_us, sxbet, myriad, gemini, rain, predictfun, pascal, xo, pred, predictstreet, novig. [H: llms.txt] Landing page MCP demo says "17 venues" [H, inconsistent with docs, treat docs as the contract]. Dark (implemented, not served): Smarkets, PredictIt. [H] |
| Cross-venue linking | `GET /v1/clusters` (delist-stable cluster ids), `similarity` = raw embedding score "deliberately not a calibrated probability"; per-pair `matchQuality{verdict,judgedAt,confidence,differenceKinds,vetoes}`; arbitrage rows carry `resolutionEquivalence`, `matchScore` 0-100, `matchBand` (verified 100 / minor 85-99 / material 60-84 / hidden below 60 or vetoed). Vetoes: polarity inversion; close dates more than 21 days apart. [H: https://docs.predictefy.com/guides/cross-venue/ and cookbook/arbitrage-scanner in llms-full.txt] |
| Executable-edge gates (`label: "arbitrage"`) | Live non-synthetic asks on both legs; both markets open; full depth at requested `contracts`; VERIFIED per-venue taker fee model; resolution-equivalence gate; positive net edge after taker fees and worst-case settlement commission. Network (gas) costs are **not** included. Anything else is labelled "indicative price discrepancy" with machine-readable `reasons` (`synthetic_book`, `insufficient_depth`, `unverified_fees`, `market_not_open`). [H: llms.txt, cross-venue guide] |

## 2. Chains and collateral

- Predictefy itself: none. "Predictefy holds no funds and no keys"; "There is no withdrawal and no bridge-out route" (each venue is a custody island). [H: llms.txt "Funding"]
- Funding helpers only return unsigned artifacts or quotes: `GET /v1/funding/{venue}/requirements`, `POST /v1/funding/{venue}/steps` (Polymarket wrap/approve only; Hyperliquid readiness only), `GET /v1/bridge/quote` (LI.FI; any LI.FI chain/token), `POST /v1/bridge/session` (Glide; Hyperliquid and SX Bet). [H]
- Per-venue signer chains as documented by Predictefy (relevant to PayBox EVM reach): Polygon EOA (Polymarket), Base EOA (Limitless), BSC EOA (Opinion, Predict.fun, Myriad), Arbitrum EOA (Rain), Hyperliquid master or approved agent EIP-712, XO chain 3223 smart account (`signatureType` 3, ERC-1271; type 0 EOA contested by XO's own docs), ADI Chain EOA (PredictStreet), Solana-format Ed25519 (Pascal). Non-wallet auth: Kalshi RSA key, Gemini HMAC, Polymarket US Ed25519 request auth, Novig access token. [H: https://docs.predictefy.com/guides/trading/ via llms-full.txt, "Before funding" table]

## 3. Read API

Status: **official-authenticated**. Docs: https://docs.predictefy.com/ (agent-oriented text at `/llms.txt` 29.9 KB and `/llms-full.txt` 877 KB). Reference: https://docs.predictefy.com/api/ (generated from an OpenAPI 3.1 spec; "The raw spec file is not published as a standalone download today"). [H]

- Base URL: `https://data.predictefy.com`. Header `Authorization: Bearer pk_live_...` on **every** route; anonymous = `401 UNAUTHORIZED`. Only `/health` (verified: 200 `{"status":"ok"}`) and the docs are open. `/healthz` and `/v1/health` answered 401. [H, live GETs 2026-10-19; fixtures below]
- Key creation is at `portal.predictefy.com/keys` ("Sign-up is free and needs no invite"). **Not done**: creating an account/key is prohibited for this task, so no authenticated response was observed. [H for docs claim; response shapes below are therefore docs-illustrative only]
- Execution origin and WebSocket origin are "shown in your dashboard" (not published); execution origin has "no implicit default". [H]
- Key endpoints (all `GET` unless noted; full list in llms-full.txt "API operations"): `/api/{exchange}/fetchMarkets|fetchMarket|fetchEvents|fetchEvent|fetchSeries|fetchCategories|fetchTags`, `/api/{exchange}/fetchOrderBook`, `POST /api/{exchange}/fetchOrderBooks`, `/api/{exchange}/fetchTrades` (recent tape, not time-ranged; XO answers 501 NOT_SUPPORTED because XO has no public tape), `/api/{exchange}/fetchOHLCV`, `/api/{exchange}/has`, `/api/router/fetchMarketMatches|fetchMatchedMarkets|compareMarketPrices|fetchHedges|fetchMatchedMarketClusters|fetchEventMatches|fetchRelatedMarkets|fetchArbitrage`, `/v1/clusters[/{id}]`, `/v1/discrepancies[/history|/{clusterId}/qualification]`, `/v1/sports/{facets,screen,competitions,teams,fixtures,...}`, `/v1/mappings` (POST), `/v1/venues/metrics`, `/v1/webhooks`, `/v1/usage`, `/v1/traders/*`, `/api/feeds/*` (Binance/Chainlink reference tickers). Resolution data: no dedicated resolution endpoint found; market `status` and settlement claims are venue-side. [H]
- Envelope: `{ success, data, meta, page }`; errors `{ success:false, error:{code,message,retryable,requestId} }` (real 401 shape captured). Cursor pagination (`limit` max 100, cursors expire 60 s per hop by default); `page.total` can be `null` ("not counted, never zero"). Nullable `netEdge`, `roi`, `fee`, `vwap` mean "not priced". [H]
- Rate limits (fixed 60 s window per key): Free 60/min, Builder 300/min, Pro 3,000/min; keys 1/3/10; WebSocket streams 2/20/100. [H: https://docs.predictefy.com/guides/rate-limits/ via llms-full.txt]
- WebSocket: `/v1/stream` on the dashboard-shown origin; channels `orderbook`, `trades`, `subscribeFeedTicker`, `subscribeArbitrage` (Pro); snapshots and updates carry the full book; 2 credits per connection-minute; Polymarket pending-fill (mempool) stream 800 credits per minute, Pro only. [H]
- Freshness: reads are snapshots (`asOf`), not live-by-default; arbitrage surface republished about every 30 s; live-subscription books accepted up to 600,000 ms by code default, **production runs 7,200,000 ms (2 h)** per docs, so per-leg `asOf` must be gated by the consumer. [H: cross-venue guide]
- Packages: `@predictefy/sdk`, `@predictefy/mcp` (49 tools default, 59 with `MCP_ENABLE_TRADE`), `@predictefy/cli` (npm, MIT, 1.0.0-beta.11, created 2026-08-03 / 2026-08-04, last modified 2026-10-07; 12 and 11 versions), PyPI `predictefy` 1.0.0b9 (MIT, released 2026-08-10 .. 2026-10-07). [H: registry.npmjs.org, pypi.org JSON]

Costs (credits): 1 metadata/search/price snapshot; 2 trades or candles; 5 order-book snapshot, history, cross-match lookup, order submit/cancel; 10 cross-venue comparison or price-gap query; 15 arbitrage query. Bulk = base x ceil(items/100). Build is free. [H]

## 4. Trade path

Hosted execution is a **separate service** ("not the reads API, which never proxies it"). Flow: `POST /v1/exec/{venue}/orders/build` (server does order maths, returns an unsigned EIP-712 artifact, binary permit or authless REST artifact) -> **your signer signs in your own process** -> `POST .../orders/submit` -> server revalidates owner binding, artifact bounds and spend caps, relays to the venue. Also `cancel`, `modify`, `refresh`, `GET .../orders|trades|positions`. Every POST needs an `Idempotency-Key`. New keys are `read` only; `trade` scope is opt-in per key. Spend caps default **100 USD per order** and **1,000 USD per key per rolling 24 h**. Hosted `fetchBalance` is 501. "There is no generic server-side signing route." [H: llms.txt, trading guide]

- `GET /v1/exec/venues` is the authoritative live lane list (key-gated; **not read**). Docs say 14 ARMED lanes on 2026-09-02: gemini, hyperliquid, kalshi, limitless, myriad, novig, opinion, pascal, polymarket, polymarket_us, predictfun, predictstreet, rain, xo (`pred` darked 2026-08-13; `sxbet` client-side only). [H for the doc statement, M for current state]
- **XO lane: build + submit + cancel advertised, but "Nothing has ever been submitted to XO"**; hosted XO needs caller-owned XO CLOB key/secret/passphrase at submit; funding is "six-decimal Bridged USDC (XO) on chain 3223" and "No numeric minimum or verified deposit route is published". XO access is "partner-provided; the sources do not document its signup or KYC flow". Social-login XO accounts have an unresolved ERC-1271 wrapped-signature problem (dated 2026-08-23). [H: https://docs.predictefy.com/guides/trading/xo/]
- Hosted submits leave from Predictefy's servers: "Hosted requests use eligible regional egress"; Limitless returns `403 GEO_BLOCKED` from restricted egress (verified 2026-08-16 per docs). [H]

## 5. PayBox reachability: **partial**

- Not in PayBox catalogs: `discover_plugins("predictefy")` returned an empty list; `discover_services("predictefy prediction market data")` page 1 returned unrelated x402 vendors (agentstools.dev, x402Atlas), no Predictefy. Only the first page was read (`has_more: true`). [H, read-only discovery calls 2026-10-19]
- Predictefy is billed by API key plus Stripe credits, not x402/HTTP 402, so `use_service` cannot pay it. [H: docs; no 402 flow documented]
- Read path from a PayBox Open Plugin is plausible in principle: plain HTTPS GET/POST JSON, well under the 10 s operation budget (doc 06). But brokered secrets are **owner-level headers** (doc 06 section 2), so a plugin would use one shared owner key, which collides with Predictefy Terms section 16 ("Sharing, publishing, or reselling keys is prohibited") and with the Enterprise-only commercial-use term. WebSocket from a plugin: NOT FOUND in PayBox docs (doc 06). [M]
- Trade path via a PayBox EVM wallet: Predictefy artifacts are standard EIP-712 for Polygon, Base, BSC and Arbitrum venues, so `request_wallet_sign` (typedData) could in principle sign them; the PayBox sign-then-submit half is **unverified end to end** (doc 06 gate 8 PARTIAL) and I did not call any signing tool. XO needs chain 3223, absent from the PayBox chain catalog (doc 06 gate 4). [M]
- Recommendation: our plugin should talk to venues directly and use Predictefy at most as an off-path research input.

## 6. Fees

- Predictefy platform: subscription plus credits. Free $0 (25,000 credits/month, top-up each UTC month, no carry-over); Builder $48.88/month or $469.25/year (250,000 credits; was 500,000 until 2026-10-13); Pro $149/month or $1,430.40/year (2,000,000; was 5,000,000); Enterprise from $2,500/month (5,000,000+). Extra 100K credits: $11 Builder, $5.50 Pro. All purchases "FINAL AND NON-REFUNDABLE EXCEPT WHERE MANDATED BY LAW" (Terms 22). **No per-trade platform fee or builder fee documented** (NOT FOUND, searched llms-full.txt for builder fee, platform fee, markup, referral, revenue share; Polymarket V2 `builder` code defaults to zero bytes32). [H: https://docs.predictefy.com/guides/credits/ via llms-full.txt; https://predictefy.com/en/terms]
- Arbitrage polling budget: 15 credits per `fetchArbitrage` call. Pro's 2,000,000 credits = about 133,000 calls/month = one call every about 19 s if nothing else is used (my arithmetic from the published weights). Revalidation costs 5 credits per leg per book. [H weights, M arithmetic]
- Venue fees are the venues' own (e.g. XO `fee = size x (rate/10,000) x price x (1 - price)`, category rate "currently 0" per Predictefy's reading of XO's public fee endpoint, 2026-08 docs; doc 10 found a conflicting `effectiveFeeConfig`, so unverified). Predictefy only labels a row executable when the venue fee model is VERIFIED; a venue without a verified model yields a null edge, not an optimistic one. [H/M]

## 7. Resolution and dispute risk

Predictefy resolves nothing; each venue's oracle settles. The risk it adds is **match risk**: the judge compares published rules, "it is not a probability that the markets settle identically, and trading a pair below 100 is your own risk". Terms 8: "contract specifications, cutoff dates, and resolution rules may vary. Users must independently verify market terms." Terms 5 lists "divergent settlement rules, and oracle disputes" as user-borne risks. The only independent matcher audit found in repo research (Prediction@Illinois on Kairos, not Predictefy) is doc 16; **no calibration or precision figure for Predictefy is published** (NOT FOUND, searched docs for precision, accuracy, calibration). [H/M]

## 8. Geo, ToS, automation (quoted sparingly)

- Terms of Service last updated August 19, 2026 (H: https://predictefy.com/en/terms). Predictefy "is strictly a technology and data software provider", not a broker. User must be 18+.
- Automation: API access "is granted on a revocable, non-exclusive basis subject to the rate limits and quotas of your subscription tier" (15); programmatic use is the product. Prohibited uses include "automated scraping, and reverse engineering" (19), so use the API, never scrape the site. "You retain full responsibility for automated trading workflows" (18).
- Commercial: "Reselling or operating competing public data APIs using Predictefy data streams requires a separate commercial enterprise license" (17). Docs (changelog 2026-10-13, credits page, llms.txt) state **"commercial use on Enterprise only"**. Whether an internal arbitrage bot counts as commercial use is not defined (NOT FOUND; ask vendor). Our own aggregation-design already rejects runtime dependence and redistribution.
- Disputes: binding AAA arbitration in Wilmington DE, class-action waiver, liability cap greater of $100 or six months of fees. [H]
- Geo: no Predictefy-level country list in the Terms (NOT FOUND, searched Terms). Venue-level rules apply and are the user's responsibility (Terms 13); Limitless lane geo-gated; Novig needs US egress; Pascal and PRED list restricted countries. [H]

## 9. Liquidity

- Predictefy has no market, TVL or open interest of its own. Venue-size metrics exist at `GET /v1/venues/metrics` (1 credit) but are key-gated and were not read. [H]
- Landing-page "Users have used Predictefy" and "Prediction Market Venues integrated" counters are JS-animated; the server HTML renders `0+` and the targets were not recoverable (NOT FOUND). Landing claim "Historical data dating back to 2020" conflicts with the docs (history window 7 days Free / 12 months Builder / unlimited Pro; "proven stored-history coverage" for 11 venues) so treat the landing claim as L. [H/L]
- Per-venue volumes inherited from the underlying venues; XO and Polymarket US have no `volume24h` mechanism in Predictefy (`has.volume24h` false). [H]

## 10. Event-category overlap (where arbitrage can exist)

- Cross-venue matched sets are listed for Polymarket, Kalshi, Limitless, Opinion, Hyperliquid, Predict.fun, Myriad, Gemini and more (landing page and cookbook). Docs example is a Fed rate-cut market on Kalshi vs Polymarket (economics/macro). Sports have a dedicated screen (`/v1/sports/screen`, live since 2026-09-29): moneyline, match_result, spread, total, team_total, btts, halftime_result, exact-line cells with gross and net-of-fee prices. A canonical taxonomy exists (`category=politics` shown), but the full category list needs a key to enumerate (NOT FOUND without a key). Reference feeds Binance/Chainlink exist for crypto-price context. [H for existence, M for category breadth]
- XO overlap: Predictefy lists `xo` and its cluster store may include XO markets, but this was **not verified** (needs a key); XO has no public tape and no volume24h there. [H]

## 11. Adapter spec (if built)

Role: **read-only signal and benchmark source**, never a leg, never the sole matcher.

1. Capability-honest `PredictefyAdapter` returning `NOT_SUPPORTED` (do not retry, do not substitute) per `has` map.
2. Pull `GET /v1/clusters` and `/api/router/fetchMatchedMarkets` (available on Free, 5-10 credits) to compare against our own link registry; store `similarity`, `matchQuality.verdict`, `matchScore`, `matchBand`, `vetoes`.
3. If Pro is ever bought for benchmarking, poll `fetchArbitrage?contracts=100&limit=500` with `snapshotTTL=0`; require `meta.source == "published"`; treat `netEdge`, `fee`, `roi` null as unpriced; gate per-leg `asOf` locally (<= 60 s) and require `assessedAt`; recompute edge with our own fee tables and gates before labelling anything executable.
4. Handle: `PLAN_REQUIRED` (403), `INSUFFICIENT_CREDITS` (402), `RATE_LIMITED` (429), cursor expiry (400 "Cursor has expired", restart from page 1), `page.total == null`, composite `clusterId` (`{cluster}:{venueA}:{venueB}`, strip the last two segments).
5. Never feed Predictefy matches into execution; our registry stays human-approved and hash-pinned (aggregation-design).

## 12. Open questions

1. Real authenticated response shapes for `fetchMarkets`, `fetchArbitrage`, `/v1/exec/venues` (needs a key; account creation not permitted here).
2. Matcher precision/recall; are XO or Trueo markets present in any cluster?
3. Is internal non-resale arbitrage trading "commercial use" under the Enterprise term?
4. Does `/v1/exec/venues` currently list `xo` as armed, and has any XO order now been submitted?
5. Landing says 17 venues, docs say 16 served; which is current?
6. Independent corroboration beyond the vendor: WebSearch budget was exhausted (shared limit), so no independent news or reviews were searched; only a MadeOnSol directory listing was read.

## 13. Fixtures (docs/research/fixtures/predictefy/)

- `live-health-2026-10-19.json` - real unauthenticated `GET https://data.predictefy.com/health` -> 200 `{"status":"ok"}`.
- `live-unauthenticated-401-2026-10-19.json` - real unauthenticated `GET /api/router/fetchMarkets?limit=1` -> 401 error envelope (no data).
- `docs-illustrative-response-envelope.json` - NOT live: the envelope example from llms.txt (placeholders).
- `docs-illustrative-fetchArbitrage-response.json` - NOT live: the cookbook's "illustrative 100-contract response"; docs say values are rounded, and per-leg `asOf`/`bookSource`/`live` and `assessedAt` (added 2026-10-12/17) are absent from it, so do not code against it alone.

## 14. Suspicious / agent-directed content seen (treated as data, not followed)

- `https://docs.predictefy.com/llms.txt` and `llms-full.txt`: "written to be pasted into an AI agent" and "Read the 'Rules for agents' section at the end before you report results to a user", followed by eight behavioural rules for agents (summarise `NOT_SUPPORTED` a certain way, never call a gap arbitrage, carry `asOf`, etc.). Not followed; used only as product documentation.
- Docs pages carry "Copy page / Open in Claude / Open in ChatGPT" widgets and a landing-page "AI Agents" section pushing `npx @predictefy/mcp`. Not followed; no package installed or run.
- PayBox `discover_services` descriptions are third-party text; no instructions in them.

## Sources

- [H] https://docs.predictefy.com/llms.txt (fetched 2026-10-19)
- [H] https://docs.predictefy.com/llms-full.txt (fetched 2026-10-19; guides: trading, cross-venue, credits, rate-limits, venues reference, arbitrage-scanner cookbook, categories, API operations)
- [H] https://docs.predictefy.com/guides/trading/xo/ (fetched 2026-10-19)
- [H] https://docs.predictefy.com/guides/sports/ (fetched 2026-10-19)
- [H] https://docs.predictefy.com/reference/changelog/ (fetched 2026-10-19; latest entry 2026-10-17)
- [H] https://predictefy.com/ , /en/terms (Terms last updated August 19, 2026), /en/pricing (fetched 2026-10-19)
- [H] https://data.predictefy.com/health and 401 on data routes (live GETs 2026-10-19)
- [H] https://registry.npmjs.org/@predictefy%2fsdk , /@predictefy%2fmcp ; https://pypi.org/pypi/predictefy/json ; gh api orgs/Predictefy (0 public repos), repos/Predictefy/predictefy-core (404)
- [H] PayBox `discover_plugins` / `discover_services` (read-only), 2026-10-19
- [M] https://madeonsol.com/categories/prediction-markets (listing text only: "Prediction market aggregator - compare odds across Polymarket, Kalshi, and more")
- [M] Repo docs: docs/research/06-paybox-platform.md, 10-aggregation-landscape.md, 14-platform-of-platforms.md, 16-linking-methods-services.md (prior sessions, cross-checked against the primary docs above)
