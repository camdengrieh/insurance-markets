# TuringM Labs (Turing Market / "Turing M") venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. Backend API hosts no longer resolve (NXDOMAIN), the last on-chain activity on the Avalanche market contract was 2025-11-26 (about 11 months before today), the GitHub org has not been pushed to since 2025-09-20, and there is no official public read API. The venue looks dead or at best dormant. [H for each fact below, M for the "dead" conclusion]

## Is it still live (2026)?

- Marketing site https://www.turingm.io/ returns HTTP 200 (a static Vue SPA, title "TuringM - AI-driven Collective Data-based Event-derived Financial Ecosystem"). [H]
- DApp https://www.turingmarket.cc/ returns HTTP 200 (SPA shell, "Bet on your beliefs!"). [H]
- The DApp bundle (index.BXtVS5nA.js, fetched 2026-10-19) hard-codes its backend as `https://www.turingma-api.com` (live) and `https://demo.turingma-api.com` (demo), plus websocket `wss://www.turingma-api.com/ws` and `wss://demo.turingma-api.com/demows`. Both hosts return NXDOMAIN (dig against 1.1.1.1 and 8.8.8.8 for www.turingma-api.com; the apex turingma-api.com also NXDOMAIN). The DApp therefore cannot load market data. [H]
- The contract's token-metadata base URI `https://turingma.com/mktapi/app-api/token/` also does not resolve (NXDOMAIN). [H]
- `https://api.turingm.io` returns Vercel `DEPLOYMENT_NOT_FOUND`. [H]
- `insights.turingmarket.cc` 307-redirects to `https://pred.news/` (not followed; unrelated host). [H]
- Avalanche C-Chain market contract tx history (Routescan etherscan-compatible API, public GET): first tx 2025-09-08 (ts 1757343290), latest tx 2025-11-26 01:30 UTC (ts 1764120626) from an operator EOA calling the matching function. Nothing newer in a desc-sorted query on 2026-10-19. [H] Small sample saved in fixtures.
- GitHub: org created 2025-04-22; 4 public repos; most recent push 2025-09-20 (TuringM, TuringM-EIP2535). Org page is the only "site" hint. [H]
- The English docs call mainnet liquidity "after mainnet launch", suggesting mainnet was never formally announced as launched. [M, docs-en.turingm.io/ecosystem/turingmarket via summarised fetch]
- X account https://x.com/Turingmarket: WebFetch returned HTTP 402; not read. WebSearch was unavailable (session search budget exhausted), so no 2026 news/press coverage was checked. [NOT FOUND: any 2026 source showing activity]

## Kind and market model

- Kind: on-chain settled, operator-matched hybrid exchange (Polymarket CTF-Exchange style). [H, repo README]
- Binary outcome markets, "multiple binary mutually exclusive markets" for categorical events. Outcomes are ERC1155 tokens; each binary market has a complementary token pair A / A' where A + A' merges into 1 unit of ERC20 collateral. [H, github.com/TuringM-Labs/TuringM README and contracts]
- Order book: off-chain operator matching, on-chain atomic settlement using EIP-712 signed orders. Trade types: mint (two buys), normal (buy/sell swap), merge (two sells). Only addresses with `PERMISSION_MATCH_ORDERS` can call `matchOrder`. [H, TuringMarketFacet.sol]
- The docs site additionally claims "an AMM combined with an order book" and future leverage ("up to 10x" in the GitHub README, "planned" in the docs). Neither is evidenced in the contracts. [M/L]
- Order struct fields (README): salt, maker, tokenId, tokenAmount, tokenPriceInPaymentToken, paymentTokenAddress, slippageBps, deadline, side (1 buy, 2 sell), feeTokenAddress, sig, plus fee1/fee2 amounts and tokens. [H]

## Chains and collateral

- Mainnet (only one listed): Avalanche C-Chain (43114). TuringMarketApp (diamond) `0x2a4d11972e2146bBb18572C886c8EFb776651544`, TuringToken (TUIT) `0x8604AA227A00F48CCa7b096eF8853d0F6d3325F3`, TokenUnlockerApp `0x497459342607061E1F2F95984D605a20D4DB3731`. [H, TuringM-EIP2535 README]
- Testnets: BSC testnet, AVAX testnet (Fuji), 0G testnet (Galileo), per the TuringM README. [H]
- Collateral: from the single sampled on-chain matchOrder call, payment token `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` (6 decimals, order size 10 units), which I believe is USDt on Avalanche; fee token field pointed at TUIT. [M, decoded calldata by eye, not verified against an explorer token page]
- The DApp bundle also references many other chains, but that is generic wallet-library config (Privy/viem), not deployments. [M]

## Read API

