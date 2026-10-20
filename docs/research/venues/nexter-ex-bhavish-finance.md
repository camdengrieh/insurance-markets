# Nexter (ex-Bhavish Finance) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: skip.** The venue looks dead: the official domain does not resolve, DefiLlama flags the URL dead, TVL is about $45 of dust, and there is no read API or docs.
- Even when it was live it was a tiny parimutuel up/down game on short crypto-price rounds. That is not a usable independent arbitrage leg.
- Confidence that it is dead: medium-high. Direct confirmation from the team is missing. WebSearch quota was exhausted and X returned HTTP 402, so no 2026 news or social check was possible.

## 1. Is it still live? (no)

| Evidence | Tag | Source |
|---|---|---|
| `nexter.fi` (the only official domain, per GitHub org `blog` field and the audit-report links) returns NXDOMAIN. `www`, `app` and `docs` subdomains do not resolve either. | H | `dig nexter.fi`, 2026-10-19 |
| `bhavish.xyz` still resolves, to Vercel, and serves 404 `DEPLOYMENT_NOT_FOUND`. `www.bhavish.xyz` has an expired TLS certificate. | H | curl, 2026-10-19 |
| DefiLlama sets `deadUrl: true`, `url: ""`, and lists no volume, fees or OI adapters (`dimension_adapters` null in the repo registry snapshot). | H | https://api.llama.fi/protocol/nexter; repo `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` |
| DefiLlama TVL on 2026-10-18 is $45 (508 POL on Polygon, 0 on Mantle). The Polygon balance moves only with the POL price, so there is no inflow. Mantle TVL was last non-zero ($1,099) on 2025-05-25, then 0. Peak total TVL was $3,128 on 2024-03-28. | H | https://api.llama.fi/protocol/nexter, fixture `defillama_protocol_nexter_2026-10-19.json` |
| The GitHub org `Bhavish-finance` ("Nexter finance", Singapore) has no public events. Its last Nexter-specific push was 2024-04-04. Later pushes are forks of ERC-3643 / T-REX (tokenised-securities standard) in 2025-06. | H | `gh api orgs/Bhavish-finance/repos`, fixture `github_org_Bhavish-finance_2026-10-19.json` |
| Possible pivot to RWA / security tokens. The ERC-3643 forks hint at it, but nothing confirms it. | L | same |
| The org profile was edited 2025-12-23. That is a profile edit, not product activity. | M | `gh api users/Bhavish-finance` |
| X account `@NexterDotFi`: not readable. WebFetch returned HTTP 402 and I stopped without paying. | - | NOT FOUND (searched: x.com via WebFetch) |
| Web news or docs for 2026: not searched. The WebSearch quota was exhausted. | - | NOT FOUND (searched: WebSearch blocked) |

DefiLlama chains are Polygon and Mantle, listed 2023-02-21. The earlier brand was Bhavish Finance (DefiLlama module `bhavish/index.js`, GitHub org `Bhavish-finance`). DefiLlama description: "previous Bhavish Finance. Decentralised predictions for crypto, commodities, and sporting events." (H). "Sporting events" appears in that description only. I found no sports contracts, only crypto, gold (XAU) and equities.

## 2. Kind and market model

Tags are H unless noted. Source is the mirrored verified Solidity for `BhavishPrediction` (deployment `0xfB4A63f0...3260`) at `tintinweb/smart-contract-sanctuary-polygon`. This is a third-party mirror and I cannot prove that exact deployment is the one in the official address list. Treat the mechanics as M-H.

- **Kind:** on-chain, parimutuel, up/down price-prediction rounds. It is the PancakeSwap-Prediction pattern, not a CLOB, AMM or event-outcome market.
- **Outcomes:** binary (UP / DOWN) per round and per asset pair, with no outcome tokens. Positions are bookkeeping entries (`BetInfo.upPredictAmount` / `downPredictAmount`) in a storage contract, keyed by round and user. Positions are not transferable and not ERC-20 or ERC-1155.
- **Round life:**
  - An operator creates rounds ahead of time (the first call creates 4).
  - Users bet with `predictUp(roundId, user)` or `predictDown(roundId, user)`, which are `payable` and take native coin. Bets are accepted only until `roundStartTimestamp`.
  - At start, an oracle price is recorded.
  - At `roundEndTimestamp`, the end price is recorded.
  - `endPrice > startPrice` means UP wins, `<` means DOWN wins, and equal means refund.
- **Round length:** `roundTime` is constructor-set, up to 86,400 s. A code comment says "10 minutes". The actual deployed values were not verified.
- **Odds:** no price or odds exist before settlement. A bettor's payout depends on the final pool split, so there is no tradeable quote and no continuous price.
- **Assets:** from the official address list, Polygon had MATIC, BNB, ETH, BTC and XAU markets plus a TSLA equities market. Mantle had BTC only. There were also auto-betting vaults ("Moving Average", "Against Moving Average", "Balancer") and "NoLoss / quest" contracts. The vaults and no-loss products are ERC-4626-like share vaults, not markets.
- **Binary vs categorical vs scalar:** binary only.

