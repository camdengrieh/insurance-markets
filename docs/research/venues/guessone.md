# GuessOne (guess.one) - venue spec

Researched 2026-10-19. Verdict: live, but it is a 60-second MON-price gamified-mining game, not a prediction market. Pool sizes are about $0.03 per round. Adapter priority: skip.

Confidence tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Summary

- Kind: on-chain parimutuel price game with a token-mining overlay ($GONE) on Monad mainnet (chain id 143). DefiLlama category is "Gamified Mining". (H)
- Still live: yes. 5 rounds resolved on-chain in the ~1,000 blocks before 2026-10-19 (rounds 44706 to 44710, one per ~216 blocks). (H, Monad public RPC eth_getLogs)
- Age: contract deployed around 2026-09-14, DefiLlama listing 2026-09-17, so about 5 weeks old. (H, DefiLlama adapter source and API)
- It only lets you bet on the MON/USD price move over the next 60 seconds. There are no event markets and no questions about the real world. Nothing here overlaps sports, politics, macro or other venues' crypto-price markets in a form that can be arbitraged. (H)

## Market model (H, https://www.guess.one/docs)

- 60-second rounds. Entries are open for the first 30 seconds.
- Each round has 12 "price-change ranges" (grids). Range widths adjust with volatility.
- Player picks one or more ranges and a contribution per range. The winning range is the one containing MON's percent change from the round's opening price. Winners split the MON pool after fees in proportion to contribution. This is parimutuel with 12 mutually exclusive buckets and no order book or AMM.
- Outcomes are not tokenised: stakes appear to be contract state, with no ERC-20/1155 position tokens that I found. (M; the contract source was not read)
- Autominer: the user pre-funds a balance, and an execution wallet places bets in consecutive rounds. Users pay an "execution fee" gas subsidy (AutoBetExecuted event). (H, DefiLlama adapter)
- Separately, $GONE mining: 10,000,000 $GONE per 30-day period for regular rewards (-1% per period), plus 18,000,000 extra in week 1. A "Grand Reward" jackpot triggers with 1/625 chance per round. Each round is either Shared Reward mode or Winner-Take-All mode (weighted random) for $GONE. MON payouts stay proportional in both modes. (H, docs)
- Claiming mined $GONE carries a rebase/redistribution fee to holders of unclaimed $GONE. (H, docs)

## Chains and collateral

- Monad mainnet (chain id 143), native MON as stake and payout. (H, site `__NEXT_DATA__` web3Config: `chain.id 143`, `isNativeToken: true`)
- Public RPC given by the site: https://rpc-mainnet.monadinfra.com (H). eth_getLogs is limited to about 100 blocks per call (H, observed "block range too large" for 1000).
- Contracts (H, from site web3Config; guessOne/buybackVault/staking cross-confirmed by DefiLlama adapter source):
  - guessOne (round settlement): 0x6f6493e3923377f2d0ab100D4863dE713108b480
  - guessOneUX: 0x16d8a8322fa6614Bfc13439e1b103173419cF874
  - guessOneLaunchVault: 0xea4f33dA708258553a38349252b8f533c9dD782e
  - diamondMiner: 0x73cA9094d791546704F460cEFD5fbfb0140C1130
  - goneStaking: 0x2e67B195E5148825487B310FfaB94868B9F0587A
  - guessOneBuybackVault: 0x0E2980feCae65b07ECc5b59E6e6a1c727147fE94
  - feeRouter: 0x28B5cfc322721071F7CF185c506223252D920fcb
  - GONE token: 0x0B7AA5D0a306bC65855419E798e6811fAb9C7777 (M, DefiLlama protocol record)
- Collateral is MON, which is not a stablecoin. Any hedge against another venue carries MON price risk.

## Read API

