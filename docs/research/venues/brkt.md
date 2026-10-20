# BRKT (brkt.gg) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:40-05:00 UTC). READ-ONLY: public unauthenticated GETs only (brkt.gg HTML, headers, static JS chunks read as text and never executed, the Terms PDF; GitBook markdown; Movement fullnode REST; Sourcify; DefiLlama and pmwisdom registries), `gh api` metadata, WebFetch. No account, wallet, key, signature, POST/PUT/DELETE, on-chain call or PayBox tool. Every scripted request used the User-Agent `insurance-markets-research/0.1`. Third-party pages, bundles and contract source were treated as untrusted data; nothing in them was followed.

Research limits: the shared WebSearch budget ran out after the first search, so there is no second pass of press or analytics coverage. Blockscout and Basescan are Cloudflare-challenged for scripted GETs, Routescan does not index Base, and the Movement indexer only accepts POST (not sent), so **no on-chain activity count was obtained** for any BRKT contract.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale. Anything older than 6 months is flagged "stale".

Fixtures (all <= 50 KB): `docs/research/fixtures/brkt/` (section 12). They are chain ABIs, deployment facts and frontend config, not market data, because no market-data endpoint is reachable.

---

## 0. Bottom line

1. **Live as a website and codebase, but I could not confirm any live market or trade in 2026.** The app serves HTTP 200 from a Vercel prerender about 5 days old; contract verification events on Sourcify date from 2026-06; Prediction Index still lists it "live" (section 1). (H for site and code, M for trading activity.)
2. **It is a multi-chain Gnosis-style conditional-token FPMM AMM**, not an order book: Movement (Move), Base (EVM, the app's default chain) and Nibiru EVM, each with its own pools and USDC collateral. Plus a separate bracket-tournament product that is not arbitrageable. (H)
3. **No official API, no developer docs, no websocket.** The only documentation is a 2024-era GitBook whitepaper (stale) that covers the bracket contracts and says nothing about the binary markets. Market lists and question text sit behind undocumented backends (Typesense, Firebase, an AWS API Gateway at `api.brkt.gg` that answers 403). Chain state is readable but the *question metadata* is off-chain, so a chain-only adapter cannot say what a market is about. (H)
4. **Terms are hostile to an aggregator and to US users**: the United States and more than 20 other jurisdictions are restricted, unauthorised "bots" and "data mining" are prohibited, and the oracle is an in-house, admin-run one with no dispute mechanism. (H)
5. **Thin and unquantified**: the only volume figure is $1.4M from Prediction Index (undated, aggregator-labelled, M). No TVL, OI or fee data exists in DefiLlama.
6. **adapter_priority = skip.** A Base-leg trade path exists in principle (plain EVM `approve` + `buy`), but there is no way to know which event a pool prices without scraping undocumented backends the Terms forbid, the volume is small, and resolution is operator-controlled. Revisit if BRKT publishes an API or markets emit their question text on-chain (section 13).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.brkt.gg/` | HTTP 200, `server: vercel`, `x-vercel-cache: HIT`, `age: 449875` s (cached about 5.2 days before 2026-10-19 04:41 UTC, so a deploy or revalidation around 2026-10-14). Next.js shell; markets are client-rendered, so the HTML holds no market data. Footer "BRKT (c) 2025". | H |
| Homepage UI | Category tabs All, Politics, Finance, Soccer, Football, Basketball, Baseball, MMA, Cricket, eSport, Hockey, Games, Other; a LIVE/Volume sort; "Powered by TradingView"; X and Telegram links. | H |
| Recent feature work | English bundle contains quest rewards ("Bet must be at least 1 USDC to be considered for quest rewards"), raffle tickets, achievements, a "Migrate EVM Accounts" flow, Coinbase onramp, en/vi/zh locales. | H (bundle text) |
| Contract verification | Sourcify verified the Base FPMM factory on 2026-06-30, the bracket factory on 2026-06-23 and Conditional Tokens on 2025-10-17 (fixture `base_sourcify_verified_contracts_slim_2026-10-19.json`). | H |
| Movement chain | Fullnode at `https://mainnet.movementnetwork.xyz/v1` reports chain_id 126, ledger timestamp 1792384990 (2026-10-19 about 04:43 UTC). BRKT's Move package is deployed there (section 4). | H |
| Prediction Index | `predictionindex.xyz/ecosystem` row: chain Base, binary+categorical, mechanism AMM, status live, volume $1.4M, topics crypto/culture/esports/finance/politics/sports. Snapshot in repo: `fixtures/linking/pop_prediction_index_projects_2026-10-18.json`. PI's status labels are not reliable (it lists dead venues as live). | M |
| Press | ChainCatcher, 2024-11-27: $1.75M seed led by Foresight Ventures, "over 300,000 users in less than six months", "powered by Movement" (stale, 11 months). | M, stale |
| Movement-published article (Paragraph) | Small-model summary says "published May 1, 2026" and describes BRKT as live on Movement M1 mainnet. The date conflicts with the article's "new game" framing, so treat the date as unreliable. | L |
| X account | `x.com/BRKTgg` returned HTTP 402 to WebFetch with no payment terms; stopped, nothing paid, recent posts unread. | not read |
| GitHub | Org `BRKT-Labs` exists (created 2025-01-23) with **0 public repos**. | H |

Verdict: **still_live = true** for the site and contracts. Whether anyone trades the binary markets today is **unverified**.

---

## 2. Kind and market model

- **Kind**: onchain-other. Two products (H, `brkt-gg.gitbook.io` home page):
  - **Bracket competitions** (up to 256 teams, `CompetitionFactory`, `ContractRouter`, `Competition`, `PredictableCompetition`, `PaidPredictableCompetition`): users submit a bracket, score points per match, share a prize pool pro rata to points (whitepaper 4.3). Entry fee and fee token set by the organiser. This is a game, not a tradable price. Not arbitrageable.
  - **Binary prediction markets** ("conditional markets" in code): Yes/No shares traded against a pool.
- **Mechanism: constant-product-style FPMM AMM (Gnosis/Omen lineage) with conditional tokens.** Evidence:
  - Base: Sourcify-verified `FPMMDeterministicFactory` (0xC146E3Cb45b9678E6D431Fc8baec314Ef186EaB2) bundling `FixedProductMarketMaker.sol` and the unmodified `@gnosis.pm/conditional-tokens-contracts` `ConditionalTokens` (0x5973E81eBA16f32C0D9237886e320356f2aEC5ca), solc 0.5.10. (H)
  - Movement: a Move port with identical module names: `conditional_tokens`, `fixed_product_market_maker`, `fixed_product_market_maker_factory`, `ct_helpers` (H, fixture `movement_conditional_market_modules_abi_slim_2026-10-19.json`).
  - UI copy: "Buy 'Yes' or 'No' shares ... Odds shift in real time as other traders bet ... Sell your 'Yes' or 'No' shares at any time, or wait until the market ends to redeem winning shares for $1 each." (H, bundle i18n)
- **Outcomes**: the UI is binary; the contracts allow 2-256 outcome slots (CT `prepareCondition` requires 2..256) so categorical is possible. Whether categorical markets exist on BRKT: NOT FOUND (market list unreachable).
- **Tokenisation**: Base: ERC-1155 position ids inside the one `ConditionalTokens` contract (collateral USDC). Movement: per-position fungible assets minted by `conditional_tokens` (`PositionTokenRef` mint/burn refs). LP shares: the FPMM itself is an ERC-20 (Base); `add_funding`/`remove_funding` on Move. (H, ABI)
- **Price from state (M, standard FPMM property, not tested here)**: for a binary pool with balances (yes, no), implied P(yes) = no / (yes + no). Exact fills come from `calcBuyAmount(investment, idx)` / `calcSellAmount(return, idx)`, which include the fee.
- **Market creation**: `create2FixedProductMarketMaker` (Base) and `create_fixed_product_market_maker` (Move) are public with no owner check, and `prepareCondition` has no access control, so anyone can create a pool on the contracts. Which pools the *website* lists is controlled by BRKT's admin tooling (bundle contains "Hide Competition" admin UI, `/api/partner/admin/me`). (H for contracts, M for the listing inference)

---

## 3. Chains and collateral

From the production bundle (H, fixture `frontend_config_extract_2026-10-19.json`): `orderedNetworks()` = [Movement, Base, Nibiru]; testnets only behind a flag; `DEFAULT_CHAIN` = Base mainnet.

| Chain | Role | Collateral | Notes |
|---|---|---|---|
| Base (eip155:8453) | EVM binary markets (FPMM factory, CT) and bracket factory | USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 dp) | App default chain. Factory deployed at block 34,772,562 (about late Aug 2025, M from block height). Bracket factory 0x17910F6f77ea170a0529D4D85e31E7D8BB1856e8 at block 20,338,141 (about Sep 2024, M). |
| Movement (Move, chain_id 126) | Move binary markets and brackets | USDC.e fungible asset 0x83121c9f...cbea39 (6 dp, name/symbol "USDC.e" on-chain, H) | Conditional-market package at 0x0c85e095d7dbaab7ce22c3b1f18623ff4ab3b95887d08389a4a644c894a22585, published 2025-03-10 (tx version 132103), `upgrade_number` 0, upgrade policy 1 (compatible, so the owner can still upgrade). Bracket package 0xe61f6d04...ae503 published 2025-03-17. |
| Nibiru EVM (eip155:6900) | Same stack | USDC.e 0x0829F361A05D993d5CEb035cA6DF3446b060970b | FPMM factory 0xe8BE990acc3c369654Df6d360C2f4E701BE1672E, CT 0x80340E36DeED3F9C3aa426DdCB3F64F7623bA343 (from bundle; not independently verified, Sourcify does not index 6900). |

