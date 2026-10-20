# Polym / Polymtrade (polym.trade) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Used: WebFetch of public pages, one extended WebSearch, unauthenticated GETs to Polymarket public hosts, and a re-read of the local fixtures from an earlier pass (`docs/research/venues/polymtrade.md`, `docs/research/fixtures/polymtrade/`, same venue under a different slug; this note re-verifies its key numbers and consolidates). No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. `polym.trade/api/*` was not probed (robots.txt `Disallow: /api/`). User-Agent on scripted requests: `insurance-markets-research/0.1`.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inference; **L** = weak or stale (>6 months).

Fixtures (all < 50 KB) in `docs/research/fixtures/polym/`:
- `polymarket_builder_leaderboard_all_top10_polymtrade_2026-10-19.json`
- `clob_builder_fee_config_2026-10-19.json`
- `gamma_event_fed_2026-10-19.json` (27 KB, the underlying Polymarket event the app displays)

---

## 0. Verdict

**adapter_priority = skip.** Live, but a builder-code front end for Polymarket, not a venue.

1. Live: yes (H). Small and declining routed volume.
2. Kind: broker / front end (mobile + web terminal) over Polymarket's CLOB. Docs: "an independent mobile trading terminal for prediction markets. It works with markets listed on Polymarket through Polymarket's public API." (H, https://docs.polym.trade/)
3. Liquidity is 100% Polymarket's. It is NOT an independent arbitrage leg (H). Using it only adds a 25/50 bps builder fee.
4. No public API of its own (H for absence). Use Polymarket's APIs directly.
5. Not reachable as a programmatic venue via PayBox: trading is behind a Privy-authenticated app session with no published signing or order interface. The Polymarket route (EIP-712 CLOB orders on Polygon) is the Polymarket adapter's job.
6. Useful by-product: Polymarket publishes this builder's attributed volume and fee config (flow signal, free if we already ingest the Polymarket Data API).
7. Competitive note (M): its docs roadmap lists multi-platform aggregation, cross-platform arbitrage and Kalshi trading, so it is a prospective competitor, not a supplier.

---

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| WebFetch https://polym.trade/ (2026-10-19) | Page "Prediction markets on Polymarket - Polymtrade", event cards with prices; fetch summary also saw a transient "The app didn't load properly" error string in the SPA shell | H |
| https://polym.trade/terms | "Last Updated: October 8, 2026" | H |
| Polymarket builder leaderboard (see section 9) | verified builder `polymtrade`, routed volume in the last 24h on 2026-10-19 | H |
| WebSearch (extended) | App Store listing (seller Accunex Digital Ltd, ~2.7/5 from 12 ratings), X account announcing features, several third-party directory pages; "independent sources are sparse" | M |
| Trend | WEEK $1.29M vs MONTH $18.36M vs ALL $327.6M: routed volume has dropped sharply recently | M |

still_live = true.

---

## 2. Kind and market model

- Broker / front end using Polymarket's "builder code" attribution (H: builder `polymtrade`, verified, rank 6 all-time on the Polymarket leaderboard).
- Market model = Polymarket's (H via fixture): binary Yes/No and neg-risk multi-outcome events, central limit order book (`enableOrderBook: true`, `negRisk: true`), `clobTokenIds` pairs per market, outcomes as Polymarket conditional ERC-1155 tokens. Order types seen in the earlier bundle read: market (FAK/FOK) and limit (GTC/GTD) (M, from the earlier static read of the site's JS, not re-read this session).
- Not live today (M, earlier bundle read + docs roadmap): Kalshi markets via DFlow ("Soon"), plus a Polymarket perps module and AI-insight screens. None has a public data endpoint.

## 3. Chains and collateral

- Trading chain: Polygon (H, docs). Collateral per docs: USDC.e on Polygon; other deposited tokens "automatically converted" (H, docs, via earlier llms-full fixture `docs/research/fixtures/polymtrade/docs.polym.trade_llms-full.txt`). Possible newer Polymarket collateral ("pUSD") hinted in app code: unverified (M), belongs to the Polymarket spec.
- Deposit networks (H, docs): Polygon, Solana, Ethereum, BNB Chain, Base, Arbitrum, Optimism, World Chain; tokens USDC, USDT, DAI, WETH, WBTC, USDC.e; card on-ramp via MoonPay.
- Wallet: Privy embedded EVM wallet (email login) or external wallet; docs claim self-custodial, "you sign every transaction".
- $PM token on Solana is irrelevant to market data.

## 4. Read API

- Official public API: NONE. NOT FOUND (searched: docs.polym.trade home, llms.txt, llms-full.txt, sitemap; polym.trade footer; WebSearch). Docs have no developer section (H, WebFetch https://docs.polym.trade/: "doesn't describe a developer or trading API").
- Official authenticated API: NOT FOUND (same searches). No GitHub org found (M; earlier `gh` search found only two unofficial third-party repos, unread).
- Internal `/api/*` routes exist behind the SPA (earlier bundle read, M), undocumented and disallowed by robots.txt. Not used.
- Rate limits / websocket: none published by Polymtrade.
- **Real data lives on Polymarket's public hosts** (unauthenticated, confirmed 2026-10-19):
  - `GET https://gamma-api.polymarket.com/events/slug/<slug>` -> 200, 27 KB. Event keys include `title, slug, volume, liquidity, openInterest, volume24hr, enableOrderBook, negRisk, markets[]`; each market has `outcomes, outcomePrices, bestAsk, clobTokenIds, feeSchedule, umaResolutionStatus` (`bestBid` is absent/null when the book has no bid). Sample (`updatedAt` 2026-10-19T07:07Z): Fed Oct 2026 decision, volume $47.2M, OI $6.40M, liquidity $4.57M. (H, fixture `gamma_event_fed_2026-10-19.json`)
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=all|month|week|day&limit<=200` -> `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination}`. The older `/v1/builders/leaderboard?timePeriod=ALL` (the discovery URL) still answered 200 today in a different shape (`{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}` array); another note records v1 retirement on 2026-10-24 (M), so use v2. (H, fixture)
  - `GET https://clob.polymarket.com/fees/builder-fees/<builder_code>` (H, fixture).

