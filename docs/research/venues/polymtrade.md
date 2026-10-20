# Polymtrade (polym.trade) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs (polym.trade HTML/robots/sitemap/static JS chunks read as text, never executed; docs.polym.trade llms files; three Polymarket public endpoints used as cross-checks), `gh api` repository search. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. polym.trade `/api/*` was NOT probed (robots.txt `Disallow: /api/`; undocumented). No browser automation. User-Agent on every scripted request: `insurance-markets-research/0.1`.

Research limit: the shared WebSearch budget was already exhausted when this task started (the one search attempted was refused), so discovery rests on first-party probing of polym.trade and docs.polym.trade, CoinGecko, the App Store page and Polymarket's public APIs. No web-search pass was possible. X (x.com/polymtrade) returned HTTP 402 to WebFetch (an X access wall; no body, nothing paid, nothing retried).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/polymtrade/` (see its README.md).

---

## 0. Bottom line

1. **Live: yes (H).** polym.trade returns 200 (Vercel), ToS "Last Updated: October 8, 2026", docs roadmap page edited 2026-09-24, and Polymarket's own builder leaderboard shows it routing $66K of volume in the last 24h on 2026-10-19.
2. **It is a front end, not a venue (H).** Docs: "an independent mobile trading terminal for prediction markets. It works with markets listed on Polymarket through Polymarket's public API." Every market, price and order book is Polymarket's. Our own cross-check: the polym.trade homepage showed Fed-decision outcome prices 88c / 13c, equal to the Polymarket Gamma best asks 0.88 / 0.13 for the same event slug.
3. **Liquidity is 100% shared with Polymarket (H).** It is NOT an independent arbitrage leg. Adding it would only add a 25/50 bps builder fee on top of Polymarket.
4. **No public API of its own (H for absence).** The only machine interfaces are undocumented internal `/api/*` routes behind a session, plus CORS reverse proxies to Polymarket's own public hosts. Use Polymarket directly.
5. **Reachability via PayBox: no for Polymtrade as a venue.** Trading requires a Privy-authenticated app session; no signed-order or transaction-proposal interface is published. The underlying Polymarket route is a separate adapter.
6. **adapter_priority = skip** (duplicate liquidity, no API, adds fee). Two useful by-products: (a) Polymarket publishes Polymtrade's builder-attributed volume, a flow signal that costs nothing extra if we already ingest the Polymarket Data API; (b) Polymtrade's roadmap lists "aggregation of markets from multiple platforms" and "cross-platform arbitrage", so it is a prospective competitor, not a supplier.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://polym.trade/` | 200, server Vercel, title "Prediction markets on Polymarket - Polymtrade", server-rendered event cards with live prices | H |
| `https://polym.trade/terms` | "Last Updated: October 8, 2026" (11 days before probe) | H |
| docs.polym.trade sitemap lastmod | roadmap 2026-09-24, home 2026-09-25, import-key guide 2026-09-24; `/pm` 2025-11-24 and team/contact 2025-09-17 are older than 6 months (possibly stale) | H |
| Apple App Store `id6747924062` | "Polymtrade: Prediction Trading", seller Accunex Digital Ltd, Version 2.1 "Sep 30" (year not shown on the page), rating 2.8/5 from 13 ratings, 18+ gambling flag | M (WebFetch summary) |
| Polymarket Data API builder leaderboard, 2026-10-19 | `polymtrade` is a verified builder; DAY volume $66,336 (rank 10), WEEK $1.19M (rank 8), MONTH $18.26M (rank 7), ALL $327.5M with 34,415 active users (rank 6) | H |
| CoinGecko `polymtrade` | $PM token (Solana), rank #3987, 24h volume $170.51, market cap $357,947, category "Prediction Market Tools" | H (page), token is irrelevant to market data |
| Trend | 7-day $1.19M versus 30-day $18.26M (window semantics undocumented) suggests volume has dropped sharply recently | M |

Verdict: **still_live = true**, small and declining routed volume.

---

