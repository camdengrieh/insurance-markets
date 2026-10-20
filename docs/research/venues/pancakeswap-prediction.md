# PancakeSwap Prediction (pancakeswap.finance/prediction) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs (api.llama.fi, sourcify.dev, Chainlink's public feed directory, docs sitemap), PayBox read-only discovery (`discover_tokens mode=chains`, `discover_plugins`). No account, wallet, key, signature, POST/PUT/DELETE (so no JSON-RPC `eth_call` / `eth_getLogs` either), no PayBox money or signing tool, no browser automation, no third-party code cloned or run. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. Third-party text is untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: yes (H).** DefiLlama shows $320,126 staked on 2026-10-18 and a continuous daily series through that date; the PancakeSwap docs repo was synced from the codebase on 2026-09-07; DefiLlama's adapter was updated 2026-08-12 to add the BTC and ETH markets. Details in section 1.
- **What it is:** a 5-minute up/down game on the Chainlink price of BNB, BTC and ETH, pooled pari-mutuel, staked in native BNB, on BNB Smart Chain. **Not an event-outcome market.** There are no questions, no categories, no order book and no exit before settlement.
- **Independent liquidity: yes (H).** Each market is its own pot inside its own contract. It shares nothing with any other venue, so it is technically an independent leg. But it is not a hedgeable leg (see 10).
- **Adapter priority: P2 (signal-only / thin).**
  1. Small: about $0.32M/day gross stakes, which works out to roughly $370 of pot per round if spread evenly over 3 markets x 288 rounds (M, my arithmetic from DefiLlama). Volume is down about 72% from Oct 2025 ($25.8M/month) to Sep 2026 ($7.3M/month).
  2. No official REST or WebSocket API. The only official read surface is the contract (views and events, needs a BSC JSON-RPC node) plus a Graph subgraph that covers the BNB market only (H) and needs a Graph API key and POST.
  3. Odds are unknowable until betting closes (pari-mutuel), a 3% rake comes off the pot, and the reference price is the Chainlink BSC feed read when an operator transaction lands, not a price at a published instant. A cross-venue hedge has large basis risk.
  4. The one real edge is single-venue: pool skew versus a roughly 50/50 true probability (section 11, M). That is a statistics play on a $370 pot, not cross-venue arbitrage.
  5. The biggest market (BNBUSD) rejects smart-contract callers (`notContract`, H). Only an EOA can bet or claim there.
- Cheap to integrate if wanted: three small open contracts, one event ABI, no auth, no per-order signing.

## 1. Liveness evidence

| Check | Result | Source |
|---|---|---|
| DefiLlama daily volume | 755 daily points; last point 2026-10-18 = $320,126; 2026-10-17 $344,593; 2026-10-05..10-18 all between $244k and $345k | https://api.llama.fi/summary/dexs/pancakeswap-prediction (H, fixture) |
| DefiLlama fees | 24h fees $9,625 (=3% x $320k, consistent) | https://api.llama.fi/summary/fees/pancakeswap-prediction (H) |
| DefiLlama adapter | `dexs/pancakeswap-prediction/index.ts` tracks the 3 live BNB-Chain contracts; commit 2026-08-12 "add the BTC and ETH markets"; comment "BTCUSD, ETHUSD live since 2025-09-08" | https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pancakeswap-prediction/index.ts (H) |
| Official docs | Docs say "BNB Chain (live); zkSync Era, Arbitrum One (paused)"; CAKEUSD paused. Docs repo last touched for this path 2026-09-07 ("docs: sync with codebase") | https://docs.pancakeswap.finance/play/prediction ; `gh api repos/pancakeswap/pancake-document/commits?path=play/prediction` (H) |
| Developer docs | Contracts listed: BNB, BTC, ETH on BSC; ETH also on Arbitrum; CAKE (BSC) and ETH (zkSync) under "Deprecated". Last change 2026-09-07 | https://github.com/pancakeswap/pancake-developer/blob/main/docs/pages/contracts/prediction/addresses.mdx (H) |
| Contracts | All three BSC contracts are verified on Sourcify (BNB `match` 2026-05-13, BTC `exact_match` 2026-06-03, ETH `exact_match` 2026-09-27), not proxies | https://sourcify.dev/server/v2/contract/56/{address}?fields=all (H) |
| Main site | `https://pancakeswap.finance/prediction` returned Cloudflare 403 "Attention Required" to WebFetch and to a plain curl. Not retried or worked around. | n/a |
| Not checked | A live `eth_call` (`currentEpoch`, `paused`) or latest `StartRound` log. Needs JSON-RPC POST, out of scope. | - |

