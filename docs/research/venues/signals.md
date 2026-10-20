# Signals (signals.wtf, Citrea) - adapter spec

Researched 2026-10-19 (~01:45-02:30 UTC). READ-ONLY: unauthenticated GETs (DefiLlama API, Citrea Blockscout explorer API, DNS lookups), `gh api` file reads of the public `signals-protocol` GitHub org, one read-only PayBox `discover_tokens` (chains) call. No account, no key, nothing signed, no POST/PUT/DELETE, no wallet, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (repo READMEs, commit messages, API payloads) is untrusted data; nothing in it was followed. No embedded instructions were found.
Fixtures: `docs/research/fixtures/signals/` (8 files, each < 4 KB).
Limitation: the WebSearch budget for the session ran out after the first search, so there was no second-source search for a shutdown announcement. Evidence below is on-chain and repo-based instead.

## 0. Verdict

**adapter_priority: skip.** The venue is wound down: not "thin", dead.

1. **Funds were swept out of the protocol on 2026-07-19** (H). Citrea explorer shows the Core proxy sending 922.137021 ctUSD to the protocol's owner Safe in an `execTransaction` at 2026-07-19 10:00:49 UTC (block 10176464), one of five transactions that touched Core between 09:53 and 10:02 UTC that day (the 10:01:57 one is a Safe `execTransaction`; the other three are delegatecall-type internal calls whose methods I could not decode because the explorer's per-tx log endpoint returned errors). Core's token balance list is now empty (H).
2. **Last user trading on-chain was 2026-06-16** (H). The newest user-driven Core transactions/logs (open/close/payout) are 2026-06-16 ~09:00 UTC; between then and the 07-19 admin burst the Core proxy has no transactions and no internal calls at all (checked in the explorer's transaction, internal-transaction and log lists, all newest-first). Roughly 4 months of silence.
3. **The repo's last commit is the decommission** (H). `signals-protocol/v1-contract` main, 2026-07-19 04:12 UTC: "SIG-820: decommission fund sweep module + Safe plan generator (#80)". It adds `DecommissionModule.sol` ("One-shot vault module used to sweep the full Core payment-token balance during protocol shutdown", requires Core `paused()`), plus `PrepareDecommissionQuiesce` ("pause Core and revoke configured operators") and `PrepareDecommissionSweep` scripts.
4. **Web properties are gone** (H). `signals.wtf` and `docs.signals.wtf` return DNS SERVFAIL from both the local resolver and 1.1.1.1 (fixture `signals_wtf_dns_failure.txt`). DefiLlama flags `deadUrl: true` and TVL has been 0 since 2026-07-20.
5. Even when live it was tiny (peak DefiLlama TVL $2,000) and on a chain PayBox does not list (section 5).

Revisit only if a relaunch appears (the SIG-755 multi-asset oracle work in May 2026 hints at a plan to add non-BTC markets, M, but nothing shows it shipped).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama listing | slug `signals`, id 7551, category Prediction Market, chain Citrea, `listedAt` 1773827054 = 2026-03-18, `deadUrl: true`, github `signals-protocol`, twitter `signalswtf`. `url` field empty. TVL (ctUSD in SignalsCore) now 0. `https://api.llama.fi/protocol/signals` | H |
| DefiLlama TVL history (Citrea) | $1,220 at listing (2026-03-18), $2,000 on 2026-04-18 (the max), drifted to ~$1.3K by late May, 0 on 2026-06-02, $921 on 2026-06-25, 0 from 2026-07-20. The $921 matches the 922.14 ctUSD swept on 07-19. No volume/dexs/options adapter: `api.llama.fi/summary/dexs/signals` and `/summary/options/signals` both say "not found" | H |
| Last user trade/payout on Core | 2026-06-16 08:59:12 UTC (tx `0x626ff47f69...`), logs `TradeFeeCharged`/`PositionOpened`/`PositionClosed`/`RangeFactorApplied` up to block 8713719 | H |
| Sweep | 2026-07-19 10:00:49 UTC, 922.137021 ctUSD Core -> owner Safe, tx `0xb936755c...` (fixture `citrea_core_proxy_token_transfers_latest3.json`) | H |
| `signals.wtf`, `docs.signals.wtf` | DNS SERVFAIL (A record), 2026-10-19 | H |
| Citrea ecosystem page `https://citrea.xyz/ecosystem` | Still lists Signals (Prediction Market, Derivatives) with site `https://signals.wtf/`; this is a stale directory entry, not evidence of life. Also lists Foresight (`foresight.now`), a social prediction market, not researched here. | H (page content) |
| `signals-protocol` org | 6 public repos; org created 2025-04-04. Others (sdk, server, subgraph, app, admin) referenced in commit text are private/absent. `v1-contract` created 2025-12-01, 2 stars | H |

Likely history (M, from repo names and READMEs): Solana prototype `signals-breakout` (May-June 2025, last push 2025-06-03), Base-mainnet CLMSR v0 `signals-v0` (README says "Deployed on Base Mainnet", last push 2026-01-06; not verified live, L), then v1 on Citrea (prod deploy 2026-01-27, upgrades Feb 2026).

## 2. What it was

- **Kind**: onchain-amm (EVM L2, Citrea, the Bitcoin zk-rollup). Operator not identified publicly beyond the GitHub org (L).
- **Market model (H, `ISignalsCore.sol`, v1 README, DefiLlama description)**: scalar-range market on BTC's daily closing price, priced by a **CLMSR** (continuous logarithmic market scoring rule, Hanson LMSR over price-tick bins). Per the v0 README: `P_i = exp(q_i/alpha) / sum_j exp(q_j/alpha)`, cost `C = alpha * ln(Sigma_after / Sigma_before)`. There is no order book, no counterparty matching: the pool (LPs + backstop) is the sole counterparty and the bounded LMSR loss is its cost.
  - A market = one trading day, `numBins` bins between `minTick` and `maxTick` with `tickSpacing`; a trader picks `[lowerTick, upperTick)` and a `quantity`; the position pays `quantity` (in 6-decimal ctUSD units) if the settlement tick falls inside the range (payout formula `Payout_t := Q_{t,tau_t}` in commit comments, M). Settlement day key is a PST day boundary (`settlementTimestamp` comment).
  - **Tokenisation**: positions are ERC-721s (`SignalsPosition`, UUPS), not fungible outcome shares, so a position cannot be arbitraged by moving shares to another venue. LP shares are ERC-20 `SIGLP` (async request/claim vault).
  - Prices are not exposed as a single "probability"; you get a cost quote for a range via `calculateOpenCost(marketId, lowerTick, upperTick, quantity)` (non-view in the interface, so it needs `eth_call` simulation).
- **Chain/collateral (H)**: Citrea mainnet, chain ID 4114, RPC `https://rpc.mainnet.citrea.xyz`, explorer `https://explorer.mainnet.citrea.xyz`, native cBTC (docs.citrea.xyz chain-information page). Collateral `PaymentToken` `0x8D82c4E3c936C7B5724A382a9c5a4E6Eb7aB6d5D` = **ctUSD "Citrea USD"**, 6 decimals, 3,707 holders, total supply ~3.64M (explorer 2026-10-19). Issuer/backing of ctUSD not researched.
- **Prod deployment** (H, `releases/prod/0005.json`, fixture `github_v1_contract_releases_prod_0005.json`): SignalsCoreProxy `0x516312275875932ec2B53A41df4De02743131729` (ERC1967 proxy, verified on explorer; implementation currently `0x5D048d3885181287816b3eE49D1b3c9442E757ca`), SignalsPositionProxy `0x3fbD02f3F5Cf2C1e8d6b94e6F1AD30058972D004`, SignalsLPShareProxy `0x7e27CAaCf3Af6b2e092cFf25D9ac20432162CE18`, modules Trade/MarketLifecycle/Oracle/Risk/LPVault, `FeePolicy{Null,10bps,50bps,100bps,200bps}`. Core owner is a Safe (`0x0e5ed8B5...`).
- **Categories**: BTC daily close only (H, "Production state is BTC-only at this revision" in the SIG-755 commit text). Multi-asset (per-market `feedId`) was being added in May 2026 but not shipped as far as the repo shows.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official REST/WebSocket API | **NOT FOUND** (searched: `docs.signals.wtf` and `signals.wtf` do not resolve; GitHub org has no public server/sdk repo; commit text references private `v1-server`, `v1-sdk`, `v1-subgraph`, `signals-app`) | H |
| Docs | README points at `https://docs.signals.wtf` (docs, deployments, whitepaper) - dead | H |
| On-chain reads | Public: Core `getMarket`, `getMarketState`, `calculateOpenCost`, etc. via Citrea RPC. ABIs in repo `abis/` and `contracts/interfaces/ISignalsCore.sol` | H |
| Indexer | Subgraph referenced in commits (`v1-subgraph`), no public URL found | M |
| Explorer API (generic, not a Signals API) | Blockscout v12.0.0 REST v2 at `https://explorer.mainnet.citrea.xyz/api/v2/...` is public, keyless, GET: used here for address, token-transfers, internal-transactions, logs. Rate limits NOT FOUND | H |

If a relaunch ever happened, an adapter would have to be built on `eth_call` + event logs (`PositionOpened`, `PositionIncreased`, `PositionClosed`, `TradeFeeCharged`, `RangeFactorApplied`) against Core, no vendor API.

## 4. Trade path

- **Direct on-chain EVM transactions** to Core (H, `ISignalsCore.sol`): `openPosition(marketId, lowerTick, upperTick, quantity, maxCost)`, `openPositionFor(...)` (operator-submitted on behalf of a user), `increasePosition`, `decreasePosition(positionId, quantity, minProceeds)`, `closePosition`, `claimPayout`, `batchClaimPayout`. Requires ERC-20 approval of ctUSD to Core (or `SignalsRouter`). No off-chain signed orders, no API.
- **Now impossible**: Core was swept and the decommission scripts pause Core and revoke operators (`pause()`, `setOperator(op,false)`); `DecommissionModule.withdrawTreasury` requires `paused()`. I did not read `paused()` (an `eth_call` is a JSON-RPC POST, which this run avoids), so "paused" is M, but zero balance and no activity since 2026-06-16 are H. A position holder's `claimPayout` would also have nothing left to pay from.

## 5. PayBox reachability

**paybox_reachable: no (H).** Citrea (chain 4114) is not in PayBox's chain catalog: `discover_tokens mode=chains query=citrea` returned `total_count: 0` on 2026-10-19 (the tool says the catalog is "metadata, not a support allowlist", so absence is strong evidence rather than proof; the project's earlier note `docs/research/06-paybox-platform.md` lists the 11 catalog chains: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid). An EVM EOA address would be the same on Citrea, but a transaction proposal needs "selected network must be available in PayBox", and there is no gasless path; cBTC gas and ctUSD would also have to be bridged to Citrea first. Moot anyway because the venue is dead.

