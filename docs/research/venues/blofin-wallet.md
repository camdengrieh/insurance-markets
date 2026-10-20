# BloFin Wallet - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. BloFin Wallet is a self-custody mobile wallet (BloFin exchange's wallet) with an in-app prediction-market feature. It is a front-end, not a venue: it has no API of its own and, on the evidence, its order flow lands on Polymarket's CLOB (it is a verified Polymarket builder). It is therefore NOT an independent arbitrage leg; coverage comes from the Polymarket adapter. Its builder code is only useful as an attribution tag.

## Is it live?

- Wallet is live and marketed in 2026; prediction markets are listed as a feature on the wallet homepage. H - https://wallet.blofin.com/en
- Wallet launch announced (title: "BloFin Wallet Is Live...", about Nov 2025 per search summary). M - https://blofin.com/en/support/Announcement/Latest-News/14300671586575-BloFin-Wallet-Is-Live-An-All-in-One-Web3-Wallet-with-Global-Payment-Integration (page itself 403 to fetch; title/date from WebSearch only)
- A June 2026 BloFin World Cup promotion uses points to predict match outcomes (28 Jun - 20 Jul). That is an exchange promo, probably not the on-chain prediction feature. M/L (search snippet only; page 403) - https://blofin.com/en/support/Announcement/Latest-Promotions/16118428649201-BloFin-World-Cup-Summer-2026-Trade-Vote-Earn-10-BTC
- blofin.com returns 403 with `cf-mitigated: challenge` (Cloudflare challenge) to plain curl and WebFetch, so most official help/academy pages could not be read. H (curl -I).
- Usage is small and fading. Polymarket builder leaderboard for builder "BloFin Wallet", fetched 2026-10-19: ALL $1,165,554 / 904 users (rank 150); MONTH $359,996 / 11 active users (rank 70); WEEK $21 / 2 users; DAY $10 / 1 user. So the last-30-day volume is concentrated in a handful of users (likely one or two large accounts) and the last week is near zero. H - https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=1&offset=149 (fixture saved)

## Kind and market model

- kind: broker-or-frontend (wallet with embedded prediction market UI). H for "wallet with prediction feature"; M for "backend is Polymarket".
- Wallet copy: users "trade the outcomes of real-world events, such as sports results and crypto price moves", select event and position, positions taken "directly from your wallet". H - https://wallet.blofin.com/en
- BloFin's own academy guide (via search snippet) calls it "an on-chain activity built natively into the wallet". M - search result for https://blofin.com/academy/guides/blofin-wallet (403 on fetch)
- No BloFin page read this session names Polymarket as the provider. NOT FOUND (searched: wallet.blofin.com homepage, WebSearch extended x3, support FAQ URL (403)). The link rests on the builder leaderboard: a verified Polymarket builder named "BloFin Wallet" with logo and 904 users. Polymarket defines a builder as an app that routes user orders to Polymarket and attaches a builder code that is "serialized onchain as part of the signed order and submitted to Polymarket's CLOB". H (leaderboard) + H (definition) -> M/H that BloFin Wallet prediction orders are Polymarket CLOB orders. The remaining gap is that the builder-code owner is not shown to be the same entity as blofin.com beyond the name/logo.
- Market model if Polymarket-backed: binary and categorical (neg-risk) markets, CLOB, outcomes as ERC-1155 conditional tokens (see docs/research/08-venues-polymarket-kalshi.md). M

## Chains and collateral

- Wallet networks (FAQ copy): Ethereum, Arbitrum, Avalanche, Base, BNB Chain, Optimism, Polygon, Solana, Tron. Homepage swap copy omits Avalanche and Tron. H - https://wallet.blofin.com/en
- Prediction settlement chain/collateral not stated. If Polymarket-backed: Polygon, pUSD/USDC collateral. M. Gas can be paid in USDT/USDC via sponsorship; wallet is Passkey/WebAuthn + Account Abstraction smart wallet. H (homepage copy)

## Read API

