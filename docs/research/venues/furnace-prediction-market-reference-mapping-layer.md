# Furnace (furnaceinfra.com) - prediction-market reference / mapping layer - venue spec

Researched 2026-10-19. READ-ONLY. Sources: casino.org article, Furnace's public website and the public JS bundle it serves (which embeds the full v2 API docs), a handful of unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`. No account, no key, no sign-up form submitted, no POST, no PayBox tool used. Third-party text treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak/stale.

Limitation: the shared WebSearch budget was exhausted before I could search, so there is no independent corroboration beyond the casino.org article and the company's own pages.

---

## 0. Bottom line

1. **Furnace is a data/identity vendor, not a venue.** It sells a canonical-ID and cross-venue mapping API (plus, per marketing, normalized prices/depth) to institutions. It has no order book, no collateral, no settlement, no trading and no liquidity. It can never be an arbitrage leg. (H: site copy "Furnace is neutral infrastructure - not an exchange, broker, or consumer app.")
2. **Live, new, and directly relevant to our matcher.** Emerged from stealth 2026-10-15 (H, casino.org). Covers exactly three venues: Kalshi, Polymarket (international), Polymarket US (H, API docs). The "one more operator" in the press is therefore Kalshi.
3. **Access is gated and enterprise-only.** API needs an `x-api-key` and the site says "We selectively grant API access to institutions". No self-serve signup, no public pricing, rate limits "per your agreement". An agent/plugin cannot onboard without a human business relationship. (H)
4. **The documented v2 API is "Identity & Reference Edition": identity, structure and settlement-parity only. No prices, no order books, no trades endpoint is documented.** `notional24h` is the only market-data-like field. Marketing says live pricing and depth exist, but that is not in the v2 docs I read. (H for docs content, M for the marketing claim)
5. **Useful to us as a reference/benchmark and possible paid signal source, not as an adapter.** The settlement-parity verdicts (`/settlement`) and `EQUIVALENT_INVERTED` orientation flags are exactly the failure modes a cross-venue scanner must handle. Worth reading the docs for design ideas; worth requesting access only if we want a second opinion on our own matcher. Redistribution/ToS for API data not published (terms page is about the website).
6. **adapter_priority = P2 (signal-only)**, bordering on skip for the plugin itself. Reason: no tradable liquidity, gated access, no prices documented; value is as a matching/settlement-divergence oracle.

---

## 1. Is it still live? (2026-10)

| Evidence | Result | Tag |
|---|---|---|
| casino.org "Prediction Market Infrastructure Firm Furnace Raises $3.5M Seed Round", published 2026-10-15, updated 2026-10-16 | Emerged from stealth; $3.5M seed | H |
| https://furnaceinfra.com/ | HTTP 200 (Cloudflare, React SPA), legal name in JSON-LD "Furnace Systems Corporation" | H |
| `GET https://api.furnaceinfra.com/v2/events?limit=1` (no key) | HTTP 403 `{"message":"Forbidden"}`, `x-amzn-errortype: ForbiddenException`: API Gateway is up and enforcing keys; matches the docs' "403 Forbidden = missing or invalid key" | H |
| Terms of Service last updated 2026-08-12; docs sample `asOf` values 2026-10-05/06/12; docs show Python SDK v0.2.0 | Actively maintained | H |

The discovery hint said the official site was "NOT FOUND" (furnace.xyz/.io/.markets probed). Correct domain is **furnaceinfra.com** (furnacesystems.com is a parked GoDaddy-for-sale page, not theirs; LinkedIn company slug is `furnacesystems`). Found via the LinkedIn company page summary (M, WebFetch of a LinkedIn page) and confirmed by the live site and the JSON-LD (H).

Company facts: New York; 2-10 employees (M, LinkedIn summary); LinkedIn lists Matthew Siff and Andrew Siff (M). $3.5M seed led by North Island Ventures with Reciprocal Ventures, Reverie, VanEck; angels Commonweal, DTCC, Public.com (H casino.org; site footer links these investors, H). Adjacent Markets Inc. uses Furnace reference data to identify equivalent contracts across venues for its indices (M, LinkedIn summary; see docs/research/venues/adjacent.md).

---

## 2. Kind and market model

