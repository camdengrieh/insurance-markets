# Rain (rain.one) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, web search/fetch. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages, repos and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/rain/` (6 files, each <= 8 KB).

## 0. Verdict

- **Kind:** permissionless on-chain pooled-AMM prediction markets with a secondary limit-order book, Arbitrum One. Not an Orderbook-first CLOB. (H docs, M for the payout inference in section 2.)
- **Live?** Yes, but economically almost dormant. TVL $16.15M on 2026-10-18 (H, DefiLlama) of which **$16.10M (99.7%) is RAIN-token-denominated** and only about **$52.5k is USDT0** (H, same response). DefiLlama volume is **0 for the last 24h/7d/30d**; last non-zero day 2026-09-15 (H). Treat the $16M TVL headline as not usable for sizing.
- **Production read API is not reachable from this machine:** `prod-api.rain.one` answers 403 (Cloudflare managed challenge) on `/` and `/api-docs/`, times out on `/pools/public-pools?limit=1`, and returns HTTP 500 after ~31 s on a sorted listing (H, probes 2026-10-19, `fixtures/rain/prod_api_probe_2026-10-19.txt`). Response shapes below are confirmed on the **dev and staging** hosts only (same route code per the SDK).
- **adapter_priority: P2.** Thin stablecoin liquidity, no recent volume, creator-seeded prices, AI/creator resolution that does not match Polymarket/Kalshi rules, no instant exit, no slippage guard on market buys. Build last, read-only, if at all. Do not allocate execution work.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| DefiLlama TVL series runs to 2026-10-18 ($16,152,978) | H | `api.llama.fi/protocol/rain` |
| Staging API has a pool created 2026-10-05 (test token "Rain Dollar USDR", 18 dec), so the backend is still being developed/used | H (fact), M (inference) | `stg-api.rain.one/pools/public-pools?limit=1` |
| `rain1-labs/docs` last push 2026-08-17; `rain1-labs/rain-sdk` last push 2026-04-16; npm `@buidlrrr/rain-sdk` latest 2.0.0 published 2026-04-16 (repo `package.json` says 2.1.0, unpublished) | H | GitHub API, registry.npmjs.org |
| Press release 2026-05-26: Foundation commits $100M ($50M USDT + $50M RAIN) "ahead of V2 launch" (new on-chain order book) | H (that it was said), L (that it happened) | PR Newswire |
| Search snippets say the official site shows "V2 Live on Arbitrum"; a Sept 2026 analysis still lists order books as roadmap. V2 status unconfirmed | L | web search (rainprotocol.one did not resolve from here) |
| DefiLlama volume: Oct 2025-Mar 2026 $0.8-5.5M/month; Apr $21k; **May 2026 $23.0M** (spike around the $100M announcement); Jun $0.38M; Jul $54k; Aug $1.41M (one $1.38M day, 2026-08-25); Sep $65k; Oct $0 | H data, M interpretation | `fixtures/rain/defillama_rain_extract_2026-10-19.json` |
| Caveat on the zero: the DefiLlama volume adapter only watches two factories (v1 retired `0xccCB...23F1`, v2 `0xA864...F264`) and only `EnterOption` events (AMM buys), not order-book fills. A newer factory or order-book-only trading would show as zero | H (adapter source) | `DefiLlama/dimension-adapters/dexs/rain-one/index.ts` |

Site `www.rain.one` itself returns the Cloudflare challenge to WebFetch and curl (403, "Just a moment..."); I did not try to bypass it. `docs.rain.one` and `www.rainprotocol.one` do not resolve. The user-facing app is `app.rain.one` per the help center (H, not fetched).

## 2. Market model

