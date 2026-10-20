# PFWA Markets (pfwa.fun, Robinhood Chain) - adapter spec

Researched 2026-10-19 (~00:10-00:45 UTC). READ-ONLY: unauthenticated GETs to pfwa.fun, DefiLlama, Sourcify; `gh api` raw file reads; one read-only PayBox `discover_tokens` (chains catalog) call. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE (so no JSON-RPC `eth_call`, see section 4), no browser automation. No third-party code cloned, installed or run. The public JS bundle was only grepped as text.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred/derived; **L** = weak or stale (>6 months).
Third-party text (site, llms.txt, repos, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/pfwa-markets/` (4 files, 80 B to 17 KB).

## 0. Verdict

**adapter_priority: skip** (revisit as a cheap read-only P2 "signal" entry only if TVL grows by about 2 orders of magnitude).

1. Live but tiny (H): TVL 0.142 ETH (about $341), 7-day volume 0.197 ETH (about $472), all-time volume 2.31 ETH (about $5.6K), 40 traders, 10 live markets, largest live pool 0.018 ETH (about $44). Source: the site's own analytics JSON, 2026-10-19 00:20Z; DefiLlama agrees ($340 TVL, 7d volume $381).
2. **The instrument is not a $1-bounded claim.** Each outcome is a linear bonding-curve ERC-20 and a winning share pays `(all ETH in the market) / (winning supply)`, a variable amount. The marginal break-even probabilities of the outcomes sum to about **2.0** in every live market (section 2), the early-exit penalty is 10%, and the creator can resolve at any time. There is no clean arbitrage leg against Polymarket/Kalshi here; at best it is a long-tail "parimutuel with early-bird advantage" where a few dollars of edge might exist on thinly backed outcomes.
3. API is first-party but **undocumented** (Next.js `/api/*` routes behind Vercel); no WebSocket, no subgraph, no official docs for it (H, NOT FOUND elsewhere). Canonical data is on-chain (verified contracts), but reading it needs JSON-RPC (POST).
4. Independent liquidity (not a mirror, not shared), but irrelevant at this size.
5. PayBox can reach it (Robinhood Chain 4663 is in PayBox's chain catalog; buy/sell/claim are single-call EVM transactions), so nothing blocks integration except economics.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site analytics `updatedAt` | 2026-10-19T00:20:41Z; daily volume 2026-10-18 = 0.0545 ETH over 25 trades; 2026-10-16 = 0.0246 ETH / 24 trades | H (`/api/analytics/protocol`) |
| Latest market created | id 100108 (PFWA market-cap target), created 2026-10-18T18:59Z; id 100107 (Premier League match) created 2026-10-18T15:31Z | H (`/api/markets/live` `oracleData.createdAt`) |
| Last trade seen on market 100107 | 2026-10-18T17:49:30Z | H (fixture) |
| Changelog | newest entry 2026-10-18 (La Liga, Serie A, Bundesliga, Ligue 1 match markets); 23 entries since 2026-09-27 | H (`/changelog`, `/changelog.xml`) |
| Contracts | V1 factory live 2026-07-31 (first market), V2 factory first market 2026-08-31; 201 markets across both (analytics) | H (repo README, DefiLlama helper, analytics) |
| DefiLlama | listed 2026-10-15 (`listedAt` 1792093444 = 2026-10-15T19:44Z; adapter PR #21623 merged 2026-10-15; dimension PR #10164 was closed unmerged, yet `api.llama.fi` already serves dexs/fees/OI dimensions for the slug) | H (GitHub API, api.llama.fi) |
| Chain | Robinhood Chain mainnet, chain ID 4663, Arbitrum Orbit L2, ETH gas, public mainnet since 2026-07-01 per RPC-provider docs | M (WebSearch; repo README gives chainId 4663 and RPC host) |

Operator: independent, "not affiliated with Robinhood" (H, site + llms.txt). Single developer GitHub account `MirakoolDev`; repos created 2026-09-11 (contracts) and later (Sherwood); the contracts repo is a public extraction of a private monorepo (H, README).

## 2. What it is

- **Kind**: onchain-amm (bonding curve per outcome). Closest analogy: pump.fun-style curve per outcome combined with a parimutuel payout.
- **Market model (H, README + verified source + live data)**
  - Binary or categorical, 2 to 10 options. `MarketType` BINARY / MULTI_OPTION / CUSTOM. UI market types: Target (YES if a token's price, FDV or 24h volume touches a target before the deadline), Versus (2 to 5 tokens, highest value at deadline), Onchain (DefiLlama TVL / daily fees), Football (Home/Draw/Away, 90 min or full time incl. ET + pens for Champions League), RWA, legacy "Challenge" (FOMO trader PnL, no longer creatable).
  - No order book, no counterparty. Every option is its own EIP-1167 clone of `BondingCurveToken` (ERC-20, 18 decimals). `spotPrice(S) = basePrice + slope * S` with `basePrice = slope = 3e-8 ETH` per whole share (defaults; I confirmed the live curve still matches these: seed buy of 0.0005 ETH on 2026-10-18 gave 181.577 shares and a post-trade spot of 5.477e-6 ETH, fixture `market_100107_trades.json`).
  - Reserve per option (ETH held by the token contract): `R(S) = basePrice*S + slope*S^2/2`. Verified against live `ethBalances` and `totalSupply` of all 10 live markets to 6 decimals (M, derived from H data).
  - **Payout**: on resolution all losing reserves plus the market's bonus pot move to the winning token; `fixedRedemptionPrice = Pool / winningSupply`; each winning share claims that amount. Losing shares pay 0. If nobody holds the winner, the pool goes to the treasury.
  - **Displayed "chance"** (`outcomes[].chance`) = the option's share of the market's ETH (reserve share), "where the money is, not a promise of what you'll be paid" (H, docs). It is not a price of a $1 claim.
  - **Marginal break-even probability** for a buyer of option i (ignoring fees and the buyer's own pool impact): `q_i* = spot_i * S_i / Pool`. Since `spot*S` is about `2R` once the slope term dominates, `sum_i q_i* is about 2.0`. Computed on the 10 live markets (2026-10-19): sums 1.989 to 1.998. Example, market 100107 (Tottenham vs Coventry, pool 0.01825 ETH): reserve-share 21/13/67%, break-even 0.41/0.25/1.33 (the favourite is never +EV at the margin; the long shots are the only place an edge can exist). The project's own market-making agent trades exactly this (reported settled ROI 602% on 0.0095 ETH spent, a tiny sample; H, analytics `mmAgent`).
  - Consequence for the aggregator: do **not** feed `chance` or spot price into a consensus-probability comparison as if it were a quote. If ever integrated, expose per-outcome `{reserve_share, spot, supply, break_even_prob(notional)}` and let the scanner treat PFWA as an EV-vs-consensus signal, never as a hedge leg (payoff unbounded above, entry path dependent, exit costs 10%).
- **Collateral**: native ETH on Robinhood Chain only (H). The UI can swap USDG (or $PFWA) to ETH before a buy and swap payouts to $PFWA, which is front-end/router logic, not part of the market contracts (H, changelog 2026-09-29/10-01/10-03, docs).
- **Products around it** (out of scope): Sherwood (a PvP game on Uniswap v4 hooks), Credence (token deployer tied to Polymarket questions, M from DefiLlama PR text), $PFWA token (0xa934bA4F59070149d37A93F8A002Af79BAe35563).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official API docs / OpenAPI | **NOT FOUND** (searched: pfwa.fun/docs and its RSC payload, `/llms.txt`, repo READMEs, changelog + RSS, JS bundle strings; docs describe product and fees only, and state no API, subgraph or indexer) | H |
| First-party JSON routes `https://www.pfwa.fun/api/*` (apex `pfwa.fun` 308-redirects to `www`) | Public, no auth, no key; robots.txt does not disallow them (robots disallows only `/admin`, `/api/admin`, `/preview`, `/favicon-generator`, `/markets-old`). Undocumented: found by grepping the public bundle for `fetch("/api/..")`. Can change without notice. | H (GET) / L (stability) |
| WebSocket / SSE | **NOT FOUND** (no `wss://` in bundle; front end polls) | H |
| Subgraph / GraphQL / Ponder | **NOT FOUND** (no mention in bundle or docs; the private monorepo has an indexer that is not exposed as a documented API) | H |
| On-chain (JSON-RPC, events) | Canonical source of truth. Public RPC host `https://rpc.mainnet.chain.robinhood.com` (README) is rate limited per RPC-provider docs (M). Not exercised this session because JSON-RPC is POST. | M |
| DefiLlama | `api.llama.fi/protocol/pfwa-markets`, `/summary/dexs/pfwa-markets`, `/summary/fees/pfwa-markets`: TVL and aggregates only | H |

**First-party endpoints (all GET, confirmed 2026-10-19)**
- `GET https://www.pfwa.fun/api/markets/live` -> `{"markets":[...],"cached":false}`. 519 KB, 185 markets (resolved and unresolved), `cache-control: public` (CDN `x-vercel-cache: MISS` on every call, so effectively uncached). The bundle also calls `?force=true` (bypass cache; do not use). Market row keys: `id`, `title`/`name` (question plus rules text plus `setup:0x<hash>` fingerprint), `marketType` (0 BINARY, 1 MULTI, 2 CUSTOM), `expirationTime` (unix seconds, string), `resolved`, `resolvedBy` (`CREATOR` | `ORACLE` | null), `winningOptionIndex` (0 until resolved, so ignore unless `resolved`), `creator`, `creatorIsOnFraudWatch`, `options[{name,tokenAddress,optionId}]`, `ethBalances[]` (wei strings, per option), `totalETH`, `bonusPot`, `tradesCount`, `category` (e.g. `Target · Market cap`, `Premier League · Match`), `kind` (`target|versus|football|onchain|rwa|challenge|null`), `volume` ("0.0013 ETH" string), `outcomes[{label,tokenAddress,chance,totalSupply}]`, `creatorUser{...}`, and for oracle-tracked markets `oracleData{tokenAddress,marketType (e.g. MARKET_CAP_UP),targetValue,endTime,oracleSource (GECKO_TERMINAL),status,network,isVersus,setupVerified,...}`. Fixture: `markets_live_sample.json` (4 markets).
- `GET /api/market/{id}/trades` -> `{"trades":[{id,txHash("0x..._0x<logIndex>"),marketId,optionId,isBuy,isClaim,shares,ethAmount,price,timestamp,userAddress,spotPrice,user{username}}]}`. `ethAmount` is the curve cost **before** fees (matches `TokensBought.ethPaid`); `price = ethAmount/shares`; `spotPrice` = spot after the trade. Fixture: `market_100107_trades.json`.
- `GET /api/analytics/protocol` -> TVL split (live / unclaimed winnings / bonus pots), volume (all-time, 7d, claims paid), fees (total, creators, protocol, bonus pots), counts, 60-day daily `series`, `topMarkets`, treasury, seeding, `mmAgent`, burns. Fixture: `analytics_protocol.json`.
- `GET /api/markets/hidden` -> ids hidden from the UI (`[12..17, 100032..100034, 100037]`). Fixture: `markets_hidden.json`. Hidden markets still exist on-chain; the analytics count (201) exceeds the 185 rows returned by `/api/markets/live`.
- Seen in bundle, not exercised: `/api/users/{address}[?lite=1]` (trader stats), `/api/referrals`, `/api/admin/settings` (admin, robots-disallowed; not touched).
- **Market id scheme (M)**: ids 0 to 91 are V1-factory markets (README: 92 markets), ids 100000+ are V2-factory markets (`100000 + factory marketId`). Inferred from the id ranges and the README counts; confirm via `marketCount()` on each factory.
- **Rate limits / auth**: none documented, no `x-ratelimit-*` or `retry-after` headers observed (H). Poll sparingly (<= 1 request/min for `/markets/live`; it is 0.5 MB).

**On-chain read recipe (H, from verified source; not executed)**
- Factory V2 `0x7B38e940Cd649bc0C701c42eE1A6ceff75584afa` (current), V1 `0x2502aB7E69dDb3157683A82E603360Ada9B6E647` (legacy markets, still resolvable). Both exact-match verified on Sourcify (chain 4663; verifiedAt 2026-08-31 and 2026-07-29). V2 outcome-token implementation `0x913d53E2fc37F3B4a2B67eE7c089B827054455b8`.
- Factory views: `marketCount()`, `getMarket(id)`, `getOptions(id)`, `getOptionTokenAddresses(id)`, `getOptionEthBalances(id)`, `marketBonusPot(id)`, `postExpirationGrace()`, `defaultFeePerMille()`, `defaultSellFeePerMille()`, `marketCreationFee()`.
- Token views: `totalSupply()`, `spotPrice(supply)`, `costToBuy(n)`, `costToBuyWithFee(n)`, `proceedsFromSell(n)`, `tokensForEth(eth)` (ignores fees), `feePercentage()`, `sellFeePercentage()`, `fixedRedemptionPrice()`, `marketResolved()`, `tradingPaused()`, `expirationTime()`.
- Events (per outcome token): `TokensBought(marketId,optionId,buyer,ethPaid,tokenAmount)`, `TokensSold(...,ethReceived,tokenAmount)`, `WinningsClaimed`, `MarketResolved`, `PriceSnapshot(marketId,optionId,timestamp,spotPrice)`, `FeeDistributed(marketId,optionId,creatorFee,platformFee,action)`. Factory: `MarketCreated`, `OptionTokenDeployed`, `MarketResolved`. DefiLlama's open helper (`dimension-adapters/helpers/pfwa-markets.ts`) already shows how to enumerate tokens and decode these logs (H).

## 4. Trade path

- **Pure on-chain transactions from an EOA; no signed orders, no API trading (H, source).** No approvals needed (collateral is native ETH). Frontend ABI matches the README exactly (H, bundle):
  - Buy: `BondingCurveToken.buy(uint256 tokenAmount) payable`, send `msg.value >= costToBuyWithFee(tokenAmount)`; overpayment is refunded. No min-out parameter; `msg.value` acts as a max-cost cap (a late price move makes it revert rather than overpay). To convert ETH to shares: `tokensForEth(eth * (1 - 2*fee))` then re-quote with `costToBuyWithFee`.
  - Sell: `sell(uint256 tokenAmount)`. **No min-out parameter**, so no on-chain slippage guard.
  - Claim: `claimWinnings()` (burns the caller's whole balance, pays `balance * fixedRedemptionPrice / 1e18`).
  - Create: `createMarket(name, optionNames[], expirationTime, marketType)` payable, fee `marketCreationFee` (0.005 ETH default), cap 100 user markets/day.
  - Resolve: `resolveMarket(marketId, winningIndex)` by creator / owner / relayer (section 7).
- Gas: ETH on Robinhood Chain (about 100 ms blocks per provider docs, M), so per-transaction cost is negligible.
- **PayBox reachability: yes.** Robinhood is in PayBox's live chain catalog (`discover_tokens mode=chains query=robinhood` returned `eip155:4663`, native ETH, 2026-10-19; the tool says "metadata catalog, not a support allowlist", H). Per the repo's PayBox notes (`docs/research/06-paybox-platform.md`, H), an `io.paybox/transactionProposal` EVM intent is `{chain:"eip155:<id>", transaction:{to,value,data}}`, one call per proposal, any `eip155:<uint64>`, `value` in wei; `get_buy_link` supports Robinhood as a funding destination. All three user actions (buy, sell, claim) are single-call, no-approval transactions, so they map 1:1 onto PayBox proposals. The plugin needs an RPC read host in its network allowlist to quote (`tokensForEth`, `costToBuyWithFee`, `proceedsFromSell`), and a funded ETH balance on 4663 (funding route not tested; `request_swap`/bridge not called).
- **Not tested**: any write, any quote via RPC (POST), any PayBox proposal readiness check.

## 5. Fees

| Item | Formula / value | Tag |
|---|---|---|
| Buy fee (markets created before the "September 2026 fee cut", and the contract defaults) | `creatorFee = rawCost * 15/1000` plus `platformFee = rawCost * 15/1000`, both paid **on top of** `rawCost` (total 3%). `costToBuyWithFee = rawCost + 2*rawCost*feePercentage/1000`. | H (verified source, README) |
| Buy fee, current markets | Docs say the fee was cut in September 2026 and each market keeps the fee it was created with; **the new rate is NOT FOUND** (searched: docs text, changelog/RSS, WebSearch; docs read it live from the factory in the browser). Needs `defaultFeePerMille()` / token `feePercentage()` via `eth_call`. Creators can only lower a market's fee (`setFeeForMarket`). | H (statement) / NOT FOUND (value) |
| Sell before `expirationTime` | `penalty = rawProceeds * sellFeePercentage/1000` (default 100 = 10%), half to platform, half into the market's bonus pot (paid to winners). User gets `rawProceeds - penalty`. | H (source); default may have been changed by owner |
| Sell after expiry + grace (market still unresolved) | creator `feePercentage/1000` + platform `feePercentage/1000` of proceeds | H (source) |
| Claim | free | H |
| Market creation | 0.005 ETH default; 50% to treasury, 50% swapped for $PFWA and burned (`buybackBurnPercentage` 5000 bps). The docs and llms.txt state "part of every creation fee" burned; the share is read live. | H (source) |
| Paid by | traders pay buy/sell fees; creators earn the creator leg; early sellers fund the winners' bonus pot | H |
| Aggregate | fees total 0.0923 ETH (creators 0.0268, protocol 0.0461, bonus pots 0.0193) on 2.31 ETH all-time volume | H (analytics, 2026-10-19) |

Net: round-trip cost to a taker who buys then exits before expiry is about 3% + 10% on the curve proceeds (legacy settings); holding to resolution costs only the buy fee, but the payout is variable.

## 6. Chains and collateral

Robinhood Chain (chain ID 4663; testnet 46630), native ETH. Contracts: factories above; WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, router `0xCaf681a66D020601342297493863E78C959E5cb2` (buyback; per source defaults). No other chain for the prediction markets (a Coinbase listing mentions HyperEVM, which I could not confirm; M/L, not used). PayBox EVM wallets share one address across `eip155:*` chains (per the repo notes), so the same wallet would hold the position.

## 7. Resolution and dispute risk

- **Oracle-based and centralised; no on-chain dispute mechanism** (H, README "Trust model").
- Who can call `resolveMarket(marketId, winningIndex)`: the **market creator at any time** (no timestamp check in the source: the `msg.sender == m.creator` branch is unconditional, so a creator can resolve before expiry), the owner at any time, and the relayer for protocol/team markets, or after `expirationTime + postExpirationGrace` for any market. The winning index is not validated against any data on-chain.
- Off-chain layer (H, docs): the resolver bot resolves target and versus markets from GeckoTerminal after the window if the creator has not; it needs two consistent checks at least an hour apart; markets holding more than an (unreadable) ETH threshold are never auto-resolved and are decided by the team; football from football-data.org; onchain metrics from DefiLlama; creators who contradict the data are flagged "On Fraud Watch" (a UI flag, the contract does not prevent the wrong resolution). Postponed/abandoned matches are resolved manually.
- Live stats (2026-10-19): of 97 resolved markets with a known resolver, 72 (74%) were **creator-resolved** and 25 oracle-resolved; 21 distinct creators, the team wallet created 86 of 185 markets; 8 markets belong to creators on fraud watch (all H, `/api/markets/live`).
- Grace: README default 2 days (2026-09-11); changelog 2026-10-14 states "the market factory grace period is now 2 hours (was 24)" and that the resolver checks expired markets every 10 minutes (H, changelog; `postExpirationGrace` is owner-settable and read live by every token, so it applies to existing markets). Trading halts during the grace window and reopens if unresolved afterwards.
- Owner powers (H, source): pause creation or any market's trading, change relayer/treasury/curve/fee/grace parameters, `claimAbandonedBonusPot`, `emergencyWithdrawStrayEth`. No timelock or multisig is documented (NOT FOUND). No third-party audit found (searched: site, repo, WebSearch); the README mentions an internal "audit fix" comment only; a separate Sherwood hook was audited by a third party (not relevant here).

## 8. Geo, ToS, automation

- No terms of service, no geo restriction text, no KYC, no age gate anywhere I could read (site pages, docs, llms.txt, README): **NOT FOUND** (searched: `/`, `/markets`, `/docs`, `/protocol`, `/changelog`, `llms.txt`, repo READMEs). Only a "not affiliated with Robinhood" disclaimer. Contracts are permissionless; the UI is the only possible gate.
- Automation: no stated policy and no API contract. The project runs its own market-maker, seeder and resolver bots and publishes `llms.txt` aimed at agents (mostly describing the Sherwood game). robots.txt allows `/api/markets/*`.
- Legal posture of an unlicensed on-chain betting product was not assessed.

## 9. Liquidity (all 2026-10-19)

| Metric | Value | Source |
|---|---|---|
| TVL (ETH held by outcome tokens + bonus pots) | 0.1421 ETH (live markets 0.1002, unclaimed winnings 0.0412, bonus pots 0.0007), about $341 at ETH $2,402.77 | site analytics 00:20Z; DefiLlama TVL $339.76 (H) |
| Volume | all-time 2.3148 ETH (about $5.6K); last 7d 0.1965 ETH (about $472); last 30 days sum 0.579 ETH; DefiLlama (excludes team wallets): 24h $103, 7d $381, 30d $1,185, all-time $5,110 | analytics `series`; api.llama.fi (H) |
| Activity | 746 trades, 40 traders, 201 markets, 10 live | analytics (H) |
| Largest live pools | 0.0183 ETH (Tottenham-Coventry 1X2), 0.0171 (PONS vs PUMP market cap), 0.0166 (PFWA mcap > $300K), 0.0134 (PFWA mcap > $100M); total of 10 live = 0.093 ETH | `/api/markets/live` (H) |
| Depth reality | a 0.01 ETH (about $24) buy moves a 0.018 ETH pool's odds by tens of points | derived (M) |
| Fees | all-time 0.0923 ETH (about $222); DefiLlama all-time fees $350, 7d $20 | analytics; api.llama.fi (H) |

Pools are seeded with 0.0001 to 0.0005 ETH per outcome by the team wallet ("seeded markets", H docs) and the team market-maker, so a visible share of "liquidity" is the operator's own.

## 10. Event coverage and overlap

- Football 1X2 (Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1; 3-way, 90-minute or full-time variants): overlaps Polymarket/Kalshi/sportsbooks, but the PFWA price is not a probability and the project's own agent anchors pools to bookmaker odds (so PFWA adds no independent information).
- Crypto/token price, market-cap and volume targets (YES if touched before deadline, per GeckoTerminal): mostly Robinhood Chain micro-caps (PONS, PFWA, PUMP, CASHCAT...) with no counterpart elsewhere; a few majors/tokenized stocks (e.g. LINK, a tokenized MRNA) could loosely match Polymarket "price hits" markets but with different definitions and sources.
- DefiLlama TVL/fees thresholds, RWA vault balances: no overlap found.
- No politics, macro, weather or elections.

## 11. Shared liquidity

None. Each market is an isolated set of bonding curves; there is no routing into Polymarket or any other venue (H, source). Not a mirror, so technically an independent leg, but too small to matter. (Credence ties launched tokens to Polymarket questions; that is a separate product and not a liquidity route, M.)

## 12. Adapter notes (if ever built)

- Discovery: `GET /api/markets/live` once per minute; keep rows with `resolved=false` and `expirationTime > now`; ignore ids in `/api/markets/hidden`. Outcome identity: `(factory, marketId, optionId)` or `tokenAddress`.
- Normalise per outcome: `reserve_share = ethBalances[i]/sum(ethBalances)`, `spot = 3e-8 + 3e-8 * totalSupply/1e18` (verify the constants against `defaultBasePrice/defaultSlope` first), `break_even_prob(x)` by simulating `buy(x)` and `Pool/winSupply`. Tag the venue `payoff_bounded: false`, `exit_penalty: 0.10`, `resolver: creator|oracle`, `settlement: variable_pool`.
- Never treat `chance` as a quote. Net-of-fee, net-of-exit-penalty EV only, with a hard size cap (pools are about $5 to $45 deep).
- Execution via PayBox proposals: one proposal per buy/sell/claim; re-quote on-chain immediately before; for sells there is no min-out, so quote and send in the same minute.

## Suspicious content / security observations

- `https://www.pfwa.fun/llms.txt` is a marketing/site summary with a "Read these first" list and a link to a second `llms.txt` describing how an agent can play the Sherwood game (https://sherwood.pfwa.fun/llms.txt, not fetched, out of scope). No instructions aimed at this task; nothing followed.
- The public JS bundle ships an RPC provider URL with an embedded API key (a credential exposure by the site). I did not use it and have not copied it into these notes or fixtures.
- Search-result pages from third-party coin sites (Coinbase, MEXC, Coinbazooka etc.) were summaries only; their price figures were not used.

## Not found

- Official API documentation, rate limits, WebSocket, subgraph.
- Current (post-"September 2026 fee cut") buy-fee rate, current `defaultSellFeePerMille`, current grace value, the ETH threshold above which the team resolves manually (docs render it client-side; reading needs `eth_call`, which is POST and was not performed).
- Terms of service, geo-blocking policy, KYC policy.
- Independent audit of the market contracts.
- Owner key custody (EOA vs multisig) and any timelock.
- A tested PayBox funding route to chain 4663 and a PayBox proposal readiness check for it.

## Open questions

1. What are today's `defaultFeePerMille`, `defaultSellFeePerMille`, `postExpirationGrace` and per-token `feePercentage()` on the V2 factory and a fresh market? (One batch of `eth_call`s; needs a human or a run that permits JSON-RPC POST.)
2. Will the team document or version the `/api/*` routes? If the aggregator relies on them, pin a schema test (the fixtures here are the baseline).
3. Is the V1 factory still resolving legacy markets (ids 0 to 91) and are any still unresolved with funds locked?

## Sources

- [H] https://pfwa.fun/ , /docs (RSC payload read as text), /changelog, /changelog.xml, /llms.txt, /robots.txt (fetched 2026-10-19; `pfwa.fun` redirects to `www.pfwa.fun`)
- [H] https://www.pfwa.fun/api/markets/live , /api/market/100107/trades , /api/analytics/protocol , /api/markets/hidden (GET, 2026-10-19 ~00:20Z)
- [H] https://github.com/MirakoolDev/pfwa-contracts (README, `src/PFWAMarketFactory.sol`, `src/BondingCurveToken.sol`, `src/PFWA.sol`, `src/PFWAMarkets.sol`; read via `gh api`; repo created 2026-09-11, last push 2026-09-11)
- [H] https://sourcify.dev/server/v2/contract/4663/0x7B38e940Cd649bc0C701c42eE1A6ceff75584afa (and the V1 factory and V2 implementation): verification status and verified flattened source (constructor defaults)
- [H] https://api.llama.fi/protocol/pfwa-markets , /summary/dexs/pfwa-markets , /summary/fees/pfwa-markets ; https://coins.llama.fi/prices/current/coingecko:ethereum (ETH $2,402.77)
- [H] https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/pfwa-markets/index.js ; https://github.com/DefiLlama/dimension-adapters (`dexs/pfwa-markets.ts`, `helpers/pfwa-markets.ts`); PR #21623 (merged 2026-10-15), PR #10164 (closed, not merged)
- [H] PayBox `discover_tokens` (mode=chains, query=robinhood), 2026-10-19; repo notes `docs/research/06-paybox-platform.md` for the proposal schema (H there)
- [M] WebSearch summaries: Robinhood Chain mainnet launch 2026-07-01, chain ID 4663, Arbitrum Orbit, public RPC host (Quicknode and Chainstack docs); Coinbase/MEXC/Pons token listing pages (product description only)
- [L] Blockscout (`robinhoodchain.blockscout.com`) was Cloudflare-challenged for scripted GETs and WebFetch (403); not circumvented, so no explorer data used
