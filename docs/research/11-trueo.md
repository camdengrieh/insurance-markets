# 11. Trueo deep-dive (on-chain binary prediction market, Base now, Ethereum announced)

Researched 2026-10-19 (sandbox clock showed 2026-10-18 evening UTC for some responses). Read-only. No PayBox tools were called. No third-party code was cloned, installed or executed (I wrote one small pure-Python keccak helper of my own, scratchpad only, to derive Uniswap v4 pool ids).

Confidence tags: **H** = read first-hand in a primary source this session (GitHub raw file, Sourcify-verified source/ABI, DefiLlama JSON, explorer page, official site). **M** = secondary, summariser-mediated (WebFetch of an explorer or news page), or inferred from code. **L** = weak, stale or contradicted.

Everything XO/PayBox-specific in `docs/plan.md` was treated as an unverified lead and is not relied on here. Where I say "gate N" I mean the 9-item feasibility gate in `docs/plan.md`.

## 0. Method constraints that shape what is and is not verified

- Ground rules allow only unauthenticated GETs. JSON-RPC `eth_call` is a POST, so I could **not** read live contract state (market count, hook `feeNumerator`, `protocolFee`, factory `minimumDeposits`, TYD `pricePerShare`, `maxDeposit`). Those are listed as NOT FOUND / open questions, with the exact call to make.
- `base.blockscout.com` returned a Cloudflare challenge/403 to curl and WebFetch; I did not try to bypass it. `eth.blockscout.com` GET works (used for a negative check on Ethereum). Basescan pages were readable via WebFetch (summariser-mediated, so M for numbers).
- Sourcify (`sourcify.dev/server/v2/contract/{chain}/{addr}`) is a GET API and gave verified ABIs/sources for most Base contracts (H).
- The `xo-docs` MCP only indexes XO Market docs. A search for "Trueo" returned XO pages only (smart accounts, order API). Nothing about Trueo is there. (NOT FOUND, searched: `search_xo_market_docs "Trueo"`.)

## 1. Bottom line

1. **Trueo is real, live on Base, and the most natural venue so far for PayBox's EVM transaction-proposal model.** Every action is a plain EVM call from the user's address: no API keys, no HMAC, no off-chain order book, no smart-account scheme, no bridge into a custom chain. Reads are on-chain contracts (and Uniswap v4 `StateView`/`V4Quoter`).
2. **It is very thin.** DefiLlama (snapshot 2026-10-18 15:59 UTC): TVL about $1.06M (Base), DEX volume 24h $313, 7d $6,296, 30d $17,106, all-time $796,857. The 20 markets listed on the home page sum to about $134K TVL; the largest is $28K and the median TYD-paid market is about $2K. Treat it as a **signal/inefficiency source with tiny executable size**, not a size venue.
3. **Base is authoritative today.** The move to Ethereum mainnet was announced 2026-09-21/22 but **no Ethereum deployment exists** in the official docs, the contracts repo, the app config, DefiLlama (chains: Base only) or my Ethereum Blockscout name searches. Base markets keep running; users were asked not to open new Base markets expiring after 2027-01-31. Any adapter must be **chain-parameterised** and must not hardcode Base forever.
4. **Collateral is TYD, not USDC.** TYD ("True Yield Dollar") is a 6-decimal ERC-4626 Yearn V3 vault share over Base USDC. Outcome tokens are 18-decimal plain ERC-20s (YES/NO), priced in TYD in Uniswap v4 pools behind a custom hook. A `UniversalRouterAdapter` lets a user swap USDC <-> YES/NO in one call (wrapping/unwrapping TYD).
5. **Permissionless creation exists on-chain** (`LaunchpadFactory.proposeCommunityTruthMarketV2`, gas-only to propose) but a market only becomes tradable after depositors fund a proposal past a minimum (one live proposal used 200 TYD) and the funding `deposit` needs a **Permit2 `PermitTransferFrom` EIP-712 signature**. So "create" is not a single-proposal operation, and it collides with the plan's `$10/order, $50/day` caps unless other people fund the proposal.
6. **Oracle trust is the main non-technical risk.** Resolution is optimistic (12h windows) with Oracle Council (5 genesis members) then TRUE-holder vote then attesters. In the public contracts the TRUE-holder/attester stages are **not on-chain voting**: `Escalation.resolveEscalatedDispute` is `OPERATOR_ROLE`-gated and takes a Snapshot proposal id string. Contracts are UUPS-upgradeable with owner/admin keys. A live example market sits in `OpenForResolution` since 2026-05-03 with a $255K volume.

## 2. Is this the product the user means? Similarly named products

| Name | What it is | Same product? |
|---|---|---|
| **Trueo** (trueo.com, X @Trueo_, GitHub `trueo-protocol`) | On-chain binary prediction market, Base, TYD collateral, Uniswap v4 hook, optimistic "Truth Oracle", TRUE token | **Yes: this is the one.** Matches every attribute in the task text. |
| **TrueMarkets / True Markets / Truemarkets** | **Former name of the same protocol.** `truemarkets.org` 301-redirects to `trueo.com`; DefiLlama `previousNames: ["TrueMarkets"]`; docs rebrand commit "Rebrand documentation from TrueMarkets to Trueo" (2026-01-23); image host `res.truemarkets.org` still used; PolyMart page says rebrand followed a trademark dispute (M, single secondary source). | **Yes (old name).** So "True Markets" is not a different venue. |
| `trueo.io` | Previous domain (docs commit "Update domain from trueo.io to trueo.com", 2026-01-24). Still serves the same Next.js app with `og:url=https://trueo.com`. | Same, legacy. Do not use as canonical. |
| `trueo.xyz` | Serves a stub that JS-redirects to `/lander`. | Unknown. Not verified as official. Do not trust. |
| Tokens named "Trueo"/"TRUEO"/"Trueo Pepe (TPEPE)" on **Ethereum** | Eth Blockscout search shows at least 5 tokens with these names (e.g. `0x81c3...31C8`, `0x0400...A6CA`, `0x404F...32Ec`, `0xf750...CCCc`, `0x30a1...1110`). The official project has **no** announced Ethereum token address. | **Not official.** Impostor/meme risk. Allowlist addresses only from the Trueo repo/docs. |
| TRUE DEX (Solana perps), TrueFi, TrueNorth (Perps/Outcome/Spot), TrueCurrent, TrueFeedBack, TRUEiGTECH | Unrelated protocols that appear in DefiLlama / search for "True...". | No. |
| "Truth Oracle" | The *framework/whitepaper* (truth-oracle.gitbook.io) that Trueo's oracle implements. | Component, not a venue. |

Question to ask the user (cheap): "By Trueo do you mean trueo.com (formerly TrueMarkets), the Base/Ethereum prediction market with the TRUE token? Nothing else matches." Everything points to yes.

## 3. Official surfaces

| Surface | URL / location | Evidence |
|---|---|---|
| Site/app | https://trueo.com | H, fetched |
| Docs | https://docs.trueo.com (Docusaurus; source repo `trueo-protocol/docs`) | H |
| Contracts repo | https://github.com/trueo-protocol/trueo-contracts (MIT, 15 stars, last push 2026-07-17, single branch `main`) | H via `gh api` |
| Docs repo | https://github.com/trueo-protocol/docs (last push 2026-09-24) | H |
| Legacy docs repo | `trueo-protocol/docs-gitbook` (2025-03) | H |
| X | https://x.com/Trueo_ ; announcement status https://x.com/Trueo_/status/2102123554162561272 (cited by The Block; X itself returns HTTP 402 to WebFetch) | M |
| Discord | https://discord.gg/trueo | H (docs `official-links.md`) |
| Oracle whitepaper | https://truth-oracle.gitbook.io/truth-oracle | H |
| Audits | Guardian: github.com/GuardianAudits/Audits/tree/main/Trueo (3 PDFs); iosiro: iosiro.com/audits/truth-markets-v2-smart-contract-audit | H (listing) |
| Terms / Privacy | https://trueo.com/terms , /privacy | H (terms fetched) |

GitHub org `trueo-protocol`: 3 public repos (`trueo-contracts`, `docs`, `docs-gitbook`), created 2024-10-17. **No subgraph/indexer repo, no SDK, no API docs, no npm package** (NOT FOUND, searched: org repo list, `gh search repos "truemarkets OR trueo prediction market"`, docs sidebar of 18 pages, WebSearch "Trueo API subgraph SDK"). The app has a first-party backend at same-origin `/api/market/*`, `/api/proposals`, `/api/search` etc. (strings in the shipped JS) which is **undocumented**; I did not probe it. The home page server-renders a JSON list of markets (see section 8).

## 4. Chains, deployments, migration status

### 4.1 Base mainnet (chain 8453) is the only deployment (H)

`network_config.json` has exactly one key, `base_mainnet_prod`. `docs/deployments.md` says "Deployed contract addresses for developers integrating with Trueo on **Base mainnet**." The shipped frontend config has `production`, `staging`, `development` blocks (Base addresses for production; staging uses different addresses on a chain I did not identify). No Ethereum block.

Key addresses (all from `network_config.json` and `docs/deployments.md`, H; "Sourcify" column = exact/partial match verified source/ABI fetched by me):

