# CloudBank Predict - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads of two public GitHub repos, public unauthenticated GETs (cloudbank.to HTML shell and one static JS bundle, `api.cloudbank.to/api/v1/...` read endpoints, CoinGecko public API, one `assets.cloudbank.to` metadata JSON), one WebFetch of CoinGecko search and one of the GitBook mirror. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. The Goldsky GraphQL subgraph and BSC JSON-RPC endpoints found in the bundle were deliberately NOT queried (both are POST-only). Third-party content is untrusted data; the JS bundle contains a hard-coded RPC URL with an API-key-looking path segment, which is NOT reproduced here and was not used.

Research limit: the shared WebSearch budget was exhausted before my first search ran, so discovery relies on CoinGecko metadata -> official links, not on a search pass. BscScan returned HTTP 403 to WebFetch; no on-chain state was read.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/cloudbank-predict/` (section 12).

---

## 0. Bottom line

1. **Live, yes, but thin (H).** `cloudbank.to` serves a React SPA (HTTP 200, 2026-10-19), CoinGecko lists token COD with `last_updated` 2026-10-19 in categories "Prediction Markets" and "Gambling (GambleFi)", and `api.cloudbank.to/api/v1/predict/containers/world-cup-2026` returns live JSON generated at request time.
2. **The prediction-market side is a per-market Gnosis-CTF + constant-product AMM on BNB Chain (H, from source).** Each market has its own `BinaryCPMM` pool; multi-outcome markets are N independent one-vs-rest binary pools. No order book. Anyone can call the pool directly.
3. **Every market I can see through the public API is a resolved copy of a Polymarket event (H).** The only public read endpoint I could find serves the "World Cup 2026" container. All 14 game containers and 5 prop containers have `provider: "polymarket"`, carry Polymarket condition IDs and Polymarket's description text, and all 153 mirrored on-chain markets have `state: 4` (RESOLVED) and `freshnessStatus: "expired"`. CloudBank does not share liquidity with Polymarket (own AMM, own collateral) but copies its question set and resolution wording. That is where the overlap, and the arbitrage in principle, lives.
4. **Liquidity is negligible (H for the number, M for the unit).** Summed `totalVolume` over all 151 mirrored game markets = 22,705 COD, which at the CoinGecko price of 0.0367 USD is about 830 USD lifetime volume across the entire World Cup section (Polymarket's single Spain-Argentina Yes market showed 612,793 USD volume and 4.94M liquidity the same moment). Collateral for these markets is COD, the platform's own volatile token, not a stablecoin.
5. **Resolution is centralised (H, from source).** Binary markets settle through `OptimisticController.settle()` restricted to `authorizedSettlers` set by the market owner; the oracle (`SoraOracle`) accepts answers from one `oracleProvider` address and has no dispute flow ("Dispute flow is out of scope").
6. **No official trading or market-list API.** Orders are on-chain transactions. The documented `GET` surface is a UI backend for the World Cup container plus translations/visibility helpers; general market discovery is via a Goldsky subgraph (POST-only, not probed).
7. **adapter_priority = P2 (signal-only / thin), leaning skip.** Independent liquidity, yes; but ~0 depth, COD collateral, central resolver, no stable market-list API, and every visible market is already expired. Revisit if a non-copied, USDC/USDT-collateral market list with real TVL appears in the subgraph.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://cloudbank.to/` | 200, Cloudflare, Vite/React SPA shell (`/assets/index-CeaAV2Xa.js`, 2.1 MB). Footer string "2026 CLOUDBANK PROTOCOL". No server-side content. | H |
| `GET https://api.coingecko.com/api/v3/coins/cloudbank` | id `cloudbank`, symbol `cod`, categories incl. "Prediction Markets", BSC contract `0x800d454a087fac862d6336e46136e95d6a074fe1`, homepage `https://cloudbank.to/`, X handle `CloudBank_to`, docs repo `CloudBank-Skill/CloudBank-Doc`, `last_updated` 2026-10-19T05:02Z, price 0.0367 USD, market cap 214,418 USD, no market cap rank. | H |
| `GET https://api.cloudbank.to/api/v1/predict/containers/world-cup-2026` | 200, `generatedAt` 2026-10-19T05:04:23Z. Stats: containerCount 15, marketCount 173. | H |
| Every mirrored market in that container | `state` 4 (RESOLVED in `IMarket.MarketState`), `freshnessStatus` "expired"; container endAt range 2026-06-24 to 2026-07-19. | H |
| Contracts repo `SuLabsOrg/cloudbank-predict-contracts` | created 2026-09-02, single "Initial public snapshot" commit, last push 2026-09-02, Apache-2.0, 1 star, topics `bnb-chain`, `prediction-market`. Snapshot of upstream `contracts/predict` commit `7866efd9...` dated 2026-09-02. Contains no backend, frontend or subgraph. | H |
| Docs repo `CloudBank-Skill/CloudBank-Doc` | created 2025-11-26, last push 2026-01-08 (GitBook auto-commits). Roadmap says "Prediction Markets fully opened to all event categories" is Q3 2026, "Institutional API" and "Global Market-Maker Program" are Q4 2026 (i.e. not yet shipped as of 2026-10-19; no sign of either). Docs are > 9 months old: L for current-state claims. | H/L |
| Official site was "not found" by discovery | Found it: `cloudbank.to` via CoinGecko `links.homepage`. | H |

