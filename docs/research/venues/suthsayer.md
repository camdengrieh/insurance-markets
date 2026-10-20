# Suthsayer (suthsayer.xyz) - venue spec

Researched 2026-10-19. Verdict: **skip**. Hackathon/testnet-grade project, no mainnet deployment found, no read API, listed "live markets" and volumes are static page content, not on-chain data.

Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Is it live?

- https://www.suthsayer.xyz returns HTTP 200, served by GitHub Pages (`server: GitHub.com`, last-modified 2026-09-01). [H]
- The site is a static single HTML file (CNAME to `islandersfan2025.github.io`), repo `Islandersfan2025/SuthsayerRep`, description "Prediction Market", last push 2026-09-01. [H]
- Domain registered 2026-04-14 (GoDaddy whois). Apex `suthsayer.xyz` has a TLS cert mismatch (only `www` works). [H]
- Site roadmap says "Phase I: Genesis launch on Unichain Sepolia" and "full migration to Unichain Mainnet in Phase III". So the venue is a testnet product. [H]
- The "Live markets" cards with $18.6K-$118K volume and $8.4K-$51K liquidity are hard-coded HTML (12 cards, e.g. "Will BTC exceed $100k by end of 2026?" 67c/33c, $82.4K vol). The page script never reads volume from chain; the only data fetch is `http://localhost:8787/api/suthsayer-feed` (a developer's local machine). Treat the volumes as fabricated/demo data, not liquidity. [H] (page source, lines around the `FEED_API` constant)
- Several cards reference past dates (e.g. NFL opener Sep 13, "Sonic Network ... Sep 30", World Cup opener Jun 11) while still displayed as live; consistent with stale static content. [H]

## Kind and market model

- Intended design: binary YES/NO, social-created markets (a Bluesky/AT Protocol post tagged `#Suthsayer` triggers `createMarket`), settled by Chainlink CRE workflows. [H] https://github.com/Islandersfan2025/SuthsayerRep README
- Actual contract in repo `Islandersfan2025/SuthsayerPM` (`src/market/SuthsayerPredictionMarket.sol`): Gnosis CTF-style split/merge. `splitPosition(marketId, collateralAmount, receiver)` charges `feeBps` and mints YES and NO ERC-20 `OutcomeShareToken`s; `mergePositions` burns both for collateral; `resolveMarket(marketId, outcome)` is `RESOLVER_ROLE` only; `redeem` pays winners. Roles: OPERATOR, RESOLVER, PAUSER, DEFAULT_ADMIN. There is NO order book or AMM in this contract. [H] raw source read via gh api.
- The "Uniswap v4" claim: separate repo `Suthsayer/SuthsayerHook` is "a Uniswap v4 LVR-protection Hook" (dynamic fees, shock score, time-sliced execution), deployed on **Unichain Sepolia** at `0x689aD56A94286a02Bb29b5df9Bd155d4B6f170C0` (contract confirmed via Unichain Sepolia Blockscout, unverified source). It is generic anti-LVR plumbing, not itself a prediction market. Outcome tokens could theoretically be traded in a v4 pool with this hook, but no pool/market link was found. [H] README + Blockscout GET; the link to markets is [L].
- Hint said "AMM inferred from Uniswap v4 [M]": only partly true. Trading would be via v4 pools on testnet, if at all.

## Chains and collateral

Sources contradict each other (itself a red flag):

| Source | Chain claimed |
|---|---|
| Site body text / roadmap | Unichain ("ID: 1301" = Unichain Sepolia testnet), mainnet "Phase III" [H] |
| Site JS constant `UNICHAIN_ID = "0x3909"` | 0x3909 = 14601 = Sonic testnet, not Unichain [H] |
| Docs site (islandersfan2025.github.io/SuthsayerDocs) | "Sonic Mainnet, chain id 14601" (Sonic mainnet is actually 146) , factory "0xSuthsayer..." placeholder, "Production Ready", GitHub/App links are `#` [H] |
| SuthsayerRep README | "Sonic Testnet Contract Address: 0x59De9918eE0cba2a60368104C289bE9EB8973E34" [H] |
| CRE config | `ethereum-mainnet` with placeholder `0xYOUR_DEPLOYED_CONTRACT_ADDRESS` [H] |

- Site constants: `PREDICTION_MARKET_ADDR = 0x59De9918eE0cba2a60368104C289bE9EB8973E34`, `USDC_ADDR = 0xaFD717461069733CB63644A1497874A196505Bfe` (6 decimals). Neither address has code on Unichain mainnet or Unichain Sepolia (Blockscout `is_contract:false`). They are presumably on Sonic testnet (not verified; explorer API needs a key). [H for constants and Unichain lookups, L for Sonic location]
- The site's `bet()` calls `buy(uint256 marketId,uint8 outcome,uint256 amount)`, a function that does not exist in `SuthsayerPredictionMarket.sol` (which has `splitPosition`, bytes32 market ids). Frontend and contract are out of sync. [H]
- Collateral: USDC (testnet token) plus a governance/rebate token ($SSYR / SUTH, names inconsistent). [H]

## Read API

- `exists: none`. No official public API. The site has no `/api/*` (https://www.suthsayer.xyz/api/markets -> 404). Docs "API Reference" is a nav stub. The only backend referenced is `localhost:8787` and a Hono/Lambda x402 "premium" route in `SuthsayerRep/src` (not deployed anywhere found). [H]
- On-chain reads would be via contract events (`MarketCreated`, `Split`, `Merge`...) on a testnet. Nothing to index on mainnet.
- WebSocket: none. Rate limits: n/a.
- Fixtures: none saved (no API to sample; the HTML "markets" are static).

## Trade path

- Programmatic: raw contract calls (`splitPosition`, `mergePositions`, `redeem`) on a **testnet** only. No signed-order API. [H]
- PayBox reachability: **no**. PayBox EVM wallets (Base/Ethereum/BNB/Arbitrum/Polygon) cannot reach Unichain Sepolia or Sonic testnet; testnet tokens have no value; no mainnet deployment exists. [M]

## Fees

- `defaultFeeBps` charged on `splitPosition` (collateral * feeBps / 10000), sent to treasury, with an SUTH rebate token minted 1:1 against fee. Cap 1000 bps (10%). Actual value is a deployment parameter, not found. Hook adds dynamic LP fees (formula in hook source, not reviewed). [H] contract source

## Resolution and dispute risk

- Single privileged `RESOLVER_ROLE` calls `resolveMarket`; design intends Chainlink CRE workflows (market-creation / market-resolution / market-dispute) to hold that role. Workflows ship with placeholder config (`0xYOUR_DEPLOYED_CONTRACT_ADDRESS`); a BTC-strike template only. Social/custom markets "verified via Chainlink Functions against AT Protocol records" is aspirational (docs). Admin/resolver centralisation plus pause role: high dispute and rug risk. [H]

## Geo / ToS / automation

- NOT FOUND (searched: homepage, docs page, both READMEs). No terms of service or geo-block stated. [H]

## Liquidity

- No verifiable liquidity. Page-listed figures ($18.6K-$118K volume, up to $51.2K liquidity) are static HTML, retrieved 2026-10-19; testnet contracts can have no real value. [H]

## Event overlap

- Page lists crypto price (BTC/ETH thresholds), macro (Fed cut), sports (NFL, World Cup), weather, culture: overlap with big venues in principle, but no real tradable liquidity, so no arbitrage leg. Could appear only as a social-signal source (Bluesky `#Suthsayer` posts), which has no demonstrated value.
- Shared liquidity: none known; independent but empty.

## Priority: skip

Testnet-only hackathon-style project, contradictory chain claims, static fake-looking stats, no API, centralised resolver, unreachable by PayBox. Re-check only if a mainnet factory address and verified contract appear.

## Suspicious content

- No prompt-injection text found. Misleading content: self-reported "Production Ready" and live volumes that are not backed by chain data.

## Not found

- Mainnet deployment, factory address, verified contract source on any explorer, real fee value, ToS, public API, SDK, subgraph, audit. Sonic-testnet existence of `0x59De...` not verified (explorer API requires key). WebSearch was unavailable (session budget exhausted), so no third-party coverage was checked.

## Sources

- https://www.suthsayer.xyz (page source) [H]
- https://islandersfan2025.github.io/SuthsayerDocs/ (docs, via WebFetch) [H]
- https://github.com/Islandersfan2025/SuthsayerRep (site source, README, CRE workflows, project.yaml) [H]
- https://github.com/Islandersfan2025/SuthsayerPM (src/market/SuthsayerPredictionMarket.sol) [H]
- https://github.com/Suthsayer/SuthsayerHook (README) [H]
- https://unichain-sepolia.blockscout.com/api/v2/addresses/0x689aD56A94286a02Bb29b5df9Bd155d4B6f170C0 and the two site addresses on unichain(-sepolia).blockscout.com [H]
- whois suthsayer.xyz, DNS lookup [H]