## 2. Kind and market model

- **Kind: broker / front-end (builder-code frontend) for Polymarket** (H). Polymarket "Open Builders Program" participation is listed as completed on the docs roadmap (H); the leaderboard confirms a registered builder.
- **Market model: identical to Polymarket** (H): binary and multi-outcome (neg-risk) events, central limit order book, outcome tokens are Polymarket CTF ERC-1155 positions (the bundle uses the Polymarket CTF address `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` and `clobTokenIds`). Order types seen in code: market (FAK/FOK) and limit (GTC/GTD). Sample event JSON: `fixtures/polymtrade/gamma_event_fed-decision-october-2026.json` (`negRisk: true`, `enableOrderBook: true`, 5 markets, `clobTokenIds` pairs, `feeSchedule {rate 0.05, takerOnly, rebateRate 0.25}`).
- **Extras in the app (M, static bundle read):**
  - *Kalshi:* a Kalshi-via-DFlow code path exists (`/api/dflow/api/v1`, `/api/user/kalshi-orderbooks`) but is gated off by a hard-coded false in the events store. Docs roadmap lists "Trading Kalshi markets" under "Soon". Not live today.
  - *Polymarket perps:* a perps module exists (`brand.perps = true`, `/api/perps/*`, proxy to `api.perpetuals.polymarket.com`), and the ToS mention perpetual futures. This belongs to the Polymarket workflow.
  - *AI features:* an AI-prediction dashboard (`/ai`), commenting and a news page. They are client-rendered, with no public data endpoint.

---

## 3. Chains and collateral

- **Trading chain: Polygon** (H, docs). Collateral is USDC.e on Polygon per docs: other tokens "will be automatically converted to USDC.e on Polygon for trading".
- **Possible collateral change (M, unverified):** the app code names the trading balance `pusd` and has `/api/polymarket/migrate`, hinting at a newer Polymarket collateral token or account type ("pUSD"). I did not verify this. It belongs to the Polymarket venue spec.
- **Deposit networks (H, docs):** Polygon (zero fee on their side), Solana, Ethereum, BNB Smart Chain, Base, Arbitrum, Optimism, World Chain. Accepted tokens: USDC, USDT, DAI, WETH, WBTC, USDC.e. Card on-ramp via MoonPay (KYC by MoonPay).
- **Wallet model (H, docs/ToS):** a Privy embedded EVM wallet is created by email login, or an external wallet is connected. The private key is exportable. Roadmap says "Polygon + Solana wallet generation via Privy". The docs claim "self-custodial ... you sign every transaction".
- **$PM token (H):** Solana, launched on Believe, pool on Meteora DAMM v2. It is only a fee-discount and utility token and is irrelevant to market data.

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **NONE.** docs.polym.trade has 10 pages (what it is, $PM, team, roadmap, contact, 5 user guides). No API/developer section; llms.txt and llms-full.txt confirm. | H |
| Official authenticated API | NOT FOUND (searched: docs llms.txt/llms-full.txt, polym.trade footer/sitemap, GitHub repo search for `polymtrade`, `polym.trade`) | H |
| GitHub | No official org/repo found. Two zero-star third-party repos mention the name (`Clothingxtreme/polymtradebackend`, pushed 2026-07-07; `hubseer/Polymtrade---...`, pushed 2025-12-13); neither was read (untrusted, unverified). | M |
| Internal web API | The SPA calls `/api/catalog/search`, `/api/polymarket/{order/market,order/limit,order/cancel,order/status,order/open,allowances,migrate,resolution,username,referral/code,referral/apply,ws}`, `/api/user/{init,claim,autoredeem,operations,withdraw,offramp,ref,kalshi-orderbooks}`, `/api/perps/*`, `/api/translate`, `/api/geo`. Undocumented, session-oriented, disallowed in robots.txt, **not probed**. | H (existence) |
| CORS proxies | The bundle defines same-origin proxies on polym.trade: `/gapi` -> gamma-api.polymarket.com, `/clob` -> clob.polymarket.com, `/data` -> data-api.polymarket.com, `/upnl` -> user-pnl-api.polymarket.com, `/relayer` -> relayer-v2.polymarket.com, `/pperp` -> api.perpetuals.polymarket.com, `/papi` -> polymarket.com, `/pmstatus` -> status.polymarket.com. They are pure pass-throughs of Polymarket's hosts; not used or probed. | H (static read) |
| Rate limits / websocket | None published by Polymtrade. Polymarket's apply (see the Polymarket spec). | - |

