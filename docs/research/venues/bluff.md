# Bluff (callmybluff.io) - venue spec

Researched 2026-10-19. Verdict: **skip**. Bluff is a PvP wagering / casino-style game site, not a prediction market. Nothing to put on an arbitrage scanner.

Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Summary

- The site is live (HTTP 200, last-modified 2026-10-15) [H, https://callmybluff.io/ response headers].
- It is a Vite + React + PixiJS single-page app. The title is just "Bluff" and the HTML has no meta description [H].
- The lazy-loaded app bundle references only game pages: Coinflip PvP, Coinflip play, Roshambo, Guts tables, Uno head-to-head, a games lobby, leaderboard, points and profile pages [H, https://callmybluff.io/assets/App-C7VFeb2n.js (route chunk list)].
- Strings in the bundle that look like "prediction" are the coinflip side pick, shaped `{playerId, prediction, stakeDeposited}` [H, coinflipPvpArcanaService chunk]. They are not market outcomes.
- The games-lobby sample data shows entry fees such as "50 USDC" / "100 USDC", player counts and room status [H, games chunk]. This is a stake-and-win pot between players.
- Searching the app chunks found zero hits for "market", "oracle", "resolution", "order book" or "prediction market" [H, searched main bundle, HomePage, games, PointsPage, DepositModal and coinflip service chunks].
- predictionindex.xyz lists it as: Arbitrum, binary, AMM, status Live, volume n/a, no docs or GitHub link [H, https://predictionindex.xyz/ecosystem]. The directory's "binary / AMM" tags do not match what the site actually contains. The directory entry is mis-categorised [M].
- Social: X account @CallMyBluff_io is listed on predictionindex. X returned HTTP 402 to WebFetch, so I could not read it. I did not pay or work around the 402.

## Market model

None. Games are PvP pots (coinflip, rock-paper-scissors, Uno, "guts"). There are no tokenised outcome shares, no order book or AMM, and no event contracts. NOT FOUND (searched: all app route chunks, homepage chunk, games chunk).

## Chains and collateral

- The wallet and deposit stack is Arcana-branded (chunk names `ArcanaBankProvider`, `arcanaRuntime`, `coinflipPvpArcanaService`, `useArcanaFreePlayMode`), plus Ably for realtime and Relay for cross-chain deposits [H, chunk names and strings in https://callmybluff.io/assets/ArcanaBankProvider-B1kFzcyy.js].
- The bundle includes viem chain configs, including Arbitrum with RPC arb1.arbitrum.io and stablecoin maps for USDC and USDT on Base, Ethereum, Arbitrum, Polygon, Solana and Optimism [H]. That is generic wallet/bridge-library content, not proof of where the game settles.
- predictionindex says Arbitrum [H for the listing, M for the claim].
- Game contract addresses: NOT FOUND (searched: the bundles above; no Bluff-specific contract address found).

## Read API

- Exists: **none documented**. NOT FOUND (searched: callmybluff.io/docs and /api/markets, which return the SPA shell; /robots.txt returns 404; no docs link on the predictionindex listing; no GitHub link found).
- Realtime appears to run through Ably (private channels) [M]. It is not a public market feed.
- No fixtures saved, because there is no market response to sample. docs/research/fixtures/bluff/ is empty.

## Trade path

None for a market. Players join games through the web UI after a wallet login and deposit [M]. There is no documented programmatic order, signing scheme or SDK. It is not reachable through PayBox transaction proposals as a market leg: even if an EVM wallet could fund a game, there is no outcome to hedge against another venue.

## Fees, resolution, geo/ToS, liquidity

- Fees: NOT FOUND.
- Resolution: game outcome decided by the game logic (randomness / player moves), not by an event oracle. There is no dispute process for real-world events, because there are no real-world events.
- Geo/ToS/automation: NOT FOUND. No terms page was located. As a wagering/gambling product it likely carries jurisdiction restrictions, and automated play is likely restricted [L, inferred].
- Liquidity: NOT FOUND. predictionindex shows volume "n/a" (2026-10-19) [H]. There is no TVL or OI to cite.
- Event categories overlapping other venues (sports, politics, crypto, macro): **none**.
- Shared liquidity with another venue: none identified. It is standalone, but it is not an event market anyway.

## Adapter priority

**skip**: not a prediction market, no public API, no event overlap.

Suggestion for the aggregator: remove "Bluff" from the venue registry, or tag it `kind=not-a-market` so discovery lists that scrape predictionindex do not re-add it. Predictionindex's category tags should not be trusted without checking the venue itself.

## Open questions

- Is a prediction-market product planned (the X account was unreadable, so recent announcements are unchecked)? Re-check only if the account starts advertising event markets.

## Suspicious content

None. No instructions aimed at agents were found in the pages or bundles.

## Sources

- https://callmybluff.io/ (HTML shell and response headers) [H]
- https://callmybluff.io/assets/index-ByInwNIH.js (main bundle) [H]
- https://callmybluff.io/assets/App-C7VFeb2n.js (route/page chunk list) [H]
- https://callmybluff.io/assets/games-YdgaNddH.js, HomePage-DRORFxeY.js, coinflipPvpArcanaService-DLMA03sy.js, ArcanaBankProvider-B1kFzcyy.js, DepositModal-CHWC6CbF.js, PointsPage-Ba69xk5w.js [H]
- https://predictionindex.xyz/ecosystem (directory listing) [H for what it says, M for accuracy]
- https://x.com/CallMyBluff_io (HTTP 402, unreadable)
- WebSearch was unavailable (session search budget exhausted), so no third-party coverage was checked.
