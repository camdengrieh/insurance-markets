# Praedisia (Oeconomia DAO) - venue spec

Researched 2026-10-19. Read-only. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. Praedisia is a mock-data frontend for a protocol whose contracts are NOT deployed. There is no market data, no liquidity, no API and no trade path to integrate. Re-check only if a contract deployment or a mainnet announcement appears. (H)
- Is the venue "live"? The website is up (HTTP 200 on Netlify, 2026-10-19) but it serves seeded sample markets from an in-memory mock client, not on-chain markets. The venue is **not live as a prediction market**. (H)
- Last repo push: 2026-08-03 (about 11 weeks before today). Repo created 2026-08-02. No activity since the first day of a 2-day build. (H)

## Identity

| Field | Value | Tag |
|---|---|---|
| Name | Praedisia ("Praedisia - Prediction Markets") | H |
| Operator | Oeconomia DAO ecosystem (GitHub org account `Oeconomia2025`, a user-type account) | H |
| Site | https://praedisia.oeconomia.io/ (Netlify, Vite/React SPA) | H |
| Repo | https://github.com/Oeconomia2025/praedisia (MIT per package.json, no LICENSE file; 0 stars, 0 forks) | H |
| Kind | on-chain binary CPMM prediction market (designed), currently frontend-only prototype | H |
| Sibling projects | Alluria (lending, mints ALUD), Eloqura (AMM/bridge), Artivya (NFT), oec-contracts (staking, treasury, zapper) | H |

## Market model (as designed, per repo)

- Binary YES/NO only. No categorical or scalar markets in the types. (H: `client/src/lib/market/types.ts`)
- Pricing: constant-product market maker (CPMM). Implied P(YES) = noReserve / (yesReserve + noReserve). Buy YES with net collateral c: tokensOut = y + c - (y*n)/(n+c). Sell uses a quadratic solve. NO side symmetric. (H: `cpmm.ts`, README)
- Outcome tokenisation: "conditional tokens" (interface name `IConditionalTokens`, Gnosis-CTF style naming) with YES and NO token balances per market. Contract interfaces named `IMarketFactory`, `ICPMM`, `IConditionalTokens`, `IResolver` in a `PredictionMarketInterfaces.sol` that is referenced in comments but is **not present in the repo**. (H for the references, NOT FOUND for the Solidity: searched repo tree, Oeconomia2025/oec-contracts tree, GitHub code search)
- Market states: Open, Frozen (trading halts `freezeWindow` seconds before endTime), Closed, Resolved. Outcomes: Unresolved, Yes, No, Invalid. (H)
- Categories in the UI: Crypto, Economics, Politics, Sports, Tech, Science, Entertainment, Oeconomia. (H)
- Anyone can create a market: needs resolution rules text, endTime, freeze window, at least 100 ALUD of initial liquidity, and a 100 OEC creator bond (UI constants). (H: `create-market.tsx`)

## Chains and collateral

- Intended chain: **Ethereum Sepolia testnet** (`wagmi.ts` configures only `sepolia`; `chain-client.ts` says "Deployment targets (Sepolia)"). No mainnet plan stated anywhere. (H)
- Collateral: **ALUD**, the stablecoin minted by Oeconomia's Alluria lending protocol (Alluria README: "Deposit collateral, mint ALUD stablecoin"). ALUD is a protocol CDP stablecoin, not USDC/USDT. (H for the README statement; ALUD's peg, chain and address NOT FOUND)
- Governance/bond token: OEC (Oeconomia token; Alluria README references BSC integration, so OEC appears to be on BNB Chain: M).
- Contract addresses: **all four are `0x000...000` placeholders** in `CONTRACTS` (marketFactory, conditionalTokens, resolver, collateral). (H)
- The deployed JS bundle (`/assets/index-ChZ0jkLA.js`, 360 KB) contains only two 0x40-hex addresses, both generic (the 0xEeee...eeee native-token sentinel and the Multicall3 address). No Praedisia contract is referenced. (H, grep of the bundle; bundle treated as data and not executed)

## Read API

- Exists: **none**. The site is a static SPA; there is no backend, REST, GraphQL, subgraph, or websocket. (H)
- `GET https://praedisia.oeconomia.io/api/markets` returns HTTP 200 text/html (the SPA fallback from `_redirects` / `netlify.toml`: `/* -> /index.html 200`). This means any path returns 200 HTML; do not treat 200 as "API exists". (H)
- Data layer is `MockMarketClient` (in-memory, seeded with sample markets "in every state", with a deterministic PRNG for price history). `ChainMarketClient` rejects every call with "Praedisia contracts are not deployed yet." (H)
- Other stray endpoints in the bundle: thirdweb Sepolia RPC (`11155111.rpc.thirdweb.com`), Etherscan Sepolia API, both generic wagmi defaults. (H)
- Docs URL: NOT FOUND (searched: site, repo README, repo tree, GitHub org repos; there is no docs site). Web search for corroboration was not possible: the session's WebSearch budget was exhausted. Whether the Oeconomia team has announced a launch date on X/Discord is therefore **unchecked**.
- Rate limits / auth: n/a.

## Trade path

