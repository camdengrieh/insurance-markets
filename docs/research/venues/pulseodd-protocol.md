# Pulseodd Protocol - venue spec (2026-10-19)

Verdict: **skip**. Testnet-only, valueless tUSDC, no API, no deployed mainnet contracts found, UP/DOWN pool (not a binary event market), unaudited, resolved by a single operator-run oracle relayer.

Confidence tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Liveness
- Repo pulseodd/pulseodd-protocol: created/last pushed 2026-09-30 (single burst of commits 02:24-06:00 UTC that day), 0 stars, 0 issues, 0 releases, no commits after 2026-09-30. [H] (gh api repos/pulseodd/pulseodd-protocol, /commits)
- Site https://pulseodd.vercel.app and https://pulseodd.com both 307 to /classic and return 200. [H]
- The live /classic page says: "The current release runs in a testnet environment and uses tUSDC, a deliberately valueless test credit." [H] (https://pulseodd.com/classic)
- /docs page: mainnet "being prepared" for 2026-10-08, "the current launch plan, not a guarantee"; no market/pool contract addresses listed. [H] (https://pulseodd.com/docs)
- README still says "planned mainnet launch on 8 October 2026" (11 days past as of today) and no later confirmation found. WebSearch (extended) found no independent coverage of Pulseodd. [M]
- .env.example ships chain 46630 (Robinhood Chain testnet), `NEXT_PUBLIC_DEMO=1`, empty PREDICT_CONTRACT. Web config defaults to demo mode unless `NEXT_PUBLIC_DEMO=0`. [H]
- Robinhood Chain mainnet itself launched 2026-07-01 (chain id 4663, Arbitrum Orbit L2). [M] (CoinDesk, Robinhood newsroom via search results)
- Conclusion: the venue is a prototype/token-promotion project, not a live value-bearing market. Not confirmed live in the sense that matters.

## Kind and market model
- Kind: on-chain pooled "UP/DOWN" short-horizon price rounds (60 s and 5 min on BTC per keeper docs; SDK lists BTC, ETH, SOL, BNB, XRP, NVDA, TSLA, SPY, GOLD asset keys). [H] (README, packages/sdk/src/index.ts)
- Model: parimutuel pool per round. Two sides (Up/Down) of a pooled stake; winners split the pot pro rata. No order book, no AMM, no outcome tokens - positions are a per-wallet mapping in the contract (`bets[roundId][user]`), not tradable tokens. Ties refund. [H] (PredictClassic.sol)
- Not a categorical/scalar event market; no market creation by users; rounds are auto-created by a keeper. [H]

## Chains and collateral
- Robinhood Chain (testnet 46630 in config; mainnet 4663 planned). Gas in ETH. [H]
- Collateral: constructor-immutable `token`; zero address = native ETH, else an ERC20. Testnet uses a `MockERC20` "Pulseodd Test USD (tUSDC)" with a one-time `claimFaucet()` of 1,000 tUSDC (valueless). Mainnet collateral NOT FOUND (spec.md: "The public Pulseodd token CA is not automatically the collateral token"). [H]
- Project token $PODD 0x3E5300c0664Ae607bF0A9A2D84A4aAD6bEbbfB98, sold via "ponsfamily" launchpad. This is the project's own token, not collateral. [H] (repo config, README)

## Read API
- Official API: **none**. /api, /api/markets, /robots.txt, /sitemap.xml, /llms.txt all 404; docs mention none. [H]
- On-chain only: `getCurrentRound(asset, timeframe)`, `rounds(id)` (upAmount, downAmount, startPrice, endPrice, status, winner), `getUserBet`, `getBettors`, `getMultiplier`, `claimable`; events BetPlaced, RoundCreated, RoundLocked, RoundSettled, Claimed. [H] (PredictClassic.sol)
- Base URLs: RPC https://rpc.testnet.chain.robinhood.com (testnet; from the repo's config), mainnet https://rpc.mainnet.chain.robinhood.com (stated in README, repo-sourced, unverified). No deployed PredictClassic address published anywhere I found. [H for the statement, address NOT FOUND]
- Docs URL: https://pulseodd.com/docs (marketing/architecture only).
- Websocket: NONE. Auth/rate limits: n/a.
- Fixtures: none saved (no public read API; did not POST JSON-RPC per read-only/no-POST rule).

## Trade path
- Contract call only: `placeBet(roundId, side, amount)` (payable if native), `claim(roundId)`, `emergencyRefund` when paused. No signed-order scheme, no relayer API. [H]
- A PayBox EVM wallet could in principle send a transaction on Robinhood Chain, but only if PayBox supports that chain (NOT FOUND whether it does; it is not in the usual Base/Ethereum/BNB/Arbitrum/Polygon/Solana list). paybox_reachable = no (no mainnet deployment, valueless test token, unsupported chain likely). [M]

## Fees
- Code: `feeBps = 500` (5% of the winning-side stake pool) paid to treasury at settlement; claim uses the current global fee, so the owner can change payouts after settlement. [H] (economic-model.md, PredictClassic.sol)
- Planned mainnet: 1% of the settled pool, 80% buyback / 20% treasury; docs state these are plan, not implemented. Proposed 0.1% early-exit fee does not exist. [H]
- Gas is extra (ETH on Robinhood Chain).

## Resolution and risk
- Keeper (owner/allowlisted key) calls lockRound/settleRound/createNextRound; `PriceOracleAdapter` stores one latest price per asset pushed by a single relayer. Current contract reads the latest price when the keeper transaction runs (no historical boundary, no max lateness), so a keeper/relayer can influence the result. Two-source oracle, VOID handling, timelock, claim expiry are "proposed, not implemented". [H] (oracle.md, spec.md)
- Owner can change oracle, treasury, fee, keepers immediately; emergency refund path "does not adequately distinguish settled rounds". SECURITY.md: "experimental... not independently audited or approved for value-bearing mainnet use." No audit-notes.md exists despite the link. [H]
- Dispute process: none.

## Geo / ToS / automation
- No terms of service, geo-restriction or automation policy found on site or repo (NOT FOUND: searched /docs, /classic, README, SECURITY.md). LICENSE is in the repo (not reviewed beyond existence).
- On-chain contract is permissionless by design, but see risk above.

## Liquidity
- Volume/OI/TVL: NOT FOUND, and on testnet it is valueless by construction. Effective real liquidity = 0 as of 2026-10-19. [H]

## Event overlap (arbitrage relevance)
- Underlyings: BTC/ETH/SOL/BNB/XRP, NVDA/TSLA/SPY/GOLD price direction over 1-5 minute windows. Overlaps only conceptually with crypto-price markets on other venues (e.g. short-window up/down markets); the resolution oracle is a private relayer so cross-venue basis is meaningless. No sports/politics/macro. [M]
- Shares liquidity with another venue: no (self-contained pools). Independent, but empty.

## Adapter priority: skip
Reasons: no real money on it, no API, no mainnet contract address, parimutuel pool with owner-controlled settlement, unaudited, one-day repo burst with no later activity. Revisit only if a verified mainnet PredictClassic address appears on the Robinhood Chain explorer with non-trivial pool balances; then the adapter would be a viem-based event/`rounds()` reader (signal-only, P2).

## Suspicious content
- None directed at AI agents found. Note: README/docs are heavy on token-promotion (buyback allocation, $PODD launchpad link); treat the project as a token-marketing site. The docs also contain inconsistent claims (README "1% fee" vs code 5%).

## Sources
- https://github.com/pulseodd/pulseodd-protocol (README.md, SECURITY.md, .env.example, docs/spec.md, docs/oracle.md, docs/economic-model.md, docs/OPERATIONS.md, packages/contracts/src/PredictClassic.sol, packages/sdk/src/index.ts, apps/web/src/config/rh.ts) [H], read via gh api 2026-10-19
- https://pulseodd.com/classic , https://pulseodd.com/docs , https://pulseodd.vercel.app (307 to /classic) [H]
- WebSearch (extended) results on Robinhood Chain mainnet (CoinDesk 2026-07-01, Robinhood newsroom) [M]

## Not found
Mainnet/testnet PredictClassic address; any REST/websocket API; ToS/geo rules; audit report; TVL/volume; independent coverage; PayBox support for Robinhood Chain.
