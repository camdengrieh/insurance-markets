# TopCut Finance (Arbitrum) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (DefiLlama API, Sourcify v2, DNS lookups), `gh api` raw file reads of the official GitHub repos, one incidental read-only PayBox `discover_tokens` call. No account, key, wallet, signature, POST/PUT/DELETE. No third-party code cloned, installed or run. The audit PDFs and the Python keeper scripts were not opened (only the audit-3 markdown and the keeper README).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months old).
Third-party text (README, code comments, audit text) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/topcut-finance/` (4 files, all < 13 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Effectively dead (H).** Domain `topcut.finance` (apex, `www`, `docs`, `app`) returns NXDOMAIN; DefiLlama flags `deadUrl: true`; DefiLlama fees are $0 for 24h / 7d / 30d / 1y, and the last non-zero fee day is 2025-09-04 ($4), the last meaningful one 2025-08-25 ($20); both GitHub repos were last pushed in Aug 2025. TVL is $53 today (peak $6,590 on 2025-08-25).
2. **Not a prediction market in the binary/categorical sense (H).** It is a "precision market": traders pay a fixed ETH stake to submit a BTC/USD price guess into a cohort, and the closest 1 in 11 guesses win 10x the stake at the next Chainlink settlement. There is no outcome token, no order book, no YES/NO price, and no event-level probability, so there is nothing to compare against other venues' prices.
3. **No arbitrage leg (H, section 6).** The only overlap with other venues is the underlying (BTC/USD spot), and the payoff is rank-based against other entrants, so it cannot be hedged against binaries.
4. **No read API (H).** There is no REST/WS API; the only data sources are on-chain events and a Graph subgraph repo whose deployment URL is NOT FOUND.
5. Cheap to keep in a "dead venues" list; revisit only if on-chain activity reappears (a one-off `eth_getLogs` over the five market addresses would settle that, see section 9).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DNS for `topcut.finance`, `www.`, `docs.`, `app.` | `dig` returns no A/NS records; SOA query for `topcut.finance` returns `status: NXDOMAIN` (2026-10-19). WebFetch of `https://www.topcut.finance/` and `/docs/resources/smart-contracts` fails with `getaddrinfo ENOTFOUND`. | H |
| DefiLlama protocol 6448 | `deadUrl: true`, `url: ""`, listed 2025-07-17 (`listedAt` 1752775161), category "Prediction Market", chain Arbitrum. https://api.llama.fi/protocol/topcut-finance | H |
| DefiLlama TVL | $53.15 on 2026-10-19; series 2025-07-17 to 2026-10-19 (460 points); peak $6,590 on 2025-08-25; fell to ~$2.9K by 2025-08-30 and has drifted to ~$54-63 since 2026-09-30. Methodology: "TVL is calculated based on the amount of ETH in the TopCut Vault" (so it is vault revenue, not market open interest). | H |
| DefiLlama fees (https://api.llama.fi/summary/fees/topcut-finance) | `total24h/7d/30d/1y = 0`; `totalAllTime = $10,104`; 43 non-zero days between 2025-06-20 and 2025-09-04; zero rows afterwards through 2026-10-18. | H |
| Contracts repo `PossumLabsCrypto/TopCut` | created 2025-03-16, last push 2025-08-08 ("relax constructor conditions"), not archived, 0 stars. README is the untouched Foundry template. | H |
| Subgraph repo `PossumLabsCrypto/topcut-subgraph` | last push 2025-08-18; last commits are address updates dated 2025-07-22. | H |
| Operator `PossumLabsCrypto` (Possum Labs LLC) | other repos still pushed in 2026 (PossumFinance 2026-03-21, deStable-Docs 2026-03-17) but neither contains the string "TopCut" (GitHub code search count 0 for both). Operator site `possumlabs.io` resolves (Wix). | H |
| Audit-3 maintainer reply | "If a market's usage declines over time, trade access will be removed from the UI and access points (leaving only claim functionality)". Consistent with a wound-down front end. | H (policy statement; M as explanation of the current state) |
| Contracts on chain | Sourcify v2 `exact_match` for creation and runtime on chainId 42161 for the vault and three market addresses (verifiedAt 2026-04-17 to 2026-06-19). This proves deployment, not activity. Fixture `sourcify_contract_checks.json`. | H |
| Last on-chain transaction | NOT FOUND (searched: Blockscout API v2 for Arbitrum returned a Cloudflare challenge page, not bypassed; Routescan has no Arbitrum support; Etherscan-family APIs need a key; JSON-RPC `eth_getLogs` is a POST and was out of scope). | - |
| X account `@TopCutFinance` (named by DefiLlama) | not read (no X access). Official site and docs are down, so no announcement text was available. | - |

Conclusion: the front end and docs are gone, trading volume stopped around late August 2025 (13+ months stale), and the smart contracts are presumably still deployed and callable (M, immutable contracts, no kill switch in the source).

## 2. Kind and market model

- **Kind: on-chain "precision market" / guessing game.** Not binary, categorical or scalar in the usual sense. Not an AMM, order book or parimutuel pool in the Polymarket/Gnosis-CT sense. It is closest to a **rank-based lottery on a price guess**. [H, `src/TopCutMarket.sol`]
- **Mechanics (H, source read this session):**
  - Each market contract fixes: oracle (Chainlink BTC/USD), `TRADE_SIZE` (ETH per prediction), `WIN_SIZE = 10 x TRADE_SIZE`, `TRADE_DURATION` (>= 24 h), and `nextSettlement`.
  - `castPrediction(address _frontend, uint256 _refID, uint256 _price, uint256 _cohortID) payable` requires `msg.value == TRADE_SIZE`, `_price != 0` (18-decimal USD price), `_frontend != 0`, `_refID` an existing affiliate NFT id, and `_cohortID != activeCohortID` (you must pass the *next* cohort id). Reverts `WaitingToSettle` once `block.timestamp >= nextSettlement` until someone settles.
  - Two cohorts alternate (1 and 2). Entries go to the non-active cohort; max 2,200 entries per cohort.
  - `settleCohort()` (permissionless, pays a keeper reward) reads Chainlink `latestRoundData`, takes the absolute difference between each guess and the oracle price, and marks the closest `cohortSize / 11` entries (minimum 1) as winners. Each winner gets `WIN_SIZE` credited to `claimAmounts`; winners call `claim()`.
- **Outcome tokenisation: none.** A "position" is a storage row `(owner, guess)` in `tradesCohort_1/2`, not an ERC-20/1155. Positions cannot be transferred, sold or priced in a secondary market. The affiliate NFT (`TopCutNFT`) is a referral instrument, not a position.
- **Observed deployments (H, DeployMainnet.s.sol, AddNewMarket.s.sol, settlement_bot README, subgraph `networks.json`):** all BTC/USD only; trade sizes 0.01 ETH and 0.1 ETH (plus a "0.05 ETH" market mentioned in a subgraph commit, M); cadence daily (24 h) or weekly (Mon / Wed / Fri 15:00 UTC settlement).

| Role | Address (Arbitrum One, 42161) | Source |
|---|---|---|
| Vault | `0x3cfc3CBA1B4aAF969057F590D23efe46848F4270` | AddNewMarket.s.sol, subgraph (H) |
| Affiliate NFT | `0xFbEc13381B63E811538F63177CfD2B5FF925e88b` | subgraph `networks.json` (H) |
| Market 1: BTC/USD daily, 0.01 ETH | `0x9A5f16c1f2d6b8c9530144aD23Cfa9B3c4717eF1` | keeper README + subgraph (H) |
| Market 2: BTC/USD daily, 0.1 ETH | `0x135a74aaac0E9F4622B94800d069d531d31c4f46` per keeper README; the subgraph lists a *different* "Market2" at `0x8B64Cf63B08f7eB3ad163282bf61d382DfFF0586` (commit "Update contract address of 0.05 ETH market"). Both exist and are Sourcify-verified. Which one is canonical is NOT FOUND (docs down). | (H for existence, conflict flagged) |
| Market 3: weekly Mon, 0.01 ETH | `0x10EF281AAc569Cb011BfcB4e1C6cA490011486a5` | keeper README + subgraph (H) |
| Market 4: weekly Wed, 0.01 ETH | `0xB8eC8622D8B7924337CA7B143683459fE5a13f79` | same (H) |
| Market 5: weekly Fri, 0.01 ETH | `0xE8B9a818D57E2413E05144311E2d4d190c3f711c` | same (H) |
| Chainlink BTC/USD feed | `0x6ce185860a4963106506C203335A2910413708e9` | DeployMainnet.s.sol (H) |
| Chainlink L2 sequencer uptime feed | `0xFdB631F5EE196F0ed6FAa767959853A9F217697D` | DeployMainnet.s.sol (H) |

## 3. Chains and collateral

- Chain: **Arbitrum One (42161) only** (H, DefiLlama `chains: ["Arbitrum"]`, subgraph `network: arbitrum-one`).
- Collateral: **native ETH** (`msg.value`); no ERC-20, no USDC (H, source). Payouts are native ETH from the market contract's balance.
- Other stack elements: Vault reads PSM token `0x17A8541B82BF67e10B0874284b4Ae66858cb1fd5` for a redemption feature (H, source); irrelevant to trading.

## 4. Read API

- **exists: `onchain-or-subgraph-only`.** No official REST, WebSocket or SDK. `docs.topcut.finance` / `topcut.finance` are NXDOMAIN, so no API documentation is reachable. [H]
- Subgraph (repo `PossumLabsCrypto/topcut-subgraph`): entities `LoyaltyPointsList`, `MarketTrades`, `Trade{trader, price, settlementTime}`, handlers `PredictionPosted`, `CohortSettled`, `LoyaltyPointsUpdated`, `LoyaltyRewardDistributed`. The hosted/Gateway query URL is NOT FOUND (searched: repo README is 17 bytes, `subgraph.yaml`, `docker-compose.yml` names only; GraphQL queries are POST anyway and were not issued). [H for schema, NOT FOUND for URL]
- On-chain reads an adapter would use (H, source/ABI): `TRADE_SIZE()`, `WIN_SIZE()`, `TRADE_DURATION()`, `nextSettlement()`, `activeCohortID()`, `cohortSize_1()`, `cohortSize_2()`, `tradesCohort_1/2(uint256)` -> `(address owner, uint256 guess)`, `claimAmounts(address)`, `totalPendingClaims()`, `keeperRewards(address)`. Events: `PredictionPosted(address indexed user, uint256 indexed settlementTime, uint256 price)`, `CohortSettled(uint256 cohortSize, uint256 winners, uint256 settlementPrice, uint256 settlementTime)`, `PrizesClaimed(address indexed user, uint256 claimedAmount)`.
  - Caveat: the repo's `settlement_bot/abi.json` is **stale** vs. the current source (its `CohortSettled` lacks `settlementPrice`, it lists `SHARE_KEEPER`). Fixture `market_abi_settlement_bot_repo.json` is saved as-is; regenerate the ABI from `src/TopCutMarket.sol` (commit of 2025-08-08) before use. [H]
- Auth, rate limits: none at venue level; limits are whatever the Arbitrum RPC provider imposes. Third-party aggregators: only DefiLlama (TVL and a derived fees series) was found, and it is stale.
- Public GET sample shapes confirmed (these are DefiLlama, not the venue): `defillama_protocol_meta_trimmed.json`, `defillama_fees_summary_trimmed.json`. A venue-native response shape could not be captured because no venue API exists.

## 5. Trade path and PayBox reachability

- **Programmatic placement:** a plain EVM transaction, `castPrediction(...)` with `value == TRADE_SIZE` to a market contract on Arbitrum. No signed off-chain orders, no order book, no cancel (a prediction cannot be withdrawn or edited). Settlement and claims are also plain transactions: `settleCohort()`, `claim()`, `claimKeeperReward(recipient, amount)`. [H, source]
- **PayBox reachability: partial (technically expressible, practically moot).**
  - Arbitrum (eip155:42161) is in PayBox's `discover_tokens mode=chains` catalog (listed in the project's `docs/research/06-paybox-platform.md`, H on 2026-10-19), with the caveat that the tool calls it a "metadata catalog, not a support allowlist" (per-chain signing coverage unverified).
  - PayBox's Open Plugin `evm` proposal shape is `chain eip155:<id>` plus `transaction:{to, value, data}` with decimal-wei value and hex calldata (same doc, H per that doc), which can carry `castPrediction` with `value = 1e16` wei. The wallet pays gas in ETH on Arbitrum.
  - So a PayBox EVM wallet could in principle place and claim predictions. It is not worth doing because there is no liquidity, no price signal, and the game is a negative-expected-value lottery for an uninformed entrant (section 7).