- None today. Buying, selling, creating and redeeming all call the mock client or reject with NOT_DEPLOYED. (H)
- Intended design: wagmi/viem wallet transactions (approve ALUD, then CPMM buy with `minTokensOut` slippage guard; sell with `minCollateralOut`; `redeem` after resolution). No order book, no signed off-chain orders, no relayer. (H for client interface in `client.ts`)
- If deployed on Sepolia as designed: a normal EVM transaction flow (approve + swap-like call), so an agent wallet could in principle trade via transaction proposals. But Sepolia tokens are worthless; this would be test-only. (M, inferred)

## PayBox reachability

- **No** today. Nothing is deployed to send a transaction to, and the intended chain (Sepolia) is a testnet with valueless collateral. If it deployed to a PayBox-supported EVM chain later, it would be reachable as plain contract calls (approve + buy/sell/redeem). (H for "nothing deployed", M for the later inference)

## Fees

- `feeBps` is a per-market parameter, charged by the CPMM: on collateral in for buys, on collateral out for sells. UI default is 100 bps (1%). (H: `cpmm.ts`, `create-market.tsx` `DEFAULT_FEE_BPS = 100`)
- Who receives the fee (LPs, creator, DAO treasury) is not specified. NOT FOUND (searched: repo README, types, create-market page).
- Creator bond: 100 OEC, returned on YES/NO resolution, forfeited if the DAO resolves Invalid. (H)

## Resolution mechanism and dispute risk

- Resolution by **Oeconomia DAO governance vote**: closed markets wait for an outcome vote at https://governance.oeconomia.io/, and a resolver contract reports the outcome on-chain. (H: `resolution.tsx`)
- No oracle, no bonded dispute game, no appeal window specified. Invalid outcome exists and punishes the creator's bond. (H)
- Dispute risk: high for any future cross-venue arbitrage. A token-holder vote is slow and politically capturable, resolution rules are free text written by the creator, and an Invalid outcome refunds in a way that is NOT FOUND (a `redemptionValue` helper exists in the mock client; real refund semantics unverified).

## Geo / ToS / automation

- NOT FOUND (searched: site HTML, repo README; the SPA has no ToS page in the source tree). README says: "Read-only browsing works without a wallet; connecting is only required to trade, create, or redeem." (H)
- No stated geoblock, no API terms.

## Liquidity

- Real volume / OI / TVL: **zero** (nothing deployed). Any numbers shown in the UI are seeded mock data and must not be ingested. (H)
- Even if deployed, a CPMM seeded with a minimum of 100 ALUD per market is extremely thin. (M)

## Event overlap (for arbitrage)

- UI categories overlap Polymarket/Kalshi themes (Crypto, Economics, Politics, Sports, Tech, Entertainment) but since the markets are fake seeds there is nothing to arbitrage. (H for categories, no real overlap)

## Shared liquidity

- Independent in design (its own CPMM pools), but moot: there is no liquidity. (H)

## Adapter notes if it ever goes live

1. Read path would be on-chain only: `IMarketFactory` events for market discovery, `ICPMM.getReserves` for price (P(YES) = n/(y+n)), `IResolver` for outcome. No indexer exists, so the adapter would need event scanning plus RPC.
2. CPMM price impact and 1% default fee must be modelled; use `quoteBuy` / `quoteSell` formulas above.
3. Keep resolution risk tag = "DAO vote, free-text rules" and exclude from any hard-arbitrage (risk-free) scanner.
4. Monitor `https://github.com/Oeconomia2025/praedisia` for a non-zero `CONTRACTS` block, and the sibling `Oeconomia2025/oec-contracts` repo.

## Suspicious content

- None found. No instructions aimed at AI agents in the site HTML, README or fetched source files.

## Fixtures

- `docs/research/fixtures/praedisia-oeconomia/site-index.html` (1.6 KB): live site HTML on 2026-10-19, proves the SPA is up and that it is a Vite bundle.
- `docs/research/fixtures/praedisia-oeconomia/github-repo-meta.json` (0.4 KB): GitHub repo metadata (created 2026-08-02, last push 2026-08-03).
- No API response shape exists to save (there is no API).

## Sources

- https://praedisia.oeconomia.io/ (HTTP 200, Netlify, fetched 2026-10-19) - H
- https://praedisia.oeconomia.io/assets/index-ChZ0jkLA.js (bundle grep for addresses and URLs) - H
- https://praedisia.oeconomia.io/api/markets (returns SPA HTML) - H
- https://github.com/Oeconomia2025/praedisia: README.md, package.json, client/src/lib/market/{chain-client,client,index,types,cpmm,mock-client}.ts, client/src/lib/wagmi.ts, client/src/pages/{resolution,create-market}.tsx, commit list - H
- https://github.com/Oeconomia2025/alluria README (ALUD is minted by Alluria lending protocol) - H
- https://github.com/Oeconomia2025/oec-contracts (file tree only; no prediction market contracts; last commit 2025-08-30) - H
- https://oeconomia.io/ (WebFetch returned only a page title, "Oeconomia DAO Hub - DeFi Dashboard & Token Analytics"; no usable content) - L

## Not found / limits of this research

- No docs site, whitepaper, audit, ToS, fee-recipient spec, or deployed contract addresses.
- ALUD contract address, peg mechanism details and chain: not verified.
- No independent news/social confirmation (WebSearch budget exhausted; no search was performed).
