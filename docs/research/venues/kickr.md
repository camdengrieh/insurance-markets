# Kickr (kickr.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:55-04:20 UTC). READ-ONLY: WebFetch/WebSearch, unauthenticated GETs only, no account, wallet, key, signature, POST or PayBox tool. Third-party pages, JS bundles and API responses were treated as untrusted data; nothing in them was followed. No text aimed at AI agents was found anywhere (see section 14). All scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/kickr/` (listed in section 13).

---

## 0. Bottom line

1. **Live, brand new, tiny.** Operator C3 Labs Ltd was incorporated in the British Virgin Islands on 2026-07-10 (ToS). The backend answers `ok:true`, the home feed was generated 2026-10-19 04:08 UTC, and fixtures through 2026-10-24 are listed. Site says "Kickr is in beta" and claims "$230K" volume and "6,300+" trades (undated). Polymarket's own public builder-volume feed credits builder "Kickr.fun" (verified) with only about **$92.4K** of volume from 2026-07-29 to 2026-10-19 (about $38K in the last 30 days, about $9.9K in the last 7, 1 to 12 active users a day), against about $31.7M for all 201 builders on 2026-10-18. (H)
2. **It is a front-end / broker on Polymarket, not a venue.** Every market Kickr shows is a Polymarket market: Kickr market keys are `polymarket:<gammaMarketId>`, the same ids, `conditionId`s and CLOB token ids appear in Polymarket's Gamma API, and the displayed moneyline price (0.39) equals Polymarket's CLOB midpoint (0.39) at the same minute. The ToS says transaction features route to "Polymarket and public blockchain networks", and market resolution follows the "underlying provider". (H)
3. **Liquidity is 100% shared with Polymarket**, so Kickr is **not an independent arbitrage leg**. Anything Kickr quotes, the aggregator already sees from the Polymarket adapter. (H)
4. **No official or documented API.** The backend that serves the web app is an undocumented internal API on a Railway host. A few anonymous GET endpoints exist; trading endpoints need a Privy bearer token, and the trade itself is signed server-side by a "Kickr-controlled additional signer" on the user's embedded wallet. The ToS bars unpermitted automation that burdens the service or breaks provider rules. (H)
5. **adapter_priority = skip.** Duplicate liquidity, no API contract, restrictive geo list, no way for an external agent to place a Kickr order. The only unique data is a small retail-flow / social feed (public parlay activity, "what traders back"), which is signal-only at best (section 12). Build the Polymarket adapter instead; if Kickr's order flow ever matters, ingest it as an optional signal, never as a leg.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Marketing site | `https://kickr.fun` -> 307 -> `https://www.kickr.fun/` (Vercel). Copyright 2026 C3 Labs Ltd; "Kickr is in beta"; claims "over $230K in volume traded", "6,300+ trades", "76% of traders trading again within 7 days" (no date given for any of them) | H (WebFetch of https://kickr.fun) for text; the numbers are self-reported claims |
| Web app | `https://app.kickr.fun` -> 200 (Next.js on Vercel) | H |
| Backend | `GET <backend>/health` -> `{"ok":true,"service":"kickr-backend-v3","chainId":137,...}` (fixture `backend_health_2026-10-19.json`) | H |
| Data freshness | `GET https://app.kickr.fun/api/football/home-feed` -> `generatedAt 2026-10-19T04:08:06Z`, 100 fixtures, kickoffs 2026-10-19 14:00 to 2026-10-24 11:30 UTC, all `scheduled`; prices with `observedAt` 2026-10-19 04:06 UTC | H |
| Settled activity | `GET <backend>/public/parlay-activity?limit=5` -> activity from 2026-10-18 21:29 to 23:14 UTC, including `won`, `lost`, `collected` events (fixture `backend_public_parlay_activity_trimmed_2026-10-19.json`) | H |
| Legal pages | ToS and Privacy "Last updated: October 4, 2026"; restricted-regions page "last updated October 2, 2026" | H |
| Entity | "C3 Labs Ltd, a company incorporated in the British Virgin Islands on July 10, 2026" (ToS) | H |
| Social | Telegram `t.me/kickrdotfun` preview shows 65 members, no posts visible to the scraper; X `x.com/kickrdotfun` not fetched (not readable by tooling) | M |
| Press | WebSearch (extended) x2 found no independent coverage of Kickr; the Polymarket Builders leaderboard page (top 50 by 1-month volume, truncated) does not show it, consistent with Kickr's daily rank of about 100 to 170 in the data feed (section 10) | M (absence of press only) |