- **Per-market contract** ("pool", deployed by a factory; Diamond-proxy pools per the SDK docs). Each market = one contract address holding one base token (H: `TradePoolAbi`, SDK docs).
- **Outcomes:** categorical, 2 to 26 options set by the creator (docs say "at least two"; SDK validation says 3-26 and the API lists an auto-added **"Unclassified outcome"** option on most markets, e.g. a Yes/No market returns `Yes`, `No`, `Unclassified outcome`) (H: help center, `createMarketValidation.ts`, `fixtures/rain/stg_public_pools_live_top5_sortLiquidity.json`). Of 187 live staging markets: 149 have 3 options, 37 have 2, 1 has 4 (H, my tally of a 260 KB response, not saved).
- **No scalar markets** found (NOT FOUND, searched docs repo, SDK).
- **Outcome tokenisation:** not ERC-20/1155. Positions are internal per-user balances in the market contract (`userVotes(option,user)`, `userVotesInEscrow`); API/SDK call them "shares" or "votes" (H: ABI).
- **Pricing:** AMM. `getCurrentPrice(option)` returns 1e18-scaled price; prices across options sum to ~100% (H: e.g. 96.42/1.38/2.02/0.17 in the fixture). Events: `EnterOption(option, baseAmount, optionAmount, wallet)` for AMM buys, `Sync(pair, optionVotes, allVotes)` "AMM reserve rebalance, once per option pair per trade" (H: ABI, docs).
- **Order book (secondary):** `placeBuyOrder(option, price, amount)`, `placeSellOrder(option, price, votes)`, `cancelBuyOrders/cancelSellOrders`, views `firstBuyOrderPrice/firstSellOrderPrice/buyOrders/sellOrders/orderBook`, `TICK_SPACING` (H: ABI). Help center: a **sell is always a conditional limit order that rests on the order book until a buyer matches it**; "all funds are committed once you place a trade, and there is no refund mechanism" (H: Trading Options page). So there is no documented instant sell back into the AMM.
- **Payout is probably pool-based, not fixed $1/share (M, inferred):** the SDK exposes `dynamicPayout` per option ("payout if that option wins", e.g. `[0, 804164316, 0, 0]`), the market page shows a "Line (payout multiplier)", `ChooseWinner` emits `platformShare/liquidityShare/winningShare`, and the docs say "the payout is drawn from the total pool of funds, after a platform fee is collected" (H quotes, M reading). Aggregator consequence: an option price of 0.60 is **not** a guaranteed $1 payoff claim; compute expected payout per share from `getDynamicPayout(user)` / pool totals (`allFunds`, `totalFunds(option)`, `totalVotes(option)`) before comparing with a fixed-payout venue.
- **Seeding:** creators set the initial split (`barValues`) and fund at least $10 equivalent (H: SDK). Hence many prices are creator-chosen, not market-discovered (e.g. a $12.50-liquidity staging market priced Rock 96%).
- **Liquidity providers** add via `enterLiquidity(amount)`; liquidity is locked until resolution (H: SDK note).

## 3. Chains and collateral

- Arbitrum One (42161) only for markets and settlement (H: docs). Cross-chain *deposits* from Ethereum, BNB Chain, Base and Bitcoin are handled by Rain's off-chain swap/bridge service into USDT on Arbitrum; withdrawals are USDT on Arbitrum (H: Deposit Funds, Cross-chain support, Withdraw pages).
- Base tokens: **USDT0 on Arbitrum `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`, 6 decimals** (H: SDK `ENV_CONFIG`); **$RAIN markets** ("Altcoin Markets": liquidity, trades and payouts all in RAIN, min liquidity "equivalent to $10") (H: help center); staging also shows a test token USDR (18 dec) and dev uses a mock `USDTm`. The base token is **per market** (`token` object in the API, `baseToken()` on-chain), and decimals differ, so an adapter must read `token.tokenDecimals`.
- DefiLlama (2026-10-18): 1.77B RAIN (~$16.10M) vs 52.6k USDT0 (~$52.5k) locked (H). **Most markets/liquidity are therefore RAIN-denominated or tiny**; RAIN-denominated markets carry token price risk and are not comparable with USD venues.

## 4. Read API

Two layers; there is no single documented market-data REST spec I could read.

| Layer | What | Auth / limits | Status |
|---|---|---|---|
| **Rain REST** (`{apiUrl}/pools/...`) | Market list and detail metadata | none for reads; rate limit **NOT FOUND** (searched SDK README/AGENTS.md/docs repo; swagger is behind a Cloudflare challenge) | dev + stg: 200 (H). **prod: 403/timeout/500 from here (H)** |
| **On-chain views** (per-market contract, Arbitrum RPC) | prices, liquidity, book tops, positions, resolution state | public RPC; limits are the RPC provider's | not exercised (JSON-RPC is POST; out of scope) |
| **Subgraph** (The Graph gateway, prod id `poBixDnF3hyafnLs9i1qkCpFppAAgmmWYgtsXrfYAWQ`) | trades, price history OHLC, PnL, leaderboard | POST GraphQL, The Graph API key ("optional depending on setup") | not exercised |
| **socket.io on the API host** | `enter-option/{marketId}`, `order-created/...`, `order-cancelled/...`, `order-filled/...`, `dispute-opened/...`, `appeal-opened/...`, `dispute-winner/...` | none seen in SDK source | not exercised |
| **RPC websocket** (user-supplied `wsRpcUrl`) | contract events `EnterOption`, `Sync`, `PlaceBuyOrder`, `ExecuteBuyOrder`, `Claim`, `ChooseWinner`... | provider key | docs only |

