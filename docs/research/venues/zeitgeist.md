# Zeitgeist (zeitgeist.pm) and its successor app Fenyx: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official sites, official GitHub (via `gh api`), public unauthenticated GETs to the app, its indexer `/status` and the Polkadot Hub testnet Blockscout. Nothing was signed, posted or paid. No POST was sent, so the GraphQL indexer was NOT queried (it needs POST).

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means read through the WebFetch summariser.

Limitation: the shared WebSearch budget was exhausted before this task started, so no web search was possible. Everything below comes from first-party pages, GitHub and public APIs. No third-party news or announcement search was done.

## Verdict

**adapter_priority: skip (revisit if Fenyx launches on mainnet).**

- The old Zeitgeist user-facing venue is gone: `app.zeitgeist.pm` now serves **Fenyx**, "Forecast markets for Polkadot ... powered by Zeitgeist", with the banner "Fenyx is currently in beta. It runs on the Polkadot Hub test network only, with test USDC." [H, https://app.zeitgeist.pm , fetched 2026-10-19]
- Fenyx is a full EVM rewrite (Gnosis Conditional Tokens + a Solidity port of Zeitgeist's LMSR "neo-swaps" pool + Reality.eth oracle) deployed on **Polkadot Hub TestNet** (chain id 420420417, gas in PAS). Markets were created 2026-10-14 and 2026-10-15; the collateral is a mock USDC whose `mint(address,uint256)` the app calls (access control not verified, source unverified on Blockscout). No real money. [H, section 3]
- The legacy Zeitgeist Substrate parachain (para 2092, ZTG) shows no usable venue surface: no frontend (replaced), the mainnet GraphQL indexer `processor.rpc-0.zeitgeist.pm` times out (DNS resolves to 139.162.140.54, TCP/TLS never answers, 2026-10-19), the Ghost blog is suspended (HTTP 402 "Site unavailable"), core repo last push 2025-12-04, UI repo last push 2025-11-17. [H]
- Chain liveness of the parachain itself is **unverified** (a JSON-RPC call is POST/WS and was out of scope). polkadot-js/apps still lists Zeitgeist (paraId 2092) under "live chains only" with an OnFinality RPC, file last touched 2026-07-13. [M]

**Revisit triggers (scriptable):**
1. `GET https://indexer.zeitgeist.pm/status` currently returns `{"hub":{"id":420420417,...}}` (testnet). A different chain id means a mainnet deployment. Fixture: `docs/research/fixtures/zeitgeist/fenyx-indexer-status.json`.
2. The app banner string "Test USDC only" disappears from `https://app.zeitgeist.pm`.
3. PayBox gains Polkadot Hub as an EVM network (then plain `approve` + `buy` transaction proposals would work).

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| zeitgeist.pm landing page | Up, static, last-modified 2025-02-12, no mention of Fenyx or any sunset | H: curl headers, page text |
| app.zeitgeist.pm | Up, but it is the **Fenyx** testnet beta (Vercel-hosted). Old Zeitgeist app replaced | H: page text, `<title>Fenyx: Forecast markets for Polkadot` |
| docs.zeitgeist.pm | Up (Docusaurus, "(c) 2024"), documents the legacy parachain only; repo last pushed 2024-11-25 | H: page, `gh api repos/ZeitgeistPM/documentation` |
| blog.zeitgeist.pm / zeitgeist.ghost.io | Down: TLS cert mismatch on blog host; Ghost host returns HTTP 402 "Site unavailable ... If you're the owner, email us". That is a suspended Ghost(Pro) site, not a payment requirement of an API. Stopped there | H: curl |
| Legacy mainnet indexer `processor.rpc-0.zeitgeist.pm/graphql` (from subsquid README) | Unreachable (timeout). `processor.zeitgeist.pm` and `processor.bsr.zeitgeist.pm` also fail (timeout / SSL reset) | H: curl 2026-10-19 |
| Legacy parachain (para 2092) | Probably still producing blocks, not verified | M: polkadot-js/apps `productionRelayPolkadot.ts` lists it; its own RPC line is commented out (issue 11215) |
| ZTG token | CoinGecko API has no Zeitgeist/ZTG entry: `/coins/zeitgeist` returns "coin not found" and `/coins/list` (22,340 coins) has no id/name containing "zeitgeist" and no symbol "ztg". DefiLlama protocol list (8,758) has no Zeitgeist or Fenyx. CoinMarketCap `currencies/zeitgeist` is a "preview page" (45.03M circulating, 108.36M max supply, tagged Prediction Markets / Polkadot Ecosystem) | M/L: CG API, DefiLlama API, CMC page (fetch-summarised) |
| GitHub | `ZeitgeistPM/zeitgeist` pushed 2025-12-04 (last commit 2025-12-01 "Update integration test for valid relay chain timestamp"; async backing for 6 s blocks merged 2025-11-26; latest release v0.6.1 on 2025-08-07; open PR 1457 "Bump version to 0.6.2" last updated 2025-12-23). `ZeitgeistPM/ui` pushed 2025-11-17. Not archived. **No Fenyx repo found** in the org or via GitHub repo search (likely private) | H |
| Wind-down announcement | NOT FOUND (searched: zeitgeist.pm, docs, GitHub org issues/PRs for sunset/wind/deprecat/Fenyx, blog (suspended); web search unavailable) | - |

The CMC-sourced hint in the task ("likely legacy (L)") is confirmed in spirit: the legacy venue has no reachable surface. The brand survives as Fenyx on a testnet.

## 2. Kind and market model

### Fenyx (current app) [H unless noted]
- Kind: on-chain EVM prediction market, **per-market LMSR AMM** (no order book). One `NeoSwapsPool` per market, deployed as an EIP-1167 clone; the pool's ERC-20 balance is the LP share (e.g. "Zeitgeist LP #24", symbol ZLP-24, 6 decimals). Source header: "One LMSR pool per market, ported from Zeitgeist `zrml-neo-swaps` (v0.6.2, non-combinatorial)". Verified source on Blockscout. [H]
- Outcome tokenisation: **Gnosis Conditional Tokens (ERC-1155)** at `0x4103d0c53de8980415d02d35bf3e20f9708de487`, position ids derived from the condition id (`CTFHelpers`). 247 holders. Binary markets are 2-outcome, categorical up to 8 (`MIN_OUTCOMES = 2`, `MAX_OUTCOMES = 8`). A sentinel `INVALID_OUTCOME` pays every outcome equally. Scalar is done as buckets (e.g. "Below $60k / $60k to $70k / ...") not true scalar. [H]
- Pool price bounds: spot price kept within 0.5 to 99.5 cents (`MIN_SPOT_PRICE = 0.005e18`, `MAX_SPOT_PRICE = 0.995e18`). [H]
- Live data (app, 2026-10-19): 25 markets (12 active, 8 resolved, 3 closed, 1 invalid, 1 in arbitration), 14 binary and 11 with 3 to 8 outcomes. Categories: Crypto 8, Polkadot 4, Culture 3, Sports 3, Economics 3, Weather 2, Other 2. [H, fixture `fenyx-app-markets-sample.json`]

### Legacy Zeitgeist parachain [H from repo README, M for current usage]
- Substrate chain, markets are categorical, scalar and (from Zeitgeist 2.0) combinatorial. Modules: `neo-swaps` (LMSR as constant-function MM, the current default AMM), `orderbook`, `parimutuel`, `swaps` (Balancer CFMM, legacy, "Sunset old AMMs and their pools" issue from 2023-11), `court`, `authorized`, `global-disputes`, `futarchy`. Outcome assets are pallet-level `Asset` ids, not ERC tokens. https://github.com/ZeitgeistPM/zeitgeist
- Docs for LMSR pools and the SDK are in the `documentation` repo (last push 2024-11-25), partly stale. [M]

## 3. Chains and collateral

- **Fenyx**: Polkadot Hub TestNet, chain id 420420417 (hex 0x190f1b41), native token PAS (Paseo), RPC `https://eth-rpc-testnet.polkadot.io/`, explorer `https://blockscout-testnet.polkadot.io`. Collateral is a mock USDC (6 decimals, `0xeb638324aecac23207f6f1d81d651d1638511d2a`, name "USD Coin", total supply about 4.07M, 255 holders, source unverified); the app's ABI exposes `mint(address,uint256)`. Worthless. [H: app JS bundle config, Blockscout]
- The same bundle also carries a **Base Sepolia** (chain 84532) deployment config, selectable by `NEXT_PUBLIC_NETWORK=base-sepolia`; testnet too, not probed. [M, bundle only]
- Contracts (Hub testnet, from the public bundle config; saved in `fixtures/zeitgeist/fenyx-hubtestnet-deployment.json`): MarketManager `0xefbcf29a...5f8` (verified source; Blockscout counts only 12 top-level txs, latest 2026-10-14, so most market creation goes through another route), PoolFactory `0x037665da...685` (verified), NeoSwapsPool implementation `0x4ec03278...473` (verified), ThresholdArbitrator `0x75d059b6...e84`, RealityAdapter `0x8b66f053...b7a`, Reality.eth ERC20 `0xeb8409ab...8d90`. [H: Blockscout address and smart-contract endpoints]
- **Legacy**: Substrate parachain 2092 on Polkadot (migrated from Kusama). Collateral ZTG plus bridged foreign assets: UI config lists DOT (foreign asset 0) and USDC from Asset Hub (foreign asset 4, parachain 1000). [H: `ui` repo `lib/constants/foreign-asset.ts`]

## 4. Read API

**exists: onchain-or-subgraph-only** (no documented public API; the only usable indexer is an app-internal one).

Fenyx (undocumented, taken from the app's own bundle, so tag M for stability):
- Indexer base `https://indexer.zeitgeist.pm` (a **Ponder** server; GET `/graphql` serves the GraphiQL playground).
  - `GET /status` returns `{"hub":{"id":420420417,"block":{"number":14622188,"timestamp":1792372092}}}` (block time 2026-10-19 01:08:12 UTC, so it is live). [H, fixture `fenyx-indexer-status.json`]
  - `POST /graphql` (not called). Entities seen in the app's queries: `markets` (id, creator, oracle, resolver, conditionId, outcomeCount, closeTime, creatorFee, minOracleBond, arbitrationCap, stage, realityQuestionId, resolvedOutcome, pool, liquidity, poolValue, volume, tradeCount, metadata, `outcomes{index name price positionId}`, `question{answers...}`), `pools{id swapFee}`, `marketStats` (hourly), `candles`, `trades{account side outcome amountIn amountOut avgPrice timestamp tx}`, `positions`, `lpPositions`, `bondEvents`. [M, extracted from JS]
  - `GET /claim-args/{id}` and `GET /ruling-args/{id}` (helpers for Reality.eth claims and arbitration rulings). [M]
- Server-rendered JSON: `GET https://app.zeitgeist.pm/markets` embeds the full market list (question, outcomes with price and change24h, status, lpFee, creatorFee, liquidity, volume, volume24h, traders, bonds, answers, chain ids and pool address) in the Next.js flight payload. Usable as a scrape of last resort. `robots.txt` allows `/` and disallows `/api/` and `/portfolio`; do not hit `/api/`. Sitemap at `/sitemap.xml`. [H, fixture `fenyx-app-markets-sample.json`]
- On-chain reads (no indexer needed): per-pool `spotPrices()`, `reserves()`, `quoteBuy(outcome, amountIn)`, `quoteSell(outcome, amountIn)`, `value()`, `liquidity()`, `swapFee()`, `creatorFee()`, `protocolFee()`; MarketManager `getMarket`, `marketCount`, `status`, `marketFees`, `currentOracleBond`. Events `BuyExecuted`, `SellExecuted`, `JoinExecuted`, `ExitExecuted` give a trade feed. [H, fixture `fenyx-neoswapspool-abi-functions.json`]
- Auth: none observed. Rate limits: NOT FOUND (searched: robots.txt, bundle, docs). WebSocket: NOT FOUND (the app polls).

Legacy: official `@zeitgeistpm/sdk` and a Subsquid GraphQL indexer (`/graphql`, `markets`, `pools`, `assets`, `accountBalances`, `historicalAccountBalances`; 30 s to 2 min lag per the SDK docs) existed, but the mainnet endpoint is unreachable today. Docs: https://docs.zeitgeist.pm (SDK v2 `indexer.md`). [H for docs, H for unreachability]

## 5. Trade path

- **Fenyx**: plain EVM transactions, no off-chain order signing. `USDC.approve(pool, amount)`, then `NeoSwapsPool.buy(outcome, amountIn, minAmountOut, deadline)` or `.sell(outcome, amountIn, minAmountOut, deadline)`; LP via `join(shares, maxCollateralIn, deadline)` / `exit(...)`; fees pulled via `withdrawFees()`. Winnings via `MarketManager.claim`. Slippage protection and deadlines are built in. [H: verified ABI]
- **Legacy**: Substrate extrinsics (`neoSwaps.buy/sell/join/exit`, `orderbook`, `hybridRouter`), sr25519/ed25519 account signing through polkadot-js or the SDK. Not EVM. [H: runtime `lib.rs` call filters]
- No bot/API-key trading interface.

## 6. PayBox reachability

**paybox_reachable: no.**
- Fenyx is plain EVM, so mechanically it fits "transaction proposal" signing, but it lives only on Polkadot Hub TestNet (and a Base Sepolia config) with worthless mock USDC, and Polkadot Hub is not among the chains named for PayBox (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...). [M]
- Legacy needs Substrate keys; an EVM wallet cannot sign those extrinsics. [H]
- PayBox `discover_plugins` for "zeitgeist polkadot prediction market" returns no plugin. [H, 2026-10-19]

## 7. Fees

- **Fenyx** (read from the pool and manager source and the market pages) [H]:
  - LP swap fee: chosen by the pool deployer within the manager's bounds (constructor defaults `minSwapFee` 0.1%, `maxSwapFee` 10%, absolute ceiling `SWAP_FEE_CEILING` 50%; all owner-adjustable). Observed across the 25 markets: 13 at 2%, the rest between 0% and 10% (one market at 10%). Paid by the trader out of collateral in/out, accrues to LPs through a fee-per-share accumulator, pull-based.
  - Creator fee: chosen at creation up to `maxCreatorFee` (default 1%); observed 0% (12 markets), 0.2%, 0.5%, 1%.
  - Default bonds (constructor): creation 250 USDC, minOracle 50 USDC, arbitrationCap 5,000 USDC, oracleBps 100 (1% of time-weighted pool value), arbitrationMultiplier 8.
  - Protocol fee: `protocolFee` defaults to 0 (constructor sets 0); the UI shows "0% protocol". Admin can change it (`setFees`).
  - LP exit fee 0.1% while the market is active (`EXIT_FEE`).
  - Gas in PAS. Example from the UI: a 100 USDC buy at 4.0% LP + 0.5% creator shows "Fees $4.50".
- **Legacy mainnet** (runtime constants in `runtime/zeitgeist/src/parameters.rs`) [H]: `NeoSwapsMaxSwapFee` 10%, `MaxCreatorFee` 1%, Balancer-style `MaxSwapFee` 10% and `ExitFee` 0.01%. Bonds: advised market 200 ZTG, permissionless (ValidityBond) 1000 ZTG, oracle bond 200 ZTG, outsider bond 400 ZTG, dispute bond 2000 ZTG, appeal bond 2000 ZTG.

Implication: LP fees of 2% to 10% per trade plus creator fees make small cross-venue edges unreachable; a scanner would need a spread above roughly 4% to 5% round trip.

## 8. Resolution and dispute risk

- **Fenyx**: **Reality.eth (ERC-20 variant, bonds in USDC)** via `RealityAdapter`. Opening bond B = max(minOracle, oracleBps x time-weighted pool value over the window before close); designated oracle answers first, outsiders after the oracle window with `outsiderMultiplier` x B; each challenge at least 2x the last bond; the creator posts a no-show deposit. `ThresholdArbitrator` accepts arbitration once the Reality bond reaches min(`arbitrationMultiplier` (8) x B, `arbitrationCap` (5,000 USDC)), for a fee of B; the **default arbitrator/resolver is the Fenyx team Safe**. Crypto price markets are answered by a "price-feed bot" from CoinGecko. [H: `MarketTypes.sol`, `MarketManager.sol`, market pages]
- Centralisation / admin-key risk (testnet notes say so explicitly): `MarketManager` has `pause`, `adminCloseMarket`, `adminDestroyMarket`, `adminResolve` under an emergency role; on this testnet deployment admin, emergency roles, default resolver, treasury and arbitrator-owner are a **single guardian key**, and an older Safe still holds some roles. Unaudited as far as found (NOT FOUND: any audit report, searched: app, docs, repo README). [H for the contract roles and the notes in the bundle]
- Resolution examples live: market 8 "Polkadot Hub DeFi TVL > $500M end of Q3 2026" is in arbitration after a 4-step bond escalation (52.8, 105.6, 211.3, 422.5 USDC) between two answerers; several crypto markets sit "awaiting answer" after close. Test data quality is poor: market 23 is titled "ETH/USD" but has BTC-scale buckets ($60k to $80k); the Best Picture market has placeholder outcomes "Contender A" to "Contender E". [H]
- **Legacy**: oracle report, then a dispute period, then `authorized` or `court` (decentralised jurors, the UI env example has `NEXT_PUBLIC_SHOW_COURT=false`), with `global-disputes` as the fallback that picks the outcome with the most locked ZTG. `MaxDisputes` = 1. Market curation by an Advisory Committee for advised markets. [H: repo README, runtime params, docs `market-rules`]

## 9. Geo, ToS, automation

- Fenyx: no terms of service, geoblock text or API terms found on the app, docs or repo (NOT FOUND, searched: app footer, `/terms`-style paths via sitemap, bundle). Only `robots.txt` (allow `/`, disallow `/api/` and `/portfolio`). [H]
- Legacy app config example sets `NEXT_PUBLIC_NOT_ALLOWED_COUNTRIES=["US"]`, i.e. the old UI geoblocked the US; the value is from `.env.example` so treat as M. Privacy policy only at https://zeitgeist.pm/privacy.pdf (not read).
- Automation: nothing prohibits reading public chain data; no automation policy published.

## 10. Liquidity

- **Fenyx (test money only, 2026-10-19, app list)**: 25 markets, cumulative volume about 2.06M test USDC, summed pool value about 404k test USDC, 24h volume about 423 test USDC across all markets. Largest by volume: "Who wins the 2027 NBA Finals?" 389k (4,373 "traders", 10% LP fee), Best Picture 321k. The activity pattern (few repeating addresses on the home feed, "Trades 1,908" on a market whose activity table said "No trades yet") suggests seeded or bot volume. [H for numbers, M for interpretation]
- **Legacy mainnet**: NOT FOUND (searched: DefiLlama protocols and chains, CoinGecko, CMC page, indexer unreachable). The UI env example hides market id 674, so at least several hundred markets once existed. [L]
- Nothing measurable in real USD.

## 11. Event overlap with other venues

Fenyx test markets cover: BTC, ETH and DOT price thresholds at 31 Dec 2026 or 30 Nov 2026, Fed funds target after the December 2026 FOMC, US CPI YoY November 2026, 2027 NBA Finals, 2027 Six Nations, Eurovision 2027, 2027 Oscars Best Picture, hottest year on record, plus Polkadot-specific questions (JAM go-live, Hub accounts and TVL). The macro, sports, crypto and awards categories overlap Polymarket and Kalshi, but prices are synthetic test prices (Eurovision "France 99c", Best Picture "Contender D 69c") with no arbitrage meaning. Polkadot-ecosystem questions are unique to this venue. Legacy history: general political, sports and crypto markets, thin.

## 12. Shared liquidity

None found. Fenyx has its own per-market LMSR pools and mock collateral; legacy Zeitgeist is its own chain. If Fenyx goes to mainnet it would be an independent leg but with a very high fee floor (2% to 10%).

## 13. What an adapter would need if Fenyx launches on mainnet

1. Market list: `markets` from the Ponder GraphQL (needs POST) or the `/markets` page payload; map `conditionId`/`positionIds` to the aggregator's market key.
2. Prices: `spotPrices()` per pool (sum is 1 for the conditional-on-valid view), executable price via `quoteBuy`/`quoteSell`, minus LP and creator fee.
3. Fees must be netted in: LP fee, creator fee, protocol fee, plus gas.
4. Resolution risk: model Reality.eth finality (challenge window per market), arbitration by a team Safe, and admin emergency roles.
5. Execution: `approve` then `buy`/`sell` on the pool, ERC-1155 positions held by the trader; claims via the manager.

## Sources

- https://app.zeitgeist.pm , `/markets`, `/market/2`, `/market/15`, `/robots.txt`, `/sitemap.xml` and its public `_next/static` JS chunks (2026-10-19) [H]
- https://indexer.zeitgeist.pm/status (GET, 2026-10-19) [H]
- https://zeitgeist.pm (landing, fetched via WebFetch and curl), https://docs.zeitgeist.pm (home, `getting-started`, `faq`) [H]
- https://zeitgeist.ghost.io/rss/ and https://blog.zeitgeist.pm (HTTP 402 "Site unavailable" / cert mismatch) [H]
- https://github.com/ZeitgeistPM/zeitgeist (README, `runtime/zeitgeist/src/parameters.rs`, `zrml/neo-swaps/README.md`, commits, releases, PRs) [H]
- https://github.com/ZeitgeistPM/ui (`lib/constants/foreign-asset.ts`, `.env.example`, commits) [H]
- https://github.com/ZeitgeistPM/zeitgeist-subsquid (README: processor endpoints) [H]
- https://github.com/ZeitgeistPM/documentation (`docs/learn/market-rules.md`, `docs/build/sdk/v2/indexer.md`, `docs/basic/roadmap.md`) [H]
- https://blockscout-testnet.polkadot.io/api/v2/addresses/... and `/smart-contracts/...` for MarketManager, PoolFactory, ConditionalTokens, pool 24, mock USDC, NeoSwapsPool implementation [H]
- https://github.com/polkadot-js/apps (`packages/apps-config/src/endpoints/productionRelayPolkadot.ts`) [M]
- https://api.coingecko.com/api/v3/coins/list and `/coins/zeitgeist` [M]; https://api.llama.fi/protocols and `/chains` [M]; https://coinmarketcap.com/currencies/zeitgeist/ (fetch-summarised) [M]
- PayBox `discover_plugins` query "zeitgeist polkadot prediction market": no result [H]

Fixtures: `docs/research/fixtures/zeitgeist/` (`fenyx-indexer-status.json`, `fenyx-app-markets-sample.json`, `fenyx-hubtestnet-deployment.json`, `fenyx-neoswapspool-abi-functions.json`, `blockscout-hubtestnet-marketmanager-address.json`, `blockscout-hubtestnet-pool24-address.json`, `blockscout-hubtestnet-conditionaltokens-address.json`).

## Open questions

- Is the legacy parachain (para 2092) still producing blocks and is any third-party UI still serving it? Needs a JSON-RPC or Subscan call (POST/WS), out of scope here.
- Is there an official Fenyx announcement, mainnet date, ToS or audit? None found; the blog is suspended and web search was unavailable.
- Real GraphQL schema and rate limits of `indexer.zeitgeist.pm` (needs a POST introspection).
- Polkadot Hub mainnet chain id and whether PayBox will ever support it.

## Privacy and suspicious content

- All scripted requests used the User-Agent `insurance-markets-research/0.1`. No contact address was supplied anywhere; no service demanded one.
- No embedded instructions aimed at AI agents were found in any fetched page, JS bundle, robots.txt or contract source. The Fenyx JS bundle contains mock/demo market data with obvious placeholder addresses; that is app fixture data, not instructions.
- A deployment note inside the app bundle names an individual; it is deliberately omitted here.