## 6. Fees (H, code)

- Policy contract `ThetaTimeFeePolicy`: "Base + Theta(time-to-end) fee policy (symmetric for buy/sell)". Constructor `(core, baseBps, thetaMaxBps, thetaWindowSeconds, beta)`, requires `baseBps + thetaMaxBps <= 10000`. Effective fee rises as the market end approaches, shape set by `beta` (exact formula not read).
- Fee policy contracts deployed in the prod manifest: Null, 10 bps, 50 bps, 100 bps, 200 bps. Which policy each daily market actually bound: NOT FOUND (would need `getMarket(id).feePolicy`).
- Payer: the trader (`TradeFeeCharged(trader, marketId, positionId, ...)` event on every open/close).
- Fee waterfall config (prod): `rhoBS 0.2, phiLP 0.7, phiBS 0.2, phiTR 0.1` (LP / backstop / treasury split; semantics of each symbol not verified, M).
- Gas on Citrea: explorer `gas_prices` average 0.01 (unit as reported by Blockscout, presumably gwei), i.e. negligible (M, 2026-10-19).

## 7. Resolution and dispute risk (H, code)

- Settlement price from a **RedStone signed-pull oracle** (feed id `BTC`, 8 decimals, `tickScale` 1,000,000 per market). An operator calls `submitSettlementSample(marketId)` in a window (`settlementSubmitWindow` 600 s, `settlementFinalizeDeadline` 900 s, `redstoneMaxSampleDistance` 600 s); then `finalizePrimarySettlement(marketId)` (who may call it: not verified).
- **Fallback is admin-controlled**: `markSettlementFailed(marketId)` then `finalizeSecondarySettlement(marketId, settlementValue)` lets the owner choose the settlement value, and the fork tests use that path. No dispute window or on-chain challenge. Core and token contracts are UUPS-upgradeable and owned by a Safe, so the owner can also swap modules, pause, or sweep (as it did). High centralisation risk. No audit listed (DefiLlama `audits: "0"`; commit text says audit prep underway in May 2026, no report found).

