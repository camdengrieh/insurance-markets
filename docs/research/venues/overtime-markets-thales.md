# Overtime Markets (Thales) - venue spec for the cross-venue aggregator / arbitrage scanner

Researched 2026-10-19 (probes ~01:40-01:50 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts (api.overtime.io, explorer.optimism.io Blockscout, api.llama.fi, the public Postman collection JSON). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party text is untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

Note on overlap: an earlier note exists at `docs/research/venues/overtime.md` (fixtures in `docs/research/fixtures/overtime/`). This file re-verified its key claims independently and corrects/extends it (section 13). WebSearch was unavailable (session budget exhausted), so no web-search snippets were used.

---

## 0. Bottom line

- **Live: yes (H).** Details in section 1.
- **adapter_priority = skip.** Each reason is independently sufficient:
  1. Every price-bearing endpoint (markets/odds, live markets, liquidity, quote) needs an approved `x-api-key`, and the integration overview says in bold "The Overtime API is not intended for experimental, personal, arbitrage or any sorts of automated trading projects" (H, https://docs.overtime.io/overtime-v2-integration.md). A cross-venue arbitrage scanner is exactly the excluded use.
  2. On chain only the Merkle **root** of each game's odds is stored; the per-position odds and the proofs needed to trade come from the gated API. So there is no on-chain-only way to read a quotable price (section 3).
  3. Prices are not independent price discovery: the AMM takes implied probabilities from global sharp-book odds feeds (OpticOdds/Pinnacle-class) and adds a fee. Overtime also market-makes on Polymarket with the same book (shared exposure, section 9).
  4. Thin: DefiLlama TVL about $1.27M and about $0.35M/day volume (which also includes Speed Markets), per-position caps tiny (section 9).
  5. Terms prohibit the United States and its territories (H).
- Only open, unauthenticated surface is league/game status/score metadata, which is a result feed, not a price feed. Not worth an adapter by itself.

---

## 1. Is it still live? (2026)

| Check | Result | Tag / source |
|---|---|---|
| Docs site | Reachable; pages reference OIP-263 and OIP-265 (June 2026) | H, https://docs.overtime.io/llms.txt, /get-started/faq.md |
| API `games-info` | 28,905 games; max `lastUpdate` 2026-10-19 01:42:07 UTC; 5,552 not finished; status counts completed 22,980 / unplayed 4,412 / "" (futures) 1,053 / cancelled 373 / delayed 59 / live 25 / suspended 3 | H, https://api.overtime.io/overtime-v2/games-info (GET 2026-10-19) |
| API `live-scores` | 2,857 entries; max `lastUpdate` 2026-10-19 01:44:19 UTC | H, https://api.overtime.io/overtime-v2/live-scores |
| Optimism Sports AMM V2 proxy | Odds-root txs (`setRootForGame` x39, `setRootsPerGames` x7, `setPackedRootsPerGamesAndTypes` x4) in the 50 latest txs spanning 01:37:29-01:45:09 UTC; latest log page contains 5 `TicketCreated`, 5 `NewTicket`, 5 `TicketResolved`, 5 `SafeBoxFeePaid`; 8,794,160 lifetime txs; implementation `SportsAMMV2` verified 2026-09-28 | H, https://explorer.optimism.io/api/v2/addresses/0xFb4e4811C7A811E098A556bD79B64c20b479E431 (+ `/transactions`, `/counters`, `/logs`), `/smart-contracts/0xf33a30d256a1FEbBee39D5A369eE9fA8835986B5` |
| GitHub org `thales-markets` | `promo-assets` pushed 2026-10-16, `overtime-live-trading-utils` 2026-10-12, `thales-io-dapp` 2026-08-27, `community-bots-v2` 2026-08-24 | H, `gh api orgs/thales-markets/repos?sort=pushed` |
| DefiLlama | Listed as category "Prediction Market"; volume and TVL current to 2026-10-19 | H, https://api.llama.fi/summary/dexs/overtime, /protocol/overtime |
| Main site `https://www.overtimemarkets.xyz/` | Cloudflare 403 "Attention Required" to scripted GET (also noted in the task hint). Not retried, not bypassed. | H (the 403) |
| Governance events | Council dissolved by OIP-263 and external LP ended by OIP-265, both June 2026 | H, FAQ; OIP file still says `Status: Draft` (created 2026-06-22) while docs and DefiLlama methodology say it took effect 2026-07-21 (stale repo file) |

Verdict: **still_live = true.** Odds roots are pushed every few seconds, live tickets are being created and resolved on chain right now.

---

## 2. Kind and market model

- **Kind (H):** on-chain sports betting AMM ("Pool-vs-Peer"). The treasury-funded liquidity pool is the counterparty. No order book, no peer matching, no secondary market. (https://docs.overtime.io/learn-about-overtime/how-overtime-works.md: "Pool-vs-Peer liquidity layer supported by a custom Automated Market Maker".) Other products under the brand: **Speed Markets** (BTC/ETH UP/DOWN digital options, strike = spot at purchase so every position is 50:50, 1 min to 24 h, Pyth Benchmarks; https://docs.overtime.io/introduction-to-speed-markets.md) and **Overtime Casino** (13 VRF games). Neither is a cross-venue arbitrage candidate.
- **Pricing (H):** "sources implied probabilities for each market directly from global odds providers" and brings them on chain via Chainlink oracle nodes (https://docs.overtime.io/learn-about-overtime/overtime-amm-and-liquidity-mechanics.md). `/sports` shows `provider: opticOdds` on 587 of 651 leagues (H, live GET). Each market has "a predefined risk limit" for directional exposure; once hit on one side the AMM stops offering that side (same page). No closed-form skew/discount formula (NOT FOUND, searched: amm-and-liquidity-mechanics, about-odds-providers, market-creation-and-trading).
- **Structure:** game (bytes32 `gameId`, hex of an ASCII id such as `20261019F9CEA2D8`) -> many markets by `typeId` (950 market types, e.g. 0 winner, 10001 spread, 10002 total, double chance, BTTS, draw-no-bet, player props, futures) -> 2 or 3 positions (home/away/draw, over/under, yes/no; futures have N named positions). Parlays, same-game parlays and system bets exist. Positions are **not categorical/binary tokens with a price in [0,1]**: the quoted price is a bookmaker-style implied probability that includes margin and is not guaranteed to sum to 1 (Postman doc example sums to 1.072; M, doc example from 2025-09).
- **Tokenisation (H):** V1 minted ERC-20 position tokens; **V2 does not** ("The move away from tokenized markets", https://docs.overtime.io/learn-about-overtime/history-of-overtime.md). A bet creates a per-bet ticket contract (`TicketCreated(ticket, recipient, buyInAmount, fees, payout, totalQuote, collateral)` events; `ticketMastercopy` in the ABI). Payout observed in 5 live events = `buyInAmount / totalQuote` exactly (e.g. 5,300,000 / 0.505050505051 = 10,493,999).
- **Early exit:** `cashoutTicketWithLegOdds` exists in the verified ABI (H) but its conditions and pricing are NOT FOUND in docs (searched: market-creation-and-trading, how-overtime-works, FAQ, integration pages). Do not assume an exit leg.

---

## 3. Read API

**Official but split: a few public metadata endpoints; every price-bearing endpoint is key-gated.** Docs: https://docs.overtime.io/overtime-v2-integration.md (index https://docs.overtime.io/llms.txt); Postman: https://documenter.getpostman.com/view/1435701/2sA3XY5Hao (collection JSON read via documenter.gw.postman.com, H). Base URL `https://api.overtime.io` (H). Header for gated routes: `x-api-key`.

| Endpoint | Live result 2026-10-19 (unauth GET) | Content |
|---|---|---|
| `GET /overtime-v2/sports` | 200, 172 KB | 651 leagues keyed by id: sport, provider, scoringType, matchResolveType, periodType, isDrawAvailable, hidden, label, optional `initialSport` |
| `GET /overtime-v2/market-types` | 200, 165 KB | 950 market-type definitions keyed by typeId with outcome names |
| `GET /overtime-v2/networks/{10,42161}/collaterals` | 200 JSON | symbol, address, decimals, default |
| `GET /overtime-v2/networks/8453/collaterals` | 200 text/html "Unsupported network. Supported networks: 10 (optimism), 42161 (arbitrum), 11155420 (optimism sepolia)." | Base is NOT served by the API |
| `GET /overtime-v2/games-info[/{gameId}]` | 200, **10.7 MB** (whole table, no filter seen) | teams, scores, scoreByPeriod, gameStatus, isGameFinished, tournamentName, positionNames (futures) |
| `GET /overtime-v2/live-scores[/{gameId}]` | 200, 649 KB | period, clock, scores |
| `GET /overtime-v2/players-info[/{id}]` | listed in Postman (not fetched this run) | player names |
| `GET /overtime-v2/networks/{id}/markets[/{gameId}]` | **401** `{"error":"Unauthorized: Invalid API key"}` (also for 42161 and 8453; auth runs before network validation) | odds[].decimal/american/normalizedImplied, Merkle `proof[]`, child markets, status; params `responseHash`+`includeHashInResponse` ("no change" polling), `onlyBasicProperties`, `includeProofs`, filters |
| `GET /overtime-v2/networks/{id}/live-markets` | **401** | live moneyline odds with scores/clock |
| `GET /overtime-v2/networks/{id}/liquidity` | **401** (docs: refresh about every 5 min) | per position key `gameId\|sportId\|typeId\|playerId\|line\|position` -> `maxStake`, `liquidity` (USDC) |
| `POST /overtime-v2/networks/{id}/quote` (+ system-bet quote) | not called (POST) | `totalQuote`, payout, `ticketLiquidityInUsd` |
| `GET /overtime-v2/networks/{id}/users/{addr}/history` | key required per docs | tickets by status |

- **Key policy (H, quoted):** "Access to the Overtime API is restricted and requires an approved API key. API keys are issued only to teams or organizations that can clearly demonstrate how their intended use ... delivers meaningful value to Overtime, its users, or its ecosystem." Plus "not intended for experimental, personal, arbitrage or any sorts of automated trading projects". Per-endpoint pages use a slightly different line ("experimental, hobbyist, or small personal projects"). No application channel is described in the docs (NOT FOUND, searched: integration overview and sub-pages).
- **Rate limits (H):** prematch "One request per league every 5 seconds"; live "One request for all leagues every 2 seconds"; keys may be blacklisted. Limits for the public endpoints: NOT FOUND.
- **WebSocket:** NOT FOUND (searched: all integration pages, Postman collection endpoint list: REST only).
- **Documented response shapes** for the gated routes (not live, doc examples): fixture `postman_doc_examples_gated_endpoints_2026-10-19.json`. The liquidity example carries `lastUpdate` 2026-10-02 with `maxStake` 9.19 / `liquidity` 36.81 USDC for one position (M: may be a real capture; shows how small caps get).
- **On-chain read path (H):** ticket purchases and settlements are public events (`NewTicket` carries gameId, typeId, line, position, odds as executed, `isLive`), so an executed-trade tape is readable from any Optimism/Arbitrum/Base RPC. That is a delayed trade feed, not a quotable book, and the contract's `tradeQuote` view still needs the odds+proof tuple that comes from the gated API. A subgraph definition exists in `thales-markets/thales-subgraph` (last push 2026-03-06); a live hosted endpoint was NOT FOUND (not probed).
- **Contract source repo:** docs link `github.com/thales-markets/contracts-v2`, which returns 404 via `gh api` (H); verified source is on the Optimism explorer instead.

Fixtures (all under `docs/research/fixtures/overtime-markets-thales/`, each well under 50 KB, compacted subsets with an explicit `_fixture_note`): `sports_sample_2026-10-19.json`, `market_types_sample_2026-10-19.json`, `collaterals_network10_2026-10-19.json`, `collaterals_network42161_2026-10-19.json`, `games_info_sample_2026-10-19.json`, `live_scores_sample_2026-10-19.json`, `gated_endpoints_401_2026-10-19.json`, `optimism_sportsamm_recent_events_2026-10-19.json` (bettor/ticket addresses redacted), `defillama_overtime_summary_2026-10-19.json`, `postman_doc_examples_gated_endpoints_2026-10-19.json` (documentation examples, NOT live). No odds/market fixture of live data exists because those endpoints are key-gated.

---

## 4. Chains and collateral

- **Chains (H):** FAQ: "deployed on Optimism, Arbitrum and Base". API serves only Optimism (10), Arbitrum (42161) and Optimism Sepolia. DefiLlama TVL split (2026-10-19 00:54 UTC): Arbitrum $502k, Base $439k, Optimism $315k, Polygon $14.7k (legacy), plus "pool2" $370k.
- **Collateral (H, live `/collaterals`):** Optimism: USDC (default, `0x0b2C...Ff85`), THALES, sUSD, DAI, USDC.e, USDT, OP, WETH, ETH. Arbitrum: USDC (default, `0xaf88...5831`), THALES, USDC.e, DAI, USDT, ARB, WETH, ETH. The docs examples use $OVER (`0xedF3...C63e` on Optimism) but OVER is absent from the live collateral lists (unexplained). Pools hold USDC/ETH/WBTC/cbBTC (H, DefiLlama token breakdown: USDC $864k, WETH $269k, WBTC $61k, cbBTC $40k).
- Payout in the buy-in collateral; a multicollateral off-ramp (`exerciseTicketOffRamp`) exists in the ABI.

---

## 5. Trade path

- **Programmatic: yes on chain, but only with gated data.** Pre-match: `SportsAMMV2.trade(tuple[] _tradeData, uint256 _buyInAmount, uint256 _expectedQuote, uint256 _additionalSlippage, address _referrer, address _collateral, bool _isEth)` (payable); also `tradeSGP`, `tradeSystemBet`, `tradeQuote` (view). (H, explorer ABI of the verified implementation.) `_tradeData` carries gameId, sportId, typeId, maturity, status, line, playerId, **odds[] and merkleProof[]**, position: these come from the key-gated `/markets` response (H, integration doc flow steps 1-6).
- **Live:** `LiveTradingProcessor.requestLiveTrade(...)` (address `0x3b834149F21B9A6C2DDC9F6ce97F2FD1097F8EAB` on Optimism, H docs) -> Chainlink node fulfils or rejects; asynchronous, fails if odds move (H, https://docs.overtime.io/learn-about-overtime/onchain-live-markets.md). Poor fit for a two-leg arbitrage.
- **Auth/signing:** plain EOA transaction (ERC-20 approve, then `trade`). No EIP-712 signed orders, no resting orders, no cancel. Dapp alternative is a Biconomy smart account with session keys and paymaster; EOA mode also allowed (H, https://docs.overtime.io/learn-about-overtime/overtime-accounts.md, FAQ).

### PayBox reachability: **partial**

- Chain side fine: Optimism (10), Arbitrum (42161) and Base (8453) are in PayBox's `discover_tokens` chain catalog and a PayBox EVM wallet shares one address across `eip155:*` (H, our own notes `docs/research/06-paybox-platform.md`, re-listed 2026-10-19). An EVM `transaction:{to,value,data}` proposal is one call per proposal, so `approve` and `trade` are two proposals and the user sees raw calldata only (same notes).
- Blockers are not signing: (a) odds + Merkle proofs need a key Overtime says it will not issue for arbitrage/automated trading; (b) calldata must embed a fresh proof and roots roll every few seconds (M), while each PayBox proposal needs human approval; (c) US persons prohibited; (d) Base has no API route at all. Reachable in principle for one manually assembled bet, not for an automated arb leg.

---

## 6. Fees

- **Protocol fee: "currently set at 2%"** funding the Overtime fee pool; half of fees from partner-driven volume go to the integrator (H, amm-and-liquidity-mechanics page). Tickets paid in $OVER get "reduced margin by design" and "1% extra payouts for each game" (H, same page; integration doc).
- **On-chain observation (H, 5 live tickets in `TicketCreated` events, 2026-10-19):** `fees` was exactly 1.00% of `buyInAmount` each time (53,000 on 5,300,000 etc.) and `SafeBoxFeePaid.safeBoxFee` = `10000000000000000`. This does not match the docs' 2%. Unresolved: NOT FOUND (searched: all fetched docs pages for V2 fee mechanics; the numeric `safeBoxFee()` view needs a JSON-RPC `eth_call` which I did not issue). Who bears the fee (on top of stake vs inside quote) is also not determinable: payout equalled `buyIn/totalQuote` exactly.
- **Embedded margin:** the quoted implied probabilities carry the bookmaker's margin (doc example sums to 1.072; M). Net edge needs overround removal before comparing with any other venue.
- **Speed Markets:** protocol fee 2% plus an LP fee of 10-15% by strike time (1-9 min rows show "X" in docs); min buy-in $3, max $200 (H, doc; parameters may be old).
- **Gas:** on the bettor in EOA mode; sponsored by paymaster in the smart-account flow (H, accounts page). Unclaimed winnings are **forfeit after 90 days** (H, https://docs.overtime.io/learn-about-overtime/onchain-market-settlement.md).

---

## 7. Resolution and dispute risk

- **Mechanism (H):** "Data received from Chainlink nodes and designated providers (OpticOdds etc.) serves as the final authority for all settlements"; usual settlement about 15 minutes, manual review for niche markets (https://docs.overtime.io/learn-about-overtime/sports-trading-guidelines.md rule 2; onchain-market-settlement page). Winners claim on chain.
- **Dispute path:** "Users may escalate irregularities to the Overtime DAO in the Overtime discord" (rule 23): off-chain, discretionary, no bond or challenge window. Settlements are final after 72 hours; corrections only for human or system error in that window (rule 17).
- **Operator discretion that matters for arbitrage (H, quoted):** "Overtime may suspend markets, reject, or later void trades if fraudulent activity or an obvious pricing/limit error is detected, including post-acceptance in-play bets that gained a material advantage" (rule 18) and "All wagers are accepted at Overtime's discretion ... Obvious odds errors may be cancelled" (rule 20). A mispriced-line arb leg can be voided after the other leg is filled: one-sided risk.
- **Rule mismatches vs other venues (H):** soccer graded on 90 minutes + stoppage only, extra time and penalties never count (a tied knockout resolves DRAW); tennis retirement = moneyline loss for the retiring side, other markets void; walkover/forfeit voids; 24-hour postponement and abandonment thresholds void unsettled markets; player props void if the player does not start. Every cross-venue pair needs a rule-equivalence check.
- **Smart-contract risk (H):** upgradeable proxy; OIP-265 itself calls a single large exploit "a survival-level event" given AI-assisted exploit discovery, and the treasury is now the sole LP, so a book loss or exploit hits one pool.

---

## 8. Geo / ToS / automation

- Terms of Use (undated page, possibly stale; H, https://docs.overtime.io/resources/terms-of-use.md) prohibit use "if they are a citizen of or otherwise accessing Overtime Markets from the United States and its territories or from the nations of Belarus, Burma, China, Cuba, Democratic Republic of Congo, Iran, Iraq, Liberia, North Korea, Sudan, Syria, and Zimbabwe", OFAC SDNs, and "any other conduct that ... may harm Overtime Markets".
- **No explicit bot or arbitrage ban in the Terms** (searched the page); the exclusion lives in the API key policy (section 3). The contracts themselves are permissionless, but sections 6-7 show void and rejection rights.
- The dapp sits behind Cloudflare and returned 403 to scripted GETs; I did not test geo-blocking and did not look for any way around the block. Do not scrape the dapp's backend.

---

## 9. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| Volume 24h / 7d / 30d | $354,402 / $2,177,080 / $7,937,062 | DefiLlama `summary/dexs/overtime`, fetched 2026-10-19 (H) |
| Volume 1y / all-time | $108.6M / $184.5M | same |
| Volume definition | Sportsbook stakes + Speed Markets + legacy digital options; excludes free bets and casino; no per-product split published | DefiLlama methodology field (H) |
| TVL | $1,270,403 at 2026-10-19 00:54 UTC (Arbitrum $502k, Base $439k, Optimism $315k, Polygon $15k); plus pool2 $370k tracked separately | `api.llama.fi/protocol/overtime` (H) |
| House result (incl. casino, Speed) | 24h -$1,953; 7d $45,031; 30d $364,754 | DefiLlama fees, 2026-10-19 (H) |
| Per-position depth | Doc example (lastUpdate 2026-10-02): maxStake $9.19 / liquidity $36.81 on one position; live values need a key (NOT FOUND for current numbers) | Postman collection (M) |
| Observed live tickets | Five Optimism tickets in one block range: buy-ins $3.22-$6.29, payouts about $10.4-$11.3 | `TicketCreated` events 2026-10-19 (H) |
| OVER token | market cap $10.48M | DefiLlama protocol field, 2026-10-19 (H) |
| Earlier repo estimate | 24h $0.37M, 7d $2.14M, 30d $7.81M, TVL $1.36M on 2026-10-18 | `docs/research/09-venues-onchain-clob.md` (consistent) |

- **Who provides liquidity:** the Overtime **treasury is the sole LP** (since OIP-265; DefiLlama says from 2026-07-21). External deposits closed (H, FAQ, amm-and-liquidity-mechanics page, DefiLlama methodology).
- **Shared with another venue? Yes, partly (H).** "Overtime acts as a market maker on Polymarket, quoting parlay-style Combos through Polymarket's request-for-quote system with the same pricing engine it uses on its own platform, and placing the matching exposure on its own book." (https://docs.overtime.io/learn-about-overtime/how-overtime-works.md). OIP-265 also names the "Polymarket and Mollybet integrations" as drawing on treasury liquidity (H, `gh api` raw of OIPs/OIP-265.md). So an Overtime-vs-Polymarket sports/Combos pair is **not an independent leg**. The extent of Polymarket single-market quoting is not documented (the X article cited by an earlier note returned HTTP 402 to WebFetch; no payment requirements were retrievable; I stopped there).

---

## 10. Event coverage and overlap (where arbitrage could exist)

- **Sports (overlaps Polymarket, Kalshi, SX Bet, Predict.fun sports; H, live `/sports`):** 651 leagues: Soccer 365, Basketball 62, Volleyball 47, Futures 33, Hockey 29, Handball 22, eSports 15, Darts 12, Cricket 11, Tennis 9, Baseball 8, Rugby 8, Table tennis 6, American football 4, Fighting 4, others small; 26 hidden. Moneyline/spread/total plus props. Practical value is "venue X versus the sharp book Overtime copies", not "venue X versus Overtime".
- **Futures:** 33 futures leagues (NFL/NBA/MLB/NHL/EPL/UCL/World Cup winners, F1, golf, etc.); 1,053 unfinished futures entries in `games-info`. Overlap with Polymarket futures; likely thin and with stale margin.
- **Politics (correction to earlier note):** `/sports` has two **non-hidden** futures leagues with `initialSport: Politics`: "United States Politics" (39993) and "United Kingdom Politics" (39994), alongside the hidden stale "US Election 2024" (20000). `games-info` futures entries list candidate/party names (e.g. Democrat/Republican/Independent, large US candidate lists, UK parties) (H for the names, M for what the questions are; question text and prices are key-gated).
- **Macro:** none found. **Crypto price:** only Speed Markets (BTC/ETH, spot-struck 50:50, 12-17% total fees): no usable edge versus other venues' crypto binaries (M).

---

## 11. Adapter recommendation

- `adapter_priority: skip`. Revisit only if Overtime (a) publishes unauthenticated odds or (b) grants a key for a purpose other than arbitrage/automated trading (unlikely given the stated policy).
- If a free signal is wanted, only no-key data is league/game status/score (`sports`, `games-info`, `live-scores`), with the caveat that `games-info` is a 10.7 MB full dump per call.
- A weak optional signal: the public on-chain executed-ticket tape (`NewTicket`/`TicketCreated`), delayed and thin, only worth it if an EVM log indexer already exists.

---

## 12. Open questions / not found

- Live odds, per-position `maxStake`/liquidity (key-gated).
- Why docs say 2% protocol fee while events show 1% `fees`; numeric `safeBoxFee()`; V2 skew/discount mechanics; cash-out conditions (`cashoutTicketWithLegOdds`).
- Whether Base is served by any official API route (API rejects 8453; DefiLlama shows Base TVL $439k).
- Why OVER is missing from the live collateral lists.
- Extent of Overtime's quoting on Polymarket beyond Combos.
- Geo-blocking behaviour of the frontend (403 to scripts).
- Terms of Use date (page undated).

## 13. Differences from the earlier note `docs/research/venues/overtime.md`

Confirmed: gated API and "arbitrage" exclusion, Optimism/Arbitrum-only API, treasury sole LP, Polymarket market-making, US prohibition, skip verdict. New or corrected here: (1) politics futures leagues are live (not only the stale 2024 election); (2) on-chain `fees` = 1.00% in the sampled events vs docs 2%; (3) `networks/8453/markets` returns 401 (auth first), while `/8453/collaterals` states Base is unsupported; (4) volume/TVL refreshed (24h $354k, TVL $1.27M); (5) Postman collection read (endpoint list matches; markets example is from 2025-09, liquidity example from 2026-10-02); (6) executed-ticket tape on chain is readable (trade-path sizes observed); (7) OIP-265 text re-read: names Polymarket and Mollybet integrations.

## 14. Suspicious content

None that tried to instruct an agent. Notes: the docs' marketing copy says a developer API lets "wallets, AI agents, and aggregators" connect (not followed; the same docs gate the API against automated trading). The integration JS samples read a private key from `.env` (not run, not copied). The Postman collection has an example URL with a placeholder `x-api-key=11111111-1111-1111-1111-111111111111` query parameter for the system-bet quote: not used. The X article link returned HTTP 402; nothing paid.

## 15. Sources

- https://docs.overtime.io/llms.txt (H, index)
- https://docs.overtime.io/overtime-v2-integration.md and sub-pages: overtime-v2-markets-protected, overtime-v2-live-markets-protected, overtime-v2-liquidity-protected (H, full text via curl .md)
- https://docs.overtime.io/learn-about-overtime/how-overtime-works.md, /overtime-amm-and-liquidity-mechanics.md, /market-creation-and-trading.md (page summary via WebFetch, M-H), /onchain-market-settlement.md, /onchain-live-markets.md, /history-of-overtime.md, /overtime-accounts.md, /sports-trading-guidelines.md (H)
- https://docs.overtime.io/get-started/faq.md, /resources/terms-of-use.md, /introduction-to-speed-markets.md (H)
- https://api.overtime.io/overtime-v2/{sports,market-types,networks/10/collaterals,networks/42161/collaterals,networks/8453/collaterals,games-info,live-scores} (H, live GETs 2026-10-19); `/networks/{10,42161,8453}/markets`, `/networks/10/{live-markets,liquidity}` -> 401 (H)
- https://documenter.gw.postman.com/api/collections/1435701/2sA3XY5Hao (public Postman collection JSON behind https://documenter.getpostman.com/view/1435701/2sA3XY5Hao; H for endpoint list, doc examples only)
- https://explorer.optimism.io/api/v2/addresses/0xFb4e4811C7A811E098A556bD79B64c20b479E431 (+ /transactions, /counters, /logs) and /api/v2/smart-contracts/0xf33a30d256a1FEbBee39D5A369eE9fA8835986B5 (H)
- https://api.llama.fi/protocol/overtime, /summary/dexs/overtime, /summary/fees/overtime (H, 2026-10-19)
- https://github.com/thales-markets/overtime-improvement-proposals (OIPs/OIP-265.md via `gh api` raw, H); `gh api orgs/thales-markets/repos` (H); https://github.com/thales-markets/contracts-v2 (404, H)
- https://www.overtimemarkets.xyz/ (403 Cloudflare, H); https://x.com/i/article/2080659215253680601 (HTTP 402, content not retrieved)
- Repo cross-refs: `docs/research/09-venues-onchain-clob.md` (volume table), `docs/research/06-paybox-platform.md` (PayBox chains and proposal shape), `docs/research/venues/overtime.md` (earlier note)
