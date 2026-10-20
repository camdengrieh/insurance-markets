# Presage (Arc, weather) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. A one-developer prototype on Arc mainnet: a parimutuel (pool) weather market, manually created and settled by a single EOA owner, with roughly 1 USDC of lifetime volume visible in the repo's own ops log, no market API, and no overlap with any other venue's event categories. At most a signal/curiosity for parametric-weather ideas.

## Is it live (2026)?

- Site https://presage-arc.vercel.app returns HTTP 200, serves a Vite SPA titled "Presage" (checked 2026-10-19). [H] https://presage-arc.vercel.app
- Repo pplmaverick/presage: created 2026-05-12, last push 2026-10-12, not archived, 0 stars, 0 open issues. [H] https://github.com/pplmaverick/presage
- Arc mainnet deployment recorded 2026-09-17 (chain ID 5042). Markets #3 (Taipei) and #4 (Tokyo) were created 2026-10-12, lock 2026-10-26 05:00 UTC, settlement deadline 2026-11-09 05:00 UTC. [H] deployments/arc-mainnet.json (fixture)
- README states "Markets are operated manually by the contract owner ... There is no automated settlement bot running today." [H] README.md
- NOT VERIFIED on-chain: I did not query Arc RPC (JSON-RPC is HTTP POST, which the ground rules exclude) and explorer.arc.io is behind a Cloudflare challenge for scripted GETs. So "contracts exist and hold state" is from the project's own deployment log, not an independent chain read.

## Kind and market model

- Kind: on-chain, single-operator, parimutuel pool markets. [H] contracts/WeatherMarket.sol
- Market = (city, targetDate, lockTime, ascending array of temperature upper bounds). `buckets=[25,28,31,34]` yields 5 ranges (<=25, 26-28, ...). Categorical, mutually exclusive buckets. [H] README.md, WeatherMarket.sol
- No order book, no AMM, no outcome tokens. A bet is a ledger entry: `bets[marketId][bucket][user]` and `bucketTotals`. Positions are not transferable and have no price until settlement. [H] WeatherMarket.sol
- Implied odds can be computed only as pool shares (`bucketTotals[b] / totalPool`, before the 2% fee). There is no bid/ask, and a bettor's final payout moves with later bets, so there is no executable price to arbitrage against. [M, inference from code]
- Cities supported by the frontend proxy: Taipei, Tokyo, Bangkok, Seoul. [H] frontend/api/weather/[city].ts. Only Taipei and Tokyo markets appear on mainnet. [H] deployments/arc-mainnet.json

## Chains and collateral

