# Agg Market (agg.market) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Read-only research: only unauthenticated GETs were made. No sign-in, no keys, nothing signed or paid.

## Verdict

- Adapter priority: **P2 (signal-only)**. [H/M mix, reasoning below]
- Agg is a meta-aggregator and router: it holds NO independent liquidity. Every fill is routed to Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid etc. So it is never an independent arbitrage leg. [H: docs.agg.market venues/overview]
- Its real value to this project is as a pre-built, cross-venue market-matching and arb-signal feed: `matchedVenueMarkets`, `matchedVenueMarketOutcomes`, `arbReturn`, and a per-venue merged orderbook. Useful as a cross-check against our own matcher (docs/market-linking-design.md), not as a venue.
- Caveats that cap the priority: the consumer ToS bans scraping and commercial use, the official data API needs an app id from a dashboard that sits behind sign-in, and live trading is custodial.

## Is it live? (H)

- Yes. agg.market serves (title "Agg Market", tagline "One click. Best price. Every time.") [H: https://agg.market/].
- `GET https://api.agg.market/app/config` returned `tradingMode: "live"` on 2026-10-19 [H: fixtures/agg-market/app-config.json].
- Launched 2026-04-28 by Snag Solutions (sponsored Chainwire release, so claims are company claims) [H for the date and claims as stated: https://decrypt.co/365826/snag-solutions-launches-agg-market-to-aggregate-prediction-markets-and-optimize-trade-pricing-across-venues]. Seed round led by Gradient, amount undisclosed.
- Live event data is current (events `updatedAt` 2026-10-19T07:10Z in the sample) [H: fixtures/agg-market/venue-events-matched.sample.json].

## Kind and market model

- Kind: aggregator / smart order router / white-label B2B API (`docs.agg.market` says "white-label prediction market aggregator"; users trade several venues "through one API"; AGG "matches the same market across venues, finds the best execution split, and tracks each order") [H: https://docs.agg.market/ , introduction].
- Marketing claims it runs "its own aggregated central limit order book with smart order routing and order splitting" [H as claim, press release]. In practice that is an aggregated view of venue books with per-venue attribution per level, not a separate matching engine [H: docs/recipes/websocket-orderbook says each level has `venues` breakdown; fills go to the real venues].
- Market model: events -> markets -> outcomes. Binary Yes/No outcomes dominate; categorical events are an event with many binary markets (e.g. 43 candidate markets under "Republican Presidential Nominee 2028", `structureType: "candidate"`) [H: fixture]. Scalar/split payouts exist via `payoutPerShare` (0..1) and `refundAtCost` [H: concepts/market-resolution].
- Tokenisation: AGG's own opaque ids. `venueMarketId` and `venueMarketOutcomeId` (cuid-like strings) plus the venue's `externalIdentifier` (e.g. a 77-digit Polymarket CTF token id) [H: fixture]. Outcome ids, not market ids, key books, charts and the websocket [H: api/market-data].
- Price scale 0..1 per share; positions are the underlying venue's tokens or accounts (AGG does not mint its own outcome tokens) [M: inferred from custody/settlement docs].

## Venues routed (H: https://docs.agg.market/venues/overview, https://api.agg.market/app/config)

| Venue | Trades from | Collateral | Notes |
| - | - | - | - |
| Polymarket | managed balance or self-custody | USDC.e on Polygon (wrapped to pUSD) | |
| Kalshi | user's own Kalshi account + their Kalshi API key | USD cash at Kalshi | AGG blocks US users on every venue except Novig |
| Limitless | managed | USDC on Base | |
| Predict.fun | managed | USDT on BNB Chain | |
| Myriad | managed | USD1 on BNB Chain | |
| Hyperliquid (HIP-4 outcomes) | managed or self-custody | USDC on HyperCore | |
| PRED | managed, off by default | USDC on Base | |
| TipRun | managed, off by default | USDC on Arbitrum | |
| Novig, ProphetX | KYC'd managed Solana wallet or direct account, off by default | USDC on Solana | US-only sportsbooks-style |
| BetDEX | hosted account, off by default | USDC on Solana | |

- `GET /app/config` on 2026-10-19 lists `disabledVenues: ["opinion","tiprun","probable","novig","betdex"]` for the public `agg-platform` app [H: fixture]. So Opinion is advertised in the launch PR but disabled now; Probable is advertised on build.agg.market but disabled [H/M]. build.agg.market lists Kalshi, Polymarket, Limitless, Predict.Fun, Myriad, Probable [H: https://build.agg.market/, via fetch summary].
- Effective live set for the consumer app (inferred from the above minus disabled): Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid, PRED, ProphetX [M].

## Chains and collateral

- Managed accounts: one EVM deposit address (works on every supported EVM chain and Hyperliquid) plus one Solana address. Docs example shows supported chains Polygon (137) and Base (8453) with USDC; BNB Chain tokens are 18-decimal; "treat `supportedChains` as the source of truth, it can change" [H: https://docs.agg.market/concepts/funding]. The live list requires a signed-in user and was NOT fetched.
- Withdrawal tokens: USDC, USDC.e, USDT, to any address on a supported destination chain; fees come out of the amount; minimum one whole token [H: concepts/funding].
- AGG bridges collateral to whichever venue a leg routes to (bridge fee and gas appear in the quote) [H: concepts/fees].

## Read API

- Exists: **official, public, but gated by an `x-app-id` header** (market data needs only `x-app-id`; user token optional) [H: https://docs.agg.market/environments, api/market-data].
- Docs: https://docs.agg.market (index https://docs.agg.market/llms.txt; each page also served as `.md`). OpenAPI: https://docs.agg.market/openapi/openapi.json (listed in llms.txt; not downloaded).
- Base URLs [H: environments]: REST `https://api.agg.market`; WebSocket `wss://ws.agg.market/ws?appId=YOUR_APP_ID`; admin `https://admin.agg.market`. One environment only (live); paper mode is a flag.
- SDKs: `@agg-build/sdk` (TS client), `@agg-build/hooks`, `@agg-build/ui`, `@agg-build/auth` [H].
- Key endpoints [H: docs pages above]:
  - `GET /venue-events` (filters `status`, `matchStatus=matched|verified`, `limit`, cursor; returns `{data,nextCursor,hasMore}`), `GET /venue-events/{id}`, `GET /venue-events/{id}/bootstrap`
  - `GET /venue-markets` (adds per-market `feeRate`, `feeExponent`, `feeBasis`), `GET /venue-market-outcomes`, `GET /search`
  - `GET /midpoints?venueMarketIds=...&bestPrice=true` (max 75 ids per call by SDK; adds `bestBid`, `bestAsk`, `arbReturn`, and `matched[]` siblings)
  - `GET /orderbooks` (market ids), `GET /orderbooks/outcomes` (up to 100 outcome ids), `GET /orderbook/outcome/{outcomeId}` (aggregated book with per-venue attribution)
  - `GET /charts/history/manifest`, `GET /charts/bars` (resolutions 1, 5, 60, 1D)
  - `GET /orderbook/{venueMarketOutcomeId}/route` (smart-route quote; fees; geo `warnings`), `GET /app/venue-geo-policy`, `GET /app/config`, `GET /leaderboard`
  - Resolution: outcome fields `winner`, `payoutPerShare`, `refundAtCost` on events/markets/outcomes; market `status` open/closed/resolved
- WebSocket [H: https://docs.agg.market/recipes/websocket-orderbook, recipes/websocket-arb, api/websocket (indexed, not read in full)]: orderbook snapshot then deltas keyed by outcome id (with `seq`, CRC32-XOR `checksum`), trades, arb streams (`subscribeArb` per market and `arb-feed` coalesced, delta-only, no snapshot), heartbeats, user events. There is no midpoint socket.
- Auth and limits [H: environments, concepts/rate-limits]:
  - Set 1 (`x-app-id` only): markets, market data, news, smart-route quote, geo policy, leaderboard.
  - Set 2 (`x-app-id` + `Authorization: Bearer` user token): funding, trading, portfolio.
  - Set 3 (`x-app-api-key`, secret, `agg_<appId>_<64hex>`): partner admin, paper admin, webhooks, fee overrides, `skipQuote`.
  - Limits: 1,000 req/min per IP without a key; 18,000 req/min per key. Endpoint caps per minute per IP: event bootstrap 120, search 120, discovery lists 600, prices (`/midpoints`, `/orderbooks`) 600, outcome books 600, quotes 600, trading 120. A 429 carries `Retry-After`. A 403 from a high-volume source can be a firewall block; tell AGG before launching from one server IP.
  - New apps start in testing mode: 20 users and 100 trades until the partner agreement is signed ("Go Live").
  - Where to get an app id: admin dashboard (sign-in required; NOT done). The consumer site itself uses the public id `agg-platform` (visible in its page HTML [H]); the unauthenticated fixtures below were fetched with that id. Using the consumer app's id for a production feed is not what the docs intend; a real adapter should register its own app. [M on appropriateness]
- Not found: a public status page; webhook-less historical trade tape (NOT FOUND: searched llms.txt index titles for trades/history other than charts and webhooks).

### Confirmed response shapes (unauthenticated GET with `x-app-id: agg-platform`, 2026-10-19)

Fixtures in `docs/research/fixtures/agg-market/`:
- `venue-events-matched.sample.json` - `GET /venue-events?status=open&matchStatus=matched&matchStatus=verified&limit=2` (HTTP 200, ~32 KB untrimmed). Event fields: `id, externalIdentifier, title, venue, volume, status, startDate, endDate, categories[], slug, venues[] (e.g. kalshi/limitless/polymarket/predict), venueCount, aggKey, structureType, arbReturn, matchedVenueEvents, venueMarkets[]`. Each market has `venueMarketOutcomes[]` with `matchedVenueMarketOutcomes[{venueMarketId, venueMarketOutcomeId}]` giving outcome-level cross-venue links, and `matchedVenueMarkets[]` with `arbReturn` (0.004 on the Limitless sibling in the sample).
- `midpoints-bestprice.sample.json` - `GET /midpoints?bestPrice=true`. Per market: `midpoint, spread, outcomes[{bestBid,bestAsk,midpoint,bookQuality,markSource}], matched[{venue, venueMarketId, bestBid, bestAsk, bestYesAsk, midpoint, outcomes[]}], arbReturn, marketStatus`. Real example 2026-10-19: Vance 2028 GOP nominee Yes: Polymarket 0.457/0.460, Kalshi 0.42/0.43, Limitless 0.44/0.47, Predict 0.465/0.467; reported `arbReturn` 0.01 (1%).
- `orderbook-outcome.sample.json` - `GET /orderbook/outcome/{outcomeId}` (keys: `checksum, depthSummary, markSource, midpoint, orderbook, seq, spread, tick, timestamp, venue, venueMarketId, venueMarketOutcomeId`; arrays truncated to 3 levels).
- `venue-geo-policy.json` - blocked-country lists per venue. `app-config.json` - disabled venues and auth options.
- Caveat: sample shows the `/midpoints` call returned prices for matched sibling markets that differ by up to 4.5c on the same Yes outcome (Kalshi 0.43 ask vs Polymarket 0.457 bid); that is a cross-venue spread, not a proven executable arb (fees, collateral and rules differences apply, see below). `arbReturn` methodology is NOT documented beyond "derived from the best prices across the venues in a matched cluster" [H: recipes/websocket-arb].

## Trade path

- Programmatic trading exists via REST (and SDK) [H: https://docs.agg.market/quickstart/agent]:
  1. Sign in with SIWE (`POST /auth/start` -> nonce, sign message, `POST /auth/verify`) or SIWS/OAuth/email/Privy. A headless bot signs once with its own key; needs an app id and one allowed origin set in the admin dashboard.
  2. Find outcome id; fund; `GET /orderbook/{outcomeId}/route` returns a `quoteId`; `POST /execution/fill`; poll `GET /execution/status` to a terminal status; `POST /execution/redeem`; `POST /execution/withdraw`. Also direct single-venue market orders (`POST /execution/orders`, requires `externalId` for idempotency), resting limit orders (`POST /execution/limit-orders`), cancels, `skipQuote` (needs read_write API key) [H: venues/overview, recipes index].
- Custody models [H: docs index, recipes/self-custody]:
  - Managed: AGG creates a managed wallet; user deposits USDC to it; AGG signs venue orders. This is custodial.
  - Self-custody (user wallet signs; AGG never holds the key): only Hyperliquid, Polymarket and Kalshi (Kalshi uses the user's own API key). Every other venue returns `quote_self_custody_unsupported_venue`. Needs an EVM wallet linked to the account; Solana wallets do not qualify. Signature request types: `eip712`, `hl_l1_action`, `personal_sign`, `safe_tx`. Requests expire, the user "has to stay present".
  - Hosted venue accounts (BetDEX) and direct accounts (Novig, ProphetX).
- Paper trading exists (simulated fills against live data) [H: recipes/paper-trading, quickstart/agent]; useful for test, still requires sign-in and an app.
- Idempotency: retry-safe calls and error codes in concepts/errors (not read in full).

## Reachable through PayBox?  **partial**

- Sign-in is a SIWE `personal_sign` over an EVM address; PayBox `request_wallet_sign` could in principle sign that message (not tested, signing out of scope) [M].
- Managed route: PayBox could `request_transfer` USDC to the user's AGG deposit address (EVM address works across supported EVM chains), then trade by REST. But AGG signs venue orders with its own managed wallet, and it is custodial with a platform-level withdrawal path; the ToS also says balances are "indicative" and not a debt owed (see below). That is an extra custody and counterparty risk versus trading each venue directly [M/H].
- Self-custody route: Polymarket (Polygon) and Hyperliquid via EIP-712 typed-data signatures. PayBox must be able to produce `signTypedData` for arbitrary payloads inside a time window; that overlaps with the direct Polymarket adapter, which is a lower-risk path [M].
- Net: anything tradable through AGG is tradable directly on the underlying venue with fewer hops. The AGG trade path adds fees/bridging and a custody layer. Recommend not building a trade adapter on AGG.

## Fees (H: https://docs.agg.market/concepts/fees, recipes/venue-fees)

- Quote is authoritative: `feeBreakdown` and `totalCostIncFees`; after fill, `fees.quoted` and `fees.actual`.
- Components: venue taker fee (per market; makers pay nothing on all listed venues), venue settlement fee (e.g. Hyperliquid, ProphetX), builder fee (Polymarket/Hyperliquid builder codes), app fee in bips of routed notional (set by the integrating partner; buys; sells only if a sell rate is set), referral fee (bips), bridge fee, execution gas, one-time setup costs, withdrawal fee.
- AGG's own take: "starting at 20% of the fees you charge users, with volume-based discounts" (paid by the partner, from partner-set app fees) [H]. The launch release said "zero trading fees" for the consumer app [H as claim]; the consumer app's Polymarket builder code still shows nonzero volume (see liquidity), so a builder/venue fee path exists [M].
- Venue formulas (per `GET /venue-markets` `feeRate`, `feeExponent`, `feeBasis`): Polymarket fee per share = `feeRate*(p*(1-p))^feeExponent`, buy fee/notional = `feeRate*(p*(1-p))^e / p` (collapses to `feeRate*(1-p)` at e=1); predict.fun flat fraction (0.02 today); Kalshi fee rounded up to next cent per order; Novig 3% in-game only; ProphetX 2% of winnings; Hyperliquid exit fee `0.0007*(s+max(s,1))` (14 bps to 140 bps), charged on exit/settlement; Limitless and Myriad return `null` (piecewise or tent curves; use quote). `null` never means free [H].
- Feed value for us: AGG exposes fee schedules per market, which our fee-aware arb math can use as a cross-check.

## Resolution and dispute risk (H: https://docs.agg.market/concepts/market-resolution)

- AGG does not resolve markets. Each market settles by the underlying venue's own oracle/rules (Polymarket UMA-style, Kalshi, etc.); AGG mirrors `winner`, `payoutPerShare`, `refundAtCost` and exposes redeem (`eligible` / `pending` / `redeemed` / `ineligible`). Per-venue behaviour for 50/50 splits and voids differs (e.g. Kalshi settles cancelled events at a fair price; Myriad voids refund last market price; Predict 50/50 pays $0.50).
- Arb risk: matched markets on different venues can settle differently (different resolution sources, timing, void rules). AGG documents "Settlement Key Differences" (recipes/settlement-key-differences, not read in full) to surface that. The matching is LLM-based ("embedding similarity followed by reasoning", "<0.1% false positives" per the company, unverified [H as claim]). Treat `matchStatus=matched` as a hint, `verified` as stronger, and confirm resolution wording before trading a pair [M].

## Geo / ToS / automation

- Geo [H: fixtures/venue-geo-policy.json, docs venue-geo-availability]: AGG blocks the US on every venue except Novig (US-only). Blocked countries per venue vary (Polymarket list includes US, UK, FR, DE, BR, SG, TH, TW, PL, etc.). Country is edge-detected; unknown country fails closed; VPN exit country counts. A blocked fill returns 403 at fill time; quotes still return with `warnings`.
- ToS (consumer site, https://build.agg.market/terms-and-conditions, "Last updated April 10, 2026") [H]:
  - Bars "robots, crawlers, spiders, or similar automated data gathering" and harvesting; bars reverse engineering of the Aggregator Software; license is "personal, limited, revocable, non-exclusive".
  - Commercial use "by any commercial entity, or otherwise for any commercial purposes" is "expressly prohibited" (intended personal use), while also contemplating entity users. The terms do not clearly say whether API/SDK use is allowed; a partner route exists (partners@agg.market).
  - Restricted Persons named: US, UK, France, Ontario, Singapore, Poland, Thailand, Belgium, Taiwan; VPN/proxy circumvention prohibited.
  - Custody: Snag Solutions "does not take possession or custody of your cryptoassets", trades are "held directly with the applicable Third-Party Venue(s)", balances are "an indicative representation of third-party data and not a debt owed to you"; liability capped at $1,000. (Note the tension with managed-wallet deposits; I could not reconcile this from the text.) 
  - Implication: a bot scraping the public consumer feed commercially is likely outside ToS. Use the partner/developer route (own app id and partner agreement) before relying on it.
- The consumer-app id `agg-platform` was used only for a handful of one-off read GETs to confirm shapes.

## Liquidity (independent? NO)

- Own volume is tiny: Polymarket builder leaderboard row for builder `agg.market`: MONTH rank 164, volume $8,781.87, 22 active users, verified true; the discovery workflow saw rank 161 / $8.8k earlier [H: https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50&offset=150, 2026-10-19]. That is only the Polymarket-attributed slice of AGG flow; other venues' attribution is not visible [M].
- Per-event volumes shown by the API are the underlying venues' volumes (e.g. "Republican Presidential Nominee 2028" volume 713,470,157 USD, 4 venues, mostly Polymarket) [H: fixture]. Do not read those as AGG liquidity.
- No AGG TVL / OI figures exist (it holds pass-through balances). NOT FOUND (searched: agg.market, docs.agg.market, build.agg.market, web search extended).
- Shares liquidity with: Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid (+ PRED, ProphetX, others when enabled). Not an independent arbitrage leg.

## Event coverage / overlap

- Because it aggregates venues, categories are the union: politics (Polymarket/Kalshi/Limitless/Predict overlap in the sample), sports (including sports betting venues Novig/ProphetX, off by default), crypto price (including `GET /crypto/recurring-markets`, Hyperliquid HIP-4 outcomes), macro, entertainment [H: endpoint names and categories in fixture; docs index].
- Clusters seen in the sample: 4-5 venues per event for the top politics events (Polymarket + Kalshi + Limitless + Predict.fun, Myriad on the Brazil election) [H: fixture]. The matched-cluster data is therefore directly the "where does arbitrage exist" map.

## Suggested use in this project

- Do NOT build a trade adapter on AGG (duplicates Polymarket/Kalshi/Limitless/Predict/Myriad/Hyperliquid adapters, adds custody and fees, ToS risk).
- DO consider an optional read-only "signal" adapter: pull matched clusters + `arbReturn` + per-venue bests from `/venue-events?matchStatus=...` and `/midpoints?bestPrice=true` as a second opinion on our own cross-venue matching, once an own app id / partner terms are in place. Rate: poll within 600 req/min/IP limits; use WS arb-feed for live changes.
- Match IDs: store `venueMarketOutcomeId` (outcome-level) and the venue's `externalIdentifier` to map back to our native venue adapters; keep `aggKey` as the cross-venue grouping key.

## Suspicious / embedded-instruction content

- Every docs page (`*.md`) opens with an "Agent Instructions" blockquote telling AI agents to start with the REST quickstart and "track every trade until terminal" before retrying. It is documentation navigation boilerplate, not a request to act; not followed beyond reading the linked docs. [H: https://docs.agg.market/llms.txt]
- build.agg.market developer-docs links reportedly point to a staging domain [M: fetch summary].

## Not found

- OpenAPI schema contents (URL known, not downloaded); `/api/websocket` page not read in full; `concepts/errors`, `recipes/settlement-key-differences`, `recipes/venue-geo-availability` partner trusted-proxy details not read fully.
- Live `supportedChains` for deposits (needs sign-in).
- AGG-wide volume, user count, or revenue (no public stat).
- A public status page, SLA, or published `arbReturn` formula.
- Any smart contracts owned by AGG (managed model; no AGG-owned contract found; searched docs index and site). GitHub org not searched.

## Sources

- https://agg.market/ (H, 2026-10-19)
- https://docs.agg.market/llms.txt and pages: introduction, environments, concepts/fees, concepts/funding, concepts/rate-limits, concepts/authentication, concepts/market-resolution, venues/overview, recipes/venue-fees, recipes/venue-geo-availability, recipes/self-custody, recipes/self-custody-signing, recipes/builder-codes, recipes/websocket-orderbook, recipes/websocket-arb, recipes/comparing-venue-prices, api/market-data, quickstart/agent (all H, 2026-10-19)
- https://api.agg.market/app/config, /venue-events, /midpoints, /orderbook/outcome/{id}, /app/venue-geo-policy (H, unauthenticated GET, 2026-10-19)
- https://build.agg.market/ and https://build.agg.market/terms-and-conditions (H via fetch summarizer, terms last updated 2026-04-10)
- https://decrypt.co/365826/snag-solutions-launches-agg-market-to-aggregate-prediction-markets-and-optimize-trade-pricing-across-venues (H as to what it says; sponsored, claims unverified)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, 2026-10-19)
