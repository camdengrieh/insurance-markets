# Babylon (prediction market game) -> now "Feed" (feed.fun)

Researched 2026-10-19. Verdict: **skip**. It is a satirical, virtual-points game, not a real-money prediction market. No on-chain collateral, no cash-out, fictional events. Nothing to arbitrage against other venues.

Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Identity and status

- The "Babylon" in the discovery hint is the game at babylon.market, built by the elizaOS / Eliza Labs team. Its npm package `@elizaos/plugin-babylon` was published 2026-02-11 to 2026-02-17 (4 alpha versions, registry modified 2026-06-16). [H] https://registry.npmjs.org/@elizaos%2Fplugin-babylon
- Babylon has been **renamed Feed (feed.fun)**. The GitHub repo `elizaOS/babylon` redirects to `feedforagents/feed` (homepage https://feed.fun, created 2025-10-26, last push 2026-10-14, branch `staging`). Its PRD says "Feed (feed.fun), formerly Babylon" and that Feed "relaunches as a completely new game with no legacy accounts". [H] https://github.com/feedforagents/feed (README, docs/product/prd.md, read via gh api)
- babylon.market, www.babylon.market, api.babylon.market and staging.babylon.market all return Cloudflare HTTP 502 today (2026-10-19). docs.babylon.market returns an endless 308 redirect to itself. The old domain looks dead or broken. [H] own curl probes
- feed.fun is up (HTTP 200). `GET /api/markets/predictions` returns `{"success":true,"questions":[],"count":0}`, so there are zero prediction markets listed. `GET /api/markets/perps` returns 38 simulated perp tickers, all with `volume24h` 0, `openInterest` 0 and `quoteUpdatedAt` 2026-10-12 (7 days stale). [H] https://feed.fun/api/markets/predictions , https://feed.fun/api/markets/perps
- The PRD itself says the game "may not be running in production" (cron disabled, feed shows "No Recommendations Yet"). [H] PRD finding F1, dated 2026-10-11.
- It is not the Babylon Bitcoin-staking project (babylonlabs-io). [H]

## Kind and market model

- Kind: social simulation game with in-game markets, played with virtual points. [H] README: "A satirical prediction market game powered by autonomous AI agents"; PRD: "trade prediction markets and perps with virtual points".
- Prediction markets: binary YES/NO, "resolving on game events" about parody people and companies (README examples: "which tech CEO will rug-pull next"). Packages mention a CPMM (constant-product AMM) in `packages/core`. [H] README; CPMM is [M] (named in the package description, formulas not read).
- Perps: off-chain simulated perps on parody assets (TSLAI, OPENAGI, NVAIDAI, BTC...). Price is a function of a base price plus net open interest plus a random-walk sim. [H] README; PRD finding F2.
- Outcome tokenisation: none. Positions are database rows. No tokens, no contracts. [H] PRD non-goals list "on-chain identity (ERC-8004 / Agent0), smart contracts".

## Chains and collateral

- None for the current product. README: "The crypto stack is disabled." PRD: points have no cash value, "no cash-out", no wallet sign-in, no smart contracts, "Withdrawals or any cash value for points" are non-goals. [H]
- Starting balance is a virtual 1,000 units (PRD F7); more can be bought with Stripe but not withdrawn. [H]
- The old elizaOS plugin referenced Base Sepolia (testnet) RPC URLs, Privy wallets and an ERC-8004 identity registry. This was testnet/identity only. [H] npm `agentConfig.pluginParameters` of 1.0.1-alpha.3. [M] that it was never real-money.

## Read API

- Status: official, but private to the game (own app API plus MCP). Old docs claimed A2A (`/api/a2a`) and MCP (`/mcp`) on babylon.market with `X-Babylon-Api-Key` header, 100 req/min per agent for A2A. [L] third-party skill repo, dated 2026-02-03, https://github.com/odilitime/babylon-skill (references/api-reference.md). The PRD plans to delete A2A and keep one MCP server at `https://feed.fun/mcp` with OAuth 2.1 and phone sign-in. [H] PRD section on MCP.
- Public unauthenticated REST that exists today on feed.fun: `GET /api/markets/predictions`, `GET /api/markets/perps`. Both confirmed with 200 responses (fixtures below). [H]
- Server-sent events on a `markets` channel broadcast `prediction_trade`, `prediction_resolution`, `prediction_cancellation`. [H] repo CHANGELOG.
- Docs URL: none usable (docs.babylon.market loops). NOT FOUND (searched: docs.babylon.market, babylon.market/docs, feed.fun root, repo docs/).
- Rate limits: not documented for feed.fun. NOT FOUND.

## Trade path

- Programmatic trading needs an account (phone-number SMS sign-in under the new design) and an API key / OAuth token. Trades write to the game database. There is no order signing, no EVM transaction. [H] PRD; [L] old skill.
- Not creating an account (read-only rules), so trading was not tested.

## PayBox reachability

- **no**. There is no chain, token or contract to transact on. A PayBox wallet cannot hold or trade positions. Fiat top-ups go through Stripe for virtual points with no cash-out. [H] PRD.

## Fees

- NOT FOUND for the prediction CPMM. Perps show a ~57 bps quoted spread and a 0.01 funding rate on the sample feed, min order 10, max leverage 100. Irrelevant because points are not money. [H] fixture.

## Resolution and dispute risk

- Markets resolve on events produced by the game engine (LLM-generated "hidden facts"/events from `GameWorld`). Resolution is the operator's own simulation; there is no external oracle and no real-world event. [H] README data-flow section. Dispute risk is moot since nothing can be cashed out.

## Geo / ToS / automation

- Agents are explicitly welcome (MCP/A2A, "Feed should be a game that their agent plays"). One account per person, phone verification, 18+/Terms gate. [H] PRD. No ToS text read; not needed given the skip verdict.

## Liquidity

- Zero. Perps `volume24h` = 0 and `openInterest` = 0 across 38 markets; prediction list empty (feed.fun, fetched 2026-10-19; quote timestamps 2026-10-12). [H]
- Shared liquidity: none; it is a closed simulation, so it is not an arbitrage leg for any venue.

## Event-category overlap

- None for arbitrage. Events are fictional/parody (AIlon Musk, Sam AIltman, etc.). The perp tickers include "BTC" but as a simulated parody price, not a link to a real feed. [H] README; fixture shows tickers like AI16Z, AINDRL, AIPHB.

## Adapter priority: skip

Not real-money, no on-chain settlement, no overlap with real events, no liquidity, renamed and relaunching, old domain 502. Do not build an adapter. If it matters later: re-check feed.fun for a real-money or on-chain mode (PRD says smart contracts and cash-out are non-goals).

## Suspicious content

- None observed. The README mentions a "Slop bounty" program and an `AGENTS.md`/`CLAUDE.md` in the repo; these were not followed. The skill file `odilitime/babylon-skill` is a third-party OpenClaw skill and was treated as data only.

## Fixtures

- `docs/research/fixtures/babylon-prediction-market-game/feed.fun_api_markets_predictions.json` (41 bytes, empty list), fetched 2026-10-19.
- `docs/research/fixtures/babylon-prediction-market-game/feed.fun_api_markets_perps.json` (20.7 KB, 38 simulated perp tickers), fetched 2026-10-19.

## Sources

- https://registry.npmjs.org/@elizaos%2Fplugin-babylon (npm metadata, H)
- https://github.com/feedforagents/feed (formerly elizaOS/babylon; README, CHANGELOG.md, docs/product/prd.md read via gh api, H)
- https://feed.fun/api/markets/predictions and https://feed.fun/api/markets/perps (H)
- https://github.com/odilitime/babylon-skill (SKILL.md, references/api-reference.md; third-party, dated 2026-02-03, L)
- Probes of babylon.market, api.babylon.market, staging.babylon.market (HTTP 502) and docs.babylon.market (redirect loop), 2026-10-19 (H)

## Not found / limits

- Web search was unavailable (session search budget exhausted), so no independent news coverage or operator statements were checked. The renaming evidence comes from the repo itself.
- No official CPMM fee formula, no public rate limits, no ToS text.