- Arc mainnet (Circle's EVM chain), chain ID 5042; Arc testnet 5042002 also maintained. [H] README.md; https://docs.arc.io/arc/references/connect-to-arc
- Collateral: USDC at 0x3600000000000000000000000000000000000000, the native gas asset exposed through an ERC-20 interface with 6 decimals (native accounting is 18 decimals; docs advise using only the ERC-20 interface for balances and transfers). [H] https://docs.arc.io/arc/references/contract-addresses.md
- Mainnet contracts: WeatherMarket 0xcac5b9d2817325e78090e3ce4b9c299c819cf953, AdminOracle 0xbdc53e50b1167ce1199bfad54a034f7ab1741051, MarketFactory 0x914c40a644493b47336de847b0404e729e06c68d. The repo warns that the mainnet WeatherMarket and AdminOracle addresses are byte-identical to a retired testnet deployment, so always check the chain ID. [H] README.md, deployments/arc-mainnet.json
- Public Arc mainnet RPC (per Arc docs): https://rpc.mainnet.arc.io, plus Alchemy, Blockdaemon, dRPC and QuickNode endpoints; WS endpoints on Alchemy, Blockdaemon, QuickNode. Rate limits not documented. Explorer: https://explorer.arc.io. [H] https://docs.arc.io/arc/references/connect-to-arc

## Read API

- Official market API: **none** (NOT FOUND; searched the repo tree, README, frontend/api, the live site root). The only server routes are `frontend/api/rpc.ts` (a read-only JSON-RPC proxy to a private Alchemy URL held in an env var, method allowlist eth_call/eth_getLogs etc., POST only) and `frontend/api/weather/[city].ts` (OpenWeather temperature relay). [H] repo files
- Practical read path = on-chain only: `WeatherMarket.getMarket(id)`, `nextMarketId()`, `bucketTotals(id, bucket)`, `bets(id, bucket, user)`, `userTotalBets`, `claimed`, `collectedFees`, `settlementDeadline(id)`, `marketLockedTimeout(id)`; events `MarketCreated`, `BetPlaced`, `MarketLocked`, `ResultSubmitted`, `WinningsClaimed`, `RefundClaimed` for trades/history. [H] WeatherMarket.sol, README.md
- No subgraph or indexer found. No websocket of its own (Arc RPC WS could stream logs). [H for absence in repo; M overall]
- Unauthenticated GET confirmed: `GET https://presage-arc.vercel.app/api/weather/taipei` returns HTTP 200 `application/json`: `{"temp":..,"humidity":..,"windspeed":..,"description":..,"city":"taipei"}` (OpenWeather current conditions, not market data; keys are server-side). Saved as fixtures. The value returned (34.44 C for Taipei in late October) is just what the relay returned and was not cross-checked. [H] docs/research/fixtures/presage-arc-weather/api-weather-taipei.json
- Fixture `deployments-arc-mainnet.json` is the repo's own ops log (deploy blocks, every create/lock/settle/refund tx with notes); it is the only list of markets and activity available without an RPC. [H]
- Not verified: live contract reads (see "Is it live").

## Trade path

- `placeBet(uint256 marketId, uint8 bucket, uint256 amount)` after an ERC-20 `approve` of USDC to WeatherMarket. Plain EVM transactions signed by the bettor; no off-chain order signing, no API keys. Requires `status==OPEN` and `block.timestamp < lockTime`; no cancel or withdraw of a bet (only `claimRefund` after a missed settlement deadline). [H] WeatherMarket.sol
- Claim: `claimWinnings(marketId)` after SETTLED; `claimRefund(marketId)` after `lockTime + lockedTimeout` if still LOCKED; `lockMarket(id)` is permissionless after lockTime. [H] README.md, WeatherMarket.sol
- Frontend uses wagmi injected wallet connector only. [H] README.md
- Selling a position or hedging is impossible, so it cannot be a leg in a two-sided arbitrage. [M, inference]

## PayBox reachability

- paybox_reachable: **partial**. Arc (including Arc native USDC as `"native"`) appears as a PayBox network in the PayBox connector's own instructions, so a PayBox wallet can plausibly hold Arc USDC. [M] PayBox MCP server instructions in this session.
- NOT VERIFIED: whether PayBox can propose an arbitrary contract call (approve + placeBet) on Arc via transaction proposals or a plugin. I did not call any PayBox tool. A raw-calldata proposal tool would be needed; transfer/swap/payment tools alone would not suffice.
- Gas is paid in USDC on Arc, so no separate gas token is needed. [H] README.md

## Fees

- Platform fee 2% of the total pool (`FEE_BPS = 200`), taken at settlement only when there is at least one winner; paid by winners implicitly through `netPool = totalPool - totalPool*200/10000`. Payout = `userBet * netPool / bucketTotals[winningBucket]` (integer floor). [H] WeatherMarket.sol lines 15, 256, 279-281
- No winner: fee waived and everyone refunded face value via `claimWinnings` (`noWinner=true`). Timed out: `claimRefund`, no fee. [H] README.md
- Plus Arc gas in USDC (README cites base fee ~20 gwei and occasional outlier priority tips). [H] README.md

## Resolution mechanism and dispute risk

- Resolution by the owner EOA: the owner reads a temperature (README: OpenWeather via the relay; the ops log says Open-Meteo archive values were used for the 2026-10-12 settlements) and submits it via `AdminOracle.submitResult(city, temp, marketId)`, `onlyOwner`. Winning bucket computed on-chain from the submitted integer. [H] README.md, deployments/arc-mainnet.json
- Tradeoffs and risks: single EOA owns all three contracts, no multisig or timelock; no dispute process; the city argument is not verified on-chain (listed as a TODO); data source is a single feed with no cross-check; the earlier n8n automation was archived after it reported JSON-RPC errors as successes. Mitigation: if the owner misses `lockTime + lockedTimeout` (1 to 30 days, set per market), bettors reclaim principal with no fee, and the owner cannot withdraw principal. [H] README.md "Fees & Security" and roadmap
- Evidence the manual process already slips: market #0 (Taipei) was never locked and passed its deadline; it was refunded on 2026-10-02 (1.0 USDC). Markets #1 and #2 had 0 pool and settled as noWinner. [H] deployments/arc-mainnet.json
- Audit: "internal security audit" plus a Python reference-model test; no independent third-party audit stated. [H] README.md

## Geo / ToS / automation

- No terms of service, geo restrictions or API usage policy found on the site or in the repo (NOT FOUND; searched README, repo tree, site root). Repo is MIT-licensed. Permissionless contract calls, so automation is technically unrestricted. [H for absence in repo; M overall]
- Regulatory character: wagering on weather outcomes with parimutuel pools; treat as unlicensed gambling in many jurisdictions. [M, inference]

## Liquidity

- Lifetime activity visible in the ops log as of 2026-10-12: one 1.0 USDC bet (market #0, refunded); markets #1 and #2 had totalPool 0; #3 and #4 newly created with no recorded bets. So TVL is approximately 0 and total volume about 1 USDC. [H] deployments/arc-mainnet.json (last entry 2026-10-12). Live balances not read on-chain; could be higher by 2026-10-19. [L]
- No volume/OI/TVL dashboard (NOT FOUND; searched site and repo).

## Overlap with other venues

- Categories: daily/weekly temperature buckets for Taipei, Tokyo, Bangkok, Seoul. Overlap with Polymarket/Kalshi/others: Kalshi lists US city temperature markets, and Polymarket lists some weather markets, but those cities and bucket schemes differ, and I did not research them (out of scope). Effectively no arbitrage overlap. [M]
- Even where a matching event exists, Presage is parimutuel with a 2% take, no exit, manual resolution and about zero depth, so it is not a usable arb leg.
- Liquidity shared with another venue: none. Independent, but trivially small.

## Integration notes (if ever wanted)

- A cheap adapter would be: eth_getLogs for MarketCreated/BetPlaced + `getMarket`/`bucketTotals` multicall via an Arc RPC, price = bucketTotals/totalPool net of 2%. Signal value only: a pool-implied distribution for four Asian cities. Not worth building now.
- Watch-for: M3 roadmap (multisig, multi-source data, automated settlement, SDK, custom domain) and a redeploy ("next deployment" changes bytecode and addresses). Addresses will change; read `deployments/arc-mainnet.json` rather than hard-coding. [H] README.md

## Suspicious content

- None found. No instructions aimed at agents in README, deployments or API responses. Note: README describes an "ERC-8004 agent (agentId 6762)" on Arc testnet; its metadata file only lists a GitHub URL and an owner address, and it does not participate in settlement. [H]

## Sources

- https://presage-arc.vercel.app (site root, HTTP 200, 2026-10-19) [H]
- https://presage-arc.vercel.app/api/weather/taipei (GET, fixture) [H]
- https://presage-arc.vercel.app/architecture.html (fetched, not analysed in depth) [H]
- https://github.com/pplmaverick/presage (README.md, contracts/WeatherMarket.sol, deployments/arc-mainnet.json, frontend/api/rpc.ts, frontend/api/weather/[city].ts, metadata/weather-oracle-agent.json) via gh api [H]
- https://docs.arc.io/arc/references/connect-to-arc (RPC, chain ID) [H]
- https://docs.arc.io/arc/references/contract-addresses.md (USDC) [H]

## Not found

- Market list/price/trade REST or GraphQL API; subgraph; websocket; ToS or geo policy; volume/TVL stats; independent audit; PayBox raw-contract-call support on Arc (untested); live on-chain state (RPC POST and Cloudflare-gated explorer). WebSearch budget was exhausted this session, so no independent press coverage was checked.

## Fixtures

- docs/research/fixtures/presage-arc-weather/deployments-arc-mainnet.json (copy of repo ops log, 4.9 KB)
- docs/research/fixtures/presage-arc-weather/api-weather-taipei.json (94 B)