**Where the data actually comes from (public, unauthenticated, confirmed with real GETs 2026-10-19):**

- `GET https://gamma-api.polymarket.com/events/slug/<slug>` returns 200, 27 KB. Fields include `title`, `slug`, `volume`, `liquidity`, `openInterest`, `volume24hr`, `enableOrderBook`, `negRisk`, and `markets[]` with `outcomes`, `outcomePrices`, `bestBid`, `bestAsk`, `clobTokenIds`, `conditionId`, `questionID`, `umaResolutionStatuses`, `feeSchedule`. Fixture: `gamma_event_fed-decision-october-2026.json`. Sample values at `updatedAt` 2026-10-19T03:57Z: volume $46.9M, OI $6.34M, liquidity $5.0M, 24h volume $1.81M.
- `GET https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=200` returns 200: `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination}`. Fixture: `polymarket_builder_leaderboard_polymtrade.json`.
- `GET https://clob.polymarket.com/fees/builder-fees/<builder_code>` returns 200: `{code, builder_maker_fee_rate_bps:25, builder_taker_fee_rate_bps:50, enabled:true}`. Fixture: `polymarket_clob_builder_fee_config.json`.

Cross-check of shared liquidity (H): polym.trade home showed "No change 88c / 25 bps increase 13c / 25 bps decrease <1c" for event `fed-decision-in-october-20260617190323537`. Gamma for the same slug: No change bestBid 0.87 / bestAsk 0.88 / last 0.88; 25 bps increase bid 0.12 / ask 0.13; 25 bps decrease bid 0.003 / ask 0.004. Polymtrade displays the buy (ask) price, with a payout multiplier next to it.

---

## 5. Trade path

- **Official programmatic path: none.** Trading needs a Privy-authenticated app session (email or external wallet) in the web/mobile UI. No API key scheme, no documented order endpoint, no signing spec. (H for absence in docs/ToS)
- **How the app places orders (M, static bundle read, not executed):** the client POSTs an order *intent* (`tokenID`, `amount`, `side`; limit: `price`, `size`, `orderType` GTC/GTD, `tickSize`, `negRisk`) to `/api/polymarket/order/market` or `/limit` on polym.trade. The visible payload carries no order signature. That implies Polymtrade's backend (or a Privy delegated signer) builds, signs and forwards the Polymarket order, with builder code attached. This conflicts with the docs claim "you sign every transaction yourself" or at least needs clarification. I could not verify it without executing the app. It matters for custody risk, not for our adapter.
- **PayBox reachability (summary):** no for Polymtrade. A PayBox EVM wallet could be an *external wallet* login in the UI only through a human-driven session, and that gives no agent-callable order path. Nothing about Polymtrade needs PayBox transaction proposals. Agents should sign Polymarket CLOB orders directly (EIP-712, Polygon) and optionally pay no builder fee at all. That route is covered by the Polymarket workflow.

---

## 6. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Polymtrade builder fee, taker | **50 bps (0.5%)** | trader, charged inside the Polymarket order flow | H (`clob.polymarket.com/fees/builder-fees/<code>`; docs say "0.5% on buy/sell") |
| Polymtrade builder fee, maker | **25 bps (0.25%)** | trader | H (same endpoint) |
| Waiver | **0 for holders of >= 1M $PM** | - | H (docs), code agrees (`builder: holder ? 0 : 0.005`) |
| Extra UI buy reserve | the app multiplies the buy cost by 1.0025 for non-holders | trader | M (code `price*(1+(holder?0:0.0025))`; purpose not documented) |
| Polymarket's own fees | event-specific; the sample event has `feeSchedule {rate 0.05, exponent 1, takerOnly true, rebateRate 0.25}` | trader | H (Gamma sample); full formulas are in the Polymarket spec |
| Gas | Platform pays user gas on Polygon ("Zero POL trading") | Polymtrade | H (docs roadmap claim) |
| Deposits / withdrawals | Polygon: "zero fees on our side"; MoonPay card fees and bridge/swap costs are external | trader | H (docs) |