Pools on different chains are separate; there is no cross-chain liquidity. The "Migrate EVM Accounts" copy suggests the user base moved from EVM accounts to Movement-native (Privy/Aptos-style) accounts, so Movement may carry the current volume (M, inference). The CSP also lists `api.relay.link` (bridge) and Coinbase onramp.

---

## 4. Read API

**Official public API: none found.** Searched: GitBook `llms.txt` (22 pages, all bracket/tokenomics), homepage, robots.txt, `/api/markets`, `/api/v1/markets`, `/llms.txt`, `/sitemap.xml` (404s), `docs.brkt.gg` and `app.brkt.gg` (no DNS), GitHub (org has 0 repos), DefiLlama protocol list (no BRKT), pmwisdom and prediction-almanac registries (no BRKT). (H)

What does exist:

| Surface | Status | Tag |
|---|---|---|
| Whitepaper `https://brkt-gg.gitbook.io/brkt.gg-whitepaper` (md at `/<page>.md`, index `/llms.txt`) | 200. Describes bracket contracts only; statement of the oracle (4.5) and a planned off-chain "INVKR" oracle (5.1) and tokenomics (7.1, ticker $BRKT, supply 250,000,000, "TBD" circulating). Images dated 2024-05 and 2024-10. **Stale.** | H |
| `https://api.brkt.gg/` | AWS API Gateway; `{"message":"Forbidden"}` (403) on `/`, `/health`, `/markets`; `/v1/markets` 404. Undocumented, not referenced by the site bundle. Not probed further. | H |
| Market/search backend | Bundle holds a Typesense Cloud host and a Firebase Realtime DB / Firestore project (used for competition metadata, `userIPs`, profiles). Both need embedded credentials; **not used** (undocumented, and Terms 4.A.iv forbids unauthorised data mining). | H (existence), not probed |
| Own-origin routes | `/api/sponsor/move` (gas sponsorship for Move txs), `/api/login`, `/api/profile`, `/api/human`, `/api/partner/admin/me`, `/api/edit`. `robots.txt` disallows `/api/`. | H (bundle strings) |
| **Movement fullnode REST** `https://mainnet.movementnetwork.xyz/v1` | Public. GET `/accounts/{addr}/modules`, `/resources`, `/transactions` worked (fixtures). Module view functions need `POST /v1/view`, **not called** (read-only rule). Module events need the indexer. | H |
| Movement indexer `https://indexer.mainnet.movementnetwork.xyz/v1/graphql` | Generic chain indexer. `GET ?query=` returns `PersistedQueryNotSupported`, so it needs POST; not called. | H |
| **Base on-chain** | Standard Gnosis ABIs. Discovery: `FixedProductMarketMakerCreation` events from the factory; `ConditionPreparation`/`ConditionResolution` from CT; prices from `CT.balanceOf(fpmm, positionId)` or `calcBuyAmount`. Needs JSON-RPC (POST) at runtime; **not called** here. | H (ABI/source), untested |