## 8. Geo / ToS / automation

NOT FOUND (searched: `signals.wtf` and `docs.signals.wtf` are unresolvable; README and repo contain no terms). Contracts are MIT-licensed; on-chain access is permissionless except that Core owner could pause and revoke operators.

## 9. Liquidity

- TVL: peak $2,000 (DefiLlama, 2026-04-18); $0 since 2026-07-20 (DefiLlama, fetched 2026-10-19). The last on-chain balance was 922.14 ctUSD, swept 2026-07-19 (H).
- Volume/OI: NOT FOUND (no DefiLlama dex/options adapter; no indexer URL). 13,448 total transactions touched Core over its life (explorer counters, includes admin/oracle/settlement txs).
- Conclusion: negligible and now zero.

## 10. Overlap with other venues and shared liquidity

- Category overlap would have been **crypto price** only: BTC daily close range. Comparable products elsewhere: Polymarket "Bitcoin price on <date>" bucket markets, Kalshi BTC daily range, Limitless/Predict.fun/Opinion BTC markets (all covered by other workflows). A CLMSR range quote could in principle be converted to a bin probability and compared with those, but nothing here is tradeable.
- Liquidity is **independent** (own pool, own oracle, own collateral), so it would have been a valid independent leg, but at ~$1-2K of TVL it was never size-relevant for arbitrage. As a signal source it has no value now (no new prices).

