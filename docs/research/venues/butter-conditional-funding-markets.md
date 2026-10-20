# Butter (conditional funding markets / "conditionals") - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran about 02:00-02:45 UTC). READ-ONLY: unauthenticated GETs to `butter.markets`, `app.butter.markets`, `docs.butter.markets`, the public Unichain Blockscout REST API, `api.llama.fi` and `gh api` raw file reads; one read-only PayBox `discover_tokens` (mode=chains) call. No account, waitlist form, wallet, key, signature, POST/PUT/DELETE or money/signing PayBox tool was used. No third-party code was cloned, installed or run (the app's JS bundle was downloaded and grepped as text only). Third-party pages, bundles and API text were treated as untrusted data; nothing in them was followed. WebSearch was NOT available (the shared session budget was exhausted), so there is no news/press leg and nothing was searched through proxies.

Tags: **H** = read first-hand in a primary source this session (cited), **M** = secondary / inferred from first-hand data, **L** = weak or stale (older than 6 months counts as possibly stale).

Fixtures (<= 50 KB each): `docs/research/fixtures/butter-conditional-funding-markets/` (listed in section 13).

---

## 0. Bottom line

1. **Online but dormant, and not open to outsiders. adapter_priority = skip (watch-list).** The marketing site, app and docs all respond (H), but (a) the app is a waitlist / wallet-allowlist front end with a region block, (b) the on-chain factory has created **no new market since 2025-12-30** and `ConditionalTokens` has seen **no new condition at all in 2026** (H, Unichain logs), (c) new top-level collateral minted in 2026 is about **$41** versus about **$59k** in Aug-Dec 2025 (H, derived from logs), and (d) the one live-looking market family I could inspect (BTC price bins, created 2025-12-30) was seeded with roughly 750 outcome tokens, saw trades of about $3-$21 and one of 10 units, and its seed liquidity appears to have been pulled out on 2026-05-09 (three PoolManager-to-deployer transfers of exactly the seed amounts; M), so the pool is probably empty.
2. **The discovery label was half right.** "Butter" is the successor of the "Conditional Funding Markets" (CFM, futarchy-for-grants) product, but the docs (space created 2025-11-03, last edited 2026-02-20) now brand it a **"conditionals exchange"**: (i) asset price conditional on an event outcome (BTC if the Fed cuts / holds / hikes) and (ii) plain **event markets** with per-outcome YES/NO tokens that the docs themselves say can be compared against Polymarket. Only the CFM v1 contracts are published; I found no separate deployment for the newer event-market UI (section 2).
3. **No official REST/WebSocket API.** The app reads a public **Goldsky GraphQL subgraph** (queries are POST, so I did not exercise it) and the chain. Everything is on **Unichain (chain id 130)**, USDC collateral, Gnosis Conditional Tokens (ERC-1155 wrapped to ERC-20) + **Uniswap v4 pools** (0.30% fee observed), Reality.eth + Kleros for resolution.
4. **Independent liquidity, but there is none worth arbitraging.** It does not share liquidity with another prediction venue (its own pools), so it would be an independent leg, but there is essentially no depth and nothing to trade against. The docs' cross-venue arbitrage example (spot-implied probability vs Polymarket) is a reasonable *idea* for a future adapter if the product ever launches publicly.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.butter.markets/` | HTTP 404 (matches the discovery hint). `https://butter.markets/` -> 302 -> `https://app.butter.markets/` (200). | H |
| App `<title>` / meta | "Butter - Trade Every Outcome"; "Go long if it happens, short if it doesn't. Prediction Markets tell you what happens. Conditionals let you trade what happens next." (https://app.butter.markets/, fetched 2026-10-19) | H |
| App is an SPA with auth + allowlist gate | Bundle `index-DDuDoASO.js` (566 KB, read as text): routes `/`, `/trade`, `/portfolio`, `/request-access`, `/privacy-policy`, `/:megaCFMId/:flatCFMId`; gated path prefixes `/markets`, `/kpi-market`, `/cfm`, `/portfolio`; login error `allowlist_rejected` -> "Your wallet address is not yet approved. Please request access to continue."; disabled button "Join Waitlist" with title "Unavailable in your region". | H |
| Docs | `https://docs.butter.markets/` 200 (GitBook, "Butter Conditionals"). Space createdAt 2025-11-03, updatedAt 2026-02-20; page footers say "Last updated 7 months ago" (about March 2026, possibly stale). | H |
| GitHub org `buttermarkets` (blog = butter.markets, X handle `buttermarkets_`) | `cfm-v1` last commit 2026-02-05; `ggresearch` (static archive of their forum "Exported February 2026") 2026-02-25; `butterql` (a Polymarket-targeted skill) 2026-03-12; `learn-futarchy` reading list 2026-07-14. No commits to contracts since February. The docs repo (`butterygg/docs`, branch `conditionals`) is private/not visible. | H |
| New markets on-chain | `InvalidlessFlatCFMFactory` (146 txs total): newest `createConditionalScalarMarket` tx **2025-12-30T15:43:03Z**; newest `FlatCFMCreated` log block 36361024 (also 2025-12-30). `ConditionalTokens` logs: **zero `ConditionPreparation` events in 2026** (57 in Dec 2025). Reality.eth newest `LogNewQuestion`: 2025-12-30. | H |
| Latest on-chain activity of any kind | `ConditionalTokens` newest events 2026-08-22T18:30:47Z; August 2026 has only two txs (2026-08-17 and 2026-08-22) with 5 `ConditionResolution`, 8 `PositionSplit` (about $19 in total) and some redemptions. The 08-22 tx has no `to` (a contract-creation tx, i.e. a script or sweeper), so it is not obviously a user. Reality.eth newest answers 2026-05-09 (min bond). | H |
| DefiLlama | No Butter conditional-markets protocol in `api.llama.fi/protocols` (only unrelated "Butter Network", "ButterSwap", "Butter.xyz", "Butterfly Finance"). | H |
| SoK catalogue (evidence for the discovery) | `protocol_catalogue.csv` row: `Butter,Hybrid,Centralized,Binary,Curated,Ethereum L1,DAO,Multi-asset,Active`; verification CSV: "Ethereum L1 / Unichain, Conditional Funding Markets (futarchy hybrid), TWAP / metric-based, Active ... https://www.butter.markets/". Repo created 2026-07-04. No volume given. Its "Ethereum L1" and "Centralized" oracle labels disagree with the docs and chain data (Unichain, Reality.eth/Kleros). | H that the row exists; M on its accuracy |
| Uniswap-side context | The bundle links Uniswap Governance threads "Unichain Growth CFM #1" (Venus, Morpho, Euler, Compound applications). One of them (Morpho, posted 2025-07-03) is a $100k grant application; the page text does not name Butter as the operator and says nothing about trading venue or liquidity. | H (links), L (inference that Butter ran it) |
| X / Twitter | `https://x.com/buttermarkets_` returned **HTTP 402 Payment Required** to WebFetch with no payment requirements in the body; stopped there as instructed. | H |

Verdict: **still_live = false in the sense that matters for an aggregator** (nothing an outside agent can trade, no new markets in 10 months); the site, docs and contracts remain online. Confidence medium: I could not see what the allowlisted app shows, and the Goldsky subgraph (the app's own market list) was not queried (POST).

---

## 2. Kind and market model

- **Kind:** onchain-other. Prediction / decision-market protocol built from the Gnosis **Conditional Tokens Framework** (CTF) plus **Uniswap v4** AMM pools. No order book, not parimutuel. (H: https://docs.butter.markets/technical-docs/v1-contracts.md, https://docs.butter.markets/technical-docs/v1-dependencies.md.)
- **Product A, "CFM v1" (H, contracts + repo):**
  - `FlatCFM` = a decision condition with N mutually exclusive outcomes ("which project gets funded", or in the late-2025 consumer markets, "which BTC price bin").
  - Per decision outcome, an `InvalidlessConditionalScalarMarket` (a second CTF condition with outcomes `Short`/`Long`, payout linear between `minValue` and `maxValue` of a metric; code: `payouts[0]=max-answer`, `payouts[1]=answer-min`, clamped). If the metric answer is Invalid, a `defaultInvalidPayouts` ratio (default 50/50) applies.
  - Users `splitPosition` USDC into decision tokens, then again into scalar Short/Long tokens. Tokens are ERC-1155 wrapped to ERC-20 by `Wrapped1155Factory` and traded in Uniswap v4 pools (repo scripts `CreateIfCollateralPools`, `V4CreatePool`: pools "IF-token / collateral" with initial price 1/N, and "Short / Long" per outcome). Tokenisation example: ERC-20 `IF-BTC > $130,000` (6 decimals, total supply 1,050.51, 3 holders; Unichain Blockscout token page).
- **Product B, "event markets" (docs, H for the text, no matching contracts found):** an event has a fixed set of mutually exclusive outcomes; YES for an outcome pays 1 USDC if realised; NO is synthetic (buy/sell the complement outcomes' YES tokens and wrap); intents `BUY_YES|SELL_YES|BUY_NO|SELL_NO`; mandatory YES/NO netting; price quoted in USDC per share = implied probability up to fees (https://docs.butter.markets/user-guide/trading-event-markets.md). This is categorical (and binary as the 2-outcome case), no scalar.
- **Product C, "event conditionals" (docs, H for the text):** per event x asset x branch (e.g. BTC-USD if "Cut >=25 bps"), the branch price forecasts the asset's price in that branch; positions are scalar Long/Short tokens bounded by `lowerBoundPrice`/`upperBoundPrice`; payoff `clamp((settle-lower)/(upper-lower),0,1)` for Long and the complement for Short; "Multi Mode" keeps collateral spread across branches, "Single Mode" concentrates it (docs example: 20x selected-branch exposure for a $0.05 outcome token); no liquidations or funding (https://docs.butter.markets/core-concepts/scalar-tokens.md, `/leverage-and-exposure.md`, `/user-guide/getting-started.md`). Not a prediction-market price: branch price is in asset dollars, so it is not directly comparable across venues; only the spot-implied probability formula in the docs is.
- IDs: CTF `conditionId` (bytes32), 1155 `tokenId`, wrapped ERC-20 addresses, Uniswap v4 `PoolId` (bytes32). `Wrapped1155Creation(multiToken, tokenId, wrappedToken)` events map one to the other (H, Blockscout logs).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | **Unichain, chain id 130** (PayBox catalog: `eip155:130`, native ETH). Block time 1 s (Blockscout stats `average_block_time` 1000 ms; two blocks checked exactly). | H |
| Collateral | Circle USDC on Unichain `0x078D782b760474a361dDA0AF3839290b0EF57AD6`, 6 decimals; it is the `collateralToken` of all 846 `PositionSplit` events I paged. | H |
| Contracts (docs table, all on Unichain) | `InvalidlessFlatCFMFactory 0x177a62898d6746a1Fb9311a657240BF3239f3ac0` (verified), `InvalidlessConditionalScalarMarketFactory 0x714aa521A3D6159fC1A7B8BB28Fed508e11259c0` (unverified, 0 direct txs), `FlatCFMRealityAdapter 0xB99517009AcD09404066CfEB163dEb6e832abf11` (verified), `ConditionalTokens 0xc8E244eB32200e6274E7737238AFa60eC6cf2511`, `Wrapped1155Factory 0x87bc2f26DF5D72B3e45b298127e702ba7ED459ea`, `RealityETH_v3_0 0xB920dBedE88B42aA77eE55ebcE3671132ee856fC`, "CFM Arbitrator" `0xd04f24364687dBD6db67D2101faE59e91a6e605B`. Uniswap v4 `PoolManager 0x1F98400000000000000000000000000000000004`. | H (docs fixture + Blockscout) |
| Deploy dates | Conditional-tokens / wrapper / adapter / factory deployed 2025-07-02; scalar-market factory 2025-08-09. | H |
| Deposits | The app's "Deposit" bridges USDC from any other chain into the user's Butter wallet on Unichain; the bundle calls `api.relay.link` (Relay) for that. Withdrawals go back to the connected wallet on Unichain only. | H (docs), M (Relay role, from bundle strings) |
| Other deployers | Two other `FlatCFMRealityAdapter` deployments by unrelated deployers exist on Unichain (different arbitrators/timeouts, 0 txs). The code is GPL-3.0 and permissionless; they are not Butter. | H |

---

## 4. Read API

**Official public REST/WebSocket API: NONE FOUND** (searched: docs llms.txt index of 14 pages, docs site for "API"/"endpoint"/"websocket", app bundle for `fetch(` and URLs, GitHub org repos). What exists:

| Source | What | Notes | Tag |
|---|---|---|---|
| Goldsky public subgraph | `https://api.goldsky.com/api/public/project_cmcsw8uvmq2w501tv73tscml7/subgraphs/cfm-v1-unichain-mainnet/2.4.0/gn` | The app's market list (`megaCFMs`, `flatCFM`, `conditionalMarket` objects). GET returns only the GraphiQL page (HTML); GraphQL queries need POST, which I did not send. Schema, indexing health and rate limits therefore NOT VERIFIED. The URL carries a version (`2.4.0`), so it can change without notice. | H (URL), L (contents) |
| Unichain chain data | `Wrapped1155Creation`, `ConditionPreparation`, `ConditionResolution`, `PositionSplit`, `PayoutRedemption` events (CTF); Uniswap v4 `Initialize`/`Swap`/`ModifyLiquidity` events and `StateView.getSlot0(poolId)` for price; Reality.eth `LogNewQuestion`/`LogNewAnswer` | Needs JSON-RPC (POST) or an indexer; a public Unichain RPC URL is not named in Butter's docs (NOT FOUND). Price from `sqrtPriceX96` of each IF/USDC pool = outcome probability (initial price 1/N). | M |
| Unichain Blockscout (third party) | `https://unichain.blockscout.com/api/v2/...` - GET, no key, I read `addresses/{a}`, `/logs`, `/counters`, `tokens/{a}`, `/transfers`, `transactions/{h}/logs`, `smart-contracts/{a}`, `search?q=` | Usable for backfill and for this research; rate limit not documented; paging via `next_page_params`. | H |
| Docs as data | `https://docs.butter.markets/llms.txt` and `<page>.md` | Machine-readable docs only. | H |

Auth / limits: none visible for any of the above; Butter-specific rate limits NOT FOUND. WebSocket: NOT FOUND.

---

## 5. Trade path and PayBox reachability

- **Via Butter's app (H, docs `your-butter-account`):** connecting an EVM wallet makes the app create a "Butter wallet" on Unichain "controlled by your connected wallet"; "Your external wallet signs every action, and the Butter wallet executes those actions". On-chain evidence agrees: the trader accounts that interact with the pools appear as `SafeProxy` contracts in Blockscout (H). The bundle references a Pimlico bundler (`api.pimlico.io/v2`), `smartAccountAddress`, and about 30 `paymaster` strings (M: ERC-4337 Safe smart account, probably sponsored gas; whether gas is sponsored is NOT FOUND). Access also needs email waitlist approval and the same wallet to be on the allowlist.
- **Without the app (M, inferred from contract design):** every step is a permissionless contract call on Unichain: USDC `approve` -> `ConditionalTokens.splitPosition` -> `Wrapped1155Factory.requireWrapped1155` -> Uniswap v4 swap (Universal Router / `PoolManager.unlock`). I could not confirm that the pools carry no allow-listing hook (pool hook addresses were not read), so this is unproven.
- **PayBox reachability: partial.** PayBox's catalog lists Unichain (`eip155:130`; `discover_tokens mode=chains`, 2026-10-19; the tool itself says "metadata catalog, not a support allowlist"). A PayBox EVM MPC wallet has one address on every `eip155:*` chain (docs/research/06). So an EOA transaction-proposal path (approve, split, wrap, swap) or an agent-orchestrated `request_wallet_sign` for a userOp hash could in principle work, but (i) unsupported-chain proposal behaviour is unverified (see docs/research/06), (ii) the flow is 4+ transactions per trade and needs Uniswap v4 calldata building, (iii) the venue is allowlisted/region-blocked, and (iv) there are no markets with liquidity. Nothing was signed or simulated.
- Programmatic order model if ever built: AMM swaps with `minAmountOut` slippage (the app's "Max slippage"); no resting orders, no cancel.

---

## 6. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Uniswap v4 pool LP fee | `fee = 3000` (0.30%) in every `Swap` event of a Butter trade tx on 2026-01-29 (10 pools, tx `0x85b23db1...`); liquidity was full range (tickLower -887200, tickUpper 887200) in the one `ModifyLiquidity` I decoded. | Trader (paid to LPs, i.e. mostly Butter's own seed positions) | H (one tx); M for "all pools" |
| App fee display | "Fees shows the fee rate for the trade. It is included in Balance change." No schedule published. | Trader | H (docs) |
| Butter / protocol fee, withdraw fee | NOT FOUND (searched: docs 14 pages, bundle for "fee"). Uniswap v4 protocol-fee default is 0 but not verified for these pools. | - | - |
| Oracle cost | Reality.eth answering requires a bond: `minBond` = 0.02 ETH, `questionTimeout` = 172,800 s (48 h) in the live adapter constructor (Blockscout verified-contract args). A question fee is paid at question creation (tests: `ScenarioQuestionFee`). | Market creator / answerers | H |
| Gas | Unichain gas is about 0.01 gwei (Blockscout stats 2026-10-19), negligible. | - | H |

---

## 7. Resolution mechanism and dispute risk

- **Oracle:** Reality.eth v3 on Unichain via `FlatCFMRealityAdapter`; arbitrator = Kleros arbitration proxy (`RealitioHomeProxyOptimism`, a home-chain proxy that bridges disputes to Kleros on Ethereum; Blockscout verified source). (H.)
- **Process:** anyone posts an answer with a bond (min 0.02 ETH, doubling on challenge); finalises after 48 h unticked; `FlatCFM.resolve()` / `ICSM.resolve()` then call `reportPayouts` on the CTF; holders `redeemPositions`. For consumer-style price markets the docs say the settlement price is "the median price over a two-hour window that starts 12 hours after the event timestamp or market expiry"; their `metric-report/cmc-median` tool computes that median from CoinMarketCap's chart API (H, repo README). Resolution therefore depends on a centralised price site and on the team (or someone) answering; the newest answers I saw were at the 0.02 ETH minimum bond.
- **Invalid handling:** decision question Invalid -> the whole CTF condition is invalid and the INVALID token pays 1 USDC, so traders get deposits back; metric question Invalid -> `defaultInvalidPayouts` (50/50 by default, i.e. "as if the market closed at 0.5 USDC"). Docs claim questions were reviewed by Kleros and Reality.eth and "previous CFM questions have never resulted in Invalid outcomes" (vendor claim, M/L).
- **Dispute risk:** the shared `RealityETH_v3_0` instance has logged 195 `LogNewQuestion` and 2 `LogNotifyOfArbitrationRequest` events in total (H, Blockscout; not all questions are necessarily Butter's). Low bond (0.02 ETH) and a 48 h window make a thin market easy to mis-resolve if nobody watches; the 12 h post-event delay is a stale-data window. Audits: Trust Security (several rounds), team Omega, and a $30k Immunefi competition are listed in the repo `audits/` folder and the docs (H, repo file list; reports not read).
- **Admin / upgrade risk:** factories are deployed contracts; whether any role can pause or alter markets was not reviewed (NOT FOUND).

---

## 8. Geo, ToS and automation

- Access is gated three ways (H, app bundle + docs): email waitlist ("After you receive an email confirming you have been whitelisted, press Connect Wallet ... and connect the same address as before"), a wallet allowlist check (`allowlist_rejected`), and a region block ("Unavailable in your region" disables the waitlist button). Which regions: NOT FOUND (the logic is server-side or not readable in the bundle; searched for jurisdiction/OFAC/country strings: 0 hits).
- ToS: NOT FOUND. `/terms` returns the SPA shell, the docs have no terms page, and the bundle contains no terms text (only a `/privacy-policy` route). No statement about bots, scraping or automation (searched: docs, bundle).
- `robots.txt` on the app host returns the SPA shell (no robots file). I did not create an account or submit the waitlist form.
- Practical reading: even if a PayBox wallet could call the contracts directly, the operator evidently intends an allowlisted, region-restricted beta; an automated trading adapter would need written clearance.

---

## 9. Liquidity

All numbers from Unichain logs via Blockscout GET (windows stated; timestamps computed from block heights at 1 s/block, verified exactly against two blocks).

| Metric | Value | Tag |
|---|---|---|
| New top-level collateral split into conditional tokens (parent collection = 0) | Aug 2025 (from 2025-08-10): $9.6k; Sep $19.4k; Oct $1.7k; Nov $23.3k; Dec $5.1k; **Jan-Oct 2026 about $41** (Feb $25, Aug $16). About $59k for Aug-Dec 2025 (logs before 2025-08-10 not paged, so the all-time total is higher). Fixture `ct-activity-by-month-derived.json`. | H (derived) |
| Redemption payouts | about $25k in 2026 (mostly April-May), i.e. old markets settling, not new trading. | H (derived) |
| Open conditions | 147 `ConditionPreparation` events in the window vs 85 `ConditionResolution`; 66 prepared conditions (40 from Dec 2025) have no resolution event in the window. Whether any is still open and tradable is unknown. | H (counts), L (interpretation) |
| Latest BTC price-bin market (created 2025-12-30) | Token `IF-BTC > $130,000`: total supply 1,050.51, 3 holders; 500 + 125 + 125 tokens sent to the PoolManager on 2025-12-30 (seed LP); trades of about $3-$21 on 2025-12-30 and one 10-unit swap on 2026-01-29 (pool liquidity param L = 138,675,047, full range); on **2026-05-09** three transfers PoolManager -> deployer of 499.999991 / 124.999999 / 124.999999 tokens, which look like the seed liquidity being withdrawn (the pool is probably empty now). | H (transfers), M (interpretation) |
| TVL / OI / volume from an aggregator | NOT FOUND (DefiLlama has no listing; SoK catalogue gives "--" for volume/TVL). | H (absence) |

Conclusion: effectively seed money and tests, no organic depth.

---

## 10. Event overlap and shared liquidity

- **Categories (H for what the docs/markets contain):** crypto price brackets (BTC bins, the same shape as Polymarket/Kalshi "BTC price on date X" brackets; `butterql` in their org is built for Polymarket bin markets), macro (FOMC rate-decision experiments - `metric-report` has `2025-10-fomc` and `2025-11-betalaunch-fomc` directories, and the docs use "Fed rate decision (December)" as the example; I did not locate the corresponding on-chain markets), earnings-style examples (AAPL), and DeFi KPI/grant decisions (Unichain Growth CFM, TVL metrics) that no other venue lists. Docs explicitly suggest cross-checking against Polymarket (section "Arbitrage across venues").
- **Overlap in practice today:** none tradable (no open, funded market found). Any future overlap would be BTC/ETH price brackets and Fed decisions; resolution differs (CoinMarketCap median over a 2 h window starting 12 h after expiry vs each venue's own rule), so basis risk is high.
- **Shared liquidity:** none with another prediction venue. Pools are Butter-created Uniswap v4 pools; the conditional-token contracts are Butter's own redeployment of the Gnosis CTF (not the Omen/Seer instances on Gnosis Chain). Uniswap v4 `PoolManager` is shared infrastructure, but the pool IDs are unique to Butter's tokens. So it would be an independent arbitrage leg if it had liquidity (it does not).

---

## 11. Priority

**adapter_priority = skip** (closed/allowlisted, dormant on-chain, no official API, no liquidity). Re-check triggers: a new factory/`ConditionPreparation` activity on Unichain, a public launch announcement removing the waitlist, a documented public API, or any open market with more than a few thousand dollars of pool liquidity. If revisited, the cheapest adapter is read-only: poll the Goldsky subgraph (after a POST-based schema check) or index `ConditionPreparation`/`Wrapped1155Creation` + v4 `Swap` events from the factory, convert each IF/USDC pool `sqrtPriceX96` to a probability, and use it as a signal only.

---

## 12. NOT FOUND and open questions

- NOT FOUND (searched: docs 14 pages, bundle strings, GitHub org): official API docs, websocket, rate limits, fee schedule beyond the 0.30% pool fee, ToS / automation policy, list of blocked regions, public Unichain RPC recommendation, current list of open markets, contract addresses for the "event markets" UI (only CFM v1 addresses are published), protocol/admin roles.
- Not exercised by rule: Goldsky GraphQL (POST), JSON-RPC (POST), waitlist, any wallet action. WebSearch unavailable (budget), so there is no press, funding, team-status or announcement check; X returned 402.
- Open: (1) what the allowlisted app lists right now; (2) whether the Aug-2026 `ConditionalTokens` activity (a contract-creation tx resolving five conditions) is a Butter cleanup or a third party; (3) whether pools use hooks that block non-allowlisted accounts; (4) whether the docs' "conditionals" product is deployed anywhere other than the CFM v1 contracts.

## Suspicious content (embedded instructions in third-party material)

None found. The app bundle and docs contained no text aimed at AI agents. (The docs add `llms.txt` and `.md` mirrors for agents, which is normal; nothing in them issued instructions.)

## Sources

- https://butter.markets/ (302 to app), https://www.butter.markets/ (404), https://app.butter.markets/ and its bundle https://app.butter.markets/build-ro/assets/index-DDuDoASO.js (fetched 2026-10-19, read as text)
- https://docs.butter.markets/ and `.md` pages: `llms.txt`, `welcome/readme`, `welcome/what-are-conditionals-1`, `welcome/how-it-works`, `user-guide/{getting-started,how-to-trade,trading-event-markets,your-butter-account}`, `core-concepts/{conditional-tokens,scalar-tokens,leverage-and-exposure}`, `technical-docs/{v1-contracts,v1-dependencies,contract-addresses}`, `glossary/glossary` (all fetched 2026-10-19; space updatedAt 2026-02-20)
- https://github.com/buttermarkets (org), `cfm-v1` (README, `src/invalidless/InvalidlessConditionalScalarMarket.sol`, `script/lib/V4CreatePool.s.sol`, `script/CreateIfCollateralPools.s.sol`, file tree incl. `audits/`), `metric-report` README, `butterql` README, `ggresearch` README, `learn-futarchy` (via `gh api`, 2026-10-19)
- https://unichain.blockscout.com/api/v2 (stats, addresses, logs, tokens, transfers, transactions, smart-contracts, search), queried 2026-10-19
- https://api.llama.fi/protocols (searched for "butter", "cfm"), 2026-10-19
- https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials (`protocol_catalogue.csv`, `protocol_catalogue_verification.csv`, `protocol_classification.csv`), 2026-10-19
- https://gov.uniswap.org/t/unichain-growth-cfm-1-morpho-association-application/25697 (WebFetch summary)
- PayBox `discover_tokens mode=chains query=unichain` (read-only), 2026-10-19; project note docs/research/06-paybox-platform.md

## 13. Fixtures

`docs/research/fixtures/butter-conditional-funding-markets/`:
- `docs-llms.txt` - Butter docs index (14 pages).
- `docs-contract-addresses.md` - the docs' Unichain contract table.
- `unichain-blockscout-token-IF-BTC-gt-130000.json` - token record for a wrapped outcome token (supply, decimals, holders).
- `unichain-blockscout-token-transfers-IF-BTC-gt-130000.json` - its 14 transfers (mints, pool seeding, swaps, redemptions).
- `unichain-uniswap-v4-swap-events-sample.json` - decoded v4 `Swap` events showing `fee: 3000`.
- `unichain-flatcfm-reality-adapter-constructor.json` - oracle, arbitrator, 172800 s timeout, 0.02 ETH min bond.
- `ct-activity-by-month-derived.json` - monthly event counts and USDC amounts from `ConditionalTokens` logs (derived by this research; method stated inside).