- exists: **none** (no BloFin Wallet prediction API). H - homepage has no API/SDK/developer docs mention. NOT FOUND (searched: wallet.blofin.com, WebSearch for docs/API).
- BloFin exchange has a trading API (docs.blofin.com), but it covers exchange spot/futures, not the wallet's prediction feature. L/M, not verified.
- Market data should be taken from Polymarket instead. Builder-level attribution only: `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=&offset=` returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]`; also `/v1/builders/volume?timePeriod=ALL` returns a daily/period time series with `dt`. Unauthenticated. H (fixtures saved). Rate limits NOT FOUND for these endpoints.
- Per-builder trade data (filtering fills by builder code) not found in the endpoints I tried; NOT FOUND (searched: gamma-api /builders returned 404).

## Trade path

- none via BloFin. Orders are placed in-app by the user's BloFin Wallet; no third-party API. H (no API documented)
- An agent would instead trade Polymarket directly (signed CLOB orders, EIP-712) and could attach its own builder code. Polymarket docs: builder code is part of the signed order; Polymarket's relayer covers gas. H - https://docs.polymarket.com/developers/builders/builder-intro

## PayBox reachability

- paybox_reachable: **no** for BloFin Wallet as such (mobile-only passkey wallet, no API, cannot be driven by PayBox; users' funds sit in BloFin's smart wallet). The underlying liquidity (Polymarket on Polygon) is reachable by an EVM wallet via signed orders, covered by the Polymarket venue spec.

## Fees

- Wallet charges "a small service fee" on token swaps, card deposits and prediction-market payouts; exact amount shown before each confirmation. Formula/rate NOT FOUND. Payer: user. H (homepage) - https://wallet.blofin.com/en
- Plus network gas (sponsorable). Polymarket's own taker/maker fee schedule applies if Polymarket-backed (see Polymarket spec). M
- Whether the service fee is charged on payout principal or profit: NOT FOUND.

## Resolution mechanism and dispute risk

- Not documented by BloFin. If Polymarket-backed, resolution is UMA optimistic oracle (or Polymarket's current resolution path) with the usual dispute risk. M. Because payouts carry a BloFin service fee, a BloFin user's net payout differs from Polymarket's.

## Geo / ToS / automation

- Wallet homepage lists no geographic or eligibility restrictions for prediction markets and no terms links. H. Mobile-only for now (search snippet of June 2026 guide). M/L
- Visa cards are available only in certain countries. H. Whatever Polymarket geo-block applies to the backend is likely enforced; NOT FOUND for BloFin.
- Automation: no API, so no automation path. Scripting a consumer wallet app would be unsupported and not recommended.

## Liquidity

- Own liquidity: none. Flow through Polymarket CLOB (M/H). Volume via Polymarket builder program: $1.17M all-time, 904 users; $360k last 30 days (11 active users); near-zero last week. H, 2026-10-19, Polymarket data API. Builder volume is a subset of Polymarket volume and is double counted if added to Polymarket.
- Shares liquidity with: Polymarket (M/H, see above). Not an independent arbitrage leg.

## Event coverage

- Sports, crypto price, "real-world events" per wallet copy. H. Entirely overlapping with Polymarket; any arbitrage versus Kalshi/others is already captured by the Polymarket adapter.

## Suspicious content

- None found. (Fetched pages were marketing copy; no agent-directed instructions.)

## Open questions

- Confirm the provider with a BloFin Wallet support/FAQ page (blocked by Cloudflare) or in-app UI; confirm settlement chain and collateral.
- Whether BloFin Wallet's prediction feature was ever sold under a different brand or retired (volume has collapsed in the last week).

## Sources

- https://wallet.blofin.com/en (H, fetched 2026-10-19)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, curl 2026-10-19; fixtures in docs/research/fixtures/blofin-wallet/)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=ALL (H)
- https://docs.polymarket.com/developers/builders/builder-intro (H)
- https://blofin.com/ (403, Cloudflare challenge) (H)
- WebSearch extended results listing blofin.com academy/support/announcement URLs (M; pages 403 on fetch)