- Base URLs (H: SDK `environments.ts`): `https://prod-api.rain.one`, `https://stg-api.rain.one`, `https://dev-api.rain.one`. The docs API-Reference page lists swagger at `https://api.rain.one/api-docs/` (prod) which **does not resolve** (DNS), and `dev-api`/`stg-api` swagger returns the challenge. The docs "Environments" table says prod factory `0xccCB...23F1` but SDK source and DefiLlama mark that v1 as retired and `0xA8640B62D755e42C9ed6A86d0fc65CE09e31F264` as the active prod factory (H, discrepancy; trust the SDK source).
- Docs URL: https://github.com/rain1-labs/docs (Mintlify source; rendered site not reachable), SDK: https://github.com/rain1-labs/rain-sdk (MIT).
- **Key endpoints (H from SDK source; shapes confirmed on dev/stg):**
  - `GET {api}/pools/public-pools?limit&offset&sortBy=totalLiquidity|totalVolumn|age&status=New|Live|Waiting_for_Result|Under_Dispute|Under_Appeal|Closed|Closing_Soon|Dispute_Window_Open|Appeal_Window_Open|Pending_Finalization` -> `{statusCode, message, data:{pools:[...], count, pages}}`. Pool fields: `_id`, `contractAddress`, `question`, `options[{optionName, choiceIndex, percentage}]`, `status`, `startDate`, `endDate`, `isPrivate`, `tags[]`, `token{tokenAddress,tokenDecimals,tokenSymbol}`, `topOption`, `totalLiquidity`, `totalVolume`, `totalLiquidityUSD`, `totalVolumeUSD`, `participantCount`, `poolOwnerWalletAddress`, `poolFinalized`. (H: `stg_public_pools_limit1.json`)
  - `GET {api}/pools/pool/{id}` -> adds `poolDescription` (resolution rules text), `ipfsURL`, `isAiResolver`, `immediateResolution`, `isDisputed`, `isAppealed`, `disputeData`, `appealData`, `version`. (H: `stg_pool_detail_698215160689dbc47e05e6a8.json`)
  - On-chain per market: `getCurrentPrice(option)`, `getEntryShares(option, amount)`, `getImpactedPrice(option, amount)`, `totalLiquidity()`, `allFunds()`, `totalFunds(option)`, `firstBuyOrderPrice(option)`, `firstSellOrderPrice(option)`, `buyOrders/sellOrders(option, price)`, `getDynamicPayout(user)`, `poolState()`, `winner()`, `poolFinalized()`, `endTime()`, `oracleEndTime()`, `resolver()`, `resolverIsAI()`, `isDisputed()` (H: ABI in `src/abi/TradeMarketsAbi.ts`).
- **Data-quality traps (H, from fixtures):**
  1. `totalLiquidity` and `totalVolume` are raw base-token units (6 or 18 decimals depending on `token`); divide by `10^tokenDecimals`.
  2. `totalLiquidityUSD`/`totalVolumeUSD` are **not** normalised USD: for the 6-decimal USDT0 pool both equal the raw units (12,499,999 for a $12.50 market). Do not use them.
  3. `percentage` is the AMM-implied probability but is creator-seeded in thin pools.
  4. `choiceIndex` in the REST payload starts at 1; confirm the mapping to the on-chain `option` index before calling `getCurrentPrice` (NOT FOUND in docs; SDK passes `choiceIndex ?? i` straight through, so verify against a live market).
  5. The SDK filters by `creator` client-side after fetching the page (no server-side creator filter seen), and the sort key is spelled `totalVolumn` (SDK `MARKET_SORT_BY`).
