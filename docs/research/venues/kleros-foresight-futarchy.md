# Kleros Foresight (futarchy) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist.

**Verdict: skip.** Foresight is a Kleros-run front end for a handful of bespoke "distilled human judgement" experiments (movie percentile scores given by one person, DevCon side-event attendance and satisfaction). It is not a separate protocol: every market is a plain Seer market on Gnosis Chain, traded in Seer's Swapr (Algebra) pools. Liquidity is therefore shared with Seer (not an independent leg), the questions overlap no other venue (no arbitrage), pools are tiny (about 0.9K to 2K sDAI-equivalent per session on 2026-10-19), all three current sessions closed trading by 2026-09-30, and there is no documented API of its own. If any of it is ever wanted, it comes through the Seer adapter (docs/research/venues/seer.md), not a Foresight adapter. The one useful action: make the Seer adapter exclude these markets (section 12).

## 1. Is it still live? (H)

- `https://foresight.kleros.io` serves (HTTP 200, 2026-10-19). It is a landing page listing five "experiments", each on its own subdomain. (H: WebFetch of the site; repo `homepage` branch `src/consts/experiments.ts`.)
- Repo `kleros/futarchy-ui` (no licence file, 2 stars, description "Futarchy app, aka Foresight") has pushes up to 2026-10-15 (merges of `master` into the `movies-r3`, `devcon-attendance`, `devcon-satisfaction` branches); `master` last real commit 2026-10-07. (H: `gh api`.) Development is active.
- **But nothing is open for trading.** Landing-page badges say "Live" for Movies Session 3 and both DevCon markets, but those are hard-coded strings (`status: "live"`) in `experiments.ts`. The same file has `endTime: 1790812740` = 2026-09-30 23:59 UTC for all three, and the DevCon pages themselves show "Ended". The repo has a commit "disable-predictions-post-timer" (2026-07-06). (H.)
- Live API check 2026-10-19: `GET https://foresight.kleros.io/api/redeemable` returned `movies` (Session 1) and `movies-s2` redeemable = true, `movies-s3` and both DevCon sessions redeemable = false, i.e. Session 3 and DevCon are closed but not yet resolved. (H, fixture `foresight_api_redeemable_2026-10-19.json`.)
- Whether a Session 4 or any new experiment is planned: NOT FOUND (searched: Kleros blog tag page `prediction-markets`, docs page, repo branches; the WebSearch budget ran out before a final news search, so a news check is outstanding). The only new item on the blog is a Kleros Fellowship track on decision markets (2026-07-24, M).
- Pool prices still moved on 2026-10-17 in a Session 3 pool (last chart row 16:17 UTC), so the underlying Swapr pools stay tradable by anyone after the app disables its UI (M: inferred from price movement; I did not test a swap). (H on the price row, fixture `seer_markets_charts_foresight_s3_child_0x72917b53_trimmed_2026-10-19.json`.)

Sessions (H: `experiments.ts`, landing page, blogs):

| Experiment | Question | Trading window | Parent market (Gnosis) | State 2026-10-19 |
|---|---|---|---|---|
| Movies (Session 1) | percentile score the judge gives each of 16 movies | 2026-03-05 to 2026-04-03 | `0x6f7ae2815e7e13c14a6560f4b382ae78e7b1493e` | resolved, redeemable |
| Movies Session 2 (20 movies) | same | to 2026-07-05 00:00 UTC | `0x6b182ffe23a9df5f5bfb2e9b6b4ce5716e84ab1f` | resolved, redeemable |
| Movies Session 3 (20 movies) | same | 2026-08-04 to 2026-09-30 23:59 UTC | `0xacc15cfa0f4ae4932b12ab14595941285098436a` | closed, not yet redeemable |
| DevCon side events: Attendance (7 events) | unique non-staff attendees entering | about 2026-08-28 to 2026-09-30 | `0xd1d81ec6c50cac45c9930f31f837b62eedfaefc4` | closed, not yet redeemable |
| DevCon side events: Satisfaction (7 events) | mean post-event rating, 0-10 | about 2026-08-31 to 2026-09-30 | `0xf094a219f85fc9880362fe096bd489bccb9b5359` | closed, not yet redeemable |

