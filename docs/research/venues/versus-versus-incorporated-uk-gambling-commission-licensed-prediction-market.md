# versus (versus Incorporated), UK Gambling Commission-licensed prediction market

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.
Verdict: live and real, but it is a UK-only GBP **bookmaker** (versus is counterparty to every bet) whose prices appear to be derived from Polymarket. It is not an independent liquidity leg. Its terms ban arbitrage and bots. Adapter priority: **skip** (at most a P2 passive read-only price/sentiment signal).

## 1. Liveness
- H: Site, API and sitemap live on 2026-10-19. API `GET /api/v1/markets/browse` returned `total: 7838` markets, with `status: "live"` on the sampled ones. Blog posts dated up to mid-October 2026. https://versusapp.com/llms.txt, https://api.versusapp.com/api/v1/markets/browse?limit=3
- H: UKGC public register account 101143 is listed as "Versus Inc". It holds two Remote licences, "General Betting Standard - Real Event" and "Linked Gambling Software", both Active from 21 Apr 2026 (the page gave reference 101143-R-342325-002). https://www.gamblingcommission.gov.uk/public-register/business/detail/101143
- M: Launched in the UK and Canada around 29 May to 1 Jun 2026 per press (an affiliate site says 3 Aug 2026; the task hint says the App Store release was 30 Jul 2026). https://londonlovesbusiness.com/versus-launches-as-the-uk-and-canadas-first-regulated-prediction-market-platform/
- H: Operator: versus Incorporated and versus International Incorporated, registered in Douglas, Isle of Man; WORLDORF Ventures LLC is based in Dubai (llms.txt). Press (M) says it is operated by WORLDORF Ventures LLC.

## 2. Kind and market model
- H: Fixed-odds betting on real-world events presented as prediction markets. Terms s2.2: "You bet against versus. We act as principal and are the counterparty to every Prediction." No order book, no AMM, no user-to-user matching. Positions cannot be transferred or traded to others. https://versusapp.com/terms/uk
- H: Market types in the API are `answer_type: "yesno"` (Yes/No) and `"multiple"` (several brackets, each its own Yes/No outcome). Categories seen: sports, economy, politics, etc. A price is 0p to 100p; a winner settles at 100p. https://versusapp.com/llms.txt
- H: Outcomes are database rows (UUIDs) with a Yes side and a No side, not tokens. Per-outcome fields include `odds` (decimal), `oddsNo`, `impliedProbability`, `pmPrice`, `pmPriceNo`, `minStake`, `maxStake`, `maxLiability`, `quoteValidUntil` and `pricingModel` (`simple_launch_v1` seen). See fixtures.
- H: No parlays. Early exit ("withdraw") is offered only while trading, is priced at "the current Market price for your Outcome, less our deduction", and may be unavailable (terms s8).

## 3. Relationship to other venues (critical)
- M (inferred from the public JS bundle, not stated by versus): the client's market model carries fields `polymarket_volume_24hr`, `house_margin`, `poly_fee_rate`, `no_route_enabled`, `winnings_cut_cap` and `bookmaker_mode`. The pricing model names include `pm_margin_v1`. The API exposes `pmPrice`/`pmPriceNo` ("PM" very likely means Polymarket). Market images live under a `pending-import` path. The client also strips text mentioning "polymarket" or "hedg" from displayed content. Together this strongly suggests markets are imported from Polymarket and priced from its prices plus a house margin, with possible hedging on Polymarket. Not confirmed by any versus doc. Source files: https://versusapp.com/_next/static/chunks/2qc6-b78j7tww.js and 0fne3i7r6n5le.js.
- H: Terms s10.1 say markets settle "in line with the underlying market we reference for pricing", and the underlying market is not named.
- H: versus's own About and FAQ say Polymarket and Kalshi block UK users and neither is licensed in the UK. https://versusapp.com/faq
- Consequence: treat versus liquidity as shared with or derived from Polymarket (M). A versus-vs-Polymarket gap is house margin, not an independent price. Not an independent arbitrage leg.

## 4. Chains and collateral
- H: Fiat GBP only. "versus settles in ordinary money, not cryptocurrency, and does not accept credit cards." Deposits by Apple Pay, debit cards, e-wallets and open banking (press, M); withdrawals return to the deposit method after ID plus selfie KYC. No chain, token, contract or wallet. https://versusapp.com/llms.txt

