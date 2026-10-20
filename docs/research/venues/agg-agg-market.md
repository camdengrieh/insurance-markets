# AGG (agg.market): white-label prediction-market aggregator

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary or inferred, L = weak or stale. Read-only research: no account created, no key, no signing, no POST. Liveness re-confirmed in a second pass the same day (health 200, npm 4.28.0 modified 2026-10-16, unauthenticated `/venue-events` still CloudFront 403).

## Verdict

- Adapter priority: **P2** (signal source only). AGG is a router, not a venue: every price, book, fill and resolution belongs to a venue we already cover or are covering (Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid) plus Novig, ProphetX, BetDEX, PRED, TipRun. It is not an independent arbitrage leg. Its only unique value to us is its cross-venue matching (`matched clusters`, `settlementDiff`, `arbReturn`), and every call needs a partner app id that comes from an admin-dashboard sign-up (not done).
- Live: yes. `GET https://api.agg.market/health` returned HTTP 200 `{"status":"ok",...}` on 2026-10-19 [H, fixture `docs/research/fixtures/agg-agg-market/health.json`]. npm `@agg-build/sdk` latest 4.28.0, registry `modified` 2026-10-16, `created` 2026-04-27, MIT [H, https://registry.npmjs.org/@agg-build/sdk]. Docs changelog has entries through mid-October 2026 [H, https://docs.agg.market/changelog].
- Operator: Snag Solutions, Inc., a Delaware corporation; Terms of Service "Last updated: April 10, 2026" [H, https://build.agg.market/terms-and-conditions]. npm repository field points to `Snag-Solutions/Agg` on GitHub, which returned 404 via `gh api` (private or absent) [H].
- "Currently in alpha" (from the discovery hint): NOT FOUND (searched: `llms.txt`, `llms-full.txt`, introduction, environments, venues overview for "alpha"/"beta"; only ISO "alpha-2" hits). What the docs do say: new apps start in "testing mode" capped at 20 users and 100 trades until a partner agreement is signed [H, https://docs.agg.market/environments].

## Kind and market model

- Kind: aggregator and smart-order-router with managed execution (white-label API plus React/TS SDK). Owns no book, no AMM, no oracle [H, https://docs.agg.market/introduction: "white-label prediction market aggregator ... matches the same market across venues, quotes the best split, executes it"].
- Objects: venue event, venue market, venue market outcome (usually Yes/No). You trade an outcome (`venueMarketOutcomeId`). Market `status`: `unopened | paused | open | closed | resolved`. Each object carries `externalIdentifier` (the venue's own id: Kalshi ticker, Polymarket token id) [H, https://docs.agg.market/concepts/markets].
- Binary is the norm; categorical = several markets per event (M, inferred from event/market model). Settlement is expressed per outcome via `winner`, `payoutPerShare`, `refundAtCost` (split and void handling) [H, https://docs.agg.market/concepts/market-resolution].
- Order book model: each outcome has its own book (no complement derivation); the aggregated book is `[price, totalSize, {venue: size}]` with per-venue books alongside [H, https://docs.agg.market/api/websocket].
- Matching: AGG links equivalent venue listings into "matched clusters" (`matchedVenueEvents/Markets/Outcomes`). Algorithm and precision NOT FOUND (searched: markets, ids, matched-clusters, agg-key, settlement-key-differences pages). `GET /venue-events/{id}` returns a per-venue breakdown of settlement differences; docs say "show it before users trade across venues" [H, concepts/markets]. Treat matches as unverified leads for our own linking layer.
- Tokenisation: underlying venue's. AGG issues no token itself for managed trades [M]. ProphetX on Solana press says AGG creates Solana tokens representing ProphetX positions (2026-09-10 coverage) [L: press only, not re-read this session].

## Venues routed

From https://docs.agg.market/venues/overview [H]:

| Venue | Status | Trades from | Collateral |
|---|---|---|---|
| Polymarket | enabled | managed balance or self-custody | USDC.e wrapped to pUSD, Polygon |
| Kalshi | enabled | user's own Kalshi account via venue API key | USD cash at Kalshi (no chain) |
| Limitless | enabled | managed | USDC, Base |
| Predict.fun (`predict`) | enabled | managed | USDT, BNB Chain |
| Myriad | enabled | managed | USD1, BNB Chain |
| Hyperliquid (HIP-4 outcomes) | enabled | managed or self-custody | USDC, HyperCore |
| PRED | off by default | managed | USDC, Base |
| TipRun | off by default, no limit orders | managed | USDC, Arbitrum |
| Novig | off by default | managed Solana wallet after KYC, or Direct mode | USDC, Solana |
| ProphetX | off by default | managed Solana wallet after KYC, or Direct mode | USDC, Solana |
| BetDEX | off by default | hosted venue account | USDC, Solana |

"Off by default" means disabled for a new app until AGG enables it. TipRun: a HackenProof bug-bounty listing (program window 2026-06-05 to 2026-06-24) describes it as a cricket-only peer-to-peer prediction-market exchange with smart contracts; chain not stated there, AGG docs say Arbitrum USDC [M, https://hackenproof.com/companies/tiprun]. Niche (cricket); not researched further. In AGG docs it appears as a venue label (min 0.01 share, 0.01 tick, GTC/GTD/FOK/IOC, managed custody only [H, llms-full limit-order table]); what it is was not researched here.

## Chains and collateral

- Managed wallet per user: `evmAddress` (receives on every supported EVM chain and on Hyperliquid) and `svmAddress` (Solana) [H, https://docs.agg.market/concepts/accounts-and-wallets]. Buys spend from any chain and AGG bridges to the venue; bridge cost appears as `feeBreakdown.bridgeFees` [H, concepts/fees].
- Chains touched across venues: Polygon, Base, BNB Chain, Arbitrum, Solana, HyperCore (plus Ethereum-style EVM deposits via `supportedChains`; exact list is runtime data, NOT FOUND statically).

## Read API

- Exists: official, documented, **authenticated by app id** (not open). Docs https://docs.agg.market ; OpenAPI https://docs.agg.market/openapi/openapi.json (92 paths, v1.0.0) ; `llms.txt` / `llms-full.txt` index [H].
- Base URLs: REST `https://api.agg.market`; WebSocket `wss://ws.agg.market/ws?appId=YOUR_APP_ID`; admin `https://admin.agg.market`. One environment only: live fills spend real funds; paper trading exists [H, https://docs.agg.market/environments].
- Auth tiers [H, environments]: (1) `x-app-id` header only: markets, market data, news, correlated markets, preview quote, geo policy, leaderboard. (2) `x-app-id` plus `Authorization: Bearer <JWT>`: trading, funding, portfolio. (3) `x-app-api-key` (format `agg_<appId>_<64hex>`): partner-admin, paper-trading admin, webhooks. App id and API keys are created in the admin dashboard (account sign-up; not done).
- Unauthenticated probe: `GET /venue-events?limit=1` without `x-app-id` returned a CloudFront HTML `403 Request blocked` (not a JSON 401) [H, 2026-10-19]. I did not guess or borrow an app id. No live market response shape was confirmable; fixture `openapi-excerpt.json` holds the official schema for `/midpoints`, `/orderbooks/outcomes`, `/app/venue-geo-policy`.
- Key endpoints [H, OpenAPI path list]:
  - Markets: `GET /venue-events`, `/venue-events/{id}`, `/venue-events/{id}/bootstrap`, `/venue-markets`, `/venue-market-outcomes?externalIdentifier=`, `/search`, `/categories`, `/crypto/recurring-markets`, `/sports/live`. List events supports `sortBy=volume|volume24hr|createdAt|endDate|arbReturn`, `matchStatus`, `minVolume`, `aggKey`, `limit<=100`, cursor.
  - Prices/books: `GET /midpoints?venueMarketIds=...&bestPrice=true` (fresh `arbReturn`), `/orderbooks`, `/orderbooks/outcomes` (up to 100), `/orderbook/outcome/{id}`; charts `/charts/bars`, `/charts/history/manifest`; `POST /crypto/reference-prices`.
  - Signals: `/correlated-markets/*`, `/news-feed/*`.
  - Resolution: outcome fields `winner/payoutPerShare/refundAtCost`; `GET /venue-events/{id}` settlement differences; `POST /execution/redeem`.
  - Trades: public trade feed only on WebSocket (`trades` channel); no REST public-trades endpoint seen (M).
- `arbReturn`: decimal fraction (0.012 = 1.2%) "derived from the best prices across the venues in a matched cluster". Listing value is synced by a background job and can lag; `/midpoints?bestPrice=true` computes it fresh. How it treats fees and depth: NOT FOUND [H, https://docs.agg.market/recipes/websocket-arb].
- WebSocket [H, https://docs.agg.market/api/websocket]: orderbook snapshot + deltas with `seq`/`checksum`, trades, arb per-market and `arb-feed` (delta-only, last-value-wins, loss-tolerant), heartbeats, user events. Max 500 orderbook/trade subscriptions per connection. Handshake needs an `Origin` matching the app's allowed origins or closes `4003`.
- Rate limits [H, https://docs.agg.market/concepts/rate-limits]: 18,000 req/min per API key; 1,000 req/min per IP without key. Group caps per key/min: prices (`/midpoints`, `/orderbooks`) 1,200; outcome books 6,000 (1 unit per outcome); discovery 3,000; quotes 1,500; trading 6,000 (120 per IP/user). 429 carries `Retry-After`. A 403 from a high-volume IP may be the network firewall: back off. Limits raisable via support.
- Testing-mode caps (20 users, 100 trades) apply until a partner agreement is signed [H, environments]. Read-only market data is not described as capped; whether a testing-mode app id is available without a business agreement is NOT FOUND.

## Trade path

- Programmatic, documented, automation-friendly: quote `GET /orderbook/{venueMarketOutcomeId}/route` (preview with `x-app-id` only; executable with JWT) -> `POST /execution/fill` -> poll `GET /execution/status`. Also `POST /execution/orders` (direct single-venue order, idempotent via required `externalId`), `POST /execution/limit-orders`, `POST /execution/orders/cancel`, `POST /execution/redeem`, withdraw endpoints [H, OpenAPI; https://docs.agg.market/integration-options].
- Sign-in: `POST /auth/start` returns a nonce; `POST /auth/verify` with SIWE (EVM) or SIWS (Solana) signature, or Google/X/Apple/email/Privy; returns short-lived access + refresh JWT. SIWE domain must match an allowed origin [H, https://docs.agg.market/concepts/authentication, environments]. There is a headless "trading bot / agent" quickstart that signs in with its own wallet key [H, llms.txt entry].
- Custody models [H, introduction, accounts-and-wallets]:
  - Managed (default): AGG holds keys and signs venue orders; user just deposits USDC to `evmAddress`/`svmAddress`. No per-order wallet signature.
  - Self-custody (Polymarket, Hyperliquid only; EVM EOA only, Solana wallets cannot): wallet must be linked via SIWE-style link flow, then signs each step: `eip712`, `hl_l1_action`, `personal_sign`, `safe_tx`, `eip7702_authorization` (raw digest), or sends a `transaction` (approve/bridge) [H, https://docs.agg.market/recipes/self-custody-signing].
  - Kalshi: user supplies their own Kalshi API key, stored by AGG ("venue key"); orders spend Kalshi cash [H, venues/kalshi].
  - Hosted venue account (BetDEX); Direct mode (Novig, ProphetX).

## PayBox reachability: partial

- Managed route (feasible in principle): fund by a plain ERC-20 transfer to the user's managed `evmAddress` on a supported chain (PayBox `request_transfer` style), after a SIWE `personal_sign` login and an app id. No venue-level signing needed afterwards, but this is custodial exposure to AGG (AGG holds the funds and keys) and ToS bars US/UK/FR/Ontario/SG/PL/TH/TW persons and VPN use. Whether PayBox exposes raw `personal_sign` for SIWE: unknown (not tested; no PayBox tools called).
- Self-custody route: needs raw-digest EIP-7702 authorization or EIP-712/personal_sign from an EOA; docs warn that smart-contract wallets fail the 7702 and Hyperliquid `sendAsset` steps. A PayBox smart account likely cannot do this (M); `approveMode: "user_broadcast"` is the documented fallback.
- Blocking gate regardless: a partner app id (admin dashboard sign-up) and, for live trading beyond 100 trades, a signed partner agreement. For a read-only signal adapter the same app id is still needed.

## Fees

- Venue fees pass through: per-market `feeRate`, `feeExponent`, `feeBasis` on `GET /venue-markets` (`null` = unknown, never free) [H, https://docs.agg.market/recipes/venue-fees]. Formulas: Polymarket/Kalshi `fee/notional = feeRate*(p(1-p))^exp / p` (exp 1 collapses to `feeRate*(1-p)`; Polymarket bills buys on pre-fee quantity; Kalshi rounds up to the next cent per order); Predict.fun flat 2% of notional (`exp 0`); Novig 3% in-game only; ProphetX 2% of net winnings at settlement; Hyperliquid exit fee `0.0007*(s+max(s,1))` (14-140 bps) on sell or on the winning $1 payout; Limitless buy 3.00% falling to 0.40% floor, sell peaking 1.50% (piecewise); Myriad tent `peakBPS*min(p,1-p)/0.5`. Makers pay nothing on the listed venues. Dated checks inside the docs: Novig 2026-09-07, ProphetX 2026-09-04, Hyperliquid 2026-09-11 (treat as expiries).
- AGG layer [H, https://docs.agg.market/concepts/fees]: partner "app fee" in bps of routed notional on buys (sells only if a sell rate is set), optional referral fee (all to the referrer), builder fee on Polymarket/Hyperliquid, bridge fees, execution gas, setup costs, withdrawal fee. "No up-front or recurring fees. We only make money when you do, starting at 20% of the fees you charge users." The quote's `feeBreakdown` and `totalCostIncFees` are authoritative. With app fee 0, the AGG take is NOT FOUND (open question).
- Implication for arbitrage: executing via AGG adds bridge/gas/builder fees on top of the venue fee; for edge detection use AGG prices as a signal only and cost the legs directly on venues.

## Resolution mechanism and dispute risk

- AGG does not resolve. Each market settles per its venue (Polymarket UMA, Kalshi, etc.); AGG records `winner/payoutPerShare/refundAtCost`, handles 50/50 splits and voids differently per venue (Polymarket/Limitless/Predict: managed `POST /execution/redeem`; Kalshi/Hyperliquid/BetDEX/TipRun/PRED automatic) [H, concepts/market-resolution, llms-full redeem table].
- ToS: outcome "determined solely by the designated Third-Party Venue"; settlement "final and non-appealable as against us"; venue may later reverse/void; AGG has no liability [H, build.agg.market/terms-and-conditions]. So cross-venue pairs carry resolution divergence risk; `settlementDiff` is the only mitigation AGG offers.

## Geo, ToS, automation

- Platform geo policy: "The United States is blocked on every other venue" than Novig (Novig is US-only); country comes from edge-detected IP; unknown country fails closed (no venue available); VPN exits resolve to the VPN country. Per-venue lists at `GET /app/venue-geo-policy` (x-app-id) [H, https://docs.agg.market/recipes/venue-geo-availability]. Fill to a blocked venue returns 403.
- ToS "Restricted Jurisdictions": sanctioned territories plus "the United States, United Kingdom, France, Ontario, Singapore, Poland, Thailand, or Taiwan"; VPN use to circumvent is prohibited; "robots, crawlers, spiders, or similar automated data gathering" against the Platform prohibited (reads as the consumer site, while the API is documented for bots; the partner agreement is the controlling text and was NOT FOUND); arbitration and class-action waiver [H, build.agg.market/terms-and-conditions, 2026-04-10 version].
- Automation is explicitly supported by the docs (headless bot quickstart, API keys, idempotency keys, webhooks, paper trading) [H].
- Contact: support@agg.market (published for limit increases) [H].

## Liquidity

- NOT FOUND: no AGG volume, TVL, OI or user figure in docs, home page, ToS, or the launch press release (searched: introduction, venues, fees, changelog, agg.market, Decrypt/Chainwire launch release, WebSearch extended 2026-10-19). Home page is navigation only [H, https://agg.market].
- Launch: Snag Solutions launched agg.market 2026-04-28; seed round led by Gradient (amount undisclosed); "zero trading fees" at launch described as a launch-stage policy; release claims multi-LLM market matching with false-positive rate below 0.1% (unverified, sponsored press release) [M, https://decrypt.co/365826/snag-solutions-launches-agg-market-to-aggregate-prediction-markets-and-optimize-trade-pricing-across-venues]. The release lists Opinion among venues, but the current docs venue table does not [M: possible drift, unresolved]. A LinkedIn snippet says Agg acquired Polynode (real-time Polymarket data API) [L, search snippet only].
- Per-event `volume` is exposed in `/venue-events` (rolled up across the matched cluster by default) but needs an app id.
- Depth = underlying venue depth. Ceiling on what an AGG adapter could add is zero independent liquidity.

## Event categories (overlap)

Sports (incl. live scores, Novig/ProphetX/BetDEX sportsbooks), politics/elections, crypto price including recurring 5m/15m/1h/1d window markets (`/crypto/recurring-markets`), macro/news via category tree and news feed [H, OpenAPI path list; category list itself needs app id]. Overlap with other venues is by construction (it mirrors them).

## Shared liquidity

100% shared with Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid, Novig, ProphetX, BetDEX, PRED, TipRun. An "AGG price" is a best-of-venues price: do not count AGG as a separate arbitrage leg. Possibly the only practical single route to ProphetX/Novig/BetDEX Solana liquidity, but those need KYC and are off by default.

## How an adapter would use it (if ever)

1. Obtain an app id (dashboard sign-up, not done) and consume `GET /venue-events?matchStatus=...&sortBy=arbReturn` and `/midpoints?bestPrice=true` as a second-opinion matcher/validator for our own market-linking registry, plus `settlementDiff` as a rules-divergence flag.
2. Never trade through it for arbitrage; cost legs on the native venues.
3. Do not redistribute AGG data (ToS unread for data licensing beyond the quoted automated-access clause).

## Open questions

1. Can an app id for read-only use be obtained without a partner agreement? Is the CloudFront 403 purely a missing-`x-app-id` rule? (Needs dashboard account.)
2. Real response shapes for `/venue-events`, `/venue-markets`, `/midpoints?bestPrice=true` (not observed live).
3. Matching algorithm, precision, and whether `arbReturn` includes fees and depth.
4. Partner agreement text: data use, automation, US persons, custody, liability.
5. PayBox: raw `personal_sign` for SIWE and EIP-7702 raw-digest signing support.
6. AGG platform take when app fee is 0.
7. Volume and user numbers (budget exhausted; retry with search later).
8. What PRED is (not researched here); TipRun is cricket-only per HackenProof listing (see Venues routed).

## Sources

- https://agg.market [H, nav only]
- https://docs.agg.market/llms.txt and https://docs.agg.market/llms-full.txt [H]
- https://docs.agg.market/openapi/openapi.json [H]
- https://docs.agg.market/introduction, /environments, /integration-options [H]
- https://docs.agg.market/venues/overview [H]
- https://docs.agg.market/concepts/markets, /concepts/fees, /concepts/rate-limits, /concepts/authentication, /concepts/accounts-and-wallets, /concepts/market-resolution [H]
- https://docs.agg.market/recipes/venue-fees, /recipes/venue-geo-availability, /recipes/self-custody, /recipes/self-custody-signing, /recipes/websocket-arb [H]
- https://docs.agg.market/api/websocket [H]
- https://docs.agg.market/changelog [H]
- https://build.agg.market/terms-and-conditions (Snag Solutions, Inc. ToS, 2026-04-10) [H]
- https://api.agg.market/health (live probe 2026-10-19) [H]
- https://registry.npmjs.org/@agg-build/sdk [H]
- https://decrypt.co/365826/... (launch press release, 2026-04-28) [M, sponsored]
- https://hackenproof.com/companies/tiprun [M]
- Press on ProphetX x AGG (2026-09-10): nextpredict.io and solanacompass.com, seen in search summaries earlier only [L]

Fixtures: `docs/research/fixtures/agg-agg-market/health.json`, `docs/research/fixtures/agg-agg-market/openapi-excerpt.json` (official spec excerpt, not a live response).