Key contract entry points for a future reader (all from verified ABI/source):
- Base FPMM: `calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex)`, `calcSellAmount(uint256 returnAmount, uint256 outcomeIndex)`, `collectedFees()`, events `FPMMBuy`, `FPMMSell`, `FPMMFundingAdded/Removed`.
- Base CT: `payoutNumerators(bytes32)`, `payoutDenominator(bytes32)`, `getOutcomeSlotCount`, `getPositionId`, events `ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount)`, `ConditionResolution(..., payoutNumerators)`.
- Move: views `calc_buy_amount(fpmm, u256, u256)`, `calc_sell_amount`, `balance`, `collected_fee`, `condition_ids(fpmm, u64)`, `get_fpmm_address(address, u256)`, `payout_numerators`, `is_payout_reported`, `is_oracle(address)`; events `FPMMBuy`, `FPMMSell`, `FixedProductMarketMakerCreation`, `ConditionPreparation`, `ConditionResolution`.

**The blocker for an aggregator is metadata, not prices**: `questionId` is a bytes32; whether the question text, end time and category are emitted on-chain is NOT FOUND. Without the Typesense/Firebase backends there is no way to say what a pool prices. WebSocket: none (the page opens Binance price streams for crypto charts, which are not BRKT data). Rate limits: NOT FOUND (no official API).

