# Seer (seer.pm) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist.

**Verdict: P2.** Live, permissionless, independent liquidity, a documented public HTTP API plus SDK, and a plain-EVM trade path. But it is very thin (about $0.34M TVL, largest single market about $31K of pool liquidity, a few thousand dollars a day of real flow) and it is an AMM-per-outcome design, so there is no order book to scan. Worth a cheap read-only signal adapter (long-tail event markets, Polymarket meta-markets, elections). Not worth building a trading leg for until liquidity recovers.

## 1. Is it still live? (H)

- seer.pm and app.seer.pm both serve (HTTP 200 on 2026-10-19). The app's prerendered home page was built 2026-10-12 and lists 2,505 markets with 2026 questions (Brazil election, Knesset, US Senate, Polymarket meta questions).
- GitHub `seer-pm/demo` (MIT) last push 2026-10-12; `seer-pm/seer-indexer` 2026-09-07; `@seer-pm/sdk` 0.0.20 modified 2026-10-07, `@seer-pm/lens` 1.5.1 on 2026-09-14 (npm registry).
- Live `markets-charts` returned pool snapshots up to 2026-10-16 21:14 UTC (about 51h behind at fetch time, so the chart cache lags; see section 4).
- DefiLlama: TVL and volume updated 2026-10-18. But TVL has fallen from $1.94M (2025-10-19) to $0.34M (2026-10-18). So "live but shrinking". (H, fixture `defillama_seer_2026-10-19_trimmed.json`)

## 2. Kind and market model