Status flags to carry: the "AI Prediction" variant (20-minute ETH rounds on Arbitrum, Allora forecast) is archived (H, https://docs.pancakeswap.finance/archive/legacy-products/archived-ai-prediction). The CAKE market is deprecated/paused. Arbitrum and zkSync markets are paused per docs (H docs; on-chain state not checked).

## 2. Kind and market model

- **Kind:** pari-mutuel price-direction game, "parimutuel-p2p" (H). Players stake native BNB on UP (Bull) or DOWN (Bear). Winners split the whole pot minus the fee. No LPs, no market maker, no order book. https://docs.pancakeswap.finance/play/prediction ; verified source `PancakePredictionV2.sol`.
- **Markets (BSC, one contract per asset, H):**
  - BNBUSD `0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA` (2021, block 10333825)
  - BTCUSD `0x48781a7d35f6137a9135Bbb984AF65fd6AB25618` (block 60081450, 2025)
  - ETHUSD `0x7451F994A8D510CBCB46cF57D50F31F188Ff58F5` (block 60087359, 2025)
  - Dev docs also list an Arbitrum ETH contract `0x1cdc19B13729f16C5284a0ACE825F83fC9d799f4` (paused per user docs; an older subgraph config used `0xF2F90E718a3BFaCb430c1818cB962f05A2631998`, so Arbitrum addresses are inconsistent across Pancake sources, L).
- **Outcomes are not tokenised.** A position is a ledger row `ledger[epoch][address] = {position, amount, claimed}`; one bet per address per round; cannot be changed, increased, sold or withdrawn (H, source and FAQ). There is no ERC-20/1155 position token, so no secondary market and no way to hedge by selling.
- **Binary and complementary by construction** (UP vs DOWN), with a third state "tie" (lock price == close price) that goes to the house (H).
- **Round timing (H, source `_startRound`, `_safeLockRound`):** each round has a 300 s betting phase (`startTimestamp` to `lockTimestamp`), then a 300 s live phase (lock to close). A new round starts every 300 s, so three rounds are in flight (betting n, live n-1, settling n-2). One operator call `executeRound()` per interval does three things in one transaction using one oracle read: lock n-1, end n-2, start n+1. So the close price of round n-2 equals the lock price of round n-1.
- **Pool state is the price.** For a round with pools `U` (bull), `D` (bear), `T = U + D`: UP pays `0.97*T/U` per unit if it wins, DOWN pays `0.97*T/D`. The multiple moves with every bet until lock. Break-even probability for UP is `U / (0.97*T)`; the two sides' break-evens sum to 1.031 (the 3% rake). Crowd-implied P(up) is roughly `U/T` (M, my derivation).
- **Contract differences (H, dev docs "Differences between BNB and ETH/BTC"):** struct layouts differ (BNB 2021 vs BTC/ETH 2025 packed). Both emit the same events (see 3).

## 3. Read API

**Official REST/WebSocket API: NONE (searched: docs.pancakeswap.finance Prediction pages, developer.pancakeswap.finance contracts/prediction and apis/subgraph, pancake-developer repo tree).** Read surface is the contract and a subgraph.

| Surface | What | Auth / limits | Verified? |
|---|---|---|---|
| Contract views (BSC JSON-RPC `eth_call`) | `currentEpoch()`, `rounds(epoch)` (epoch, start/lock/close timestamps, lockPrice, closePrice, lockOracleId, closeOracleId, totalAmount, bullAmount, bearAmount, rewardBaseCalAmount, rewardAmount, oracleCalled), `ledger(epoch,user)`, `claimable(epoch,user)`, `refundable(epoch,user)`, `getUserRounds(user,cursor,size)`, `treasuryFee()`, `minBetAmount()`, `intervalSeconds()`, `bufferSeconds()`, `oracle()`, `oracleUpdateAllowance()`, `paused()`, `treasuryAmount()` | Public RPC; rate limits depend on the RPC provider (NOT FOUND, not researched) | ABI and names H (Sourcify, dev docs). Not called (POST). |
| Events (`eth_getLogs` / `eth_subscribe logs`) | `StartRound(epoch)`, `LockRound(epoch, roundId, price)`, `EndRound(epoch, roundId, price)`, `BetBull(sender, epoch, amount)`, `BetBear(sender, epoch, amount)`, `Claim(sender, epoch, amount)`, `RewardsCalculated(epoch, rewardBaseCalAmount, rewardAmount, treasuryAmount)`, `Pause(epoch)`, `Unpause(epoch)`, `NewOracle`, `NewTreasuryFee`, `NewMinBetAmount`, `NewBufferAndIntervalSeconds` | Needs a BSC node with log access; WebSocket depends on provider | Signatures H (Sourcify ABI, subgraph yaml, DefiLlama adapter). Not called. |
| Subgraph "Prediction v2" (The Graph) | Entities `Market`, `Round`, `User`, `Bet`; schema saved as fixture. Covers the BNB contract `0x18B2...49cdA` (startBlock 10333825); a "v2-generic" template exists for other chains | The Graph network needs an API key and GraphQL POST; the dev docs link only to an explorer page (subgraph id `4kRuZVKCR9dsG2ePXhLSiKw5oaw3YMJo4nAwxZbUaqVY`) | Schema and yaml H. **Subgraph code last changed 2024-01-15**; whether BTC/ETH (2025) contracts are indexed anywhere public: NOT FOUND. Not queried. |
| DefiLlama | `GET https://api.llama.fi/summary/dexs/pancakeswap-prediction` and `/summary/fees/...`: daily gross stakes and 3% fees in USD for all three BSC markets combined. No per-round or per-market data. No TVL tracked (`currentChainTvls` empty) | Public, no key | H, fixtures saved |
| Website UI | Uses Binance/TradingView feed for the live chart (reference only) and Chainlink for settlement | Cloudflare-protected; scraping prohibited in ToS (see 8) | Not read |

**Fixtures (docs/research/fixtures/pancakeswap-prediction/):**
- `defillama_dexs_summary_trimmed.json` - real response shape (metadata, methodology, totals, last 30 daily points).
- `defillama_fees_summary_trimmed.json` - same for fees.
- `sourcify_contract_facts.json` - verified-source facts for the three markets: deployment tx/block, decoded constructor args, ABI subset (events and key views), `notContract` flag.
- `chainlink_bsc_feeds_subset.json` - Chainlink BSC feed rows for BNB/BTC/ETH vs USD and which constructor oracles were found.
- `prediction_v2_subgraph_schema.graphql` - subgraph schema from the official repo.

No fixture of a contract call or a log exists because that needs JSON-RPC POST. An adapter author must capture one `rounds(currentEpoch)` response and a `BetBull` log before relying on field encodings (the `rounds()` return tuple differs between the BNB and the BTC/ETH contracts).

**Adapter sketch (M):** poll or subscribe per market; keep `currentEpoch`; snapshot `rounds(currentEpoch)` for `bullAmount`/`bearAmount` until `lockTimestamp`; record `LockRound`/`EndRound` prices for settlement; compute implied multiples as in section 2. One round = one binary market keyed `(chain=56, contract, epoch)`; "question" is synthetic: "Will the Chainlink {BNB,BTC,ETH}/USD price at the next-but-one `executeRound` be higher than at the next one".

## 4. Trade path

**Programmatic: yes, plain transactions, no signed orders, no approvals, no API key.** (H, source + dev docs https://github.com/pancakeswap/pancake-developer/blob/main/docs/pages/contracts/prediction/how-to-bet-and-claim.mdx)

- Bet: `betBull(uint256 epoch)` or `betBear(uint256 epoch)`, `payable`, `msg.value` = stake in BNB. Requires `epoch == currentEpoch`, round bettable (`startTimestamp < block.timestamp < lockTimestamp`), `msg.value >= minBetAmount` (0.001 BNB at deployment on all three; current value not read), one bet per address per round, market not paused (H source).
- Claim: `claim(uint256[] epochs)` after `block.timestamp > closeTimestamp`; winners get `amount * rewardAmount / rewardBaseCalAmount`; unsettled (oracle failed) rounds refund the stake after `closeTimestamp + bufferSeconds`. No deadline to claim (H FAQ). Payout is a native-BNB internal transfer.
- No cancel. No order. No limit price: the multiple you get is whatever the pool is at lock (H). A late bet changes the odds of everyone.
- **Caller restriction (H, Sourcify source of BNB contract):** BNBUSD `betBull`, `betBear` and `claim` carry `notContract`: `require(!_isContract(msg.sender))` (extcodesize > 0) and `require(msg.sender == tx.origin)`. A Safe, an ERC-4337 account, or any contract caller reverts. An EIP-7702-delegated EOA has non-zero code and would very likely fail the extcodesize check too (M, reasoning from the check). **BTCUSD and ETHUSD have no such modifier** (H: verified source) and pay out with a gas-limited transfer that falls back to WBNB, which is designed to cope with contract wallets.
- Gas: paid by the sender in BNB. Claims show up as internal transactions (H FAQ).
- Timing risk: a bet transaction must be mined inside the 300 s window and against the current epoch; if the epoch rolls over first it reverts and gas is lost. Operator timing: the lock/close price is whatever Chainlink round is latest when the operator's `executeRound()` lands, which can be up to `bufferSeconds` (30 s at deployment) after the nominal lock time (H source). So the reference price is not known when betting closes.
- Third-party bots exist (a GitHub topic `pancakeswap-predict-bot` and others, M, not opened). The official dev FAQ anticipates custom frontends calling the contract and asks how to charge a fee ("your frontend -> your proxy contract -> PCS prediction contract", H). PancakeSwap also ran its own Telegram prediction bot (BNBUSD only, H docs; launched Sept 2024, M news).

## 5. PayBox reachability: partial (likely yes for BTC/ETH, EOA-only for BNB)

- BNB Smart Chain (`eip155:56`, native BNB) is in PayBox's chain catalog (H, live `discover_tokens mode=chains query=bnb`, 2026-10-19). The tool states the catalog is "metadata, not a support allowlist", so signing/proposal support on 56 is not proven by presence.
- No PayBox plugin for PancakeSwap exists (H, `discover_plugins query=pancakeswap` returned `[]`, 2026-10-19).
- PayBox EVM plugin proposals carry `{to, value, data}` (H, docs/research/04-paybox-reference-plugins-a.md), so `betBull(epoch)` with `value` = stake and `claim(uint256[])` fit the shape. Per docs/research/06-paybox-platform.md the PayBox EVM wallet is an MPC-held EOA that pays its own gas (H there, not re-verified now), so the BNB contract's `notContract` check should pass for it unless the wallet is EIP-7702-delegated (M, open).
- The XO smart-account route does not apply here: the BNB market refuses contract callers, so only an EOA works there; BTC/ETH accept anything.
- Practical limits: each proposal needs the current epoch at build time and approval inside the 5-minute window; PayBox shows raw calldata and native value, no decode (H, doc 06). A round-by-round bot through PayBox approvals is operationally slow. Not tested (a test would move money).
- Wallet needs BNB on chain 56 (stake plus gas). Funding via PayBox's `get_buy_link`/`request_swap` onto BSC not tested.

## 6. Fees

- **3% of each round's total pot** (`treasuryFee = 300`, divisor 10000), taken at settlement from the pot before winners are paid, so winners effectively pay it (H: docs, FAQ, source). Set at deployment to 300 on all three contracts (H, decoded constructor args); admin can change it only while paused, capped at 10% (`MAX_TREASURY_FEE = 1000`, H source, BTC/ETH contract). Current on-chain value not read.
- Payout = `bet * rewardAmount / rewardBaseCalAmount`, i.e. `bet * 0.97 * T / winningPool` (H; docs worked example: 2 BNB on a 15 BNB DOWN side in a 150 BNB pot pays 19.4 BNB).
- **House-wins cases:** tie (lock price == close price) sends the whole pot to the treasury; if the winning side has zero stake the whole pot goes to the treasury; a lone winner with no opposing bets gets 97% back (H, source + FAQ).
- 100% of the treasury take funds CAKE buy-and-burn (H docs and DefiLlama methodology). No maker/taker fee, no withdrawal fee, no LP fee.
- Gas on BSC for bet and claim; no gas compensation when markets pause (H FAQ).

## 7. Resolution mechanism and dispute risk

- **Oracle:** Chainlink price feed on BSC, read by `oracle.latestRoundData()` inside the operator's `executeRound()`; must have `timestamp >= now - oracleUpdateAllowance` and `roundId > oracleLatestRoundId` (H, source). The live ETH oracle is the Chainlink ETH/USD proxy `0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e` (heartbeat 60 s, deviation 0.1%, 8 decimals, H, Chainlink directory). The BNB (`0xd276fcf3...94aC`) and BTC (`0xe2d68cc1...4acd6`) oracles used at construction are **not in Chainlink's current BSC directory** (H absence; the directory lists other BNB/USD and BTC/USD proxies with 27-60 s heartbeats). The contract's `oracle()` may have been changed by `setOracle`; current value NOT read (needs `eth_call`).
- **Who triggers settlement:** a single `operatorAddress` (an EOA at deployment: for BTC and ETH, admin == operator == deployer `0x497F4521...`, H) calls `executeRound()`. No on-chain permissionless fallback to lock or close a round. Lock time actually used is the block time of the operator tx (within `bufferSeconds` of nominal), not the nominal lock time (H source).
- **Failure mode:** if the operator misses the buffer or the oracle is stale, the round cannot be locked/ended, `oracleCalled` stays false and stakers can claim a refund after `closeTimestamp + bufferSeconds`. The market pauses and stays paused until an admin runs `unpause` and the genesis rounds again (H FAQ + source). Gas for refunds is the user's.
- **"Flip" risk:** FAQ states the displayed result can change a few seconds after the round ends because the oracle updates during the 30 s gap (H). The contract result is final once `EndRound` is emitted.
- **Admin powers (H, source; same pattern in the 2021 BNB contract, which uses plain `Ownable`, while BTC/ETH use `Ownable2Step`):** owner and admin can pause/unpause, change fee (<=10%), min bet, interval/buffer, oracle address (all while paused), claim the treasury, and recover ERC-20s sent by mistake. Native BNB held for pending rounds cannot be swept by `recoverToken` (ERC-20 only). Upgradeability: none (not proxies, H). Audit: PeckShield audit of Prediction V2 linked from dev docs (https://github.com/peckshield/publications, H link, PDF not read); the 2025 BTC/ETH contract is a different codebase (Solidity 0.8.26, WETH fallback, Ownable2Step) and the audit coverage for it is NOT FOUND.
- **Dispute process:** none. Resolution is the oracle number; there is no challenge window, no UMA-style dispute (H, absence in source/docs).
- Basis risk for any cross-venue hedge: the reference is the Chainlink *BSC* push feed (heartbeat 27-60 s, 0.1% deviation, H), not Binance spot, not a Chainlink Data Streams price, and not an instant the counterparty venue shares. The UI itself warns that its Binance chart can differ from the settlement price (H).

## 8. Geo / ToS / automation

- **Contract level:** no allowlist, no KYC, no geo gate in `betBull`/`betBear`/`claim` (H, source). BNB contract requires EOA callers (section 4).
- **Docs:** the Prediction pages, FAQ and dev docs state no geographic restriction and no ban on bots (H absence, searched: play/prediction README, FAQ, guide, mini-app, dev docs). The only geo-block list in the docs covers tokenized stocks, not Prediction (H, https://docs.pancakeswap.finance/trade/pancakeswap-exchange/tokenized-stocks-geo-block.md).
- **Website ToS:** `https://pancakeswap.finance/terms-of-service` is a client-rendered page, so the text could not be read first-hand (curl returned an empty app shell; WebFetch got only the title). **NOT FOUND first-hand.** A search excerpt and a stale fork copy of the page (a third-party repo's `terms-of-service.tsx`, vintage unknown, L) show: sanctions-based eligibility only (no gambling or prediction clause), a ban on "data mining, robots, scraping, or similar data gathering" from the Website, Hong Kong law and arbitration. That clause governs the website, not direct contract calls (M). Current wording unverified; legal review needed before any production automation.
- Regulatory context (M): a price-direction game with a rake is gambling-like in many places; PancakeSwap's own Probable integration was reported as geo-restricted where prediction markets are treated as gambling (https://finance.yahoo.com/news/yzi-labs-chases-prediction-market-123715767.html, M), but that is a different product and says nothing about this game.
- Bot activity is public and tolerated in practice (GitHub bots; the dev FAQ about custom frontends; PancakeSwap's own Telegram bot), M.

## 9. Liquidity

DefiLlama, pulled 2026-10-19 (data through 2026-10-18), USD value of BNB staked (gross stakes, both sides, 3 BSC markets combined; H unless noted):

| Window | Volume |
|---|---|
| 24h | $320,126 (48h-24h: $344,593) |
| 7d | $2,063,139 (about $295k/day) |
| 30d | $8,171,127 |
| 1y | $152,742,181 |
| All time | $394,358,174 |

- Monthly trend (summed from the daily series, H): 2025-01 $21.7M, 2025-10 $25.8M (peak, probably includes the new BTC/ETH markets), 2026-03 $15.1M, 2026-06 $10.1M, 2026-09 $7.3M, 2026-10 to date (18 days) $5.0M. Roughly -72% from 2025-10 to 2026-09.
- Fees at 3%: $9,625 on 2026-10-18 (H). TVL: none tracked; there is no pooled liquidity, only the in-flight pots.
- Per-round depth is not published by any GET API. Rough average pot about $370 (M: $320k / (3 x 288)). Distribution across BNB/BTC/ETH and across rounds NOT FOUND (needs event data).
- Your own stake moves the odds (you are a share of the pool), so capacity is a few hundred dollars per round before self-impact.

## 10. Event overlap and independence

- **Categories:** crypto short-term direction only (BNB, BTC, ETH vs USD, 5-minute windows). No sports, politics, macro or event markets.
- **Overlap with other venues (M):** Polymarket lists 5-minute (and 15-minute) BTC/ETH "Up or Down" markets resolved on Chainlink Data Streams (Feb 2026 report; whether the rule is point-to-point or TWAP is contradictory across secondary sources, so check a live market before relying on it): https://www.kucoin.com/support/48142946142410 , https://www.mexc.com/news/708607 . Other venues in the parallel workflow (Kalshi, Limitless, Overtime Speed Markets in an earlier note) may have similar short-dated crypto direction products; not checked here.
- **Why that overlap is not a clean arbitrage:** different oracle (Chainlink BSC push feed vs Data Streams), different timing (Pancake lock = operator tx time, not a fixed second), tie goes to the house here, 3% rake, no ability to exit or size after seeing the final pool, and pot sizes that cannot absorb a hedge. A hedge against a Polymarket order book is feasible only for a few hundred dollars per round with basis risk on both legs.
- **Shared liquidity: none (H).** Separate contracts, own pots, no vault, no routing to or from another venue. It is an independent leg in the liquidity sense; the limitation is structure and size, not shared depth.
- **Related PancakeSwap product, different venue:** PancakeSwap integrated "Probable", an event-outcome prediction market on BNB Chain settling in USDT, into its interface on 2025-12-19 (M, one news report; not researched here, not in the covered-venue list). It should be assessed as a separate venue by the orchestrator. It is not this game.

## 11. Single-venue edge notes (M, not backtested)

- If true P(up) is about 0.5 for a 5-minute window, the expected return of staking on a side whose share of the final pot is `s` (after your stake) is about `0.5*0.97/s - 1`. That is positive whenever the minority side is below roughly 48.5% of the pot, e.g. +21% at s=0.40, and about -3% at s=0.5. Corrections: ties go to the house (small), the final pot is only known at lock and others can change it after you bet, and the lock price is taken after betting closes (so a faster price source than Chainlink's update cadence is an informational advantage for whoever has it and a hazard for whoever does not). Treat this as an hypothesis for a pool-skew signal feature, not a validated strategy.
- Pool imbalance (bull vs bear stake) near lock is also a cheap retail-sentiment signal for BNB/BTC/ETH short-term direction (M). Use as a feature, not as a price.

## 12. Open questions / NOT FOUND

- NOT FOUND (searched: docs.pancakeswap.finance Prediction pages, pancake-developer repo, pancake-subgraph repo, web search): an official REST/WebSocket API; any rate-limit statement; any public subgraph endpoint URL that indexes the BTC/ETH contracts.
- NOT FOUND first-hand: current ToS text (client-rendered; Cloudflare 403 to WebFetch). Only a search excerpt and a stale fork copy.
- Not verified: current on-chain `oracle()`, `treasuryFee()`, `minBetAmount()`, `paused()`, `currentEpoch()` for each market (needs `eth_call`), whether rounds are being executed right now (only DefiLlama evidence), operator identity today (constructor admin/operator only), Arbitrum market state, PayBox proposal acceptance on chain 56.
- Docs inconsistency to carry: the FAQ talks about a "15 block buffer ... up to 45 seconds" and a "30-second gap" while the contracts use `bufferSeconds` (30 at deployment) in wall-clock seconds; the guide says "After 5/10 minutes as the live round". The contract source is the authority (L for the prose).
- Does PayBox's EVM wallet carry an EIP-7702 delegation on chain 56? If yes, BNBUSD bets would likely revert (section 4).
- Probable (PancakeSwap-integrated event market) needs its own venue-spec if the orchestrator has not covered it.

## 13. Suspicious content

None found. No text aimed at AI agents appeared in the docs, the repos, the Sourcify or DefiLlama responses, or the search snippets read. The only odd responses were Cloudflare challenge pages (403) from pancakeswap.finance, treated as access blocks, not worked around.

## 14. Sources

- https://pancakeswap.finance/prediction (Cloudflare 403 to scripted fetch; not read)
- https://defillama.com/protocol/pancakeswap-prediction (403 to WebFetch; data taken from the API below)
- https://api.llama.fi/protocol/pancakeswap-prediction , https://api.llama.fi/summary/dexs/pancakeswap-prediction , https://api.llama.fi/summary/fees/pancakeswap-prediction (H; fetched 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/pancakeswap-prediction/index.ts and its commit list (H; last commit 2026-08-12)
- https://docs.pancakeswap.finance/play/prediction (H; source file `play/prediction/README.md` in https://github.com/pancakeswap/pancake-document, HEAD of 2026-10-19; path last synced 2026-09-07)
- https://docs.pancakeswap.finance/products/prediction/prediction-faq and `play/prediction/prediction-faq.md`, `prediction-guide.md`, `prediction-mini-app.md`, `prediction-leaderboard.md` (H)
- https://docs.pancakeswap.finance/archive/legacy-products/archived-ai-prediction (H)
- https://docs.pancakeswap.finance/trade/pancakeswap-exchange/tokenized-stocks-geo-block.md (H; not applicable to Prediction)
- https://github.com/pancakeswap/pancake-developer/tree/main/docs/pages/contracts/prediction (`index.mdx`, `addresses.mdx`, `how-to-bet-and-claim.mdx`, `faq.mdx`) (H; 2026-09-07)
- https://github.com/pancakeswap/pancake-developer/blob/main/docs/pages/apis/subgraph.md (H)
- https://github.com/pancakeswap/pancake-subgraph/tree/v3/subgraphs/prediction (v2 and v2-generic: `subgraph.yaml`, `schema.graphql`) (H; last change 2024-01-15)
- https://sourcify.dev/server/v2/contract/56/0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA , .../0x48781a7d35f6137a9135Bbb984AF65fd6AB25618 , .../0x7451F994A8D510CBCB46cF57D50F31F188Ff58F5 (`?fields=all`) (H; verified source, ABI, constructor bytecode, deployment tx/block)
- https://reference-data-directory.vercel.app/feeds-bsc-mainnet.json (Chainlink public feed directory) (H)
- https://github.com/peckshield/publications (audit link only, H link; PDF not read)
- https://finance.yahoo.com/news/yzi-labs-chases-prediction-market-123715767.html (M; Probable integration, 2025-12-19)
- https://www.kucoin.com/support/48142946142410 , https://www.mexc.com/news/708607 (M; Polymarket 5-minute crypto markets)
- https://www.binance.com/en/square/post/2024-09-11-pancakeswap-launches-prediction-bot-amid-rising-interest-in-prediction-markets-13398359027266 (M; search result only)
- Search excerpts of https://pancakeswap.finance/terms-of-service plus a third-party fork copy of its page source (L; vintage unknown)
- PayBox read-only discovery 2026-10-19: `discover_tokens mode=chains query=bnb` (BSC `eip155:56` present), `discover_plugins query=pancakeswap` (none). Prior repo notes: docs/research/04-paybox-reference-plugins-a.md, docs/research/06-paybox-platform.md.
