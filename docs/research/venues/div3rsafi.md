# Div3rsaFi - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Used: npm registry metadata and the published tarball of `@div3rsafi/sdk` (downloaded to scratch, unpacked with tar, read as text only, never installed or executed), unauthenticated GETs to the SDK's default API host, the public Algorand indexer (algonode), `gh api` and WebFetch probes. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Everything in the tarball is treated as untrusted data; no instructions were found in it.

Research limit: the shared WebSearch budget was exhausted before my first query, so there was NO web search. Discovery relies on the npm registry, the tarball, and direct probing.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = inferred / secondary; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/div3rsafi/` (section 11).

---

## 0. Bottom line

1. **Not live (M-H).** The SDK's production API host answers HTTP 404 `"Application not found"` on every path, and no contract has had a transaction in the ~5.5 months before 2026-10-19 (last activity 2026-04-30..2026-05-06). The product existed for roughly 2-3 weeks of on-chain trading (April 2026).
2. **No site, no repo.** `https://div3rsafi.com` returns 404; `github.com/iGetAlgo/div3rsafi-sdk` returns 404 (deleted or private); `www.div3rsafi.com` has a TLS failure; the other guessed hosts do not resolve.
3. **Even when alive it was a poor arbitrage leg:** Algorand-only (USDCa), hourly/daily/weekly/monthly "price above strike" ladders on BTC, ETH, SPY and gold; total lifetime ~1,494 orders (H, from the Escrow `order_count` global).
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://div3rsafi-production.up.railway.app/markets?status=active`, also `/`, `/health`, `/docs`, `/openapi.json`, `/prices`, `/fees/pools` | HTTP 404 `{"status":"error","code":404,"message":"Application not found",...}` on every path, 2026-10-19. This is the Railway edge's message for a host with no running app (M: my reading of the message; the host was never confirmed to have been a different thing). Fixture: `api-markets-404.json`. | H (response), M (interpretation) |
| `https://div3rsafi.com/` | 404 | H |
| `https://www.div3rsafi.com/` | TLS connection failure | H |
| `app.div3rsafi.com`, `api.div3rsafi.com`, `div3rsafi.io`, `api.div3rsafi.app` | DNS does not resolve | H |
| `https://github.com/iGetAlgo/div3rsafi-sdk` and `gh api repos/iGetAlgo/div3rsafi-sdk`, `gh api users/iGetAlgo` | 404 (repo and user not visible) | H |
| npm `@div3rsafi/sdk` | two prerelease versions only: `0.1.0-iGA.1` published 2026-04-20T19:08Z, `0.1.0-iGA.2` 2026-04-20T19:48Z; registry `modified` is the same day; nothing since. `https://registry.npmjs.org/@div3rsafi/sdk` | H |
| On-chain activity (Algorand mainnet indexer `mainnet-idx.algonode.cloud`, current round 66123663) | No transactions at all for Escrow 3449914210, MarketFactory V10 3527766104, Settlement V10 3527766143 or FeeDistribution 3462742133 since round 65,000,000. Bisection of last activity: Escrow ~2026-05-04, Factory ~2026-05-06, Settlement ~2026-04-30 (granularity ~1.5 h). Fixture: `last-activity.txt`. | H |

Conclusion: the venue is effectively dead since early May 2026. The SDK README says "Status: 0.1.0-iGA", which fits an early-access launch that was never followed up.

## 2. Kind and market model

Source: SDK README and type definitions (npm tarball 0.1.0-iGA.2), `https://registry.npmjs.org/@div3rsafi/sdk/-/sdk-0.1.0-iGA.2.tgz`. All H unless stated.