Verdict: **still_live = true** as a product, but the only publicly visible prediction content is an expired, copied World Cup set.

---

## 2. Kind and market model

- **Kind: on-chain AMM over Gnosis Conditional Tokens (CTF) with a centralised front-end/back-end.** [H, source `src/amm/BinaryCPMM.sol`, `src/ctf/*`, `src/factory/*`]
- **Binary markets:** one `BinaryCPMM` clone per market, reserves are the pool's own ERC-1155 YES/NO position balances. Quote: `out = floor(amountIn * rOut / (rIn + amountIn))` (comment: "0% fee CPMM"). Price: `getPrice(tokenId)` returns a 1e18 fixed-point probability from reserves (`y/(y+n)` form). Initial probability can be skewed at bootstrap (1 to 9999 bps). [H]
- **Outcome tokenisation:** Gnosis CTF ERC-1155. Binary index sets YES = 1, NO = 2; position IDs come from `getPositionId(collateral, collectionId)`. The API returns `yesTokenId` / `noTokenId` as decimal strings. [H]
- **Multi-outcome:** `MultiOutcomeMarket` "implemented as N independent binary markets (one-vs-rest)", with a winner index; each option has its own market, AMM and YES/NO token IDs. Sum of YES prices across options is therefore not forced to 1 (arbitrage within CloudBank itself). [H]
- **Scalar / range:** UI routes `/predict/range` exist (H, bundle route list) but no scalar contract exists in the repo. NOT FOUND (searched: all of `src/`).
- **Sports containers:** the API groups markets as `container` (a game or event) -> `items` (moneyline, spread, total, ...), each item mapping `providerMarketId` (Polymarket market id) to `localMarketId` (CloudBank market contract). [H]

## 3. Chains and collateral

- **Chain: BNB Smart Chain mainnet (chainId 56) only; BSC testnet (97) also configured.** [H, `foundry.toml`, bundle `tn()===56 ? "BSC Mainnet"`]. Roadmap mentions future multi-chain / Solana / Tron / Sui / TON (L, docs of 2025-2026, no evidence shipped).
- **Collateral is per-market and per-factory (H, bundle config and market metadata):**
  - COD (platform token) `0x800D454A087fAc862D6336E46136E95D6a074Fe1`, with its own factory `0xb06DA83207F57480D7DcFB43Ca79f21b8A6968af` and multi-outcome factory `0x4509229C1f4E14EE0f284A5C32892C18B1142F63`. All World Cup markets use COD (`tokenKey: "COD"`).
  - `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` is the default `collateral` and the stake token in `config/owned-ctf/bsc-mainnet/day1-bootstrap.json`; I believe this is Binance-Peg USDC on BSC (M, from my own knowledge of the address, not verified on-chain here).
  - USDT `0x55d398326f99059fF775485246999027B3197955` is configured as `usdt` with its own factory (H for presence in bundle; the contents of that factory are not read).
