# Overtime (overtimemarkets.xyz) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts, public block-explorer GETs. No key requested, nothing signed, no POST/PUT/DELETE, no PayBox tool called, no third-party code cloned or run. Third-party text is untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: yes (H).** Public `games-info` carries `lastUpdate` 2026-10-19 00:02 UTC with 39 games `live` and 5,446 unfinished games; the Optimism Sports AMM proxy received 49 `setRootForGame`/`setPackedRoots...` odds-root transactions and 1 `trade` in a 4.5-minute window ending 2026-10-19 00:07:49 UTC (explorer.optimism.io GET). Details in section 1.
- **Not an arbitrage leg. Adapter priority: skip.** Reasons, each independently sufficient:
  1. The odds/markets/quote/liquidity API is gated by an approved `x-api-key`, and the integration overview says in bold it is "**not intended for experimental, personal, arbitrage or any sorts of automated trading projects**" (H, docs.overtime.io/overtime-v2-integration.md). Our use case is exactly the excluded one.
  2. On-chain only the Merkle **root** of each game's odds is stored; per-position odds and the proofs needed to trade come from that gated API. So there is no on-chain-only way to read or trade prices (H/M, see 3 and 5).
  3. Prices are not independent price discovery: the AMM takes implied probabilities from Pinnacle/OpticOdds-type feeds, adds a ~2% fee (H), and Overtime itself market-makes on Polymarket (H). Overtime-vs-Polymarket sports is partly the same book on both sides.
  4. Thin: TVL about $1.3M, about $0.27-0.38M/day volume that includes non-sports products; per-position caps small (section 9).
  5. The terms prohibit US persons and US access (H).
- Only open, unauthenticated, useful surface: league list, `games-info` (teams, status, final scores) and `live-scores`. That is a result/status feed, not a price feed, and is not worth an adapter by itself.

## 1. Liveness evidence (H unless marked)

| Check | Result | Source |
|---|---|---|
| Docs site | Reachable; pages mention events up to June 2026 (OIP-263, OIP-265) | https://docs.overtime.io/llms.txt |
| API `games-info` | 28,755 entries; `lastUpdate` max 2026-10-19 00:02:41 UTC; 5,446 unfinished; status counts: completed 22,937, unplayed 4,292, cancelled 372, delayed 59, live 39 | https://api.overtime.io/overtime-v2/games-info |
| API `live-scores` | 2,843 entries; `lastUpdate` max 2026-10-19 00:06:02 UTC | https://api.overtime.io/overtime-v2/live-scores |
| Optimism Sports AMM proxy `0xFb4e4811C7A811E098A556bD79B64c20b479E431` (address from docs sample) | Verified `TransparentUpgradeableProxy` (eip1967), implementation `SportsAMMV2` `0xf33a30d256a1FEbBee39D5A369eE9fA8835986B5` verified 2026-09-28; 8,793,435 lifetime txs; last 50 txs span 00:03:17-00:07:49 UTC on 2026-10-19: 34 `setRootForGame`, 14 `setPackedRootsPerGamesAndTypes`, 1 `setRootsPerGames`, 1 `trade` | https://explorer.optimism.io/api/v2/addresses/0xFb4e4811C7A811E098A556bD79B64c20b479E431 (+ `/transactions`, `/counters`, `/api/v2/smart-contracts/0xf33a...86B5`) |
| `LiveTradingProcessor` `0x3b834149F21B9A6C2DDC9F6ce97F2FD1097F8EAB` (docs sample) | Verified contract on Optimism | https://explorer.optimism.io/api/v2/addresses/0x3b834149F21B9A6C2DDC9F6ce97F2FD1097F8EAB |
| DefiLlama | Listed as "Overtime Prediction Market", volume 24h $375,192 (pulled 2026-10-19) | https://api.llama.fi/summary/dexs/overtime |
| CoinGecko | OVER categories include "Prediction Markets"; price $0.1936, mcap $10.47M, 24h vol $13.3K at 2026-10-19 00:05 UTC | https://api.coingecko.com/api/v3/coins/overtime |
| Main site | `https://www.overtimemarkets.xyz/` returned Cloudflare 403 "Attention Required" to WebFetch and to a plain curl. Not retried or worked around. | n/a |
| Recent governance | Council dissolved (OIP-263) and external LP ended (OIP-265), both June 2026 | https://docs.overtime.io/get-started/faq.md |