Aggregator consequence: any quote shown through Polymtrade is Polymarket's price plus 25-50 bps. For net-edge maths, Polymtrade is strictly dominated by trading Polymarket directly.

---

## 7. Resolution and dispute risk

- Polymtrade does not resolve markets. ToS section 2 (H): "Polymtrade does not determine the outcome of prediction markets or guarantee execution, liquidity or returns." Resolution, settlement and disputes follow Polymarket (UMA optimistic oracle; the app reads `/v2/resolutions` on the Polymarket Data API and a `/api/polymarket/resolution?qid=&adapter=` helper) (H, code). See the Polymarket spec for dispute mechanics.
- Extra risks specific to the broker layer: auto-redeem and claim routes run through Polymtrade's backend (`/api/user/autoredeem`, `/api/user/claim`) (H existence); the backend-signing question in section 5; operator is an offshore LLC (section 8). The ToS state the operator "does not hold customer funds in a pooled company account" (H).

---

## 8. Geo, ToS, automation

- **Operator (H, ToS 2026-10-08):** Morrow.is LLC, Saint Vincent and the Grenadines (no. 4512 LLC 2026). The privacy policy (updated 2026-06-24) and the App Store seller name Accunex Digital Ltd. The two entities are not reconciled anywhere I read. The docs team page says three builders in "Central Europe", unnamed, "not public figures".
- **Eligibility (H, ToS 3):** 18+; comply with "the eligibility requirements of each venue and payment provider. A publicly accessible website does not establish eligibility for every trading or payment feature." No explicit prohibited-country list in the ToS. Polymarket's restrictions therefore still bind. The deposit widget shows region geoblocks (third-party checkout component, M).
- **Automation / bots (H):** nothing explicit. Prohibited: "evade applicable restrictions, commit fraud ... disrupt the Services or manipulate markets". No API terms exist because there is no API. robots.txt: `Allow: /`, `Disallow: /api/`, sitemap (545 URLs, ~500 `/event/<polymarket slug>` pages).
- **Contact (H, docs):** support address and X handle listed in docs; not needed.
- **Advice disclaimer (H):** ToS 7 says AI output and prices "may be inaccurate or delayed and are not investment, financial, legal or tax advice".

---

## 9. Liquidity

| Measure | Value | Source / date | Tag |
|---|---|---|---|
| Polymtrade-routed volume, ALL | $327.5M, 34,415 active users, rank 6 of builders | Polymarket Data API builder leaderboard, 2026-10-19 | H |
| Routed volume, 30 days / 7 days / 24h | $18.26M (rank 7) / $1.19M (rank 8) / $66.3K (rank 10) | same | H (window semantics M) |
| Venue's own order-book liquidity | **none - all of it is Polymarket's** | - | H |
| Example underlying event | Fed Oct 2026: volume $46.9M, OI $6.34M, liquidity $5.0M | Gamma, 2026-10-19 | H |
| $PM token | 24h volume $170, mcap $358K, FDV same | CoinGecko page, undated snapshot | H |

---

## 10. Event coverage and overlap

Polymtrade lists Polymarket's catalogue. Category pages in its sitemap: politics, sports, finance, crypto, economy, elections, geopolitics, tech, earnings, pop-culture, weather, esports, "mention markets", plus crypto time-bucket pages (5M, 15M, 1h, 4H, daily, weekly, monthly, yearly). The 2026-10-19 homepage shows Fed decision, MLB/NFL/NBA/UEFA/LaLiga/Ballon d'Or, Brazil/Israel/France/US 2028 elections, US-Iran ceasefire, Bitcoin/Ethereum price ladders, Elon Musk tweet counts, GTA VI trailer views, temperature markets.