## 2. Kind and market model

- **Kind:** on-chain conditional-token prediction markets with AMM trading; a UI/experiment layer on Seer. Decision-market ("futarchy") structure, but used so far for forecasting a judge's score, not for governance. The docs also say Kleros governance proposals KIP-76 and KIP-84 require a futarchy evaluation before a PNK supply increase can pass (H: docs.kleros.io/products/foresight; I did not read the KIPs).
- **Structure (H, repo + docs + blogs):**
  - One **parent categorical market** whose outcomes are the items (20 movies; 7 events). Depositing collateral splits it into one "item token" per item. Several items win together (5 of 20 chosen), so payout is shared.
  - One **child scalar market per item**, conditional on that item's parent outcome. Its collateral is the item's parent-outcome ERC20. Range is 0 to 100 (movies; `minValue 0, maxValue 100`) in the movie repo config.
  - Child outcome tokens are `UP` and `DOWN` (plus an `Invalid` token). Payout: UP pays `Evaluation / Max`, DOWN pays `(Max - Evaluation) / Max` (e.g. rating 76 pays 0.76 per UP). (H: Kleros blog 2026-03-04, 2026-06-03, 2026-08-31.)
  - Each child has two Swapr pools: `itemToken/UP` and `itemToken/DOWN`. The UI hides this behind a "slider" that moves the market estimate to the user's belief (it buys/sells UP and DOWN). "Market estimate" = UP price on a 0 to 100 scale. Live sample: Interrogation (1982) UP 0.7521, DOWN 0.2527 (sum 1.005), i.e. estimate about 75, on 2026-10-17 16:17 UTC. (H, fixture.)
  - **Selection step:** at the end of trading only some items are evaluated (top three by market estimate, one random from a block hash, one picked by the judge). Unselected items are not resolved and "redeem at neutral value". (H: docs + blog.)
- **Price semantics for an aggregator:** an UP price is the market's expected normalised score of one person's rating, conditional on the item being selected. It is a scalar expectation, not an event probability, and is also conditioned on the selection rule (the top-estimate items get evaluated, so estimates feed back into selection). Not comparable to any binary price elsewhere.
- **Tokenisation:** Gnosis Conditional Tokens positions wrapped to ERC20 via Seer's Wrapped1155Factory (same as Seer). See seer.md section 2. (H via Seer note; the factory evidence is in section 10.)

## 3. Chains and collateral

- **Chain:** Gnosis Chain (id 100) only. (H: repo `DEFAULT_CHAIN = gnosis`; docs "Runs on Gnosis Chain".)
- **Collateral:** sDAI `0xaf204776c7245bF4147c2612BF6e5972Ee483701` (18 decimals, yield-bearing, so not exactly USD). xDAI accepted via the GnosisRouter wrapper, and xDAI is the gas token. (H: repo `src/consts/index.ts`; docs.kleros.io.)
- **Other repo contracts (H, `src/consts/index.ts`):** Seer GnosisRouter `0xeC9048b59b3467415b1a38F63416407eA0c70fB8`, Swapr router `0xffb643e73f280b97809a8b41f7232ab401a04ee1`, ConditionalTokens `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce`, sDAI adapter `0xD499b51fcFc66bd31248ef4b28d656d67E591A94`, WXDAI `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`, "ForesightCredits" ERC20 `0x09E7014D2c15Eb8C5ee25853FE6842FF5E2c94f9` and CreditsManager `0x17592eFE59a318A6B0AFE32145ee04eAFeeA8A61` (trading credits, section 8), CoW settlement-style contract `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110` (labelled `cowSwap`).
- **Bridge in:** docs point to the Gnosis Bridge (DAI to xDAI from Ethereum) and a CoW Swap link ETH to xDAI. (H.)

## 4. Read API

**Foresight has no documented API.** `exists`: unofficial-only for Foresight itself; the authoritative data paths belong to Seer (official, see seer.md section 4) and the chain.