Verdict: **still_live = true**; three months old, beta, tiny.

---

## 2. Kind and market model

- **Kind (H):** broker / front-end ("football trading app") that wraps Polymarket. It adds football data (scores, stats, team news, AI "intel" per fixture), social features (follow traders, copy trades, public profiles), and parlays. Source: https://kickr.fun; ToS section 2.
- **Market model = Polymarket's (H):** binary YES/NO outcome tokens on the Polymarket CLOB (central limit order book), football match markets grouped per fixture. Observed families in the feed: `moneyline` (home / draw / away are three separate binary "Will X win on DATE?" markets in a neg-risk group), `btts`, `totals` (fixture `app_home_feed_trimmed_2026-10-19.json`, parlay fixture). Token ids are Polymarket `clobTokenId`s (decimal uint256 strings). `negRisk: true` on the moneyline markets checked.
- **Price shown (H/M):** the feed's `moneyline.home.price` is 0.39 and Polymarket's `GET https://clob.polymarket.com/midpoint?token_id=<same id>` returned `{"mid":"0.39"}` at about the same minute; Gamma `outcomePrices` `["0.39","0.61"]`, `bestBid 0.38`, `bestAsk 0.4` (fixture `polymarket_gamma_market_5340724_crosscheck_2026-10-19.json`). So Kickr displays the Polymarket midpoint, rounded to cents. (H for the data, M for the "midpoint" interpretation)
- **Parlays ("combos") (H):** Kickr's parlay builder uses Polymarket's own Combos product, an RFQ (request for quote) system, not an order book: a request goes to competing market makers who have 400 ms to quote, the user has 10 s to accept, optional 1 s "last look" (https://docs.polymarket.com/trading/combos/overview.md). Kickr's client schema carries `rfqId`, `positionId`, `clobTokenId` for combo legs and calls `/v1/combos/requests/...`, `/v1/combos/catalog`, `/v1/combos/quote-intents` on its backend (read from the public JS bundle, M-to-H: the strings are first-hand, the interpretation that they proxy Polymarket Combos is inferred and fits the Polymarket "Combos for Builders" doc, https://docs.polymarket.com/trading/combos/builders.md). Combos have no order book, so they cannot be an arbitrage leg anyway.
- **Limit orders (H, bundle):** the client has `getLimitOrderBook`, `getLimitOrders`, `cancelLimitOrder`, `replaceLimitOrder`, so ordinary CLOB limit orders are proxied too.

---

## 3. Chains and collateral

- **User-facing deposit/withdraw chains (H):** Solana, Monad, Base, Arbitrum, Polygon, Ethereum (site text; the bundle's route schema enumerates exactly `ethereum, polygon, solana, arbitrum, base, monad`). Wallets are provided by Privy; sign-in is email, Google, Apple, X or a Solana wallet (https://kickr.fun).
- **Settlement chain / collateral (H):** Polygon (backend reports `chainId 137`). Polymarket's collateral is **pUSD** ("the collateral token used for all trading on Polymarket", https://docs.polymarket.com/concepts/pusd.md), and Polymarket's Bridge API converts every deposit to pUSD on Polygon (https://docs.polymarket.com/trading/bridge/supported-assets.md, which lists many more source chains than Kickr exposes: Ethereum, Polygon, Arbitrum, Base, Optimism, BNB Smart Chain, Solana, Bitcoin, Tron, HyperEVM, Abstract, Monad, and others). Kickr's `feeBreakdown` / `providerQuoteId` / `route` fields in its deposit schema match that bridge flow (M).
- **Wallet model (H, ToS + bundle):** per-user Privy embedded wallet (an EOA, `eoaAddress`, `privyWalletId`) plus a Polymarket "deposit wallet" address (`depositWalletAddress`; legacy `safeAddress` also present). Users "may authorize a Kickr-controlled additional signer through Privy" that can sign "operations needed to prepare trading and execute instructions ... without a separate wallet prompt for every signature"; the ToS says "We do not claim that Kickr has no signing authority over an authorized wallet." The app also has a `/profile/export-private-key` route. So it is **semi-custodial** (Kickr holds a delegated signing key; funds sit in the user's own on-chain wallet). (H)

---

## 4. Read API

**Official public API: none. NOT FOUND (searched: kickr.fun, app.kickr.fun, www.kickr.fun/robots.txt + sitemap.xml, `docs.kickr.fun` and `api.kickr.fun` (DNS does not resolve), `app.kickr.fun/llms.txt` (returns the SPA HTML, not an llms file), the Terms ("no separate bot or API policy"), Privacy policy, Support page (contact email only), WebSearch x2, `gh search repos/code` for "kickr.fun" and "kickrdotfun").** No developer docs and no OpenAPI. The only Kickr-owned code found is a public GitHub repo `DegenHouseDeFi/kickr` (Expo/React Native + Solana prototype; created 2026-02-24, last push 2026-03-09, no license, 0 stars, README is the Expo template; its share URL is `https://kickr.fun`, and it points at Railway backends `kickr-backend-production` / `kickr-data-service-production`). It is an early predecessor of the same product (same brand and share URL; ownership by C3 Labs not confirmed), contains no API documentation, and is stale for a market whose current backend is `kickr-backend-v3`. (H for the repo facts, M for "same product")

What exists is the **internal API of the web app**, discovered by reading the app's public JavaScript chunks (static assets, read as text, never executed). It is undocumented, versioned ad hoc (`/v1`, `/v2`, `/v3`), and may change without notice.

| Item | Value | Tag |
|---|---|---|
| Web-app same-origin routes | `https://app.kickr.fun/api/football/...`: `home-feed`, `competitions`, `competitions/{key}`, `competitions/{key}/fixtures`, `fixtures/{key}/detail`, `fixtures/{key}/intel/preview`, `fixtures/{key}/live-room` (+ `/commentary`, `/events`, `/momentum`), `fixture-states`, `team-forms`, `prediction-challenges/current`; `api/geo/location`; `api/account/stream` | H (strings in bundle) |
| Backend base URL | `https://api-production-845f.up.railway.app` (Railway default host, hard-coded in the bundle as `backendBaseUrl`; service name `kickr-backend-v3`) | H |
| Backend anonymous GETs seen | `/health`; `/market-data/v2/status`; `/public/parlay-activity?limit=N` (cursor paginated); `/v1/combos/catalog?fixtureKey=...` (called without a token in the bundle, **not probed**) | H (first two + parlay activity probed; catalog from bundle only) |
| Backend authenticated (Bearer, Privy JWT) | `/trades/preview-quote`, `/trades/open-with-quote`, `/trades/close-with-quote`, `/trades/claim`, limit-order routes, `/v1/combos/*`, `/v2/social/*`, `/profile*`, `/v3/auth/*`, deposit/withdraw routes | H (strings only, not called) |
| Quotes | `POST /market-data/v2/quotes` with `{tokenIds}` (POST, **not called**) | H (string) |
| Websocket | `wss://<backend>/market-data/v2/stream` (client sends `{"type":"hello","protocolVersion":2,...}`); `/market-data/v2/status` showed `upstream.state "idle"`, `quotes.tokenCount 5` | H (string + status) |
| Auth | Privy-issued bearer token for anything user-specific; request headers include `x-kickr-app-distribution: web` and `x-kickr-legal-contract: 1`; the client throws `GEO_BLOCKED` (403) before sending if geo access is denied | H (bundle) |
| Rate limits | NOT FOUND (not documented; client has a local 429 back-off keyed by `retryAfterSeconds`) | - |
| Real response shapes confirmed | home feed, parlay activity, market-data status, health (section 13) | H |

Shape notes for the two content endpoints:

- `home-feed` -> `{data:{generatedAt, fixtures:[{fixtureKey "soccer.<league>.espn.<espnId>", editionKey, competition, venueName, kickoffAt, status, volume:{amount,currency:"USDC",window:"lifetime",asOf}, live, homeTeam, awayTeam, moneyline:{status, home/draw/away:{marketKey "polymarket:<id>", outcomeKey "polymarket:<id>:0", clobTokenId, label, price (0-1), freshness, observedAt, staleAfter}}, intel:{headline, status, recommendation, confidence, ...}}]}}`. Whole response was 258 KB for 100 fixtures.
- `public/parlay-activity` -> `{asOf, activity:[{id, type: buy|cashout|won|lost|collected, occurredAt, legs:[{marketId (Polymarket id), conditionId, clobTokenId, outcome YES|NO, title, displayContext{fixtureKey, competitionLabel, marketFamily, line, ...}}], valueUsd, returnMultiplier, legSettlements, trader{username, avatarUrl}, copiedFrom, copyTarget}], page:{nextCursor, hasMore}}`. It exposes third-party traders' usernames; fixtures redact them.

Because every id in these responses is a Polymarket id, **the right read source for prices, books and trades is Polymarket's own public API** (Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com`; covered by the Polymarket spec, not repeated here). I re-confirmed that one Gamma market (`/markets/5340724`) and one CLOB `midpoint` call return the same market and price Kickr shows.

---

## 5. Trade path

- **Official programmatic trading for third parties: none (H).** There is no API key, no builder-style gateway, no SDK. All trades are created through Kickr's authenticated web/mobile app: `preview-quote` (BUY or SELL) -> `open-with-quote` / `close-with-quote`, with `Idempotency-Key` headers and a Privy session bearer token. Execution is then signed **server-side** by the Kickr-controlled additional signer on the user's Privy wallet (ToS section 4) and routed to Polymarket via its relayer (`relayerTransactionHash` / `relayerTransactionId` fields in the bundle). (H for the ToS text and bundle strings; M for the end-to-end flow)
- **Order types seen in the client (H, bundle):** market-style buy/sell by quote, limit orders (place, cancel, replace, cancel all), parlay buy/cashout (Polymarket Combos RFQ), claim, auto-claim preference.
- **How an agent would trade the same markets instead (M):** place orders directly on Polymarket's CLOB (EIP-712 signed orders on Polygon with pUSD) using the market ids Kickr exposes; that is the Polymarket adapter's job. Kickr adds a Kickr/builder fee on top for no benefit to an automated trader.
- **Could an agent drive Kickr itself?** It would have to authenticate with Privy (email OTP, OAuth, or a Solana wallet message signature) and then call undocumented internal endpoints; the ToS bars "scrape or automate access without permission in a way that burdens the Services or violates provider rules". Not recommended; not attempted. (H for ToS; M for feasibility)

---

## 6. PayBox reachability

**paybox_reachable = no (for trading Kickr).** Reasons:

1. No signed-order or transaction-proposal interface exists for a third party; trades are authorised by a Privy session and signed by Kickr's delegated signer (section 5).
2. Sign-in options are email, Google, Apple, X or a Solana wallet message; an EVM PayBox wallet is not listed as a sign-in method. A PayBox Solana wallet could in principle sign a sign-in-with-Solana message, but that is a message-signing step into a semi-custodial app, which I did not test and would not recommend. (M)
3. Funding is possible in principle (PayBox could transfer to a Kickr/Polymarket deposit address on Ethereum, Base, Arbitrum, Polygon, Monad or Solana), but that is only a deposit into someone else's wallet, not trading. (M)
4. The same markets are reachable directly on Polymarket (Polygon, pUSD), which is the sensible route for any wallet-based agent (see the Polymarket spec for what PayBox can sign there).

---

## 7. Fees

| Fee | Detail | Tag |
|---|---|---|
| Kickr's own rate | **NOT FOUND (searched: site, ToS, support, privacy, bundle strings `builderFee/platformFee/feeBps`).** Home page says "No house. No vig. No limits."; the ToS says charges "may include provider trading fees, Kickr or builder fees, network charges, bridge or conversion costs and spreads", Kickr "may change our own charges prospectively", and "We do not adopt another platform's advertised fee schedule as Kickr's schedule." Quotes expose `fee.estimatedUsd` per trade and a `feeBreakdown` per deposit/withdrawal route, so the fee is only visible per quote, behind login | H (ToS section 7) |
| Polymarket platform fee (passes through) | `fee = C x feeRate x p x (1 - p)`, taker only. Sports `feeRate` 0.05, rebate 15% to makers (peak 1.25 USDC per 100 shares at 50c). Gamma for the checked match market: `feeSchedule {exponent 1, rate 0.05, takerOnly true, rebateRate 0.15}` | H (https://docs.polymarket.com/trading/fees.md, Gamma fixture) |
| Polymarket builder fee (the likely Kickr markup) | Flat percent of notional, additive on top of the platform fee: taker 0-100 bps, maker 0-50 bps, set per builder, 1 bp granularity, rate changes once per 7 days with 3 days notice. **Kickr does hold a Polymarket builder code**: builder "Kickr.fun", `verified: true`, code `0xcde66e1edd6888e71c7c5215140145710366ed3c0a0abb23b2c525935d1fe125`, listed in Polymarket's public builder-volume feed. Its configured fee rate: **NOT FOUND (searched: Polymarket docs index, builder-fees page, place-orders page, Kickr ToS/site; no public per-builder rate read identified)**, so assume anywhere from 0 to 100 bps taker | H (https://docs.polymarket.com/programs/builders/fees.md and `https://data-api.polymarket.com/v2/builders/volume`) for mechanism and code; rate unknown |
| Deposits / withdrawals | Bridge and conversion costs apply; Polymarket itself charges no fee to deposit or withdraw pUSD/USDC but intermediaries may (https://docs.polymarket.com/trading/fees.md); MoonPay on-ramp endpoints exist in the Privy SDK | H / M |
| Who pays | Taker pays platform fee; the user pays any Kickr/builder fee on routed orders | H |

Press note: one search result claims a month-long Polymarket football taker-fee discount of 40% through October 2026 and another says sports fees changed in July 2026; not verified against Polymarket docs (the docs page read this session shows sports 0.05). (L)

---

## 8. Resolution mechanism and dispute risk

- **Resolution is Polymarket's (H).** ToS: "Market resolution, settlement and claims follow the underlying provider's rules"; "We do not ... decide an underlying event's result." Polymarket resolves prediction markets with the UMA Optimistic Oracle (proposal, challenge window, dispute) and uses Chainlink TWAP for up/down markets (https://docs.polymarket.com/concepts/resolution.md). The checked football market's Gamma record carries `resolutionSource: https://www.indiansuperleague.com/` and `umaResolutionStatus: null` (not yet proposed).
- **Dispute risk:** UMA dispute and ambiguity risk is inherited from Polymarket; Kickr adds operator risk (a new BVI shell company, 3 months old, holding a delegated signing key on user wallets, with "no house" but also no stated insurance or audit). Parlays have "their own combined conditions" and settle via Polymarket Combos. (H for inheritance; M for the operator-risk judgement)
- **Disputes with Kickr:** BVI law, 30-day good-faith notice, then BVI courts; no arbitration or class waiver (ToS summary). (M, WebFetch summary)

---

## 9. Geo, ToS and automation rules

- **Geo (H):** transaction features are off-limits to residents of the British Virgin Islands, comprehensively sanctioned places, and places restricted by the market provider; ToS also: "Do not misrepresent your identity or location, or use a VPN, proxy or another method to circumvent restrictions." The Kickr restricted-regions page (updated 2026-10-02) lists: Australia, Belarus, Belgium, Brazil, Burundi, Central African Republic, Cuba, Democratic Republic of the Congo, Ethiopia, France, Germany, Iran, Iraq, Ireland, Italy, Japan, Lebanon, Libya, Malta, Myanmar, Netherlands, New Zealand, Nicaragua, North Korea, Poland, Russia, Singapore, Slovakia, Somalia, South Korea, South Sudan, Sudan, Syria, Taiwan, Thailand, United Kingdom, **United States**, US Minor Outlying Islands, Venezuela, Yemen, Zimbabwe, plus Alberta, British Columbia, Ontario and Quebec (Canada) and Crimea, Donetsk and Luhansk (Ukraine). "Signing in and trading on Kickr are unavailable" there; browsing stays open. (H: https://kickr.fun/restricted via WebFetch list; M: WebFetch is a model summary of the page). The client calls `api/geo/location` and carries `policyVersion "polymarket-2026-10-02"`, and the Privacy policy says an eligibility check can disclose the user's IP address to Polymarket, so the gate mirrors Polymarket's geoblock. (H, bundle + Privacy)
- **Age/eligibility (H):** 18+ and age of majority; no sanctioned persons.
- **Automation (H):** ToS section 10 forbids "Scrape or automate access without permission in a way that burdens the Services or violates provider rules." There is no API or bot policy. The few GETs I made were the same calls an anonymous browser makes; I did not hit authenticated or POST routes.
- **Other (H):** a recommendation or AI answer "does not itself authorize or execute a trade on your account"; agreeing to the Terms does not itself grant wallet-signing permission.

---

## 10. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Kickr own volume (self-reported) | "over $230K" all-time, "6,300+ trades" (implies about $37 per trade, my arithmetic) | kickr.fun home page, read 2026-10-19, claim undated | H as a claim, unverified |
| Kickr volume per Polymarket (independent check) | Builder "Kickr.fun": first volume 2026-07-29; **$92,414 total through 2026-10-19** (Aug $25.2K, Sep $44.8K, Oct 1-18 $22.2K; last 30 full days $38.1K; last 7 full days $9.9K; best day $9,051 on 2026-09-26); 1 to 12 `active_users` per day; daily rank mostly 100-170 of about 130-200 builders. The site's $230K is about 2.5x this, unexplained (parlays/RFQ volume, sell-side counting, or marketing rounding are possible, all M) | `GET https://data-api.polymarket.com/v2/builders/volume?limit=90`, 2026-10-19 about 04:30 UTC (90 daily buckets, 2026-07-22 to 2026-10-19; last day partial); fixture `polymarket_builders_volume_kickr_rows_2026-10-19.json` | H |
| Context | All 201 builders together on 2026-10-18: about $31.7M; top three (betmoar, traderline, Sharktool) $5.8M, $4.2M, $2.3M | same feed | H |
| Kickr community | Telegram 65 members | t.me/s/kickrdotfun, 2026-10-19 | M |
| Kickr age | Entity incorporated 2026-07-10 | ToS | H |
| Underlying Polymarket depth (the real liquidity) | Sum of "lifetime" fixture volume for the 100 upcoming fixtures in the feed = about $1.41M (max single fixture about $246K, median about $2.8K); source of the figure inside Kickr's feed (Polymarket-derived, attribution not stated) is M | `app.kickr.fun/api/football/home-feed`, `asOf` 2026-10-19 03:59 UTC | M |
| Example book | Punjab FC vs Man City moneyline "Punjab win" market: Gamma `liquidityNum` 11,452.58, book of 21 bid levels and 24 ask levels, best bid 0.38 / best ask 0.40 | Gamma + CLOB, 2026-10-19 | H |

Conclusion: Kickr itself adds negligible independent liquidity; whatever depth exists is Polymarket's.

---

## 11. Event coverage and arbitrage overlap

- **Categories (H):** football (soccer) only. Feed leagues on 2026-10-19: UEFA Champions League, Europa League and Conference League (18 fixtures each), J1 League (15), Liga MX (11), Serie A, Super Lig, Premier League (3 each), Indian Super League, La Liga, Brasileirao Serie A, CONMEBOL Libertadores (2 each), Eredivisie, Bundesliga, Ligue 1 (1 each). Market families: moneyline (3-way), both-teams-to-score, totals (spreads not seen). NOT FOUND: any politics, crypto, macro or other-sport market.
- **Overlap with other venues:** football match results are also priced by Polymarket (this very liquidity), Kalshi (if it lists soccer), Limitless/Opinion/other crypto venues that list sports, and, outside prediction markets, sports exchanges and sportsbooks (Betfair, Smarkets, Matchbook, Pinnacle-style odds). **That is where arbitrage exists, but the Kickr leg is just the Polymarket leg.** Cross-venue edge should be computed as Polymarket vs the others, tagging Kickr-displayed prices as duplicates of Polymarket's. (M)
- **Matching keys useful to the linker (H):** Kickr's `fixtureKey` format `soccer.<league-slug>.espn.<ESPN event id>` is a clean external id that other venues' football markets can be joined on (ESPN ids), along with Polymarket `conditionId`. This is the one reusable thing here: a ready-made football fixture-to-market map. (M for the reuse judgement; the keys themselves H)

---

## 12. Shared liquidity and adapter value

- **Liquidity shared with:** Polymarket (global CLOB). Not an independent leg. (H)
- **What a Kickr adapter could add, if ever:** (a) the public parlay-activity stream (retail parlay flow, win/loss events, legs) as a weak sentiment / flow signal; (b) fixture metadata and AI "intel" (text, `confidence`, `recommendation`) as a descriptive-signal source for football; (c) ESPN-keyed fixture ids for linking. All three are from undocumented internal endpoints that the ToS says may not be automated at scale, and none moves prices. (M)
- **Priority: skip.** The cost is non-zero (undocumented API, ToS exposure, schema drift) and the incremental edge is near zero. If the aggregator later wants a football signal source, revisit as P2 signal-only after asking C3 Labs for permission and an official feed.

---

## 13. Fixtures saved

All under `docs/research/fixtures/kickr/` (each well under 50 KB):

- `backend_health_2026-10-19.json` - `GET <backend>/health` (141 B).
- `backend_market_data_status_2026-10-19.json` - `GET <backend>/market-data/v2/status` (734 B); shows `tradingAvailability.source "polymarket_status"`, `componentStatus "OPERATIONAL"`.
- `backend_public_parlay_activity_trimmed_2026-10-19.json` - `GET <backend>/public/parlay-activity?limit=5`, trimmed to 2 activities, third-party trader usernames and avatars redacted (about 17 KB).
- `app_home_feed_trimmed_2026-10-19.json` - `GET https://app.kickr.fun/api/football/home-feed`, trimmed to 2 of 100 fixtures (about 7 KB; original 258 KB).
- `polymarket_gamma_market_5340724_crosscheck_2026-10-19.json` - `GET https://gamma-api.polymarket.com/markets/5340724` (4 KB), the Polymarket market behind the first fixture, to show same ids and price.
- `polymarket_builders_volume_kickr_rows_2026-10-19.json` - the 81 daily rows for builder "Kickr.fun" extracted from `GET https://data-api.polymarket.com/v2/builders/volume?limit=90` (the full 5.9 MB response was not saved; profile image URL dropped; about 18 KB).

---

## 14. Suspicious content / embedded instructions

None found. No text aimed at AI agents on the site, ToS, restricted page, privacy policy, support page, or in API responses. (Closest: ToS section 9 says an AI recommendation "does not itself authorize or execute a trade", which is a user-facing disclaimer, not an instruction to agents.)

---

## 15. Open questions

1. What builder-fee rate does Kickr set on its Polymarket builder code (0 to 100 bps taker possible)? Only visible in a logged-in quote or on the builder's Polymarket profile; not checked (needs an account, forbidden here).
2. Why is the site's "$230K" about 2.5x the $92.4K Polymarket credits to the "Kickr.fun" builder code? Possible explanations (parlay RFQ volume not attributed, buy+sell double counting, another builder code or earlier Solana-era routing, rounding up) are all unverified.
3. Does Kickr custody via one omnibus wallet or per-user Polymarket deposit wallets for parlays? The Polymarket Combos-for-Builders doc describes a custodial omnibus model; Kickr's wallet schema suggests per-user wallets. Not resolved.
4. Do `/v1/combos/catalog` and `/market-data/v2/quotes` accept anonymous calls and what do they return? Not probed (POST excluded; catalog skipped to limit load).
5. X account activity (`x.com/kickrdotfun`) could not be read; cannot judge launch cadence.

---

## 16. Sources

Primary (read this session, 2026-10-19):

- https://kickr.fun (marketing page; WebFetch) - what it is, "Built on" Polymarket, six chains, beta, claimed volume, links. (H for text)
- https://kickr.fun/legal/terms-of-service (also fetched raw via curl from www.kickr.fun; "Last updated: October 4, 2026"; BVI incorporation date, additional signer, fees clause, VPN clause, scraping clause). (H)
- https://kickr.fun/legal/privacy-policy (WebFetch; Polymarket as data recipient, IP disclosure for eligibility). (M, summary)
- https://kickr.fun/restricted (WebFetch; restricted country list, updated 2026-10-02). (M, summary)
- https://kickr.fun/support (WebFetch; operator C3 Labs Ltd, legal links, a support email). (H)
- https://www.kickr.fun/robots.txt, https://www.kickr.fun/sitemap.xml (curl; no API or docs pages listed; sitemap = home, support, restricted, account-deletion, four legal pages). (H)
- https://app.kickr.fun (HTML + 45 public JS chunks, read as text only; source of internal route names, `backendBaseUrl`, zod response schemas, chain enum, `policyVersion`). (H for strings, M for interpretation)
- `GET https://app.kickr.fun/api/football/home-feed`; `GET https://api-production-845f.up.railway.app/health`, `/market-data/v2/status`, `/public/parlay-activity?limit=5` (unauthenticated). (H)
- https://t.me/s/kickrdotfun (WebFetch; 65 members). (M)
- Polymarket docs (curl of `.md` pages): https://docs.polymarket.com/llms.txt, /trading/fees.md, /programs/builders/fees.md, /trading/combos/overview.md, /trading/combos/builders.md, /trading/bridge/supported-assets.md, /concepts/resolution.md; and WebFetch of https://builders.polymarket.com/ and /developers/builders/builder-intro. (H)
- `GET https://gamma-api.polymarket.com/markets/5311944` and `/markets/5340724`; `GET https://clob.polymarket.com/book` and `/midpoint` for the same token; `GET https://data-api.polymarket.com/v2/builders/volume?limit=90` (unauthenticated; not in the docs index I read, but it is Polymarket's public data host and a third-party repo's fixture shows the same shape). (H)
- GitHub via `gh api` (read-only, no clone): `DegenHouseDeFi/kickr` metadata, file tree, `README.md`, `package.json`, `src/lib/api.ts`, `src/lib/data-service/config.ts`; `gh search code "kickr.fun"` (hits in third-party repos that list "Kickr.fun" as a Polymarket builder). (H)

Secondary (WebSearch, extended mode, titles only; claims not relied on): coverage of Polymarket Combos launch (casino.org, cryptobriefing.com, coingape.com, startpolymarket.com, si.com) - used only to date the Combos launch to roughly June to August 2026 (L: sources disagree), and a football taker-fee-discount mention (L). No search result mentioned Kickr.

Not found / not done: independent press on Kickr; GitHub repo or org for Kickr; developer docs; fee schedule; rate limits; authenticated endpoints; X account contents.
