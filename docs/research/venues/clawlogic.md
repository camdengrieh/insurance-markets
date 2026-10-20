# CLAWLOGIC venue spec (adapter research)

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

- Live: yes, but brand new and tiny. Mainnet launch on Arbitrum One was 2026-09-29/30 (H: repo MAINNET.md, commits). No on-chain TVL/volume figure could be obtained (see Liquidity).
- adapter_priority: **P2** (signal-only / thin). Real, integrable on-chain AMM with no REST API, no evidence of meaningful liquidity, hand-written niche questions (e.g. ETH price, CVE patch timing) that are unlikely to line up with other venues.
- Liquidity is independent (its own AMM, shared with no other venue), but depth is too small to be a worthwhile arbitrage leg today.

## Kind and market model

- On-chain, agent-oriented prediction market: a Uniswap v4 hook contract (`PredictionMarketHook`) that holds the markets, plus a built-in constant-product AMM for the two outcome tokens. (H: https://clawlogic.vercel.app/skill.md, hook source in repo)
- Binary only in practice: two outcomes per market, labelled `yes`/`no` for yes-no markets (`--outcome1 yes --outcome2 no`); "Unresolvable" is a reserved third resolution value. No categorical or scalar markets. (H: skill.md)
- Outcome tokens: ERC-20 `OutcomeToken` contracts minted per market (outcome1Token / outcome2Token). A winning token redeems for exactly 1 ETH-unit (1e18). Price = implied probability: `prob1Bps = reserve2 * 10000 / (reserve1 + reserve2)`, 5000/5000 when empty. (H: PredictionMarketHook.sol `getMarketProbability`, skill.md)
- Buy: ETH sent in; fees skimmed; net + LP fee minted as complete YES+NO sets into the reserves; the bought side is transferred out (`buyOutcomeToken`). Sell needs no approval, the hook moves tokens itself. YES+NO complete sets can be minted/merged fee-free (`mintOutcomeTokens`, `mergeOutcomeTokens`). (H: hook source lines ~552-830)
- LPs: `addLiquidity` / `removeLiquidity` with LP shares. (H)
- Market constraints: resolution time required, within 365 days; optional earlier close time; duplicate open questions are rejected by normalised key. (H: skill.md)
- Website marketing text mentions "CLOB intent matching" and "negotiation intents"; these are off-chain social broadcasts, not an order book. Trading is against the AMM only. (M: page meta description vs skill.md)

## Chains and collateral

- Arbitrum One (chain ID 42161) only. (H: skill.md, MAINNET.md)
- Collateral and trade currency: native ETH (not stablecoin). Assertion/dispute bonds: WETH `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`. (H: npm README, MAINNET.md)
- Contracts (Arbitrum One, H: https://registry.npmjs.org/@clawlogic/sdk readme + docs/MAINNET.md):
  - PredictionMarketHook `0x55cB6476a7B4DBe048407Cf4058Af3A9f8408880` (deployed L2 block 510124998, 2026-09-30)
  - AgentRegistry `0x6Ecc60F604d08b19fBd5eCCDc61b9DFb4fFca9F8`
  - AgentIdentityRegistry `0xA8D9C55f138178727bBAf0525b961D96C916a93f`; AgentValidationRegistry `0x99A70779C6a2B9B3c04c0dDa6837472a2180f7b4`; AgentReputationRegistry `0x4917656dD98BDb24E4B7208703C0125De1F88bD5`
  - Uniswap v4 PoolManager `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`; UMA OptimisticOracleV3 `0xa6147867264374F324524E30C02C331cF28aa879`
  - ERC-8004 identity registry (alternate eligibility): `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (M: from deploy env table)
- Note the deployed-bytecode vs repo-source match was not verified (could not reach an explorer API; Blockscout GET was blocked by a Cloudflare challenge). Treat repo source as M for the deployed behaviour.

## Read API

- exists: **onchain-or-subgraph-only**. No official REST API for markets, books, or trades. No websocket. No indexer/subgraph found (NOT FOUND, searched: site routes /api/*, repo `apps/web/src/app/api` which only contains `agent-broadcasts`, docs dir, npm README).
- Official read path = the SDK (`@clawlogic/sdk@0.2.0`, MIT, viem-based) or direct contract calls. (H: npm README)
  - `ClawlogicClient.getAllMarkets()`, `getMarket(id)`, `getMarketCount()`, `getAgentPositions(marketId, agent)`, `getAgentCount()`, `isAgent()`.
  - On the hook directly (view functions, H: hook source): `getMarketIds()`, `getMarket(id)`, `getMarketInfo(id)`, `getMarketProbability(id)` -> (prob1Bps, prob2Bps), `getMarketReserves(id)`, `quoteBuy(id,isOutcome1,ethIn)` -> (tokensOut, protocolFee, lpFee), `quoteSell(id,isOutcome1,tokensIn)` -> (ethOut, protocolFee, lpFee), `getAssertionBond(id)`, `isEligibleAgent(addr)`, `getMarketIdByQuestion(desc,o1,o2)`.
  - Events for trade history: `OutcomeTokenBought`, `OutcomeTokenSold`, `TradeFeesCharged`, `MarketInitialized`, `MarketConfigured`, `MarketAsserted`, `MarketResolved`, `AssertionDisputed`, `LiquidityAdded/Removed`.
  - CLI wrapper (JSON stdout): `clawlogic-agent markets | analyze --market-id | quote ...`. (H: skill.md)
- Auth/limits: none for chain reads; limited by the chosen Arbitrum RPC (the SDK default public RPC is "rate limited" per skill.md). Docs: skill.md at https://clawlogic.vercel.app/skill.md, README at https://www.npmjs.com/package/@clawlogic/sdk, repo https://github.com/Kaushal-205/clawlogic.
- The only public HTTP endpoint is the social feed `GET https://clawlogic.vercel.app/api/agent-broadcasts` (unauthenticated, returns JSON array, 300 items at fetch time, newest first). Fields: `type` (TradeRationale / MarketBroadcast / Onboarding), `agent`, `agentAddress`, `confidence`, `reasoning`, `marketId`, `side`, `stakeEth`, `id`, `timestamp`. (H: fetched 2026-10-19; sample in fixtures.)
  - Quality: unverified self-reported text. 60 of 300 items have no marketId; many use obvious placeholder IDs (`0x...0001`, `0x...0000`, `0xabcd1234efgh...`) and test agents ("test", "cyber-oracle" posting 124 items about a fictional "CorpX CVE-2024-9999"). Oldest item 2026-08-31, newest 2026-10-17 (so it includes pre-mainnet/test-era data). Not usable as a price or volume source. Write access needs `AGENT_BROADCAST_API_KEY` per MAINNET.md, but the content looks like test spam anyway. (H for shape; M for the spam interpretation)
- Sizing indicator only: summed `stakeEth` over those 300 self-reported rows = ~27.9 ETH, not verified on-chain and mixes testnet. (H arithmetic, L meaning)

## Trade path

- Programmatic via contract calls only; no order API, no signed off-chain orders. All actions are plain EVM transactions from the trader's wallet on Arbitrum (H: skill.md "every buy, sell... sends a mainnet transaction").
  - `buyOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 minTokensOut)` payable (ETH value = stake)
  - `sellOutcomeToken(bytes32 marketId, bool isOutcome1, uint256 tokensIn, uint256 minEthOut)`
  - `mintOutcomeTokens(marketId)` payable / `mergeOutcomeTokens(marketId, amount)`
  - `addLiquidity(marketId)` payable / `removeLiquidity(marketId, shares)`
  - `assertMarket(marketId, outcome)` (needs WETH bond approval), UMA dispute, `settleOutcomeTokens(marketId)`, `claimAssertionReward(marketId)`
- Eligibility gate: `msg.sender` must be an agent: `AgentRegistry.isAgent(addr)` or hold an ERC-8004 identity NFT (`balanceOf > 0`). Otherwise `revert NotRegisteredAgent()`. (H: hook `isEligibleAgent`.) `registerAgent(name, attestation)` is callable by any address; the source comment says production "would require verified TEE" but MAINNET.md states Phala/TEE is disabled, so registration looks permissionless. So "agents only" is a soft gate, not a hard identity check. (M: inferred from source + MAINNET.md)
- PayBox reachability: **partial**. Arbitrum is an EVM chain and the trade is a direct contract call with ETH value, so a PayBox EVM wallet on Arbitrum could do it via a contract-call transaction proposal, if PayBox supports arbitrary contract calls with calldata + value on Arbitrum (not verified here; tool-contract.md in this repo is the place to confirm). Extra friction: the wallet address must first send a one-time `registerAgent` tx (or hold an ERC-8004 NFT). No EIP-712/off-chain signing path exists. A smart-contract wallet would need to be the registered `msg.sender`. Cannot be traded from Base/Solana/etc. without bridging ETH to Arbitrum. (M)

## Fees (H: skill.md, MAINNET.md)

- Buy and sell: 1% protocol fee + 1% LP fee (100 bps + 100 bps; deploy default, owner can change via `setFees`, cap 10% total). Paid by the trader on the ETH amount. Round-trip about 4% (skill.md says "~4%").
- Mint YES+NO pair, merge, settle, withdraw liquidity: free.
- Market creation fee: `MARKET_CREATION_FEE_WEI` default 0, cap 0.1 ETH (skill.md says "a small creation fee may apply").
- UMA bond: asserter and disputer post a WETH bond, minimum currently 0.11 WETH (H: skill.md); a market reward is paid to the correct asserter.
- Arbitrum gas on top. Total round-trip cost makes thin-edge arbitrage unattractive.

## Resolution

- UMA Optimistic Oracle V3, bond currency WETH, liveness 7200 s (2 hours). Anyone (any eligible agent) can assert the outcome from the market's resolution time; undisputed after 2 h it finalises; disputes escalate to UMA DVM voters (usually 2-4 days). Trading halts while an assertion is pending and at close/resolution time. (H: skill.md, MAINNET.md)
- Risks: (1) short 2 h liveness with a self-serve asserter set and a very small agent population means a wrong assertion can pass if nobody monitors; (2) questions are written by arbitrary agents with free-text wording, so ambiguity/dispute risk is high and resolution wording will not match other venues' rules; (3) owner/treasury is a deployer EOA per MAINNET.md ("Owner and treasury: the deployer EOA... no pending ownership transfer"), even though the runbook says a Safe is required: owner can change fees (cap 10%) and pause trading (exits remain open) (H); (4) "Unresolvable" outcome exists, which refunds-ish semantics are not documented (NOT FOUND).
- The 2026-09-30 commit message mentions "scanner findings on the published skill" and removal of legacy scripts incl. TEE attestation (H: commit log), indicating the project has been reviewed by skill scanners; no external audit found (NOT FOUND, searched: repo README/docs list, web).

## Geo / ToS / automation

- NOT FOUND (searched: homepage, /agent-onboarding, skill.md, repo docs listing): no terms of service, geo-block, or KYC text. The site is explicitly built for autonomous agent trading; automation is the intended use. Skill states "REAL MONEY" and recommends a dedicated wallet.
- Security note for any agent consuming the skill: skill.md instructs agents to run `npx @clawlogic/sdk@0.2.0 ...` and tells agents not to clone/browse the repo. This is third-party content; the adapter should NOT execute the CLI. Read chain state via a vetted client with the ABI. No prompt-injection payloads beyond that normal product guidance were observed.

## Liquidity

- Official figures: NOT FOUND. The homepage shows market/agent/bet/pooled counters with no values in the server-rendered HTML (H: WebFetch 2026-10-19).
- On-chain balance of the hook (= total collateral across markets) was not obtained: I did not send JSON-RPC (POST) per the read-only rules and Blockscout's GET API was Cloudflare-challenged. Follow-up for a human/adapter: `eth_getBalance(0x55cB...8880)` plus `getMarketIds()` + `getMarketReserves()` for each, on Arbitrum One.
- Indicators of thinness (M/L): launched ~3 weeks before research date; repo has 0 stars; MAINNET.md says "Seed liquidity in the first markets yourself: an empty market cannot be traded"; feed activity is dominated by test agents and stakes of 0.01 to 0.1 ETH. Assume depth per market is on the order of ETH-fractions to a few ETH until proven otherwise.

## Event categories and overlap

- Free-form agent-authored questions. Documented example: "Will ETH close above $4,000 on Coinbase at 2026-12-31 23:59 UTC?" (crypto price; overlaps Polymarket/Kalshi/Limitless-style crypto-price markets). Test-feed examples are fictional (CVE patch timing). No evidence of sports or politics markets. (H: skill.md, feed)
- Arbitrage potential: only crypto-price threshold markets might line up, and only if question wording, source (Coinbase close) and timing match exactly; 4% round-trip fees + gas + 2 h UMA liveness + AMM depth make it unlikely to be profitable. Better treated as a signal source for agent-written theses (hence P2).
- Liquidity sharing: none. It is its own CPMM; it does not route to Uniswap pools or other venues (the v4 hook is used for the gating/`beforeSwap` access check per the site description). Independent, but very thin.

## Adapter notes (if built later)

- Discovery: poll `getMarketIds()` or index `MarketInitialized` logs from the hook deploy block (L2 block 510124998). Per market: `getMarketInfo`, `getMarketReserves`, `getMarketProbability`, `quoteBuy/quoteSell` at ladder sizes, status fields (closeTime, resolutionTime, assertion pending, resolved).
- Normalisation: price_yes = prob in bps/10000 is the marginal price before fees; executable price must include 1%+1% fees and CPMM slippage; collateral denominated in ETH, so convert to USD for cross-venue edge.
- Staleness risk: Arbitrum RPC rate limits; use own RPC.

## Sources

- https://clawlogic.vercel.app (homepage via WebFetch) - H
- https://clawlogic.vercel.app/skill.md - H (saved as fixtures/clawlogic/skill.md)
- https://clawlogic.vercel.app/api/agent-broadcasts - H (sample at fixtures/clawlogic/agent-broadcasts.sample.json)
- https://registry.npmjs.org/@clawlogic/sdk (versions, times, README): created 2026-02-06, 0.2.0 published 2026-09-29 - H
- https://github.com/Kaushal-205/clawlogic (pushed_at 2026-09-30, created 2026-02-04, 0 stars, not archived); docs/MAINNET.md; packages/contracts/src/PredictionMarketHook.sol; AgentRegistry.sol - H (via gh api)
- Not reached: arbitrum.blockscout.com (Cloudflare challenge), Arbiscan (needs key), any JSON-RPC (POST, not used).

## Fixtures

- `docs/research/fixtures/clawlogic/agent-broadcasts.sample.json` (first 4 items of the feed)
- `docs/research/fixtures/clawlogic/skill.md` (official agent skill doc, 13 KB)
