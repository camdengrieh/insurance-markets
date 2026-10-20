# Tempo Weather Market - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads, unauthenticated GETs to the project site and the Tempo explorer/docs, one read-only PayBox `discover_tokens(chains)` call. No account, wallet, signature, or PayBox money tool. **No JSON-RPC POST was sent** (ground rule: no POST), so no live on-chain state (pool sizes, market status) was read. WebSearch was unavailable (session budget exhausted); no press or analytics coverage was read. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak/stale.

---

## 0. Bottom line

1. **Live, but a one-developer prototype.** Site returns 200 (2026-10-19); repo `pplmaverick/tempo-weather-market` last pushed 2026-10-08, 0 stars, 0 forks; created 2026-05-15; contract deployed to Tempo mainnet 2026-05-15 (H). Markets #29-30 (NY + Seoul, "Oct round", lock 2026-10-22) were created on 2026-10-08 per commit message (H), so a round is currently open.
2. **Model: owner-created, 5-bucket temperature parimutuel** (H). Single-pool, no order book, no tradable shares, no early exit. Prices are implied from pool sizes only; no sell side.
3. **Read access is on-chain only** (Tempo RPC + `getMarket` / `bucketTotals`). No REST/subgraph/websocket API. The frontend reads the chain directly through wagmi (H).
4. **Trade path: plain EVM `approve` + `placeBet`** on Tempo (chain 4217). PayBox's chain catalog does NOT include Tempo, so PayBox cannot sign or fund there (H, 2026-10-19).
5. **Trust model is centralised**: one EOA owner creates markets and sets the oracle; one oracle EOA submits the temperature from an off-chain server; no dispute path (H, contract source).
6. **adapter_priority = skip.** Thin/unknown liquidity (only $1 e2e bets are evidenced), parimutuel (no executable price until close), unreachable chain for PayBox, centralised resolution. Only conceptual overlap: NYC / Seoul / Tokyo / Taipei daily-high temperature vs Kalshi/Polymarket weather markets, which could be a signal-only cross-check if volume ever appears.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://tempo-weather-market.vercel.app/` | HTTP 200, Vercel, React SPA shell titled "Tempo Weather Market", 2026-10-19 05:09 GMT (fixture `site_index_html_2026-10-19.html`) | H |
| Repo | `pplmaverick/tempo-weather-market`, not archived, pushed 2026-10-08T08:42Z, MIT, 0 stars/forks, description "Weather prediction market on Tempo network, settled in pathUSD/USDC.e" | H |
| Last commits | 2026-10-08 "chore: create markets #29-30 (Oct round, NY + Seoul, lock 2026-10-22)"; SDK scaffold commits same day; 2026-09-04 manual settlement scripts for markets #27/#28 ("scheduler lock failure workaround") | H |
| Mainnet deployment | `deployments/tempo.json`: chain 4217, contract `0x072a3a0c04cf8cdcaf5b4a73a4ed4ff5a841531f`, block 20096085, deployedAt 2026-05-15T11:22:31Z | H |
| Tempo mainnet itself | docs.tempo.xyz -> tempo.xyz/developers/docs: chain ID 4217, RPC `https://rpc.tempo.xyz`, WS `wss://rpc.tempo.xyz`, explorer `explore.tempo.xyz`; "Tempo has no native gas token" (page does not state a launch date) | H |
| Live on-chain state (open markets, pool sizes) | NOT FOUND (searched: explorer REST paths `/api/v2/addresses/...`, `/api/address/...` return 404; explorer is a JS app; JSON-RPC needs POST, not sent) | - |

Verdict: **still_live = true** (site + repo + contract), size unknown and almost certainly tiny.

---

## 2. Kind and market model