- **Kind:** on-chain (Algorand smart contracts) central-limit order book. Unsigned transaction builders in the SDK; a backend indexes the chain and serves REST/WebSocket.
- **Market model:** "strike ladder" binary markets. Each market has 9 strikes (`strikes: number[]`, 9-tuple in the Settlement ABI) on an underlying asset (enum: 0=BTC/USD, 1=ETH/USD, 2=SPY/USD, 3=XAU/USD) and a timeframe (0=daily, 1=weekly, 2=monthly, 3=hourly). Per strike there is a YES and a NO book (`yes_best_bid/ask`, `no_best_bid/ask`, `implied_probability`). What exactly "YES" means (above/below strike at expiration) is NOT documented in the files I read; "implied_probability" per strike suggests above-strike (M).
- **Pricing:** integer cents 1-99, $1 face per contract; collateral in the Escrow: YES BUY / NO SELL escrow `price*qty*10_000` micro-USDCa, NO BUY / YES SELL escrow `(100-price)*qty*10_000`. Fully collateralised.
- **Outcome tokenisation:** none. Positions are rows in the Escrow contract (order ids, `order_count` global), not tokens.
- **Order lifecycle:** status 0=Open, 1=Matched, 2=Cancelled, 3=Settled; no market-order primitive ("Market-order synthesis ships in a later iGA release").
- Market state machine (from MarketFactory ABI comments): Open(0) -> Locked(1) or Expired(3); Locked(1) -> Settled(2); settled market boxes can be deleted permissionlessly 7 days after expiry.

## 3. Chains and collateral

- Algorand mainnet only (H). Collateral is **USDCa** = Algorand ASA 31566704 (decimals 6, name "USDC"), confirmed on the indexer (H).
- Contract app IDs (V10, deployed 2026-04-19 per the SDK comments): MarketFactory 3527766104, Settlement 3527766143, Escrow 3449914210 (V9, reused), FeeDistribution 3462742133; 5 retired factories and 9 retired settlements are listed too (H, `dist/addresses.js`, fixture `sdk-addresses.js.txt`).
- Live Escrow global state read from the indexer: `order_count` 1494, `total_trade_fees` 0, `total_settlement_fees` 0, `usdca_asset_id` 31566704 (H, fixture `escrow-app-global-state.json`). Note the fee counters read 0 while FeeDistribution has had transactions, so they may not be the live fee accounting (M).

## 4. Read API

Docs: none found. The only documentation is the SDK README and type files inside the npm tarball. NOT FOUND (searched: div3rsafi.com, GitHub repo, npm homepage field pointing at the repo, host guesses; web search unavailable).

