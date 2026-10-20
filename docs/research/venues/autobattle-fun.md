# autobattle.fun - venue spec (2026-10-19)

Verdict: **skip**. A Solana LMSR betting game on AI-vs-AI blackjack outcomes. It has no overlap with real-world event markets, so there is nothing to arbitrage. Its backend API returned 502 on 2026-10-19. The only possible use is as a toy signal source, and there is nothing to signal.

Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## 1. Liveness
- Frontend https://autobattle.fun serves a Next.js shell (HTTP 200); sitemap lastmod is 2026-10-19 [H, https://autobattle.fun/sitemap.xml]. Nav links are /, /history, /settings; sitemap also lists /games and /login [H].
- The backend that the client bundle points to (`API_BASE_URL = https://testapi.autobattle.fun`, host literally named "testapi") returned **HTTP 502** (Cloudflare-style plain-text "error code: 502") on /api/health, /api/games/active, /api/markets, /api/games?limit=2 and /api/leaderboard/live on 2026-10-19 [H, curl]. So live match data was not available. Whether this is a transient outage or permanent is unknown [L].
- GitHub org activity stops early June 2026: contracts last commit 2026-06-03, server 2026-06-06, client 2026-06-06 [H, gh api]. No commits in the last four months, so it looks dormant [M].
- X account @autobattle_fun: launch on June 1 (2026), partners Solana, Switchboard, Openfort, Pump.fun, Deforge, per a search-result snippet only [M/L]. A direct fetch of x.com returned HTTP 402 Payment Required; I recorded it and stopped (no payment attempted).
- No independent press, audits or volume reports found (WebSearch extended) [M]. NOT FOUND (searched: web search "autobattle.fun Solana AI agents prediction market", GitHub org, X).

