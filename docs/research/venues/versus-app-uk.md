# Versus App (UK) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale/speculative.
Read-only research: only unauthenticated GETs; no account, no signing, no POST. Fixtures in `docs/research/fixtures/versus-app-uk/`.

## Verdict

- Adapter priority: **P2 (signal-only)**. Live and has an unauthenticated JSON read surface, but it is house-quoted (a counterparty quoting prices with stake limits), fiat-only, UK-KYC'd, and has no documented API or trade path. It is not an independent order book and cannot be reached from a PayBox wallet.
- Value to the project: a UK-flavoured price/quote signal on rates decisions (BoE, Fed, ECB, Russia CBR), UK politics, F1 and crypto-event markets. Possible reference-price comparisons only.

## Liveness (H)

- versusapp.com serves a Next.js app shell; `https://api.versusapp.com/health` returned `status: healthy`, snapshot age 4.6 s, timestamp 2026-10-19T07:08Z (H; fixture `health.json`).
- Live market data is current: markets created 2026-10-05, end dates through 2027-03 (H; fixtures).
- Launch date disputed: press releases say 1 Jun 2026 (UK and Canada), a review site says live 3 Aug 2026 (M). Either way under 5 months old.
- iOS app listing `apps.apple.com/gb/app/versus-prediction-markets/id6780870647` exists (M, via search snippet); Android APK from company site (M).

## Kind and market model

- Kind: licensed UK fiat prediction-market / betting operator (`versus Inc`, Isle of Man company 023191V) (H, licence page).
- Outcomes: `answer_type` is `yesno` or `multiple` (categorical). Sample of 200 live markets: 118 yesno, 82 multiple, all status `live` (H). No scalar markets seen.
- Pricing model: **house-quoted, not an order book and not an AMM** (M, inferred from API). Evidence: per-outcome `pricingModel: "simple_launch_v1"`, `quoteValidUntil` ~60 s after `priceUpdatedAt`, `maxLiability: 50000`, `liability`, `capacityPercent`, `minStake`/`maxStake` (1..100000), `coveredStakeFrom/To`, `floorOffer` flags (H, fixture `market-outcomes.json`). Quotes are decimal `odds` (Yes) and `oddsNo` (No), plus `impliedProbability` = 1/odds.
- Official marketing copy: prices 0p to 100p, read as probabilities, winners settle 100p, losers 0p, you can sell at the current price while open; no leverage (H, versusapp.com/blog/what-is-the-versus-app via WebFetch).
- Tokenisation: none on-chain. Positions are ledger entries in the operator's database (M).
- Odd data point (L): `pmPrice` per outcome sums to ~0.98 on the UK CPI market (looks like a reference/fair probability, perhaps from another venue or a model), while the quoted `impliedProbability` sums to 2.16 and individual quotes disagree strongly with `pmPrice` (e.g. odds 2.7 vs pmPrice 0.047). The price-history series oscillates between ~0.57 and ~0.60 in a regular pattern. Treat quotes as unreliable until understood; do not assume tradeable edge. The meaning of `pmPrice` is NOT FOUND (searched: site copy, blog, JS chunks by grep).

## Chains and collateral

- Fiat GBP via Nuvei (payments) and Xace (banking/account services); payment method must belong to the verified account holder; no credit cards; ID + selfie before first withdrawal; "ordinary money, not cryptocurrency" (H, versusapp.com/policies and blog).
- The client bundle contains Privy-style SIWE/SIWS/wallet-link and Coinbase on-ramp routes (H, found in public JS), but the official copy says fiat only; wallet features are likely template residue or not enabled for GB (L).

## Read API