- **Kind:** aggregator-or-data / reference-data vendor. Not a market. (H)
- **Data model (not a trading model):**
  - **Event**: the real-world occurrence ("Fed decision in Oct 2026?"). ULID `eventId`. `taxonomy.domain` in SPORTS, POLITICS, ECONOMICS, CRYPTO, ENTERTAINMENT, WEATHER, WORLD, OTHER.
  - **Market**: canonical reference for one defined outcome, id `perId` (26-char ULID). "Contracts that pay on different outcomes are never merged" (e.g. "Fed cuts 25" and "Fed holds" are separate; "CPI >= 3.0%" and "CPI 3.0-3.5%" are separate). `spec` gives typed semantics: `kind` (MONEYLINE, SPREAD, TOTAL, TEAM_TOTAL, EXACT_SCORE, SET_WINNER, THRESHOLD_ABOVE/BELOW/THRESHOLD, RANGE_BIN, NAMED_OUTCOME, UNKNOWN), `line`, `bounds`, `side`, `scope`, `units`.
  - **VenueListing**: one venue's product mapped to the market, with permanent `listingId`, `venueMarketId`, `side` (LONG/SHORT/YES/NO), `orientation` ALIGNED or INVERTED, `tokens {yes,no}` (Polymarket only), `url`, venue `status`.
  - **pairs[]**: per pair of listings: `EQUIVALENT`, `EQUIVALENT_NATIVE_TERMS_DIFFER`, `EQUIVALENT_INVERTED`, `CONFLICT`, `UNKNOWN`, each with a `settlement` verdict (`no_divergence_found` | `diverges` | `indeterminate`) and `divergenceCount`.
  - **provenance** per market: `reviewed` | `structural` | `automated`.
  - **sibling**: Polymarket US moneylines are two-sided instruments; each side is a separate market linked via `sibling`.
  - Not served: containment / partition / complement relations between related markets (so no "A implies B" or "sum of buckets = 1" graph; our scanner must build those itself). (H, docs "The model")
- All H, from the embedded v2 docs at https://furnaceinfra.com/api-docs (route list in bundle: /api-docs, /api-docs/concepts, /api-docs/reference, /api-docs/endpoints/*, /api-docs/operations/*).

## 3. Chains and collateral

N/A. Furnace holds no funds. Underlying venues: Kalshi (USD, CFTC-regulated), Polymarket international (Polygon, USDC), Polymarket US (USD, CFTC-regulated DCM). Those are covered by the parallel workflow. (M)

## 4. Read API

| Item | Detail | Tag |
|---|---|---|
| Existence | Official, **authenticated** (enterprise, selective grant) | H |
| Base URL | `https://api.furnaceinfra.com` (AWS API Gateway) | H |
| Docs | https://furnaceinfra.com/api-docs (public, rendered by the SPA; the same markdown is embedded in the public JS bundle `/assets/index-*.js`). Docs title "Furnace API v2 - Identity & Reference Edition" | H |
| Auth | `x-api-key` header. Same key authorises the Python SDK install from a private index `https://key:<API_KEY>@api.furnaceinfra.com/sdk/simple/` | H |
| Access process | `/request-access` and `/partner` forms ("Work with Furnace"; "We selectively grant API access to institutions looking to evaluate Furnace's data, contribute feedback on schema and standards..."); ops contact listed on the site | H |
| Rate limits | "per API key according to your agreement"; example plan "Standard": quota 1,000,000 requests/MONTH, throttle rateLimit 50, burstLimit 100 (docs example, not a published tier). No `X-RateLimit-*` or `Retry-After` headers; 429 uses gateway `{"message": ...}` shape; back off exponentially | H |
| WebSocket / push | NOT FOUND in docs (searched docs text for websocket, stream, webhook). Change detection is polling: `since=` with `scope=all|structure`, and `POST /v2/markets/watch` | H |

Key endpoints (all GET unless noted; JSON; `Cache-Control: no-store` except registry which is `public, max-age=300` with ETag):

