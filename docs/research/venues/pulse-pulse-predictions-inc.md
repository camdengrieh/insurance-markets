# Pulse (Pulse Predictions, Inc.) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. Pulse is a consumer front-end (iOS app) that routes trades to a third-party venue, currently Polymarket. It has no public API, no market data of its own, no liquidity of its own, and its terms forbid bots/data-mining without authorisation and exclude US persons. Anything useful about Pulse's markets is available directly from Polymarket (covered by another workflow).
- Possible value: social/"multiplayer" flow data is not exposed; nothing to use as a signal source.

## Live status (H)

- Marketing site pulsepredictions.com (redirects to www, hosted on Vercel) is live on 2026-10-19; tagline "first multiplayer prediction market app"; iOS early access, Android waitlist. Investor logos shown: Revolut, LayerZero, Stripe, Privy, DFlow, Circle. (H, https://www.pulsepredictions.com/)
- App Store listing "Pulse: Prediction Markets", seller Pulse Predictions, Inc.; v1.0 on Jul 1 (2026 per the hint), latest listed 1.14 Hotfix (Sep 1); 5.0 from 2 ratings (i.e. essentially no user base evidence); 18+; iOS 17+. (H, https://apps.apple.com/us/app/pulse-prediction-markets/id6775640343)
- Production backend answers: GET https://api.pulsepredictions.com/health returned `{"ok":true,"env":"production",...}` on 2026-10-19. (H)

## Kind and market model

- Kind: consumer aggregator/discovery front-end plus non-custodial wallet; "prediction-media, research, and analytics platform". Does not create or operate markets, no role in resolution. (H, https://www.pulsepredictions.com/terms-of-service)
- Market model, tokenisation, order book vs AMM: inherited from the underlying venue (Polymarket binary/categorical CLOB with ERC-1155 outcome tokens, per the other workflow). NOT FOUND for Pulse itself.
- Discrepancy: App Store description mentions "taking positions with points" (H, App Store); the Terms say real money only, USDC in a wallet, and do not mention points (H). Unclear whether the app has a points/paper mode. Treat as unresolved.

## Chains and collateral

- Each account gets a non-custodial **EVM wallet provisioned through Privy**; users fund by sending USDC from an external wallet; withdrawals on-chain; keys exportable. No fiat on-ramp in the Terms (H, terms page). However the API index lists Stripe crypto-onramp and MoonPay webhooks/sessions (H, fixture api-root-index.json), so on-ramp may exist in the app despite the Terms text - conflict, unresolved.
- Chain not named in Terms. Since the named venue is Polymarket, Polygon USDC is implied (M). NOT FOUND (searched: terms page, home page, API index).

## Read API

- Official public API: **none**. No docs site (docs./developers. subdomains 404, /docs /api /developers 404 on www). (H, probed 2026-10-19)
- Private app backend at https://api.pulsepredictions.com (Express, CORS `*`). Root `GET /` returns a self-describing endpoint index (saved as fixture). Everything except `/`, `/health` returns 401 `WALLET_FINALIZER_AUTH_REQUIRED` "Missing Authorization bearer token" (H, tested /api/v1/wallet/context, /openapi.json, /markets, /events).
- Index lists (not tested, auth-gated): `GET /api/v1/feeds/for-you`, `/feeds/trending`, `/feeds/categories/:id`, `/feeds/search`, `/screens/home`, `/screens/search`, `POST /api/v1/search`, `POST /api/v1/categories`, WS `/api/v1/live`, auth via `POST /api/v1/auth/exchange` and `/auth/refresh` (token exchange, presumably from a Privy session - M). Endpoints are app-screen oriented (feed/screens), not a market-data API.
- Using this would mean reverse-engineering an undocumented private API with a user session, and Terms prohibit bots/crawlers/data-mining without authorisation. Not recommended. No rate limits documented.

## Trade path

- Order flow in the private API is a multi-step "start / provider-auth / commit" pattern: `POST /api/v1/orders/start`, `/orders/:executionId/provider-auth`, `/orders/:executionId/commit`, cancel equivalents, `wallet/execute/start|commit`, `provider-auth/:provider/ensure|bind` (H, index). Suggests Pulse builds an unsigned payload server-side, the client (Privy wallet) signs, then commits, with a separate provider (e.g. Polymarket) credential bind. Details NOT FOUND; not public, not documented.
- Programmatic access for third parties: none. An agent should trade the underlying venue (Polymarket) directly, not via Pulse.

## PayBox reachability

- paybox_reachable: **no** for Pulse as a venue (no public order API; wallet is Privy-embedded, not the PayBox wallet). Underlying Polymarket liquidity is reachable via the Polymarket adapter, covered elsewhere.

## Fees

- No Pulse fees during beta; may add transaction fees later at any time; third-party protocols/networks charge their own fees. (H, terms page). No formula published.

## Resolution and disputes

- Entirely by the third-party protocol (Polymarket, so UMA-based per other workflow); Pulse cannot change outcomes. Pulse-vs-user disputes: 60-day informal then AAA arbitration, Delaware law (H, terms page). Dispute risk for arbitrage = that of the underlying venue.

## Geo / ToS / automation

- Not offered to people/entities in the **US** or listed restricted/sanctioned jurisdictions; 18+; VPN circumvention prohibited; Polymarket's own eligibility rules apply. (H, terms page)
- Prohibits bots, crawlers, data-mining tools without authorisation and unreasonably large automated load. No API or bot programme described. (H)

## Liquidity

- Own liquidity: none (aggregates existing markets). No volume/TVL disclosed anywhere found. App Store shows 2 ratings (H, 2026-10-19), indicating an early, small user base.
- **Shares liquidity with Polymarket** per Terms ("current" third-party protocol). Not an independent arbitrage leg (H for routing statement; the Terms also mention Kalshi only as an example of a third-party service, so a Kalshi/DFlow route may be planned - M, DFlow appears only as an investor logo).

## Event coverage

- Sports, politics, economics, tech, culture (App Store text, H). Same as Polymarket's catalogue; no unique markets known.

## Name collisions (not this venue)

Search results surfaced unrelated projects: PredictionPulse (predictionpulse.io, Polymarket/Manifold/Kalshi odds aggregator), Pulse Markets (PULSE token on NEAR, @pulsemarkets), Pulse Platform (pulse-platform.io terminal aggregating prediction-market liquidity), thepmpulse.com. Not verified here and not Pulse Predictions, Inc. (M, single web-search summary). Possibly worth a separate look: pulse-platform.io as an aggregator-of-aggregators.

## Suspicious content

None found. (Web search was budget-limited mid-session, so investor/press coverage was not further checked.)

## Not found

- Public docs/OpenAPI, rate limits, WebSocket message schemas, chain name, on-chain contracts, fee formula, volume/TVL, points mode details, privacy policy contents (not read), social account activity.

## Sources

- https://www.pulsepredictions.com/ (H)
- https://www.pulsepredictions.com/terms-of-service (H)
- https://apps.apple.com/us/app/pulse-prediction-markets/id6775640343 (H)
- https://api.pulsepredictions.com/ , /health , /api/v1/wallet/context (H, unauthenticated GET)
- Web search results for name collisions (M)

## Fixtures

- docs/research/fixtures/pulse-pulse-predictions-inc/api-root-index.json (endpoint index, 2.4 KB)
- docs/research/fixtures/pulse-pulse-predictions-inc/api-health.json
