# Goaly (goaly.fun) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Adapter priority: **skip** (signal-only at best). Goaly is a "no-loss" yield-lottery, not a market. There is no tradable price, no order book, no exit before settlement, and the "payout" is a share of Morpho yield, not a $1 binary payoff. It cannot be an arbitrage leg. Its only possible use is to read bookmaker-style 1X2 odds it republishes, which are already available upstream. The API host returned 502 today and the repos have been untouched since 2026-07-08.

## Liveness (2026)
- goaly.fun landing: HTTP 200 on 2026-10-19 [H]. app.goaly.fun: 307 to /play (cached ~103 days) [H]. docs.goaly.fun: 200 [H].
- **api.goaly.fun: HTTP 502 Bad Gateway (nginx/1.18.0) on /, /docs, /matches, /health, /agent, /standings, /openapi.json, repeated twice on 2026-10-19** [H]. Backend is down (DNS resolves to a single IP; origin dead).
- Contracts "deployed + Arbiscan-verified" on Arbitrum One (mainnet, chainId 42161) per docs/DEPLOYMENTS.md [H]. Arbiscan page itself returned 403 to WebFetch, so on-chain state, tx count and TVL are NOT verified by me. No Blockscout/RPC read done (JSON-RPC is POST; out of bounds for this task).
- Repo activity: goaly monorepo last push 2026-07-08, contracts 2026-07-05, docs 2026-07-05; 0 stars, 0 open issues [H]. Built for the "Tether Developers Cup - WDK (Wallets) track" (README) [H]: a hackathon project. No activity for 3+ months.
- Docs and OpenAPI are scoped to **FIFA World Cup 2026** group tables/bracket ("/standings: FIFA World Cup 2026 group tables") [H]. The World Cup final was July 2026, so the product's only evident fixture source is over. [M] inference: no live matches to stake on now.
- WebSearch for independent coverage/usage was not possible (search budget exhausted); no third-party evidence of users or volume. NOT FOUND (searched: goaly.fun, docs repo, goaly repo, contracts repo, api host).

## Kind and market model
- Kind: on-chain, no-loss prediction pool (prize-linked-savings style). [H]
- Markets: football match 1X2 (`WINNER`: HOME/DRAW/AWAY) and an `EXACT_SCORE` pick in the off-chain API schema; the on-chain contract has `Outcome` enum used by `predict(bytes32 marketId, Outcome outcome, uint256 amount)` [H: docs/contracts.mdx, openapi.ts]. marketId = keccak256(matchId) (not reversible; API `/matches/all` provides mapping) [H].
- Mechanism: parimutuel-like. Stakes pooled in an ERC-4626 vault (GoalyVault) lending into Morpho vaults. Everyone gets principal back 1:1 on `claim`; winners split a prize = harvested yield + an "odds boost" paid from a reserve: `boost = winningStake * (oddsBps - 10000) * boostBps / 1e8`, capped by reserve; prize net of protocol fee [H: GoalyMarkets.sol].
- Outcome tokenisation: **none**. A position is a mapping entry (`stakeOf(marketId,user)`), not a transferable token. No secondary market, no sell/cancel before settlement documented [M: no such function seen in the function list I grepped; I did not read the full source].
- Price: none. API exposes bookmaker h2h decimal odds (`odds.home/draw/away`, closing odds in bps x10000) sourced from an external feed (odds.goaly.fun / The Odds API) [H]. These are reference odds, not Goaly-traded prices.