- **Kind:** on-chain parimutuel (pool) prediction market, Solidity 0.8.28, OpenZeppelin 5. Contract `WeatherMarket.sol` (H, repo `contracts/WeatherMarket.sol`).
- **Markets:** created only by the contract owner via `createMarket(city, predictionType, targetDate, buckets[], lockTime)`. Cities seen: Taipei, Tokyo, New York, Seoul; type `HIGH_TEMP` (comment also lists `LOW_TEMP`, `RAINFALL`, but only `HIGH_TEMP` appears in scripts) (H).
- **Outcomes:** categorical over temperature buckets. `buckets` = strictly increasing upper bounds in degC x10 (e.g. `[250,280,310,340]`), giving N+1 outcomes (<=25.0, 25.1-28.0, ..., >34.0). Winning bucket = first `i` with `finalTemp <= buckets[i]`, else the top overflow bucket. Bounds are inclusive on the upper side (H). Bucket edges differ per round and per city (the frontend warns its hard-coded labels are stale) so an adapter must read `buckets` from chain each time.
- **Tokenisation:** none. Stakes are recorded in mappings (`bets[marketId][bucket][address]`, `bucketTotals`, `userTotalBets`); no ERC-20/1155 position tokens, so positions are not transferable or sellable (H).
- **Rounds:** weekly. `createFourMarkets.ts` sets `lockTime = now + 6d23h`, `targetDate = now + 7d` (H). Rounds do not always include all four cities.
- **Implied probability (M, my arithmetic):** `bucketTotals[m][i] / totalPool`. It is not an executable price: a new bet changes the payout for everyone. Expected payout for a marginal bet `a` on bucket `i`: `a * 0.98 * (P + a) / (T_i + a)` where `P` is total pool and `T_i` the bucket total (fee below).

## 3. Chains and collateral

- **Chain:** Tempo mainnet, chain ID 4217, RPC `https://rpc.tempo.xyz`, explorer `https://explore.tempo.xyz` (H). Testnet "Moderato" 42431, `https://rpc.moderato.tempo.xyz` (H). Multicall3 present at `0xcA11bde05977b3631167028862bE2a173976CA11` per frontend config (H).
- **Collateral:** mainnet = USDC.e, 6 decimals, `0x20C000000000000000000000b9537d11c60E8b50` (H, `deployments/tempo.json`); testnet = pathUSD `0x20c0000000000000000000000000000000000000` (the Moderato deployment JSON says 18 decimals, the frontend config says 6: internal inconsistency, testnet only; H).
- **Gas:** Tempo has no native gas token; fees are paid in TIP-20 stablecoins (docs wording, partial) (H/M). The contract has a "gasTank" and `placeBetFor` for relayer-sponsored bets, but `placeBetFor` is whitelisted-relayer only (H).

## 4. Read API

- **Exists:** onchain-or-subgraph-only (here: on-chain only). No docs site, OpenAPI, subgraph, REST, or websocket. NOT FOUND (searched: README, repo tree, frontend bundle URL strings - only `rpc.tempo.xyz`, `rpc.moderato.tempo.xyz`, explorer hosts, `api.open-meteo.com/v1/forecast`).
- **How to read (H, from ABI/source):**
  - `nextMarketId()` -> count of markets (ids 0..n-1).
  - `getMarket(id)` -> `(city, predictionType, targetDate, lockTime, status 0/1/2 = OPEN/LOCKED/SETTLED, totalPool, finalTemp, winningBucket, buckets[], noWinner, settleMemo)`.
  - `bucketTotals(id, bucket)` -> stake per bucket (the price input). `getReceipt(id)` after settlement. `bets(id,bucket,addr)`, `claimed(id,addr)`.
  - Events: `MarketCreated`, `BetPlaced(marketId, bettor, bucket, amount)`, `MarketLocked`, `ResultSubmitted`, `WinningsClaimed`.
- **Base URLs:** `https://rpc.tempo.xyz` (HTTP JSON-RPC), `wss://rpc.tempo.xyz` (H, Tempo docs). Contract `0x072a3a0c04cf8cdcaf5b4a73a4ed4ff5a841531f`.
- **Auth/limits:** RPC is public; the project notes RPC 429 rate limits and batches reads via Multicall3 (H, `chains.ts` comment). Numeric limits NOT FOUND.
- **Oracle server REST (not an aggregator feed):** repo `oracle-server` exposes `POST /oracle/settle`, `GET /oracle/market/:id`, `GET /oracle/health`, and an MPP-paywalled `GET /oracle/weather/:city` at $0.01/call. Public base URL NOT FOUND; it is the project's private settlement service, not an API for third parties (H for the source, hosting unknown).
- **Fixtures:** none usable. No public REST response exists to sample. Saved only repo/site artefacts in `docs/research/fixtures/tempo-weather-market/`: `repo_deployments_tempo.json`, `repo_deployments_moderato.json`, `site_index_html_2026-10-19.html`. A future `eth_call` sample (`getMarket(29)`) is an open item.