## 5. Trade path

- Official programmatic path: none. Orders go through the app session (Privy login). NOT FOUND (searched: docs, ToS).
- Earlier static bundle read (M): the client posts order intents (token id, side, amount/price/size, order type) to `polym.trade/api/polymarket/order/*` without a visible client-side signature, implying server-side or delegated signing with the builder code attached. This conflicts with the docs claim of user-signed transactions; unverified.
- PayBox: an EVM wallet (Polygon) could trade the same markets only by going to Polymarket directly (signed CLOB orders / CTF transactions), covered by the Polymarket adapter. Via Polymtrade: no agent-callable path. paybox_reachable = no (for this venue).

## 6. Fees

| Fee | Value | Payer | Tag |
|---|---|---|---|
| Builder fee, taker | 50 bps (0.5%) | trader | H (`clob.polymarket.com/fees/builder-fees/0x7f8b...4528` returned `builder_taker_fee_rate_bps: 50, enabled: true`; docs "0.5% on buy/sell") |
| Builder fee, maker | 25 bps (0.25%) | trader | H (same endpoint) |
| Waiver | none for holders of >= 1M $PM per docs | - | M (earlier docs read) |
| Polymarket fee | per market `feeSchedule {exponent 1, rate 0.05, takerOnly true, rebateRate 0.25}` in sample | trader | H (fixture); formula belongs to Polymarket spec |
| Gas | platform claims to cover Polygon gas | Polymtrade | M (docs/roadmap claim) |

Docs are internally inconsistent: marketing says "Zero-fee trading on all markets" and the same page says "0.5% on buy/sell" (H, `docs/research/fixtures/polymtrade/docs.polym.trade_llms-full.txt` lines ~950-959). Trust the CLOB config endpoint. Any Polymtrade quote = Polymarket price + 25-50 bps.

## 7. Resolution and dispute risk

Same as Polymarket (UMA optimistic oracle; `umaResolutionStatus` field in Gamma). ToS: Polymtrade "does not determine the outcome of prediction markets or guarantee execution, liquidity or returns" (H, earlier fetch of https://polym.trade/terms, updated 2026-10-08). Extra broker-layer risks: server-side auto-redeem/claim, unclear signing model, offshore operator.

## 8. Geo / ToS / automation

- Operator per ToS: Morrow.is LLC, Saint Vincent and the Grenadines; App Store seller is Accunex Digital Ltd; not reconciled (M, earlier fetch).
- Eligibility: 18+, must comply with "the eligibility requirements of each venue and payment provider"; no explicit country list (H). Polymarket's restrictions still bind.
- Automation: nothing explicit; ToS bars using the service to "evade applicable restrictions, commit fraud, ... disrupt the Services or manipulate markets" (H). No API terms because no API. robots.txt disallows `/api/`.

## 9. Liquidity (Polymarket Data API, 2026-10-19, H)

| Window | Routed volume | Active users | Rank |
|---|---|---|---|
| ALL | $327.6M | 34,423 | 6 |
| MONTH | $18.36M | 3,104 | 7 |
| WEEK | $1.29M | 735 | 8 |
| DAY | $166K | 191 | 7 |

(v2 `volume` is documented in shares in another note; for a ~$0.5-1 share the dollar figure is of the same order, M. Window semantics undocumented.) The venue has no order-book liquidity of its own.

## 10. Event overlap

Whole Polymarket catalogue: politics, sports, crypto price ladders, macro (Fed), geopolitics, weather, pop culture, esports. Overlaps every other venue exactly as Polymarket does, but arbitrage against Polymtrade is arbitrage against Polymarket itself, so zero independent edge.

## 11. Shared liquidity

**Shares liquidity with: Polymarket (global CLOB), 100%** (H). Not an independent leg.

## 12. Open questions

- Who signs orders (Polymtrade backend vs user's key)? Affects custody-risk wording only.
- Does the Kalshi/DFlow path ship? Revisit only if a public API appears.
- Operator identity (Morrow.is LLC vs Accunex Digital Ltd).

## Sources

| Source | Used for | Tag |
|---|---|---|
| https://polym.trade/ | live status, product text | H |
| https://polym.trade/terms | updated date, eligibility, restrictions | H |
| https://docs.polym.trade/ | description, no developer API | H |
| https://docs.polym.trade/llms-full.txt (via local fixture from earlier pass) | deposit chains, fee statements | H |
| https://data-api.polymarket.com/v2/builders/leaderboard | routed volume, rank | H |
| https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50 | discovery evidence, v1 shape | H |
| https://clob.polymarket.com/fees/builder-fees/<code> | builder fee bps | H |
| https://gamma-api.polymarket.com/events/slug/fed-decision-in-october-20260617190323537 | response shape, market sample | H |
| WebSearch (extended) results: App Store id6747924062, polymark.et, polbots.com, polycatalog.io | seller, rating, third-party descriptions | M |
| `docs/research/venues/polymtrade.md` (earlier pass, same venue) | bundle-read details marked M above | M |

Suspicious / embedded instructions: none aimed at AI agents. Notes: docs.polym.trade serves a `Content-Signal: ai-train=yes` policy header (policy, not an instruction); a docs page carries an affiliate referral link (not followed); the search snippet mentioned a promotional wallet-gains claim on the project's X account (marketing, not read).