- Rate limit / pagination caps: NOT FOUND (searched SDK, docs repo). SDK's own stats code pages with `limit=200`, and a 200-row page worked on staging (H).

## 5. Trade path and PayBox reachability

- **No off-chain order signing and no API key for trading.** All trading is direct contract calls from the trader's address; the SDK only builds unsigned `{to, data, value}` and "the SDK never sends transactions" (H: SDK AGENTS.md/README, docs "Trading & positions"). `POST /auth/login-or-register-with-walletAddress` (wallet signature) exists but only gates user-specific REST data such as `getUserInvestments` (H: `login.ts`; not called).
- Flow per market (H: SDK builders): (1) ERC-20 `approve(market, amount)` on the base token (SDK v2 requires an exact amount, no infinite approval); (2) `enterOption(option, amount)` for an AMM buy, or `placeBuyOrder(option, price1e18, amount)` for a limit buy (min $1), or `placeSellOrder(option, price1e18, shares)`; (3) after resolution `claim()` (must cancel open orders first per help center).
- **No slippage parameter on the AMM buy:** `enterOption(uint256 option, uint256 amount)` has no min-shares argument (H: ABI). Quote with `getEntryShares`/`getImpactedPrice` immediately before; prefer `placeBuyOrder` at a bounded price as the price-protected entry. Front-running/sandwich exposure is unquantified.
- **Exit is not guaranteed:** sells are resting limit orders (section 2). Treat any Rain leg as hold-to-resolution.
- **PayBox reachability: partial (M).** Arbitrum (42161) is in PayBox's chain catalog per the project's own earlier check (`docs/research/06-paybox-platform.md`, H there, 2026-10-19). Every step is an ordinary single-call EVM transaction, which fits the `io.paybox/transactionProposal` `evm` kind (one call per proposal; approve and trade are two proposals with separate approvals; the EOA pays ETH gas on Arbitrum; no sponsored gas). Rain's own gas-sponsored path (RainAA / Alchemy smart account, gas "paid in USDT" in-app) is not needed and is not reachable through a PayBox proposal. Blockers: wallet must hold USDT0 and ETH on Arbitrum; approval is per market contract; unresolved PayBox autonomy questions in doc 06 apply unchanged. Not tested (no money tools allowed).
- Contract surface is also small enough to be an Open Plugin: read via REST + `eth_call`, write via proposals. No signing-oracle requirement.

## 6. Fees (H: help center "Platform Fees"; docs "Rain-Builders")

- **5% of each market's trading volume**, split: market creator 1.2%, liquidity providers 1.2%, resolver 0.1%, **2.5% buy-back-and-burn of RAIN**. Public markets resolved by the AI oracle add a **$1 fixed oracle fee** (paid at creation). Contract views: `platformFee`, `liquidityFee`, `creatorFee`, `resultResolverFee`, `oracleFixedFee`, `ORDER_EXECUTION_FEE`, `FEE_MAGNIFICATION` (values not read; need `eth_call`).
- Unclear whether the 5% is taken per trade or from the pool at settlement. `ChooseWinner` emits `platformShare/liquidityShare/winningShare` and the SDK docs say the payout is "after a platform fee is collected", which suggests settlement-time deduction (M). Confirm before modelling edge; an assumed 5% haircut is a safe conservative number.
- Dispute collateral: 0.1% of market volume or $1,000, whichever is less (H).
- Gas: Arbitrum ETH for an EOA; in-app users see gas deducted in USDT (H). A third-party article says Rain Trade creators get 1% (L, different front end).

## 7. Resolution mechanism and dispute risk

- **Public markets:** creator picks either manual resolution or **Delphi**, an AI oracle by Olympus AI: a winner is confirmed when at least 3 of 5 "Explorer Agents" agree, and it "always selects one of the listed options" (H: help center). **Private markets:** the creator is the resolver and "could potentially take advantage of participants" (H, their wording).
- Lifecycle: `closePool()` after end time (anyone may call), then `chooseWinner`, then a dispute window, then `claim()` (H).
- **Dispute window length is inconsistent:** Closing a market page says 15 minutes; Filing a Dispute page says 1 hour; SDK prod config has `dispute_initial_timer: 120*60` = 2 hours (H, three sources disagree). On-chain `DISPUTE_WINDOW()` would settle it (not read).
- Disputes: collateral, first judged by **Lex**, an AI judge by Olympus AI; appeal escalates to "decentralized human oracles"; RAIN-holder arbitration in secondary sources (H help center; M for the token-vote detail).
- Risks for a cross-venue arbitrage leg: (a) resolution basis is free-text written by the creator and judged by an AI, so equivalence with a Polymarket/Kalshi contract is never guaranteed; (b) the "Unclassified outcome" option can win if the source is ambiguous (H: fixture description text); (c) private-market creator can rug; (d) hours-to-days settlement lag keeps capital locked.