- **Kind:** on-chain prediction market protocol. Not an order book: outcome tokens trade on **third-party AMM pools** (Swapr/Algebra V3 on Gnosis; Uniswap V3/V4 on Ethereum, Base, Optimism). Seer has no matching engine and no CLOB. (H: docs `developers/interact-with-seer/trading`, repo `docs/developers/guides/trading.mdx`)
- **Tokenisation (H):** Gnosis Conditional Tokens (ERC1155 positions) wrapped to **one ERC20 per outcome** via Wrapped1155Factory. Every market has an extra last outcome token `SER-INVALID`. Pools are always `outcome ERC20 / market collateral`. One pool per outcome, so liquidity can be very uneven across outcomes of one market. (Repo guide `coming-from-omen.mdx`.)
- **Market types (H):** categorical (binary is `[Yes, No]` + Invalid), multi-categorical (bitmask, several winners share `1/k`), scalar (`DOWN`/`UP` tokens with fractional payout `(high-x)/(high-low)`), multi-scalar (payout `x_i / sum x_j`), conditional/child markets (collateral is the parent's outcome token; branch worth 0 if parent resolves elsewhere), futarchy (separate factory, labelled "(test)" in the contract docs).
- **Aggregator consequences:**
  - Binary Yes price and No price are two independent pools, so they do not sum to 1. Observed in the fixture: French presidential market, Yes 35.3 + No 74.5 = 109.8% (H). A full set always redeems for exactly 1 collateral (split/merge), so the true bound is the split/merge arbitrage, not the pool prices.
  - `SER-INVALID` usually has no pool; its implied price is `1 - sum(other prices)` and can be noisy or negative (M, repo guide).
  - An invalid answer pays **only** `SER-INVALID`; holding Yes and No is not a hedge (H, repo guide; example: Romania 2024 run-off market resolved Invalid).

## 3. Chains and collateral

| Chain (id) | Collateral | DEX for outcome pools | Evidence |
|---|---|---|---|
| Gnosis (100) | sDAI `0xaf204776c7245bf4147c2612bf6e5972ee483701` (also xDAI via GnosisRouter; s-gCRC `0xeef7b1f06b092625228c835dd5d5b14641d1e54a` registered as a second primary) | Swapr (Algebra V3), router `0xffb643e73f280b97809a8b41f7232ab401a04ee1`, quoter `0xcBaD9FDf0D2814659Eb26f600EFDeAF005Eda0F7` | H docs |
| Ethereum (1) | sDAI per repo guide; the gitbook trading page still says DAI (stale/inconsistent) | Uniswap V3 (V4 via Lens) | H docs, conflict noted |
| Base (8453) | sUSDS `0x5875eee11cf8398102fdad704c9e96607675467a` | Uniswap V3/V4 | H docs |
| Optimism (10) | sUSDS `0xb5b2dc7fd34c249f4be7fb1fcea07950784229e0` | Uniswap V3/V4 | H docs |

- Contract addresses per chain: `https://seer-3.gitbook.io/seer-documentation/developers/contracts/deployed-contracts` (MarketFactory Gnosis `0x83183DA839Ce8228E31Ae41222EaD9EDBb5cDcf1`, Ethereum `0x1F728c2fD6a3008935c1446a965a313E657b7904`; Router/GnosisRouter/MainnetRouter/ConditionalRouter/MarketView/RealityProxy listed there). H.
- Collateral is yield bearing (sDAI, sUSDS), so a share price quoted in collateral units is not a USD price; sDAI/USD is above 1 (L, general knowledge, not checked here). Implied probability is price in collateral units, since 1 winning share redeems for 1 collateral unit.
- The seer.pm landing page shows only Gnosis and ETH icons and the gitbook "Wallet and network" page says only Ethereum and Gnosis: both are older than the developer docs, which add Base and Optimism (L for those two pages being current). DefiLlama's adapter also only covers Gnosis and Ethereum. Whether Base/Optimism have meaningful liquidity: NOT FOUND (see section 8).

## 4. Read API

**Official, public, unauthenticated HTTP functions (Netlify), documented.** (H)

- Docs: `https://seer-3.gitbook.io/seer-documentation/developers/interact-with-seer/api` (older) and the newer, fuller `https://github.com/seer-pm/demo/blob/main/docs/developers/api.mdx` (adds `volumeUSD`, `openInterestUSD`, `maxLiquidity`, portfolio and leaderboard endpoints). Prefer the repo copy.
- Base URL: `https://app.seer.pm/.netlify/functions/<name>`.

| Endpoint | Method | Use |
|---|---|---|
| `markets-search` | **POST** JSON `{chainsList, type, marketName, categoryList, marketStatusList, verificationStatusList, showConditionalMarkets, minLiquidity, marketIds, orderBy, orderDirection, limit (default 1000), page}` | Market listing. Response `{markets: SerializedMarket[], count, pages}`. |
| `get-market` | **POST** `{chainId, id | url}` | One market, merges subgraph and DB cache. Fields: `outcomes`, `wrappedTokens`, `odds` (percent, null for Invalid), `liquidityUSD`, `maxLiquidity`, `openInterestUSD`, `volumeUSD` (cash), `volumeNotionalUSD`, `poolBalance`, `questions[]` (Reality state: `best_answer`, `bond`, `min_bond`, `timeout`, `finalize_ts`, `is_pending_arbitration`), `payoutReported`, `payoutNumerators`, `collateralToken`, `parentMarket`, `verification.status`. |
| `markets-charts?ids=a,b` | GET | Hourly pool snapshots per outcome token (see below). |
| `get-transactions?account&chainId[&eventType=swap|lp|ctf]` | GET | Per-wallet swaps/LP/split/merge/redeem. No per-market public trade tape found. |
| `get-token-transactions?tokenIds&chainId` | GET | Top holders and last 100 transfers per outcome token (cached 5 min). |
| `get-portfolio`, `get-portfolio-value`, `get-portfolio-pl?account&chainId` | GET | Wallet positions. |
| `get-pnl-leaderboard`, `get-market-pnl-leaderboard` | GET, CORS `*` | Wallet PnL boards (contains third-party wallet addresses; not needed for an aggregator). |

- **Auth and limits:** none documented. Rate limits: NOT FOUND (searched: gitbook API page, repo `docs/developers/api.mdx`, response headers of GET calls show no `x-ratelimit-*`). The functions are behind Netlify. `markets-search` defaults to `limit=1000` per page.
- **WebSocket / streaming:** NOT FOUND (searched: gitbook, repo docs, repo `web/netlify/functions` listing). Polling only.
- **Other read paths (docs-only, not called here):**
  - The Graph subgraphs (docs `developers/subgraph/subgraph-id`): Seer `B4vyRqJaSHD8dRDb3BFRoAzuBK18c1QQcXq94JbxDxWH`, Curate `2hP3hyWreJSK8uvYwC4WMKi2qFXbPcnp7pCx7EzW24sp`, Swapr Algebra `AAA1vYjxwFHzbt6qKwLHNcDSASyr1J1xVViDH8gTMFMR`. Gateway auth requirement: not stated in docs (L: The Graph's decentralized gateway normally needs an API key).
  - On-chain `MarketView.getMarket(factory, market)` plus pool/quoter `eth_call` for exact prices (H, repo guide).
  - SDK `@seer-pm/sdk` (MIT) `fetchMarkets`, `fetchMarket`, `fetchAmmQuote`; `@seer-pm/lens` quoter contract that picks the best of Uniswap V3/V4 and Swapr (H, repo README/lens README).
  - Repo (`seer-pm/api-gateway`, `seer-pm/seer-indexer`) exist but I did not read them.
- **Live shapes confirmed (unauthenticated GET only):**
  1. `GET markets-charts?ids=0x95149fcc1eb9ec665a5984c33927b991dd66a355` returned HTTP 200, 150 KB, `cache-control: no-cache`. **Differs from the docs** (docs say `{name,type,data:[ts,value]}`): the live value per market is an array with one entry per outcome token (Invalid last, empty), each an array of Algebra pool-hour rows `{pool:{id,token0{id,name},token1{id,name},liquidity}, liquidity?, sqrtPrice, token0Price, token1Price, periodStartUnix}`. Price convention is the Uniswap-subgraph one: `token0Price` is token0 per 1 token1. Outcome price in collateral = the price field that is denominated in the collateral token (sample: Lula token0 vs sDAI token1, `token0Price` 4.73 = shares per sDAI, so share price 0.2112 = `token1Price`). Fixture `markets_charts_0x95149fcc_trimmed_2026-10-19.json`. Last four prices summed to 1.015 (about 101.5% overround). Data stale about 2 days at fetch.
  2. The app home page (`https://app.seer.pm/`) is prerendered and embeds the react-query cache for the `markets-search` query inside `script#vike_pageContext`. This gave a real `{markets,count,pages}` payload (2,505 markets, 24 per page) without calling the POST endpoints. It is a build-time snapshot (2026-10-12 12:23 UTC), so use it for shape only. Bigints appear as `"!BigInt:123"` strings here, whereas the API docs say decimal strings. Fixture `markets_listing_ssr_2026-10-12_trimmed.json` (creator field removed, 3 of 24 markets kept).
  3. DefiLlama `api.llama.fi/summary/dexs/seer` and `/protocol/seer` for liquidity context. Fixture `defillama_seer_2026-10-19_trimmed.json`.
- **Not verified live:** `get-market` and `markets-search` (both POST). The ground rules forbid POST, so these two response shapes are docs-only (H for docs text, unverified against the live server). A follow-up with permission to POST read-only queries should confirm them and check whether `bigint` fields serialize as plain strings.

## 5. Trade path

- **Programmatic placement:** no off-chain order or signature scheme. Trades are ordinary EVM transactions from the user's EOA or smart wallet: ERC20 `approve(router, amount)` then Uniswap-V3-style `SwapRouter.exactInputSingle` / `exactOutputSingle` (Swapr on Gnosis uses the same ABI; Swapr's quoter has no `fee` arg and returns `(amount, fee)`), or mint a full set through Seer's `Router.splitPosition` and sell the unwanted outcomes, or buy complements and `mergePositions`. Quotes via Uniswap QuoterV2 / Swapr Quoter (revert-decoded `eth_call`) or Lens `getQuotes`/`buildBestSwap`. All H (docs `trading`, `split-merge-and-redeem`, Lens README, SDK README).
- **Cancel:** not applicable (swaps are atomic; no resting orders unless the user provides concentrated liquidity on the DEX, which is a separate LP flow).
- **Limit-style orders:** none. Concentrated-liquidity positions can act as range orders but that is out of scope.
- **Resolve and redeem:** anyone may call `Market.resolve()` after Reality finalises; redeem through `GnosisRouter.redeemToBase` (xDAI out) or `Router.redeemPositions`; child markets via `ConditionalRouter`. (H, repo guide.)
- **Prior art for agents:** the repo ships `docs/developers/guides/coming-from-omen.mdx` for AI trading agents, and links `gnosis/prediction-market-agent-tooling`, which trades Seer on Gnosis through Swapr. (H for the guide; the tooling repo itself I did not read.)

### PayBox reachability: **partial** (M/H mix)

- Seer needs no off-chain signature, only plain contract calls, which fit PayBox's `evm` proposal shape (one call per proposal, so approve and swap are two proposals) (H, local note `docs/research/06-paybox-platform.md`).
- Chain coverage vs PayBox: PayBox's featured catalog (`discover_tokens mode=chains`, read this session) has Ethereum (1), Base (8453), OP (10) but **not** Gnosis in the featured 11. A catalog search for "gnosis" does return `eip155:100` (native XDAI). The tool says the catalog is "not a support allowlist", so whether PayBox can simulate and send a proposal on Gnosis is **NOT FOUND (untested)**. (H on the catalog result, NOT FOUND on support.)
- Almost all liquidity is on Gnosis (all 24 largest markets in the SSR listing are chain 100; DefiLlama TVL Gnosis $310K vs Ethereum $30K). So the chains PayBox clearly supports (Ethereum, Base, Optimism) are the ones with the least liquidity.
- Collateral acquisition: sDAI (Gnosis/Ethereum) or sUSDS (Base/Optimism) must be obtained first; swap routes depend on PayBox's live providers (NOT FOUND, not tested).
- No PayBox money-moving tool was called.

## 6. Fees (H unless stated)

- **No protocol trading fee.** "You pay the pool fee of whichever AMM you trade on." (repo guide `coming-from-omen.mdx`.) Consistent with source: `grep -i "fee|owner|admin|pause"` on `Router.sol`, `GnosisRouter.sol`, `MarketFactory.sol`, `RealityProxy.sol` returned nothing, so those four contracts have no fee and no owner or pause switch in the source (H on absence in the files I read; other contracts such as LiquidityManager, CreditsManager not audited here).
- **Pool fee:** paid by the trader to LPs. Swapr/Algebra V3 on Gnosis uses a dynamic fee (quoter returns it). Uniswap V3 tiers on other chains (docs example tiers 0.05%, 0.3%, 1%; the actual tier per Seer pool is not stated: NOT FOUND, searched docs and SDK `pool-address.ts`, `amm-trade.ts`).
- Other costs: gas (xDAI on Gnosis is cheap; Ethereum expensive); Reality.eth answer bonds and Kleros arbitration fee for answerers/disputers only; market creation and Curate verification deposit (xDAI, refunded on verification) for creators only. A creation fee: NOT FOUND (searched docs `create-a-market`).
- Slippage and thin pools dominate cost in practice: buying is disabled by the UI when the quoted price exceeds 1 collateral per share (H, docs `buy-sell-outcome-tokens`).
- Rewards: markets can carry SEER-token liquidity incentives (`incentive` field, e.g. 299,999.99 on the Knesset market; web-search snippet says "Reward: 333.33k SEER/day" on another, M). These can sustain quotes that are not purely informational.

## 7. Resolution and dispute risk

- **Oracle:** Reality.eth v3.0 (bonded crowd answers) with **Kleros** as arbitrator. Anyone answers after the opening time; each new answer must at least double the bond; question timeout is **302,400 s (3.5 days)** after the last answer on the Gnosis and Ethereum factories (H: constructor args in `contracts/deployments/{gnosis,ethereum}/MarketFactory.json`; the same value was in the sample market's `questions[0].timeout`). `min_bond` per question is chosen by the creator (sample: 10 units; docs example 0.1 DAI).
- **Dispute:** pay Kleros' fixed arbitration fee; docs say a ruling typically takes up to **14.5 days**, plus **11 days per appeal**. (H, docs `raise-a-dispute`.) So capital can be locked for weeks, and a disputed market stops accepting answers.
- **Resolution policy:** Seer publishes a "Market Resolution Policy" and "Verified Markets Policy" PDFs (Kleros CDN, linked in docs `create-a-market`; I did not read the PDFs). App routes `/policy/rules` and `/policy/verified` render them.
- **Risks for an aggregator (H from repo guide/contracts):**
  - Permissionless creation: anyone can create a market with any wording. Only markets in the Kleros Curate "verified" list carry a `verification.status: "verified"`; others are flagged. Filter on `verified`.
  - Invalid answer pays only `SER-INVALID` (not 1/n per outcome as on Omen). Fully hedged Yes+No positions lose on Invalid.
  - Multi-categorical winners split payout; scalar/multi-scalar pay fractions, so "price = probability" does not hold for those types.
  - Conditional markets are priced conditionally on the parent; never compare their price to a joint probability elsewhere.
  - Reality "answered too soon" reopen handled by the resolver; low `min_bond` markets are cheap to attack.
- **Audit:** only the Core module audit is listed (Hats Finance competition, with resolve PRs 42 and 46). Lens, routers added later, futarchy, trading credits: no audit listed (H for the page; absence of other audits is NOT FOUND, searched docs audit page). Lens README itself says "Review before production use."
- **Time to resolve:** markets typically open on a date and resolve only after answer + 3.5 days timeout; many listed markets have `finalizeTs` 33260976000 (a far-future sentinel meaning "no answer yet").

## 8. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| TVL (collateral locked) | **$340,357** (Gnosis $310,056; Ethereum $30,495) | DefiLlama `/protocol/seer`, 2026-10-18 (H) |
| TVL history | $1.94M (2025-10-19), $1.35M (2026-04-22), $0.86M (2026-07-21), $0.28M (2026-09-19) | same (H) |
| DefiLlama "volume" 24h / 7d / 30d / 1y / all-time | $4.0K / $7.1K / $107.5K / $3.80M / $6.10M | `/summary/dexs/seer`, 2026-10-18 (H). **Caution:** the adapter counts router `PositionSplit`/`PositionsMerge` events (mint and merge notional), not AMM swap volume, so it is not a trading-volume figure (H, `DefiLlama/dimension-adapters/dexs/seer`). Single-day peak $528.5K on 2026-08-11. |
| Top 24 markets (default sort looks like liquidity descending) | sum of `liquidityUSD` $98.2K; sum `openInterestUSD` $68.1K; sum lifetime `volumeUSD` $69.0K; all on Gnosis | Seer SSR listing, snapshot 2026-10-12 (H, M for the sort inference) |
| Largest markets | Brazil 2026 president: liquidity $30.9K, OI $8.7K, lifetime swap volume $690. Knesset seats: $27.7K. French presidential (RN wins): $7.3K. 24th market: $644 | same (H) |
| Total markets listed | 2,505 (all statuses, all chains) | same (H) |
| Base / Optimism liquidity | NOT FOUND (DefiLlama adapter excludes them; none of the 24 largest markets are on those chains, so each such market is likely below about $650 of pool liquidity, M). | |

Net: a trader can move at most a few hundred to a few thousand dollars per market before price impact bites. Use as a signal source or a micro-arb leg only.

## 9. Event coverage and arbitrage overlap

- Categories in the API are all `misc` in the sample (the `categories` field is not informative). From question text (24 largest, 2026-10-12): national elections (Brazil, France, Israel, South Sudan, Bosnia, US Senate), geopolitics (Greenland, Iran), crypto/US policy (Clarity Act in Senate, SEC enforcement), pop culture (GTA 6), an ETH base-fee scalar, and many **Polymarket-meta** questions (fee data in API, UMA oracle use, token distribution, court ruling vs Polymarket). No sports in the top 24 although the landing page advertises sports.
- Overlap with other venues (M, Polymarket/Kalshi coverage assumed from general knowledge, not checked here): Brazil election, French presidential election, US Senate control, Clarity Act, Polymarket token/airdrop. Polymarket-meta questions are Seer-specific edge (little competing liquidity).
- Also structurally exploitable inside Seer: Yes+No pool prices above 1 (mint a full set for 1 collateral, sell both) and the reverse; capacity is only a few hundred dollars.

## 10. Shared liquidity? (H)

No. Seer's outcome pools are its own: ERC20 wrappers of Seer-created CTF positions on Swapr/Uniswap. It is the successor-in-spirit of Omen and uses the **same Conditional Tokens contract on Gnosis**, but Omen markets are separate FPMM contracts with different condition IDs; no shared order flow or pool with Omen, Polymarket, XO or any other venue in this project. So Seer is an **independent** arbitrage leg. (Outcome ERC20s are tradable on any DEX, so third parties could add more pools; none documented.)

## 11. Geo, ToS, automation

- **ToS / geo-restrictions:** NOT FOUND (searched: seer.pm landing, `/terms`, `/terms-of-service`, `/privacy` on both seer.pm and app.seer.pm all 404; docs gitbook index; GitHub code search in `seer-pm/demo` for terms of service / geoblock / restricted countries / OFAC; web search). The contracts are permissionless and the front end is a static app; no IP geo-gate evidence either way. Do not read this as "no restrictions".
- **Automation:** the docs explicitly call the HTTP functions "Useful for integrations, frontend, and AI tools", ship an MIT SDK and a porting guide for AI trading agents, and the Lens quoter is built for routers. So programmatic use is invited (H). No documented API key, rate limit or usage policy (NOT FOUND). Netlify-hosted: expect default platform throttling; be polite (cache `markets-search`, poll sparingly).

## 12. Adapter spec (for the aggregator)

- **Venue id:** `seer`. **Kind:** `onchain-amm`. **Independent leg:** yes. **Latency:** HTTP polling, cache lag up to days on `markets-charts`.
- **Market listing:** `markets-search` (POST, to be confirmed) filtered `verificationStatusList=["verified"]`, `marketStatusList=["Active"]`, `minLiquidity>=500`, `showConditionalMarkets=false`, `type="Generic"`. Alternative with no POST: on-chain `MarketView` + factory `allMarkets()`.
- **Market id:** `{chainId}:{marketAddress}`; URL slug `url` is the human id (`app.seer.pm/markets/{chainId}/{slug}` or address).
- **Outcome id:** `wrappedTokens[i]` (ERC20). `outcomes[]` is index-aligned, with `Invalid` last.
- **Price:** for exact: Lens/Uniswap/Swapr quoter on `outcome/collateral` pool. For cheap scanning: `odds[i]` (percent, null for Invalid, derived from pools and may be stale) or `poolBalance`. Normalise `price = odds/100` per outcome; do not renormalise Yes/No to sum 1 (it is a real inefficiency, see section 2). Invalid price = `max(0, 1 - sum)`.
- **Size/depth:** `poolBalance[i]` has token balances; real depth requires a quote at the intended size because pools are concentrated-liquidity.
- **Resolution state:** `payoutReported`, `payoutNumerators`, `questions[].{best_answer,bond,finalize_ts,is_pending_arbitration}`. Treat `finalize_ts` ahead of `now` or `is_pending_arbitration=true` as not-yet-resolved; treat far-future sentinel `33260976000` as no answer.
- **Units gotchas:** collateral is sDAI/sUSDS (not USD); bigints may be strings or `!BigInt:` strings; chain 100 uses xDAI gas; `liquidityUSD` is the API's USD estimate of pool depth.
- **Fixtures:** `docs/research/fixtures/seer/`.

## 13. Open questions

1. Live shape of `markets-search` and `get-market` (POST): unverified here.
2. Real liquidity on Base and Optimism (and whether the app UI exposes them).
3. Rate limits and any ToS or geo rule: NOT FOUND.
4. Whether PayBox can build and simulate proposals on Gnosis (chain 100); PayBox lists it in the catalog search but not in its featured chains.
5. Per-pool fee tiers actually used by Seer pools (Algebra dynamic fee level; Uniswap tier on Base/OP/Ethereum).
6. Why `markets-charts` data ends 2026-10-16 (cache job schedule); how fresh `odds` in `markets-search` is.
7. Contents of the Kleros-hosted Market Resolution Policy PDF (not read).

## Suspicious content / injection check

- `seer-pm/demo/AGENTS.md` is written for AI coding agents working in that repo (monorepo conventions: codegen, no em dashes, local dev). Benign, not addressed to this task, not followed. The docs' "Quick reference for AIs" table is likewise benign API reference. No instructions aimed at an agent reading the site, API responses or search snippets were found.

## Sources

Official / primary (H unless noted):
- https://seer.pm/ (landing; Gnosis and ETH icons, links to docs, GitHub, Kleros)
- https://app.seer.pm/ (prerendered home page, 2026-10-12 build; embedded markets query cache)
- https://seer-3.gitbook.io/seer-documentation/llms.txt and pages: `overview/what-is-seer`, `getting-started/wallet-and-network` (stale, Ethereum and Gnosis only), `getting-started/navigate-our-site/{buy-sell-outcome-tokens,provide-liquidity,create-a-market,verify-market,report-answer,raise-a-dispute,resolve-market}`, `developers/intro`, `developers/interact-with-seer/{api,trading,configuration,resolve-a-market,split-merge-and-redeem}`, `developers/contracts/deployed-contracts`, `developers/subgraph/subgraph-id`, `other/audit-reports` (append `.md` for markdown)
- https://seer-2.gitbook.io/seer (intro/whitepaper; nothing on fees or API)
- https://github.com/seer-pm/demo (MIT; pushed 2026-10-12): `docs/developers/api.mdx`, `docs/developers/guides/{trading,collateral-profiles,coming-from-omen}.mdx`, `AGENTS.md`, `contracts/src/{Router,GnosisRouter,MarketFactory,RealityProxy}.sol`, `contracts/deployments/{gnosis,ethereum}/MarketFactory.json`, `packages/seer-pm-sdk/README.md`, `web/netlify/functions/` listing, `web/src/pages/policy/`
- https://github.com/seer-pm/lens (README; pushed 2026-08-28)
- https://registry.npmjs.org/@seer-pm/sdk and `/@seer-pm/lens` (versions and dates)
- Live GET: `https://app.seer.pm/.netlify/functions/markets-charts?ids=0x95149fcc1eb9ec665a5984c33927b991dd66a355` (2026-10-19)
- Reality.eth: https://reality.eth.limo/app/docs/html/index.html ; Conditional Tokens: https://conditional-tokens-docs.netlify.app/docs/introduction1 (linked from docs, not read)

Secondary (M):
- https://api.llama.fi/protocol/seer and https://api.llama.fi/summary/dexs/seer (2026-10-19 reads; DefiLlama estimates)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/seer/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/seer/index.ts (adapter source: chains covered, volume methodology)
- Local: `docs/research/fixtures/defillama/protocols_tvl_prediction_market_2026-10-18.json`; `docs/research/06-paybox-platform.md` (PayBox proposal shape); PayBox `discover_tokens mode=chains` (read-only call this session)
- Web search (extended) for Seer 2026 status, ToS and news: nothing beyond the above; no 2026 news about a token launch or shutdown found (NOT FOUND). Search results were dominated by the unrelated stock "SEER".

Fixtures saved: `docs/research/fixtures/seer/markets_listing_ssr_2026-10-12_trimmed.json`, `markets_charts_0x95149fcc_trimmed_2026-10-19.json`, `defillama_seer_2026-10-19_trimmed.json`.