| Contract | Address (Base) | Notes |
|---|---|---|
| TruthMarketManager (proxy) | `0x61A98Bef11867c69489B91f340fE545eEfc695d7` | ERC1967Proxy; impl `0x7BDaE0709F2ecd07E176822B79206b0B67275999` (Sourcify exact_match, verified 2026-06-24); config version 1.4.0; 1,032 txs, last activity `proposeResolution` 2026-10-17 (M, Basescan via WebFetch) |
| OracleCouncil | `0xCa7Af04BC6D24EEA67618c11B883be6851F198BE` | v1.2.0 |
| OracleBonds | `0x8175b0A1e803aC4205aE35F614315Ba801275baA` | v1.1.1; users approve the payment token **to this contract** for bonds |
| Escalation | `0x7397eF691aeb47Fe7Ef2f7e908162e8d7a940B27` | v1.0.0 |
| TruthMarket V1 mastercopy | `0xB7b53c6B219A29aFD8F2EbBeD1ea2B8867eef3d1` | Uniswap **V3** markets (legacy) |
| TruthMarketV2 mastercopy | `0x2CA897F98F6a45729968f0057F1fBf88DB3e3409` | Uniswap **V4** markets; Sourcify exact_match (2025-11-27); markets are EIP-1167 clones |
| Uniswap v4 hook (active, v2.0.0) | `0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4` | `TruthMarketHook`; Sourcify exact_match; created 2026-06-23 via Create2 (M) |
| Uniswap v4 hook (v1.1.0, "inactive" for new markets) | `0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4` | still hosts **14 of the 20** listed markets (derived, section 7.3) |
| OrderManager (active) | `0x1cdB1C43eB64e99780EA9d3C7162C23432C59a1A` | on-chain range/limit orders; Sourcify exact_match; 2,124 txs, last `createOrder` 2026-10-18 (M) |
| FeeCollector (active) | `0x8C6c622A7DE8cEbD1A43e2Fb8363ebbE9120134F` | per hook generation |
| TruthMarketSwapValidator | `0x55e26CF92B924C069db4d8Da7B0b36154374Dd38` | post-swap tick bounds |
| Launchpad (proxy) | `0xeD3ebc2e17a0CC20D22Ff7b7d13488F187fD1af6` | proposal funding; impl `0x8B9b6423B592629FeaDaC50e2DA0f7b282e44147` (Sourcify exact_match 2026-06-23); 1,271 txs, last `deposit` 2026-10-17 (M) |
| LaunchpadFactory (proxy) | `0x9F04dE860cc8B77044682a2706F39B81739A5417` | permissionless propose; impl `0xaa35bc58cb282bcf0C7F4c443A3dBcE63Ed7Ee02` (not on Sourcify); 767 txs, last `proposeCommunityTruthMarketV2` 2026-10-18 17:26 UTC (M) |
| TruthMarketV2Launcher | `0xdB5c23BF232fcb71ce7A8DB4c15f6676a945Bd22` | called only by the Launchpad (`OPERATOR_ROLE`) |
| TruthMarketAdapter | `0x6E08d24AEf78F6d1a97503F64E84fDF65f8125E1` | mint/burn/redeem with USDC<->TYD wrapping |
| UniversalRouterAdapter (proxy) | `0x0A1AFc2121B4441127a02DEF72928F61f564034a` | impl `0x647474aCD39801e3c612d048a21499f9fA14C19e` (M); 1,717 txs, last `execute` 2026-10-18 05:51 UTC (M) |
| V4SwapStrategy | `0x3F3dA9e841FbcB5ABB2A097cBB922E3EF7F7927e` | **source is not in the GitHub repo**; Sourcify exact_match (2025-07-24) gave me the source |
| V3SwapStrategy / SweepStrategy | `0x33961932...3B65` / `0xEB315190...b215` | |
| TYD (Yearn V3 vault, ERC-4626) | `0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B` | name "True Yield Dollar", 6 decimals (GeckoTerminal H-as-JSON; Basescan M); minimal proxy to Yearn V3 vault, Vyper 0.3.7 (M); asset = USDC |
| USDC (native, Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `network_config.tokens.truthMarketAdapterAssetToken` |
| TRUE token | `0x21CFCFc3d8F98fC728f48341D10Ad8283F6EB7AB` | 100M supply cap; docs `official-links.md` |
| TRUE staking / TRUE-ETH staking | `0x1a40621C...35eD` / `0x688F5B49...F014` | |
| Timelock | `0x8963712Bc91aE8C64d96293ed9A1157344f6Fd04` | who owns what is NOT FOUND (needs `owner()`/role reads) |
| Uniswap v4 PoolManager (Base) | `0x498581fF718922c3f8e6A244956aF099B2652b2b` | matches Uniswap's deployments page (H) |
| Uniswap v4 StateView (Base) | `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` | Uniswap deployments page (H); Sourcify match |
| Uniswap v4 V4Quoter (Base) | `0x0d5e0f971ed27fbff6c2837bf31316121532048d` | Uniswap deployments page (H); Sourcify match |
| Uniswap Universal Router (Base) | `0x6ff5693b99212da76ad316178a184ab56d299b43` | in Trueo config and Uniswap page (note Uniswap lists newer UR 2.1.2 deployments; Trueo's adapter is wired to this one) |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | canonical |

I did not verify every row against an explorer (rows marked M are from Basescan summaries; the rest are repo config values corroborated by the shipped frontend address registry, which lists the same Manager/Council/Bonds/Escalation/Adapter/Launchpad/LaunchpadFactory/TRUE addresses).

### 4.2 Ethereum migration status (as of 2026-10-19)

- Announced Monday **2026-09-21** on X by @Trueo_ (The Block 2026-09-22: "Trueo announced the move in a Monday post on X"); Vitalik Buterin replied the same day. Cited reason: "highest integration potential and product upside" (The Block). Priorities after the move: liquidity in core categories and a "next-generation" evidence-driven oracle (Bankless, Cointelegraph, The Block).
- **Guidance for Base:** "Existing Base markets keep running" (Bankless); users asked not to open new Base markets expiring after **2027-01-31**; longer-dated markets should go on Ethereum once live (The Block). Markets expiring before January are unaffected. Trading/resolution/redemption on Base unaffected (Cryptobriefing).
- **TRUE token** can be migrated to Ethereum via the app, open-ended window, future staking/liquidity incentives Ethereum-only (Blockonomi, Bankless).
- **TYD on Ethereum is not mentioned anywhere** (Blockonomi: "The article does not say whether TYD will migrate"). USDC-in-Yearn vault is Base-specific as documented.
- **No Ethereum addresses, no go-live date** in: `network_config.json` (single key), `docs/deployments.md` (Base only, last docs commit 2026-09-24), docs sidebar (18 pages, none on Ethereum), app homepage (no migration banner), DefiLlama (`chains: ["Base"]`), contracts repo (one branch, PR list ends 2026-07-17). Eth Blockscout name search for `TruthMarketManager` / `TruthMarketHook` returned nothing (weak evidence; verified-contract name search only). KuCoin headlines saying "migrates" overstate: bodies describe an announced plan only.
- Implication: build a `chain` + `deployment` config object (addresses per chain, per-hook-generation allowlist) and a startup check that refuses to trade on any chain/address not in the pinned allowlist. Expect Ethereum to bring different hook/pool/gas economics (a Base swap through the adapter used **2,027,645 gas**; on Ethereum L1 that is `gas x gwei x 1e-9` ETH, e.g. 0.0020 ETH at 1 gwei, so a $10 trade can be uneconomic).

## 5. Market lifecycle (V2 / Uniswap v4 markets)

All of this is H from `trueo-contracts@main` source, `docs/*.md`, and Sourcify ABIs unless tagged.

### 5.1 Creation (permissionless path)

1. **Propose** (single tx, no tokens move, gas only): `LaunchpadFactory.proposeCommunityTruthMarketV2(spec)`, selector `0x6127b14a` (I computed it from the signature and it equals the MethodID on a real Base tx, M). `LaunchpadFactory` carries `LAUNCHPAD_PROPOSER_ROLE` on `Launchpad`, and `propose` is not otherwise gated. Alternative `proposeWhalesTruthMarketV2` (depositor whitelist) selector `0x682992c3`.
   - `spec` = `(uint8 proposalType=1, uint256 endOfProposal, uint256 minimumDeposit, uint256 maxRatioThreshold, (string question, string source, string additionalInfo, uint256 endOfTrading, address rewardToken, uint256 rewardAmount, string outcomeSymbolYes, string outcomeSymbolNo, uint24 fee, int24 tickSpacing) marketParams)`.
   - Validation (source): non-empty question/source; symbols 1..20 chars of `[0-9A-Za-z -]`, YES symbol != NO symbol; `fee <= 10000`; tick spacing 1..32767; `endOfProposal > now + minimumProposalDuration` (default 1 hour); `endOfTrading >= endOfProposal + manager.minimumTradingDuration()`; `minimumDeposit >= factory.minimumDeposits[CommunityMarketV2][TYD]` (value NOT FOUND, needs eth_call; `required == 0` reverts `MinimumDepositNotConfigured`). `normalizeParams` forces `rewardToken=address(0), rewardAmount=0`, and replaces `fee==0` with 3000 and `tickSpacing==0` with 60; `maxRatioThreshold==0` becomes 9999.
   - **Live example** (M, one Basescan tx on 2026-10-16, gas 3,769,790, fee about $0.06): `proposalType=1`, `minimumDeposit=200000000` (= 200 TYD at 6 decimals), `maxRatioThreshold=0`, `fee=1`, `tickSpacing=60`, `rewardToken=TRUE`, `rewardAmount=0`, `endOfProposal` about 2 days ahead, `endOfTrading` 1 hour after that; events `ProposalCreated(798)` from both Launchpad and Factory. Proposal id 798 means roughly 800 proposals so far (most never funded, M).
2. **Fund** (the tradable-or-not step): `Launchpad.deposit(proposalId, outcome, amount, permit, signature)`, selector `0x92bbc9d2`. `outcome` is `1`=YES or `2`=NO (binary-outcome plugin required by `propose`). **Token must be the Launchpad's `paymentToken` (TYD)** (the GitHub integrator issue #10 also states "`Launchpad.deposit()` remains TYD-only"). Pulled via **Permit2 `permitTransferFrom` (SignatureTransfer)**, so the depositor must produce an EIP-712 signature (section 11.3). Community hooks: per-tx minimum = 1% of `minimumDeposit`; check-proposal passes when total deposits >= `minimumDeposit` and no outcome exceeds `maxRatioThreshold` of deposits (so both sides must be funded). The deposit that satisfies the check **triggers the launch inside that same tx** (market clone created, YES/NO tokens deployed, both v4 pools initialised at the deposit-weighted opening probability, pools paused until distribution, then `finalize` unpauses and whitelists pools in OrderManager). A failed launch emits `LaunchAttemptFailed` and can be retried with `resolveDeferredLaunch` (permissionless).
3. **Fees:** docs say "A 5% launch fee is charged **only if the proposal successfully graduates**" (`docs/proposal-funding.md`). The **contract also charges `protocolFee` on `withdraw` during the Live phase** (`Launchpad.withdraw`: `(payout, feeAmount) = _calculateAmountAndFee(amount)` when `phase == Live`; no fee in Failed phase). So docs and code disagree: withdrawing early costs the fee. `protocolFee` value NOT FOUND on-chain (docs say 5%, `FEE_SCALE=10_000`).
4. **Failure:** if `endTime` passes without launch, phase reads `Failed` and depositors withdraw fee-free.
5. Direct creation (`TruthMarketManager.createMarketV2*`) is `MARKET_CREATOR_ROLE`-gated (Oracle Council/operator/launcher only). Docs previously said genesis market creation was restricted to Oracle Council members; that paragraph was removed in docs PRs #33/#34 on 2026-09-24, consistent with the permissionless Launchpad being the live path.
6. No creator fee is built into the market contract: `FeeCollector.poolRecipients` is admin-set per pool (frontend lists `feeRecipients: []` for the sampled markets). Creator earnings are NOT FOUND as an automatic feature.

### 5.2 Trading

- Collateral per market is `market.paymentToken()`. For 16 of the 20 listed markets it is TYD; 4 are "conditional" child markets whose payment token is another market's `cYES`/`cNO` token (their contracts are not in the public repo: NOT FOUND, searched `conditional|cYES|cNO` in all `src/`). **Filter to `paymentToken == TYD`.**
- **Complete sets:** `market.mint(paymentTokenAmount)` (selector `0xa0712d68`) pulls TYD and mints equal YES and NO (18 dec); `market.burn(amount)` (`0x42966c68`) burns both (via `burnFrom`, so approve **both outcome tokens to the market**) for TYD; allowed until `Finalized`. `yesNoTokenCap` is `type(uint256).max` for launchpad markets.
- **Single-sided price discovery:** two Uniswap v4 pools per market (YES/TYD and NO/TYD), same hook, liquidity bounded to price 0..1 TYD. "Trading happens on Uniswap, not through the market contract" (integration guide).
- **Trading is not cut off at `endOfTrading`:** "This does not represent a trading cutoff; trading may continue indefinitely, including after resolution." (`docs/markets.md`). `endOfTrading` is the earliest time a resolution may be proposed.
- **Limit orders:** `OrderManager.createOrder` places single-sided concentrated liquidity (range order) on whitelisted pools; funds are pulled from the caller through Permit2 `AllowanceTransfer.transferFrom` (an on-chain Permit2 approval is enough, no signature). Per-tick order cap and per-token minimum order amount exist. Filled/partially-filled orders are settled by the hook's `afterSwap`.

### 5.3 Resolution and redemption

States (`MarketStatus`): `0 Created, 1 OpenForResolution, 2 ResolutionProposed, 3 DisputeRaised, 4 SetByCouncil, 5 ResetByCouncil, 6 EscalatedDisputeRaised, 7 Finalized`. `winningPosition`: `0` unresolved, `1` YES, `2` NO, `3` CANCELED. **`getCurrentStatus()` is derived** (time-based transitions: Created becomes OpenForResolution after `endOfTrading`; ResolutionProposed becomes Finalized after `firstChallengePeriod`; etc.) while the `currentStatus` storage slot lags. The site's indexed `status` was `0` (Created) for markets whose `endOfTrading` passed in Dec 2025, so **never trust an indexer status; call `getCurrentStatus()`.**

- **Propose** (anyone, after `endOfTrading`): `TruthMarketManager.proposeResolution(market, outcome)` selector `0x35dae75c`; posts the resolver bond (default 250 TYD, read `market.resolverBondAmount()`), approved to **OracleBonds**.
- **Challenge window:** 12 hours (docs; per-market `firstChallengePeriod()`; contract setters are owner-only and unbounded per iosiro). No dispute: market finalizes at window end; resolver gets `rewardAmount` (TRUE or USDC per market; launchpad markets use 0) and bond back in the first redemption.
- **Dispute:** `OracleCouncil.openDispute(market, string)` selector `0x89c0b25c`, bond default 250 TYD to OracleBonds. Council = genesis 5 members; a vote closes when `> councilMemberCount/2` agree (3 of 5). **There is no timeout in the contract for council voting: a market in `DisputeRaised` stays there until a majority votes** (disputers can reclaim bonds from unclosed disputes via `claimUnclosedDisputeBonds`).
- **Escalate** (second 12h window): `Escalation.openEscalatedDispute(market, string)`, bond default 750 TYD (older markets may have snapshotted 2,500). Then TRUE holders vote (docs: on Snapshot), then attesters (11 random, `>=250,000` TRUE liquid or staked to trigger). **In the public contracts these later stages are off-chain:** `Escalation.setEscalationProposalId` and `resolveEscalatedDispute` are `OPERATOR_ROLE`-only; the word "attester" appears nowhere in `src/` (the SBT contract `truthAttesterSBT` is in the config but its source is NOT FOUND in the repo).
- **Redeem:** after `Finalized` with YES/NO outcome: `market.redeem(amount)` (`0xdb006a75`, approve winning token to the market) pays 1 TYD per winning token (decimal-adjusted). If CANCELED: `market.withdrawFromCanceledMarket()` (`0x3415a4cf`) pays **0.5 TYD per YES or NO token** held. A trader who bought only YES at 0.90 recovers 0.50. Cancellation is mandated for markets violating the integrity standards (violence, privacy, non-binary, no deadline, ambiguity, contradictory terms, unreliable sources...), "regardless of what occurred in the real world" (`docs/market-integrity-standards.md`).

## 6. Fees (what a trade actually costs)

Costs stack and are **per market**, derived from the pool key:

1. **Uniswap LP fee = `poolKey.fee`**. I derived pool ids for all 20 listed markets (section 7.3): **14 markets use fee 8000 (0.80%)** with the v1.1.0 hook; **6 markets (all recent) use fee 1 (0.0001%)** with the v2.0.0 hook. Both use tick spacing 60. Launchpad default when `fee==0` is 3000 (0.30%); the frontend proposes with `fee=1`.
2. **Hook fee = `hook.feeNumerator() / 10000`**, taken in `afterSwap` from the unspecified currency via return-delta. Source default `0` with a comment "set to 36 for 0.36%"; admin-settable (`setFeeRate`). Live value NOT FOUND (needs `feeNumerator()` on each hook). Observed `cumulativeFees` per market in the site JSON: 0 for 18/20, 23.68 TYD on a 14.6K-volume market (about 0.16%), 2.67 TYD on a 4.8K-volume market: so it has been non-zero at times. Do not assume zero.
3. **TYD conversion:** USDC->TYD is an ERC-4626 `deposit`/`previewMint`; no fee in the adapter, but vault-level behaviour is Yearn V3 (limits/strategy) and NOT FOUND.
4. **Launchpad:** 5% on graduation and (per code) on Live-phase withdrawals.
5. **Gas:** Base swap via adapter 2.03M gas (about $0.03); propose 3.77M gas (about $0.06) at an observed 0.0064 gwei. Cheap on Base; heavy in gas units, which matters for Ethereum and for simulators.
6. DefiLlama methodology: "V1 markets use Uniswap V3 pools (USDC pairs), V2 markets use Uniswap V4 pools (TYD pairs)."

## 7. How YES/NO are priced and how to read it

### 7.1 Pool key and id (H, verified by reproduction)

`PoolKey{currency0, currency1, fee, tickSpacing, hooks}` with `currency0 < currency1` by address. `getPoolKeys()` on the market returns both keys; `getPoolIds()` returns ids. **I reproduced the on-chain pool ids from first principles**: for market `0x25cd6ac2...` the page-shown YES/NO pool ids `0x73ed0c0f...ddbfb` / `0xd8c2aead...71aea` equal `keccak256(abi.encode(TYD, YES|NO token, fee=1, tickSpacing=60, hook=0x3E83...))` with TYD as currency0 (token addresses from GeckoTerminal: YES `0xed905ba9...`, NO `0xcb4122e4...`, both 18 decimals). Repeated for all 20 listed markets (table in 7.3). Pool id = `keccak256(abi.encode(poolKey))`.

### 7.2 Price math (H; cross-checked against the site's own numbers)

`StateView.getSlot0(poolId)` returns `(sqrtPriceX96, tick, protocolFee, lpFee)`. With `P = (sqrtPriceX96 / 2^96)^2` (raw token1 per raw token0):
- outcome token is `currency0` (18 dec), TYD is `currency1` (6 dec): `price_in_TYD = P * 1e12`
- TYD is `currency0`: `price_in_TYD = 1e12 / P`
Check: market `0xa96ac028...` (YES token `0x4eabdf5b...` < TYD, so YES is currency0), `yesPoolSqrtPriceX96 = 30500284735263970804878` gives YES = **0.1482** and NO = **0.8587**; the site's own `parentConditionProbability` for the same market is 0.14820014 / 0.85874027. Match.

Liquidity is constrained to price 0..1 TYD per token (`TruthMarketSwapValidator` reverts a swap whose post-swap tick leaves the configured bounds, `TickOutOfBounds`; `TruthMarketV2Launcher` sets bounds from `calculateTickRangeByPrice(0, 10000 bp)`). In-venue arbitrage is explicit: YES mid + NO mid should be about 1; observed sums on 7 markets: 1.0069, 0.9939, 1.0285, 1.0101, 1.0173, 1.0081, 1.0100. Complete-set mint/burn gives a synthetic ask for YES of `1 - bid(NO)` and a synthetic bid of `1 - ask(NO)`.

Quote execution price with `V4Quoter.quoteExactInputSingle` (simulates the hook, including the afterSwap fee and tick-bound revert), not from `slot0`. Depth: `StateView.getLiquidity` (in-range L) plus `getTickBitmap`/`getTickLiquidity` to walk ticks, or just quote several sizes.

TYD is a unit of account, not a dollar: USD value of 1 TYD is `vault.convertToAssets(1e6) / 1e6`. Current value NOT FOUND (GeckoTerminal's TYD/USDC v4 pool shows 1.43 but has $39 of reserves and is meaningless). Winners redeem for 1 **TYD**, so cross-venue comparisons must convert via the vault share price.

### 7.3 Snapshot of the 20 listed markets (home-page SSR JSON, 2026-10-19; first-party, undocumented, M)

All `network: base-mainnet`, `version: 2.0.0`, `uniswapVersion: v4`, tick spacing 60. Hook/fee derived by me from pool ids (H).

| Market (short) | Hook gen / LP fee | TVL ($) | Volume ($) | Pay token |
|---|---|---|---|---|
| `0xa96ac028` Polymarket Token in 2026? | v1.1.0 / 0.80% | 28,432 | 255,755 | TYD |
| `0xdd335456` US remove presidential term limits | v1.1.0 / 0.80% | 6,500 | 63,225 | TYD |
| `0x87c2a81f` Polymarket higher valuation than Kalshi 2028 | v1.1.0 / 0.80% | 6,268 | 28,355 | TYD |
| `0x10ad50ca` AGI before 2028? | v1.1.0 / 0.80% | 1,956 | 24,744 | TYD |
| `0x53bfb895` OpenAI IPO in 2026? | v1.1.0 / 0.80% | 4,191 | 21,771 | TYD |
| `0x488610ad` Polymarket new oracle before Jan 31 2027 | v2.0.0 / 1 pip | 18,719 | 18,479 | cNO |
| `0x574648f7` BonkDAO attacker | v2.0.0 / 1 pip | 635 | 14,632 | TYD |
| `0x94bdf62c` US inflation > 3% Dec 2026 | v1.1.0 / 0.80% | 322 | 13,869 | TYD |
| ...12 more | 8 on v1.1.0, 4 on v2.0.0 | 215 to 18,851 | 4,839 to 13,805 | TYD / cYES / cNO |

Totals: 20 markets, TVL sum about $133,992, volume sum about $551,466. Many markets' `endOfTrading` was 2025-12-17..19 yet they are still unresolved (resolution requires the real event or the deadline). The top market is a parent with four conditional children.

## 8. Market discovery

Preferred (on-chain, documented in the integration guide): `TruthMarketManager.numberOfActiveMarkets()` (`0x7d6a0d1a`), `getActiveMarketAddress(i)` (`0xdd5adfa3`), `isActiveMarket(addr)` (`0x6ec38a4e`). Validate any market address with `isActiveMarket` before use. Events: `MarketCreatedWithDescription(address marketAddress, string marketQuestion, string marketSource, string additionalInfo, uint256 endOfTrading, uint256 yesNoTokenCap, address marketOwner)` has **no indexed fields** (topic0 `0x043261d3...49a5`), so event discovery is a full-range scan from the first Manager block; the market's `creatorAddress(market)` returns the real creator. Proposal pipeline: `Launchpad.ProposalCreated(uint256 indexed)`, `ProposalLaunched(uint256 indexed id, address indexed market)`; `Launchpad.proposalPhase/proposalMarket/proposalTotalDeposits/proposalOutcomeDeposits`; `LaunchpadFactory.communityTruthMarketV2Spec(id)` returns the stored spec.

Fallbacks: (a) the home page embeds `initialMarkets` JSON (market, question, rules, pool ids, token addresses, sqrt prices, TVL, volume): easy but undocumented, only a subset, and may change; (b) DefiLlama `api.llama.fi/protocol/trueo` and `/summary/dexs|fees/trueo` for aggregates; (c) GeckoTerminal indexes only some v4 pools (YES/TYD pool pages exist with `reserve_in_usd: 0.0` for a fresh market) so it is not a reliable depth source; (d) no subgraph or REST API is documented (NOT FOUND).

V1 vs V2 detection: V2 markets expose `VERSION()` ("2.0.0", selector `0xffa1ad74`) and `getPoolKeys()`; V1 markets expose `getPoolAddresses()` (V3 pools). A revert on `VERSION()` is my inferred V1 test (M). V1 markets are legacy; skip them.

## 9. Oracle / dispute process in numbers

| Stage | Who | Bond (current manager defaults, read from market) | Window |
|---|---|---|---|
| 0 Resolution proposal | anyone | 250 TYD `resolverBondAmount()` | 12h `firstChallengePeriod` |
| 1 Dispute | anyone | 250 TYD `disputerBondAmount()` | until council majority |
| 2 Oracle Council | 5 genesis members (X handles listed in docs), majority 3/5 | none | none in contract |
| 3 Escalation | anyone | 750 TYD `escalatorBondAmount()` (older: 2,500) | 12h `secondChallengePeriod` |
| 4 TRUE-holder vote | TRUE holders (Snapshot per docs) | none | unspecified |
| 5/6 Attesters | 11 random from reputation pool; trigger needs >=250,000 TRUE liquid or staked | none during genesis | 12h per docs |

All H from docs + contracts, except the off-chain nature of stages 4-6 (M, inferred from `Escalation.sol` having only `OPERATOR_ROLE` resolution and no vote logic). Bonds are slashed/returned per council/holder/attester rulings (four accepted-dispute outcomes, two rejected).

Governance/controversy evidence: one WebSearch summary claimed a dispute over the "Polymarket token in 2026" market (council 3-2 to keep Yes, later holders/attesters tried to reset). A follow-up search and a fetch of the cited article **did not confirm it** (L). What I can confirm first-hand: the `0xa96ac028` market has `status: 1 (OpenForResolution)`, `statusUpdatedAt: 2026-05-03`, `outcome: 0`, `endOfTrading` 2025-12-17, volume $255,755, TVL $28,432, with four conditional child markets, and Vitalik publicly argued for private attester voting (Cryptobriefing, May 2026, L-M).

## 10. TVL, volume, token (with source and date)

- DefiLlama `api.llama.fi/protocol/trueo` (fetched 2026-10-19; last point 2026-10-18 15:59 UTC): Base TVL **$1,063,391**; `pool2` (TRUE/ETH LP) $430,509; `staking` (TRUE) $2,198,706; chains: Base only. Cointelegraph/Blockonomi 2026-09-22 quoted $795,687 / about $796K.
- DefiLlama `summary/dexs/trueo`: 24h **$313**, 7d **$6,296**, 30d **$17,106**, all-time **$796,857**. `summary/fees/trueo`: 24h $1.27, 7d $89.83, 30d $569.82, all-time $3,597.10 (includes launchpad fees).
- Basescan token page for TYD (M): 1,422 holders, supply about 785,270.7 TYD. GeckoTerminal reports a total supply of about 2.22M TYD for the same token: **conflict, unresolved** (use on-chain `totalSupply`).
- TRUE (GeckoTerminal, 2026-10-19, M): price about $0.054, FDV about $5.4M, 24h volume about $30K, 100M supply. News claimed +900-1000% on the announcement; irrelevant to the adapter.

## 11. Can an agent trade or create from a PayBox EVM wallet via transaction proposals?

**Yes for trading, redeeming, minting and limit orders. Partially for creation.** Per `docs/plan.md` (unverified lead): PayBox plugin writes return unsigned EVM calls as `io.paybox/transactionProposal`, PayBox simulates, a user/grant approves, the vault signs, proposals expire in about 5 minutes. Nothing about Trueo needs an off-chain order signature, an API credential, or a custom chain. Whether PayBox supports Base (8453) proposals, how it simulates 2M+ gas calls, and whether proposals can be chained are **not verified here** (other workstreams own PayBox).

### 11.1 Gate-by-gate (Trueo only)

| Gate | Status | Answer |
|---|---|---|
| 1 Auth/credentials | go | None. No API, keys or HMAC. State is on-chain and permissionless. Only blacklist: `Launchpad.isUserBlacklisted` (admin). |
| 2 Order flow | go | AMM swaps on Uniswap v4 (through Trueo's adapter or Universal Router) and on-chain range orders. No off-chain book. |
| 3 Smart wallet ownership | go | Positions are plain ERC-20s held by `msg.sender`; Permit2 supports ERC-1271 signers. Any EOA or smart wallet works. |
| 4 Chain support | partial | Base (8453) now. PayBox simulate/sign support for Base not verified in this task. Ethereum: no deployment yet. Gas is ETH on Base (about $0.03 per swap). |
| 5 Market creation | partial | Permissionless propose is a single gas-only tx. A tradable market needs >= factory minimum (200 TYD observed) funded by depositors who each sign a Permit2 transfer. |
| 6 Funding/bridge | partial | USDC on Base -> TYD is native to the adapter (previewMint/deposit/redeem inside the swap). Getting USDC onto Base is a PayBox question (not Trueo-specific). Vault `maxDeposit`/limits NOT FOUND. |
| 7 Terms/bot policy/jurisdictions | partial / risk | Operator "Walking Wisdom International CO., Ltd., a Samoa corporation". Smart contracts "not offered to US Persons" and residents of listed territories (Algeria, Bangladesh, Belarus, Canada, Cuba, Iran, Iraq, North Korea, Syria, Taiwan, Venezuela, Zimbabwe; "full list is longer"); VPN circumvention prohibited; no explicit bot/agent policy (terms mention "data scraping" and "exploitation of any smart contract" as prohibited). On-chain there is no geo-gate. |
| 8 Sign-then-submit | partial | Trading/redeem/mint/orders: approvals are ordinary txs (ERC-20 `approve`, `Permit2.approve`), no off-chain signature. **Only `Launchpad.deposit` needs an EIP-712 Permit2 `PermitTransferFrom` signature** that is then embedded in the tx calldata (sign-then-submit). Whether `autonomous` grants auto-sign plugin proposals: unresolved, out of scope. |
| 9 Read-side fallback | partial | Direct on-chain reads (StateView/Quoter/Manager) are sufficient and need no indexer. No official subgraph/REST. Fallbacks: DefiLlama, GeckoTerminal (patchy), home-page JSON (undocumented), Basescan, Sourcify. `base.blockscout.com` is bot-blocked. |

### 11.2 Read path (all `eth_call`, pin addresses as constants)

ABI fragments below come from Sourcify-verified ABIs I fetched, or the GitHub source/interfaces; selectors computed with `cast sig` (local hashing only).

```solidity
// TruthMarketManager 0x61A9...95d7  (impl ABI verified, Sourcify)
function numberOfActiveMarkets() view returns (uint256);            // 0x7d6a0d1a
function getActiveMarketAddress(uint256) view returns (address);    // 0xdd5adfa3
function isActiveMarket(address) view returns (bool);               // 0x6ec38a4e
function creatorAddress(address market) view returns (address);
function paymentToken() view returns (address);
function uniswapV4HookAddress() view returns (address);
function minimumTradingDuration() view returns (uint256);
function firstChallengePeriod() view returns (uint256);
function secondChallengePeriod() view returns (uint256);
function resolverBondAmount() view returns (uint256);
function disputerBondAmount() view returns (uint256);
function escalatorBondAmount() view returns (uint256);
function paused() view returns (bool);
```
```solidity
// TruthMarketV2 clone (market). Verified on mastercopy 0x2CA8...3409
function VERSION() view returns (string);                           // 0xffa1ad74
function marketQuestion() view returns (string);   function marketSource() view returns (string);   function additionalInfo() view returns (string);
function endOfTrading() view returns (uint256);
function getCurrentStatus() view returns (uint8);                   // 0xa3dd2619  (derived; use this)
function currentStatus() view returns (uint8);                      // stale storage value
function winningPosition() view returns (uint256);                  // 0x2486d671 ; 0 none, 1 YES, 2 NO, 3 CANCELED
function paymentToken() view returns (address);                     // 0x3013ce29
function yesToken() view returns (address);  function noToken() view returns (address);   // 0xf0d9bb20 / 0x11a9f10a
function getPoolKeys() view returns (PoolKey yes, PoolKey no);      // 0xd183feee ; PoolKey = (address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)
function getPoolIds() view returns (bytes32 yesId, bytes32 noId);
function paused() view returns (bool);
function resolverBondAmount() view returns (uint256); function disputerBondAmount() view returns (uint256); function escalatorBondAmount() view returns (uint256);
function firstChallengePeriod() view returns (uint256); function secondChallengePeriod() view returns (uint256);
function resolutionProposedAt() view returns (uint256); function disputedAt() view returns (uint256); function councilDecisionAt() view returns (uint256); function escalatedDisputeAt() view returns (uint256); function finalizedAt() view returns (uint256);
function getUserClaimableAmount(address) view returns (uint256); function getUserPosition(address) view returns (uint256 yes, uint256 no);
function bondSettled() view returns (bool);
```
```solidity
// TruthMarketHook (per PoolKey.hooks)  0x3E83...e0C4 / 0x1cFe...40c4
function feeNumerator() view returns (uint256);                     // 0xe86dea4a ; fee = feeNumerator / FEE_DENOMINATOR (10000)
function FEE_DENOMINATOR() view returns (uint256);
function poolPaused(bytes32 poolId) view returns (bool);            // 0x4327623d
function swapValidator() view returns (address);
// TruthMarketSwapValidator: function poolBoundaries(bytes32) view returns (int24 lower,int24 upper,bool isSet);
```
```solidity
// Uniswap v4 StateView 0xa3c0...a71 (Sourcify match)
function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee);   // 0xc815641c
function getLiquidity(bytes32 poolId) view returns (uint128);                                                        // 0xfa6793d5
function getTickLiquidity(bytes32 poolId,int24 tick) view returns (uint128 liquidityGross,int128 liquidityNet);
function getTickBitmap(bytes32 poolId,int16 wordPos) view returns (uint256);
// Uniswap V4Quoter 0x0d5e...048d (Sourcify match); call via eth_call (nonpayable, reverts internally)
function quoteExactInputSingle(((address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params)
  returns (uint256 amountOut,uint256 gasEstimate);
function quoteExactOutputSingle(...same shape...) returns (uint256 amountIn,uint256 gasEstimate);
```
```solidity
// TYD (ERC-4626) 0xb13C...EF4B : standard ERC-4626 (adapter source calls previewMint/deposit/redeem/asset)
function asset() view returns (address); function convertToAssets(uint256) view returns (uint256);  // 0x07a2d13a
function previewMint(uint256) view returns (uint256); // 0xb3d7f6b9
function previewDeposit(uint256) view returns (uint256); // 0xef8b30f7
function previewRedeem(uint256) view returns (uint256); // 0x4cdad506
function maxDeposit(address) view returns (uint256);  // standard ERC-4626; vault-specific limits NOT VERIFIED
```
```solidity
// Launchpad 0xeD3e...1aF6 (impl ABI verified) and LaunchpadFactory 0x9F04...5417
function proposalPhase(uint256) view returns (uint8); // 0 Uninitialized,1 Live,2 Launched,3 Distributed,4 Failed,5 ManualDistributionNeeded,6 FundsWithdrawn  (0xc4b0e02d)
function proposalMarket(uint256) view returns (address); function proposalCreator(uint256) view returns (address);
function proposalTotalDeposits(uint256) view returns (uint256); function proposalOutcomeDeposits(uint256 id,uint256 outcome) view returns (uint256);
function proposalDeposits(uint256 id,address depositor,uint256 outcome) view returns (uint256);
function protocolFee() view returns (uint256); // /10000
function communityTruthMarketV2Spec(uint256) view returns (CommunityTruthMarketV2Spec);
function minimumDeposits(uint8 proposalType,address paymentToken) view returns (uint256);   // factory
function minimumProposalDuration() view returns (uint256);                                  // factory
```
Events for indexing: Uniswap `PoolManager.Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)` (Sourcify ABI; topic0 `0x40e9cecb...112f`), `Initialize(bytes32 indexed id, ...)`; Trueo `ResolutionProposed(address,uint256)`, `MarketCanceled(address)`, `MarketReset(address)`, `MarketStatusUpdated(uint8 from,uint8 to,uint256 outcome)` (market), `TokensMinted/Burned/Redeemed`, OrderManager `OrderCreated/OrderFilled/OrderPartiallyFilled/OrderCancelled`, Council `NewDispute`.

Recommended read algorithm for a market snapshot: `isActiveMarket` -> `paymentToken == TYD` -> `VERSION` -> `getCurrentStatus` -> `getPoolKeys` -> reconstruct `poolId = keccak256(abi.encode(poolKey))` and compare to `getPoolIds` -> `hook in allowlist` -> `poolPaused` false and `market.paused()` false -> `getSlot0` (price) -> `V4Quoter` quotes at the intended sizes both ways -> compute total cost `lpFee + feeNumerator/10000 + price impact` -> convert TYD to USD with `convertToAssets`.

### 11.3 Write path (calls an agent would propose)

All on Base (chain 8453). Every step is its own transaction proposal (they cannot be batched from a plain EOA: a Multicall3 `msg.sender` would be Multicall3, so `Permit2.approve` would approve the wrong owner). With a 5-minute proposal expiry, order and re-quote between steps.

**A. Buy YES/NO with USDC (one swap tx after approvals), via `UniversalRouterAdapter`:**
1. Once per wallet: `USDC.approve(Permit2, amount_or_max)` (ERC-20 `0x095ea7b3`).
2. Per trade: `Permit2.approve(USDC, UniversalRouterAdapter, uint160 amount, uint48 expiration)` (`approve(address,address,uint160,uint48)` on `0x0000...8BA3`). The adapter pulls `TYD.previewMint(sharesIn)` USDC from the user through Permit2 `AllowanceTransfer.transferFrom`, deposits to the vault, and spends the TYD in the swap; leftovers are returned.
3. `UniversalRouterAdapter.execute(bytes commands, bytes[] inputs)` (`0x24856bc3`; or `execute(bytes,bytes[],uint256 deadline)` `0x3593564c`). Observed on a real Base tx (M): `commands = 0x10` (V4_SWAP) and one input whose V4Router actions are `0x07 0x0b 0x0e` = `SWAP_EXACT_IN, SETTLE, TAKE`. `SWAP_EXACT_IN` params are `ExactInputParams{Currency currencyIn, PathKey[] path, uint128 amountIn, uint128 amountOutMinimum}` with `PathKey{Currency intermediateCurrency, uint24 fee, int24 tickSpacing, IHooks hooks, bytes hookData}` (from the verified V4SwapStrategy source); `SETTLE(currency, amount, payerIsUser=true)`; `TAKE(currency, recipient, amount)` with recipient the user (the strategy rejects any other recipient). `amountIn` is denominated in **TYD shares**; USDC pulled is `previewMint(amountIn)`; set `amountOutMinimum` from the Quoter minus the slippage band.
   Plain-Universal-Router alternative (more txs): `USDC.approve(TYD)` + `TYD.deposit(assets, user)`, then `TYD.approve(Permit2)` + `Permit2.approve(TYD, UniversalRouter, ...)` + `UniversalRouter.execute(0x10, ...)`.

**B. Sell YES/NO for USDC:** `YES.approve(Permit2)`, `Permit2.approve(YES, adapter, amount, exp)`, `adapter.execute(0x10, [SWAP_EXACT_IN(YES -> TYD), SETTLE(YES), TAKE(TYD)])`; the strategy's `afterExecute` redeems the TYD through the vault and sends USDC to the caller.

**C. Mint / burn complete sets:** `USDC -> TYD` (`TYD.approve`+`deposit`), `TYD.approve(market, x)`, `market.mint(x)` (`0xa0712d68`, `x` in TYD decimals). Burn: `YES.approve(market, a)`, `NO.approve(market, a)`, `market.burn(a)` (`0x42966c68`, `a` in 18-decimal token units). `TruthMarketAdapter` (`mint(market, assetAmount)`, `burn(market, amount)`, `redeem(market, amount)`, `withdrawFromCanceledMarket(market)`) wraps these with the USDC<->TYD step and needs approvals of USDC / the outcome tokens to the adapter; it is written against the V1 interface, which V2 shares, but I did not see a V2 production tx (M).

**D. Redeem:** when `getCurrentStatus()==7` and `winningPosition` in {1,2}: `winToken.approve(market, a)`; `market.redeem(a)` (`0xdb006a75`). If `winningPosition==3`: approve **both** tokens, `market.withdrawFromCanceledMarket()` (`0x3415a4cf`).

**E. Limit order:** `OrderManager.createOrder(((address,address,uint24,int24,address) poolKey,uint128 amountIn,int24 tickLower,int24 tickUpper,bool zeroForOne,bool enablePartialFill))` (`0x68cf8cd2`) after `token.approve(Permit2)` + `Permit2.approve(token, OrderManager, ...)`. Preconditions: pool whitelisted in OrderManager, hook has `V4_HOOK_ROLE`, ticks aligned to spacing, current tick on the correct side of the range, `amountIn >= minimumOrderAmount`. `cancelOrder(((address,address,uint24,int24,address),uint32 orderId,uint128 amount0Min,uint128 amount1Min))` (`0x41ec0034`).

**F. Create a market:**
1. Pre-check duplicates against `MarketCreatedWithDescription` and recent `communityTruthMarketV2Spec` (questions are attacker-controlled text).
2. `LaunchpadFactory.proposeCommunityTruthMarketV2(spec)` with `proposalType=1`, `minimumDeposit >= factory minimum` (read it), `fee` low (the frontend uses 1), `tickSpacing=60`, absolute `endOfTrading`, `rewardToken/Amount` ignored, a specific `source` and rules that satisfy the integrity standards.
3. Funding by depositors: `Launchpad.deposit(id, outcome 1|2, amount, permit, signature)` (`0x92bbc9d2`), after `TYD.approve(Permit2, amount)`. The agent builds this typed data and gets a signature from the wallet, then embeds it in the proposal:
   - EIP-712 domain `{name: "Permit2", chainId: 8453, verifyingContract: 0x000000000022D473030F116dDEE9F6B43aC78BA3}`
   - primary type `PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)` with `TokenPermissions(address token,uint256 amount)`; `spender = Launchpad`; `nonce` is an unordered Permit2 nonce (bitmap, pick an unused value); `permit.permitted.token` must equal `Launchpad.paymentToken()` (TYD) and `permitted.amount >= amount` (checked by the Launchpad).
   (Type strings read from the Sourcify-verified `PermitHash.sol`.) The tx sender must be the signer (`owner = msg.sender`). Do not sign a Permit2 blob you did not construct from these exact fields.
4. The final qualifying deposit also pays the launch gas (pool initialisation etc.).
Funding cost conflicts with plan caps ($10/order, $50/day): a graduating community proposal needs about 200 TYD of total deposits (observed), the creator does not need to be the funder, and 5% is taken on graduation.

**G. Resolve/dispute (not recommended for an autonomous agent):** `TruthMarketManager.proposeResolution(market, outcome)` (`0x35dae75c`) with 250 TYD bond approved to OracleBonds; `OracleCouncil.openDispute(market, reason)` (`0x89c0b25c`) with 250 TYD bond; escalation 750 TYD. A wrong proposal loses a bond; edge cases below.

### 11.4 Pinned constants and allowlists

Pin per chain: Manager, TYD, USDC, Permit2, PoolManager, StateView, V4Quoter, UniversalRouterAdapter, TruthMarketAdapter, OrderManager, LaunchpadFactory, Launchpad, hook allowlist `{0x3E83...e0C4, 0x1cFe...40c4}`. Never accept an address from the model or from a market's text. Reject a market whose `poolKey.hooks` is outside the allowlist, whose `paymentToken != TYD`, or where `isActiveMarket` is false.

## 12. Edge cases the adapter must handle

1. **Thin pools / price impact.** Median TYD-paid market TVL about $2K; 24h protocol volume $313. Require a Quoter quote at the intended size, cap `price impact` and `amountOutMinimum`, refuse trades above a small fraction of in-range liquidity. A swap that would push the tick outside the validator's bounds reverts (`TickOutOfBounds`), so oversize orders fail rather than partially fill (M, inferred from code).
2. **YES+NO != 1.** Observed 0.994..1.029. Quote both a direct route and the complete-set route; expect a non-zero bid-ask even at zero fee because liquidity is range-bounded.
3. **Fee heterogeneity.** 0.80% LP fee on v1.1.0-hook markets vs 1 pip on v2.0.0; hook fee separately. Compute per market; never assume.
4. **TYD is not USD.** Convert via `convertToAssets`; quote USDC outputs with `previewRedeem`; vault caps/illiquidity (Yearn V3 `maxDeposit`, `maxWithdraw`) NOT VERIFIED and could block exits.
5. **Decimals.** TYD 6, YES/NO 18, USDC 6. `mint(x)` takes **payment-token** decimals; `burn/redeem(a)` take **outcome-token** decimals. Adapter `amountIn` is TYD shares. A 10^12 mix-up is easy.
6. **Status derivation.** Use `getCurrentStatus()`, not `currentStatus` or an indexer. A market past `endOfTrading` is tradable but may be resolved any time; a `ResolutionProposed` market flips to `Finalized` automatically after 12h; redemption executes the status flip.
7. **Oracle dispute states.** `DisputeRaised`, `EscalatedDisputeRaised`, `ResetByCouncil` can last indefinitely (no council timeout; escalated stages depend on an operator posting results). Do not open positions in those states; do not hold "near-certain" winners as risk-free: the proposed outcome can be disputed within 12h, and reset returns the market to `OpenForResolution`.
8. **Cancellation payoff.** CANCELED pays 0.5 TYD per token. Price the cancel probability, especially for vague/derivative markets (the integrity standards list many cancel triggers).
9. **Paused states.** Pools are paused between launch and distribution (`hook.poolPaused`), markets and manager have `paused()`, OracleBonds/Council can be paused, Launchpad can blacklist a depositor.
10. **Conditional markets** (`cYES`/`cNO` payment tokens) and V1 (Uniswap V3) markets: skip.
11. **Untrusted text.** `marketQuestion`, `marketSource`, `additionalInfo` and proposal specs are free text written by anyone: return as labelled data, never as instructions; cap lengths.
12. **Proposal expiry vs multi-step.** First-time buy = 2-3 proposals (approve to Permit2, Permit2.approve, execute). Prefer long Permit2 allowances only if the approval cap policy allows; otherwise keep exact amounts with short expiry.
13. **Gas.** 2-4M gas per swap/propose on Base. If a simulator or proposal schema caps gas, this could be rejected; unverified.
14. **Ethereum cutover.** When mainnet launches addresses, hook generation, gas, and possibly collateral (TYD may not exist) change. Gate behind config; require a governance-published deployment file.
15. **Approvals hygiene.** Exact approvals with short Permit2 expiry; revoke after; never approve unlimited TYD/outcome tokens to upgradeable contracts.

## 13. Risks

- **Contract/admin risk.** Manager, Launchpad, Factory, adapters and OracleBonds are UUPS-upgradeable; owner/admin hold pause, fee, bond, timing, and (for the Launchpad) `withdrawFunds` in manual-distribution states. iosiro (Mar 2025): owner can change market deadlines and challenge periods ("closed", relying on a later multisig transfer) and "it is critical that, upon successful deployment, contract ownership is transferred to a multi-signature wallet." Whether that transfer happened: NOT FOUND (needs `owner()`/`hasRole` reads; a `timelock` is in config).
- **Audit staleness / coverage (M; PDF text decoded with a font offset so digits were lost).** iosiro 2025-03-07 (13 findings, 0 open at final commit; predates v4 and the Launchpad; test coverage 43.67% lines). Guardian: "Trueo_Final_Report_Updated" (March, year digit lost) reports High/Critical issues and recommends an independent review at a frozen commit; "Trueo_Uni_V4_Review" (Base; hook/OrderManager); "Trueo_Protocol_Review" (April, mentions Launchpad). The text of the three decoded reports contains **no mention of `UniversalRouterAdapter`** (the contract that moves USDC for users); I found no audit for it (NOT FOUND, searched the three reports). Flag as unaudited-for-our-purposes.
- **Oracle risk.** Off-chain TRUE/attester stages relayed by an operator role; 5-person council; no council timeout; unresolved markets for months; cancel-at-0.5 outcome; resolution rules written by anonymous creators with an AI assistant in the UI.
- **Liquidity/venue risk.** Tiny TVL; TRUE token and TYD are small assets; Base-to-Ethereum migration may fragment or strand liquidity; TYD vault strategy risk (Yearn V3 over Base lending); published team page absent (PolyMart says no public founder page; the docs name five council members by X handle).
- **Legal/ToS.** Samoa operator; US Persons and a long list of territories excluded; VPN circumvention prohibited; no explicit bot policy; terms can be revised "at sole discretion". For this project the operator (the user) must decide posture; I did not decide.
- **Impostor risk.** Several "Trueo" tokens exist on Ethereum; many look-alike domains likely.
- **Data-integrity risk.** Docs vs code mismatches (launch fee on withdrawal; "Stage 5/6" windows not modelled in `TruthMarketV2`; escalation bond 750 vs 2,500; fee comments), and aggregator conflicts (TYD supply).
- **Operational.** `base.blockscout.com` blocks bots; use own RPC/Sourcify/Basescan fallback. No official SDK or API means interface drift risk on every contract upgrade (re-pull ABIs from the proxy implementation).

## 14. Implications for the design (for the main plan, not decisions)

- Trueo fits the proposal model for trade/redeem/mint/order. Build it as a venue module behind a common interface (list markets, quote, buy, sell, redeem, status) with a per-chain deployment manifest.
- Treat it as a **signal and rare-inefficiency source** (YES+NO != 1, stale ranged liquidity), not an execution venue for size. A realistic per-order cap stays at the plan's $10.
- Creation via Trueo is possible but economically different from XO: no creation fee, gas only, but a graduated market needs about 200 TYD of third-party-or-own funding and a Permit2 signature flow. Do not count it as satisfying "creation is a must-have" without a decision about funding other proposals.
- For cross-venue arbitrage, matching Trueo questions to Polymarket/Kalshi requires reading `marketSource` + `additionalInfo` (different resolution oracle and cancel semantics = basis risk). Many Trueo markets are meta-markets about Polymarket itself.

## 15. NOT FOUND (what I searched)

- Official API, REST docs, subgraph, SDK, npm package, MCP server, `llms.txt` for Trueo (searched: docs.trueo.com sidebar, GitHub org repos and code, `gh search repos`, WebSearch "Trueo API subgraph SDK integrators", shipped JS for `graphql|subgraph|goldsky|thegraph|ponder`; only the app's own `/api/*` strings and an indexer-delay flag).
- Any Ethereum mainnet deployment or addresses (searched: `network_config.json`, `docs/deployments.md`, docs sidebar, repo branches/PRs/issues/releases, app homepage, DefiLlama, Eth Blockscout name search, WebSearch "Trueo Ethereum mainnet launch live").
- Live on-chain values (cannot `eth_call`): `numberOfActiveMarkets`, `protocolFee`, `factory.minimumDeposits`, `hook.feeNumerator`, current `firstChallengePeriod`, TYD `convertToAssets` / `maxDeposit`, owners and role holders, `commandWhitelist` and strategy registry on the adapter.
- Source for `V4SwapStrategy` in the GitHub repo (only on Sourcify), for `TruthAttesterSBT`, for conditional-market wrapper tokens, for plugin modules `restrictMinimumDepositsPlugin` etc.
- A reported dispute on the "Polymarket Token in 2026" market with vote counts (single unconfirmed search summary).
- Bot/agent policy in the Terms (searched trueo.com/terms; none).
- XO docs coverage of Trueo (searched the `xo-docs` MCP).
- A Trueo testnet to rehearse writes (staging config exists in the shipped JS but its chain and live status are unverified).

## 16. Open questions for the user / next steps

1. Confirm Trueo = trueo.com (formerly TrueMarkets). (Section 2.)
2. Is a read-only RPC (JSON-RPC POST) allowed in the next phase so the live values in section 15 can be read? Required before any trade.
3. Does PayBox support Base proposals with 2-4M gas and multi-step chains? (Other workstream.)
4. Legal posture for Samoa terms (US persons excluded, restricted territories).
5. Do we need creation on Trueo, and is funding other proposals (about 200 TYD) in scope?
6. Wait for Ethereum deployment or build Base-first with a chain-parameterised manifest? (Recommendation: Base-first, manifest-driven.)

## 17. Suspicious content / embedded instructions

None found in any third-party page, repo file, issue or API response I read. Notes: GitHub issue #10 on `trueo-contracts` is an ordinary integrator question (Windra); the Basescan/WebFetch summaries contained no AI-directed text. News headlines contain unverified hype (KuCoin "migrates... token surges tenfold") which conflicts with their own bodies.

## 18. Sources

Primary (GitHub, read via `gh api`):
- `trueo-protocol/trueo-contracts` @ main: `README.md`, `network_config.json`, `doc/integration-guide.md`, `src/TruthMarketManager.sol`, `src/TruthMarketV2.sol`, `src/TruthMarketHook.sol`, `src/validators/TruthMarketSwapValidator.sol`, `src/Launchpad.sol`, `src/LaunchpadFactory.sol`, `src/libraries/LaunchpadFactoryMarketV2.sol`, `.../LaunchpadFactoryCommunityV2.sol`, `src/TruthMarketV2Launcher.sol`, `src/UniversalRouterAdapter.sol`, `src/TruthMarketAdapter.sol`, `src/V3SwapStrategy.sol`, `src/SweepStrategy.sol`, `src/OrderManager.sol`, `src/libraries/{UniswapV4LPHelper,OrderValidation,Roles}.sol`, `src/Escalation.sol`, `src/OracleCouncil.sol`, `src/FeeCollector.sol`, `src/types/LaunchpadProposal.sol`, `src/base/LaunchpadViewer.sol`, interfaces. Issue #10 "Confirm canonical USDC path for V4 market trading" (2026-08-03, closed).
- `trueo-protocol/docs` @ main: `docs/{intro,trading,True-Yield-Dollar,liquidity-provision,markets,proposing-markets,proposal-funding,market-integrity-standards,resolving-markets,disputing-outcomes,optimistic-oracle,bonds-and-slashing,oracle-council,attesters,governance,tokenomics,deployments,official-links}.md`; PRs #33/#34 (2026-09-24); commit "Rebrand documentation from TrueMarkets to Trueo" (2026-01-23).
- Sourcify v2 contract API (chain 8453) for ABIs/sources: Manager impl `0x7BDa...5999`, Launchpad impl `0x8B9b...4147`, hook `0x3E83...e0C4`, OrderManager `0x1cdB...9a1A`, V2 mastercopy `0x2CA8...3409`, V4SwapStrategy `0x3F3d...927e`, StateView, V4Quoter, PoolManager, Permit2, UniversalRouter.
- Uniswap v4 deployments page: https://developers.uniswap.org/llms.mdx/docs/protocols/v4/deployments (Base and Ethereum addresses).
- DefiLlama: https://api.llama.fi/protocol/trueo ; https://api.llama.fi/summary/dexs/trueo ; https://api.llama.fi/summary/fees/trueo.
- GeckoTerminal public API: `/networks/base/tokens/{TYD}`, `/pools/{yesPoolId}`, `/tokens/{TRUE}`.
- trueo.com home page HTML (server-rendered `initialMarkets` JSON and shipped JS chunk address registry); https://trueo.com/terms ; https://docs.trueo.com ; https://truemarkets.org (301 to trueo.com); https://trueo.io.
- Basescan pages via WebFetch (M): Manager, OrderManager, Hook, Launchpad, LaunchpadFactory, UniversalRouterAdapter addresses; TYD token page; example txs `0x67474e54...b145` (adapter `execute`) and `0xe1cf194a...6796` (factory `proposeCommunityTruthMarketV2`).
- iosiro audit page: https://iosiro.com/audits/truth-markets-v2-smart-contract-audit ; Guardian PDFs `GuardianAudits/Audits/Trueo/*` (text decoded locally with a font offset; digits lost).
- Truth Oracle framework: https://truth-oracle.gitbook.io/truth-oracle .

Secondary (news, for the migration announcement): The Block 2026-09-22 https://www.theblock.co/news/defi/2026-09-22-trueo-ethereum-migration-415999 ; Bankless https://www.bankless.com/read/news/prediction-market-trueo-is-leaping-from-base-to-ethereum ; Blockonomi https://blockonomi.com/trueo-prediction-market-transitions-from-base-to-ethereum-mainnet ; Cointelegraph https://cointelegraph.com/news/decentralized-prediction-market-trueo-to-move-from-base-to-ethereum ; Cryptobriefing https://cryptobriefing.com/vitalik-buterin-trueo-prediction-market-oracle/ ; PolyMart https://polymart.app/trueo (L-M).

Short verbatim quotes (<=25 words each) for load-bearing facts:
- Docs trading: "All trades execute directly onchain via a custom-built Uniswap v4 hook."
- Docs deployments: "Deployed contract addresses for developers integrating with Trueo on Base mainnet."
- Docs markets: "This does not represent a trading cutoff; trading may continue indefinitely, including after resolution."
- Docs proposing: "Proposing a market is permissionless and takes only a few steps."
- Docs funding: "A 5% launch fee is charged only if the proposal successfully graduates."
- Docs resolving: "any participant may permissionlessly propose a resolution by posting a bond behind their chosen outcome. This action initiates a 12-hour challenge window"
- Docs resolving (cancel): "If a market is successfully cancelled, all YES and NO tokens are redeemable at their minted value of $0.50 each."
- Integration guide: "Price discovery for a single side happens by trading YES or NO on Uniswap, not through the market contract."
- Hook source: `uint256 public feeNumerator = 0; // Default 0%, set to 36 for 0.36%`
- Launchpad source: `function propose(Proposal calldata proposal) external onlyRole(Roles.LAUNCHPAD_PROPOSER_ROLE)`
- Factory source: "Factory contract for creating permissionless market proposals with typed interfaces"
- Issue #10: "We understand `Launchpad.deposit()` remains TYD-only."
- DefiLlama methodology: "V1 markets use Uniswap V3 pools (USDC pairs), V2 markets use Uniswap V4 pools (TYD pairs)."
- The Block: Trueo cites "highest integration potential and product upside"; Bankless: "Existing Base markets keep running."
- Terms: "The USE OF A VIRTUAL PRIVATE NETWORK ("VPN") to circumvent the restrictions set forth herein is strictly prohibited."
- iosiro: "it is critical that, upon successful deployment, contract ownership is transferred to a multi-signature wallet."


## Verification (2026-10-19)

Adversarial re-check of the notes above by an independent verifier. Read-only: GET requests only, no eth_call, no PayBox tools, no third-party code run. Primary sources re-read: `trueo-protocol/trueo-contracts@main` (all contract sources diffed against the Sourcify-verified deployed bytecode sources), `network_config.json`, `trueo-protocol/docs`, Sourcify v2 (chain 8453), Basescan address pages, DefiLlama, GeckoTerminal, trueo.com HTML plus its shipped JS chunks, the Terms raw HTML, the three Guardian PDFs (own decoder, digits preserved), the iosiro page, npm registry metadata. Limits: the WebSearch budget was exhausted mid-task (no new web searches possible), Basescan `/txs` returns 403, and eth_call is a POST, so live state (fees, minimums, owners) remains unread. Confidence tags as above (H = read first-hand this verification).

### A. Confirmed independently (no change needed)

| # | Claim | Evidence (verifier) |
|---|---|---|
| 1 | Only `base_mainnet_prod` configured; docs say Base mainnet only; no Ethereum addresses | `network_config.json` keys = `["base_mainnet_prod"]` (H). `docs.trueo.com/deployments` live page: "Deployed contract addresses for developers integrating with Trueo on Base mainnet" and the string "ethereum" does not occur on it (H). Contracts repo: single branch `main`, 9 PRs and 1 issue, all closed, none about Ethereum; last push 2026-07-17. Docs repo last push 2026-09-24. |
| 2 | Key Base addresses (Manager, V2 mastercopy, hook v2.0.0, LaunchpadFactory, UniversalRouterAdapter, TYD) and implementation addresses | All six equal the `network_config.json` values (H). Sourcify exact_match: V2 mastercopy (verified 2025-11-27), hook v2.0.0 (2026-07-01), hook v1.1.0 (2025-10-21), Manager impl `0x7BDa...5999` (2026-06-24), UniversalRouterAdapter impl `0x6474...4C19e` (2025-12-19; Sourcify `proxyResolution` of the adapter proxy independently returns the same impl), Launchpad impl `0x8B9b...4147` (2026-06-23), OrderManager, V4SwapStrategy (2025-07-24). Basescan address pages (H): Manager proxy -> impl `0x7BDaE...5999`; LaunchpadFactory proxy -> impl `0xaa35bc58...Ee02` (NOT verified on Sourcify, so the factory logic is read from GitHub main only); adapter proxy -> impl `0x647474aC...14C19e`. Uniswap deployments page for Base: PoolManager, StateView, V4Quoter, Universal Router, Permit2 equal the notes (H). |
| 3 | GitHub `main` source equals deployed code | `diff` of Sourcify sources vs GitHub main: TruthMarketV2, TruthMarketManager, Launchpad, OrderManager, TruthMarketHook (both generations) identical (whitespace only); UniversalRouterAdapter differs only in import paths. So reading GitHub main is a valid proxy for deployed logic for these contracts (LaunchpadFactory and Escalation/OracleCouncil/OracleBonds are not Sourcify-verified, so only GitHub-read). |
| 4 | Announced Monday 2026-09-21; no Ethereum go-live date | The Block (fetched): article dated 2026-09-22, "Monday" post, "once that instance is live", no go-live date. Cryptobriefing dated 2026-09-21. The notes' X status id `2102123554162561272` decodes (Snowflake) to 2026-09-21 19:51 UTC (H, computed). |
| 5 | TYD 6 decimals; YES/NO 18 decimals | GeckoTerminal `/tokens/{TYD}`: name "True Yield Dollar", `decimals: 6`, total_supply 2,224,968.96 (so the GeckoTerminal-vs-Basescan supply conflict in section 10 is real); YES token `decimals: 18`; `YesNoToken` is stock OZ ERC20 (18). `TruthMarketV2` reads `_tokenDecimals`/`_paymentTokenDecimals` and scales mint/burn/redeem exactly as the notes say (H). |
| 6 | Pool-id derivation, 14/6 fee split, hook generations | I re-derived `keccak256(abi.encode(currency0,currency1,fee,tickSpacing,hook))` with `cast` from the homepage `initialMarkets` JSON (fetched fresh, 20 markets) over fees {1,100,500,3000,8000,10000}, tickSpacing 60 and both hooks. All 40 pool ids (20 markets x YES/NO) matched. Result: 14 markets = hook v1.1.0 `0x1cFe...40c4` + fee 8000; 6 markets = hook v2.0.0 `0x3E83...e0C4` + fee 1. Config marks v1.1.0 `active:false`, v2.0.0 `active:true`. Four markets are conditional children (payment token cYES/cNO), 16 pay in TYD. Currency0/currency1 ordering varies per market (some YES token is currency0, some TYD), so the price formula direction must be chosen per pool (notes already say this). |
| 7 | Price formula | `price = P*1e12` if outcome token is currency0 else `1e12/P`, P=(sqrtPriceX96/2^96)^2. Derived independently from decimals (18 vs 6) and computed for market `0xa96ac028`: YES 0.148200, NO 0.858740, equal to the site's `parentConditionProbability`. Caveat: the site field is derived from the same sqrtPrice, so the match is a consistency check not an independent oracle; the algebra itself is correct (H). |
| 8 | Hook fee default 0, admin-settable, LP fee comes from the pool key | `TruthMarketHook.sol` (identical to the Sourcify-verified v2.0.0 and v1.1.0 sources): `feeNumerator = 0; // Default 0%, set to 36 for 0.36%`, `setFeeRate` is `DEFAULT_ADMIN_ROLE`; `_beforeSwap` returns lpFee override `0` with no override flag, so the pool-key fee applies; afterSwap fee is taken from the unspecified currency via return delta (H). Observed cumulativeFees: non-zero on 2 of 20 markets (23.68 and 2.67) - confirmed. 8000 pips = 0.80%, 1 pip = 0.0001% (H). |
| 9 | Selectors | `cast sig` reproduces every selector in the notes I checked: propose Community `0x6127b14a`, Whales `0x682992c3`, `deposit` `0x92bbc9d2`, adapter `execute` `0x24856bc3` / `0x3593564c`, `proposeResolution` `0x35dae75c`, `openDispute` `0x89c0b25c`, `getCurrentStatus` `0xa3dd2619`, `getPoolKeys` `0xd183feee`, mint/burn/redeem/cancel-withdraw, `numberOfActiveMarkets` etc., `createOrder` `0x68cf8cd2`, `cancelOrder` `0x41ec0034`, StateView/hook getters (H). V4 `Actions` constants 0x07 SWAP_EXACT_IN, 0x0b SETTLE, 0x0e TAKE read from the verified strategy's `Actions.sol` (H). |
| 10 | Permissionless propose, deposit needs a Permit2 signature, launch in the same tx, Live-phase withdrawal fee | `LaunchpadFactory.proposeCommunityTruthMarketV2` has no role modifier; `Launchpad.propose` is `LAUNCHPAD_PROPOSER_ROLE` (held by the factory). Basescan factory page: last 25 propose txs came from 8 distinct senders (H, behavioural proof of permissionless). `Launchpad.deposit` calls `permit2.permitTransferFrom(permit, details, msg.sender, signature)` then `_attemptLaunch` (H). `withdraw` charges `_calculateAmountAndFee` only in `Live` phase (H). DefiLlama methodology independently says launchpad fees are "charged on proposal graduation and Live-phase withdrawals" (H). |
| 11 | Trading needs no off-chain signature except `Launchpad.deposit` (gate 8) | Grep of `OrderManager`, `TruthMarketV2`, `TruthMarketAdapter`, `TruthMarketManager`: the only Permit2 use is `IAllowanceTransfer.transferFrom` (approval-based, OrderManager line 529); no `permit`/`ecrecover`/`isValidSignature` in the trade/mint/redeem paths. `UniversalRouterAdapter.permit2TransferFrom` uses `permit2.transferFrom` (AllowanceTransfer, spender = adapter) and for the vault token pulls `previewMint(amount)` USDC then `deposit` (H). |
| 12 | Oracle: later escalation stages operator-relayed; council majority; no on-chain attester logic | `Escalation.setEscalationProposalId` and `resolveEscalatedDispute` are `onlyRole(OPERATOR_ROLE)`; the string "attester" occurs in no file under `src/` (recursive grep of every `.sol`); `OracleCouncil` majority test is `> councilMemberCount / 2` (H). UUPS `_authorizeUpgrade` is owner/admin-gated in Manager, Factory, Adapter, Escalation, OracleCouncil (H). |
| 13 | Status is time-derived; indexed status stale | `getCurrentStatus()` code matches the notes. Homepage JSON (fresh fetch): 13 of 20 markets have `endOfTrading` in the past (7 of them on 2025-12-17..19); 12 of those 13 show indexed `status: 0` (Created), the 13th (`0xa96ac028`) shows 1; the other 7 are future-dated (H). |
| 14 | DefiLlama numbers | `chains:["Base"]`, `previousNames:["TrueMarkets"]`, Base TVL 1,063,391 at 2026-10-18 15:59:47 UTC; dexs 24h 313, 7d 6,296, 30d 17,106, all-time 796,856.89 (H). 20-market sums: TVL 133,992.22, volume 551,465.94 (H). |
| 15 | Terms | Re-read from raw HTML (`/en/terms`), upgrading section 11.1 gate 7 evidence from M to H: operator "Walking Wisdom International CO., Ltd., a corporation organized and existing under the laws of Samoa"; smart contracts "ARE NOT OFFERED" to US Persons or the listed territories (full list: Algeria, Bangladesh, Bolivia, Belarus, Burundi, Burma, Canada, Cote D'Ivoire, Crimea and Sevastopol, Cuba, DR Congo, Ecuador, Iran, Iraq, Liberia, Libya, Mali, Morocco, Nepal, North Korea, Somalia, Sudan, Syria, Taiwan, Venezuela, Yemen, Zimbabwe); VPN circumvention "strictly prohibited"; zero hits for bot/robot/automat/crawl/AI; "data scraping" is in the prohibited-activities list; no "last updated" date. |
| 16 | NOT FOUND: Guardian audits do not cover `UniversalRouterAdapter` | My own decoder of the three Guardian PDFs (digits preserved): zero occurrences of "adapter", "Universal Router", "V4SwapStrategy" in all three. Dates and scope (new detail): Final report 2025-03-08 (1 Critical, 6 High; 2 High acknowledged), Uni V4 review 2025-11-03 (Base, hook/OrderManager), Protocol review 2026-04-23 (scope: Launchpad, LaunchpadFactory, TruthMarketManager, V2Launcher, distributors; 0 Critical, 4 High all resolved, 22 Medium, 23 Low, 19 Info). iosiro page: report 2025-03-07, 13 findings, 0 open, scope lists no adapter/router/launchpad. Basescan adapter page: "No Contract Security Audit Submitted". |
| 17 | NOT FOUND: Ethereum deployment, official SDK, xo-docs content | `eth.blockscout.com` name search for TruthMarketManager / TruthMarketHook / TruthMarketV2 / "True Yield Dollar" returned nothing (weak: verified-name search only). `docs.trueo.com/llms.txt` 404. npm search for "trueo" returns no Trueo package. xo-docs MCP searched again (two queries): only XO Market pages. |

### B. Corrected

| # | Original claim | Correction and evidence |
|---|---|---|
| C1 | Section 4.2: "app homepage (no migration banner)" | WRONG. The shipped app (trueo.com HTML, i18n bundle) contains a first-party banner for the proposal flow: "Trueo is migrating to Ethereum. Until the migration is completed, please limit new market proposals to events that resolve before January 31, 2027." plus a `ProposalMigrationBanner` layout module (H). This upgrades the Jan 31 2027 guidance from news-only (M) to first-party (H). Still no Ethereum addresses or date. |
| C2 | Section 4.2 / risks: "no official Ethereum token or deployment exists, so [the Trueo tokens on Ethereum] are impostors" | The five Ethereum "Trueo" tokens are real (name search reproduced: 3 x "Trueo", "TRUEO", "Trueo Pepe") and still not announced by the project. But the shipped app contains an unreleased `nft-sale` feature (feature flag released only in local/development/staging/nightly, not production) whose FAQ says "Trueo NFTs are minted on Ethereum Mainnet and purchased with ETH", is a credential for a "Trueo Public Raise" and a $TRUE allocation claimable on Base after "a 45-day governance timelock" on the supply increase. So an official Ethereum-mainnet NFT contract is planned or may exist; do not blanket-treat every Ethereum asset with a Trueo name as an impostor, and allowlist only addresses the project publishes. NFT contract address not found in the shipped JS. |
| C3 | Section 4.1 / 10: "TRUE token 100M supply cap" | Docs say "total supply of TRUE is 100 Million", but `TrueToken.sol` has a mutable `maxSupply` with an owner setter ("Sets a new maximum supply") and the app's unreleased raise flow talks about increasing supply. Treat the cap as an owner-adjustable parameter (H, source). Off the adapter's critical path. |
| C4 | Section 7.3 / bottom line: "20 listed markets sum to about $134K TVL" | Arithmetic is right (133,992) but misleading: 75,008 of it is the four conditional children (collateral = another market's cYES/cNO; their four TVLs are nearly identical, 18.7K to 18.9K, which looks like the parent's liquidity re-counted). TYD-paid markets (16): TVL 58,985, volume 503,092, max 28,432, median 1,611 (the notes' "about $2K" is a round-up). |
| C5 | Section 7.3: "Many markets' `endOfTrading` was 2025-12-17..19 yet they are still unresolved" | Not established. The `status` field it rests on is the stale indexer value the notes themselves say never to trust (12 of the 13 markets past `endOfTrading` show 0). Resolution state of those markets is UNVERIFIED without `getCurrentStatus()`. Likewise "OpenForResolution since 2026-05-03" for `0xa96ac028` is an indexer value (M). |
| C6 | Section 11.3 A: TAKE "recipient the user (the strategy rejects any other recipient)" | Verified `V4SwapStrategy.beforeExecute` accepts recipient `MSG_SENDER` (or the user's own address, rewritten to MSG_SENDER) or `ADDRESS_THIS` (the adapter, then forwarded by `afterExecute`); anything else reverts `UnsupportedRecipient`. It also accepts exact-out and `*_IN_SINGLE` swaps and `SETTLE_ALL`/`TAKE_ALL`; `payerIsUser` must be true; any other v4 action reverts `UnsupportedAction`. `ExactInputParams` in the deployed strategy has NO `maxHopSlippage` field (older v4-periphery); re-check if the Universal Router is ever swapped for 2.1.x. |
| C7 | Gate 1 / 5: "only gate is admin blacklist on Launchpad deposits"; propose "unguarded" | `Launchpad.propose` also reverts `Blacklisted(proposal.creator)`, so an admin can block specific proposers as well as depositors. Also `hook._beforeInitialize` only lets `authorizedPoolInitializers` create pools (so nobody else can create a pool under these hooks). |
| C8 | Section 3 and 15: "No official API ... the app's API is same-origin `/api/*`" | Documented API: still none (H). But `https://api.trueo.com/` is live: an Express service, `GET /` returns `{"service":"truth-market-api","status":"ok"}`, `GET /health` 200, `access-control-allow-origin: *`, `x-robots-tag: noindex`; `/docs`, `/openapi.json`, `/swagger` 404. It is undocumented, probably the backend behind the app's `/api/market`, `/api/proposals`, `/api/search`, `/api/auth/login`, `/api/auth/message` (wallet login for profile features), `/api/rpc`. I did not probe further. Terms prohibit "data scraping" for unauthorized purposes; treat as off-limits for automated use without permission. |
| C9 | Section 5.1(6): creator earnings "NOT FOUND as an automatic feature" | Mostly right for the market contract, but `FeeCollector` supports per-pool multi-recipient fee splits with role strings (e.g. "creator"), set via `RECIPIENTS_MANAGER_ROLE` (not the default admin) with a permissionless `withdrawPoolFees`; the app has a production-released `creator-fee` flag and a "Creator Fees" activity label. So creator fees exist as a configurable, role-managed distribution, not an automatic contract term. Live recipients not read. |
| C10 | Section 11.1 gate 6 TYD source / TruthAttesterSBT "source NOT FOUND" | Only true for GitHub. `TruthAttesterSBT` (`0xbBB4...371B`) is Sourcify exact_match: an `Ownable` ERC721 with `mintForAddresses`, merkle whitelist mint and `revokeTokens` all owner-controlled, i.e. attester membership is owner-managed, not on-chain governed. |

### C. Refuted

| # | Claim | Evidence |
|---|---|---|
| R1 | Summary and section 2: "no separate 'True Markets' venue exists" (and "So 'True Markets' is not a different venue") | REFUTED as stated. `truemarkets.co` is a live, separate company named True Markets: tagline "One API for digital assets"; docs.truemarkets.co: "trade crypto, stablecoins and tokenized stocks from code"; public OpenAPI-based API, Gateway and institutional REST/FIX; npm package `@truemarkets/sdk` ("TypeScript SDK for the True Markets public API", v0.3.0, 2026-05-22, repo `true-markets/sdk`, API-key file auth, Turnkey signing); the site lists prediction markets among its product areas and chains incl. Base, Solana, Arbitrum, Hyperliquid, Robinhood Chain. It does not mention Trueo or truemarkets.org, so the relationship is UNVERIFIED (the PolyMart "trademark dispute" rebrand story may be about this name clash, unconfirmed). The statement that the Trueo protocol was formerly "TrueMarkets" (truemarkets.org 301 -> trueo.com, DefiLlama previousNames) IS confirmed. Practical risk: a search for "True Markets" or "TrueMarkets" now returns this unrelated API product (and `@truemarkets/sdk` is NOT a Trueo SDK); add `truemarkets.co` to the look-alike list and never reuse its SDK/API for Trueo. |
| R2 | Section 9: "Vitalik publicly argued for private attester voting (Cryptobriefing, May 2026, L-M)" | Unsupported by the cited URL. The cited Cryptobriefing article (`.../vitalik-buterin-trueo-prediction-market-oracle/`) is titled "Prediction market platform Trueo to migrate from Base to Ethereum", dated 2026-09-21, quotes Vitalik as "Glad to see that Ethereum L1 will have a new strong prediction market contender", and contains none of private/attester/vote/council/May. Treat the private-voting claim as unsourced. |

### D. Unverifiable this session (kept at their original confidence, do not promote)

- Gas figures (2,027,645 gas / ~$0.03 swap, 3,769,790 gas / ~$0.06 propose, 0.0064 gwei) and the example tx hashes: Basescan `/txs` is 403 and the notes' hashes are truncated; sanity-plausible only (M).
- `minimumDeposit = 200 TYD`, proposal id 798, "most proposals never funded": single Basescan source; the code only requires a non-zero admin-set `minimumDeposits`; value needs eth_call (M). Factory page shows 767 txs, so id 798 is plausible but not proven.
- All live values in section 15 (fees, `protocolFee`, vault limits, owners/role holders): still unread (eth_call forbidden).
- The reported Polymarket-token dispute (3-2 council vote): could not re-search (WebSearch budget exhausted); the Cryptobriefing article does not mention it. Stays NOT FOUND / L.
- Basescan transaction counts and "last activity" dates for contracts (Manager 1,032, Factory 767, adapter 1,717): re-seen on address pages (Manager and Factory, adapter) but are summariser-mediated (M).
- TYD being a minimal proxy to a Yearn V3 vault: not re-checked (docs say "ERC-4626 ... powered by Yearn"; adapter calls `asset()`, `previewMint`, `deposit`, `redeem`; `network_config` lists `yearnV3Vault` = TYD).

### E. Gate verdicts

No gate status changes. Text refinements: gate 1 add C7 (blacklist also on propose) and C8 (undocumented first-party API host exists; trading remains permissionless on-chain); gate 7 evidence is now H (raw Terms HTML) with the full territory list; gate 9 add that `api.trueo.com` exists but is undocumented and off-limits for automated use under the Terms' scraping clause.

### F. Secrets / addresses check

Notes file scanned: no 64-hex strings, no API keys, no bearer tokens, no seed or key material, no PayBox or user wallet addresses. All 30 distinct 40-hex addresses are public contracts from the project's `network_config.json` or Uniswap's deployments page (impostor-token addresses are shown truncated). Nothing to redact.

### G. Verification sources

`network_config.json`, `src/{TruthMarketHook,LaunchpadFactory,Launchpad,Escalation,OracleCouncil,UniversalRouterAdapter,OrderManager,TruthMarketV2,TruthMarketManager,TruthMarketAdapter,FeeCollector,TrueToken}.sol`, `src/libraries/{LaunchpadFactoryCommunityV2,UniswapV4LPHelper,Roles}.sol`, `src/validators/TruthMarketSwapValidator.sol` (trueo-protocol/trueo-contracts@main); `docs/{deployments,tokenomics,True-Yield-Dollar,resolving-markets,proposal-funding}.md` (trueo-protocol/docs); https://sourcify.dev/server/v2/contract/8453/{addr}?fields=all for the addresses in A2/A3 and TruthAttesterSBT; https://basescan.org/address/{Manager,Factory,Adapter}; https://developers.uniswap.org/llms.mdx/docs/protocols/v4/deployments; https://api.llama.fi/protocol/trueo and /summary/dexs/trueo; https://api.geckoterminal.com/api/v2/networks/base/tokens/{TYD,YES}; https://trueo.com/ (homepage RSC payload, shipped JS chunks) and https://trueo.com/en/terms; https://docs.trueo.com/deployments; https://api.trueo.com/ and /health; https://www.theblock.co/news/defi/2026-09-22-trueo-ethereum-migration-415999; https://cryptobriefing.com/vitalik-buterin-trueo-prediction-market-oracle/; https://iosiro.com/audits/truth-markets-v2-smart-contract-audit; GuardianAudits/Audits/Trueo/*.pdf (3 files); https://registry.npmjs.org/@truemarkets%2fsdk; https://truemarkets.co and https://docs.truemarkets.co; https://eth.blockscout.com/api/v2/search; xo-docs MCP `search_xo_market_docs`. Short quotes: "Trueo is migrating to Ethereum. Until the migration is completed, please limit new market proposals to events that resolve before January 31, 2027." (app i18n); "One API for digital assets" (truemarkets.co); "Glad to see that Ethereum L1 will have a new strong prediction market contender." (Cryptobriefing); `{"service":"truth-market-api","status":"ok"}` (api.trueo.com).