## Chains and collateral
- Arbitrum One only (chainId 42161) [H]. Landing page shows logos for Ethereum/Base/Optimism/Polygon but docs say only Arbitrum; WDK "any chain settles to Arbitrum" is a roadmap item (Phase 4 marked pending) [H: ARCHITECTURE.md].
- Collateral: USD-T0 `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` (Tether omnichain USDT on Arbitrum), shown as "USDT" in UI [H]. Yield may be earned in USDT0 or USDC internally.
- Key addresses (all H, from DEPLOYMENTS.md): GoalyMarkets proxy `0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3`; GoalyVault `0xFe424b5b85C742C15CCB09d62873bE72577CD7Ef`; GoalySettlement `0xC03BB9526D6F0308d8Ba0831e85f93db3E45e201`; MorphoStrategy `0x6951adCCd2106Bf364D62A1CC328070FC49609eA`; MorphoSwapStrategy `0xD12c112DA7D19266c5cBB9A9bde4Ee9e77D5393D`; ReserveManager `0xCe34457F70733191126726c1D1EeEb52Bcd20051`.
- Note: .env.example references a different vault address (goUSDT `0xC5C51C...`) for the API `/positions` - suggests a prior deployment/predecessor; ARCHITECTURE.md mentions a "predecessor" with a USDC cross-asset design [M].