## 5. Read API
- Classification: **unofficial-only** (the API is the app's own backend; no documentation or developer programme found). `GET https://api.versusapp.com/` returns `{"message":"Versus API","version":"1.0.0","documentation":"/api/docs"}`, but `/api/docs` returns 404 (H). NOT FOUND (searched: api root, /api/docs, site HTML, llms.txt, sitemap, footer pages): any public API docs, terms for API use, or developer page.
- Base URL (H): `https://api.versusapp.com`. Endpoint paths found by reading the public web bundle (H that they appear in the bundle, M that they are stable):
  - `GET /api/v1/markets/browse?limit=&offset=&ids=` list of markets, no auth needed (H, called by the anonymous web client). Returns `{markets, total, hasMore, limit, offset, ...}`. The market object has id, headline, category, answer_type, answer_options, end_date, status, settled_at, source_name, and so on, but **no prices**.
  - `GET /api/v1/markets/{id}/outcomes` no auth (H). Per-outcome decimal odds, `pmPrice`, `pmPriceNo`, stake limits, `maxLiability`, `quoteValidUntil`. This is the price endpoint.
  - `GET /api/v1/markets/{id}/price-history` no auth (H). Returns `{defaultRange, allowedRanges: [1h,2h,5h,1d,1w,1m], history: [{t: unix_s, p: 0..1}]}`. It is one series per market, presumably the leading outcome.
  - `GET /api/v1/platform-fee-config` no auth (H): `{"basisPoints":200,"minFeeCents":0,"maxFeeCents":1000,"enabled":true}`.
  - `GET /api/v1/markets/{id}` returns 401 "Missing or invalid authorization header" (H).
  - Seen in the bundle but not called: `/markets/{id}/price-stream` (probably streaming), `/markets/{marketId}/quote`, `/markets/{marketId}/bet` (money-moving, never called), `/markets/search-suggestions`, `/sports/*`, `/user/*`, `/auth/*`, `/kyc/*`.
- Server-rendered public pages also expose chances: `https://versusapp.com/market/{uuid}` (H) lists answer options with percentage chances, close time and full resolution text. The market list is in `https://versusapp.com/sitemap-1.xml` (7,826 market URLs on 2026-10-19).
- Rate limit (H): `x-ratelimit-limit: 60` per 60s on browse (root showed 10000). `cache-control: private, no-store`. No websocket documented.
- Fixtures: `docs/research/fixtures/versus-versus-incorporated-uk-gambling-commission-licensed-prediction-market/` (browse, outcomes, price-history, fee config).

### Observed price shape (sample, UK CPI market, 2026-10-19 04:55 UTC)
- `odds` is the decimal payout on the Yes side and `pmPrice` is a 0..1 reference price. They diverge widely: "2.7% or less" had odds 3.4 (implied 29.4%) against pmPrice 0.055. The page headline chance (6%) tracks pmPrice, but the price a customer actually gets (`odds`) is far worse on long shots. This is the house margin, or a floor, under `simple_launch_v1`. Any scanner must use `odds`/`impliedProbability` (the executable quote), not `pmPrice`, and these quotes expire (`quoteValidUntil`, about 60s).
- Capacity caps: `maxStake` 100000 and `maxLiability` 50000 per outcome (units presumably GBP; NOT FOUND in docs).

## 6. Trade path
- None for an agent. Placing a bet requires an authenticated customer account (email/phone login, 2FA, government ID plus selfie KYC, UK location checks). The bet endpoint is `POST /api/v1/markets/{marketId}/bet` after a `/quote`. Not explored (no account, no POST). Terms ban bots (below), so programmatic trading would breach the terms.
- PayBox: **not reachable**. There is no chain, contract, signed-order flow or crypto deposit. Funding is by UK card or bank, so an EVM or Solana wallet could not trade it. `paybox_reachable = no`.

## 7. Fees
- H: A transaction fee of 2% of the stake, charged on top of the stake and "not deducted from the Return". Terms and llms.txt say "no maximum fee cap"; the public config endpoint says `maxFeeCents: 1000` (a GBP 10 cap), a discrepancy that is unresolved. Deposits and withdrawals are free within normal limits.
- H: Early exit is priced at the current price less an unspecified "deduction". The house margin on odds is hidden inside the quoted odds (see the sample above).

## 8. Resolution and dispute risk
- H: Each market lists its own resolution text (e.g. ONS CPI to one decimal). Settlement uses "credible, widely-reported public sources and official or regulatory filings", "in line with the underlying market we reference for pricing". versus may void bets for integrity concerns, "palpable errors", or when the market cannot be resolved. After settlement, appeals or disqualifications do not change the result. Complaints go through versus, then an ADR body after 8 weeks (terms s18).
- Risk: the operator is the sole judge (centralised, bookmaker-style), and there is no on-chain dispute process. Resolution wording may differ from other venues, so basis risk is possible. The operator can reject or part-fill any bet.

## 9. Geo, ToS and automation
- H: Services are "available only to customers located in the United Kingdom" (terms s2.2). The marketing says UK and Canada, but the UK terms are UK-only. Prohibited activities include "Engaging in arbitrage betting, matched betting, or bonus abuse", "Using automated systems, bots, or software", "Using a VPN to disguise your location", "Operating more than one Account" and "Using your Account commercially or for third parties". https://versusapp.com/terms/uk (s11-ish list).
- robots.txt (H) allows the public site and disallows /wallet, /settings, /kyc and similar. There is no API-use policy.
- Conclusion: an arbitrage scanner cannot legally execute here, and the terms treat arbitrage as a violation. Use at most as a passive public read.

## 10. Liquidity
- H: 7,838 markets listed in the API on 2026-10-19. This contradicts the "100K+ markets" in the task hint (hint is L; the hint's source, the App Store text, was not re-read). Many are multi-bracket families.
- NOT FOUND (searched: site, llms.txt, press, API fields): volume, open interest or user numbers. Capacity is bookmaker-style: per-outcome `maxLiability` was 50,000 in the sample, with `totalStake` 0 on every outcome in that market (M: suggests very little flow on that market). The press cites only a $10.6M company valuation (M).

## 11. Event overlap (where arbitrage would exist, if it were allowed)
- UK/US/global politics (US midterms, Brazil runoff, NZ election), macro (CPI, BoE/Fed/ECB decisions), sport (F1, Premier League, MLB, UFC), AI model releases, crypto and entertainment awards. These overlap Polymarket and Kalshi, but since pricing is referenced from the underlying market, the overlap is not independent.

## 12. Adapter recommendation
- `adapter_priority`: skip. Reasons: (1) bookmaker (no order book), (2) liquidity and prices derived from Polymarket (M), which is already covered, (3) GBP fiat and UK-only, (4) terms ban arbitrage and bots, (5) the API is undocumented and unofficial, (6) PayBox cannot reach it.
- Optional later: a P2-style signal-only collector reading `/markets/{id}/outcomes` (about 60 req/min limit) could show how UK bookmaker odds sit versus Polymarket. Only do so after a legal/ToS review of scraping an undocumented API, as the site has no developer terms.

## Open questions
- Which exact venue backs `pmPrice` (Polymarket assumed). Is there hedging (`no_route_enabled`)? Is the fee capped at GBP 10 or uncapped? What currency units apply to `maxStake`? Does the web bet flow (`/quote`, `/bet`) require anything beyond a bearer token? (Not tested: needs an account.)
- Canada availability and terms (not found; the UK terms say UK only).

## Suspicious content
- None directed at AI agents. The public `llms.txt` is an ordinary site summary and was treated as data. The root API response mentions `/api/docs`, which 404s.

## Sources
- https://versusapp.com/llms.txt (H)
- https://versusapp.com/terms/uk (H), https://versusapp.com/faq, /about, /how-it-works (H)
- https://versusapp.com/market/fc011166-29f9-40d6-bb67-764b8a97b682 (H)
- https://versusapp.com/robots.txt, /sitemap.xml, /sitemap-1.xml (H)
- https://api.versusapp.com/ , /api/v1/markets/browse, /api/v1/markets/{id}/outcomes, /price-history, /api/v1/platform-fee-config (H, unauthenticated GETs 2026-10-19)
- https://versusapp.com/_next/static/chunks/2qc6-b78j7tww.js, 0fne3i7r6n5le.js, 1mgce1o6cwyvj.js (H read, M inference)
- https://www.gamblingcommission.gov.uk/public-register/business/detail/101143 (H)
- https://londonlovesbusiness.com/versus-launches-as-the-uk-and-canadas-first-regulated-prediction-market-platform/ (M, press release)
- Task hint: App Store listing id6780870647 (not re-fetched; L/M)