## 6. Event coverage and independence

- Categories: **crypto price only, BTC/USD** (H). No sports, politics, macro, or event markets.
- Overlap with other venues: only the reference asset. Other venues (Polymarket, Kalshi, Hyperliquid outcomes, Limitless, etc.) list BTC threshold or range binaries; TopCut's payoff is "be among the closest 9% of guesses in your cohort", which depends on other entrants' guesses and cannot be mapped to a binary contract price. **Arbitrage potential: none.**
- Shared liquidity: none (self-contained contracts, no routing from another venue). It is independent but irrelevant. [H]
- Possible signal use: the stream of `PredictionPosted` guesses is a crowd BTC-price forecast with a known settlement time. With activity at roughly zero since Sept 2025, there is no live signal.

## 7. Fees (H, source constants and DefiLlama methodology)

- Per entry, paid by the trader inside the stake: **5%** to the Vault (`SHARE_VAULT = 50 / 1000`), **3%** to the frontend address passed by the caller (`SHARE_FRONTEND = 30 / 1000`; a caller can pass its own address, so it is effectively a rebate for self-routing), **keeper reward** for settlement `max(0.001 ETH, cohortSize x 1e14 wei)` paid from the contract balance, bounded by the constructor to <= 1% of the stake per entry. DefiLlama states "9% of all ETH flows" as total user fee burden (https://github.com/DefiLlama/dimension-adapters/blob/master/fees/topcut/index.ts).
- Payout: `cohortSize / 11` winners (floor, minimum 1), each paid `10 x TRADE_SIZE`. A uniformly random entrant wins 1/11 of the time, so gross EV is 10/11 = 0.909 of the stake before any skill edge; pool inflow is 92% of stakes after vault and frontend shares.
- Edge cases from audit 3 (H): cohorts under 11 entries are under-funded (the pool cannot pay a full `WIN_SIZE`); a lone entrant can snipe an empty cohort just before settlement for a risk-free 10x ("sniping ... is actually encouraged", per the maintainer reply). Surplus from cohorts not divisible by 11 stays in the contract.
- Trading gas on Arbitrum plus ETH price risk during the cohort window (stake and payout are in ETH while the guess is in USD).

## 8. Resolution mechanism and dispute risk

- **Resolution:** Chainlink BTC/USD `latestRoundData()` on Arbitrum, read at the time `settleCohort()` is *called* (not at the nominal settlement timestamp). Guards: sequencer uptime feed must report up with > 1 h grace after restart; oracle `updatedAt` must be within 1 h; `answeredInRound >= roundId`; `price > 0`. The settlement price is stored in the `CohortSettled` event (commit 2025-07-19 "Add settlement price to event"). [H, source]
- **No dispute process.** Outcome is fully mechanical; recourse does not exist beyond the audits.
- Risks (H/M): (a) keeper timing discretion: settlement can occur any time after `nextSettlement` while the feed is < 1 h stale, so the reference price is not pinned to a timestamp (audit L-02, "Settlement price timestamp may significantly deviate"); (b) if nobody settles, new entries revert `WaitingToSettle`; (c) feed stale or sequencer outage blocks settlement; (d) settlement loop is O(cohort size x winners) in gas (cohort cap 2,200); (e) three audits are in the repo (auditor names in file names: Mahdi Rostami, carrotsmuggler, Mario Poneder; only audit 3's text, start date 2025-06-11, was read) found a Medium flash-loan vault-drain issue (resolved) and the under-funded small-cohort design (acknowledged, not fixed).
- Admin risk: the market source has no owner, pause or upgrade function (H, source read in full). The Vault has an "extract any token for 10 ETH" function and a PSM redemption path (H, vault source head only; remainder of the vault file not read).

## 9. Geo, ToS, automation, licence

- ToS / geo restrictions / automation rules: NOT FOUND (searched: the official site and docs are NXDOMAIN; the GitHub repos contain no ToS or geofence text; WebSearch budget for the session was exhausted, so no secondary search could be run). Fully permissionless contracts, so no technical geoblock.
- Licence: `TopCutMarket` and `TopCutVault` are **BUSL-1.1**, licensor Possum Labs LLC, "Additional Use Grant: None", change date 2028-01-01 to GPL-2.0-or-later (H, repo `LICENSE`). Reading logs/state is not use of the licensed work, but redistributing or deploying forks is restricted; do not vendor their source into the project.
- Keeper/settlement bot exists in the repo (`settlement_bot/`, credited to a third-party contributor); automated settlement and claiming are explicitly supported, but note it needs a private key in an `.env` file, which this project should never use.

## 10. Liquidity (all with sources and dates)

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| TVL (ETH in Vault) | $53.15 | DefiLlama, 2026-10-19 | H |
| TVL peak | $6,590 | DefiLlama, 2025-08-25 | H |
| Fees, 24h / 7d / 30d / 1y | $0 / $0 / $0 / $0 | DefiLlama, 2026-10-19 | H |
| Fees, all time | $10,104 (DefiLlama estimate = 1.8 x vault ETH inflows) | DefiLlama, 2026-10-19 | H |
| Implied cumulative stake volume | about $112K ($10,104 / 0.09) | derived from the line above | M |
| Last non-zero fee day | 2025-09-04 ($4); previous 2025-08-25 ($20) | DefiLlama fees series | H |
| Open interest / per-cohort depth | NOT FOUND (needs on-chain reads of `cohortSize_*`; not performed) | - | - |

## 11. Adapter spec (only if it is ever revived)

- Fetcher type: on-chain log reader (no REST). Inputs: the five market addresses plus the Vault; indexes `PredictionPosted` and `CohortSettled`.
- Normalisation: there is no probability to emit. At most, emit a "crowd guess distribution" signal: median and dispersion of `price` per `settlementTime` for the BTC/USD feed, flagged `kind: "guess-lottery"` so the arbitrage scanner skips it.
- Do not register as an arbitrage leg. Do not route trades.

## 12. Not found / open questions

- Last on-chain activity date of any market (Arbiscan/Blockscout blocked or key-gated; JSON-RPC is POST and out of scope). A single `eth_getLogs` for `PredictionPosted` over the last 30 days on the five addresses would close this.
- Which address is canonical "Market 2" (`0x135a...` vs `0x8B64...`).
- Subgraph query URL; X account status; whether the site was intentionally retired or the domain simply lapsed (the DNS state alone cannot distinguish).
- Terms of service, geo-blocking, any official statement of shutdown.
- WebSearch budget for the session was exhausted (200 calls), so no independent news search was possible for TopCut; every claim above comes from DefiLlama, GitHub, Sourcify, DNS and the project's own docs.

## Sources

- DefiLlama protocol API (H, 2026-10-19): https://api.llama.fi/protocol/topcut-finance ; page https://defillama.com/protocol/topcut-finance (WebFetch returned 403, the API was used instead)
- DefiLlama fees API (H, 2026-10-19): https://api.llama.fi/summary/fees/topcut-finance
- DefiLlama fees adapter (H): https://github.com/DefiLlama/dimension-adapters/blob/master/fees/topcut/index.ts
- Contracts repo (H): https://github.com/PossumLabsCrypto/TopCut (files read: `src/TopCutMarket.sol`, `src/TopCutVault.sol` first ~150 lines, `script/DeployMainnet.s.sol`, `script/AddNewMarket.s.sol`, `settlement_bot/README.md`, `settlement_bot/abi.json`, `AUDIT REPORTS/Audit 3 - MarioPoneder.md` (first 120 lines), `LICENSE`, `README.md`)
- Subgraph repo (H): https://github.com/PossumLabsCrypto/topcut-subgraph (`subgraph.yaml`, `networks.json`, `schema.graphql`, commit list)
- Sourcify v2 contract lookups (H, 2026-10-19): https://sourcify.dev/server/v2/contract/42161/{address}
- DNS (H, 2026-10-19): `dig` for topcut.finance, www/docs/app subdomains (NXDOMAIN); possumlabs.io resolves
- Project doc for PayBox chain catalog and proposal shape (cited as H in that doc, M here): `docs/research/06-paybox-platform.md`
- Not accessible: https://www.topcut.finance/ and /docs (ENOTFOUND), Blockscout (Cloudflare challenge), X `@TopCutFinance`.

## Privacy and safety notes

- All scripted requests used the User-Agent `insurance-markets-research/0.1`; no email, name, or path was sent anywhere. Fixtures and this file were grepped for `@` and personal identifiers (the only `@` hits are the venue's public X handle).
- No embedded instructions aimed at AI agents were found in the pages or repos read. (An unrelated spam token returned by a PayBox `discover_tokens` search had a name containing "Bitcoin Ripple Eth Arbitrum Sola"; it contained no instruction and was ignored.)
