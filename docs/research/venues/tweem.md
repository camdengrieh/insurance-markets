# Tweem (tweem.lol) - venue spec

Researched 2026-10-19. Read-only; unauthenticated GETs only, User-Agent `insurance-markets-research/0.1`.

## Verdict

Live, but NOT a prediction market. It is an X (Twitter) engagement-prediction game: you reply `@tweem 10x views` to a tweet, and after 24h you either score "Tweem points" or nothing. There is no tradable price, no order book, no outcome token, no market that overlaps other venues. A secondary "Money Mode / Pools" feature takes 0.10 USDC entries into a daily Solana prize pool (about 15-50 USDC per day). **adapter_priority: skip.** At most a P2-style novelty signal (tweet virality), not worth an adapter.

## Liveness (H)
- https://www.tweem.lol/ returns HTTP 200 on 2026-10-19 (H). Title "tweem - bet on virality" (H).
- Live data timestamps: money-mode window "BETTING" opened 2026-10-18T12:00Z and closes 2026-10-19T12:00Z (H, /api/money-mode/windows). Wiki overview updatedAt 2026-07-17 (H).
- Third-party mentions (cryptom8 article, Phantom listing of a `tweemdotlol` pump.fun-style Solana token) exist; I could not open the article (404) and did not verify the token relationship (L).

