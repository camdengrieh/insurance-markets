# Kalshi Prime LLC (fka Kinetic Markets LLC) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, `curl` GETs to documented Kalshi API hosts with generic User-Agent `insurance-markets-research/0.1`. No account, key, wallet, signing, POST/PUT/DELETE, browser automation or PayBox tool. The web-search budget for the session was exhausted, so no news/press search was possible (stated, not worked around).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak or stale.

---

## 0. Bottom line

1. **Not a venue.** Kalshi Prime LLC is a Kalshi-affiliated Futures Commission Merchant (FCM, a clearing/brokerage intermediary), not an exchange with its own order book. (M: from a third-party tracker; the official page was unreachable.)
2. **Liquidity is 100% Kalshi's.** An FCM routes customers to the Kalshi exchange and clears through Kalshi's clearing house. It can never be an independent arbitrage leg. (H for how Kalshi FCMs plug in, via Kalshi's FCM API docs; M for this particular firm.)
3. **Existence of the entity is evidenced only by one third-party tracker**; I could not confirm the entity, its product, or the "kalshi.com/kinetics" page from Kalshi itself (HTTP 429 / Vercel bot checkpoint, not bypassed).
4. **adapter_priority = skip.** Nothing to adapt. Kalshi itself is covered by a parallel workflow. The one useful finding is that Kalshi now runs a **margin/perpetual-futures exchange** with a public, unauthenticated market-data REST namespace (`/trade-api/v2/margin/...`). That is crypto perps, not event contracts, and belongs in the Kalshi note, not here.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://mickbransfield.com/cftc-regulated-pms/ (third-party tracker, fetched 2026-10-19), exchange-structure section | Row reads "Kalshi Prime LLC fka Kinetic Markets LLC FCM - NFA registered, Mar 2026", with a kalshi.com/kinetics link | M |
| Same page, registered-FCMs section | "Kinetic Markets - Kalshi-affiliated FCM - NFA registered Mar 24, 2026"; says it "positions Kalshi for partially-collateralized (margin) trading once CFTC rule changes clear" (undated, forward-looking; the tracker does not say margin trading is live) | M |
| https://kalshi.com/kinetics | HTTP 429, body is a "Vercel Security Checkpoint" bot challenge (curl and WebFetch, 2026-10-19). Not bypassed. Same for `/kalshi-prime` and `/sitemap.xml` | H (the block), content NOT FOUND |
| NFA BASIC https://www.nfa.futures.org/BasicNet/ | Search form only (JS app); no listing retrievable without form submission | H (landing page only) |
| Kalshi help center search for "kinetic" (https://help.kalshi.com/search?q=kinetic) | `[]`, no results | H |
| Kalshi API docs (llms.txt, openapi.yaml, changelog RSS, fetched 2026-10-19) | No mention of "Kinetic" or "Kalshi Prime" as an entity. ("Prime" there is only an API usage tier name.) | H |

**still_live = unknown-leaning-true as an FCM registrant (M); not a tradable venue either way.** The tracker's "NFA registered Mar 2026" is a registration, not evidence of customer flow or volume. Name change (Kinetic Markets -> Kalshi Prime) is from the same tracker only (M); no date given.

Hint check: "Official page returned HTTP 429" - confirmed. "possibly shares liquidity with Kalshi" - yes, by construction (below).

## 2. Kind and market model

- **kind: broker-or-frontend (FCM).** Intermediates customer access to Kalshi; holds no markets. (M)
- **Market model: none of its own.** Underlying Kalshi: USD-collateralised binary event contracts on a CFTC-regulated DCM, central limit order book. (H, existing note `docs/research/08-venues-polymarket-kalshi.md` section 4, and https://docs.kalshi.com/llms.txt)
- **Tokenisation: none.** Exchange-ledger positions. (M)
- The tracker's "margin" angle: Kalshi has a separate **perpetual-futures ("margin"/"perps") exchange**, "Perps", "margin" and "perpetual futures" being the same product (H, https://docs.kalshi.com/margin.md). Production REST is "rolling out member by member". Live sample markets are crypto perps (ticker `KXAAVEPERP`, asset_class "Crypto"), not event contracts (H, fixture). Plausibly this is what a margin-capable FCM would serve (M, inference; no source ties Kalshi Prime to perps).

## 3. Chains and collateral

USD (Kalshi event contracts, M from note 08). No chain. Kalshi's margin settlement is among clearing members ("Kalshi Klear", the clearing house, H, Kalshi docs endpoint text for "Get Active Margin Obligations"). No EVM/Solana component for this entity. NOT FOUND for anything Kalshi Prime specific.

## 4. Read API

- **Entity-specific API: none / NOT FOUND** (searched: kalshi.com/kinetics (blocked), help.kalshi.com search, docs.kalshi.com llms.txt/openapi.yaml/changelog RSS for "kinetic").
- **Relevant Kalshi surfaces** (all H, https://docs.kalshi.com/llms.txt and https://docs.kalshi.com/margin.md):
  - Event contracts: `https://external-api.kalshi.com/trade-api/v2` (shared host `api.elections.kalshi.com`), WS `wss://external-api-ws.kalshi.com/trade-api/ws/v2` (connection requires auth). Full detail lives in note 08.
  - Margin/perps: REST `https://external-api.kalshi.com/trade-api/v2/margin/`, WS `wss://external-api-margin-ws.kalshi.com/trade-api/ws/v2/margin`, FIX hosts `margin-mm.fix.elections.kalshi.com` and `margin-marketdata.fix.elections.kalshi.com`; "rolling out member by member". Same auth, pagination, errors as event contracts. Not available on margin: events/series/milestones, RFQs, historical data, batch order ops. Public margin market data worked unauthenticated on 2026-10-19: `GET /margin/exchange/status`, `GET /margin/markets` (29 markets in the default page; the `limit` parameter was not honoured with `limit=1`, I trimmed the fixture), `GET /margin/markets/{ticker}/orderbook`. (H, fixtures)
  - FCM-only endpoints (`/fcm/...`, margin FCM, subtrader-bound API keys, margin reports/obligations) require FCM member access and are irrelevant to a scanner. (H, llms.txt: "Endpoint for FCM members ... rare ... likely does not apply to you")
- Rate limits: tier-based token buckets (`GET /account/limits`, tiers Basic ... Prestige, H openapi.yaml); the numbers are in note 08.

Fixtures (`docs/research/fixtures/kalshi-prime-llc-fka-kinetic-markets-llc/`):
- `kalshi-margin-exchange-status.json` (46 B): `{"exchange_active":true,"trading_active":true}`.
- `kalshi-exchange-status.json` (667 B): event-contract exchange, four shards by `exchange_index` (Default, Combos, Crypto & Commodities, Tennis/Baseball/Basketball), all active.
- `kalshi-margin-markets-first1.json` (1.5 KB): first margin market only (`KXAAVEPERP`): string-typed prices (`bid`,`ask`,`price` dollars with 4 decimals), `*_fp` size strings, `open_interest`, `volume`, `funding_cap`, `leverage_estimate(s)`, mark prices with `ts_ms`.

## 5. Trade path

- Entity: **none documented.** Retail/FCM customer onboarding for Kalshi Prime: NOT FOUND (page blocked).
- Kalshi direct: RSA/Ed25519 API-key signed requests (note 08). FCMs get "subtraders" and subtrader-bound API keys (H, llms.txt). Not available to us.
- **PayBox reachable: no.** Centralised, USD, KYC'd account at a regulated intermediary; no on-chain contract, EVM transaction proposal or signed-order scheme.

## 6. Fees

NOT FOUND for Kalshi Prime (searched: Kalshi help center, docs, tracker). Any customer would pay Kalshi's exchange fees (quadratic taker fee; see note 08 section 4.10, coefficients M there) plus an undisclosed FCM commission. Margin-market fees: Kalshi docs list a "fee tiers" endpoint for margin (H, margin.md), amounts not read.

## 7. Resolution mechanism and dispute risk

Same as Kalshi (exchange rulebook / settlement sources per series). An FCM adds no resolution layer. Not applicable to a separate leg.

## 8. Geo / ToS / automation

NOT FOUND for the entity (page blocked). Kalshi's own restrictions apply (note 08 section 4.9). The Kalshi site and fee-schedule pages sit behind a bot checkpoint (HTTP 429), so fetch only via `docs.kalshi.com` and `external-api` hosts.

## 9. Liquidity

NOT FOUND for the entity (no volume/OI published anywhere I could read). Any flow is a subset of Kalshi's. For context only: Kalshi margin sample market `KXAAVEPERP` showed 24h notional volume about $290k, OI notional about $114k (H, fixture, 2026-10-19), i.e. thin versus event contracts. Not a Kalshi Prime figure.

## 10. Event-category overlap and shared liquidity

- **Shares liquidity with Kalshi: yes, fully.** Not independent. Zero incremental arbitrage legs. (M for the entity, H for the FCM mechanism.)
- The only new category is crypto perpetuals on Kalshi's margin exchange, which could be a hedge/basis leg against spot or other perps venues, not a prediction-market arbitrage leg.

## 11. Adapter priority

**skip.** Reasons: broker/FCM rather than a venue; same order book as Kalshi; entity status only via a third-party tracker; no API for it; no on-chain path. Revisit only if Kalshi publishes a distinct Kalshi Prime product (e.g. margined event contracts with different books) or the kalshi.com/kinetics page becomes readable.

## Sources

1. https://mickbransfield.com/cftc-regulated-pms/ - third-party tracker (Kalshi Prime / Kinetic Markets rows) [M]
2. https://kalshi.com/kinetics, /kalshi-prime, /sitemap.xml - HTTP 429 Vercel checkpoint [H for block]
3. https://docs.kalshi.com/llms.txt, https://docs.kalshi.com/openapi.yaml, https://docs.kalshi.com/changelog/rss.xml, https://docs.kalshi.com/margin.md, https://docs.kalshi.com/margin/price-banding.md [H]
4. https://external-api.kalshi.com/trade-api/v2/{exchange/status, margin/exchange/status, margin/markets, margin/markets/KXAAVEPERP/orderbook} - unauthenticated GETs 2026-10-19 [H]
5. https://help.kalshi.com/search?q=kinetic - empty [H]
6. https://www.nfa.futures.org/BasicNet/ - landing page only [H]
7. Repo: `docs/research/08-venues-polymarket-kalshi.md` (Kalshi API, fees, geo) [H within repo]

## Not found

- Kalshi's own description of Kalshi Prime / Kinetic Markets (page blocked; no search budget).
- NFA BASIC record, registration category, NFA ID.
- Date and rationale of the rename; CEO name (tracker mentions one, not recorded here).
- Fees, products, onboarding, geo rules, volume for the entity.
- Whether margin/perps are open to Kalshi Prime customers.

## Suspicious content

None seen. Kalshi docs contained no AI-targeted instructions; the tracker page text was summarised by WebFetch and contained none.