## 8. Geo, ToS, automation

- Rain terms of service and restricted-jurisdiction list: **NOT FOUND** (searched: docs repo grep for terms/jurisdiction/KYC/geo, SDK README/AGENTS.md, web search; `rain.one` is behind the Cloudflare challenge). `rain.trade` (a separate-looking front end) mentions a "Restricted Jurisdictions" footer link, content unread (L).
- Automation: the vendor itself ships an MIT SDK, `AGENTS.md` and Claude Code skills for AI agents, advertises a "Builder Program" and gas-sponsored agent flows (H). No bot prohibition found, but the ToS were not read, so the rule is unknown (not permission).
- Reads need no account. The Cloudflare managed challenge on `prod-api.rain.one` root/swagger suggests bot-mitigation on the production edge; I did not attempt to bypass it.

## 9. Liquidity (all with dates)

| Metric | Value | Date | Tag |
|---|---|---|---|
| DefiLlama TVL total | $16.15M | 2026-10-18 | H |
| of which RAIN-denominated | $16.10M (1.77B RAIN) | 2026-10-18 | H |
| of which USDT0 | ~$52.5k | 2026-10-18 | H |
| DefiLlama TVL month-ends | $3.5M Apr, $29.3M May, $29.9M Jun, $24.9M Jul, $29.5M Aug, $22.4M Sep | 2026 | H |
| Volume 24h / 7d / 30d | $0 / $0 / $0 | 2026-10-19 fetch | H (adapter coverage caveat, section 1) |
| Volume all time | $40.9M; fees all time $1.51M | 2026-10-19 | H |
| Volume peak month | $23.0M (May 2026) | 2026-05 | H |
| Self-reported (cumulative >$18M, 28k+ users, TVL ~$3.96M) | early Feb 2026 | secondary guide | L |
| Staging live markets: 187, total liquidity ~$28.8 across all, largest $12.50 | 2026-10-19 | staging only | H |

Production per-market depth: NOT FOUND (prod API unreachable; no on-chain reads). Do not infer prod depth from staging.

## 10. Event coverage, overlap, independence

- Categories offered on the Rain Trade front end: Popular, Crypto, Politics, Finance, Sports, Technology, Entertainment, Science, Business, Weather, Other (M, WebFetch summary of `rain.trade/home`). Sampled markets: US 2028 Republican nomination, Dutch prime minister, IPL 2026 winner, TON price, GPT-6 release, album genre (H: fixtures).
- Overlap with other venues is nominal (politics, crypto price, sports exist everywhere) but **real arbitrage capacity is near zero** (sub-$100 depth, settled on different resolution text). Not worth matching against Polymarket/Kalshi.
- **Independent liquidity:** yes, own AMM pools. `rain.trade` appears to be another front end for the same protocol (M, search summaries only; relationship not confirmed from a primary source), so it would not be an independent leg. The Foundation's $100M is protocol-level seeding, not user flow.

## 11. Adapter notes (if built)

1. Source of truth for price = on-chain `getCurrentPrice` (1e18), REST `percentage` only as a cheap prefilter.
2. Normalise `totalLiquidity` by `token.tokenDecimals`; skip RAIN/USDR/USDTm markets for USD comparison; ignore `*USD` fields.
3. Treat `Unclassified outcome` as a real third leg: a binary Yes/No question prices Yes + No + Unclassified = 100%.
4. Model payout as pool-based until `getDynamicPayout` proves $1/share.
5. Use limit buys for price protection; never plan a mid-life exit.
6. Poll `status` values; only `Live` (and `Closing_Soon`) accept entries; `Pending_Finalization`, `Dispute_Window_Open` etc. are post-close.

## 12. Discrepancies noticed in Rain's own material