Fixture status: no market-data sample could be saved. What was saved is listed in section 12.

---

## 5. Trade path

- **No programmatic order API, no off-chain signed orders.** Trading is direct contract calls from the user's wallet. (H)
- **Base (EVM)**, from verified source:
  1. `USDC.approve(fpmm, amount)`.
  2. `FPMM.buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)` (slippage guard is the min tokens).
  3. To sell: `ConditionalTokens.setApprovalForAll(fpmm, true)` (the FPMM pulls the ERC-1155), then `FPMM.sell(uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell)`.
  4. After resolution: `ConditionalTokens.redeemPositions(collateral, parentCollectionId=0x0, conditionId, indexSets)`.
- **Movement**: Move entry functions `fixed_product_market_maker::buy(&signer, address fpmm, u256, u256, u256, address, bool)`, `sell` (same shape), `redeem_positions(&signer, vector<u8>, vector<u8>, vector<u256>, address, bool)`. The trailing `address, bool` parameters have unknown meaning (M). The frontend sponsors gas through `/api/sponsor/move`.
- **Authentication in the app**: Privy-style login (email/social/passkey/SIWE), WalletConnect, Coinbase wallet; users "create, link, connect ... a self-custodial digital wallet" (Terms 2.A). Not relevant for a direct contract caller.

**Reachable through PayBox? partial.**
- Base leg: yes in principle. Base (8453) is in PayBox's chain catalog (project note `06-paybox-platform.md`, H) and the flow is plain EVM calls (approve, buy, setApprovalForAll, sell, redeem) with no EIP-712 order. Whether PayBox can propose arbitrary contract calls or needs a BRKT plugin is a PayBox question (see `21-userop-templates.md`), not tested here.
- Movement: no. Not in the 11-chain catalog (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid) and Move signing is a different scheme. Nibiru EVM (6900): no.
- Legal/ToS: US residents are excluded (section 8), which may matter more than the technical path.

---

## 6. Fees

| Fee | Value | Source / tag |
|---|---|---|
| Market fee (LP fee) | **2.5%** default: `CONDITIONAL_MARKET_FEE_FRACTION = 0.025`, passed (as the `fee` argument) when the frontend creates a pool. A pool's on-chain `fee` is set at creation, so an individual pool may differ (not checked: no pool address available). | Bundle constant H; per-pool value unverified |
| Buy | `feeAmount = investmentAmount * fee / 1e18`; fee goes to the LP fee pool; the rest (`investmentAmount - fee`) is split into outcome tokens. Payer: buyer. | Base source H; Move port M (event `FPMMBuy` carries `fee_amount`) |
| Sell | `feeAmount = returnAmount * fee / (1e18 - fee)`; paid on top of what the seller receives (the seller must surrender enough tokens to cover `returnAmount + fee`). Payer: seller. | Base source H; Move port M |
| LP fee withdrawal | `withdrawFees(account)` pro rata to LP share. No protocol cut in the FPMM code. | Base source H |
| "Platform Fee" | Terms 5.A: a "Platform Fee ... on all transactions made on or via the Platform", changeable at any time. **Rate NOT FOUND.** Not visible in the FPMM contract, so it is either off-chain/frontend or zero. | Terms H, value unknown |
| Bracket protocol fee | `CompetitionFactory.protocolFee` / `setProtocolFee` (owner-set); organiser entry fees. Irrelevant to arbitrage. | ABI H |
| Gas | Base: ETH gas paid by the user. Movement: gas appears sponsored (`/api/sponsor/move`, M). | |