## 3. Chains and collateral

- **Polygon (primary) and Mantle:** DefiLlama chains `Polygon` and `Mantle` (H). The official address list also names BNB / ETH / BTC markets on Polygon (those are underlying assets, not chains), and OP-BNB / Mantle testnets.
- **Collateral:** the chain's native coin (MATIC/POL on Polygon, MNT on Mantle), sent as `msg.value` (H, code). The DefiLlama adapter counts `nullAddress` balances only (H, adapter in the `Bhavish-finance/DefiLlama-Adapters` fork). There is a `swapAndPredict` path that swaps an ERC-20 into the native coin, and a gasless relayer path (`predictWithGasless`, `BaseRelayRecipient`).
- **Official contract list:** `Bhavish-finance/brand-assets/smart_contract.md`, last commit 2023-08-07 (H, stale). Saved as a fixture. Example: Polygon BTC market `0xC6f4c158182ce2a8150F5B1558b484E0e1D53Dd9`, Mantle BTC market `0xca0112597B795728d0aFC33dB2E3eD56D95F624d`.
- **DefiLlama TVL addresses:** 6 on Polygon (`0x83Bfcd4a...`, `0x4A3ad4bB...`, `0xA59e8042...`, `0x7768b73f...`, `0x747E2D83...`, `0x3bc0D5A6...`) and 1 on Mantle. Only `0x7768b73f...` matched a mirrored verified source (`BhavishNativeVault`). It is a share-vault, which means the tracked TVL is mostly vault funds, not open market positions (M).

## 4. Read API

- **exists: `onchain-or-subgraph-only`.** No official REST, WebSocket or subgraph endpoint found.
- **Docs URL:** NOT FOUND. The GitHub org blog points to `nexter.fi`, which is NXDOMAIN. The audit reports were hosted at `https://nexter.fi/docs/blocksec-audit-report.pdf` and `.../slowmist-audit-report.pdf` (per DefiLlama `audit_links`). A copy of the BlockSec report sits in the org repo `brand-assets` (`blocksec_bhavish_bp_v1.0-signed.pdf`, 785 KB). I could not extract its text with the tools here, so I did not read it.
- **Base URLs:** none. NOT FOUND (searched: GitHub org repos, DefiLlama metadata, `nexter.fi` / `bhavish.xyz` DNS+HTTP).
- **On-chain surface (from source, M-H):**
  - Events: `PredictUp(sender, roundId, amount)`, `PredictDown(...)`, `CreateRound`, `StartRound`, `EndRound`, `CancelRound`, `RewardsCalculated(roundId, rewardBase, rewardAmount, treasuryAmount)`, `Claim`, `Refund`.
  - Views via the storage contract: `getPredictionRound(roundId)` and `getBetInfo(roundId, user)`.
- **Third-party dashboards:** the org repo `Nexter-dune` is a Dune query-management template with 4 query IDs (2638247, 2638298, 2613130, 2426979). I did not fetch them. Dune needs an API key. L.
- **Auth and rate limits:** n/a. No unauthenticated public API response shape could be confirmed, so no market/price fixture exists. Fixtures saved are metadata and liveness evidence only.

## 5. Trade path

- **Programmatic:** direct contract calls only. Native coin goes in as `msg.value` to `predictUp` / `predictDown` on the market contract, or via the SDK contract `predict(PredictionStruct, provider)`. Claim with `claim(roundIds[], toAsset, convert, slippage, user)` (H, source).
- **Auth/signing:** ordinary EVM transaction signature. There is no off-chain order signing or EIP-712 order scheme. The optional gasless path uses a trusted forwarder (`BaseRelayRecipient`), details unverified.
- **PayBox reachability: `partial`, purely in theory.** A Polygon EVM wallet could submit a value-carrying contract-call proposal, but:
  - Rounds only advance when someone calls `executeRound()`. That call is permissionless in code, but in practice it was run by keeper/Gelato automation (M). With that automation dead, a bet would sit until someone else cranks it, and the market also needs a working price manager.
  - There is no confirmed live deployment, so a transaction could lock funds.
  - I did not call any PayBox tool.

## 6. Fees

- **Treasury fee on the whole pool:** `treasuryAmt = totalAmount * treasuryFee / 10**decimals` with `decimals = 3` (H, source). It is deducted from the pool before the winning side splits it. `MAX_TREASURY_FEE = 100`, and the constructor requires `0 < treasuryFee < 100`, so the fee is under 10%. The code comment claims "1000 = 10%" which contradicts the cap, so the real range and default are unclear.
- **Deployed fee value:** NOT FOUND.
- **Zero-winner case:** if nobody backed the winning side, the whole losing side goes to the treasury.
- **Vault fees:** vaults charge performance and withdraw fees (`setPerformanceFee`, `setWithdrawFee`). Values NOT FOUND.
- **Gas:** paid by the bettor (or the relayer on the gasless path).

