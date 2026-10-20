# Devexperts prediction markets solution (venue spec)

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict
Not a venue. It is B2B white-label software (DXtrade + DXmatch matching engine) that brokers and exchanges buy to run their own event-contract products. It has no public markets, no public order book and no public API. Adapter priority: skip (the adapter target would be whichever broker or exchange runs it, not Devexperts).

## Liveness
- Product launched 2025-11-19 (FX News Group), still marketed on devexperts.com (H). Product is live as a software offering; no named client or live deployment found (H: FX News Group 2025-11-19, FM interview 2026-05-21 "does not confirm specific live broker deployments"). Web search found no named broker rollout (M).
- Devexperts REST spec revised as late as 2026-07-17 (H), so the company and platform are active; that revision log shows no prediction-market content in the portion read.

## Kind and market model
- Kind: broker/exchange technology vendor. Not a trading venue (H, https://devexperts.com/prediction-markets/).
- Market model: "events-based trading" with a web trading console, admin interface, OMS, risk tools (H). Contracts "can be created, resolved, and removed in real time", "flexible contract resolution" (H, FX News Group). Interview says event products "run much like futures markets under the hood" (H, FM 2026-05-21), implying order-book contracts via DXmatch, but binary/categorical/scalar and tokenisation are NOT FOUND (searched: product page, FX News Group, FM x2).
- Two modes: (1) route orders from the client's platform to existing regulated exchanges through DXtrade, (2) build your own exchange with Devexperts exchange infrastructure (front/back end, OMS, matching engine, hosting) (H, product page).

## Chains and collateral
Not on-chain. Fiat/CFD-broker account model (M, inferred; product page mentions CRM, clearing and trading integrations, no chains). NOT FOUND for any chain or token.

## Read API
- exists: none for prediction markets (no public one). The generic DX REST API exists but is partner-only: "partners need onboarding to receive HMAC credentials" (H, https://demo-xt.dx.trade/dxweb/specs/DX_REST_API.html; fetched first 100k of 159k chars, rest unread).
- Generic DX REST endpoints seen: POST /login, /ping, /logout; GET /instruments/<symbol>, /instruments/type/<type>, /instruments/query/ ; orders under /accounts/<account code>/orders (H). Market data comes through a separate dxFeed token/push doc (H). No prediction-market-specific endpoint was seen.
- Fixtures: none saved. The demo host demo.dxtrade.com does not resolve; the spec page is documentation, not an API response. No unauthenticated data endpoint exists to sample.

## Trade path
Only for a client's own broker customers via that broker's DXtrade instance. DX REST auth: session token (`Authorization: DXAPI <token>` after POST /login with username/domain/password) or HMAC (`Authorization: DXAPI principal=..., timestamp=..., hash=...`, SHA-256 HMAC, base64) (H, spec above). Both need broker-issued credentials. No wallet-signed orders.

## PayBox reachability
no. No chain, no contract, no wallet signing; fiat broker accounts with KYC.

## Fees
NOT FOUND. Devexperts pricing not disclosed ("hasn't disclosed pricing", per FX News Group via search summary, M). Trading fees are set by each operating broker.

## Resolution
"Flexible contract resolution" controlled by the operator (H, FX News Group). Operator-defined, so dispute risk depends on each deployment. Devexperts' Jon Light says settlement logic, surveillance and manipulation protection are operator responsibilities (H, FM 2026-05-21).

## Geo / ToS / automation
Regulatory: Light says such products "would likely fall under gambling or betting regulations" in many jurisdictions (H, FM 2026-05-21). Product page lists SEC, FCA, CySEC, CMB, JFSA compliance for Devexperts solutions generally, not specifically this product (H). Retail automation rules are per broker. NOT FOUND for Devexperts-level ToS.

## Liquidity
NOT FOUND. No volume, OI or TVL; no clients named. Liquidity is either routed to third-party regulated exchanges (then not independent) or the operator's own (likely thin; FM interview itself discusses thin books). Liquidity source not stated in FM 2026-02-27 article (H).

## Event coverage / overlap
NOT FOUND for specific markets. Sports are mentioned (latency protection for live sporting events, H). Overlap with other venues would only arise via the routed exchange (e.g. Kalshi-type venues, M) and would duplicate those venues.

## Shared liquidity
In routing mode it shares liquidity with whatever regulated exchange it routes to, so it is not an independent arbitrage leg (H for the routing model; which exchange: NOT FOUND).

## Suspicious content
None observed in pages read.

## Open questions
- Which brokers/exchanges, if any, run it live, and do any expose public market data?
- Is there prediction-market content in the unread tail (chars 100k to 159k) of the DX REST spec?

## Sources
- https://devexperts.com/prediction-markets/ (H)
- https://www.financemagnates.com/fintech/inside-the-prediction-markets-building-the-broker-stack/ (H, 2026-02-27)
- https://fxnewsgroup.com/forex-news/platforms/devexperts-launches-event-based-trading-offering/ (H, 2025-11-19)
- https://www.financemagnates.com/executives/interview/prediction-market-platforms-may-need-to-operate-under-gambling-licenses-devexperts-jon-light/ (H, 2026-05-21)
- https://demo-xt.dx.trade/dxweb/specs/DX_REST_API.html (H, partial read)
- WebSearch result summaries on launch coverage (M)