Arbitrage maths: holding to resolution costs one 2.5% buy fee (about 2.5 points on a $1 payoff at p near 0.5, more as a fraction of edge when p is small); exiting early costs it twice. Plus AMM price impact. Only wide dislocations clear that.

---

## 7. Resolution and dispute risk

- **Contract level (Base, source H)**: `prepareCondition(oracle, questionId, outcomeSlotCount)` is permissionless; only `msg.sender == oracle` can later call `reportPayouts(questionId, payouts[])`. The payout vector is arbitrary (any non-zero split), so the oracle can also settle 50/50 or any partial payout. There is no challenge window, bond, escalation or timelock. Move equivalent: `report_payouts(&signer, question_id, payouts)`, plus an `is_oracle(address)` view and a `ConditionOracleMap`. (H, ABI)
- **Who the oracle is**: the whitepaper (4.5, stale) says "At launch, we will be verifying our outcomes with an in-house oracle solution. Admins add new competition types/categories to our Outcome registry, which is then tied to a specific API ... The outcome checker queries match results on a timer ... competition outcome is updated on-chain." A planned off-chain "INVKR" oracle with "Defender nodes" (5.1, 7.1) is described; whether it shipped is NOT FOUND. The actual oracle address(es) used by live Base or Movement pools: NOT FOUND (needs event logs).
- **Terms**: for "Challenges" the outcome "shall only be determined and settled upon official confirmation by the relevant overseeing authority or otherwise at our sole discretion"; unverifiable or interrupted ones may be voided and "Digital Assets used ... may be forfeited without refund"; rewards "may be voided in the case of any incorrectly displayed or calculated prices" (Terms 3.B). It is unclear whether ordinary binary markets count as "Challenges", but the clause shows the operator reserves discretion. (H)
- **Bracket contracts** add an `Expiration Epoch` (4.1): users can refund if the manager fails to advance the competition (H, whitepaper). No equivalent was found for FPMM markets.
- **Upgradeability**: Move package policy "compatible" (upgradable by the deployer key); `CompetitionFactory` is `Ownable`. Base CT and FPMM factory are immutable stock Gnosis code (no proxy fields in the ABI). (H)
- **Risk summary**: single-operator oracle, discretionary voiding, unknown audit status (audits NOT FOUND; search budget exhausted). Dispute risk is high relative to UMA-based venues; there is no way to appeal.

---

## 8. Geo, ToS and automation

Source: `https://www.brkt.gg/BRKT-Terms-Of-Use.pdf` (linked from `/terms-of-use`, a PDF in an iframe), "Last updated: 17 March 2025" (about 19 months old, stale), operator "ONTREND COMPANY SOCIEDAD DE RESPONSABILIDAD LIMITADA", arbitration in Costa Rica (CICA) under Costa Rican law, class-action waiver. (H)

