# Strike (strike.pm / strike.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads, DNS/HTTP probes, and read-only BSC JSON-RPC (`eth_call`, `eth_getLogs`). No account, wallet, key, signature, transaction or PayBox tool. WebSearch was unavailable (session budget used up), so no press/analytics coverage was read. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary/inferred; **L** = weak/stale.

Fixture: `docs/research/fixtures/strike-strike-pm/onchain-probe-2026-10-19.json` (on-chain probe results; there is no live HTTP API to sample).

---

## 0. Bottom line

1. **Front end and API are down; contracts still exist but are economically dead.** `strike.pm`, `app.strike.pm`, `strike.fun`, `docs.strike.fun` and the documented indexer API host `strike.fun/api` all fail to resolve; the authoritative nameservers answer REFUSED (zone gone/lapsed). (H, 2026-10-19)
2. **On-chain TVL is about $5.** Vault $0.33 + ParimutuelVault $3.38 + Flap-pool vault $1.22 USDT (BSC) on 2026-10-19. Zero logs from all 8 core contracts in the last ~1.5 h. (H)
3. **No usable read API** (the official indexer is unreachable and its source is in private repos). Only on-chain reads work, which is a poor basis for an adapter on a venue with no liquidity.
4. **adapter_priority = skip.** Dead UI/API, near-zero TVL, BNB-only, crypto 5-minute markets whose economics duplicate Polymarket/Predict.fun/Opinion, and a "Strike <-> Polymarket market-making/hedging bot" in the project's own README implies any real price here is a Polymarket derivative, not independent liquidity.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| DNS for `strike.pm`, `app.strike.pm`, `strike.fun`, `docs.strike.fun` (local resolver, then Cloudflare DoH) | Not resolvable; DoH status 2, EDE 22 "No Reachable Authority", authoritative NS returned REFUSED | H |
| Repo `ayazabbas/strike` | Public, not archived, last push 2026-06-22 (testnet websocket change), created 2026-02-15, 2 stars, no releases, no LICENSE file (README says BUSL-1.1; GitHub reports no license). https://github.com/ayazabbas/strike | H |
| Related repos `strike-infra`, `strike-frontend`, `strike-mm`, `strike-website` | 404 (private or deleted) | H |
| Contracts on BSC mainnet (56) | Code present at OrderBook, MarketFactory, ParimutuelFactory, PoolManager, Vault | H |
| Lifetime counters (eth_call) | 4,368 orderbook markets, 35,240 orders, 6 parimutuel V2 markets, 18 Flap token pools since deploy (2026-04-23) | H |
| Recent logs (eth_getLogs, blocks 128485001-128497000, ~1.5 h) | 0 logs across 8 contracts; older ranges not queryable on public nodes, so last-activity date NOT FOUND | H |
| USDT balances | Vault 0.33, ParimutuelVault 3.38, NativeTokenPoolVault 1.22 | H |
| crates.io `strike-sdk` | 0.2.14, updated 2026-04-28, 254 downloads | H |

Verdict: **not live in any usable sense** (no UI, no API, ~$5 locked). Contracts are permissionless so residual on-chain use by bots is possible; unverifiable.

---

## 2. Kind and market model

- **Kind:** on-chain CLOB (frequent batch auction) plus parimutuel pools, BNB Chain. (H, README)
- **Orderbook markets:** binary only (YES/NO or UP/DOWN); ticks 1-99 cents; `LOT_SIZE = 1e16` = $0.01; min order 100 lots on mainnet (= $1 notional at tick 100); 4 sides (Bid, Ask, SellYes, SellNo); GTC/GTB orders; batches clear every 60 s (default) at a uniform price with pro-rata on the oversubscribed side; `MAX_USER_ORDERS = 20` per market. Positions are **internal vault accounting**, not tradable tokens (ERC-1155 `OutcomeToken` retained "for compatibility"). Typical markets: BTC/ETH/SOL 5-minute price, AI-resolved binaries. (H, README, docs/sdk/orders.md, docs/protocol/market-lifecycle.md)
- **Parimutuel pools:** 2-8 outcomes, buy-and-hold, no sell/cashout, non-transferable internal claims, curve-priced displayed probabilities (independent-log curve, L = 40,000 USDT preset); `tradingCloseTime` separate from `resolutionTime`. Also "Flap Token Pools" (creator-launched, arbitrary BEP20 collateral, AI-resolved) and fixed-multiplier World Cup 2026 products. (H, docs/protocol/parimutuel-markets.md, docs/getting-started/world-cup.md)