Stale/odd items to carry: the repo file for OIP-265 still says `Status: Draft` (created 2026-06-22) while docs say it passed (H both; docs and DefiLlama agree it took effect, DefiLlama says from 2026-07-21 00:00 UTC, https://github.com/DefiLlama/dimension-adapters/pull/9813). The docs integration overview still uses a Euro 2024 example (stale sample data, not the product).

## 2. Kind and market model

- **Kind:** on-chain sports betting AMM ("Pool-vs-Peer"), not an order book, no peer matching, no secondary market for positions. Treasury-funded book. (H: https://docs.overtime.io/get-started/what-is-overtime.md, https://docs.overtime.io/learn-about-overtime/how-overtime-works.md)
- **Pricing:** "AMM sources implied probabilities for each market directly from global odds providers and brings them onchain through Chainlink oracle nodes"; providers named: Pinnacle via The Rundown, JsonOdds, OpticOdds (H: https://docs.overtime.io/learn-about-overtime/overtime-amm-and-liquidity-mechanics.md, .../about-odds-providers.md). Live API league list shows `provider: opticOdds` for 587 of 651 leagues (H, /overtime-v2/sports).
- **Outcome tokenisation:** V1 tokenised each position as ERC-20; **V2 does not**. Positions are tickets (one ticket contract per bet, `ticketMastercopy`) bought with `trade(...)`; odds are Merkle leaves verified against a per-game root pushed on chain every few seconds (H: https://docs.overtime.io/learn-about-overtime/history-of-overtime.md, https://docs.overtime.io/learn-about-overtime/market-creation-and-trading.md, explorer ABI).
- **Outcome structure:** per market 2 or 3 positions (home/away/draw, over/under, yes/no, one-sided for futures and motorsport). Market types: moneyline, handicap, total, double chance, HT/FT, BTTS, draw-no-bet, player props, futures, parlays and same-game parlays ("SGP"), live. `/market-types` returns 950 market-type definitions (H, live GET). Binary-style complementary prices are not guaranteed: displayed implied odds include margin (the docs sample response sums to 1.056: 0.4587 + 0.3115 + 0.2857; M for the fee reading, H for the numbers).
- **League coverage (H, live /sports, 651 leagues, 26 hidden):** Soccer 365, Basketball 62, Volleyball 47, Futures 33, Hockey 29, Handball 22, eSports 15, Darts 12, Cricket 11, Tennis 9, Baseball 8, Rugby 8, Table tennis 6, American football 4, Fighting 4, Water polo 4, others small. **Politics: 1 league, "US Election 2024"** (stale). No macro. 
- **Other products under the same brand:** Speed Markets (UP/DOWN digital options on BTC/ETH, strike = spot at purchase, so always 50:50, 1 min to 24 h, Pyth Benchmarks oracle) and Overtime Casino (13 VRF games). Not prediction markets in the arbitrage sense. (H docs; Speed Markets doc parameters may be old: its fee table shows "X" for the 1-10 min rows.)

## 3. Read API

**Official, but split: a few public endpoints, all price-bearing endpoints need an approved key.** Docs: https://docs.overtime.io/overtime-v2-integration.md, Postman collection https://documenter.getpostman.com/view/1435701/2sA3XY5Hao (not read). Base URL `https://api.overtime.io` (H).

| Endpoint | Auth (confirmed by live GET 2026-10-19) | Content |
|---|---|---|
| `GET /overtime-v2/sports` | none, 200, 172 KB | league catalog: sport, id, label, provider, scoringType, matchResolveType, periodType, isDrawAvailable, hidden |
| `GET /overtime-v2/market-types` | none, 200, 165 KB | 950 market type definitions with outcome names |
| `GET /overtime-v2/networks/{10,42161}/collaterals` | none, 200 | collateral list per network |
| `GET /overtime-v2/games-info[/{gameId}]` | none, 200, 10.6 MB (whole table, no filters seen) | teams, isHome, score, scoreByPeriod, gameStatus, isGameFinished, finishedTimestamp, tournamentName, positionNames (futures) |
| `GET /overtime-v2/live-scores[/{gameId}]` | none, 200, 645 KB | period, clock, home/away score |
| `GET /overtime-v2/players-info` | none, 200, 1.6 MB | playerId -> name |
| `GET /overtime-v2/networks/{id}/markets[/{gameId}]` | **401** `{"error":"Unauthorized: Invalid API key"}` | markets with `odds[].decimal/american/normalizedImplied`, `proof[]`, child markets, status; params `status`, `leagueId(s)`, `gameIds`, `typeId(s)`, `playerIds`, `lines`, `onlyBasicProperties`, `includeProofs`, `ungroup`, `min/maxMaturity`, `responseHash`+`includeHashInResponse` ("no change" polling) |
| `GET /overtime-v2/networks/{id}/live-markets` | **401** | live moneyline odds (separate Chainlink-fulfilled trade path) |
| `GET /overtime-v2/networks/{id}/liquidity` | **401** (docs: refreshed ~every 5 min) | `maxStake` and `liquidity` in USDC per position key `gameId\|sportId\|typeId\|playerId\|line\|position` |
| `POST /overtime-v2/networks/{id}/quote` | key required per docs; not called (POST) | totalQuote, payout, `ticketLiquidityInUsd` |
| `GET /overtime-v2/networks/{id}/users/{addr}/history` | key required per docs | tickets by status |

- **Key policy (H, quoted):** "API keys are issued only to teams or organizations that can clearly demonstrate how their intended use ... delivers meaningful value to Overtime, its users, or its ecosystem". The overview page adds: "not intended for experimental, personal, arbitrage or any sorts of automated trading projects"; the per-endpoint pages say "experimental, hobbyist, or small personal projects". Header: `x-api-key`.
- **Rate limits (H):** prematch markets "one request per league every 5 seconds"; live "one request for all leagues every 2 seconds"; keys can be blacklisted. Liquidity refresh about 5 min. No other limits stated for public endpoints (NOT FOUND, searched docs).
- **WebSocket:** NOT FOUND (searched all fetched docs pages for websocket/wss/socket: zero hits).
- **Networks:** the API says "Supported networks: 10 (optimism), 42161 (arbitrum), 11155420 (optimism sepolia)" and rejects 8453 (Base) and 1 (H, live). Docs, FAQ and DefiLlama say Base is deployed (volume and TVL on Base). So Base has no documented API route (inconsistency, unresolved).
- **On-chain-only fallback:** per-game odds Merkle roots are on chain (`setRootForGame`), leaves are not, so prices cannot be reconstructed from chain data (M: inferred from the `trade` ABI taking `odds` + `merkleProof` as caller input, H on the ABI, plus the docs sample). Ticket purchases and settlements are public events (trade volume/flow readable). A subgraph definition exists (`thales-markets/thales-subgraph`, `OvertimeV2/schema.graphql`: Market, Ticket, LiquidityPool, LiquidityPoolPnl, BlockedGame; yamls for op, arb, base) but a live hosted endpoint was NOT FOUND (README lists only legacy hosted-service links; not probed further).
- **Contract source repo:** docs link `github.com/thales-markets/contracts-v2` returns 404 on web and via `gh api`; it is absent from the org's public repo list (private or removed). Verified source is on the explorer instead.

Fixtures (all unauthenticated, <=4 KB, truncated samples): `docs/research/fixtures/overtime/` - `sports_sample_2026-10-19.json`, `market_types_sample_2026-10-19.json`, `collaterals_network10_2026-10-19.json`, `collaterals_network42161_2026-10-19.json`, `games_info_sample_2026-10-19.json`, `live_scores_sample_2026-10-19.json`, `protected_endpoints_401_2026-10-19.json`. No market/odds fixture exists because those endpoints are key-gated.

## 4. Chains and collateral

- **Chains (H):** dapp on Optimism, Arbitrum, Base (FAQ). API on Optimism + Arbitrum only. DefiLlama also lists Polygon (legacy products only, per the PR above) and Ethereum/BNB as zero-TVL chains. An Overtime X post says CCIP across Arbitrum/Base/Ethereum/Optimism for OVER (M, search snippet only, https://x.com/overtime_io).
- **Collateral (H, live /collaterals):** Optimism: USDC (default, native `0x0b2C...Ff85`), THALES, sUSD, DAI, USDC.e, USDT, OP, WETH, ETH. Arbitrum: USDC, THALES, USDC.e, DAI, USDT, ARB, WETH, ETH. **OVER is absent from the live API lists** although the docs sample uses OVER (`0xedF3...C63e`, matching CoinGecko's Optimism address). Pools hold USDC/ETH/wBTC/cbBTC (docs). Payout is in the buy-in collateral (multicollateral off-ramp function `exerciseTicketOffRamp` exists on the contract).
- Other OVER addresses (CoinGecko): Ethereum, Base, Arbitrum entries; OVER is the governance and buyback token, not a market collateral for us.

## 5. Trade path

- **Programmatic: yes on chain, but only with gated data.** Pre-match: `SportsAMMV2.trade(tradeData[], buyInAmount, expectedQuote, additionalSlippage, referrer, collateral, isEth)`; also `tradeSGP`, `tradeSystemBet`, `tradeLive`, `tradeQuote` (view) (H: explorer ABI of the verified implementation). `tradeData` carries `gameId, sportId, typeId, maturity, status, line*100, playerId, odds[], merkleProof[], position, combinedPositions, live`, i.e. **the odds and proofs must come from the key-gated `/markets` API** (H: docs sample). Slippage is via `expectedQuote` + `additionalSlippage`.
- **Live betting:** `LiveTradingProcessor.requestLiveTrade(...)` then a Chainlink node fulfils or rejects it; request times out after about 1 minute (configurable); docs recommend polling `requestIdToFulfillAllowed` (H). Asynchronous and can fail on odds moves: poor for a two-leg arbitrage.
- **Auth/signing:** plain EOA transaction (ERC-20 `approve` to the AMM, then `trade`). No EIP-712 signed orders, no off-chain order book, no cancel (positions are bought, not resting). Alternative dapp UX is a Biconomy Nexus smart account with session keys and paymaster; the FAQ also allows "EOA mode" (H: https://docs.overtime.io/learn-about-overtime/overtime-accounts.md, FAQ).
- **Exit before settlement: not documented.** The ABI has `cashoutTicketWithLegOdds` (H), but its conditions and pricing are NOT FOUND in the docs, so no early-exit leg can be assumed.

### PayBox reachability: **partial**

- Chain side is fine: Optimism (10), Arbitrum (42161) and Base (8453) are in the PayBox `discover_tokens` chain catalog, and a PayBox EVM wallet shares one address across all `eip155:*` chains (H, our own earlier notes `docs/research/06-paybox-platform.md`, re-listed 2026-10-19). An EVM `transaction:{to,value,data}` intent is one call per proposal, so USDC `approve` and `trade` are two proposals; the user sees raw calldata only (same notes). Needs ETH for gas on the chosen L2 in EOA mode.
- Blockers are not signing: (a) odds + Merkle proofs need an API key that Overtime says it will not issue for arbitrage or automated trading; (b) calldata must be built from a fresh proof each time and expires as roots roll every few seconds (M); (c) US persons prohibited; (d) human approval latency for each proposal vs. root churn. So reachable in principle for a manual, human-assembled bet; not usable by an automated arb scanner.

## 6. Fees (H unless marked)

- **Protocol fee 2%** on top of oracle odds, funds the fee pool; half of fees from partner/integrator volume is shared with the integrator wallet (https://docs.overtime.io/learn-about-overtime/overtime-amm-and-liquidity-mechanics.md). On chain: `safeBoxFee()` and `safeBoxPerCollateral(...)` views exist; the numeric value was not read (would need `eth_call`, a POST; skipped).
- **OVER collateral:** "reduced margin by design" and "1% extra payouts for each game on the ticket" for tickets paid in OVER (docs). 
- **Skew/discounts:** docs mention "skew and discounts will impact actual profit" (about-odds-providers page, carried from V1; mechanism for V2 NOT FOUND).
- **Speed Markets:** LP fee 10-15% (strike time >= 10 min; shorter buckets show "X" in the docs) plus 2% safe-box; min $3 max $200, risk cap $5,000 per asset per day "will begin at" (docs wording, M that it is current).
- **Gas:** on the bettor; sponsored by paymaster in the smart-account flow (docs). L2 gas is small relative to stake but not zero.
- **Embedded margin:** displayed implied odds sum above 1 (sample 1.056), so the effective hold is several percent per market before parlay compounding (M).
- **Winnings forfeited if not claimed within 90 days of resolution** (H, onchain-market-settlement page).

## 7. Resolution and dispute risk

- **Mechanism:** results come from Chainlink nodes and "designated providers (OpticOdds etc.)", which are "the final authority for all settlements"; usual settlement about 15 minutes, manual review for niche markets (H: https://docs.overtime.io/learn-about-overtime/onchain-market-settlement.md, sports-trading-guidelines general rule 2). Users then claim (or the ticket is resolved) on chain. Corrections allowed for "human or system error" within 72 hours; afterwards final (rule 17).
- **Dispute path:** "Users may escalate irregularities to the Overtime DAO in the Overtime discord" (rule 23). Off-chain, discretionary, no bond or challenge window. $OVER holders govern via Snapshot (OIP-263 dissolved the elected council, June 2026).
- **Operator discretion that matters for arbitrage (H, quoted):** "Overtime may suspend markets, reject, or later void trades if fraudulent activity or an obvious pricing/limit error is detected, including post-acceptance in-play bets that gained a material advantage" and "All wagers are accepted at Overtime's discretion; ... Obvious odds errors may be cancelled" (rules 18, 20). A mispriced-line arbitrage can be voided after the other leg is filled: one-sided risk.
- **Rule mismatches vs other venues (H):** soccer is graded on 90 minutes + stoppage only; extra time and penalties never count, so a tied knockout match resolves DRAW even if a team later wins; tennis retirement = loss for the retiring player on moneyline, other markets void; walkover/forfeit voids; many void/24h-abandonment thresholds; unsettled player props void if the player does not start. Every cross-venue pair needs a rule-equivalence check.
- **Smart-contract risk:** upgradeable proxies (TransparentUpgradeableProxy), implementation source verified on the explorer 2026-09-28; OIP-265 text says AI-assisted exploit discovery is a "survival-level" risk for the protocol (H, OIP-265). Treasury is now the sole LP (see 9), so a book loss or exploit hits one pool.

## 8. Geo / ToS / automation (H quoted sparingly)

- Terms prohibit use "from the United States and its territories or from ... Belarus, Burma, China, Cuba, Democratic Republic of Congo, Iran, Iraq, Liberia, North Korea, Sudan, Syria, and Zimbabwe" or OFAC SDNs (https://docs.overtime.io/resources/terms-of-use.md). Frontend sits behind Cloudflare and returned 403 to scripted fetches (not tested for geo-blocking).
- No explicit ban on bots in the Terms of Use; the exclusion is in the API key policy (arbitrage and automated trading). Contract is permissionless, but see integrity/void clauses in section 7 and "any other conduct that ... may harm Overtime Markets".
- Docs hostnames: `v2.contracts.thales.io` redirects to `v2.contracts.overtime.io`, which started serving Cloudflare "Just a moment" challenges to scripted GETs mid-session; I stopped probing it (no bypass attempted).

## 9. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| Volume 24h / 7d / 30d | $375,192 / $2,140,895 / $7,805,782 | DefiLlama `summary/dexs/overtime`, fetched 2026-10-19 (H) |
| Volume 1y / all-time | $108.9M / $184.5M | same |
| Volume definition | sportsbook stakes + Speed Markets + legacy Thales digital options, excluding free bets and casino; no per-product split published | DefiLlama methodology text + PR #9813 (H) |
| Sample day 2026-09-26 (OP+ARB+Base) | about $264.9K | PR #9813 (H) |
| TVL | $1,303,215 on 2026-10-18 22:19 UTC (Optimism $345K, Arbitrum $503K, Base $440K, Polygon $15K) plus "pool2" $367K tracked separately | `api.llama.fi/protocol/overtime` (H) |
| Fees / house result (incl. casino, Speed) | 24h -$10,021; 7d $78,719; 30d $331,152 | DefiLlama fees, 2026-10-19 (H) |
| Per-position caps | only illustrative: docs liquidity sample `maxStake 1250.5 / liquidity 8400`, quote sample `ticketLiquidityInUsd 19098`; live values require a key (NOT FOUND for current numbers) | docs samples (H that they are samples) |
| OVER token | mcap $10.47M, 24h vol $13.3K, price $0.194 | CoinGecko API, 2026-10-19 00:05 UTC (H) |
| Prior repo note | $0.37M 24h / $2.14M 7d / $7.81M 30d / TVL $1.36M, 2026-10-18 | `docs/research/09-venues-onchain-clob.md` (consistent) |

- **Who provides liquidity:** since OIP-265 the Overtime **treasury is the sole liquidity provider**; the last external LP balances were paid at the 2026-07-20 round close (H: docs + PR #9813). Public LP deposits are closed (reversible by governance). 
- **Shared with another venue? Yes, partly.** "Overtime acts as a market maker on Polymarket, quoting parlay-style Combos through Polymarket's request-for-quote system with the same pricing engine ... and placing the matching exposure on its own book" (H, how-overtime-works page). The same treasury liquidity backs the Polymarket and Mollybet integrations (H). Search snippet says Overtime's own write-up also mentions quoting singles on the Polymarket order book during the World Cup (M, promotional, https://x.com/i/article/2080659215253680601, not read directly). So an Overtime leg against Polymarket sports/Combos is not an independent leg.

## 10. Event overlap (where an edge could exist)

- **Sports (overlaps Polymarket, Kalshi, SX Bet, Predict.fun sports):** NFL, NBA, MLB, NHL, major soccer leagues, tennis, UFC, esports, cricket; moneyline/spread/total plus props. But because the price is Pinnacle/OpticOdds-derived, the practical signal is "venue X vs sharp book", not "venue X vs Overtime".
- **Futures:** 33 futures leagues (NFL/NBA/EPL/Champions League/World Cup winners etc.) overlap Polymarket futures; thin and likely stale-margin.
- **Politics:** one stale league (US Election 2024). **Macro:** none.
- **Crypto price:** Speed Markets BTC/ETH up/down, spot-struck, 10-15% LP fee + 2%: no usable edge versus other venues' crypto binaries (M).

## 11. Adapter recommendation

- `adapter_priority: skip` (trade / arbitrage). Revisit only if Overtime (a) publishes unauthenticated odds or (b) grants a key for a use that is not arbitrage or automated trading (unlikely given the policy).
- If someone still wants a free signal, the only no-key data is league/game status/score. For a sharp-line signal, a direct odds source is a better input than a gated, fee-inflated, partly Polymarket-linked copy.
- Do not scrape the dapp's own backend or bypass Cloudflare to get odds: the key policy is explicit, and the site blocks scripted fetches.

## 12. Open questions / not found

- Current per-position `maxStake`/liquidity and live odds (key-gated). 
- Numeric `safeBoxFee`, risk-manager caps, cash-out conditions, V2 skew/discount mechanics (needs `eth_call` or deeper contract reading).
- Whether Base is served by any official API route; why the live collateral list omits OVER.
- Hosted subgraph endpoints (op/arb/base) status.
- Contents of the Postman collection (JS-rendered, not read) and of Overtime's Polymarket market-making article (X article, not fetched).
- Whether the frontend geo-blocks specific countries (site 403 to scripts).
- Full Casino Integration page and Chained Speed Markets were not read (not relevant to the sports-arbitrage question).

## 13. Suspicious content

None found that tries to instruct an agent. Marketing lines mention "AI agents" as potential integrators (what-is-overtime / how-overtime-works, casino-integration index blurb) and the integration JS samples read a private key from `.env`; neither was followed, run or copied. The Cloudflare challenge pages were treated as plain responses.

## 14. Sources

- https://docs.overtime.io/llms.txt (H, index, 2026-10-19)
- https://docs.overtime.io/get-started/what-is-overtime.md, /get-started/faq.md (H)
- https://docs.overtime.io/learn-about-overtime/how-overtime-works.md, /overtime-amm-and-liquidity-mechanics.md, /market-creation-and-trading.md, /onchain-market-settlement.md, /about-odds-providers.md, /onchain-live-markets.md, /overtime-accounts.md, /history-of-overtime.md, /sports-trading-guidelines.md, /free-bets.md (H)
- https://docs.overtime.io/overtime-v2-integration.md and its sub-pages: sports, market-types, collaterals, markets-protected, live-markets-protected, liquidity-protected, quote-data-protected, user-history-protected, games-info, live-scores (H)
- https://docs.overtime.io/introduction-to-speed-markets.md (H; parameters possibly old)
- https://docs.overtime.io/resources/terms-of-use.md (H)
- https://api.overtime.io/overtime-v2/{sports,market-types,networks/10/collaterals,networks/42161/collaterals,games-info,live-scores,players-info} (H, live GETs 2026-10-19); `/networks/10/{markets,live-markets,liquidity}` -> 401 (H)
- https://explorer.optimism.io/api/v2/addresses/0xFb4e4811C7A811E098A556bD79B64c20b479E431 (+ transactions, counters), /addresses/0x3b834149F21B9A6C2DDC9F6ce97F2FD1097F8EAB, /smart-contracts/0xf33a30d256a1FEbBee39D5A369eE9fA8835986B5 (H)
- https://api.llama.fi/protocol/overtime, /summary/dexs/overtime, /summary/fees/overtime (H, 2026-10-18/19)
- https://github.com/DefiLlama/dimension-adapters/pull/9813 (H via page summary; developer discussion, M on interpretation)
- https://api.coingecko.com/api/v3/coins/overtime (H for CoinGecko's figures)
- https://github.com/thales-markets/overtime-improvement-proposals (OIP-265 file, `gh api` raw, H); https://github.com/thales-markets/thales-subgraph (`OvertimeV2`, H); https://github.com/thales-markets/contracts-v2 (404, H)
- WebSearch snippets (M): https://x.com/overtime_io, https://predictwire.io/overtime-markets/, https://signals.coincodecap.com/overtime-markets-review, https://x.com/i/article/2080659215253680601
- Repo cross-refs: `docs/research/09-venues-onchain-clob.md` (volume table), `docs/research/06-paybox-platform.md` (PayBox chains and proposal shape).