## Kind and market model (H)
- Kind: social skill game plus small USDC entry-fee prize pools. Off-chain game state; Solana only for pool entry fees/payouts.
- Bets are free-form claims about a tweet's engagement in the next 24h: absolute target (`1m views`, `50k likes`) or multiplier (`10x views`, relative to metrics at bet time) or virality multiple vs the account's average. Source: https://www.tweem.lol/api/wiki/bet (H).
- Not binary/categorical/scalar market, not order book, not AMM, not parimutuel on outcomes. Points are minted by the house when you hit; a miss costs nothing ("No deposits. No fees... Miss? Nothing happens") (H, https://www.tweem.lol/api/wiki/overview). Points can be spent as "leverage" 2x-5x (H, wiki tweem-points).
- No outcome tokenisation; no per-outcome price.
- Money Mode pool: each daily window has `entryFeeUsdc` 0.10, `prizePoolUsdc`, `rewardDistribution` [35,25,20,12,8] (percent to top 5 ranks), `randomBonusEnabled` true. Players buy entries (bets) into a window; ranked by score. This is a contest, not a market (H, /api/money-mode/windows).

## Chains and collateral (H/M)
- Solana, USDC. Windows expose a `treasuryAddress` (Solana address, per-day vault), `poolIsOnChain` (false in the live samples), `onChainSettled`. (H, /api/money-mode/windows)
- Terms page says entry fees are USDC transfers via an on-chain Pools program instruction into the day's treasury vault, and that enabling Pools delegates a limited session signer to the user's Privy embedded wallet, restricted by policy to the Pools program and capped USDC transfers (H, text in https://www.tweem.lol/_next/static/chunks/app/terms/money-mode/page-c1856e984dfe07c3.js).
- Points are off-chain.

## Read API (unofficial, undocumented)
- Exists: no official public API docs found. NOT FOUND (searched: homepage, /wiki, /how-to-tweem, site footer links, web search for "tweem api"). Classify as `unofficial-only`: the website's own Next.js frontend calls unauthenticated JSON endpoints that I found by reading the public page JS (H that they respond; no stability or ToS permission for third-party use).
- Base: `https://www.tweem.lol`
- Endpoints confirmed 200 JSON without auth (H):
  - `GET /api/money-mode/windows` - current and recent pool windows (id, status BETTING/SCORING/DISTRIBUTED, prize pool, entry fee, times, betCount, participantCount, treasuryAddress)
  - `GET /api/money-mode/history?limit=&offset=` - past windows
  - `GET /api/cults?volumeMonth=current&limit=&offset=` - groups ("cults") with monthly USDC volume and prize
  - `GET /api/stage/bootstrap?sortBy=featured` - leaderboard (points, bets, hits, accuracy)
  - `GET /api/leaderboard` - leaderboard
  - `GET /api/wiki/{slug}`, `GET /api/wiki/search?q=` - wiki
- Auth-required (401 "Authentication required"): `/api/money-mode/claims`. Also referenced in page JS but not probed: `/api/users-bets`, `/api/user-profile/top-hits`, `/api/user-referrals`, `/api/bets/fresh-pool-candidates`.
- Rate limits: NOT FOUND. WebSocket: NOT FOUND.
- Leaderboard responses contain real X usernames, ids and avatars of third parties; I did not save them as fixtures.
- Fixtures: `docs/research/fixtures/tweem/money-mode-windows.json`, `money-mode-history.json`, `wiki-overview.json`.

## Trade path
- None programmatic. Bets are placed by replying `@tweem ...` on X from a logged-in X account (H, wiki bet), or on the website. Pool entry is a Solana USDC transfer signed by a Privy embedded wallet via a user-delegated session signer. NOT FOUND: any public order or bet submission API, API keys, or SDK (searched: site, page JS, web search).
- PayBox reachability: **no**. PayBox EVM wallets cannot place X-reply bets; the pool uses a custodial-ish Privy embedded Solana wallet and an X identity. A Solana PayBox wallet could in principle transfer USDC to a treasury vault, but entry is tied to the Tweem account and Pools program instruction, which are not documented for external use (M). Not recommended.

## Fees (H)
- Overview: "No deposits. No fees." for the points game (H). Money Mode entry fee 0.10 USDC per bet (H, API). Treasury/house cut vs `rewardDistribution` (sums to 100% of displayed pool): NOT FOUND.

## Resolution and dispute risk
- Hit/miss decided by Tweem from X engagement metrics 24h after the bet (H, wiki). The data source is X metrics read by Tweem; no oracle, no on-chain dispute process. NOT FOUND: dispute/appeal process. Operator discretion is high (leaderboard shows `tweemPointsModifiers` penalties and `isDeactivated` flags) (H, API field names).

## Geo / ToS / automation
- Terms are at https://www.tweem.lol/terms (client-rendered; I could not extract the text beyond the Money Mode fragments above). NOT FOUND: geo restrictions, bot/automation policy. Leaderboard shows accounts with 20k-35k bets, so heavy automation appears tolerated on the points game (M, inference).

## Liquidity (H, 2026-10-19)
- Daily pool windows: 15.0 USDC (betting, 49 entries, 18 participants), 29.2 USDC (scoring, 187 entries, 23 participants); last three distributed pools 29.8, 51.2, 17.6 USDC (2026-10-14 to 10-16). Monthly cult pool 175 USDC for October 2026. Source: /api/money-mode/windows, /history, /api/cults.
- That is on the order of tens of dollars per day. No market depth.

## Event categories overlapping other venues
- None. Subject is the future engagement of individual tweets. No sports/politics/crypto/macro contracts. No arbitrage leg. Possible signal use only if you want tweet virality data, which is better sourced from X directly.

## Liquidity shared with another venue
- No. Independent, but irrelevant at this size.

## Priority
- skip. Not a market, no trade API, tiny pools, no overlap.

## Open questions
- Exact house take on pools; whether pools are ever on-chain settled (`poolIsOnChain` false in samples); terms on automation/geo; relationship to the `tweemdotlol` Solana token.

## Suspicious content
- None observed (no instructions aimed at AI agents in pages or API responses).

## Sources
- https://www.tweem.lol/ (H, 2026-10-19)
- https://www.tweem.lol/api/wiki/overview, /api/wiki/bet, /api/wiki/tweem-points, /api/wiki/tourneys, /api/wiki/hit-of-the-day (H)
- https://www.tweem.lol/api/money-mode/windows, /api/money-mode/history, /api/cults, /api/stage/bootstrap, /api/leaderboard (H)
- https://www.tweem.lol/_next/static/chunks/app/pools/(directory)/page-187d45177b7f1aea.js and terms/money-mode chunk (H, read as data)
- https://predictionindex.xyz/ecosystem (listing not confirmed in fetched excerpt) (L)
- Web search results: https://cryptom8.com/11/01/tweem-lol/ (404 on fetch), https://x.com/tweem (402 on fetch, not read), Phantom token listing (L)