All of that overlaps other venues in exactly the way Polymarket does (sports, politics, crypto price, macro). **But arbitrage vs Polymtrade is arbitrage vs Polymarket itself**: zero independent edge, so no separate leg.

---

## 11. Shared liquidity

**Shares liquidity with: Polymarket (global CLOB), 100%** (H: docs "works with markets listed on Polymarket through Polymarket's public API"; confirmed by equal prices and by the app's use of Polymarket CLOB/Gamma/Data/relayer hosts and builder-fee endpoint). Treat any Polymtrade quote as a duplicate of the Polymarket quote with a fee surcharge.

---

## 12. Open questions

- Does Polymtrade's backend or a Privy delegated signer sign orders (section 5)? Affects custody-risk wording, not the adapter decision.
- Is "pUSD" a new Polymarket collateral (section 3)? Forward to the Polymarket spec.
- Will the Kalshi/DFlow path be enabled (roadmap "Soon")? Revisit only if Polymtrade ships a public API or becomes a Kalshi+Polymarket aggregation feed, which is unlikely to beat integrating both venues directly.
- Operator identity mismatch (Morrow.is LLC vs Accunex Digital Ltd).

---

## Sources

| Source | Used for | Tag |
|---|---|---|
| https://polym.trade/ (HTML, 2026-10-19) | live status, product copy, `window.__BRAND__` config, category/event listings | H |
| https://polym.trade/robots.txt, /sitemap.xml | crawl rules (Disallow /api/), 545 URLs, categories | H |
| https://polym.trade/terms (updated 2026-10-08), /privacy (updated 2026-06-24) | operator, eligibility, fees wording, no pooled funds | H |
| https://polym.trade/_astro/*.js (View, index, polymarket, Trade, trade, event, perps, consts, openOrders chunks), read as static text only | proxy map, internal `/api/*` routes, fee constants, Kalshi gate, perps, order-intent payload | H (code read), inferences M |
| https://docs.polym.trade/ (+ /llms.txt, /llms-full.txt, /sitemap.xml) | product description, chains, deposits, fees 0.5%, roadmap, token, team | H (some pages > 6 months old: /pm, /team, /contact) |
| https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=DAY/WEEK/MONTH/ALL&limit=200 | Polymtrade routed volume and rank | H |
| https://clob.polymarket.com/fees/builder-fees/0x7f8b6b08...4528 | builder fee 25/50 bps | H |
| https://gamma-api.polymarket.com/events/slug/fed-decision-in-october-20260617190323537 | response shape, price cross-check | H |
| https://www.coingecko.com/en/coins/polymtrade | $PM token, links (website, X), categories | H |
| https://apps.apple.com/app/id6747924062 | app listing, seller, version, rating | M (WebFetch summary) |
| https://x.com/polymtrade | HTTP 402 to WebFetch; nothing read, nothing paid | - |
| GitHub repo search (`polymtrade`, `polym.trade`) via `gh api` | no official repo; two unread third-party repos | M |

NOT FOUND (searched: docs llms files, sitemap, footer, GitHub search): official API docs, SDK, OpenAPI spec, rate-limit statement, websocket spec, bot/automation policy, prohibited-country list, audit report. Not searched (budget exhausted): news coverage such as the QQ News item named in the discovery hint; the builder-program claim is instead confirmed first-hand from the Polymarket leaderboard.

Embedded instructions or suspicious content: none aimed at AI agents. Notes: docs contain a Revolut referral link (affiliate, not followed); docs robots.txt carries a `Content-Signal: ai-train=yes, search=yes, ai-input=yes` header (a policy statement, not an instruction); CoinGecko quotes a Rugcheck warning that the $PM contract creator can change metadata/fees and mint (token only).
