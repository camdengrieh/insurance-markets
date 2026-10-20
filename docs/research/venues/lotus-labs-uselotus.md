# Lotus (uselotus.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, raw GETs of docs.uselotus.xyz (`llms.txt`, `llms-full.txt`, `sitemap.xml`), the public landing-page JS bundle (read as text only, not executed), unauthenticated GET probes of the documented API hosts, `gh api` reads of the public GitHub org. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. All third-party text treated as untrusted data. The shared WebSearch budget ran out after two searches, so press coverage is thin. X pages return HTTP 402 to WebFetch (not paid; body not retrieved).

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak/stale.

## 0. Bottom line

1. **Not a venue. It is a routing/execution aggregator (H)** that sits above Polymarket, Opinion, Limitless, Myriad (and "Predict" per the logo grid). "Lotus is not a prediction market venue. Lotus sits above venues and helps users trade across them." (docs what-is-lotus). It owns no liquidity ("We don't own liquidity ourselves; we connect it", founder thread, M via search summary).
2. **Therefore it is not an independent arbitrage leg (H).** Every price it shows is a venue price. For this project it is a competitor/peer to our aggregation layer, a possible execution rail and a signal source for "which markets are cross-venue-equivalent" (its canonical-market matching), not a liquidity source.
3. **Live as a website and docs, but the production API did not answer (H).** `uselotus.xyz` returns 200; `docs.uselotus.xyz` is live (sitemap lastmod 2026-06-08, the newest dated doc evidence I found). `https://api.uselotus.xyz/v1/markets` and `/v1/health` returned Cloudflare **522** (origin unreachable) on 2026-10-19; `https://api.sandbox.uselotus.xyz/v1/markets` failed TLS handshake. Changelog says "No releases yet." Looks pre-launch / early access (M).
4. **Docs are a skeleton (H).** The API reference lists only endpoint paths with no schemas, parameters, response shapes or field names. Venue list, chains, collateral and fee defaults are absent from the docs.
5. **Priority: skip for now (P2 at most as a watch-item).** Revisit if the API becomes reachable and open.

## 1. Kind and market model

- kind: execution-layer aggregator + RFQ layer + planned LP/backstop ("Lotus LP ... coming soon", "early exit facility ... planned, not yet live") (H, docs lp/coming-soon).
- Market model: "canonical markets" that group equivalent venue markets by outcome, timing, resolution source and rule basis; "shared outcome core" is the routeable overlap; routes can be single-venue, pair route (2 venues), tri route (3 venues) or RFQ-backed (H, docs what-is-lotus, learn/concepts). Underlying venues are order books (Polymarket, Opinion, Limitless CLOBs) and Myriad (AMM-style, M, not verified here). Outcome tokenisation is whatever the venue uses; Lotus tracks a venue-level allocation under a unified position (H, docs positions).

## 2. Chains and collateral