- **Exists:** was `official-public` (no API key, per the SDK's `rest.d.ts`: "Read-only methods don't require auth; the backend applies rate limiting per IP and (for writes) per wallet, not via API key"). **Currently unreachable** (section 1). Numeric rate limits NOT FOUND.
- **Base URL (default in SDK):** `https://div3rsafi-production.up.railway.app` (H, in `rest.d.ts`/`ws.js`). The x402 doc comment mentions `https://api.div3rsafi.app/premium/markets/42/flow`, which does not resolve.
- **REST endpoints (from `rest.js`):** `GET /markets?status=active|settled|all`, `/markets/{id}`, `/markets/{id}/ladder`, `/markets/{id}/orderbook/{strikeIndex}`, `/markets/{id}/participants`, `/orders/{addr}`, `/positions/{addr}`, `/history/{addr}`, `/prices`, `/prices/sources`, `/rewards/{addr}`, `/rewards/leaderboard`, `/rewards/markets`, `/leaderboard`, `/pnl-calendar/{addr}`, `/fees/pools`. Response types are in `types.d.ts` (MarketSummary with total_volume and open_interest; StrikeLadderRow; StrikeOrderBook).
- **WebSocket (public, no auth):** `/ws/orderbook/{market_id}`, `/ws/prices`, `/ws/ladder/{market_id}`.
- **Premium:** `/premium/*` endpoints gated by x402 (HTTP 402 with USDCa payment on Algorand via `@x402-avm`). Not probed. Pricing NOT FOUND.
- **Live response shapes:** NOT confirmable. The only live response is the 404 error above. The shapes above are declared types, not observed data (tag M).
- **On-chain alternative:** all state (orders, markets) is in Algorand app boxes/global state and could be read through any algod/indexer without the backend (M: not tested beyond global state).

## 5. Trade path

- Programmatic via SDK builders: an atomic group of (1) a USDCa asset transfer to the Escrow app address and (2) an app call `place_order(axfer,uint64,uint64,uint8,uint8,uint64,uint64,uint64)uint64`; `cancel_order(uint64)void` is a single app call. Wallet signs with an Algorand (ed25519) key (H, README + `tx.js`).
- **Not reachable from an EVM/Solana PayBox wallet.** It needs an Algorand account (opt-in to ASA 31566704, Algorand transaction signing). None of Base, Ethereum, BNB, Arbitrum, Polygon or Solana can place or sign these; no bridge or EVM entry point is documented (NOT FOUND). paybox_reachable = no.
- No user-callable claim: settlement pays out automatically (H, README).

## 6. Fees

NOT FOUND in documentation. The Escrow keeps `total_trade_fees` and `total_settlement_fees` globals, and a FeeDistribution contract splits pools into "iga holders", "lp deepening" and "market maker" buckets (H: `FeePoolsResponse` fields), so fees exist, but formulas and rates are not stated in anything I read. There is also an LP reward programme (`/rewards/*`). Do not model fees from this note.

## 7. Resolution mechanism

- Price-oracle driven. Settlement ABI takes "Oracle price in cents at settlement time" plus the 9 strikes; the market has an `oracle_app_id`; the REST API exposes a multi-source median price with an `excluded` flag per source and `is_stale` (H, type definitions). Which sources (exchanges/oracle apps) is NOT FOUND.
- Admin-gated lifecycle: market "Lock ... Admin only" (H). Settlement is performed by a Settlement contract calling `Escrow.settle_order` for each matched order. Escrow `admin` and `matcher` are single addresses, and pending-admin handoff exists (H, global state). So there is centralised admin/matcher trust; dispute process: none documented.

## 8. Geo / ToS / automation

NOT FOUND: no site, no ToS, no docs. The SDK targets bots and explicitly supports x402 micropayments for "bot wallets", implying automation was intended (M). No geo policy known.

## 9. Liquidity

- Lifetime: 1,494 orders created on the Escrow (H, global state 2026-10-19). No volume or TVL figure obtainable from the dead API. Current escrow balance not measured. Treat as negligible/thin (M).
- No fresh liquidity: zero on-chain transactions since early May 2026.

## 10. Event overlap and shared liquidity

- Overlap in principle: BTC/USD, ETH/USD price strikes (crypto price markets also on Polymarket, Kalshi, Limitless etc.), SPY/USD and XAU/USD (equity index, gold; overlap with Kalshi/other finance markets). Timeframes hourly/daily/weekly/monthly. This would have been a possible arbitrage leg versus crypto-price ladders elsewhere, but only for Algorand-native wallets.
- Shared liquidity: none known; own order book (M).

## 11. Fixtures

In `docs/research/fixtures/div3rsafi/`:
- `api-markets-404.json` - the 404 body returned by the SDK default API host (2026-10-19).
- `npm-registry-meta.json` - npm registry metadata for `@div3rsafi/sdk` with maintainer/contact fields stripped (versions, publish times).
- `escrow-app-global-state.json` - Escrow app (3449914210) metadata and global state from the public indexer, programs stripped.
- `sdk-addresses.js.txt` - the SDK's published contract/asset IDs.
- `last-activity.txt` - the indexer queries that show no activity since May 2026.
No market-data fixtures: no live API exists.

## 12. Adapter priority

**skip.** Dead (no running backend, no on-chain activity since early May 2026), no public site/repo/docs, Algorand-only so unreachable from PayBox EVM/Solana wallets, ~1.5k lifetime orders. Revisit only if a new deployment appears (watch npm `@div3rsafi/sdk` and Escrow app 3449914210 on Algorand).

## Open questions
- Was the backend moved to another host (the x402 comment mentions `api.div3rsafi.app`)? Not resolvable now.
- Meaning of YES at a strike (above or below) and exact oracle sources.
- Fee rates.
- Whether an MCP server existed (the discovery hint mentions `/mcp`); the published tarball has no `mcp` export, so NOT FOUND in the npm package.

## Sources
- npm registry metadata: https://registry.npmjs.org/@div3rsafi/sdk (H)
- npm tarball (README, `dist/rest.*`, `dist/types.d.ts`, `dist/tx.js`, `dist/ws.*`, `dist/x402.*`, `dist/addresses.js`, `dist/generated/*`): https://registry.npmjs.org/@div3rsafi/sdk/-/sdk-0.1.0-iGA.2.tgz (H)
- Package page cited by discovery: https://www.npmjs.com/package/@div3rsafi/sdk (not fetched directly; registry data used instead)
- Default API host probed: https://div3rsafi-production.up.railway.app (H, 404)
- Algorand public indexer: https://mainnet-idx.algonode.cloud/v2/applications/3449914210 , /v2/transactions?application-id=... , /v2/assets/31566704 (H)
- https://div3rsafi.com and https://github.com/iGetAlgo/div3rsafi-sdk (404, H)