- Package name: docs say `@rainprotocolsdk/sdk` (registry returns 404); real package is `@buidlrrr/rain-sdk` (latest published 2.0.0; repo 2.1.0) (H).
- Prod factory: docs table `0xccCB...23F1` vs SDK source `0xA864...F264` (H).
- Prod swagger host `api.rain.one` does not resolve; code uses `prod-api.rain.one` (H).
- Dispute window 15 min vs 1 h vs 2 h (H).
- Market option minimum: help center 2, SDK validation 3 (H).
- The docs `getPublicMarkets` example lists `sortBy: 'Volumn'` (sic); the SDK maps it to the API value `totalVolumn`, so the typo is the real API spelling (H).

## 13. NOT FOUND

- Terms of service / restricted jurisdictions (searched: docs repo, SDK, web search, `rain.one` blocked by Cloudflare).
- REST rate limits and pagination caps (searched: SDK README/AGENTS.md, docs repo, swagger blocked).
- Production API response shape and live prod market list (prod 403/timeout/500).
- On-chain fee values, `DISPUTE_WINDOW`, per-market depth (would need JSON-RPC POST; out of scope).
- Confirmation that V2 order book is live and on which factory.
- Contract source / audit report of the pool contracts (a Hacken audit is linked only for the RAIN token, Aug 2025, unread).
- Official Dune dashboard contents (`dune.com/rain_predictions`, per press release; not fetched).

## 14. Suspicious content

- None hostile. The SDK repo ships `AGENTS.md`, `rain-sdk.skill` and `skills/*/SKILL.md` addressed to AI coding agents, and the docs repo has `ai-tools/*.mdx`. I read `AGENTS.md` for facts only and did not follow any of it. Cloudflare challenge pages were treated as data.

## Sources

- Rain docs repo (Mintlify source), files read via `gh api`: https://github.com/rain1-labs/docs (`Help-Center/PlatformFees.mdx`, `Closingamarket.mdx`, `FilingaDispute.mdx`, `TradingOptions.mdx`, `Publicmarkets.mdx`, `Privatemarkets.mdx`, `Creatingamarket.mdx`, `Adding-liquidity-to-markets.mdx`, `Cross-chainsupport.mdx`, `DepositFunds.mdx`, `Howtowithdrawyourfunds.mdx`, `HowtoClaimYourRewards.mdx`, `rain-help-center/help-center/what-are-altcoin-markets.mdx`, `For-Developers/Rain-Builders.mdx`, `For-Developers/Rain-SDK/*.mdx`). H.
- Rain SDK repo: https://github.com/rain1-labs/rain-sdk (`src/config/environments.ts`, `src/markets/*.ts`, `src/tx/buildRawTransactions.ts`, `src/abi/TradeMarketsAbi.ts`, `src/socket/RainSocket.ts`, `src/auth/login.ts`, `src/tx/CreateMarket/createMarketValidation.ts`, `README.md`, `AGENTS.md`, `CHANGELOG.md`). H.
- npm registry: https://registry.npmjs.org/@buidlrrr%2Frain-sdk (H), https://registry.npmjs.org/@rainprotocolsdk%2Fsdk (404, H).
- Live API probes (this session): https://stg-api.rain.one/pools/public-pools, https://stg-api.rain.one/pools/pool/698215160689dbc47e05e6a8, https://dev-api.rain.one/pools/public-pools, https://prod-api.rain.one/ (403/timeout/500). H.
- DefiLlama: https://api.llama.fi/protocol/rain, https://api.llama.fi/summary/dexs/rain?dataType=dailyVolume, https://api.llama.fi/overview/dexs, https://api.llama.fi/overview/fees; adapters https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/rain-one/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/rain-one/index.ts. H.
- Press release (2026-05-26): https://www.prnewswire.com/news-releases/rain-commits-100-million-in-liquidity-ahead-of-v2-launch-and-world-cup-expansion-becoming-third-largest-prediction-market-globally-by-tvl-302782050.html. H that it was published; claims are the company's.
- https://www.rain.trade/home (categories, H); web-search summaries for V2 status, Rain Trade, early-2026 usage figures (L); https://x.com/Rain__Protocol (not fetched).
- Project context: `docs/research/09-venues-onchain-clob.md` (earlier Rain section, prod shapes unverified), `docs/research/06-paybox-platform.md` (PayBox proposal contract, chain catalog).