Two market-ID systems: `factoryMarketId` (MarketFactory, resolution, redemption, API) vs `orderBookMarketId` (OrderBook, BatchAuction, Vault). (H, docs/developer-integration.md)

## 3. Chains and collateral

BNB Smart Chain mainnet (56) and BSC testnet (97) only. Collateral is BSC USDT `0x55d398326f99059fF775485246999027B3197955` (18 decimals) for orderbook and standard pools; STRIKE token for some pools; arbitrary BEP20 for Flap pools. Core mainnet addresses (H, docs/contracts/deployments.md, 2026-04-23 deploy): OrderBook `0x71F7Bc523FFF296A049a45D08cBD39D39d3C047B`, Vault `0x43D5caC88a87560Db8040Bef16F0ce8871B4F7ee`, MarketFactory `0x34E0BCC1619dBc6A00A23b70BbaD9F36b0483d82`, BatchAuction `0x9d66fa0Aad92bb4428947443c1135C06a0cbFFBb`, ParimutuelFactory `0x7F271e99FD6FAa2d2B7E7b033a74256f631b922b`. Oracle: Pyth Core on BSC `0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594`. Source: https://github.com/ayazabbas/strike/blob/master/docs/contracts/deployments.md

## 4. Read API

- **Official:** REST indexer, "non-authoritative", versioned `/v1/`; OpenAPI at `https://strike.fun/api-docs/` (NOT reachable); mainnet base `https://strike.fun/api`, testnet `https://testnet.strike.pm/api`; WebSocket `wss://strike.fun/api/ws`. All hosts unresolvable on 2026-10-19. (H docs, H unreachable)
- **Documented endpoints (unverified live):** `GET /v1/markets?status=&limit=&offset=&since=` (envelope `{data, meta:{total,limit,offset}}`; fields `factory_market_id, orderbook_market_id, expiry_time, status, pyth_feed_id, strike_price, batch_interval`), `GET /v1/markets/:id`, `GET /v1/orderbook/:market_id` (bids/asks as `{tick, lots}`), `GET /v1/trades/:market_id`, `GET /v1/positions/:address`, `GET /v1/stats`, `GET /v1/markets/:id/ai-resolution`. WS messages `orderbook`, `trade`, `market_status`, `batch_cleared`. (H, docs/sdk/indexer.md, docs/infrastructure/indexer.md)
- **Auth / rate limits:** NOT FOUND (searched docs/sdk/indexer.md, docs/infrastructure/indexer.md).
- **On-chain fallback:** all state readable from the contracts (events `OrderPlaced`, `OrderSettled`, `BatchCleared`, `MarketCreated`, `MarketResolved`); public BSC nodes cap `eth_getLogs` ranges and restrict history. (H)
- **Fixtures:** no HTTP samples possible; on-chain probe saved instead.

## 5. Trade path

Direct contract calls from an EVM wallet: `USDT.approve(Vault)`, then `OrderBook.placeOrder(orderBookMarketId, side, orderType, tick, lots)` / `placeOrders` / `replaceOrders` / `cancelOrder`; anyone can call `BatchAuction.clearBatch`; redemption via `Redemption.redeem(factoryMarketId, amount)`. No off-chain signed orders, no API trading. Rust SDK `strike-sdk` wraps this. (H, docs/developer-integration.md, docs/sdk/orders.md)

**PayBox reachability: partial.** BNB Smart Chain (56) is in PayBox's live chain catalog (prior note `docs/research/06-paybox-platform.md`, H 2026-10-19), and each `io.paybox/transactionProposal` carries exactly one EVM call, so trading = separate proposals for `approve` and each `placeOrder`, each needing approval/grant policy. Batch clearing means fills arrive 60 s later with no fill-or-kill guarantee. Technically feasible, practically pointless given no liquidity and no API.

## 6. Fees