## Read API
- Official, public, unauthenticated for reads (per OpenAPI) but **currently down (502)** [H].
- Docs: https://docs.goaly.fun/api (source docs repo api.mdx), OpenAPI 3.1 v0.3.0 at `https://api.goaly.fun/openapi.json`, Scalar UI at `/docs` (both unreachable today). Spec source: apps/api/src/openapi.ts in Goaly-Protocol/goaly [H].
- Base: `https://api.goaly.fun`.
- Read endpoints [H, from openapi.ts]: `GET /health`, `/matches` (bettable matches with odds + team meta), `/matches/all`, `/matches/{id}`, `/predictions?user=` (a wallet's predictions), `/leaderboard`, `/markets` (on-chain markets from Ponder indexer: id, status OPEN|SETTLED, closeTime, result 0/1/2, winningStake, prize), `/claims`, `/standings`, `/bracket`, `/agent` (yield agent status: Morpho vault APYs/TVL, rebalance decision), `/notifications/*`. Write/admin (not to be used): `POST /predictions`, `/terms/accept`, `/faucet/gas`, `/agent/run`, `/agent/rebalance`, `/admin/*`.
- Auth/rate limits: NOT FOUND (searched: openapi.ts head, api.mdx, README). CORS limited to goaly.fun/app.goaly.fun origins (.env.example) [H], so server-side scraping only.
- Websocket: NOT FOUND. Odds refresh min 6h per .env.example (ODDS_REFRESH_INTERVAL_MS=21600000), fetch only within 1h of kickoff [H]; i.e. odds are stale by design.
- On-chain alternative: events `MarketCreated`, `Predicted`, `MarketSettled`, `Claimed`, `YieldHarvested` on GoalyMarkets; views `markets(bytes32)`, `stakeOf`, `prizeOf`, `totalStaked`, `reserve`, `isSolvent` [H].
- Fixtures: none saved (no successful API response possible; 502 only). Nothing in docs/research/fixtures/goaly/.

## Trade path
- Programmatic on-chain: `USD-T0.approve(GoalyMarkets, amount)` then `GoalyMarkets.predict(marketId, outcome, amount)` before `closeTime`; later `claim(marketId)` [H]. No signed-order/offchain book. Terms say app may ask for an EIP-712 acceptance signature (API `/terms/accept` is optional-looking, enforcement unknown) [M].
- Only the ORACLE (API operator) creates markets; users cannot create markets [H].
- Reachable via PayBox? **partial**: any EVM wallet on Arbitrum could submit approve+predict calldata as transaction proposals, if PayBox supports arbitrary contract calls on Arbitrum (not verified here; not checked against PayBox docs). Moot: there is no price/edge to trade and no live fixtures.

## Fees
- Protocol fee on **prize only**, never principal: `prizeOf = gross - gross*feeBps/10000` [H]. DEPLOYMENTS.md configuration: protocol fee 2.5%, odds boost 50%, liquidity buffer 15% [H]. A later API commit (2026-07-08) changed default `PROTOCOL_FEE_BPS` 250 to 1000 (10% of yield) for the API-side model; which value is live on-chain is NOT VERIFIED (conflict) [H/M].
- No trading/withdrawal fee documented. Gas in ETH on Arbitrum paid by user (faucet for embedded accounts). Yield risk is borne by stakers.

## Resolution
- GoalySettlement: optimistic oracle; result proposed with a 10 USDT0 bond, 2h dispute window, escalation to governance if disputed [H]. Fallback: API self-settles scoreless finished matches to the closing-odds favourite after SETTLE_FALLBACK_HOURS (principal returned regardless) [H: commit 2026-07-08].
- Deployed roles (demo): governance/oracle/agent/guardian all one single key `0x3b4f01...` per DEPLOYMENTS.md ("demo, single-key") [H]. Docs claim Timelock + Safe for admin, which contradicts. UUPS upgradeable. Centralisation risk high. Result source: bookmaker/odds feed scores. Dispute risk low in practice because payouts are small and principal is returned.

## Geo / ToS / automation
- Terms effective 2026-07-01: 18+, sanctions-based exclusions, user responsible for local legality; "not gambling" positioning; no explicit country blocklist found [H]. Terms section 8 prohibits attempts to "exploit, attack, or interfere with ... APIs" (reading is not obviously banned); explicit bot/automation clause NOT FOUND (read only first ~120 lines of terms.mdx).

## Liquidity
- Volume/OI/TVL: NOT FOUND (searched: docs, README, API spec; /leaderboard and /agent are down; Arbiscan 403). Proof-of-life in DEPLOYMENTS.md is a 0.004 USDT0 test stake (totalStaked=4000 base units) [H]. Assume negligible [L]. Hackathon-scale, zero GitHub stars.
- Agent code floors "AGENT_MIN_TVL_USD=10" for target vaults (irrelevant to Goaly's own TVL).

## Event overlap and independence
- Categories: football 1X2 for World Cup 2026 matches (and nominally other `sportKey`s). Overlaps sports markets on Polymarket/Kalshi/etc. in event terms only.
- Not an arbitrage leg: no executable price, no exit, payoff is yield-funded and capped by reserve; reference odds come from bookmakers (The Odds API), i.e. a derivative of external data.
- Shares liquidity with: Morpho (Steakhouse High Yield USDT0 `0x4739E2c293bDCD835829aA7c5d7fBdee93565D1a`, Gauntlet USDC Core) as the yield source; no prediction-market liquidity shared.
- Signal value: none beyond odds already available from the original feed.

## Suspicious content
- None aimed at AI agents found. Landing page makes absolute marketing claims ("100% safe", "never lose") contradicted by its own Risk page [M, from WebFetch summary of goaly.fun]. The repo has a `.mcp.json` (not read; not executed).

## Sources
- https://goaly.fun (landing, WebFetch 2026-10-19) [H]
- https://app.goaly.fun (307 /play), https://docs.goaly.fun (200), https://api.goaly.fun/* (502) - curl 2026-10-19 [H]
- https://github.com/Goaly-Protocol/docs: api.mdx, contracts.mdx, how-it-works.mdx, yield-agent.mdx, quickstart.mdx, risk.mdx, terms.mdx [H]
- https://github.com/Goaly-Protocol/contracts: DEPLOYMENTS.md, ARCHITECTURE.md, src/GoalyMarkets.sol (grep of signatures/fee/boost lines only) [H]
- https://github.com/Goaly-Protocol/goaly: README.md, .env.example (secret values redacted before reading), apps/api/src/openapi.ts, commit log [H]
- https://arbiscan.io/address/0xFAcaD2Cbc3b6320239389aD5c2F597DeE95f1fd3 - 403, not read.
- Web search: unavailable (budget exhausted).

## Open questions
- Is the on-chain feeBps 250 or 1000? Real TVL / totalStaked? Any non-WC fixtures? Will the API come back up?