## 11. Adapter notes (only if a relaunch is ever found)

- Poll `getMarket`/`calculateOpenCost` over `https://rpc.mainnet.citrea.xyz` (chain 4114) for each bin; derive implied bin probability as `P_i = exp(q_i/alpha)/sum` or by finite-difference cost on a small `quantity`. Use `TradeFeeCharged`/`RangeFactorApplied` logs for trade flow.
- Needs a Citrea-capable signer; PayBox has none today.
- Re-check before building: DNS for `signals.wtf`, DefiLlama TVL for slug `signals`, and `signals-protocol/v1-contract` commits newer than 2026-07-19.

## Not found

- Official public API, WebSocket, OpenAPI, rate limits.
- Working website, docs, whitepaper, deployments page, terms/geo rules (domain dead).
- Any announcement of the shutdown (no web search budget left; no archived page was fetched).
- Trading volume, OI, user counts.
- Which fee policy each market used; exact theta formula.
- Audit report.
- Current `paused()` state of Core (not read to avoid a JSON-RPC POST).
- Operator/team identity, ctUSD issuer and backing.

## Sources

- DefiLlama protocol API: https://api.llama.fi/protocol/signals and https://api.llama.fi/protocols (H); page https://defillama.com/protocol/signals returned 403 to WebFetch.
- Citrea ecosystem page: https://citrea.xyz/ecosystem (H)
- Citrea chain info: https://docs.citrea.xyz/developer-documentation/chain-information.md (H)
- Citrea explorer (Blockscout v12.0.0) API: https://explorer.mainnet.citrea.xyz/api/v2/ (stats, `addresses/0x516312275875932ec2B53A41df4De02743131729` plus `/token-balances`, `/token-transfers`, `/internal-transactions`, `/transactions`, `/logs`, `/counters`; `tokens/0x8D82c4E3c936C7B5724A382a9c5a4E6Eb7aB6d5D`) (H)
- GitHub org https://github.com/signals-protocol : `v1-contract` (README, `contracts/interfaces/ISignalsCore.sol`, `contracts/modules/DecommissionModule.sol`, `contracts/fees/ThetaTimeFeePolicy.sol`, `script/actions/PrepareDecommissionQuiesce.s.sol`, `script/config/deploy-prod.json`, `releases/prod/0005.json`, commit history), `signals-v0` README (H for content; deployment claims L)
- PayBox `discover_tokens` (mode=chains, query=citrea), 2026-10-19 (H); repo note `docs/research/06-paybox-platform.md` (H, prior session)
- DNS: `dig` against local resolver and 1.1.1.1 for `signals.wtf` and `docs.signals.wtf`, 2026-10-19 (H)