- `GET /v2/events` (params: limit, cursor, status, minVenues, matched, venue, since, scope, sort `-notional24h`, domain, fields, ref) - returns `{data[], page{next,limit,count}}`
- `GET /v2/events/{eventId}`
- `GET /v2/markets` (params add eventId, settlement=no_divergence_found|diverges|indeterminate) and `GET /v2/markets/{perId}`
- `GET /v2/markets/{perId}/listings`
- `GET /v2/markets/{perId}/rules` - venue rules text passed through verbatim (Kalshi `rulesPrimary`/`rulesSecondary`; Polymarket `description`, `resolutionSource`; Polymarket US `description`)
- `GET /v2/markets/{perId}/settlement` - per-listing readings across a registry of attributes (`tie`, `announcedNotEffective`, `contestNotHeld`, `contestNotCompleted`, `selectionAbsent`, `outcomeDeadline`, `extraPeriods`, `seatAttribution`, ...) and a parity verdict; statuses stated / conflicting / silent / unread; "Silence is not agreement"
- `GET /v2/settlement/registry`
- `GET /v2/resolve?ref=<venue>:<kind>:<value>` and `POST /v2/resolve` (up to 500 refs); ref grammar covers `kalshi:market:KXFEDDECISION-26OCT-C25`, `polymarket:market:<id>`, `polymarket-us:market-slug:<slug>`, `polymarket-us:long|short:<id>`, `canonical:ticker:` / `canonical:market-ticker:`
- `POST /v2/markets/watch` (up to 500 perIds, returns those changed since `since`)
- `GET /v2/account/usage`
- Fields the docs mention that a scanner could use: `notional24h` (USD over venue-reported trailing 24h, summed across venues), `tickSize` (dollars per contract), `times {startAt, tradingCloseAt, settlementDeadline, updatedAt, structureUpdatedAt}`, `isTradeable`, `listings[].tokens` (Polymarket CLOB token ids for yes/no).
- Not documented: any price, bid/ask, order book, depth, trade or history endpoint, despite homepage claims of "normalized, cross-venue pricing, depth, and historical market state via API". Treat as roadmap or a separate edition (M).

Real response shapes: **no public unauthenticated read API exists, so no live market sample could be taken.** Saved under `docs/research/fixtures/furnace-prediction-market-reference-mapping-layer/`:
- `unauth-get-v2-events.txt` - real 403 `{"message":"Forbidden"}` from the live gateway (H)
- `docs-examples-v2.md` - the documentation's own example responses for events, markets (incl. INVERTED Senate-control example) and resolve. These are docs examples, not live data (H for being what the docs say).

SDK: official Python `furnace-api` 0.2.0 from a key-gated private index (H). We must not install third-party code in this research; no SDK was fetched.

## 5. Trade path

None. Furnace does not accept orders. Marketing mentions "routing infrastructure" and "event market data and execution" on the partner page (H, site copy) but no order/routing endpoint is documented. Orders must go to Kalshi, Polymarket, Polymarket US directly. (H for docs absence, M for the marketing "routing" claim)

PayBox reachability: **no** (nothing to trade). Reason: not a venue. The mapped venues are separate questions: Polymarket international is Polygon-USDC (EVM-reachable via PayBox signed orders); Kalshi and Polymarket US are US-regulated fiat venues with KYC accounts, not wallet-reachable. (M, cross-reference the parallel venue notes)

## 6. Fees

No public pricing. Access by agreement; docs example plan "Standard" with a 1M requests/month quota. Trading fees: none (does not trade). (H for absence; pricing NOT FOUND, searched site bundle, terms, partner copy.)

## 7. Resolution mechanism and dispute risk

Furnace does not resolve anything. Each listing keeps the venue's own rules: "each venue instrument stays distinct, with its own terms and resolution details" (H, casino.org quoting company; `/rules` endpoint). The valuable part for us: the `/settlement` endpoint exposes **where venues' rules diverge** (ties, postponed events, late-effective announcements, contest not held, extra periods) and returns `indeterminate` where it cannot read the text. Docs state pair status "describes the structural mapping, not settlement parity, fungibility, or a recommendation to trade" and "Provenance is not a substitute for settlement or execution review." This is a direct statement that a mapped pair is not a riskless arbitrage. Example in the docs: the Senate-control market is `EQUIVALENT` for Kalshi/Polymarket but settlement verdict `diverges`. (H)

## 8. Geo, ToS, automation

