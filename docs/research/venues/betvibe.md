# Betvibe (beta.betvibe.win) - venue spec

Researched 2026-10-19. Verdict: **skip**. Likely dead/abandoned, parimutuel (horse-racing style), no public API, no overlap with other venues.

## Liveness (is it still live in 2026?)
- `beta.betvibe.win` returns NXDOMAIN (dig, curl "Could not resolve host", WebFetch ENOTFOUND), 2026-10-19. The zone `betvibe.win` is on Cloudflare NS, but the beta host has no record. (H)
- Apex `https://betvibe.win/` resolves but is now an unrelated Hindi-language India cricket/casino/slots lead-gen page ("betvibe भारत"), with no prediction-market content and no links to docs/API. Domain apparently repurposed. (H, curl 2026-10-19)
- Wayback has snapshots of beta.betvibe.win/about (2025-10-02) and / (2025-12-06) (availability API, H). Could not read them: WebFetch is blocked for web.archive.org and I did not work around it. So the last known-alive date is about 2025-12-06 (M).
- predictionindex.xyz/ecosystem still lists it as "Live, Solana, binary/categorical/scalar, Parimutuel, volume n/a", X @betvibewin (H that the listing says so; the listing is stale/unverified, and its market-type claim conflicts with the repo evidence below).
- The only X post found is a launch announcement ~443 days old (about mid-2025) (M, via WebSearch summary; the X broadcast URL returned HTTP 402 to WebFetch, not paid/retried).

## What it was (M, from search snippets of the beta site and the GitHub repo)
- "Decentralized wagering platform" on Solana, built on **OpenTote** parimutuel tech; partner Third Time Games (virtual horse racing game Photo Finish LIVE). (M, WebSearch summary of beta.betvibe.win/about)
- Repo `otbinteractive/betvibemobile` (created 2025-08-05, last push 2025-08-05): React Native/Expo mobile app, "decentralized prediction markets", Solana Mobile Wallet Adapter (Android only), cluster default devnet. (H, https://github.com/otbinteractive/betvibemobile)
- README_BETTING_INTEGRATION.md shows bets via an on-chain "parimutuel-client": `eventId` (race ID, e.g. a Kentucky Derby race) -> event PDA, `poolType: Win`, `picks` arrays of horse numbers, `unitAmount` in dollars per combination, optional referrer. Win/place/exacta-style racing pools, not generic yes/no event markets. (H, repo file)
- App talks to a backend REST/WS at a LAN dev IP (`/pools`, `/bets`, `/categories`, `/auth/connect-wallet`...), default `USE_PLACEHOLDER_DATA: true`. This is dev config, not a public production API. (H, src/config/api.ts)

## Spec fields
- Kind / market model: parimutuel pools (racing-style Win/etc.), outcomes are runners/picks inside an on-chain event PDA, not tokenised shares. No order book, no tradable positions. (M/H)
- Chains / collateral: Solana; collateral stablecoin implied ("$2.00 per combination") but exact mint NOT FOUND. Repo is devnet by default. (L)
- Read API: none official/public found. NOT FOUND (searched: docs.betvibe.win, api.betvibe.win - both NXDOMAIN; betvibe.win/api/markets 404; GitHub repo search; web search). On-chain account reads would need the OpenTote program ID, NOT FOUND. exists = none.
- Trade path: on-chain Solana transaction built with parimutuel-client, signed by the user's Solana wallet (MWA). No order API. PayBox EVM wallets cannot trade it; a Solana PayBox wallet could in principle, but there is no live front end and the program ID/mint are unknown.
- Fees: NOT FOUND (site claims "minimal fees", M). Parimutuel takeout not documented.
- Resolution: NOT FOUND; presumably authority-run results (the example has an "authority" address). Dispute risk: unknown/centralised. (L)
- Geo/ToS/automation: NOT FOUND (site unreachable).
- Liquidity: NOT FOUND; no volume anywhere (listing says n/a). No reason to assume meaningful.
- Event overlap: virtual/real horse racing only per evidence; no overlap with sports/politics/crypto/macro venues. Parimutuel payout is also not directly comparable to a quoted price.
- Shares liquidity with another venue: not that we know; independent but irrelevant.

## Sources
- https://predictionindex.xyz/ecosystem (listing, H as to what it says, stale)
- https://github.com/otbinteractive/betvibemobile (README.md, README_BETTING_INTEGRATION.md, src/config/api.ts, env.example) (H)
- https://betvibe.win/ (curl 2026-10-19; unrelated casino page) (H)
- DNS: dig/curl for beta.betvibe.win, docs., api. (H)
- https://archive.org/wayback/available?url=beta.betvibe.win (snapshot timestamps only) (H)
- Web search summaries of beta.betvibe.win/about and @betvibewin X post (M; pages not directly readable)

## Fixtures
None saved (no reachable public API).

## Suspicious content
None observed. Note: unrelated GitHub repos named "betvibe" (airdrop projects, casino clones) exist and are likely scams/SEO; ignored.
