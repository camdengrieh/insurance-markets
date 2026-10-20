# PIT Protocol - venue spec (2026-10-19)

Verdict: adapter_priority = skip. Liveness could not be confirmed; no site, no docs, no public API, source repo gone, near-zero adoption signals. Integrable only via raw Solana RPC plus the program IDL.

Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Is it live? (unconfirmed)

- [H] npm package `@pit-protocol/sdk` exists, single version 0.0.1 published 2026-02-05 (several beta/0.1.0 tags also created the same day, only 0.0.1 remains in `versions`). Description: "TypeScript SDK for the PIT Protocol - prediction market on Solana". Keywords: solana, anchor, prediction-market, lmsr, defi, pyth, keeper. Apache-2.0. https://registry.npmjs.org/@pit-protocol%2Fsdk
- [H] npm search shows 85 monthly / 10 weekly downloads, 0 dependents (registry search entry updated 2026-10-15, but the package's own last publish is 2026-02-05, so that is index metadata, not a release). https://registry.npmjs.org/-/v1/search?text=pit-protocol&size=10
- [H] Repo `xitadel/pit-mvp` returns 404 via GitHub API. The org `xitadel` ("XITADEL Technologies", created 2017) exists but lists 0 public repos; github.com/xitadel returns 404 on the web. The org's blog field points to xitadel.tech, which does not resolve (DNS failure).
- [H] Candidate domains pit-protocol.xyz, pitprotocol.xyz, pitprotocol.io, pit-protocol.io do not resolve; pit.xyz is a for-sale parking page. No official site or docs found.
- NOT FOUND (searched: web search "PIT Protocol Solana prediction market LMSR Pyth" returned only the jsDelivr package listing; searches by program ID and by org name could not run because the shared web-search budget was exhausted; GitHub repo search "pit-protocol" returned only unrelated projects).
- NOT FOUND: on-chain confirmation that program `pit9HnTZ2r7KTfbDKYHuc5tYVcpbj4QE4PnzEEXsZx6` is deployed on mainnet or has recent transactions. Solscan returned 403 (Cloudflare), explorer.solana.com a Vercel checkpoint, solana.fm 502. A Solana JSON-RPC getAccountInfo call is a POST and was not made under the read-only/no-POST rule. Open question for a follow-up with a human-approved RPC read.
- [H] The SDK README says Pyth "sponsored push feed - continuously updated on mainnet and devnet", so the program may be devnet-only. Unknown.

## Kind and market model

Source: the published SDK (README, constants, IDL) via https://cdn.jsdelivr.net/npm/@pit-protocol/sdk@0.0.1/ (read as untrusted data, not executed).

- [H] On-chain Anchor program, LMSR AMM (logarithmic market scoring rule), no order book. Pool `q_vector` is 4 u128 values (outcomes S0..S3) with liquidity parameter `b`; constants `LN_4_WAD` used for the liquidity calculation.
- [H] Weekly markets keyed by `week_number` (PDA `getMarketAddress(week)`). Each market has two pools, High (pool_type 0) and Low (pool_type 1), each with 3 strike prices of SOL/USD. Per strike there is a "hit" mint and a "miss" mint (Token-2022). So it is SOL-price touch-the-strike style (hit = price reached the strike during the week; `mark_extreme` instruction records a new extreme outcome), effectively a categorical/ladder market on one underlying. [M] exact semantics inferred from names (`mark_extreme`, `StrikeAlreadyHit`, `OutcomeNotHigher`); no prose docs.
- [H] Outcomes are tokenised as Token-2022 SPL mints (hit_mints[3], miss_mints[3] per pool), 9 decimals matching lamports.
- [H] `trade` instruction args: pool_type, strike_index, is_hit, amount, is_buy, limit_lamports (slippage limit). Max trade bounded by max(q_i)-min(q_i) < 40 x b.
- [H] Operator is hardcoded in the program (`OPERATOR` constant); only the operator can initialize markets, pause/unpause, claim fees and withdraw subsidy. Centralised market creation.

## Chains and collateral

- [H] Solana only. Collateral is wrapped SOL (WSOL vault per market); there is no stablecoin collateral. Prices are therefore SOL-denominated, adding SOL/USD exposure to any cross-venue hedge.
- [H] Program ID `pit9HnTZ2r7KTfbDKYHuc5tYVcpbj4QE4PnzEEXsZx6` (from SDK constants and IDL `address`). Operator `op5mbETy9zq3NvhKYrcyQDxuDVdcj8MoMxzWpbVd1UG`. These are public program addresses, not user wallets.

## Read API

- exists = onchain-or-subgraph-only. No REST API, no WebSocket, no subgraph found.
- [H] Reads are done by fetching the Market PDA with Solana RPC `getAccountInfo` and decoding with the IDL (`MarketState`, `PoolState`: q_vector, b, strikes, hit/miss mints, is_settled, winning_outcome, end_timestamp, total_subsidy, fees_collected, is_paused). Price per outcome must be computed client-side from the LMSR formula (SDK math: `lmsr.ts`, `simulation.ts`; functions `tokensForSolBudget`, `solCostForTokens`, `solRefundForTokens`).
- [H] Registry account (`RegistryState`) and `UserProfile` (nickname) also exist. No trades/history endpoint; history would require `getSignaturesForAddress` plus the SDK `txParser`.
- Auth and limits: depend on whichever Solana RPC provider is used. Pyth Hermes (https://hermes.pyth.network) is the documented oracle price service in the SDK constants.
- Docs URL: none. Best primary artefact is the IDL (saved as fixture).

## Trade path

- [H] SDK exposes instruction builders only ("Transaction sending/signing is user's responsibility"): `createTradeInstruction`, `createRedeemInstruction`, etc. A signer needs a Solana keypair, a WSOL ATA, and hit/miss Token-2022 ATAs.
- PayBox reachability: [M] partial at best. Only a Solana wallet (not an EVM wallet on Base/Ethereum/BNB/Arbitrum/Polygon) could trade, and only if PayBox can sign arbitrary Solana program instructions via a transaction proposal; not verified (no PayBox tool called, per the money-moving ban). paybox_reachable = unknown, set to "no" for EVM wallets.

## Fees

- [H] `TRADE_FEE_PERCENTAGE` = 3% (3e16 in WAD) charged on trades; simulation result exposes `grossCost`, `fee`, `netCost` so the fee is added on top of LMSR cost (paid by the trader). Fees accrue to the market (`fees_collected`) and the operator claims them (`claim_fees`). [M] exact basis (cost vs notional, buy vs sell) not verified; read `lmsr.ts`/`simulation.ts` if ever integrating.
- 3% each way is far above arbitrage-friendly levels, plus LMSR slippage.

## Resolution

- [H] Pyth SOL/USD feed `0xef0d8b6f...b56d` via the Pyth Solana Receiver / sponsored push feed account `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`. `mark_extreme` and `settle_market` are permissionless (keeper bots); max price age 180 s. Redeem after settlement with `is_win` flag. `GracePeriodNotPassed` error implies a grace period before subsidy withdrawal. Operator can pause markets (`MarketPaused`). Dispute risk: low for oracle logic, but centralised operator pause/creation power and a young unaudited program (no audit found).

## Geo / ToS / automation

- NOT FOUND (searched: npm metadata, README, no site exists). Programmatic access is by design permissionless on-chain. No ToS located.

## Liquidity

- NOT FOUND. No TVL/volume/OI source found. Market subsidy size unknown (`total_subsidy`, `b`). npm downloads 10/week (2026-10-19) suggest negligible usage.

## Event coverage and overlap

- Only SOL/USD weekly price strikes. Conceptually overlaps with crypto price markets on Polymarket/Kalshi/Limitless/Opinion, but those use different resolution definitions (touch vs close, different sources/times) and USD collateral, so equivalence needs careful linking. Practically moot given no evidence of liquidity.

## Shared liquidity

- None; standalone AMM. Independent, but also unproven.

## Priority

skip: unconfirmed live, repo and org content removed, no site/docs/API, SOL-only collateral, 3% fee, centralised operator, single narrow market type, trivial adoption. Re-check only if a mainnet program activity or a public site appears. Signal value: negligible.

## Suspicious content

- None found in the SDK README or constants. A local file listing from jsDelivr included unrelated files in a shared scratch folder belonging to other tasks; not read.

## Fixtures (docs/research/fixtures/pit-protocol/)

- `pit-idl.json` - Anchor IDL from the SDK package (instructions trade/initialize_market/settle_market/redeem/mark_extreme, MarketState and PoolState layout).
- `npm-registry-sdk-0.0.1.json` - npm registry metadata (maintainer contact fields stripped).

## Sources

- https://registry.npmjs.org/@pit-protocol%2Fsdk (H)
- https://registry.npmjs.org/-/v1/search?text=pit-protocol&size=10 (H)
- https://cdn.jsdelivr.net/npm/@pit-protocol/sdk@0.0.1/README.md, /src/constants/*.ts, /src/idl/pit.json (H, package contents as published 2026-02-05)
- https://www.jsdelivr.com/package/npm/@pit-protocol/sdk (L, via web search snippet)
- GitHub API: repos/xitadel/pit-mvp (404), users/xitadel (org, 0 public repos) (H)