- Website ToS (updated 2026-08-12) forbids automated scraping/crawling of the *Website* "except as permitted by Furnace in writing or by standard search-engine protocols". Quote: "Access, monitor, scrape, crawl, index, harvest, or extract data from the Website through automated means". I read the public JS bundle with a handful of single requests; I did not crawl. (H)
- API-specific data licence / redistribution terms: NOT FOUND (searched terms page text in bundle and docs). The ToS description says it governs "website, API, and canonical reference data" but I only saw the website-use clauses quoted above; redistribution into a plugin would need written clearance. (M)
- Geo: no geo-blocking statement found. Audience is institutions. Cloudflare in front of the site. (L)
- No instructions aimed at AI agents found in the pages, docs or bundle. (H)

## 9. Liquidity

None of its own. Only volume-like field is `notional24h` per event/market, aggregated from venues (H, docs). No Furnace-level volume/TVL figures published. Underlying venue volumes belong to the parallel venue notes.

## 10. Event-category overlap

The docs' own examples cover ECONOMICS (Fed decision, CPI), POLITICS (Senate control, NYC mayor in the website demo) and SPORTS (moneyline/spread/total/set-winner/exact-score `kind`s; "Large sports events run to thousands of markets"). That is precisely where Kalshi / Polymarket / Polymarket US overlap, so a Furnace feed would be pre-labelled candidates for arbitrage. Only 3 venues, all of which we already cover directly. (H)

## 11. Shared liquidity

N/A (not a market). Every listing it shows is a copy of a Kalshi, Polymarket or Polymarket US listing; it is **not an independent arbitrage leg**. Polymarket US and Polymarket international may be separate order books but the Polymarket US side is a two-sided instrument split into two Furnace markets (LONG/SHORT) linked by `sibling` - important when building legs.

---

## 12. How it would plug into our aggregation layer

- Role: optional **matcher oracle / cross-check**, not a venue adapter. Call `POST /v2/resolve` with our venue refs to get a `perId`, then `GET /v2/markets/{perId}` to read `pairs[].status` and `settlementSummary.verdict`; gate any suggested arbitrage on `provenance in (reviewed, structural)` AND `pairs[].status in (EQUIVALENT, EQUIVALENT_INVERTED)` AND `settlement.verdict == no_divergence_found`.
- Prices still come from each venue's own API.
- Design takeaways to copy into docs/market-linking-design.md: (1) never merge different-outcome contracts; (2) model `orientation` ALIGNED/INVERTED per listing (payoff X becomes 1-X); (3) store a settlement-attribute registry and treat "silent" as not-equal; (4) permanent ids with redirect-on-merge; (5) treat two-sided venue instruments (Polymarket US) as two markets with a sibling link; (6) no containment/partition graph is offered, so that is a gap we fill ourselves.
- Blockers: gated access (human BD needed), no pricing published, no price/book endpoints documented, API redistribution terms unknown.

## Open questions

- Does Furnace offer (or plan) price/depth/history endpoints and websockets (homepage claims "real-time pricing and depth from every connected venue")? Not in v2 docs.
- API licence: may output be used in an open-source plugin / by end users, or only internally by the licensee?
- Pricing/quota beyond the "Standard" docs example; is there any evaluation tier?
- Which additional venues are coming ("additional venues are being added")? Relevant if Limitless/Opinion/Predict.fun etc. get mapped.
- Independent coverage: only casino.org located; no second source (search budget exhausted).

## Sources

- https://www.casino.org/news/furnace-prediction-market-infrastructure-firm-raises-3-5m/ (H, 2026-10-15/16)
- https://furnaceinfra.com/ and its JS bundle https://furnaceinfra.com/assets/index-BdcScwQK.js (H; contains home/partner/terms copy and the full v2 API docs; route /api-docs)
- https://furnaceinfra.com/robots.txt, /sitemap.xml (H; sitemap lists only /, /privacy, /terms)
- https://api.furnaceinfra.com/v2/events?limit=1 unauthenticated GET -> 403 (H)
- https://www.linkedin.com/company/furnacesystems/ (M; WebFetch summary, source of the website URL, team and the Adjacent partnership)
- https://furnacesystems.com/ (H: parked GoDaddy page, not the company)
- Local: docs/research/venues/adjacent.md (cross-reference)