## 7. Resolution and dispute risk

- **Oracle:** `PriceManager` contract (`getPrice(underlying, strike, timestamp)`). DefiLlama lists Pyth as Primary oracle (H, DefiLlama).
- **Who triggers rounds:**
  - The first two calls, `createPredictionMarket` and `startPredictionMarket`, are `onlyOperator` (H, source).
  - After that, `executeRound()` carries only `whenNotPaused` and no role modifier, although its comment says "Callable by Operator". So anyone can crank it (H, source). The official address list names Keepers and Gelato automation contracts, which is how it was run in practice (M).
  - `executeRound` pulls the price at `curRound.roundEndTimestamp` from the price manager. If the price is 0, the round is cancelled instead of settled.
  - A cancelled round refunds the stake less the treasury fee (`refundUsers`, H, source), so a cancellation still costs the bettor the fee.
  - The admin can pause the market, and pausing cancels all open rounds.
- **Dispute process:** none. The outcome is purely the recorded start/end price, with no challenge window.
- **Risks:**
  - Centralised admin / operator keys (the repo exposes `DEFAULT_ADMIN_ROLE`).
  - Exact-tie refunds (rare on price feeds with few decimals).
  - A dead keeper bot can strand open rounds.
- **Audits:** BlockSec and SlowMist (per DefiLlama `audit_links`, 2022-12 vintage for the BlockSec report). Neither report was read.

## 8. Geo / ToS / automation

NOT FOUND. The terms page lived on the dead `nexter.fi`. Nothing about geo-blocking or bot rules was readable. Nothing prohibits contract-level automation, but nothing authorises it either.

## 9. Liquidity

- **TVL:** $45 on 2026-10-18 (DefiLlama, H). That is about 508 POL.
- **Peak TVL:** $3,128 on 2024-03-28 (H). Polygon-only history starts at $718 (2023-02-21).
- **Volume / OI / fees:** no DefiLlama adapters, so none published. NOT FOUND.
- **Mantle:** TVL fell to 0 after 2025-05-25.
- This is orders of magnitude below any venue worth integrating, even before accounting for the fact that it appears abandoned.

## 10. Overlap with other venues (arbitrage relevance)

- Categories were crypto price (BTC, ETH, BNB, MATIC), gold (XAU) and one equity (TSLA).
- The instrument is a short-round parimutuel that pays by the final pool split, so it never offers a quotable price. Nothing can be hedged against it on a CLOB venue. At most it is a thin sentiment signal of retail up/down flow.
- **Shared liquidity with another venue:** none. It was an independent set of contracts (H, DefiLlama module and official address list). That does not matter, because there is no usable price.

## 11. Adapter priority

**skip.** Reasons: official site dead, TVL $45, no read API, no docs, parimutuel with no continuous price, centralised operator dependence, no confirmed live deployment.

## 12. Method limits and open questions

- WebSearch was unavailable (quota exhausted) for the whole run. WebFetch of DefiLlama's site returned 403, so the DefiLlama JSON API was used instead.
- One Wayback Machine CDX metadata query was issued before the restriction on archive services was noticed. Its content is not used anywhere in this note, and no further archive lookups were made.
- Block explorers: Polygon Blockscout returned a Cloudflare challenge (not bypassed), the Mantle explorer returned 502, and Routescan does not support Polygon. I could not confirm last on-chain activity directly.
- Open: did Nexter pivot to RWA / ERC-3643? Is any round still running on Polygon? Both need an explorer or RPC read. Not done here, because the venue is skip-class.
- The email address shown on the GitHub org profile was not copied anywhere. No personal identifiers were sent in any request.

## Sources

1. https://api.llama.fi/protocol/nexter (H, fetched 2026-10-19; trimmed fixture `defillama_protocol_nexter_2026-10-19.json`)
2. `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (H, local snapshot of the DefiLlama registry)
3. https://github.com/Bhavish-finance (org profile, repo list, `brand-assets/smart_contract.md`, `DefiLlama-Adapters` fork `projects/bhavish/index.js`, `Nexter-dune`) - H, read via `gh api`; fixtures `github_org_Bhavish-finance_2026-10-19.json` and `github_Bhavish-finance_brand-assets_smart_contract.md`
4. https://github.com/tintinweb/smart-contract-sanctuary-polygon - mirrored verified sources `contracts/mainnet/fb/fB4A63f0732bB65B745495080F0DaF2A3787c9F8_BhavishPrediction.sol` and `contracts/mainnet/77/7768b73f95d5d5f77aad6cd3cD47591a6565F75D_BhavishNativeVault.sol` (third-party mirror, M-H)
5. DNS and HTTP probes of `nexter.fi`, `bhavish.xyz`: `liveness_probes_2026-10-19.txt` (H)
6. https://defillama.com/protocol/nexter - HTTP 403 via WebFetch (not readable)
7. https://x.com/NexterDotFi - HTTP 402 via WebFetch (not read)