- Official public API: NOT FOUND (searched: guess.one/docs, site HTML and `__NEXT_DATA__`, /api, api.guess.one (does not resolve), web search, DefiLlama PR #9488). The only `/api/*` path I probed, `/api/rounds`, returned `400 "Bad request."` (H); I did not probe further because it is undocumented.
- The `/explore` page returned an "Application error: a client-side exception" page with a session config error when fetched server-side on 2026-10-19 (H). It may be transient.
- No GitHub org or contract source repo found. No audit (DefiLlama `audits: "0"`; adapter PR says "No public report provided"). (H)
- Practical read path is on-chain only (H, confirmed live):
  - `RoundResolved(uint256 indexed roundId, uint256 endPrice, uint256 winningSlot, uint256 totalPool, uint256 totalDeployed, uint256 vaulted, uint256 winnersCount, uint256 winningRewardAmount)` on the guessOne contract. topic0 = 0x79a79fe9b314512528b24f299287f6e842c1ed67623ce67de6161aa88f17b4b3 (computed locally with cast keccak).
  - Other events: ProtocolTreasuryAccrued, BuybackFeeDistributed, AutoBetExecuted (signatures in the DefiLlama adapter). (H)
  - Function ABI for placing bets or reading the open round's pools: NOT FOUND (contract source was not read).
- Aggregator-facing stats: DefiLlama fees only (https://api.llama.fi/summary/fees/guessone, public, H). No volume or TVL series; `tvl` is empty.
- Auth and rate limits: none for the RPC beyond the block-range cap. Websocket: NOT FOUND.

Fixtures saved under docs/research/fixtures/guessone/:
- defillama-protocol.json - DefiLlama protocol record (H).
- fees-summary.json - DefiLlama daily fees chart (H).
- roundresolved-sample.json - 3 raw RoundResolved logs from the Monad RPC (H).

Observed RoundResolved values (rounds 44706 to 44710, 2026-10-19): totalDeployed 1.2 MON, vaulted 0.134 MON, totalPool 1.066 MON, winnersCount 1 each. endPrice was about 0.0215 (18 decimals), i.e. the MON/USD price. (H)

## Trade path

- Programmatic order placement: no API. A bet would be a native-MON-value contract call on Monad (guessOne / guessOneUX). I could not confirm function signatures. (M)
- PayBox reachability: NO. The chain is Monad (143), and the PayBox chain list given in the task (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...) does not include it. I did not call any PayBox tool, so this is unverified. A 30-second entry window per round also makes an approval-gated flow impractical. (M)
- Autominer lets a pre-funded balance bet through the operator's execution wallet, but ranges come from the user's settings, not a strategy API. (H, docs)

## Fees

- Per-round retention observed: vaulted / totalDeployed = 0.134 / 1.2 = 11.2% of stake kept by the protocol, 88.8% returned to players. The split between treasury and buyback vault was not read. (H arithmetic from logs; split NOT FOUND)
- The docs defer fee amounts to a "Tokenomics" section; the fetched page text had no amounts. (H)
- Autominer: separate per-bet execution fee paid to the execution wallet. (H, adapter)
- $GONE claim: redistribution (rebase) fee to unclaimed holders. (H, docs)
- About -11% fee drag per bet unless $GONE emissions subsidise it.

## Resolution

- Resolved by the contract using a Pyth price for MON (DefiLlama oracle breakdown names Pyth with proof link to /docs; site says "Powered by Pyth"). Winning range is percent change from opening price. (H for the rule, M for exact oracle wiring)
- Dispute path: none documented. Risks are Pyth update timing and operator/keeper behaviour at settlement, with no audit. (M)
- $GONE mode (shared vs winner-take-all) and Grand Reward are randomised. DefiLlama tags Pyth as "RNG", so Pyth Entropy may be used. (M, unconfirmed)

## Geo, ToS, automation

- No Terms of Service, geo-restriction or automation policy found. /terms and /docs/terms return 404; the nav has only Home, Explore, Stake, Docs, X, Telegram. (H)
- A gambling-like game with token incentives; jurisdiction exposure unknown. (L)

## Liquidity (as of 2026-10-19)

- Per round: about 1.2 MON deployed, which at MON = $0.02146 (DefiLlama coins API, 2026-10-19) is about $0.026. (H)
- Protocol fees (DefiLlama, through 2026-10-19): 24h $4.26, 7d $177.87, 30d $5,990, all-time $8,828. The series is front-loaded by launch-week mining. (H)
- guessOne contract holds about 38,769 MON (about $830) native balance now. This includes pending player balances and is not TVL. (H, eth_getBalance)
- Volume is not published. About 1.2 MON per round at ~1,000 rounds/day implies roughly 1,200 MON (about $25) per day, from a 5-round sample only. (M)

## Overlap and shared liquidity

- Event categories: only a MON price-range bucket per 60 s. No overlap with any prediction-market event catalogue. (H)
- Shared liquidity: none known. It is an isolated pool and not an arbitrage leg for any other venue. (M)

## Adapter priority: skip

- Reasons: no market overlap, no API, cents-per-round liquidity, 11% fee drag, 30-second bet window, chain not reachable through PayBox, no audit, new game.
- If ever wanted as a signal: a read-only indexer of RoundResolved on Monad is small, using the public RPC in 100-block windows.

## Open questions

- Treasury vs buyback split of the 11.2% fee.
- Whether guessOneUX exposes a view function for open-round pool state.
- Whether the /explore server error is transient.

## Suspicious content

- None found. The /explore HTML contained only a generic "Application error" payload. No instructions from third-party content were followed.

## Sources

- https://www.guess.one/docs (H) - game rules, rewards, rebasing
- https://www.guess.one/explore (H) - `__NEXT_DATA__` chain id, contract addresses, RPC URL
- https://defillama.com/protocol/guessone and https://api.llama.fi/protocol/guessone (H) - listing, listedAt 1789668721 = 2026-09-17, Pyth oracle tag
- https://api.llama.fi/summary/fees/guessone (H) - fees series
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/guessone.ts (H) - event ABIs, contract roles, deployment 2026-09-14
- https://github.com/DefiLlama/dimension-adapters/pull/9488 (M) - listing PR, no public audit
- https://rpc-mainnet.monadinfra.com (H) - eth_blockNumber, eth_getLogs, eth_getBalance
- https://coins.llama.fi/prices/current/coingecko:monad (H) - MON price