- Official public API: **none documented**. docs-en.turingm.io has pages for ecosystem, TUIT, Turing Market, AI, DAO, marketing, partners, disclaimer; no developer/API section. [H]
- Unofficial, extracted from the first-party DApp bundle (L: undocumented, host now dead): base `https://www.turingma-api.com`, paths under `/app-api/topic/...`: `catalog/home`, `catalog/tags`, `page`, `search`, `recommend`, `relatopics`, `markets/lastPricesAll`, `markets/orderBooksAll`, `markets/priceHistory`, `markets/topHolder`, `order/preview`, `order/amount`, `order/create`, `order/cancel`, `order/checkHold`. Auth: `Authorization: Bearer <accessToken>` obtained after wallet login via Privy (SIWE/SIWS). Whether market reads work unauthenticated is unknown. WebSocket takes `?token=<accessToken>`. [L]
- Could not confirm any response shape: both API hosts are NXDOMAIN. No market fixtures exist. [H that it fails]
- On-chain only fallback: the diamond emits events on Avalanche; a subgraph/indexer would be needed. No official subgraph found. [NOT FOUND (searched: org repos, README, docs)]

## Trade path

- Orders are EIP-712 typed-data signed by the user and submitted to the operator backend (`/app-api/topic/order/create`), which matches and calls `matchOrder` on-chain. Users cannot match on-chain themselves (permissioned). With the backend gone there is no working order path. [H contracts, L for the endpoint]
- PayBox reachability: **no** (practically). An EVM wallet could in principle hold Avalanche USDt and sign EIP-712 orders (needs an `request_wallet_sign`-style typed-data signature plus a Privy-authenticated session), but the operator API is unreachable and Avalanche is not in the stated PayBox chain list. Directly proposing transactions is useless because only operators can match. [M]

## Fees

- Contract formula: `fee = baseFeeRate * min(price, 1 - price) * quantity`, charged on output assets (proceeds), symmetric across complementary tokens; maker/taker symmetric with price improvement to the taker. [H, README]
- Docs: 0.5% per side (1% round trip) trading fee; 2% settlement fee on winning predictions; 2% referral/commission model in the README. TUIT can be used for fee payment. [M, docs summary; the README and docs numbers differ]

## Resolution

- Docs: AI collects data from multiple sources; outcomes are confirmed through proposals and votes in Turing DAO; no external oracle named. Contracts have admin market-manager facets (ended/blocked/finalized flags). High dispute and centralisation risk. [M/L]
- Audit: QuillAudits report in the `media` repo (`audits/QuillAudits.pdf`); not read. [H that the file exists]

## Geo / ToS / automation

- Disclaimer notes some jurisdictions may restrict crypto/Web3/DeFi and tells investors to comply with local law; says nothing on bots or automation. Terms page `https://turingm.io/terms` not read. [H, docs disclaimer]

## Liquidity

- No volume/OI/TVL figures found anywhere. On-chain evidence: the sampled operator tx matched a 10-unit order, and the contract has activity only between 2025-09-08 and 2025-11-26. Pitch claims a $120M first-year volume target (aspirational, L). Effectively negligible. [M]

## Event categories and overlap

- Claims political, sports, entertainment events plus crypto-correlation. No live market list could be retrieved, so overlap with other venues cannot be verified. [L]

## Shared liquidity

- Independent (own contracts and operator). Not a wrapper of another venue. [M]

## Adapter notes (if ever revived)

- Contracts are a CTF-Exchange derivative on an EIP-2535 diamond; event ABI is in `contracts/TuringMarketFacet.sol`. A passive on-chain indexer on Avalanche (matchOrder calls and ERC1155 transfers) would be the only feasible read path.
- Re-check later: whether `turingma-api.com` returns, whether a successor domain appears in the DApp bundle, and the Avalanche contract for new transactions.

## Suspicious content

- None observed. The site bundles contain ordinary analytics/wallet code; no AI-directed instructions seen.

## Sources

- https://github.com/TuringM-Labs (org API: created 2025-04-22, 4 repos) [H]
- https://github.com/TuringM-Labs/TuringM (README, contracts/TuringMarketFacet.sol, MIT, last push 2025-09-20) [H]
- https://github.com/TuringM-Labs/TuringM-EIP2535 (README with Avalanche addresses, QuillAudits mention) [H]
- https://github.com/TuringM-Labs/media (audits/QuillAudits.pdf listed) [H]
- https://www.turingm.io/ and bundle https://www.turingm.io/assets/main-CdHl6IhH.js [H]
- https://www.turingmarket.cc/ and bundle https://www.turingmarket.cc/assets/index.BXtVS5nA.js (API hosts, endpoint paths) [H]
- https://docs-en.turingm.io/, /disclaimer, /ecosystem/turingmarket (via summarising fetch) [M]
- https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api (txlist for the market contract) [H]
- Not read or failed: https://x.com/Turingmarket (HTTP 402, stopped), WebSearch (budget exhausted), https://pred.news/ (redirect target, irrelevant)

## Fixtures

- docs/research/fixtures/turingm-labs/avalanche-market-contract-latest-tx.json (latest tx on the Avalanche market contract, calldata truncated; Routescan etherscan-compatible response shape)