- **Restricted jurisdictions** (Terms 4.D): Algeria, Australia, Bangladesh, Belgium, Belarus, Bolivia, Burundi, Burma, Cote d'Ivoire, Crimea and Sevastopol, Denmark, Ecuador, France, Germany, Italy, Iraq, Japan, Liberia, Libya, Mali, Morocco, Nepal, Netherlands, Spain, Singapore, South Korea, Turkey, **United States**, plus sanctioned countries in 4.C (Cuba, DRC, Iran, North Korea, Sudan, Somalia, Syria, Venezuela, Yemen, Zimbabwe). 4.G: "We may deploy technological solutions (such as geo-blocking)" and may detect "geo-location and IP masking". The bundle calls `ipapi.co/json/` and stores the user's IP per wallet address in Firestore (`userIPs`), so IP-based screening or logging is plausible. Whether the site actually geo-blocks: not tested.
- **Eligibility**: adult, not a problem gambler, not self-excluded (Terms 1).
- **Automation**: prohibited conduct includes "bots; i.e. any code and/or software, not expressly authorized by the Company, that allows the automated control of your User Account or any Service" (Terms 4.A.iii) and "Data Mining: Use any unauthorized process or software that intercepts, collects, reads, or 'mines' information generated or stored by the Platform" (Terms 4.A.iv). The contract layer is public chain state, but any bot trading through the BRKT account system or scraping its backends would breach these terms. Direct contract calls are not addressed.
- **Manipulation**: wash trading, ramping etc. barred (Terms 4.A); the same clause bars prediction-market transactions that do not comply with applicable law.
- **robots.txt**: `Disallow: /api/`; its `Sitemap:` line points at `acme.com` (template residue).
- **Privacy policy** (PDF, 6 pages): collects wallet address, email, IP; not read in depth.

---

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Volume | $1.4M | `predictionindex.xyz/ecosystem` row, fetched 2026-10-19; undated; unclear whether cumulative or period | M |
| TVL / OI / per-market depth | NOT FOUND | DefiLlama `api.llama.fi/protocols` fetched 2026-10-19: no BRKT/Hookt entry; pmwisdom and prediction-almanac: no entry | H (absence) |
| Users | "over 300,000 users in less than six months" (Nov 2024) | ChainCatcher, 2024-11-27 | M, stale |
| Funding | $1.75M seed (Foresight Ventures lead; Orange DAO, V3V, MEXC Ventures, 280Capital, Triton, Movement, Silvermine, Nibiru) | ChainCatcher, 2024-11-27 | M, stale |
| Pool seeding | Unknown; the AMM is LP-funded (creator `initialFunds` + `addFunding`) | contract source | H (mechanism) |

Treat per-market liquidity as unknown until a pool address is read; an LP-seeded FPMM can be very shallow.

---

## 10. Event coverage and overlap

UI categories (H): Politics, Finance, Soccer, Football, Basketball, Baseball, MMA, Cricket, eSport, Hockey, Games, Other; PI adds crypto, culture, esports. These are the categories where Polymarket, Kalshi, Limitless, Predict.fun and others also list, so arbitrage overlap is plausible in sports, politics and crypto price markets. **No specific BRKT market or price could be retrieved**, so overlap is unconfirmed. Recurring "yearly tournaments" (NCAA bracket, NFL finals, esports finals) are the product's stated focus (whitepaper), but brackets are scored games, not tradable.

Hint of Polymarket-derived catalogue (L): the site's CSP allow-lists `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com` and Polymarket's S3 image bucket, and the sport tags mirror Polymarket's. No Polymarket call appears in the 64 JS chunks I read, so this may be a leftover or sit in an unloaded route. If BRKT mirrors Polymarket questions, it would be a correlated copy (same events, own pools), not a shared pool.

---

## 11. Shared liquidity

No evidence of shared liquidity: each FPMM is BRKT's own LP-funded pool (Base, Movement and Nibiru separately). If markets are Polymarket question copies (L hint above), they would be independent price legs on the same event but settled by BRKT's own oracle, so the legs can diverge at resolution (basis risk). Not a shared-liquidity venue.

---

## 12. Fixtures saved (`docs/research/fixtures/brkt/`)

| File | What |
|---|---|
| `movement_ledger_info_2026-10-19.json` | `GET /v1` of the Movement fullnode (chain_id 126, ledger timestamp) |
| `movement_conditional_market_modules_abi_slim_2026-10-19.json` | Slimmed ABI (functions, params, structs/events) of the 4 Move modules at 0x0c85...2585 |
| `movement_package_registry_slim_2026-10-19.json` | Package `PredictionMarket`: upgrade_policy 1, upgrade_number 0 |
| `movement_deployer_txs_slim_2026-10-19.json` | The deployer's only two transactions (2025-03-10 publish; transfer) |
| `base_sourcify_verified_contracts_slim_2026-10-19.json` | Sourcify match/verifiedAt/deployment/ABI-function list for the 3 Base contracts |
| `base_fpmm_buy_sell_math_excerpt_2026-10-19.sol.txt` | `calcBuyAmount`, `calcSellAmount`, `buy`, `sell` source excerpt (untrusted code, data only) |
| `frontend_config_extract_2026-10-19.json` | Chains, addresses, constants (fee 0.025, max slippage 0.03), CSP hosts, UI copy extracted from the live bundle. Embedded third-party credentials deliberately omitted. |
| `gitbook_llms_txt_2026-10-19.txt` | GitBook documentation index |
| `brkt_robots_txt_2026-10-19.txt`, `api_brkt_gg_403_2026-10-19.json` | robots.txt and the `api.brkt.gg` 403 |