- **CTF address (mainnet, from bundle):** `0x293485D894b7C50C31a04797df7aD4F13dC991eC`; default factory `0x08447448ab8ba61520f0fd1f7adb170643f10b75`. [M: names come from minified constants, no on-chain confirmation.]
- The repo's own bootstrap config contains placeholder targets (`0x...dEaD`, `0x...bEEF`), i.e. it is not a deployment manifest. NOT FOUND (searched: repo for a deployments file; none).

## 4. Read API

- **Official documented API: none.** NOT FOUND (searched: cloudbank.to, GitBook repo SUMMARY and prediction-markets page, `matrixlabs-1.gitbook.io/cloudbank-docs/` which is a template placeholder page, contracts README). The Q4 2026 "Institutional API" roadmap item is not delivered as far as I can see.
- **Undocumented backend (public, no auth for these GETs) [H, probed 2026-10-19]:**
  - Base: `https://api.cloudbank.to/api/v1` (a `https://api-dev.cloudbank.to` dev host also appears in the bundle).
  - `GET /predict/containers/world-cup-2026` -> overview: `scope`, `container`, `sections[{key,label,count}]`, `stats`, `generatedAt`, `empty`. 78 KB.
  - `GET /predict/containers/world-cup-2026/sections/{games|props|bracket|map}` -> `containers[]` with `items[]` (provider metadata + `market` object). `games` 1.5 MB, `map` 1.6 MB, `props` 94 KB, `bracket` 96 B (empty).
  - `GET /markets/translations?marketIds=...|multiOutcomeIds=...` and `GET /markets/visibility` -> 400 `{"error":"invalid_request","message":"marketIds or multiOutcomeIds is required",...}` without params. Purpose inferred (i18n of market titles, hide list). M.
  - `GET /predict/portfolio` needs `Authorization: Bearer ...` (H from bundle; not called).
  - Authenticated endpoints seen in the bundle (not called): `/auth/nonce`, `/auth/login`, `/wallet/info|me|sign|withdraw|trade-fee-quote|operations/{id}`, `/card/*`, `/invite/*`, `/commission/*`.