- Docs: NOT FOUND (searched: docs.kleros.io/products/foresight, foresight.kleros.io, the two Kleros blog posts, repo README (default create-next-app text), blog tag page). The beginner/advanced guides are Notion pages (`kleros.notion.site/...`) that do not render without JavaScript (WebFetch returned only "Notion"), so their content is unread; docs.kleros.io describes them as Google Docs, the repo links Notion (L: inconsistent).
- **App routes (Next.js on Netlify, unauthenticated GET, CORS `*`)**. These are the app's own back end, undocumented, and differ between the per-experiment deployments (each experiment is a git branch deployed on its own subdomain). From repo branches `master`, `homepage`:
  - `GET https://foresight.kleros.io/api/redeemable` returns `{anyRedeemable, experiments:[{slug, parentMarket, isRedeemable}]}`. Live, 820 B. (H, fixture.)
  - `GET https://foresight.kleros.io/api/unique-traders?parentMarket=<addr>` returns `{uniqueTraders, traders[]}`; 400 `{"error":"parentMarket query param must be a valid address"}` without the param. Live for Session 3: `uniqueTraders` 1007 (45 KB body, wallet list dropped from fixture). (H, fixture.)
  - `GET https://foresight.kleros.io/api/market-chart` returns `{data: [[[pool-hour rows ...]]]}`; on the main domain it ignores query params and serves the **Session 1** markets only (data ends 2026-04-03; 1.7 MB). (H, fixture, trimmed.)
  - Routes present in repo `master` but **404 on the main domain**: `market-volume`, `markets-liquidity`, `capital-deployed` (tested). They exist on the per-session subdomains: `GET https://<session>.foresight.kleros.io/api/markets-liquidity` returns `{data:[{name, poolBalance:[{token0{symbol,balance},token1{symbol,balance}}|null x3], liquidityUnderlying, liquiditySDai}], totalLiquiditySDai, parentOutcomeCount}` and `GET .../api/market-volume` returns `{totalVolumeSDai, totalNotionalSDai, data:[{name, notionalSDai, outcomes:[{outcome:"UP"|"DOWN", volume, notionalSDai}]}]}` (the ended `movies-r2` deployment returns only `{totalVolumeSDai}`). All HTTP 200 on 2026-10-19 for `movies-r3`, `devcon-attendance`, `devcon-satisfaction`, `movies-r2`. (H, fixtures `movies-r3_api_*`, `devcon-attendance_api_*`, `movies-r2_api_market-volume_*`.) `profit-loss` needs a `tradeExecutor` address and was not called.
- **Seer HTTP functions used by Foresight (official, public):** `https://app.seer.pm/.netlify/functions/{get-market (POST), market-chart?marketId&chainId (GET), get-portfolio-pl?account&chainId&marketId (GET)}` and `markets-charts?ids=` (GET). Live GET confirmed for a Session 3 child market: `GET https://app.seer.pm/.netlify/functions/markets-charts?ids=0x72917b537875c9dad261140684dc0c9f6ca1ea68` returned 200, 552 KB, 707 rows in the UP pool and 706 in the DOWN pool, hourly-plus snapshots from 2026-08-13 15:00 UTC to 2026-10-17 16:17 UTC. Row shape: `{pool:{id,token0{id,name},token1{id,name},liquidity}, sqrtPrice, token0Price, token1Price, periodStartUnix}`. (H, fixture `seer_markets_charts_foresight_s3_child_0x72917b53_trimmed_2026-10-19.json`.) Data was about 34 h old at fetch.
- **Subgraphs:** Swapr/Algebra subgraph via Seer's proxy (`https://app.seer.pm/subgraph?_subgraph=algebra&_chainId=100`) and Seer's Envio indexer (`...?_subgraph=seer&_chainId=100`), both GraphQL, so POST. Not called. (H for URLs in repo `.env.example` and route code.)
- **On chain:** `Market.conditionId/parentOutcome/parentMarket`, `GnosisRouter.getWinningOutcomes(conditionId)` for resolution, Swapr pool and quoter `eth_call`s. (H: repo `redeemable` route, hooks.)
- **Auth and limits:** none for the GET routes. Rate limits: NOT FOUND (searched: response headers show Netlify cache headers only; no `x-ratelimit-*`; no docs). Cache: `cache-control: no-cache` on the chart routes, `public,max-age=0,must-revalidate` on redeemable.
- **WebSocket / streaming:** NOT FOUND (polling only; repo uses react-query polling).

