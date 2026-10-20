# Possum Finance (possum.finance) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:35-04:00 UTC). READ-ONLY: `gh api` file reads, unauthenticated GETs to documented public hosts (DefiLlama, GeckoTerminal, RDAP, the venue's own parked domain), no account, wallet, key, signature, on-chain call, POST or PayBox tool. Third-party pages and responses were treated as untrusted data; nothing in them was followed. WebSearch was unavailable (session budget used up), so no press or social coverage was searched. The explorers (Arbiscan, Blockscout) returned 403 / Cloudflare challenge to a scripted client and were not worked around, and the Routescan GET API does not support chain 42161; so no on-chain balances or transaction timestamps were read. JSON-RPC (POST) was not used.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/possum-finance/` (listed at the end).

---

## 0. Bottom line

1. **Not an event-contract market.** It is a stake-and-vote reward game: you stake the project token PSM, call "ETH/USD up or down" for the next weekly epoch, and winners split a small PSM reward from a fixed per-epoch budget. There is no price, no odds, no order book, no AMM and no outcome token. A losing caller keeps their stake ("no-loss"). Nothing about it can be quoted as a probability. (H, contract source)
2. **Effectively dormant or dead.** The official site `possum.finance` currently serves a Namecheap parking page that says "Domain registration has expired"; TLS fails on every host. The repo was last pushed 2026-03-21. The audited MVP described itself as a 3-6 month proof of concept (audit dated Dec 2025). DefiLlama flags the project URL as dead. PSM trades in cents per day. (H)
3. **Economically negligible even if the contracts still answer.** PSM market cap about $1.6k, the PSM/WETH LP holds about $13, the whole per-epoch reward budget is 2,000,000 PSM, about $0.54. (H data, M arithmetic)
4. **adapter_priority = skip.** Nothing here is a price-bearing leg; the only machine-readable surface is raw contract state and events on Arbitrum. At most it is a curiosity "sentiment" signal that is Sybil-steerable by design (the audit says so). Revisit only if the team relaunches on a live domain with real collateral.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Official site | `http://www.possum.finance/` returns HTTP 200 from nginx with a Namecheap parking template: heading "Domain registration has expired." and "Renewal instructions". `https://` fails at TLS (`SSL_ERROR_SYSCALL`) on apex, `www`, `app`, `docs`. Sending a random unrelated Host header to the same IP returns the byte-identical page, so it is a generic lander, not Possum content | H (fixture `namecheap_parking_page_possum.finance_2026-10-19.html`) |
| Registry data | RDAP (Identity Digital): registered 2025-09-27, expiration 2027-09-27, last changed 2026-09-27, status `client transfer prohibited` + `auto renew period`. My reading: the one-year term lapsed 2026-09-27 and the registry auto-renewed it; the registrar is holding it in its expired state and serving the lander. NS in DNS answers point at `lander.d.parity.domains`. Whether the team will pay to restore it is unknown | H data, M reading (fixture `rdap_possum_finance_2026-10-19.json`) |
| Docs location | The Dune dashboard says "Docs link: possum.finance"; that is the dead domain. No other docs site found | M (WebFetch summary of the Dune page) |
| GitHub | `PossumLabsCrypto/PossumFinance`: created 2025-10-29, last push 2026-03-21 ("upload V1"), not archived, GPL-2.0, 0 stars, 0 open issues. `PossumFinanceSubgraph`: last push 2025-11-29. Org page is not readable with the available token (404) | H |
| MVP lifetime | Team reply in the audit: "This version of the protocol is an MVP with an expected lifetime of 3-6 months ... An upcoming 'full release' version ... will have additional features" | H (`Security Audits/MVP/Report_MarioPoneder.md`) |
| DefiLlama | Entry "Possum Finance", category Yield, chain Arbitrum, `deadUrl: true`, TVL $2,063 on 2026-10-18 (peak $593,545 on 2024-12-06; first point $145,610 on 2024-01-26). The description ("Portals ... upfront fixed yield on staked tokens") is the earlier product, so this TVL is not Signal Vault TVL | H data, M interpretation (fixture `defillama_protocol_possum-finance_2026-10-19.json`) |
| Token trading | GeckoTerminal: PSM price $2.68e-7, market cap $1,611, 24h volume $0, zero trades in last 24h. PSM/WETH pool `0xDa82...628F` (the vault's fee pool): last trading day 2026-03-22. Other PSM/WETH pool `0x8bfa...c798`: 183 traded days since 2025-09-15, only $8.91 of volume since 2026-07-21, last day 2026-10-17 ($0.05) | H (fixtures `geckoterminal_*`) |
| Dune | Dashboard "No-Loss Prediction Markets" (owner `possum_finance`, id 199823) exists and loads (HTTP 200 on 2026-10-19). Its widgets are client-rendered from six Dune queries; I could not read their values (no API key allowed). Last-refresh date not visible | H (page exists), M (content via WebFetch) |
| X / Twitter | `x.com/Possum_Finance` via WebFetch returned HTTP 402 and no body; stopped, nothing paid, no payment terms visible | H (that it returned 402) |

Verdict: **still_live = false** for practical purposes (product site gone, no relaunch evidence). The smart contracts cannot be switched off by the site disappearing, so the MVP contracts may still accept calls; I could not confirm either way (explorers blocked).

---

## 2. Kind and market model

- **Kind (H):** on-chain staking/signal game with a trading vault, "no-loss prediction market" in the project's own marketing wording (GeckoTerminal token description: "a tool for decentralized and incentivized sentiment polling that gives signals to a trading engine").
- **MVP (H, `src/MVP/SignalVault.sol`, `AssetVault.sol`):**
  - Binary price-direction call on a single Chainlink feed (ETH/USD on Arbitrum), fixed epoch length (mainnet script: 604,800 s = 7 days; first settlement 2025-12-01 19:00 UTC, so settlements fall on Mondays 19:00 UTC).
  - Users `stake` PSM (1% of the deposit is sent to the PSM-ETH Uniswap V2 pair), then `castPrediction(1 = up | 2 = down)` for the next epoch. Votes are weighted per address, not per token: anyone with at least 1e23 base units (100,000 PSM) gets `UNIFORM_VOTEPOWER` = 1000, doubled per consecutive win up to a cap of 100,000. The audit calls out the resulting Sybil steerability (finding L-02).
  - At `settleEpoch()`, result = settlement price above or below the previous settlement price. Winners split `epochReward` (max 2e24 base units = 2,000,000 PSM, less if the vault lacks PSM) pro rata to their staked PSM. Losers lose nothing but the reward and the vote streak.
  - `vaultDirection` for the next epoch = the side with more votes. The Asset Vault then lets anyone swap WETH for USDC (or the reverse) only in that direction at exactly `last_settlementPrice` (no fee in code), up to the vault's balance. PSM holders can also redeem PSM for a pro-rata slice of any vault token (`redeemPSM`, base 1e27, max 5e26 PSM per tx). Treasury supplied 100% of the vault's trading capital (team statement in the audit).
- **V1 (H, `src/V1/*`, uploaded 2026-03-21, no deployment addresses in the repo):** a points game, not a payout market. `Market.sol`: 24-hour epochs, min stake 1,000,000 PSM in a `StakingVault`, win and activity streak multipliers add points in a `RewardPool`; points are later redeemable via the pool. `AutoSettlementLP.sol` is a constant-product PSM/ETH pool whose swaps also trigger `settleEpoch` on registered markets. The AutoSettlementLP deploy script registers the MVP SignalVault address `0xb800...1fbc` as market slot 0 (H); my inference is that the V1 pool was meant to keep the MVP settling (M). Whether V1 contracts were ever deployed is NOT FOUND.
- **Not scalar, not categorical, not tradable pre-resolution.** There are no outcome tokens, no positions that can be priced or sold, and no way to hedge another venue with it. Staking is the only exposure.
- **Other pairs:** the testnet deploy script lists ARB/USD and LINK/ETH vault pairs; mainnet has only the WETH/USDC pair in the script. (H)

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Arbitrum One (42161) | H (Chainlink feed and token addresses in `DeployVaults.s.sol`) |
| Collateral | PSM `0x17A8541B82BF67e10B0874284b4Ae66858cb1fd5` (18 decimals; total supply about 5.73e9). Not a stable asset. Vault trading assets are WETH `0x82aF...Bab1` and native USDC `0xaf88...5831` | H |
| MVP contracts (first deployment, per audit I-02) | SignalVault `0xb800B8dbCF9A78b16F5C1135Cd1A39384ABf1fbc`; AssetVault `0xc7a22081662faeedc27993cb72cba6141e15ba48`. The repo code is a later, fixed version; the addresses of any redeployment are not in the repo | H (audit text); redeployment M/NOT FOUND |
| Oracle | Chainlink ETH/USD `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612` + Arbitrum sequencer uptime feed `0xFdB6...697D` | H |
| LP / fee pool | PSM-WETH Uniswap V2 pair `0xDa82C77Bce3E027A8d70405d790d6BAaafAc628F` (receives 1% deposit fee) | H |

## 4. Read API

- **Official API: none.** No REST, WebSocket, docs site, SDK or OpenAPI found. `exists = onchain-or-subgraph-only`.
- **On-chain reads (H, from source):** SignalVault public getters `nextSettlement`, `activeEpochID`, `totalStaked`, `epochReward`, `last_result`, `last_settlementPrice`, `vaultDirection`, `upVotes(epochId)`, `downVotes(epochId)`, `stakedUp(epochId)`, `stakedDown(epochId)`, `stakes(user)`, `predictions(epochId, user)`, `getPendingRewards(user)`; AssetVault `quoteSwapTokens(tokenIn, amountIn)`, `quoteRedeemPSM`. Events: `PredictionPosted`, `EpochSettled`, `Staked`, `Unstaked`, `RewardCompounded`, `SyncFailed`; AssetVault `Swap`, `RedeemedPSM`. Epoch ids alternate 1 and 2 and are overwritten, so history must come from events.
- **Subgraph (M):** `PossumLabsCrypto/PossumFinanceSubgraph` has a schema and ABIs but `networks.json` lists only Arbitrum Sepolia addresses. No hosted mainnet endpoint is documented. NOT FOUND for a public query URL.
- **Dune:** public dashboard exists; Dune's API needs a key, so it is not usable by the aggregator without signing up (not done).
- **Rate limits / auth:** n/a (depends on whichever Arbitrum RPC is used).

## 5. Trade path

- **Programmatic placement:** plain EVM transactions on Arbitrum only: `PSM.approve(SignalVault, amount)`, `stake(amount)`, `castPrediction(1|2)`, `unstake(amount)`. `_claim` runs on every call, so rewards auto-compound into the stake. No signed orders, no off-chain matching. (H, source)
- **Asset Vault arbitrage hook (H, source):** `swapTokens(tokenIn, amountIn, minReceived, deadline)` swaps at the stale settlement price in the majority direction. That can be profitable versus spot late in an epoch, but only against whatever WETH/USDC the vault holds. Vault balances were not readable (explorers blocked). The owner is a single hard-coded EOA that can `withdrawTokens` anything from the AssetVault (audit finding L-01, acknowledged). Treat any such opportunity as an MEV curiosity, not a prediction-market leg.
- **Settlement is permissionless but unpaid in the MVP:** `settleEpoch()` can be called by anyone after `nextSettlement`; `castPrediction` reverts `WaitingToSettle` once overdue, so epochs stall without a keeper. V1 adds a swap-triggered settlement incentive.

## 6. PayBox reachability

**partial.** Arbitrum (42161) is in PayBox's chain catalog per this repo's own research (`docs/research/06-paybox-platform.md`, H there, not re-verified by me). So approve/stake/castPrediction could be expressed as ordinary EVM transaction proposals (EOA pays ETH gas). There is no signed-order path. Not recommended: the collateral is a near-worthless token and the contracts' liveness is unconfirmed.

## 7. Fees

- MVP: 1% of staked PSM on every `stake` (sent to the PSM-ETH pair then `sync()`), paid by the staker. No fee on predictions, claims or unstaking. AssetVault swaps: exact settlement-price quote, no fee in code. (H)
- V1: 1% of staked PSM retained on withdrawal (`WITHDRAWAL_FEE_PERCENT = 1` in `StakingVault`); AutoSettlementLP charges a constant-product swap fee (fee constant not read). (H partly)

## 8. Resolution and dispute risk

- Resolution is mechanical: first settlement-time Chainlink `latestRoundData` after `nextSettlement`, rejecting prices older than 1 hour, incomplete rounds and non-positive prices, and refusing to settle within 1 hour after an L2 sequencer restart. No human oracle, no dispute window. (H)
- Risks: off-by-one first epoch pays nothing (audit I-01); owner can drain the AssetVault; Sybil vote steering; PSM is illiquid so rewards are not realisable in practice. One audit (single researcher, Dec 2025). (H)

## 9. Geo, ToS, automation

NOT FOUND (searched: possum.finance is down; GitHub README is the unmodified Foundry template; no ToS in the repo). No geo-block, KYC or automation rule can be cited. Direct contract calls are permissionless by construction. (H for the README and repo content, NOT FOUND for the policy)

## 10. Event categories and overlap

Single product: ETH/USD up/down per week (MVP) or per day (V1). That overlaps conceptually with crypto-price markets elsewhere, but there are no prices to compare: the payout is a share of a PSM reward, not a function of the probability. No sports, politics or macro. **No cross-venue arbitrage is possible; at best a stake-weighted sentiment count (`upVotes` vs `downVotes`) usable as a weak, manipulable signal.** (H)

## 11. Liquidity (with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| DefiLlama TVL | $2,063 (Arbitrum), likely legacy product | `api.llama.fi/protocol/possum-finance`, point dated 2026-10-18 | H (number), M (what it covers) |
| PSM market cap / FDV | $1,611 / $1,538 | GeckoTerminal token endpoint, 2026-10-19 | H |
| PSM/WETH pool `0x8bfa...` reserve | $13.09 | GeckoTerminal pool endpoint, 2026-10-19 | H |
| PSM/WETH pool `0xDa82...` reserve | about $0 (3.5e-15 USD) | GeckoTerminal pool endpoint, 2026-10-19 | H |
| PSM volume | $8.91 since 2026-07-21 (pool `0x8bfa`); pool `0xDa82` none since 2026-03-22 | GeckoTerminal daily OHLCV, 2026-10-19 | H |
| Epoch reward budget | 2,000,000 PSM max, about $0.54 at $2.68e-7 | contract constant x GeckoTerminal price | M |
| Min stake for vote power | 100,000 PSM, about $0.03 | contract constant x GeckoTerminal price | M |
| Vault trading capital | unknown (treasury-funded; balances unreadable) | | NOT FOUND |

## 12. Independence, extras, risks

Liquidity is not shared with any other prediction venue; the only external touchpoints are the Chainlink ETH/USD feed and the Uniswap V2 PSM-WETH pair. It is independent but irrelevant. Note a GeckoTerminal inconsistency: the stale 0xDa82 pool endpoint shows FDV $190k at an old price while the token endpoint shows $1.5k; the token-level figure is the current one (M).

## 13. Adapter spec (only if built despite the skip)

Read-only Arbitrum log indexer for SignalVault `EpochSettled` / `PredictionPosted` plus `view` calls for `upVotes/downVotes/vaultDirection`. Map to a "signal" record `{asset: ETH/USD, epoch_end, up_votes, down_votes, result}`; never to a market with prices. First resolve whether the live MVP/redeployed SignalVault address is still receiving transactions (needs an RPC or explorer key).

## NOT FOUND (searched)

- Official docs site, API, WebSocket, SDK (searched: possum.finance hosts, GitHub org repos and code search for "possum.finance", DefiLlama, GeckoTerminal info).
- Terms of Service / geo rules (searched: repo, parked site).
- Mainnet addresses of the fixed (post-audit) vault versions and of V1 contracts.
- Any 2026 press, announcements, or relaunch notice (WebSearch budget exhausted; x.com returned 402).
- Vault balances, staker count, epoch history (explorers blocked; Dune queries need an API key).

## Open questions

- Is the MVP SignalVault still being settled each Monday? A single `activeEpochID` / `nextSettlement` read via RPC would answer it.
- Did the team move to a new domain or token after the lapse of `possum.finance` (2026-09-27)?
- What do the six Dune query ids (6367006, 6360414, 6419811, 6360497, 6459097, 6492105) show for stakers and epochs?

## Sources

- Venue parked page (generic Namecheap lander, 2026-10-19): http://www.possum.finance/ - H
- RDAP: https://rdap.identitydigital.services/rdap/domain/possum.finance - H
- Dune dashboard: https://dune.com/possum_finance/possumfinance - H (exists, title) / M (content)
- GitHub repo (contracts, deploy scripts, audit): https://github.com/PossumLabsCrypto/PossumFinance - H (`src/MVP/SignalVault.sol`, `src/MVP/AssetVault.sol`, `src/V1/*.sol`, `script/DeployVaults.s.sol`, `script/DeployAutoSettlementLP.s.sol`, `Security Audits/MVP/Report_MarioPoneder.md`)
- GitHub subgraph repo: https://github.com/PossumLabsCrypto/PossumFinanceSubgraph - H
- DefiLlama protocol: https://api.llama.fi/protocol/possum-finance and https://api.llama.fi/protocols - H
- GeckoTerminal API (token, token info, pools, OHLCV): https://api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x17A8541B82BF67e10B0874284b4Ae66858cb1fd5 and `/pools/0xDa82C77Bce3E027A8d70405d790d6BAaafAc628F`, `/pools/0x8bfaa6260ff474536f2f76efdb4a2a782f98c798` - H
- PayBox chain catalog (this repo): `docs/research/06-paybox-platform.md` - H there
- Blocked / unusable: arbitrum.blockscout.com (Cloudflare challenge), arbiscan.io (403), api.routescan.io (chain not supported), x.com (402). Not used: web archives and third-party search proxies.

## Fixtures

`docs/research/fixtures/possum-finance/`
- `namecheap_parking_page_possum.finance_2026-10-19.html` and `namecheap_parking_page_headers_2026-10-19.txt` (expired-domain lander, 4.7 KB)
- `rdap_possum_finance_2026-10-19.json` (trimmed RDAP: status, events, nameservers, registrar)
- `defillama_protocol_possum-finance_2026-10-19.json` (trimmed: metadata, current TVL, first, peak and last 14 points)
- `geckoterminal_token_psm_2026-10-19.json`, `geckoterminal_token_info_psm_2026-10-19.json`, `geckoterminal_pool_psm_weth_0xDa82_2026-10-19.json`, `geckoterminal_ohlcv_day_psm_weth_0x8bfa_2026-10-19.json` (first 20 daily candles)