## 5. Trade path

- **Programmatic:** yes, on-chain. `stablecoin.approve(contract, amount)` then `placeBet(uint256 marketId, uint8 bucket, uint256 amount)` (anyone, before `lockTime`, market OPEN). After settlement `claimWinnings(marketId)`. A relayer variant `placeBetFor(marketId, bucket, amount, bettor)` is `onlyRelayer` (owner-whitelisted) and not available to us (H).
- **Auth/signing:** ordinary EVM transaction signed by the bettor's key. No order signing, API key or EIP-712 order flow.
- **No exit:** no cancel, sell or transfer of stake before settlement (H, no such function). Unlike an order-book leg, a bet cannot be hedged out by reversing.
- **Gotcha - manual lifecycle:** `submitResult` requires status LOCKED, and `lockMarket` must be called after `lockTime` by anyone/scheduler. Scheduler is `address(0)` on mainnet (`"scheduler": null`), so locking is manual. Markets #27/#28 needed manual settlement scripts in Sep 2026 (H). Expect settlement delay.

## 6. Reachable through PayBox?

- **paybox_reachable = no.** PayBox `discover_tokens(mode=chains)` on 2026-10-19 returns 11 chains: Solana, Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BSC 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999. **Tempo 4217 is absent** (H, tool output; the tool says it is "not a support allowlist", so absence is strong evidence but not proof).
- A Base/Ethereum/Arbitrum/Polygon/BNB EVM wallet could hold the same address on Tempo (same EVM address space), but PayBox would need to sign a Tempo (chain 4217) transaction and fund USDC.e there; no evidence it can. Funding USDC.e on Tempo would also need a bridge/on-ramp (see Tempo docs "Fund an account", not read). A custom PayBox plugin cannot add a chain. (M)

## 7. Fees

- **Market fee:** `FEE_BPS = 200` (2%) of the **total pool**, taken from the winners' side: `netPool = totalPool - totalPool*200/10000`; `payout = userBet * netPool / bucketTotals[winning]`. No fee if nobody backed the winning bucket (all bets refunded, `noWinner`) (H, source).
- **Oracle fee:** `oracleFee` paid by the oracle into `collectedFees` on `submitResult`; mainnet deployment value `0` (H, `deployments/tempo.json`; may have changed via `setOracleFee`, not verified live).
- **Gas:** paid in stablecoin on Tempo; unknown size, probably cents. No trading fee on bets themselves.
- Note: the 2% is taken from the whole pool, so even a bettor who backs the winning bucket with the entire winning stake receives about 98% of the pool; a riskless lock-in against another venue is not possible.

## 8. Resolution and dispute risk

- **Mechanism (H, README + source):** off-chain oracle server computes the median of WeatherAPI.com and Open-Meteo Archive readings (OpenWeather dropped from settlement) and a single `oracle` EOA calls `submitResult(marketId, finalTemp, memo)`. The memo records `wa:`/`om:` values. Result is final on-chain: no challenge window, no dispute, no oracle bond. The owner can swap the oracle any time (`setOracle`).
- **Rules clarity:** the station/location for each city, "daily high" definition (local day vs UTC, observation window) is not documented anywhere I found (NOT FOUND: README, frontend, contract). Resolution risk vs Kalshi (NWS/NOAA station-based) is high; the Gebele & Matthes paper cited in `docs/research/10-aggregation-landscape.md` documents exactly this station-mismatch problem for NYC highs.
- **Operational risk:** manual lock/settle (see 5); `scheduler` unset; owner can create markets with arbitrary buckets; `winningBucket` is `uint8`. Owner can also `withdrawGasTank` but gas-tank and pool funds share one stablecoin balance; no separate accounting beyond counters (H, source) - a bug or owner action could affect solvency; no audit mentioned (NOT FOUND).