- **`market` object fields (H):** `address`, `question`, `metadataUri` (https://assets.cloudbank.to/markets/prod/metadata/...json), `state` (int, `IMarket.MarketState`: 0 TRADING, 1 PROPOSED, 2 DISPUTED, 3 PAUSED, 4 RESOLVED, 5 CANCELLED), `conditionId`, `ammAddress`, `creator`, `yesPrice` (0-1 float), `yesTokenId`, `noTokenId`, `totalVolume`, `createdAtBlock`, `sourceSlug`, `description`, `endDate`, `freshnessStatus`, `collateralToken`, `tokenKey`.
- **No order book, no depth endpoint:** depth derives from `BinaryCPMM.getReserves()` / `quote()` on-chain. [H]
- **Subgraph:** Goldsky public GraphQL `https://api.goldsky.com/api/public/project_cmjzg6yk8y7h301vm4xrlhlkd/subgraphs/cloudbank-bsc-mainnet/v0.5.7-rc.2-claimable-markets/gn` (the version string is pinned and will rot). Probably the UI's market-list source (M). POST-only, NOT queried; schema NOT FOUND.
- **On-chain events (H, source):** `Swapped`, `LiquidityAdded`, `LiquidityRemoved`, `CollateralSwappedForOutcome`, `OutcomeSoldForCollateral`, `NativeFeeCollected`, `StateTransition`, `MarketResolved`, `OutcomeProposed`, `OutcomeDisputed`.
- **Auth and rate limits:** no key needed for the GETs above. Rate limits NOT FOUND (no `X-RateLimit-*` check beyond what I sent; I made about 12 requests, none throttled). Client-side timeout in the bundle is 12 s.
- **WebSocket:** NOT FOUND (searched: bundle for `wss://`; none seen).

## 5. Trade path

- **Programmatic and permissionless on-chain; no signed-order system.** [H, source]
  - `BinaryCPMM.swapCollateralForOutcome(outcomeTokenId, collateralAmount, minOutcomeOut)`: one call, pulls collateral by `transferFrom` (needs prior ERC-20 `approve`), splits via CTF, swaps the opposite side, returns the desired outcome token. `minOutcomeOut` is the slippage guard.
  - `sellOutcomeForCollateral(outcomeTokenId, outcomeIn, minCollateralOut)` and `sellAllOutcomeForCollateral(...)` need the pool to be an approved ERC-1155 operator on the CTF (`setApprovalForAll`).
  - `swap(tokenIn, amountIn, minOut)` outcome-for-outcome; `addLiquidity` / `removeLiquidity` for LP.
  - Redemption after resolution: CTF `redeemPositions(collateral, 0x0, conditionId, indexSets)`.
- **Gasless path:** `CloudBankVerifyingPaymaster` (ERC-4337 verifying paymaster, `src/paymaster/`) plus backend `/wallet/sign` and `/wallet/withdraw` suggest a backend-managed smart wallet for app users (M, inferred from endpoint names; not read in depth). An external agent does not need it.
- **Pause / admin risk:** `Pausable` appears in `PredictFeeRewardVault` only; `BinaryCPMM` has no pause (H, grep). Market state PAUSED exists in the controller interface. Whether the AMM refuses trades after resolution is not verified (NOT FOUND, not read).

## 6. Reachable through PayBox? -> **partial**

- BNB Smart Chain (56) is in PayBox's chain catalog (see `docs/research/06-paybox-platform.md`, H at that time). A BSC EVM wallet could in principle sign the two transactions needed: `approve(pool, amount)` on the collateral token and `swapCollateralForOutcome(...)` on the pool, via transaction proposals. Whether PayBox's proposal tooling accepts an arbitrary contract call to an unlisted BSC contract (versus only allow-listed plugins/ABIs) is NOT FOUND here and is the same open question as for the other BNB venues (Myriad).
- Practical blockers: COD collateral for all markets I can see (needs COD balance on BSC, ~215k USD market cap token, PancakeSwap V3 COD/USDT pair showed about 215k USD 24h volume on CoinGecko tickers, M); no live markets; contract addresses per market must be taken from an undocumented API or the subgraph.

## 7. Fees

- **Pool swap fee: 0% in the CPMM itself** (`quote()` comment "0% fee CPMM"; LPs earn no swap fee) [H, source]. LPs get impermanent-loss exposure with no fee income, unlike Polymarket-style or Uniswap-style pools.
- **"Native fee":** optional, set per pool at initialisation (`initializeWithNativeFee(..., nativeFeeBps, nativeFeeRecipient)`), `MAX_NATIVE_FEE_BPS = 1000` (10%). Charged in collateral on entry (`swapCollateralForOutcome` deducts from `collateralAmount` before split) and exit (`sellOutcomeForCollateral` deducts from gross collateral out); paid by the trader to `nativeFeeRecipient`, with routing to `PredictFeeRewardVault` ("reward-distribution version" reserved, not implemented). [H, source]
- **Actual deployed fee bps: NOT FOUND** (searched: repo configs, `ConfigurePredictNativeFee.s.sol` is a script with env-driven values; no on-chain read performed). Treat as 0 to 1000 bps until `nativeFeeBps()` is read.
- **Creation stake:** anti-spam stake in the factory flow (bootstrap config `stake_amount: 10000000`, token = collateral above). Returned to the creator on settlement, slashed to treasury on `cancelAsInvalid`. [H]
- **Oracle fee:** payable `requestOracleQuestion` pays `SoraOracle.oracleFee` in native BNB, refundable after 7 days if unanswered. [H]
- Gas: BSC gas only (plus paymaster-sponsored in the app).

## 8. Resolution mechanism and dispute risk

- **Intended flow:** owner/creator `proposeOutcome` or any user `requestOracleQuestion` (paying the oracle fee) -> `SoraOracle` answer -> `liveness` window -> `settle()` reports CTF payouts. [H, source `OptimisticController`]
- **Who can settle:** `settle()` is `onlySettler`; settlers are added via `setAuthorizedSettler` by the market owner. Market metadata of the sample market lists `"authorized_settler":"0x1E5d916695e4F69f8A23C643484E3443aE081CBC"`. [H]
- **Oracle:** `SoraOracle` "Only the oracleProvider can answer. Dispute flow is out of scope." `SoraYesNoOracleAdapter` bridges to the controller. Single-address trust. [H]
- **Disputes:** `disputeOutcome` can be called by anyone during liveness, but a DISPUTED market is then settled by the authorised settler via off-chain-resolved `settle(data)` (source comment: "settlement currently relies on off-chain resolution passed via `settle(data)`"). No bond, no token-holder vote, no UMA-style escalation. [H]
- **Admin:** owner can `cancelAsInvalid` (market CANCELLED). Contracts are owned (`Ownable`). Docs claim "Core contracts are non-upgradable" (L, docs from Nov 2025 to Jan 2026); `UpgradeFactory.s.sol` exists in the repo (factory upgrade path exists, H).
- **Copied wording risk:** the mirrored markets inherit Polymarket's text ("primary resolution source ... official statistics ... consensus of credible reporting may be used") but CloudBank's own settler, not UMA, decides. A cross-venue pair can therefore settle differently (basis risk) even when titles are identical.
- **Audit status:** docs promise two independent audits for core modules; no audit report found. NOT FOUND (searched: repo, docs, SUMMARY).

## 9. Geo / ToS / automation

- App-level wallet gating exists: bundle string "Account access restricted - This wallet cannot use CloudBank services right now. If you believe this is a mistake, submit an appeal" [H]. Whether that blocks direct contract calls: no, the contracts have no allowlist for traders (H, source), only a creator/importer whitelist in the factory (`ConfigureFactoryCreatorWhitelist`, `ConfigureFactoryImporterWhitelist`).
- ToS / privacy pages exist (`/terms` returned 200) but are SPA-rendered; text NOT READ (searched: HTTP shell only, no browser automation). Jurisdiction restrictions: NOT FOUND.
- Docs disclaimer page not read (NOT FOUND for content that matters here). No stated API automation policy.
- Open-source Apache-2.0 code: the contracts can be called by bots without permission.

## 10. Liquidity (all with date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Sum of `totalVolume` over 151 mirrored game markets | 22,705 COD (about 830 USD at COD 0.0367) | `.../sections/games`, 2026-10-19 | H number, M unit |
| Largest single market volume seen | 2,977 COD (Argentina moneyline) | World Cup overview, 2026-10-19 | H |
| Markets with zero volume | most spread/total lines (0 COD) | same | H |
| Live (non-resolved) mirrored markets | 0 of 153 | same | H |
| COD market cap | 214,418 USD, no rank | CoinGecko, 2026-10-19 | H |
| COD 24h volume on PancakeSwap V3 | about 215k USD (token, not prediction) | CoinGecko tickers, 2026-10-19 | M |
| Prediction TVL / OI | NOT FOUND (needs subgraph or DefiLlama; not probed) | | |

For scale, the matching Polymarket Spain-vs-Argentina "Yes" market showed liquidity 4.94M and volume 612.8k in the same payload (H, copied from Polymarket via CloudBank's API, date of copy unknown).

## 11. Event overlap and independence

- **Overlap:** sports (FIFA World Cup 2026 moneyline / spread / totals) with Polymarket, and via Polymarket's question set probably Kalshi. Crypto / macro / politics: NOT FOUND (no other container reachable; roadmap says all categories open in Q3 2026; UI routes `/predict/esports`, `/predict/sports/world-cup/*`, `/predict/range`, `/predict/enhanced` exist).
- **Shared liquidity:** NO shared liquidity with Polymarket. CloudBank mirrors metadata only (Polymarket `conditionId`, `clobTokenIds`, `outcomePrices` are embedded in `providerMetadata`) and runs its own CPMM, so it is an independent arbitrage leg in theory. The embedded Polymarket price fields are CloudBank's cached copy, not a live CloudBank quote; do not use them as venue prices.
- **Interpretation of the price gap in the fixture (M):** Spain moneyline local `yesPrice` 0.954 vs embedded Polymarket 0.425; the market is RESOLVED so the local price reflects the final outcome, the Polymarket copy is a stale snapshot. This is not an arbitrage.
- Within-venue: multi-outcome one-vs-rest pools can sum to != 1.
- Shares liquidity with: none found; `liquidity_shared_with` = "none (copies Polymarket question set and wording, separate AMM pools)".

## 12. Fixtures

Directory `docs/research/fixtures/cloudbank-predict/` (all < 50 KB, trimmed copies of unauthenticated GETs made 2026-10-19):

- `predict-containers-world-cup-2026.trimmed.json` (first 3 of 12 items, ~22 KB) from `GET /predict/containers/world-cup-2026`.
- `predict-containers-world-cup-2026-sections-games.trimmed.json` (1 container, 2 items, ~15 KB) from `GET /predict/containers/world-cup-2026/sections/games`.
- `markets-translations-400.json` error shape from `GET /markets/translations` without params.

## 13. Adapter notes (if ever built)

1. Market list: subgraph (needs a POST GraphQL read; schema not captured) or the container API above. Treat the container API as unstable and UI-only.
2. Price: `BinaryCPMM.getPrice(yesTokenId)` (1e18) via `eth_call`; depth: `getReserves()`; executable price for size: `quote(tokenIn, amountIn)`, subtract `nativeFeeBps` both ways.
3. Skip markets where `state != 0` (TRADING) or `freshnessStatus == "expired"`.
4. Normalise collateral: only COD seen; convert at COD/USD or exclude. Do not treat COD-collateral prices as USD-denominated without a haircut for COD price risk (a 10% COD move changes the payout in USD terms).
5. Link to other venues using the embedded Polymarket `conditionId` (strong key), but require a resolution-source check because the settler differs.

## 14. Not found

- Official API documentation, API key scheme, rate limits, WebSocket.
- Subgraph schema and any non-World-Cup market list; TVL/OI; DefiLlama listing (not checked).
- Deployed `nativeFeeBps` per pool; creation fee amounts; audit reports.
- ToS / privacy text, geo restrictions beyond a wallet-level "access restricted" message.
- On-chain verification of any address (BscScan blocked WebFetch with 403; JSON-RPC is POST).
- Evidence that the Q3 2026 "all event categories" or Q4 2026 "Institutional API" milestones shipped.

## 15. Suspicious content

None aimed at an AI agent. Notes: the JS bundle embeds a full-URL RPC endpoint with an apparent API key in the path (not copied or used); an `agents`/MCP well-known probe was not performed on this host.

## 16. Sources

1. https://github.com/SuLabsOrg/cloudbank-predict-contracts (README.md, SOURCE.md, foundry.toml, `config/owned-ctf/bsc-mainnet/day1-bootstrap.json`, `src/amm/BinaryCPMM.sol`, `src/factory/BinaryCPMMFactory.sol`, `src/ctf/BinaryMarketLib.sol`, `src/controllers/OptimisticController.sol`, `src/controllers/MultiOutcomeMarket.sol`, `src/oracle/SoraOracle.sol`, `src/fees/PredictFeeRewardVault.sol`, `src/interfaces/IMarket.sol`) and GitHub API repo metadata, read 2026-10-19. H.
2. https://github.com/SuLabsOrg/ (org listing: sibling repos SoraOracle, veritywtf) - H (metadata only).
3. https://github.com/CloudBank-Skill/CloudBank-Doc (README.md, SUMMARY.md, `readme/product-architecture/prediction-markets.md`, `risk-management-and-security.md`, `roadmap.md`), last push 2026-01-08. H for content, L for currency.
4. https://api.coingecko.com/api/v3/coins/cloudbank and /search?query=cloudbank, /coins/cloudbank/tickers, 2026-10-19. H.
5. https://cloudbank.to/ and its bundle https://cloudbank.to/assets/index-CeaAV2Xa.js (API base, route list, factory constants, endpoint names), 2026-10-19. H.
6. https://api.cloudbank.to/api/v1/predict/containers/world-cup-2026 (+ `/sections/{games,props,map,bracket}`), https://api.cloudbank.to/api/v1/markets/translations, /markets/visibility, 2026-10-19. H.
7. https://assets.cloudbank.to/markets/prod/metadata/2026/07/f5e57fe7-ccbe-4a55-a5d5-ecd76706f799.json (market metadata, `authorized_settler`, `quoteToken`). H.
8. https://matrixlabs-1.gitbook.io/cloudbank-docs/ (template placeholder, nothing useful). H.
9. `docs/research/06-paybox-platform.md` in this repo for the PayBox chain catalog (BNB 56 present). H at that time.