## 2. What it is, market model
- It is a game, not an event-prediction venue. Two LLM-driven "celebrity persona" agents (Red/Blue) play blackjack; Switchboard On-Demand VRF deals cards; 10 HP system; last agent standing wins the match [H, https://github.com/autobattle-fun/autobattle-server README].
- Markets: a "Main" market (match winner) and "micro" markets per round winner [H, server README]. Binary Yes/No per market. Pricing is an **LMSR AMM** with b = 144.27e9 scaled units, initial price 0.5, and a README note that the current implementation is a linear approximation of LMSR [H, https://github.com/autobattle-fun/autobattle-contracts README + programs/prediction-market/src/lib.rs].
- Outcomes are not SPL tokens. They are share balances in a `UserPosition` PDA (seed `position`, market, user) with yes_shares/no_shares; supply is tracked in the `Market` PDA [H, contracts README + lib.rs].
- Market account layout: Market PDA seeds `["market", game_id, market_index]`, Vault `["vault", game_id, market_index]`, Registry `["registry"]` [H].

## 3. Chain and collateral
- Solana mainnet. Program IDs from Anchor.toml `[programs.mainnet]`: game_engine `GxLT8QMUw6cVT6HQBu2c2zepbQnhUWr4VPEB2vfggE2e`, prediction_market `H76M7bbm6zwE464xkabF5MWbciwZqK9FmZYf4omaqnQH` [H]. I did not verify on-chain deployment (RPC calls are POST; skipped) [L].
- Collateral is the project's own **$AUTO** token (SPL token-interface `auto_mint`) ("Winners collect $AUTO") [H, README]. Not USDC. Token mint address: NOT FOUND in the files I read.
- Initial LP seed `INITIAL_LIQUIDITY = 100_000_000_000` raw units, provided by the admin [H, lib.rs].
- Wallets: users log in with social login and Openfort provisions an embedded wallet; there is no manual wallet connect [H, client README]. The Openfort and Privy hooks in the server mean users are tied to the project's custodial/embedded-wallet stack [M].

## 4. Read API
- Exists: **unofficial/undocumented**. There is no docs site. The Express routes are readable in the open-source server repo [H, https://github.com/autobattle-fun/autobattle-server/tree/main/src/routes]:
  - Public GETs: `/api/health`, `/api/games`, `/api/games/active`, `/api/games/countdown`, `/api/games/search/:gameId`, `/api/games/:gameId/details`, `/api/games/:gameId/stats`, `/api/games/:matchId`, `/api/games/celebrities/all`, `/api/markets`, `/api/markets/match/:matchId`, `/api/markets/game/:gameId/round/:roundNumber`, `/api/markets/:marketId`, `/api/markets/:marketId/price`, `/api/markets/:marketId/predictions`, `/api/leaderboard/live`, `/api/leaderboard/last-week`, `/api/bounties`.
  - Auth-required (session): `/api/trades/*`, `/api/user`, POST predictions.
- Base URL baked into the production bundle: `https://testapi.autobattle.fun` (502 at test time) [H]. `https://api.autobattle.fun` serves a hosting-panel placeholder (FASTPANEL), not the API [H]. A WebSocket server exists (Redis plus WebSocket for live match events) but its URL is not exposed in what I read [M].
- On-chain alternative: the Market PDAs hold yes/no supply, so prices are derivable from the LMSR formula, and events like `MarketResolved` are emitted [H, lib.rs]. Reading needs the Anchor IDL (in `src/idls/prediction_market.json` of the server repo) and Solana RPC.
- Auth, rate limits: NOT FOUND (no docs).
- Fixtures: none saved, because no successful API response was obtained.

## 5. Trade path
- Per `trades/build` and `trades/verify` routes the server builds a transaction for the user and verifies it after signing; this requires a logged-in session and the embedded Openfort wallet [H, trade.routes.js, client README]. No public order-placement API for agents.
- Direct on-chain: `buy_shares(outcome, amount_in, min_shares_out)` and `sell_shares` are permissionless instructions [H, lib.rs], so any Solana keypair could call them in principle. Market creation and resolution are admin-only (`ADMIN_PUBKEY`).
- PayBox reachability: **partial**. An EVM wallet cannot trade this directly. Only a PayBox Solana wallet that holds $AUTO could sign a raw Anchor instruction via transaction proposal. $AUTO liquidity and a swap route are unverified [L]. Not worth integrating.

## 6. Fees
- 1% on every buy (taken from amount_in) and 1% on every sell (taken from gross out), accumulating in `market.fee_balance`; minimum trade must produce fee > 0 [H, lib.rs: `checked_div(100)`]. Paid by the trader. Fee is retained in the vault and withdrawn by admin via `withdraw_lp` [H].

## 7. Resolution and dispute risk
- Centralised: `resolve_market(outcome)` is called by the admin/crank wallet after the game ends. Deadline is 172800 s (2 days) after expiry [H]. Cards come from Switchboard VRF, so game randomness is verifiable, but the market outcome is set by the authority, not derived trustlessly on-chain from game state [M; I did not read whether `resolve_market` cross-checks `GameState`, though the program embeds the game-engine ID].
- If unresolved after the deadline, `refund_expired` gives pro-rata refunds [H]. Claim window 2 days after resolution; admin `sweep_unclaimed` takes unclaimed funds after that [H]. Admin can also `reclaim_expired_lp`. Programs are upgradeable (upgrade lock during active games) [H]. High admin and rug risk; no audit found.

## 8. Geo, ToS, automation
- NOT FOUND (no ToS or geo page in sitemap or nav; searched site and repos). Repos are GPL-3.0 [H]. robots.txt disallows /api/ for crawlers [H]; so scraping the API would breach robots.txt.

## 9. Liquidity
- NOT FOUND: no volume, TVL or OI published. Initial LP is 100e9 raw $AUTO units per market (decimals unknown) [H]. Treat as thin and toy-sized [L]. Leaderboard and market-volume figures could not be fetched (API 502).

## 10. Overlap with other venues (arbitrage relevance)
- None. Underlying events are AI-agent blackjack games that exist only here. No sports, politics, crypto-price or macro categories. Not an independent arbitrage leg because there is nothing to hedge against; no shared liquidity with another venue.

## 11. Aggregator and PayBox adapter notes
- If ever built: read-only adapter via the public GET routes, map each market to `{venue: autobattle-fun, market_id, game_id, round, yes_price, ...}` with category "game/novelty", and exclude it from arbitrage scanning. Not recommended.

## Suspicious content
- None. `GEMINI.md` and `AGENTS.md`/`CLAUDE.md` in the repos are generic coding-assistant guidelines; I did not act on them.

## Sources
- https://autobattle.fun and /sitemap.xml, /robots.txt [H]
- https://testapi.autobattle.fun (502), https://api.autobattle.fun (placeholder) [H]
- https://github.com/autobattle-fun/autobattle-contracts (README, Anchor.toml, programs/prediction-market/src/lib.rs) [H]
- https://github.com/autobattle-fun/autobattle-server (README, src/routes/*.js) [H]
- https://github.com/autobattle-fun/autobattle-client (README, .env.example keys only) [H]
- https://github.com/autobattle-fun/.github profile README [H]
- https://x.com/autobattle_fun via search snippet [M/L]; direct fetch returned 402, not pursued
