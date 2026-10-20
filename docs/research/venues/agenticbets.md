# AgenticBets (agenticbets.dev) - venue spec

Researched 2026-10-19. Read-only: public GETs and GitHub/npm metadata only. WebSearch budget was exhausted, so no independent third-party corroboration was possible.

## Verdict

Site is up, but the venue is effectively dormant and not an arbitrage leg. Skip (token-price micro-market with no event overlap, trivial liquidity, last activity May 2026).

## Is it live? (partly)

- H: Homepage returns 200 on 2026-10-19 (https://agenticbets.dev). It says "Live on Base" and "Use at your own risk. Contracts audited using open-source AI tools only."
- H: Public `/api/bankr/markets` returned 12 markets, `updatedAt` 2026-10-19T05:22Z. Every one is `cancelled` (7) or `not_started` (5). Total `poolUsdc` across all of them is 20 USDC. The latest `lockTimestamp` is 2026-05-05 (AGBETS, v2, cancelled). Nothing has been tradable or settled to a winner in the sample since then.
- H: GitHub `viraj124/bankr-bets`: created 2026-02-06, last push 2026-05-17 (Season 1 finalization UI), 1 star, MIT, zero commits since 2026-06-01. https://github.com/viraj124/bankr-bets
- H: npm `agenticbets-mcp` has a single version 0.1.0, published 2026-04-18. https://registry.npmjs.org/agenticbets-mcp
- M: The "Season 1" leaderboard with a finalize/rewards flow suggests the points season ended in May 2026.

## Kind and market model

- H: Permissionless binary UP/DOWN parimutuel rounds on the price of a Base token (Bankr / Clanker ecosystem tokens), not event markets. Pool is USDC. Winners split the losers' pool pro rata after fees (README: "Winners split the losers' pool").
- H: Outcomes are not tokenised. A bet is a contract-internal position (`0 = UP`, `1 = DOWN`) held per user per round in the `BankrBetsPrediction` contract. No ERC-20/1155 share, so no secondary market and no order book.
- H: Round timing per README: 300 s bet window, then price locked, then 600 s lock-to-close observation, about 15 min end to end. The homepage text says "5-minute rounds". The round does not start until the first bet is placed.
- H: Resolution rule: close price vs lock price, both read from the linked Uniswap V4 pool `PoolManager.getSlot0()`.
- Conflict, H/H: README says tie mode is MajorityWins (side with more USDC wins). The live site FAQ says the current Base deployment uses Refund mode (flat price cancels the round and refunds everyone, no fees). The site is newer and describes the deployment, so trust it, but verify on-chain.
- Market creation: anyone can register a token with a valid initialized V4 pool; the first bet starts round 1.

## Chains and collateral

- H: Base mainnet only. USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals) is the bet token.
- H: Prediction contracts (public on-chain addresses, not user wallets): v1 `0xABADeb002247f2bd908Eeedb32918aEc304A0233`, v2 `0x2CD785Ba87e0841A8458141bc43d23a56a00557f` (seen in the markets API). Oracle/registry `0x57B83E00038CE7E890C003Fb3794fE6297596b60`. V4 PoolManager `0x498581fF718922c3f8e6A244956aF099B2652b2b`.
- Round limits (README, H): min bet 1 USDC, max 1,000 USDC per user, max round pool 10,000 USDC.

## Read API