## 9. Geo / ToS / automation

NOT FOUND (searched: README, frontend bundle, site shell). No terms, no geo-block statement, no bot policy. Permissionless contract; anyone can call `placeBet`. Legal status of an unlicensed weather-betting contract is unaddressed. (H for absence in the places listed.)

## 10. Liquidity

- **Evidenced size:** the mainnet e2e script bets **1 USDC.e** (`betAmount = e6(1)`) (H, `scripts/e2e-mainnet.ts`). No stats, TVL page, DefiLlama entry or volume figure found. Live `totalPool` per market: NOT FOUND (no RPC call made).
- Assume pools are in the single-digit to low-hundreds USD at best (L, inference from project stage: 0 stars, solo developer, 30 markets total across ~7 months).

## 11. Event overlap (where arbitrage could exist)

- **Weather / temperature only.** Daily-high temperature for New York, Seoul, Tokyo, Taipei, weekly rounds with 5 broad bands (3 degC wide).
- **Overlap candidates (M):** Kalshi daily high-temperature markets (NYC and others, NWS-station resolution) and Polymarket city temperature markets (both outside this task, covered in `08-venues-polymarket-kalshi.md`). Bands differ (3 degC vs 1-2 degF bins), resolution stations differ, horizon differs (this venue locks ~7 days ahead, Kalshi lists next-day markets), so matches are imperfect "semantic non-fungibility" cases rather than clean arb.
- No sports, politics, crypto or macro.

## 12. Shared liquidity

Independent: own contract, own pools. Does not route to or mirror any other venue. (H) It is not an arbitrage leg of another venue's book, but it is also not a meaningful independent one given size.

## 13. Adapter priority: **skip**

Reasons: tiny/unevidenced liquidity, parimutuel with no sell side, unreachable chain for PayBox, single-EOA oracle with no dispute path, no API beyond raw RPC, manual lifecycle. If revisited, a read-only adapter is cheap (multicall `getMarket` + `bucketTotals` over `rpc.tempo.xyz`, 5 buckets per market) and could serve as a thin cross-check for NYC highs; trade support would require Tempo signing outside PayBox.

## 14. Open questions

1. Live `totalPool` / `bucketTotals` for markets #29-30 (needs an `eth_call` over JSON-RPC; not performed because of the no-POST rule).
2. Current `oracleFee` and `oracle` address on mainnet (could have changed after deployment).
3. Does PayBox plan Tempo support? Is a Tempo bridge/on-ramp available for USDC.e?
4. Exact observation station and day-boundary used by the oracle for each city.
5. Whether Tempo's own docs/ecosystem pages list this app (traction signal).

## Sources

- https://tempo-weather-market.vercel.app/ (HTTP 200 on 2026-10-19; SPA shell; bundle `/assets/index-D7TIAwe_.js` scanned for URLs) [H]
- https://github.com/pplmaverick/tempo-weather-market (repo metadata, commits, tree) [H]
- `contracts/WeatherMarket.sol`, `README.md`, `deployments/tempo.json`, `deployments/moderato.json`, `frontend/src/config/{chains,contracts}.ts`, `frontend/src/hooks/useMarket.ts`, `scripts/createFourMarkets.ts`, `scripts/e2e-mainnet.ts`, `oracle-server/src/routes/oracle.ts` (read via `gh api repos/pplmaverick/tempo-weather-market/contents/...`) [H]
- https://tempo.xyz/developers/docs/quickstart/connection-details (via redirect from docs.tempo.xyz; WebFetch summary) [H/M]
- https://explore.tempo.xyz (probed REST paths; 404, JS explorer) [H]
- PayBox `discover_tokens(mode=chains)`, 2026-10-19 [H]
- Local: `docs/research/06-paybox-platform.md`, `docs/research/10-aggregation-landscape.md` [M]