- Official docs: NOT FOUND. `GET api.versusapp.com/` returns `{"message":"Versus API","version":"1.0.0","documentation":"/api/docs"}` but `/api/docs`, `/docs`, `/openapi.json` all 404 (H). No developer page found (searched: site, search engine, blog).
- Classification: **unofficial-only** (undocumented endpoints used by the public web app's guest-browsing mode; no key needed).
- Base URL: `https://api.versusapp.com/api/v1` (H, from public JS bundle).
- Unauthenticated endpoints confirmed with GET (H):
  - `GET /api/v1/markets/browse?limit=&offset=&category=&q=&featured=&sportsTopic=&ticker=true` -> `{markets[], total, hasMore, limit, offset, ...}`. `total` = 7838 on 2026-10-19 (includes all statuses/pagination scope unknown; the 200-row sample was all `live`). Fixture `markets-browse-limit3.json`.
  - `GET /api/v1/markets/{marketId}/browse` -> `{market{...}, outcomes[{id,name,status,odds,impliedProbability,available}]}`. Fixture `market-detail-browse.json`.
  - `GET /api/v1/markets/{marketId}/outcomes` -> richer per-outcome quote incl. `odds`, `oddsNo`, `pmPrice`, `pmPriceNo`, stake limits, `maxLiability`, `quoteValidUntil`. Fixture `market-outcomes.json`.
  - `GET /api/v1/markets/{marketId}/price-history?range=1h|2h|5h|1d|1w|1m` -> `{history:[{t,p}]}` (H, not saved).
  - `GET /health` (fixture `health.json`).
- Authenticated (401 "Missing or invalid authorization header") (H): `GET /api/v1/markets/{id}`, `/markets` (with auth), `/user/bets`, `/position`, `/orders`, `/portfolio/...` (route names seen in JS, M).
- Market fields: `id` (UUID), `headline`, `description` (resolution rules text), `category` (economy, sports, politics, entertainment, pop_culture, crypto, geopolitics, tech, other, finance, science, weather), `answer_type`, `answer_options`, `end_date`, `status`, `settled_at`, `payout_type`, `payout_after`, `source_name`.
- Rate limits / websocket: NOT FOUND (searched: response headers not inspected beyond status, JS chunks, docs). No websocket route identified.
- Quote validity is 60 s and prices refresh on a ~5 s snapshot (`refresh_interval_ms: 5000` in /health) so polling is cheap but stale-prone.

## Trade path

- Programmatic: none documented. The app does call authenticated `POST`-style routes (`/api/v1/orders`, `/rfqs`, `/user/bets` names found in JS) behind a Privy-style session (SIWE/passkey/OAuth/passwordless) (M). Not investigated further; no accounts created, nothing signed.
- Practically: UK-only KYC'd consumer account; automation would mean driving a retail session. Not viable for an agent.

## PayBox reachability

- **No.** Funding and withdrawals are fiat card/bank rails tied to a verified individual; there is no on-chain contract, EVM/Solana address, or signed-order scheme to submit through transaction proposals (H for fiat-only, M for no on-chain venue).

## Fees (H)

- 2% of stake, added on top of the stake, no cap, paid by the trader, shown before confirm; "Fee Credit" can offset only this fee. Deposits/withdrawals free within normal limits (versusapp.com/policies, blog). Spread/margin in the house quote is additional and unquantified (L).

## Resolution and dispute risk

- Each market names its settlement source before trading (blog, H); the `description` field carries the rule text (e.g. UK CPI September 2026 as published). Source is "Versus Markets" for ~92% of the 200-sample (H), i.e. operator-defined resolution, centralised.
- `payout_type: after`, "Immediately after end" on the sample market (H).
- Disputes: support and complaints inboxes, then IBAS ADR (H, policies). No on-chain or UMA-style dispute. Wording differences versus Polymarket/Kalshi rules make cross-venue "same event" matching risky.

## Geo / ToS / automation

- Licensed in Great Britain; press releases say also Canada, Latin America and parts of Europe (M). Claims Polymarket and Kalshi block UK users (M).
- Licence: Gambling Commission operating licence, account 101143, ref shown as 101143-R-342325-002 on the licence page vs 000-101143-R-342325-001 in a press release; press release says Remote General Betting (H licence page for number and operator; M for licence type). I did not check the Gambling Commission public register directly. The sponsored Pinion release is promotional.
- Operator naming inconsistent across sources (versus Inc / versus International Inc / WORLDORF Ventures LLC) (M).
- Automation, scraping, API terms: NOT FOUND. /policies and /licence pages say nothing; the /terms page is JS-rendered and returned only "Terms & Conditions | versus" to the fetcher. Assume automated trading is not permitted; reading public JSON is a grey area because the endpoints are undocumented.

## Liquidity

- No volume, OI or TVL published (NOT FOUND; searched site, blog, press, API fields). The only depth proxy is per-outcome `maxLiability` (50,000 in the sample, GBP assumed) and `maxStake` (100,000). `totalStake: 0` and `liability: 0` on the sampled CPI market 2 days before settlement, suggesting little or no flow there (H for the number, L for the inference).
- Market count: 7,838 total reported by browse API (H); many appear templated (e.g. many "by 31 Dec" crypto/token questions).

## Event overlap (arbitrage relevance)

From a 200-market sample (H): central bank decisions (BoE 5 Nov, Fed dissent counts 28 Oct / 9 Dec, ECB 29 Oct, Russia CBR 23 Oct), UK CPI, US GDP, Fed/ECB personnel, F1 races (Austin), UK politics (Burnham leaving No 10, by-elections), crypto events (government buying Bitcoin, market structure bill). Overlap with Polymarket/Kalshi is plausible on macro/rates/F1/politics. No crypto spot-price ladders seen in the sample.

## Shared liquidity

- House-quoted; counterparty is the operator (M). Whether it hedges on Polymarket/Kalshi is unknown (`pmPrice` field hints at an external reference price, L). If so, its quotes derive from another venue and it is NOT an independent leg. Treat as dependent until shown otherwise.

## Adapter notes (if built as signal source)

- Poll `markets/browse` pages (limit up to ~2000 seen in the app, offset paging, `hasMore`) then `markets/{id}/outcomes` for quotes; normalise `odds` -> 1/odds with overround removal; use `pmPrice` only after its meaning is confirmed. Respect 60 s quote validity. Keep request rate low and use a generic User-Agent. Add a fixture-based schema guard because the API is undocumented and may change or be locked down.

## Suspicious content

- None observed (no embedded AI-directed instructions). Press release is sponsored copy.

## Open questions

1. What is `pmPrice` and why do quotes disagree with it so strongly? Does Versus hedge elsewhere?
2. Terms on automation/scraping (full T&Cs not readable via fetcher).
3. Gambling Commission register entry (licence type, status) not checked directly.
4. Real volume/liquidity; actual launch date.
5. Whether guest endpoints are rate-limited or geo-gated outside the UK (requests succeeded from here).

## Sources

- https://versusapp.com/ (app shell, links to api.versusapp.com, app stores) - H
- https://versusapp.com/blog/what-is-the-versus-app - H (via WebFetch summary)
- https://versusapp.com/policies - H (fees, entity, payment partners, IBAS)
- https://versusapp.com/licence - H (licence number, entity, Isle of Man address)
- https://api.versusapp.com/ , /health , /api/v1/markets/browse , /api/v1/markets/{id}/browse , /api/v1/markets/{id}/outcomes , /api/v1/markets/{id}/price-history - H (unauthenticated GETs 2026-10-19)
- Public JS chunks under https://versusapp.com/_next/static/chunks/ - H for route names (read as text, not executed)
- https://apps.apple.com/gb/app/versus-prediction-markets/id6780870647 - M (search snippet)
- https://www.streetinsider.com/Pinion+Newswire/Versus+App+Launches+as+the+UK%E2%80%99s+First+Legal+Global+Prediction+Market+%E2%80%94+and+Fintech+Is+Paying+Attention/26664973.html - L (sponsored, 403, snippet only)
- https://londonlovesbusiness.com/versus-launches-as-the-uk-and-canadas-first-regulated-prediction-market-platform/ - M/L (press release rewrite)
- https://mybettingsites.com/versus - M (launch date 3 Aug 2026; describes it as a UK-licensed bookmaker)