20 bps total, split 50/50 (buyer `floor(fee/2)` deducted from filled collateral; seller `ceil(fee/2)` from payout), no maker/taker distinction, paid to `protocolFeeCollector`. No resolver bounty. Gas on BSC ~$0.003-0.01 per action. Pool-market fee is configured per market (value NOT FOUND). (H, docs/protocol/fees-and-incentives.md)

## 7. Resolution and dispute risk

- **Pyth price markets:** earliest Pyth update with `publishTime` in [T, T+60s]; confidence check (reject if conf > 1% of price); 90 s finality during which an earlier valid update can replace the proposal only if it flips the outcome; permissionless; auto-cancel/refund after 24 h with no resolution. Admin `setResolved()` emergency override exists. (H, docs/protocol/oracle-resolution.md)
- **Flap AI Oracle (AI/Flap pools):** optimistic LLM proposal, 30-minute challenge window with bond, admin review of challenges; admin fallback on failure. Documented limitations: current-data only, ambiguous prompts need admin. (H, docs/protocol/ai-markets.md)
- **Admin/fallback:** curated sports/event pools (e.g. World Cup winner) resolved by protocol admin. High centralisation/dispute risk for non-price markets.
- Internal audit docs exist in repo (`AUDIT-REPORT.md`, `docs/technical/internal-audit-v1.2.md`); no external audit found. (M)

## 8. Geo / ToS / automation

NOT FOUND (searched: README, docs tree of 60+ pages incl. security, frontend, quick-start; site unreachable so no ToS page). Contracts are permissionless; the README even invites agent use and ships a bot/SDK, but no explicit automation policy. Note README "Agent Quick Context" is addressed to coding agents working on the repo; nothing in it was followed.

## 9. Liquidity

~$4.94 USDT total locked across Vault, ParimutuelVault and Flap-pool vault on 2026-10-19 (H, eth_call). Lifetime 35,240 orders, 4,368 markets since 2026-04-23. Volume/OI figures: NOT FOUND (indexer `/v1/stats` unreachable; no DefiLlama check possible without search).

## 10. Event overlap and shared liquidity

- Overlap: BTC/ETH/SOL 5-minute up/down (also on Polymarket, Predict.fun, Opinion, 9lives-style venues); World Cup 2026 winner (overlaps Polymarket/Kalshi, but pool-priced and fixed-multiplier, not comparable); BEP20 token metric pools (unique, no overlap).
- Shared liquidity: the README names `strike-mm`, a "Strike <-> Polymarket market-making / hedging bot", so quotes here would be Polymarket-derived (M, README only). Also settles against Pyth like Predict.fun's BTC 5-minute markets. Not an independent arbitrage leg.

## 11. Adapter recommendation

**skip.** If ever revived: poll `GET /v1/markets?status=active` + `/v1/orderbook/:id` (tick/100 = YES price, lots*$0.01 depth), map `strike_price` + `expiry_time` + `pyth_feed_id` to a canonical crypto-price event; fees 20 bps; trade via BSC proposals. Revisit only if `strike.fun` resolves again and `/v1/stats` shows meaningful volume.

## Sources

- https://github.com/ayazabbas/strike (README, docs/, contracts/src) - read via `gh api`, 2026-10-19 (H)
- docs/contracts/deployments.md, docs/protocol/fees-and-incentives.md, docs/protocol/oracle-resolution.md, docs/protocol/ai-markets.md, docs/protocol/parimutuel-markets.md, docs/protocol/market-lifecycle.md, docs/infrastructure/indexer.md, docs/sdk/indexer.md, docs/sdk/orders.md, docs/developer-integration.md, docs/getting-started/world-cup.md (all under the repo above) (H)
- BSC JSON-RPC via https://bsc-rpc.publicnode.com (eth_call, eth_getLogs, eth_getCode) and https://cloudflare-dns.com/dns-query (DoH) (H)
- https://crates.io/api/v1/crates/strike-sdk (H)
- Blockscout aggregator returned "Proceed with API key or make a X402 payment" - not pursued, no payment made. bscscan.com returned 403.
- `docs/research/06-paybox-platform.md` for PayBox chain catalog (internal, H)

## Not found

Active site/API; ToS/geo/automation policy; rate limits; volume and OI; last on-chain activity date (public nodes refuse old ranges); pool fee value; external audit; strike-mm details (private repo).