- Official-ish but undocumented. No docs page, no OpenAPI, no `llms.txt` (`/docs`, `/api/markets`, `/api/rounds`, `/llms.txt`, `/skill.md` all returned the SPA HTML shell, H).
- H: `GET https://agenticbets.dev/api/bankr/markets` returns JSON with no auth. This endpoint is the one the npm MCP README names ("Fetches live data from agenticbets.dev/api/bankr/markets"). Shape: `{markets:[{token, symbol, marketUrl, poolUsdc, bullPct, bearPct, lockTimestamp, secondsToLock, predictionContract, status, epoch, poolAddress, creator, createdAt, contractVersion}], count, updatedAt}`. Observed status values: `cancelled`, `not_started`. Fixture: `docs/research/fixtures/agenticbets/api-bankr-markets.json` (8 KB). Note `marketUrl` points at a Vercel preview hostname (agentic-bets-nextjs-...vercel.app), a sloppy detail, treat as untrusted.
- Rate limits, websocket: NOT FOUND (searched: homepage, repo README, npm README, path probes).
- Round history, trades, prices: not exposed by a documented REST route. The repo has a Ponder v0.9 indexer (user stats, bets, rounds; GraphQL via the MCP's `graphql` dependency) but its public URL was NOT FOUND. On-chain reads of the contracts via any Base RPC are the authoritative alternative.
- No order book or price feed: odds are just `bullPct`/`bearPct` of the pool.

## Trade path

- H: On-chain only. `bet()` or `betWithAuthorization()` (EIP-3009 USDC authorisation) with side and USDC amount; `claim(...)` for winnings; `lockRound`/`closeRound` permissionless (settler earns 0.1%).
- H: Official npm MCP `agenticbets-mcp` exposes `list_markets`, `get_market`, `get_odds`, `get_wallet`, `place_bet`, `claim_winnings`, `check_claimable`; betting needs Coinbase CDP AgentKit wallet credentials. Read tools need no config. (Not installed or run.)
- PayBox reachability: yes in principle. Any EVM wallet on Base holding USDC could send a contract-call transaction proposal (USDC approve + `bet`) or sign an EIP-3009 authorisation. M, nothing tested; no PayBox tools were called.
- Practical problems: round starts only on first bet; 5-minute bet windows are shorter than a human-approval signing loop; bets are not cancellable or exit-able before settlement (parimutuel), so no hedge-and-unwind arbitrage.

## Fees

- H (README): 1.5% treasury + 0.5% market creator (perpetual, per round pool) + 0.1% settler reward. Presumably deducted from the pool (README does not state who pays; M). No fees on cancelled/tied rounds (site FAQ, H).

## Resolution and dispute risk

- H: Fully on-chain from the V4 pool spot `slot0` price. No off-chain oracle, no dispute process. Site admits thin pools finish flat often and "safety checks can cancel rounds" on extreme moves.
- Risk, M: spot-price manipulation on thin Clanker pools (flash trade around lock/close); contracts self-described as audited "using open-source AI tools only"; admin/treasury powers unreviewed (no audit read).

## Geo / ToS / automation

- NOT FOUND (searched: homepage, FAQ, README). No ToS or geo-block text. Disclaimer "Use at your own risk". Automation is explicitly welcomed (MCP server, permissionless keepers).

## Liquidity

- H: Sum of `poolUsdc` over all 12 markets in the API on 2026-10-19 = 20 USDC; 7 cancelled, 5 never started. The homepage stat tiles (Total Volume, Bets, Players) render as "--" client-side and were not obtainable without JS (NOT FOUND).
- Contract caps (10k USDC pool) show the intended scale; actual is tiny.

## Overlap with other venues

- None for event markets. Underlying is Base micro-cap token prices (CLAWD, MOLT, MACHINES, AGBETS, etc.). No sports, politics, macro, or major-crypto (BTC/ETH) markets. Not matchable to Polymarket/Kalshi/XO. Liquidity is independent (own parimutuel pool) but the underlying price comes from Uniswap V4, so the only "edge" would be a spot-pool vs pool-price latency play, not cross-venue arbitrage.

## Adapter priority: skip

Dormant since about May 2026, ~20 USDC lifetime-visible pools, 15-minute token-price rounds, no event overlap, undocumented API. If ever included for completeness, a P2 read-only adapter on `/api/bankr/markets` would suffice, but there is no signal value for Quotient.

## Suspicious content

- None found in fetched pages/READMEs. Repo contains AGENTS.md/CLAUDE.md/.mcp.json files (standard Scaffold-ETH agent guidance for contributors), ignored as untrusted data.

## Not found

- API docs, rate limits, websocket, Ponder public URL, ToS/geo rules, third-party volume stats (DefiLlama/Dune - search budget exhausted), on-chain contract source verification (not checked).

## Sources

- https://agenticbets.dev (H, fetched 2026-10-19)
- https://agenticbets.dev/api/bankr/markets (H, 2026-10-19)
- https://github.com/viraj124/bankr-bets (README, commits; H)
- https://registry.npmjs.org/agenticbets-mcp (H)
