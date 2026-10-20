# Kohin Labs (Kohin) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Not a prediction market. Kohin is a bet-insurance layer on top of Azuro (sports sportsbook protocol on Polygon). It has no order book, no outcome tokens, no prices to scan. Its production backend API is down (Cloudflare 530/1016), its public GitHub org is empty, its last npm release was 2025-04-23, and the prod insurance pool held about 1,140 USDT on 2026-10-19. adapter_priority = skip. (Only conceivable use: none for arbitrage; Azuro itself, if wanted, should be specced as its own venue.)

## Is it live? (partial / probably dormant)
- Site, app and docs hostnames still resolve and serve static pages: www.kohin.xyz, app.kohin.xyz (Next.js shells, content client-rendered, could not read), docs.kohin.xyz (Docusaurus v3.5.2) [H] (curl 200, 2026-10-19).
- Prod offchain API https://offchain-prod.kohin.xyz returns HTTP 530 "error code: 1016" on all paths, i.e. origin unreachable [H] (fixture offchain-prod-api-down-2026-10-19.txt). Preprod and testnet hosts also fail (TLS error / timeout) [H]. Without that API the SDK read methods and the app's bet list cannot work [M].
- npm kohin-js: created 2025-02-13, latest 1.0.9 published 2025-04-23, ~6 months old, no later release [H] (https://registry.npmjs.org/kohin-js).
- GitHub org kohinlabs: created 2024-09-13, last updated 2024-09-23, 0 public repos, 0 public events, contact connect@kohin.xyz [H] (gh api users/kohinlabs). Hint in task was right: effectively stale.
- X account @kohinxyz returned HTTP 402 to fetch; activity not verified. WebSearch found no independent coverage of Kohin (first search only; second blocked by session search budget). NOT FOUND (searched: web search "Kohin Labs decentralised insurance layer prediction market").
- On-chain: prod InsurancePool proxy contract has code; its USDT balance was 1,139.846627 USDT at Polygon block ~0x5b5998c (2026-10-19 05:07 UTC) [H] (fixture onchain-pool-usdt-balance-2026-10-19.json). Tiny.

## Kind and market model
- kind: insurance/cover product for third-party bets, not a market [H] (docs.kohin.xyz/faqs: "Kohin is the first decentralized insurance layer for prediction markets"). V1 supports Azuro only, only sports combo (express) bets, plus single in SDK; docs say Polymarket/Drift connectors are planned [H] (docs.kohin.xyz/high-level-architecture, /faqs; "working to expand" = unverified roadmap).
- Mechanism: you buy a cover on an existing Azuro bet; if the bet loses by exactly one leg you get your stake back in USDT; premium non-refundable if you win [H] (faqs). Premium e.g. "$100 bet might cost $20 (illustrative)".
- LPs deposit USDT into an insurance pool (modelled on Azuro's liquidity tree) and earn premiums, bearing claim losses [H].
- Outcome tokenisation: none. Policy/slip is a Kohin contract record keyed by Azuro betId [M].

## Chains and collateral
- Polygon mainnet (chain 137); testnet Polygon Amoy. Collateral USDT 0xc2132D05D31c914a87C6611C10748AEb04B58e8F (6 decimals) [H] (kohin-js@1.0.9 dist/config/serverConstants.js, constantVariables.js; faqs "wallet compatible with Polygon").
- Prod contracts from SDK config [H]: InsurancePool 0xd1A9e1C2C0D0E7459fdae16a94aDB08d8c6321A5; PolicyManager 0xE2fd078C28410d7D3F3daeF56795aD8507B1Ed81; ComboPremiumCalculator 0xEd2051dc499F41e421B26Cd148f5BED3DB792d1B; SinglePremiumCalculator empty in prod config.

## Read API
- exists: official-authenticated (SDK-wrapped), currently unreachable.
- Base URLs (from SDK config) [H]: https://offchain-prod.kohin.xyz/ , https://offchain-preprod.kohin.xyz/ , https://offchain-testnet.kohin.xyz/
- Docs: https://docs.kohin.xyz/ (sitemap lists API methods and contract methods) [H].
- Endpoints (SDK apiEndPoints.js) [H]: v1/azuro/odds-history, v1/azuro/get-active-bets, v1/azuro/get-bet-details, v1/azuro/get-outcome-odds, v1/kohin/get-my-slips, get-slip-history, get-transaction-history, get-my-deposits, get-pool-apr, get-bet-status. These are per-user bet/slip views and Azuro odds proxies, not a market catalogue or book.
- Auth: headers `access-key` and `secret-key` issued to integrators plus a required `affiliateAddress` [H] (dist/client/BaseApi.js, docs sdk/installation). No way to obtain keys without signing up (not done). Rate limits: NOT FOUND (searched: docs.kohin.xyz pages listed in sitemap, SDK config). Websocket: NOT FOUND.
- Live unauthenticated sample impossible (530). Only doc-example shape saved: fixtures/kohin-labs/getBetDetails-doc-example-shape.json (not a live response).
- Free on-chain alternative: Polygon contracts above are readable via any RPC (used to read pool balance) [H].

## Trade path
Insurance only. SDK `buyCover({betId, betType: Combo|Single, coverPremium, slippagePercent, betAmount, walletClient})` after getBetLimits, hasCoverBooked, calculatePremium, USDT approve (5% tolerance); `settleClaim`, `addingLiquidity`, `removeLiquidity` [H] (docs.kohin.xyz/sdk/contract-Method/buyCover). These are ordinary EVM transactions signed by the user's wallet (also Web3Auth/social wallet). The underlying bet must first be placed on Azuro. No order placement, no signed-order scheme.

## PayBox reachability
paybox_reachable = partial (technically): an EVM wallet on Polygon could send the approve + buyCover transactions as proposals [M, inferred; contract ABIs are in the SDK]. But the product cannot be used as an arbitrage leg, and the API backend (bet lookup, premium sync) is down, so not worth it.

## Fees
Premium formula is on-chain (premium calculators) and depends on bet type, odds, amount, number of legs, bettor history, outcome ratio; MLR (max loss ratio) constant 4 in SDK [H] (risk-mitigation page; constantVariables.js). Exact formula NOT FOUND (searched: docs, SDK config; calculators are contracts). Early-withdrawal fee exists for LPs (docs method earlyWithdrawalFee) [M]. Token: none yet, "$KO" is a possible future token [H] (faqs).

## Resolution and dispute risk
Outcome taken from Azuro via the Prediction Market Connector; claims are automatic by contract, but Kohin "reserves the right to review" and enable claims in cases of 10%+ odds rise since cover, cancelled sub-bets, or "unusual events"; "contract's recorded data... final and binding" [H] (faqs). Discretionary admin control = counterparty/dispute risk. Cover pays only if exactly one leg loses [H].

## Geo / ToS / automation
No KYC, wallet-only [H] (faqs). Terms of service page NOT FOUND (searched: docs.kohin.xyz, www.kohin.xyz static HTML). SDK is intended for integrators/affiliates with issued keys.

## Liquidity
Prod pool about 1,139.85 USDT on 2026-10-19 [H, on-chain]. Volume/OI/TVL history: NOT FOUND. Premiums depend on shared Azuro liquidity.

## Event overlap and independence
Covers only Azuro sports combos; no events of its own. Not an independent arbitrage leg: depends on Azuro pricing and liquidity. Any overlap is whatever Azuro lists (sports); Azuro would be the venue to evaluate if sports odds arbitrage is desired.

## Suspicious content
None found. Docs/site contained no instructions aimed at AI agents.

## Sources
- https://github.com/kohinlabs (gh api users/kohinlabs) [H]
- https://www.kohin.xyz , https://app.kohin.xyz (static shells; meta description "Web3 betting insurance platform") [H]
- https://docs.kohin.xyz/ , /faqs , /high-level-architecture , /core-concepts/kohin-working , /core-concepts/key-features , /architecture-overview/insurance-Mechanics/risk-mitigation , /claims-processing , /sdk/installation , /sdk/contract-Method/buyCover , /sdk/api-Method/getBetDetails , /sitemap.xml [H]
- https://registry.npmjs.org/kohin-js ; https://cdn.jsdelivr.net/npm/kohin-js@1.0.9/dist/config/serverConstants.js, apiEndPoints.js, constantVariables.js, client/BaseApi.js (read as text, not executed) [H]
- Public Polygon RPC (publicnode) eth_call/eth_getCode, 2026-10-19 [H]
- Unrelated search hit (XO Labs essay) ignored: not evidence about Kohin.

## Open questions
- Is Kohin deliberately sunset, or only the offchain backend down? Check @kohinxyz / Discord (not joined).
- Does the app UI still load data (client-rendered; not inspected, no browser automation).
