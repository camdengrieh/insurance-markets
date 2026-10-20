# LevelUp Markets (levelup.markets) - venue spec

Researched 2026-10-19. Verdict: **skip** (site down; no docs, API, contracts or volume found).

## Liveness
- [H] `GET https://levelup.markets/` returns HTTP 404, JSON body `{"status":"error","code":404,"message":"Application not found",...}`, headers `server: railway-hikari`, `x-railway-fallback: true` (2026-10-19). This is Railway's edge saying no app is attached to the domain: the backing deployment was removed or never re-attached, not a normal app 404.
- [H] DNS: apex resolves (69.46.46.116 at time of check); `www.`, `app.`, `docs.`, `api.` subdomains do not resolve. `/api/markets` and `/docs` on apex also 404.
- [M] A web search snippet (search-engine cache, undated) shows the homepage once read "Prediction market for everything video games"; the X account @levelup_markets is described as "Predict what happens next in gaming", joined Nov 2024, ~750 followers. So the product is (was) a video-game-outcome market.
- [M] Prediction Index ecosystem page lists: chain Base, status Live, binary, volume n/a, links to site and X. Listing is stale relative to the dead site (https://predictionindex.xyz/ecosystem). Mechanism section was truncated in fetch.
- X profile could not be read (HTTP 402 from x.com via WebFetch; payment requirements not pursued). Wayback was rate-limited (429) / blocked by the fetch tool, so no archived copy was read.

## Market model, chains, collateral
- Kind: onchain-other (per discovery). Market model: [M] binary (Prediction Index only). Order book vs AMM vs parimutuel: NOT FOUND (searched: predictionindex.xyz, web search x3, GitHub repo search "levelup markets prediction" / "levelup.markets").
- Chain: [M] Base (Prediction Index only). Collateral: NOT FOUND. Contract addresses: NOT FOUND. Outcome tokenisation: NOT FOUND.

## Read API
- NOT FOUND (searched: levelup.markets, /api/markets, /docs, api./docs. subdomains, GitHub). exists = none. No fixtures saved (nothing to sample).

## Trade path / PayBox
- NOT FOUND. Without published contract addresses or ABI there is no verified route for a PayBox EVM wallet on Base to trade via transaction proposals. paybox_reachable = unknown (would be at best "partial": Base is EVM, but nothing to call).

## Fees, resolution, geo/ToS, liquidity
- Fees: NOT FOUND. Resolution mechanism / dispute risk: NOT FOUND. Geo/ToS/automation: NOT FOUND. Liquidity (volume/OI/TVL): NOT FOUND (Prediction Index shows "n/a").
- Liquidity sharing with another venue: NOT FOUND, no indication of any.

## Event overlap for arbitrage
- [M] Video-game outcomes (releases, esports) are niche and have little overlap with Polymarket/Kalshi sports/politics/crypto/macro books. Even if revived, little arbitrage value; at most a gaming-signal source.

## Adapter priority
- skip: front end is gone, no API, no docs, no verified contracts, no volume. Revisit only if the team confirms a relaunch (check @levelup_markets on X manually).

## Sources
- https://levelup.markets/ (H: 404 "Application not found", 2026-10-19)
- https://predictionindex.xyz/ecosystem (M: Base, binary, live, volume n/a)
- https://x.com/levelup_markets (M via search snippet only; direct fetch returned 402)
- Web searches (extended) 2026-10-19: no docs, repo, or news found.

## Open questions
- Was the Railway deployment taken down permanently or just misconfigured? Does a different domain exist?
- Any Base contracts? (Could search Basescan labels by name, not done: no address to start from.)

## Privacy / injection
- No personal identifiers used in requests (UA `insurance-markets-research/0.1`). No suspicious embedded instructions seen.