## 5. Trade path

- **No off-chain order or signature scheme.** Everything is ordinary EVM transactions on Gnosis from the user's EOA. (H: repo hooks.)
- **How the official UI trades (H, repo):** each user has a per-user smart contract **TradeExecutor** (owner = the user's EOA, immutable; `batchExecute(Call[])` and `batchValueExecute(ValueCall[])`, `onlyOwner`, reverts if any inner call fails). It is deployed with CREATE2 via Safe's CreateCall (`0xBE202e30F21083619F9e8e62440CDe71903b94C4`) with salt `keccak256("TradeExecutorV1", owner)`. A "predict" is one batched transaction: ERC20 approvals, `GnosisRouter.splitPosition` (collateral to item tokens, and item token to UP/DOWN/Invalid), Swapr swaps (sell the unwanted side, buy the wanted side), `mergePositions`. Slippage 1% by default (`maximumSlippage = Percent(1,100)`), 2% buffer on batch allocation, max 10 markets per batch.
- **Programmatic route for an agent:** the same calls without Foresight at all: Seer Router/GnosisRouter split/merge/redeem plus a Swapr (Uniswap-V3-style `exactInputSingle`) swap on the `itemToken/UP|DOWN` pools. Same as seer.md section 5. Cancel: n/a (atomic swaps). Limit orders: none.
- **Programmatic placement today:** pointless, since trading windows closed 2026-09-30 and the UI disables new predictions; redemption (`redeemPositions` / TradeExecutor batch) is the only live action, and only for Sessions 1 and 2.

### PayBox reachability: **partial** (M)

- Reasoning: plain `evm` contract calls fit PayBox's `io.paybox/transactionProposal` shape (one call per proposal, `chain: eip155:<id>`, any `eip155:<uint64>` syntactically allowed) (H: local note `docs/research/06-paybox-platform.md`). The TradeExecutor `batchExecute` would let a whole predict be a single call after a one-time deploy (M: inferred from the contract, not tested).
- Gating issue: **Gnosis (100) is not in PayBox's featured chain catalog** (11 chains: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid; H via note 06, 2026-10-19). The Seer note records that a catalog search for "gnosis" returns `eip155:100` (native xDAI) but whether proposals/simulation work there is untested. The catalog says it is "not a support allowlist". So: unknown, leaning "maybe". Collateral sDAI/xDAI acquisition path on PayBox: NOT FOUND.
- No PayBox money-moving tool was called.

## 6. Fees

- **Foresight protocol fee:** none found. NOT FOUND (searched: docs.kleros.io/products/foresight (states no fee schedule), Kleros blog posts of 2026-03-04, 2026-06-03, 2026-08-31 (all "not stated"), repo code search for "fee" (hits only Swapr/Quoter/CoW ABIs and a help string), Seer note section 6 (Seer itself has no protocol trading fee)). Treat as zero protocol fee (M).
- **Pool fee:** paid by the trader to LPs of the Swapr (Algebra V3) pool; Algebra uses a dynamic fee returned by the quoter. The actual level for these pools: NOT FOUND.
- **Other costs:** xDAI gas (cheap on Gnosis); Reality.eth answer bonds and Kleros arbitration fee for answerers/disputers only. (H via docs.)
- **Subsidy:** participants got sponsored trading credit: Session 1 gave EthCC POAP holders and Proof-of-Humanity-verified humans $25 of credit (handpicked group $50). Docs say PoH-verified humans and Seer community members can use monthly Seer credits. (H: Kleros blog 2026-06-03; docs.kleros.io.) So a good share of volume was likely credit-funded.

## 7. Resolution and dispute risk

- **Oracle (H, docs.kleros.io + blogs):** Reality.eth (bonded answers; a challenger doubles the bond; escalates), with Kleros Court as arbitrator if a dispute passes the bond threshold; if nobody disputes, Kleros is not involved. Seer's RealityProxy contracts and timing: see seer.md section 7 (answer timeout 3.5 days after last answer; Kleros ruling up to about 14.5 days plus 11 days per appeal; M for reuse here since I did not re-read those contracts).
- **Source of truth is one person's rating.** Movies: the judge's (Kleros CTO) Criticker percentile score, submitted as the Reality.eth answer after trading closes. DevCon: a post-event Tally survey (satisfaction) and unique non-staff entries (attendance). (H.) Risks: (a) the judge is an insider who also chooses one of the five evaluated items; (b) selection uses a block hash for the random item; (c) subjective, off-chain data; (d) items not selected never resolve, so positions on them only unwind in the AMM or by merging back.
- **Timeline observed (H/M):** Session 1 closed 2026-04-03; results post 2026-06-03 (exact on-chain resolution date NOT FOUND). Session 2 closed 2026-07-05; blog of 2026-08-31 says redemption is live (exact date NOT FOUND). Session 3 / DevCon closed 2026-09-30; not redeemable at 2026-10-19 (19 days). Expect a month to two months from close to cash-out.
- **Contract audit:** none listed for the Foresight layer (TradeExecutor is 40 lines, MIT, no timelock or upgrade; owner-only). Seer Core audit status: see seer.md.

## 8. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| Session 1 participants | 113 traders; volume "not tracked" | Kleros blog 2026-06-03 (H) |
| Session 2 participants / volume | about 337 participants, about $4.18K "moved through the markets" | Kleros blog 2026-08-31 (H) |
| Session 3 distinct traders | 1,007 | `GET /api/unique-traders?parentMarket=0xacc15c...` 2026-10-19 (H; definition per route source, M) |
| **Session 3 pool liquidity** (20 markets) | **total 889.55 sDAI-equivalent**, 41.4 to 47.4 per market (e.g. Interrogation: pools hold 146.7 IGN / 738.6 DOWN and 432.5 IGN / 82.1 UP) | `GET https://movies-r3.foresight.kleros.io/api/markets-liquidity` 2026-10-19 (H; fixture) |
| Session 3 volume | 1,573.66 sDAI "volume" (underlying-side swap volume of the pools, divided by 20), 3,457.98 sDAI "notional" (outcome-token volume, divided by 20) | `.../api/market-volume` 2026-10-19 (H; fixture; method per route source `src/app/api/market-volume/route.ts`) |
| DevCon Attendance (7 events) | liquidity 1,989.14; volume 1,542.76; notional 3,161.11 sDAI | `devcon-attendance.foresight.kleros.io/api/...` 2026-10-19 (H; fixture) |
| DevCon Satisfaction (7 events) | liquidity 1,968.96; volume 1,408.19; notional 3,222.39 sDAI | `devcon-satisfaction.foresight.kleros.io/api/...` 2026-10-19 (H; totals only kept in this note) |
| Session 2 (ended, resolved) | liquidity **0** (all 20 pools show zero balances: liquidity was withdrawn after close); volume 3,339.05 sDAI | `movies-r2.foresight.kleros.io/api/...` 2026-10-19 (H; volume fixture saved) |
| Per-pool depth sample | "Interrogation (1982)" UP and DOWN pools both carry active liquidity `L = 783588347613520351327` (same in both, so seeded identically) | chart rows 2026-10-17 (H) |
| Seer-wide context | TVL $0.34M, DefiLlama 2026-10-18 | seer.md (H there) |

How to read these: the route converts item-token balances to "session sDAI" by dividing by the number of items (one sDAI splits into one item token per item), so figures are sDAI-equivalents by the app's own method, not audited USD (M: formula read in the repo, the meaning inferred). Sessions 1 and 2 volumes differ between sources (blog: about $4.18K for Session 2; API: 3,339 sDAI), which is the expected size of rounding and method differences (L).

Net: small-stake scale. Roughly $1K to $2K of pool liquidity per session, spread over 7 to 20 markets (about $40 per movie market, about $280 per DevCon event), and cumulative volume of $1.4K to $3.3K per session. A trader moves a few tens of dollars per market before price impact bites. Liquidity is still sitting in the Session 3 and DevCon pools after the close and is withdrawn only later (Session 2 shows zero).

## 9. Event coverage and arbitrage overlap

- Categories: judge-rating scalar markets (movie percentile), event statistics (attendance, satisfaction). **No overlap** with sports, politics, crypto price or macro markets on Polymarket, Kalshi, XO or elsewhere (H: questions read from the site and repo). No cross-venue arbitrage exists.
- Only structural arb inside the venue: item-token complete-set identities (UP + DOWN vs 1 item token via split/merge; pools priced independently, Yes+No style overround 1.005 in the sample). Capacity is tens of dollars. Not worth a leg.
- Signal value: low. The prices are a crowd forecast of one person's taste, and the selection rule makes them reflexive.

## 10. Shared liquidity? (H)

**Yes, entirely.** Foresight owns no pools or contracts of its own for trading:
- The Session 3 parent market `0xacc15cfa...` and child market `0x72917b53...` are EIP-1167 clones of Seer's `Market` implementation `0x8F76bC35F8C72E5e2Ec55ebED785da5efaa9636a`, created by `0x83183DA839Ce8228E31Ae41222EaD9EDBb5cDcf1`, which Blockscout names `MarketFactory` and the Seer note lists as the Gnosis MarketFactory. (H, fixture `gnosis_blockscout_foresight_market_creator_2026-10-19.json`.)
- Every Foresight page links to `app.seer.pm/markets/100/<parent>` as "advanced trading (LP or outcome tokens)", and the app's own routes fetch pool balances, charts and P&L from `app.seer.pm/.netlify/functions/*`. (H.)
- The pools are public Swapr pools, so any DEX router could trade them. So Foresight is a front end plus experiment design on Seer, not an independent arbitrage leg. Seer itself is independent of the other venues per seer.md.

## 11. Geo, ToS, automation

- **ToS / geo rules:** NOT FOUND (searched: `foresight.kleros.io/{terms,privacy,tos,robots.txt}` all 404, `kleros.io/terms` 404, repo code search for "terms of service", "jurisdiction", "restricted", "disclaimer", "geoblock", "VPN" returned nothing, docs.kleros.io Foresight page "Participation Rules": anyone with xDAI or sDAI; Kleros blog: no eligibility restrictions stated). The Notion guides and FAQ are unread. Do not read this as "no restrictions".
- **Automation:** no stated policy. The app routes send `Access-Control-Allow-Origin: *`; trading is permissionless on chain. No API key. Be polite: cache `market-chart` (1.7 MB) and prefer Seer's own endpoints.
- The platform calls itself experimental, "features may change" and low-stakes beta (H docs/blog).

## 12. Adapter spec

- **Recommendation:** no Foresight adapter. `adapter_priority`: skip.
- **For the Seer adapter:** exclude Foresight markets by address. Parent markets: `0x6f7ae281...493e`, `0x6b182ffe...ab1f`, `0xacc15cfa...436a`, `0xd1d81ec6...efc4`, `0xf094a219...5359` (full addresses in section 1 and repo `experiments.ts`), and their `childMarkets`. Seer's `markets-search` defaults to `showConditionalMarkets=false`, so the children are probably already filtered out (M); the parents are categorical markets with items as outcomes and would show up. Their category/URL give no flag, so use the address list.
- **If a Foresight view is wanted later:** poll `GET /api/redeemable` for state, Seer `markets-charts?ids=` for prices, `GnosisRouter.getWinningOutcomes(conditionId)` for resolution. Id scheme `100:<marketAddress>`; outcome ids = `upToken`/`downToken` ERC20 per child market (listed in the per-session `src/consts/markets.ts` on branches `movies`, `movies-r2`, `movies-r3`, `devcon-*`).
- **Units gotchas:** sDAI is not USD; price is item-token per UP token, not sDAI, so converting to a USD-denominated payout needs the item token's own value (about 1/(number of winners) per selected item, 0 if unselected); the main-domain `/api/market-chart` serves Session 1 only.

## 13. Open questions

1. Is a Session 4 or any new Foresight experiment planned? (News search not possible this session.)
2. Content of the Notion Beginner/Advanced guides and FAQ (JS-rendered; unread): fee, risk, eligibility text may be there.
3. The Swapr fee level on these pools, and whether the app's "sDAI-equivalent" liquidity (item-token balances divided by item count) matches a real sDAI redemption value.
4. Exact Reality.eth question parameters (min bond, timeout, arbitrator) for these markets; actual resolution dates of Sessions 1 and 2.
5. Whether the Swapr pools can still be swapped on-chain after the UI deadline (inferred yes from the 2026-10-17 price change).
6. Whether PayBox can simulate/send proposals on Gnosis (chain 100).

## Suspicious content / injection check

None found. The landing page, DevCon/Movies pages, repo (README is stock create-next-app text), blog and docs contain no instructions aimed at an AI agent. A commit message in the repo credits an AI co-author (benign). The `.env.example` in the repo was read from GitHub (not from disk); it has empty placeholders only.

## Sources

Primary (H):
- https://foresight.kleros.io (landing; five experiments) and subpages https://movies-r3.foresight.kleros.io, https://devcon-attendance.foresight.kleros.io, https://devcon-satisfaction.foresight.kleros.io
- https://github.com/kleros/futarchy-ui (branches `master`, `homepage`, `movies-r3`, `devcon-attendance`, `devcon-satisfaction`, `factory`; files `package.json`, `.env.example`, `src/consts/{index,markets,experiments,experimentChildMarkets}.ts`, `src/app/api/*/route.ts`, `src/contracts/TradeExecutor.sol`, `src/utils/{trade,calculateLiquidity}.ts`, `src/hooks/tradeWallet/*`, `src/hooks/useMarketResolutionInfo.ts`; read via `gh api`)
- https://docs.kleros.io/products/foresight
- https://blog.kleros.io/kleros-foresight-movie-experiment/ (2026-03-04), https://blog.kleros.io/what-the-first-foresight-experiment-taught-us-about-predicting-clements-movie-taste/ (2026-06-03), https://blog.kleros.io/the-market-won-this-time-season-2-of-the-foresight-movie-experiment/ (2026-08-31), https://blog.kleros.io/tag/prediction-markets/
- Live GETs 2026-10-19: `https://foresight.kleros.io/api/{redeemable,unique-traders?parentMarket=,market-chart}`, `https://app.seer.pm/.netlify/functions/markets-charts?ids=0x72917b53...`, `https://gnosis.blockscout.com/api/v2/addresses/{0xacc15cfa...,0x72917b53...,0x83183DA8...}`
- Local notes: `docs/research/venues/seer.md` (Seer API, fees, resolution, factory address), `docs/research/06-paybox-platform.md` (PayBox proposal shape, chain catalog)

Not read / blocked:
- Notion guides `kleros.notion.site/Kleros-Foresight-Beginner-User-Guide-30d9a9db4f088064a588f7d5acc2751f` and the Advanced guide (JS-rendered; WebFetch returned only "Notion").
- Seer POST endpoints, Swapr/Envio GraphQL (POST; not called per ground rules).
- Search-snippet only (L): Gnosis DAO GIP-145 futarchy pilot (https://forum.gnosis.io/t/gip-145-should-gnosis-dao-run-a-9-month-advisory-futarchy-pilot-with-100k-temporary-liquidity/11816), not read.

Fixtures saved (docs/research/fixtures/kleros-foresight-futarchy/): `foresight_api_redeemable_2026-10-19.json`, `foresight_api_unique_traders_count_2026-10-19.json`, `foresight_api_market_chart_session1_trimmed_2026-10-19.json`, `seer_markets_charts_foresight_s3_child_0x72917b53_trimmed_2026-10-19.json`, `gnosis_blockscout_foresight_market_creator_2026-10-19.json`, `movies-r3_api_markets-liquidity_2026-10-19.json`, `movies-r3_api_market-volume_2026-10-19.json`, `devcon-attendance_api_markets-liquidity_2026-10-19.json`, `devcon-attendance_api_market-volume_2026-10-19.json`, `movies-r2_api_market-volume_2026-10-19.json`.
