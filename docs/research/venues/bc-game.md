# BC.GAME (bc.game) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not an independent venue. BC.GAME is a crypto casino that embeds Polymarket as a "Prediction Center" at bc.game/predictions. Orders route to Polymarket's CLOB tagged with a Polymarket builder code. Liquidity is 100% Polymarket's. adapter_priority = skip (duplicate liquidity). At most, its builder-code volume is a minor attribution signal.

## Is it live (2026)?

- H: bc.game returns HTTP 200; title "BC Game: Crypto Casino Games & Casino Slot Games - Crypto Gambling". https://bc.game/
- H: bc.game/predictions returns 200 (SPA shell, needs JS). Title "Predictions - Sports, Crypto & World Event Markets | BC Game"; meta description "Prediction Center, powered by Polymarket. Live market odds, back your view with crypto." https://bc.game/predictions
- M: Press release (syndicated, PlayNewswire; one announcement, not independent) dated 2026-06-16 says BC.GAME launched a Prediction Center "powered by Polymarket" covering sports, crypto prices (BTC/ETH/SOL) and real-world events. https://techstartups.com/2026/06/16/bc-game-launches-prediction-center-powered-by-polymarket/
- H: Polymarket public builders leaderboard lists a verified builder "BC.GAME" (builderCode 0x38cbb08f...55b1), so the integration is live and generating volume.
- Correction to discovery hint: the earlier "403 / no public prediction product verified" is wrong; plain curl with a generic UA got 200 for both pages.

## Kind and market model

- kind: aggregator-frontend / white-label of Polymarket (casino with embedded prediction UI). M (press release says "integrating Polymarket's infrastructure"; builder-code attribution is H).
- Market model: identical to Polymarket (binary and categorical CLOB, ERC-1155 conditional tokens via CTF). BC.GAME has no own markets found. NOT FOUND (searched: bc.game, bc.game/predictions HTML, web search, press release) any BC.GAME-originated market.
- Whether BC.GAME uses custodial omnibus accounts: NOT FOUND. Inferred M from "activeUsers: 1" while the platform has users: volume is attributed to a single wallet/proxy, consistent with a custodial/omnibus setup. Treat as inference.

## Chains and collateral

- Underlying: Polygon, pUSD/USDC collateral via Polymarket (see Polymarket spec from parallel workflow).
- User-facing: press release says users "back your view with crypto" (H for meta description). Which BC.GAME balances/tokens convert to the collateral: NOT FOUND.

## Read API

- exists: none (for BC.GAME itself). NOT FOUND (searched: bc.game docs, web search "BC.GAME prediction API", robots.txt, page source is a JS shell with no endpoints).
- Use Polymarket's APIs for the actual markets (Gamma, CLOB, Data API) - covered by the other workflow.
- Only BC.GAME-specific public data: Polymarket Data API builder leaderboard (H, unauthenticated GET, 200):
  `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=N`
  Returns array of `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`. `rank` is a string. Pagination via `offset` works (verified: offset 150 on ALL contains BC.GAME). limit appears capped at 50 (limit=200 returned 50).
  BC.GAME rows on 2026-10-19:

  | period | rank | volume USD | activeUsers |
  |---|---|---|---|
  | ALL | 163 | 880,381 | 1 |
  | MONTH | 77 | 214,029 | 1 |
  | WEEK | 54 | 34,179 | 1 |
  | DAY | 48 (page 0) / 54 (page 50 query) | ~2,257-2,289 | 1 |

  (DAY rank differed between two queries a few seconds apart; leaderboard is live-updating.)
- Fixtures: docs/research/fixtures/bc-game/builders-leaderboard-{ALL,MONTH,WEEK,DAY}.json (BC.GAME row plus the first or neighbouring row, logo URLs stripped).
- Docs: Polymarket Builder Program (H): builder code is attached to each order and serialized on-chain in the signed order; matched volume credited to builder; up to 24h delay on leaderboard. https://docs.polymarket.com/developers/builders/builder-intro

## Trade path

- none for BC.GAME directly. NOT FOUND (searched: public API, docs). Logged-in casino account required; no documented programmatic order API.
- Trading the same markets should be done directly on Polymarket (CLOB signed orders). No reason to go through BC.GAME.

## PayBox reachability

- paybox_reachable: no. There is no BC.GAME public order interface, and wallet access to the underlying liquidity is already covered by the Polymarket adapter. A PayBox EVM wallet could only interact via an account/deposit flow on a custodial casino (unverified, NOT FOUND, and not suitable for automation).

## Fees

- NOT FOUND for BC.GAME prediction trades (press release states none; searched). Polymarket builder-fee docs URL I tried (docs.polymarket.com/developers/builders/builder-fees) returned 404; the builder-intro page does not state builder fee structure. Underlying Polymarket fees apply (see Polymarket spec). Any BC.GAME markup/spread: unknown.

## Resolution

- Inherited from Polymarket (UMA optimistic oracle / Polymarket rules). Dispute risk is the same as Polymarket. BC.GAME's own handling of voided/disputed markets for casino users: NOT FOUND.

## Geo / ToS / automation

- Press release does not specify availability; says BC.GAME operates "across multiple markets where permitted" (M). BC.GAME is a Belize-dateline offshore casino; likely has its own KYC/geo rules. Not verified; terms are behind the JS app. NOT FOUND (searched: web search for BC.GAME prediction terms; only Polymarket restrictions returned).
- robots.txt is a normal casino-site file; no prediction-specific rules seen in the first 30 lines.
- Automation: no documented API, so scripted use is not sanctioned. Do not scrape.

## Liquidity

- Own liquidity: none. All depth is Polymarket's.
- Attributed volume via builder code: ALL-time ~$0.88M (rank 163), 30d ~$0.21M, 7d ~$34K, 24h ~$2.3K, one active user. Source: Polymarket Data API leaderboard, 2026-10-19 (H). This is tiny relative to Polymarket and shows the integration is thin.

## Event categories

- Sports, crypto price (BTC/ETH/SOL), real-world events (M, press release) - all just Polymarket's catalogue. No unique overlap/arbitrage; it is the same orderbook.

## Shared liquidity

- Shares liquidity with Polymarket (global CLOB). Not an independent arbitrage leg. Displayed odds are Polymarket's ("real-time probabilities").

## Priority

skip. Duplicate liquidity, no public API, thin volume. Optional use: monitor the builder leaderboard row as a very weak flow signal (L value).

## Suspicious content

- None found. The bc.game pages are a generic JS shell; the press release is promotional ("seamlessly", "mature experience") but contained no instructions aimed at AI agents.

## Open questions

- Does BC.GAME run omnibus custody (explains activeUsers=1)? Which jurisdictions can use bc.game/predictions? Any BC.GAME markup on prices?

## Sources

- https://bc.game/ (H, fetched 2026-10-19)
- https://bc.game/predictions (H, fetched 2026-10-19; meta tags only, SPA)
- https://bc.game/robots.txt (H)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, 2026-10-19)
- https://docs.polymarket.com/developers/builders/builder-intro (H via WebFetch summary)
- https://techstartups.com/2026/06/16/bc-game-launches-prediction-center-powered-by-polymarket/ (M, press release)
- Web search results (M): many syndicated copies of the same release (dailycoin.com, cryptopotato.com, etc.)