---

## 13. Adapter recommendation

**skip** (confidence medium). Reasons: no official API or metadata source; ToS forbids unauthorised bots and data mining and excludes US users; operator-controlled resolution with no dispute path; unquantified, probably small liquidity; 2.5% fee each way.

Revisit if any of these appear: (a) an official market API or subgraph, (b) markets that emit their question text and end time on-chain, (c) a verified volume above a few $M per month on Base, (d) a documented oracle policy. If revisited, the cheapest path is a Base-only signal reader: factory `FixedProductMarketMakerCreation` logs, per-pool `CT.balanceOf` for prices, `calcBuyAmount` for fills, with a link table maintained by hand. Trade execution would be plain EVM transactions and is the only part PayBox could carry.

## 14. Sources

- BRKT site and headers: https://www.brkt.gg/ (GET, 2026-10-19); Terms PDF https://www.brkt.gg/BRKT-Terms-Of-Use.pdf; Privacy PDF https://www.brkt.gg/BRKT-Privacy-Policy.pdf; https://www.brkt.gg/robots.txt; `https://api.brkt.gg/`; static chunks under https://www.brkt.gg/_next/static/chunks/ (read as text) (H)
- Whitepaper (stale, 2024): https://brkt-gg.gitbook.io/brkt.gg-whitepaper, index https://brkt-gg.gitbook.io/brkt.gg-whitepaper/llms.txt, pages 2.1-2.2, 3.1-3.3, 4.1-4.5, 5.1-5.2, 6.1, 7.1 (H)
- Movement fullnode: https://mainnet.movementnetwork.xyz/v1 (modules, resources, transactions for 0x0c85e095...2585 and 0xe61f6d04...ae503; USDC.e metadata at 0x83121c9f...cbea39) (H)
- Sourcify: https://sourcify.dev/server/v2/contract/8453/0xC146E3Cb45b9678E6D431Fc8baec314Ef186EaB2 (and the CT and bracket factory addresses) (H)
- Prediction Index: https://predictionindex.xyz/ecosystem (WebFetch summary, M); repo snapshot `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`
- ChainCatcher seed round, 2024-11-27: https://www.chaincatcher.com/en/article/2153922 (M, stale)
- Movement/Paragraph article: https://paragraph.com/@movementnetwork.base.eth/brkt-a-new-game-and-prediction-market-on-the-movement-network (L, date unreliable)
- One WebSearch ("BRKT brkt.gg prediction market Base") surfaced the above and a nexuspredict list that files BRKT under "Unknown platforms" (M); X profile https://x.com/BRKTgg not readable (HTTP 402 via WebFetch)
- DefiLlama https://api.llama.fi/protocols (no BRKT entry, H); https://pmwisdom.com/api/data/projects (10 items, none BRKT); https://api.github.com org `BRKT-Labs` (0 public repos)
- PayBox chain catalog: project note `docs/research/06-paybox-platform.md` (H for the project's own probe)

## 15. Privacy and safety notes

- All scripted requests used `insurance-markets-research/0.1`. No email, name, username or home path was sent anywhere; scratch scripts were grepped for `@` and personal identifiers (none). The fixtures were grepped too (the only `@` hits are `@gnosis.pm` package paths).
- Embedded credentials seen in the third-party bundle (an RPC provider URL token, a Typesense search key, Firebase project) were not copied into notes or fixtures and not used.
- No text aimed at AI agents was found. Oddities: `acme.com` sitemap in robots.txt; Cloudflare challenge pages from Blockscout; `x.com` answered 402 to WebFetch (no payment terms disclosed, nothing paid).
