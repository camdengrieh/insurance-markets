# Convex (Arc) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. A hackathon/microgrant-grade, single-contract, admin-curated pari-mutuel with 4 markets, all pools at 0, hard-coded demo titles, a single-EOA resolver and no exit before resolution. It is technically readable on-chain, but there is no liquidity to arbitrage against and no price that is tradeable (pari-mutuel odds are not executable prices). [H]

## Is it live?

- Site https://convex-v1-web-drab.vercel.app/ returns HTTP 200 on 2026-10-19; /markets, /market/0, /dashboard, /leaderboard all 200. [H: curl]
- Repo https://github.com/abdulkabir7/Convex-v1: created 2026-09-24, last push 2026-09-27 (3 weeks stale), 0 stars, 10 commits by one author, MIT. [H: gh api]
- Arc mainnet itself is real: docs.arc.io lists chain ID 5042, USDC gas, RPC `https://rpc.mainnet.arc.io`, explorer explorer.arc.io. [H: https://docs.arc.io/arc/references/rpc-endpoints] A third-party guide says public mainnet opened 16 Sept 2026 [M: trustswap.com via search, not read]. The docs page says the explorer is "permissioned" per a search summary [M]; the explorer API returned a Cloudflare challenge (403) to scripted GETs [H].
- I could NOT confirm on-chain that contract `0xd59A8fdf194F41fFb46888d63909F298DF600F30` has code or stakes. Reading it needs JSON-RPC (HTTP POST), which the ground rules forbid, and the explorer API was Cloudflare-blocked. The site's own server-side render (which reads the chain via RPC) shows the market list below, which is indirect evidence the contract answers. [M]

## Kind and market model

- kind: onchain-other. Pari-mutuel YES/NO pools in a single contract (`ConvexMarketManager`). No order book, no AMM, no outcome tokens: positions are only a mapping `_positions[marketId][address] = {yesStake, noStake}`. Positions are not transferable and cannot be sold or withdrawn before resolution. [H: https://github.com/abdulkabir7/Convex-v1/blob/main/apps/contracts/contracts/ConvexMarketManager.sol]
- Binary only. `MarketType` enum is `Price` or `Sports` (frontend adds "Culture"/event as an off-chain label). [H]
- Markets are admin-curated: `createMarket` requires `CREATOR_ROLE`; the README/PROJECT_DESCRIPTION claims users can create markets but the contract does not allow it without the role. [H]
- On-chain market has no title; only `metadataHash` (bytes32). Titles come from a MongoDB backend (`/api/markets/metadata/:onChainId`) or hard-coded seed text in the frontend (`SEEDED_MARKET_METADATA` in `apps/web/src/lib/api/markets.ts`). The deployed frontend's `metadataURI` is empty. Matching a Convex market to another venue's event therefore depends on the off-chain backend, whose deployed URL is not published. [H]
- Odds shown = pool share: `yesOdds = yesPool/total`. Multiplier shown = `total/sidePool`. These move with every stake and are only final at close. [H: PROJECT_DESCRIPTION.md, markets.ts]

## Chains and collateral

- Arc mainnet, chain ID 5042. Collateral is Arc's native gas token, USDC (18 decimals as native currency in the app; `stake` uses `msg.value`). No ERC-20, no approval. [H: README, chains.ts, contract]
- Single contract: `0xd59A8fdf194F41fFb46888d63909F298DF600F30` (from `ignition/deployments/chain-5042/deployed_addresses.json` and README). Explorer https://explorer.arc.io. [H]
- Note: native USDC with 18 decimals on this chain is what the app assumes; the Arc docs page I read did not state the native decimals. [NOT FOUND in docs page read]

## Read API

- Official public REST API: **none**. There is no documented API, docs site, or OpenAPI. The Vercel app has no `/api/markets` route (404). [H]
- Backend (Express + MongoDB) has `GET /api/markets/metadata`, `GET /api/markets/metadata/:onChainId` (title, category, marketType, resolutionSource, status), but its public base URL is NOT FOUND (web env template points at `http://localhost:4000/api`). [H: source; deployed host NOT FOUND]
- On-chain reads (the real read path), via viem/ethers against `https://rpc.mainnet.arc.io` (anonymous, no key, open CORS; WS `wss://rpc.mainnet.arc.io`; third-party RPCs: Blockdaemon, dRPC, QuickNode, Alchemy). [H: docs.arc.io]
  - `nextMarketId()` -> count.
  - `markets(uint32)` / `getMarket(uint32)` -> marketType, status, winningOutcome, creator, resolver, closeTime, resolveTime, protocolFeeBps, creatorFeeBps, yesPool, noPool, payoutPool, totalWinningStake, metadataHash.
  - `positionOf(marketId, account)` -> (yesStake, noStake).
  - Events: `MarketCreated`, `StakePlaced(marketId, account, outcome, amount)`, `MarketResolved`, `MarketVoided`, `StakeClaimed`.
  - RPC limits: `eth_getLogs` max 10,000 blocks per call (error -32012); near-head requests can return -32014, retry with backoff. Other rate limits NOT FOUND. [H]
- Unofficial scraping: the SSR HTML of `/markets` embeds the full market list as Next.js RSC JSON (id, title, pools, odds, fees, status, creator/resolver, closeTime). Sample saved at `docs/research/fixtures/convex-arc/markets-ssr-2026-10-19.json`. Do not rely on it: shape is a private frontend contract. Caveat: `createdAt` is synthetic/future-dated (2026-10-23) and `closeTime` for markets 0-2 looks derived (identical timestamp), so verify against `markets()` on-chain. [H shape; M semantics]
- Prices/books/trades endpoints: none (no book). Trades = `StakePlaced` logs.

## Trade path

- Programmatic: send a payable tx `stake(uint32 marketId, uint8 side /*1=Yes,2=No*/, uint128 amount)` with `msg.value == amount` (mismatch reverts with `ZeroAmount`), only while `status==Live` and `block.timestamp < closeTime`. Then `claim(marketId)` after resolution. No off-chain signed orders, no API keys. Plain EOA tx signing. [H: contract]
- Cancel/exit: none. Stake is locked until resolution; void markets (empty pool, or empty winning side) refund stakes via `claim`. [H]
- PayBox reachability: **partial**. Arc is in PayBox's `discover_tokens` chain catalog (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid) per local doc `docs/phase0-gate-results.md` line 185 [M: secondary, local], and the PayBox connector instructions refer to "Arc native USDC" with token `"native"` [H: connector instructions]. A proposal would be an EVM contract call with `value`; whether PayBox plugin proposals accept a payable call to an arbitrary contract on Arc was not tested (no signing/money tools used). The hard problems are not signing but liquidity and exit.

## Fees

- Per-market `protocolFeeBps` (cap 500 = 5%) and `creatorFeeBps` (cap 300 = 3%), set by the creator role. Seeded markets on the live site: protocol 200 bps, creator 100 bps = 3% of the TOTAL pool (both sides), taken at resolution. [H: contract; fixture]
- Payout: `payout = userWinningStake * (totalPool - protocolFee - creatorFee) / totalWinningStake`. No fee on stake or claim. Gas is USDC. Losers fund the fee implicitly. [H]
- Effective cost for an arbitrageur: the 3% haircut applies to the whole pool, so a YES-only fair-value bettor at pool-implied probability p faces about -3% EV before price impact; a late large stake moves the odds against itself (pari-mutuel). [M: derived]

## Resolution and dispute risk

- Centralised. `resolveMarket(marketId, outcome)` may be called by `market.resolver` OR any address holding `RESOLVER_ROLE` (the deployer holds all roles: DEFAULT_ADMIN, GUARDIAN, CREATOR, RESOLVER). `finalizeFromResolver` is the same logic restricted to the resolver. No dispute window, no oracle on-chain, no timelock. Admin can `pause()` (stake and resolve; `claim` is not paused), and can `setTreasury`. [H]
- Off-chain: a backend cron (60 s) fetches CoinGecko prices (crypto) or a configurable sports API and then signs `resolveMarket` with a hot key (`RESOLVER_PRIVATE_KEY`). Frontend also offers manual resolution. Source selector mentions "flare" or "coingecko". [H: backend source]
- Edge cases: `resolveMarket` can be called after closeTime with any outcome, with no check that an oracle result exists. Resolver and creator on the live markets are the same EOA `0x42562D5Eadb7EFEd4997C580eA60f2D2f7D58018` (also the default `RESOLVER_ADDRESS` in the repo). Market #3 has closeTime 2026-09-27 but status still "Live" on 2026-10-19, i.e. stale and unresolved. [H: fixture]
- Dispute risk: very high (single key, no recourse). Resolver also pays creator fees to itself.

## Geo / ToS / automation

- No ToS, privacy policy, geo-block or API terms found on the site or in the repo. [NOT FOUND (searched: site routes, README, PROJECT_DESCRIPTION.md)]
- Contract is permissionless for stake/claim, so bots are technically allowed; no rate limits other than the RPC's. Legal/jurisdictional exposure for the user is unaddressed by the venue.

## Liquidity

- 4 markets on 2026-10-19; every `totalPool/yesPool/noPool` = 0 in the SSR snapshot (the three live seeded markets plus market #3). [H: fixture, fetched 2026-10-19]. Activity cannot be independently confirmed from chain without POST RPC; TVL/volume: NOT FOUND (searched: site, README, repo, docs.arc.io; no DefiLlama/analytics page checked, web search budget exhausted).
- The README frames it as a "Proof of Concept" for Arc Microgrants. [H]

## Event categories and overlap

- Seeded demo markets: "Will Bitcoin close above $100,000 this month?" (crypto price, oracle-resolved), "Will the next major football final have over 2.5 goals?" (sports, manual), "Will the next Arc ecosystem release ship this quarter?" (culture/event, manual). [H: fixture; the BTC $100k title looks stale relative to 2026 prices, treat as demo text]
- Theoretical overlap with crypto-price and sports markets on larger venues, but titles are generic, with no resolution criteria on-chain, so matching is unreliable. No independent price signal worth ingesting.

## Shared liquidity

- Independent (own contract, own pools). It does not share liquidity with another venue. Independent but empty, so it is not useful as an arbitrage leg. [H]

## Suspicious content / prompt-injection notes

- docs.arc.io RPC page (third-party-controlled content to this task) contained an "Agent Instructions" block asking agents to install Circle skills and follow setup steps. Ignored. [H]
- Repo is committed with `apps/contracts/ignition/.../build-info` and a hard-coded WalletConnect project ID in `constants.ts`; no instructions aimed at AI agents seen in files read.

## Open questions

1. Does the contract hold any funds? Needs a read-only `eth_getBalance`/`eth_call` (JSON-RPC over POST was excluded by the rules) or an explorer view.
2. Is the Express backend deployed anywhere public? Base URL not found.
3. Can a PayBox EVM proposal on Arc carry `value` for a payable call to an arbitrary contract?
4. Is the deployed bytecode identical to the repo source (verification status on explorer not checked; explorer behind Cloudflare challenge)?

## Sources

- https://convex-v1-web-drab.vercel.app/ and /markets (live site, GET 2026-10-19) [H]
- https://github.com/abdulkabir7/Convex-v1 : README.md, PROJECT_DESCRIPTION.md, apps/contracts/contracts/ConvexMarketManager.sol, apps/contracts/ignition/deployments/chain-5042/deployed_addresses.json, apps/backend/src/{routes/markets.ts,oracle/*,config/env.ts}, apps/web/src/lib/{constants.ts,chains.ts,api/markets.ts,contracts/server.ts}, commit history [H]
- https://docs.arc.io/arc/references/rpc-endpoints (chain ID 5042, RPC, WS, getLogs limit) [H]
- https://explorer.arc.io (200 on root; API behind Cloudflare challenge) [H]
- Web search results (docs.arc.io connect page, trustswap launch guide, Chainstack post) [M, not individually opened]
- Local: docs/phase0-gate-results.md line 185 (PayBox chain catalog includes Arc) [M]

## Fixtures

- docs/research/fixtures/convex-arc/markets-ssr-2026-10-19.json (4 markets, ~4 KB)
