# AGG (agg.market): white-label prediction-market aggregator

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Everything below was read from AGG's own docs unless stated.

## Verdict

- Live: yes. The docs changelog has entries dated 2026-10-13 to 2026-10-17 (SDK v4.28.x) [H, https://docs.agg.market/changelog] and the docs sitemap lastmod is 2026-10-16 [H]. `GET https://api.agg.market/health` returned `{"status":"ok"...}` on 2026-10-19 [H].
- Kind: aggregator and router, not a venue. It owns no order book, no AMM and no resolution. Every market is a copy of a market on another venue [H, https://docs.agg.market/concepts/markets].
- Adapter priority: **P2**. Signal source for cross-venue matching and `arbReturn`, but not an independent arbitrage leg (all liquidity is shared with venues we already cover), and every call needs a partner app id that can only be created through AGG's admin dashboard (an account sign-up we did not do).
- "Alpha" status: the task hint says the docs mark it "currently in alpha". We found NO such wording in `llms.txt`, `llms-full.txt` or the introduction page (searched for "alpha" and "beta": only ISO 3166-1 alpha-2 matches). Not confirmed. What the docs do say: new apps start in "testing mode" capped at 20 users and 100 trades until a partner agreement is signed [H, https://docs.agg.market/environments]. Press says AGG "launched in April 2026" [M, WebSearch summary of Predictionnews/Nextpredict coverage].

## Market model and tokenisation

- Objects: venue event, venue market, venue market outcome (usually Yes/No). You trade an outcome, identified by `venueMarketOutcomeId`. Market `status`: `unopened | paused | open | closed | resolved` [H, /concepts/markets].
- AGG stores each venue's listing and links equivalents into a "matched cluster" (anchor event plus `matchedVenueEvents[]`, `matchedVenueMarkets[]`, `matchedVenueMarketOutcomes[]`). Cluster ids merge over time, so durable keys are `(venue, externalIdentifier)`, not the anchor id [H, /concepts/ids, /recipes/matched-clusters].
- Binary mostly. Categorical appears as multiple markets per event. Hyperliquid HIP-4 books are split by `deployerVenue`. Scalar/split payouts are expressed via `payoutPerShare` [H, /concepts/market-resolution].
- Matching method (algorithm, accuracy) is NOT FOUND in docs (searched: markets, matched-clusters, ids, agg-key, settlement-key-differences pages). `GET /venue-events/{id}` returns `settlementDiff`, a per-cluster list of resolution-criteria differences between venues [H, /concepts/markets]. Treat matches as unverified until our own linking layer checks them.
- Outcome tokenisation is the underlying venue's (Polymarket token id, Kalshi ticker, etc.), exposed as `externalIdentifier`. AGG itself issues no token for managed trades, except the ProphetX case below [H for externalIdentifier; M for ProphetX].
- ProphetX on Solana (announced 2026-09-10): press says Agg buys positions on ProphetX and creates Solana tokens representing them while contracts still settle on ProphetX; one outlet describes it differently, so the structure is [M/L] [https://nextpredict.io/market-news/industry/prophetx-sports-prediction-markets-solana-agg-market/, https://solanacompass.com/news/prophetx-and-agg-market-bring-cftc-regulated-sports-prediction-markets-to-solana].

## Venues routed (H, https://docs.agg.market/venues/overview)

| Venue | Trading | Collateral | Notes |
|---|---|---|---|
| Polymarket | yes | USDC.e on Polygon, wrapped to pUSD | managed or self-custody |
| Kalshi | yes | USD cash in user's own Kalshi account | needs user's Kalshi API key ("venue key") |
| Limitless | yes | USDC on Base | managed |
| Predict.fun (`predict`) | yes | USDT on BNB Chain | managed |
| Myriad | yes | USD1 on BNB Chain | managed |
| Hyperliquid (HIP-4 outcome markets) | yes | USDC on HyperCore | managed or self-custody |
| PRED | yes, off by default | USDC on Base | not in our research list |
| TipRun | yes, off by default | USDC on Arbitrum | not in our research list |
| Novig | yes, off by default | USDC on Solana | KYC; US-only |
| ProphetX | yes, off by default | USDC on Solana | KYC; sports |
| BetDEX | yes, off by default | USDC on Solana | hosted venue account |

Candidate new venues surfaced here that other workflows may not have covered: Hyperliquid outcome markets (HIP-4), PRED, TipRun, Novig, ProphetX, BetDEX.

## Chains and collateral

Managed deposit addresses: EVM address valid on every supported EVM chain plus Hyperliquid, and a Solana address. Example response lists Polygon (137, USDC) and Base (8453, USDC); `supportedChains` is the source of truth and also includes BNB Chain tokens (18 decimals) [H, /concepts/funding]. Collateral by venue is in the table above. Cross-chain bridging is automatic on managed buys and charged as `bridgeFees` [H, /concepts/quotes].

## Read API

- Official, documented, requires an app id. Docs: https://docs.agg.market/introduction ; index https://docs.agg.market/llms.txt ; OpenAPI 3.0.2, 92 paths, https://docs.agg.market/openapi/openapi.json [H].
- Base URLs: REST `https://api.agg.market`; WebSocket `wss://ws.agg.market/ws?appId=APP_ID`; admin `https://admin.agg.market`. One environment only (no testnet); live fills spend real funds, paper mode exists [H, /environments].
- Header sets [H, /environments]: (1) `x-app-id` only: markets, market data, news, correlated markets, midpoints, preview quote, geo policy, `/app/config`. (2) `x-app-id` + `Authorization: Bearer` user JWT: trading, funding, portfolio. (3) `x-app-api-key` (format `agg_<appId>_<64hex>`): partner-admin, paper-admin, webhooks, per-trade fee overrides, referrals, `skipQuote`.
- Key read endpoints [H, OpenAPI path list]: `GET /venue-events`, `/venue-events/{id}` (cluster, `settlementDiff`, `arbReturn`), `/venue-events/{id}/bootstrap`, `/venue-markets` (adds `feeRate/feeExponent/feeBasis`), `/venue-market-outcomes` (lookup by `externalIdentifier`), `/midpoints?venueMarketIds=...&bestPrice=true` (adds `bestBid/bestAsk` per sibling and a live `arbReturn`), `/orderbooks`, `/orderbooks/outcomes`, `/orderbook/outcome/{outcomeId}`, `/charts/bars`, `/charts/history/manifest`, `/search`, `/sports/live`, `/crypto/recurring-markets`, `/correlated-markets/*` (semantic similarity, shared-signal connections, cascade/"ripple effect"), `GET /app/venue-geo-policy`, `GET /app/config`.
- `arbReturn`: decimal fraction (0.012 = 1.2%) of cross-venue arbitrage on a matched cluster from best prices; the listing value is synced by a background job and can lag, the `/midpoints?bestPrice=true` value is computed fresh and "quality-gated" [H, /recipes/websocket-arb, OpenAPI]. Methodology (fees included? depth?) NOT FOUND; do not treat as executable edge.
- Resolution data: outcome fields `winner`, `payoutPerShare`, `refundAtCost`; webhook `markets.resolved`, socket event `market_resolved` [H, /concepts/market-resolution].
- WebSocket [H, https://docs.agg.market/api/websocket]: needs an `Origin` header matching an allowed origin (else close code 4003); channels `orderbook` (snapshot then deltas with sequence and checksum), `trades` (public), `arb` (per market), `arb-feed` (all markets, batched `arb_feed_batch`, delta-only, last-value-wins, no snapshot), user events (authenticated). 500-subscription limit shared by orderbook and trades. No midpoint channel.
- SDKs: `@agg-build/sdk` (TS), `@agg-build/hooks`, `@agg-build/ui`, `@agg-build/auth` [H]. Not installed or executed.
- Rate limits [H, /concepts/rate-limits]: 18,000 req/min per API key; 1,000 req/min per IP without a key; endpoint groups on top (discovery 600/IP, 300/user, 3,000/key per minute; prices 600/600/1,200; outcome orderbooks 600/1,200/6,000; quotes 600/600/1,500; trading 120/120/6,000). `429` carries `Retry-After`. A `403` can be a firewall block of high-volume IPs.

### Live probe results (unauthenticated, 2026-10-19)

- `GET https://api.agg.market/health` -> 200 JSON (saved: `docs/research/fixtures/agg-agg-market-white-label-prediction-market-aggregator/health.json`) [H].
- `GET /venue-events?limit=1`, `/app/config`, `/app/venue-geo-policy`, `/midpoints` without `x-app-id` -> 403 CloudFront "Request blocked" HTML page [H]. We did not obtain an app id (creating one needs an AGG dashboard account), so NO live market or arb response shape was confirmed. The OpenAPI spec is the only source for shapes. Saved an excerpt (path list, `/midpoints` description and 200 schema) as `openapi-excerpt.json` in the same fixtures directory. Whether the CloudFront 403 is a missing-header rule or a UA/IP rule is unknown.

## Trade path

- Managed (default): user signs in (SIWE/SIWS wallet, Google, X, Apple, email magic link, Privy) -> JWT (access 15 min, refresh 7 days) -> `GET /execution/deposit-addresses` -> fund -> `GET /orderbook/{venueMarketOutcomeId}/route?side=buy&maxSpend=N` returns `quoteId` (valid ~45 s, `refreshAt` ~15 s) -> `POST /execution/fill {quoteId}` (always returns pending) -> poll `GET /execution/status` to a terminal status -> `POST /execution/redeem`, `POST /execution/withdraw`. AGG holds the managed balance and signs venue orders [H, /introduction, /concepts/quotes, /quickstart/agent].
- Also: direct order `POST /execution/orders` (one venue, required `externalId` idempotency key, optional `skipQuote` on predict/hyperliquid/novig/prophetx with an API key), limit orders `POST /execution/limit-orders` (GTC/GTD/FOK/FAK/IOC/ALO subsets), paper mode (`mode=paper`), webhooks [H, /integration-options].
- Headless bot path is documented: a bot signs a SIWE message with its own EVM key, gets a user token and trades from its managed balance. Prerequisites: an app id from the admin dashboard plus one allowed origin [H, /quickstart/agent].
- Self-custody (Polymarket, Hyperliquid, Kalshi only): user links an EVM wallet (`POST /users/me/link-account/start|confirm`, Solana wallets do not qualify), quote and fill carry `signingAddress` (+ optional `fundingAddresses`), then the client polls `pendingSignatures[]` and submits signatures to `POST /execution/fill/{quoteId}/signatures`. Request types: `eip712`, `hl_l1_action`, `personal_sign`, `eip7702_authorization` (raw digest), `safe_tx`, `transaction` (send `{to,value,data}`, return `txHash`). Each request expires and the user "has to stay present"; default sponsored approve mode needs an EIP-7702 raw-digest authorization, otherwise `approveMode: "user_broadcast"` [H, /recipes/self-custody, /recipes/self-custody-signing].
- Kalshi trades only from the user's own Kalshi account via a stored Kalshi API key [H, /venues/overview].

## PayBox reachability: partial

- Managed path is the most compatible: PayBox's EVM wallet can (a) sign the one-off SIWE sign-in message (personal_sign) and (b) send plain USDC to the AGG deposit address with a transfer proposal. After that all order signing is AGG-side, so no per-order PayBox approval would occur (but custody is AGG's, not PayBox's; this removes PayBox's non-custodial guarantee for the funds on AGG). Whether PayBox exposes arbitrary SIWE `personal_sign` was not checked here (not in scope of this venue research).
- Self-custody path would need PayBox to produce `eip712`, `personal_sign` and possibly `eip7702_authorization` raw-digest signatures within the quote's expiry window, repeatedly, without a present user: likely poor fit. M/unverified.
- Solana venues (Novig, ProphetX, BetDEX) are reachable only via AGG's managed Solana wallet plus KYC [H].
- Blocker for any of this: need an AGG app id, and a registered allowed origin, via the admin dashboard (sign-up); testing mode caps 100 trades. We did not sign up.

## Fees

- Quote `feeBreakdown` is authoritative: `venueFees`, `builderFee`, `bridgeFees`, `executionGas`, `totalCost` (excludes app/referral fees), `appFee`, `referralFee`, `totalCostIncFees`; `setupCosts` with `deepEstimate=true` [H, /concepts/fees, /concepts/quotes].
- App fee: set by the integrating partner, in bips of routed notional on buys (sells free unless a sell rate is configured). AGG's own take: "starting at 20% of the fees you charge users", with volume discounts; no up-front fees [H]. An integrator running its own app can set its app fee to 0 via `appFeeBips=0` with an API key [H], but "platform share" on fees is otherwise unspecified (NOT FOUND for the zero-fee case).
- Venue taker fees (maker fees are zero on the listed venues) [H, /recipes/venue-fees]: Polymarket `feeRate*(p(1-p))^exp` (buy gross-up `/p`; exponent usually 1, occasionally 2), Kalshi per-market rounded up to the next cent, predict.fun flat fraction (0.02 today), Novig 3% in-game only, ProphetX 2% of winnings, Hyperliquid exit fee `0.0007*(s+max(s,1))` (14 to 140 bps), Limitless and Myriad curves returned as `null` (read the quote). Docs state Novig/ProphetX values were verified 2026-09-07/09-04 and "treat each date as an expiry date".
- Polymarket and Hyperliquid builder fee is attributed to a builder code, platform default if none set [H, /concepts/fees].

## Resolution and dispute risk

AGG does not resolve anything; each underlying venue resolves by its own mechanism [H, /concepts/market-resolution]. Docs warn "Venues do not always settle the same question the same way, for example on timing or on a cancelled match", hence `settlementDiff` [H]. Voids/splits: Polymarket 50/50 = both outcomes `winner:true`, `payoutPerShare 0.5`; Kalshi cancelled event settles at a fair price; Myriad void = `closed` with refund at last price; ProphetX push = `refundAtCost`. AGG cancels managed resting limit orders when a market closes or resolves. Extra risks specific to a matched-cluster arbitrage: mismatched resolution criteria (the main arb killer), AGG-side custody and outage risk on managed balances, and redeem being an explicit AGG call on EVM venues.

## Geo / ToS / automation

- Platform policy: the United States is blocked on every venue except Novig (US-only allowed). Fail-closed: if country cannot be determined, no venue is available and every fill is rejected; VPN exit country is used. Per-venue lists at `GET /app/venue-geo-policy`; per-user answer is `warnings` on the quote, and fill returns `403` "Venue polymarket is not available in your region (US)" [H, /recipes/venue-geo-availability]. Quote: "That is AGG platform policy, not a copy of each venue's own terms."
- Automation: explicitly supported (headless bot quickstart, "Agent Instructions" in docs, API keys, idempotency keys). Note the docs include an "Agent Instructions" block directing agents to the REST quickstart and to track orders to terminal status; that is ordinary documentation guidance, nothing was acted on.
- Terms of Use: the site footer links Terms and Privacy but `agg.market/terms`, `/terms-of-use`, `/terms-of-service`, `/tos`, `/privacy` all returned 404 and the real URL was not found (WebSearch budget exhausted this session). NOT FOUND (searched: those paths, agg.market home page footer). Partner agreement (signed in dashboard "Go Live") content NOT FOUND.
- Support contact published: support@agg.market (for limit increases) [H].

## Liquidity

- NOT FOUND: no AGG volume, TVL or open-interest figure in the docs or home page (searched: docs introduction, venues, fees, changelog; agg.market home page is navigation only). Depth is the underlying venues' depth. ProphetX press says Solana users get "100%" of its catalog from day 1 (mainly NFL/NBA) [M, 2026-09-10 coverage].

## Event categories overlapping other venues

Sports, politics/elections, crypto price (including recurring price-window markets via `/crypto/recurring-markets`), live sports scores (`/sports/live`), plus news feed and correlated-market endpoints [H, OpenAPI path list]. Overlap is by construction: AGG mirrors Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid, Novig, ProphetX, BetDEX, PRED, TipRun.

## Shared liquidity (not an independent leg)

100% shared. AGG routes into Polymarket, Kalshi, Limitless, Predict.fun, Myriad, Hyperliquid and others; an "AGG price" is a best-of-venues price. Do not count AGG as a separate arbitrage leg against those venues. It is relevant as (1) a cross-venue market-matching and `settlementDiff` reference to validate our own linking layer, (2) a free signal (`arbReturn`, correlated-markets) once an app id exists, (3) possibly the only practical route to ProphetX/Novig/BetDEX liquidity (Solana, KYC).

## Open questions

1. Can an app id be obtained without a business agreement, and is CloudFront 403 on unauthenticated discovery calls a missing-`x-app-id` rule only? (Needs a dashboard account: not done.)
2. Real response shapes for `/venue-events`, `/midpoints?bestPrice=true` and `arbReturn` (not confirmed live).
3. Matching algorithm and precision; how `arbReturn` accounts for fees and depth.
4. Terms of Use and partner agreement text (automation, US persons, custody, liability).
5. Does PayBox offer raw `personal_sign` for SIWE and EIP-7702 raw-digest signing?
6. Exact platform fee share when a partner sets app fee to 0.
7. The "alpha" label from the discovery hint is unconfirmed.

## Sources

- https://docs.agg.market/introduction [H]
- https://docs.agg.market/llms.txt and https://docs.agg.market/llms-full.txt (full docs dump, incl. changelog entries 2026-10-13..17) [H]
- https://docs.agg.market/openapi/openapi.json [H]
- https://docs.agg.market/environments (base URLs, headers, testing mode) [H]
- https://docs.agg.market/venues/overview [H]
- https://docs.agg.market/concepts/markets, /concepts/ids, /concepts/quotes, /concepts/fees, /concepts/market-resolution, /concepts/rate-limits, /concepts/funding [H]
- https://docs.agg.market/recipes/venue-fees, /recipes/self-custody, /recipes/self-custody-signing, /recipes/venue-geo-availability, /recipes/websocket-arb, /recipes/matched-clusters, /integration-options, /quickstart/agent [H]
- https://docs.agg.market/api/websocket [H, partly read]
- https://api.agg.market/health (live probe) [H]
- https://agg.market (home page, navigation only) [H]
- https://nextpredict.io/market-news/industry/prophetx-sports-prediction-markets-solana-agg-market/ [M, search result summary only]
- https://solanacompass.com/news/prophetx-and-agg-market-bring-cftc-regulated-sports-prediction-markets-to-solana [M, search result only]
- https://predictionnews.com/story/prophetx-partners-with-agg-market-to-bring-cftc-regulated-sports-prediction-mark [M, search result only]

Fixtures: `docs/research/fixtures/agg-agg-market-white-label-prediction-market-aggregator/health.json`, `.../openapi-excerpt.json`.
