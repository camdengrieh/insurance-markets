# Sabi Markets (Clouty Global Limited) - venue spec

Researched 2026-10-19. Read-only; only unauthenticated GETs to the public site and its public API host. Tags: H = read first-hand this session, M = inferred/secondary, L = weak/stale.

## Verdict

Live, but tiny and fiat-only. Naira-denominated, custodial, KYC-gated for Nigerian residents, with an app-session trading API and no wallet or chain path. A public read API exists but all quotes seen are seeded 0.50 marks with no live book. Adapter priority: **P2** (signal-only, cheap read adapter, not an arbitrage leg).

## Identity and liveness

- Site https://sabi.markets is a Next.js app, HTTP 200 on 2026-10-19; title "Sabi - Nigeria's 1st Regulated Prediction Market." [H: https://sabi.markets]
- JSON-LD: legalName "Clouty Global Limited", alternateName "Sabi Markets", only social link https://x.com/sabimarkets. [H: https://sabi.markets]
- Footer (in site JS): "Sabi Markets is the trading name of Clouty Global Limited (RC: 8321734), a company incorporated in Nigeria and regulated by the Securities and Exchange Commission of Nigeria (SEC Nigeria) under the Investments and Securities Act 2025." [H: footer chunk of https://sabi.markets] This resolves the earlier "no regulator named" gap: SEC Nigeria is named. I did not verify the claim against an SEC Nigeria register. [L for the claim being true; H that it is claimed]
- Backend is up: markets updated as recently as 2026-10-19T04:22Z; a market created 2026-08-26 and a market resolved 2026-09-24. [H: https://server.sabi.markets/api/v1/markets]
- App Store release 16 Aug 2026 (from the discovery hint; not re-verified, WebSearch budget was exhausted). [M]

## Kind and market model

- Centralised, custodial, fiat (NGN) exchange. Operator-listed markets only ("We do not currently support user-created markets"). [H: FAQ text in https://sabi.markets/faq JS chunk]
- Market types seen across all 35 markets: `binary` (29) and `multiple_choice` (6, 3 to 8 options, e.g. AMVCA winners, "which fintech IPOs first", date-bucket markets). No scalar. [H: GET /api/v1/markets pages 1-3]
- Binary contracts priced N0-N100, YES settles N100 or N0, NO = N100 minus YES. `priceTickSize` 0.01 (so a 1% tick on a 0-1 scale). [H: FAQ + API]
- Matching: order book. Each market and option carries an `exberrySymbol` (e.g. `MKT-11E09C2B`), which points at an Exberry matching-engine backend (inference from the field name only [M]). Public order book endpoint returns `bids`, `asks`, `lastPrice`, `ledger`. [H: GET /trading/orderbook/{marketId}]
- Outcomes are not tokenised: they are internal ledger positions per account. Option ids are Mongo ObjectIds; the NO side is addressed as `<optionId>:no` in price history. [H]
- Currency NGN for every market; `maxExposure` 50,000,000 per market; `payoutRange` min 100 / max 2,000,000 NGN per side. [H]

## Chains and collateral

None on-chain. Collateral is Naira held in a Sabi account, funded by bank transfer or debit card; withdrawals to a verified Nigerian bank account in the user's own name. Claims funds are in segregated accounts. [H: FAQ text] No token, contract address or chain was found in the site code (searched site JS for chain RPCs and contract addresses: none Sabi-specific). [M]

## Read API

- **Existence: official-public-by-use (undocumented).** The web app itself calls it; no developer docs found. NOT FOUND (searched: sabi.markets/api-docs and /developers return the app shell or 404; https://server.sabi.markets/api/v1/api-docs returns 404; no docs link in footer). The Terms define the platform as including "APIs" but publish no public API spec. [H]
- Base URL: `https://server.sabi.markets/api/v1` (Express behind nginx). Socket.io on the root `https://server.sabi.markets`. [H: base URL string in app JS; response headers]
- Envelope: `{"success":true,"code":200,"message":"...","data":{...}}`; list endpoints add `data.meta {total,page,perPage,totalPages,hasNextPage,...}`. [H]

Unauthenticated GETs that returned 200 (2026-10-19):

| Endpoint | Notes |
|---|---|
| `GET /markets?page=&limit=&status=` | List, default perPage 15; `limit=100&status=active` returned all 21 active. Includes `options[]` with `markPrice{yesPrice,noPrice,bestBid,bestAsk,lastTradePrice,source,freshAt}` |
| `GET /markets/{id}` | Single market |
| `GET /markets/featured`, `/markets/{id}/related` | Curated lists |
| `GET /markets/{id}/price-history` | `interval` (default 1M), `series[]` per side with `points[{time,price(0-100),volume}]`, `vwap`, `spread`, `totalTrades` |
| `GET /trading/orderbook/{marketId}?optionId=&ledgerLimit=` | Public. `bids`, `asks`, `lastPrice`, `ledger` (recent trades). Returned message "Market data service not connected - please try again" with empty arrays when seen |
| `GET /categories`, `/topics`, `/settings/public` | Taxonomy and fee/limit config |

- Auth-required (HTTP 401 "Authorization token is required"): `/trading/orders`, `/trading/portfolio/*`, `/wallet`, `/users/*`, etc. [H]
- Resolution info: market object has `status` (`active`/`resolved`), `result{resolved,outcome,winningOptionId,winningOptionLabel,resolvedAt,resolvedBy,resolutionNotes}`, `resolutionSource`, `resolutionSources[]` (URLs), `resolutionCriteria`, `resolutionMethod` ("manual"), `expiresAt`, `resolutionDeadline`. [H]
- Websocket: socket.io client in app JS subscribes with `{resource, id, params}` to resources `market`, `markets` (lobby) and portfolio topics; events include `order:placed`, `order:filled`, `order:changed`, `wallet:balance-update`. Public market subscription not tested (would need opening a connection; skipped). [M: from client code]
- Rate limits: NOT FOUND (no `X-RateLimit-*` headers in responses seen; none documented). Pagination is page/limit.
- Caveats for an adapter: `uniqueTraders` and `totalOrders` read 0 for every market even where `totalVolume` > 0, so those counters are unreliable. All 30 active-option marks had `source: "seed"` with null best bid/ask; 29 were `settled`. [H]

Fixtures: `docs/research/fixtures/sabi-markets-clouty-inc/` (`markets-active-sample.json` trimmed to 4 markets with the admin creator field removed, `orderbook-sample.json`, `price-history-sample.json`, `settings-public.json`).

## Trade path

- Programmatic orders exist only inside the authenticated app API: `POST /trading/orders`, `DELETE /trading/orders/{orderReference}`, `POST /trading/orders/mass-cancel`, `POST /trading/positions/close`, `POST /trading/calculate` (unauthenticated quote calculator; not called because it is a POST). Auth is a bearer token stored by the web app after email/phone/Google/Apple login, KYC (Youverify liveness + identity) and a trading PIN. [H: endpoint strings and auth code in app JS]
- No documented API keys, no wallet signing, no signed-order scheme. [H for absence in code; docs NOT FOUND]
- Users must be Nigerian residents, 18+, KYC-verified. Withdrawals only to the user's own Nigerian bank account. [H: FAQ]

## PayBox reachability

**No.** There is no chain, token or contract; PayBox EVM/Solana wallets and transaction proposals cannot place or fund orders. Funding is NGN card/bank transfer to a KYC'd Nigerian account, which is not something an agent wallet can do. Read-only use of the public API from the aggregator is the only integration. [H/M]

## Fees

From `GET /settings/public` (2026-10-19): `trading.platformFeePercent` 3.5, `trading.minOrderAmount` 100, `trading.maxOrderAmount` 1,000,000; deposits min 100 / max 5,000,000; withdrawals min 1,000 / max 5,000,000, daily limit 10,000,000, `withdrawals.feePercent` 1 with min 50 and cap 500 (NGN). [H] The FAQ says "no fees for deposits or withdrawals" and a minimum trade of N1,000, which conflicts with the config values (min order 100, withdrawal fee 1%). Config values are what the app code uses for the withdrawal-fee formula `clamp(amount*1%, 50, 500)`. Exact application of the 3.5% trading fee (on notional vs on profit, who pays) NOT FOUND. For arbitrage modelling, treat 3.5% as a hard floor cost per trade. [H for numbers, L for application]

## Resolution and dispute risk

- Operator-run, `resolutionMethod: manual`, against a named source in advance (e.g. CBN, INEC). Resolution team settles; markets may be extended or voided (refund at price paid). Dispute within 48 hours of resolution, compliance team replies within 5 business days; Terms also reference an SEC-linked arbitration/tribunal (the "IST" under ISA 2025). [H: FAQ, Terms, Data Regulatory chunks]
- Quality flag: market "Will the CBN cut the MPR at the 307th MPC meeting on September 21-22, 2026?" has criteria text referring to "the July 20-21 session" and was resolved YES on 2026-09-24 while its own description says the previous meeting retained the rate. I did not verify the real MPC outcome. Treat as evidence of sloppy criteria, so high resolution-mismatch risk versus other venues. [H for the text, M for the inference]
- Resolutions are single-operator discretionary; no oracle. [H]

## Geo, ToS, automation

- Nigerian residents only ("Any Nigerian resident with a verified account can trade"); restricted jurisdictions and insiders prohibited. [H: FAQ]
- Terms prohibit, among others, "placing orders with the intent to cancel before execution for the purpose of misleading other market participants". No explicit bot/API-trading rule found in the pages I extracted; the Rulebook is referenced but not published where I looked (NOT FOUND: Exchange Rulebook text). [H/L]
- Cross-border automated trading from a PayBox wallet is not possible and would likely breach residency and KYC terms.

## Liquidity (all NGN, 2026-10-19, from `GET /markets`)

- 35 markets listed: 21 active, 14 resolved. Cumulative `totalVolume` across all 35 = N3,036,098; across the 21 active = N1,352,654; largest single active market about N298,914 (food import bill). [H]
- Order book depth: nothing observable (empty book at fetch, seeded marks). At roughly N1,400-1,500 per USD (my assumption, M; the Naira market in the list asks about N1,000 per $1), total lifetime volume is on the order of $2,000 and active volume under $1,000. [M]
- Volume units (notional NGN vs contracts) not documented. [L]

## Event categories and overlap

Categories: Politics & Elections, Economy & Finance, Culture & Entertainment, Tech, Governance. Content is almost entirely Nigeria-specific: 2027 presidential election (Tinubu, Atiku, Obi), Lagos governorship, CBN MPR decisions, Nigerian inflation, fuel price, naira level, music charts, Nollywood awards. [H]

Overlap with global venues: the 2027 Nigerian presidential winner and possibly CBN/inflation/naira thresholds could be listed on Polymarket, Kalshi-style venues or Myriad, but I did not check them (out of scope here). Cross-venue arbitrage requires identical resolution wording and a tradable leg; Sabi offers neither. No sports or crypto-price overlap seen. [M]

## Shared liquidity

Independent: own Naira book, own custody; nothing indicates routing to another venue. Liquidity is however closed to non-Nigerian participants so it cannot be hedged in practice. [M]

## Adapter notes (if built)

1. Poll `GET /markets?limit=100&status=active` and `GET /trading/orderbook/{id}` for books; skip any option whose `markPrice.source == "seed"` and treat null best bid/ask as no quote.
2. Normalise price (0-1), NGN currency, and sign every Sabi signal as "informational only".
3. Handle `multiple_choice` by emitting one outcome per option; `options` of length 1 are binary (YES option; NO price = 1 - YES).
4. Do not store the admin email present in `creatorId` fields.

## Suspicious content

None found. The site JS references third parties (Youverify KYC, Google/Apple sign-in); no instructions aimed at AI agents were seen.

## Sources

- https://sabi.markets (home HTML, JSON-LD, footer and FAQ/Terms/Data Regulatory text from its JS chunks; /faq, /terms, /data-regulatory) [H]
- https://server.sabi.markets/api/v1/markets, /markets/{id}/price-history, /markets/{id}/related, /trading/orderbook/{id}, /categories, /topics, /settings/public (unauthenticated GET, 2026-10-19) [H]
- https://server.sabi.markets/api/v1/trading/orders and /trading/portfolio/summary (401 responses) [H]
- https://x.com/sabimarkets (referenced only, not fetched) [L]
- WebSearch was unavailable (session budget exhausted), so there is no independent press or regulator confirmation of the SEC Nigeria claim.