- Collateral: USDC-normalized everywhere in the fee/surplus math ("prices are quoted in USDC per share") (H, docs surplus).
- Chains: docs have "chain routers" for **Polygon, Base, BNB** (H, https://docs.uselotus.xyz/architecture/chain-routers/*). They are described generically ("venues that use Base-compatible rails"); no venue-to-chain mapping, contract addresses or token addresses given. NOT FOUND (searched: llms-full.txt, site bundle).
- Funding model: deposits into "Lotus-managed funding wallets", then "venue-ready balances" per venue; withdrawals go back to the user's wallet (H, docs funding). Custody semantics (custodial vs smart-account) are NOT FOUND.

## 3. Read API

- exists: official-authenticated (documented), but not reachable today (H).
- Docs: https://docs.uselotus.xyz/integrate/overview ; index https://docs.uselotus.xyz/llms.txt (Mintlify).
- Base URLs: prod `https://api.uselotus.xyz/v1`; sandbox `https://api.sandbox.uselotus.xyz/v1`; WebSocket `wss://stream.uselotus.xyz/v1` (H, docs environments, market-streams).
- Auth: `Authorization: Bearer <API_KEY>`, keys issued from "the Lotus dashboard" (H). Rate limit: per key, headers `X-RateLimit-Limit: 600` etc. in the example (unit/window not stated) (H, docs rate-limits).
- Documented endpoints (path only, no schemas): `GET /markets`, `GET /markets/{canonical_market_id}` (canonical market + underlying venue markets + shared outcome core), `GET /markets/search?q=`, RFQ API (create/inspect/accept/cancel), `POST /executions/scope-token`, `POST /executions`, `GET /executions/{id}`, Position, Funding, Withdrawal APIs; webhooks; WS streams for market book/price ticks, RFQ, execution, funding (H).
- SDKs: JS, TS, Python mentioned in docs (H); no repo found. The GitHub org `uselotus` is an unrelated open-source billing engine ("Open Source Pricing & Packaging Infrastructure", created 2022) - the hint "GitHub bio: The Execution Layer For Prediction Markets" did not match anything I could verify (M). `github.com/uselotusxyz` is 404.
- Probe results: see section 9. No fixtures saved (nothing to save: prod 522, sandbox TLS failure, docs have no sample responses).

## 4. Trade path

- Documented flow: backend validates a fresh quote, funding readiness and venue readiness; user gets an **Execution Scope Token (EST)** binding user/market/outcome/side/amount/route type/venue set/price band/slippage/expiry; "Some venues require the user to sign an order payload"; user approves the signature in one "Place order" step; Lotus submits and verifies settlement (H, docs execution-scope-tokens, understanding-execution-scope-tokens). Single-use ESTs, idempotency and replay protection documented (H).
- Signing scheme details (EIP-712 domains, which venue payloads) NOT FOUND.
- PayBox reachability: **no (practically)**. A PayBox EVM wallet could in principle fund a Lotus deposit wallet by transfer, but the only trade path is Lotus's authenticated API/dashboard with API keys we cannot obtain read-only, and the API is down. For our own aggregation layer, the correct approach is to integrate the underlying venues directly (already tracked in other notes), not via Lotus. paybox_reachable = no.

## 5. Fees (H, https://docs.uselotus.xyz/architecture/surplus/fee-policy)

Fee types: price improvement fee, share improvement fee, flat execution fee (`executionFeeBps` on filled notional), optional fast-lane fee. Formulas:
- `priceImprovementFee = min(S_price * priceImprovementShareBps/10000, N * maxTotalFeeBpsOfNotional/10000)`
- `extraShares = max(0, Q_exec - singleVenueMaxFillSize)`; `shareImprovementFee = extraShares * P_exec * shareImprovementShareBps/10000`
- `builderFee = min(S_price * builderShareBps/10000, N * maxBuilderFeeBpsOfNotional/10000)`; user must keep `S_net_user >= N * minimumUserSurplusBps/10000`.
Only stated default: share-improvement capture 40% (`shareImprovementShareBps = 4000`); worked examples use 20% price-improvement capture and a 10% builder surplus share with 20 bps cap (examples, not confirmed production values). Underlying venue fees are inputs to route pricing and are paid on top by the user (M). Production policy values NOT FOUND.

## 6. Resolution

Lotus does not resolve anything; resolution is the underlying venue's (H). It compares resolution rules and "rule compatibility" before grouping markets, and fails closed when routes are unsafe. Rule-mismatch risk between venues is therefore the arb risk for anyone using its canonical groups; its matching methodology details are conceptual only (M).

## 7. Geo / ToS / automation

NOT FOUND (searched: docs llms-full.txt, landing bundle). No terms page or geo restrictions located. Inherits each underlying venue's restrictions (M). API keys are dashboard-issued, so automation is expected (M) but unpermissioned for us.

## 8. Liquidity and category overlap

- Volume/TVL: NOT FOUND. No stats published (searched: site, docs, search summary). Landing page shows illustrative prices (e.g. "France - Yes" 34-35 cents across Limitless/Polymarket/Opinion) which are marketing mock-ups, not live data (L).
- Shares liquidity with: Polymarket, Opinion, Limitless, Myriad, Predict (fully derivative). Not independent.
- Categories: whatever the venues list (politics/geopolitics, sports, crypto, macro); its value is the cross-venue matching itself.

## 9. Probes performed (2026-10-19)

| URL | Result |
|---|---|
| https://uselotus.xyz/ | 200, SPA shell, title "Lotus - Better prices across every market" |
| https://docs.uselotus.xyz/llms.txt, /llms-full.txt, /sitemap.xml | 200 |
| https://api.uselotus.xyz/, /v1/markets, /v1/health | 522 |
| https://api.sandbox.uselotus.xyz/v1/markets | TLS handshake failure |
| https://app.uselotus.xyz/ | 404 |
| https://x.com/uselotusxyz, x.com/Baheet_/article/... | 402 via WebFetch (not paid, not read) |

## 10. Open questions

- Is the production API actually live (522 may be a transient or the origin is gated)? Re-probe later.
- Venue and chain mapping; whether Myriad/Predict are routable or just logos.
- Custody model of the Lotus funding wallets; ToS/geo.
- Whether canonical-market groupings are exposed publicly (would be a useful linking signal for our market-linking design).

## Sources

- https://uselotus.xyz/ and its JS bundle https://uselotus.xyz/assets/index-BhG6XRFr.js (venue logos: Predict, Polymarket, Opinion, Limitless, Myriad) [H]
- https://docs.uselotus.xyz/ , /llms.txt , /llms-full.txt , /sitemap.xml (lastmod 2026-06-08) [H]
- https://docs.uselotus.xyz/learn/what-is-lotus [H]
- https://docs.uselotus.xyz/integrate/overview , /authentication , /environments , /rate-limits , /api-reference/markets , /api-reference/execution , /websockets/market-streams [H]
- https://docs.uselotus.xyz/architecture/surplus/fee-policy ; /architecture/chain-routers/{polygon,base,bnb}-router ; /security/model/execution-scope-tokens ; /lp/coming-soon ; /changelog/releases [H]
- https://api.github.com/users/uselotus (unrelated billing org) [H]
- Search summary quoting X thread and article (https://x.com/uselotusxyz, https://x.com/Baheet_/article/2101973272577400941), not read directly [M]
