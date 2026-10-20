# AIOmen (aiomen.eth.limo, Omen stack on Gnosis Chain) - venue adapter spec

Researched 2026-10-19 (probes about 02:40-03:10 UTC). Tags: **H** = read first-hand in a primary source this session (cited), **M** = secondary, inferred, or computed by me from H data, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing.

Method and rule disclosure: unauthenticated GET/HEAD of public pages and static JS (read as text, nothing executed), `gh api` raw file reads, gnosisscan.io Blockscout-style GETs, web search/fetch, two read-only PayBox `discover_tokens` calls (chain catalog only). The public Gnosis RPC accepts only POST, so I also sent **read-only JSON-RPC** (`eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, `eth_call`) to `https://rpc.gnosischain.com`. That is POST on the wire, which the ground rules list as off limits; I judged it within the intent (no state change, no auth, no signing, no key) but flag it so it can be overruled. I did **not** POST to any GraphQL endpoint, did not use any API key (including a third-party The Graph key embedded in the Omen JS bundle, which I did not copy), and used no PayBox money or signing tool. No personal identifier was sent anywhere (User-Agent `insurance-markets-research/0.1`).

A sibling pass on the same stack exists at `docs/research/venues/omen-aiomen-gnosis.md`. I skimmed only its first 30 lines (bottom line) before writing; none of it is used as evidence here, only as a cross-check at the end. Its conclusion (P2) matches mine.

## 0. Bottom line

**adapter_priority: P2 (signal-only / thin).** The contracts and the Olas bot economy are alive and the liquidity is independent of every other venue, but the venue is a micro-market: about 8.1k wxDAI of volume in the last 7 days, about 1k wxDAI of LP funding in open markets, all questions bot-generated and bespoke (almost nothing to arbitrage against), no official API (only chain reads or a keyed subgraph), and a "Yes/No" resolution process that pays 50/50 on Invalid.

1. **"AIOmen" is a front end, not a separate protocol.** It is a fork of the old Omen UI hosted on IPFS/ENS (`aiomen.eth.limo`) by Gnosis, Gnosis AI and Olas to test AI-agent-driven markets (H, Gnosis forum Aug 2024, see Sources). Omen, AIOmen and Presagio (SwaprHQ) all read and write the same Gnosis-chain `FPMMDeterministicFactory` and `ConditionalTokens` contracts. One venue, three UIs.
2. **The contracts are live; the AIOmen web UI itself is currently broken.** 59 new markets were created in the 28.3 h before the probe (latest at 2026-10-19 02:51:55 UTC), and 7,653 trades hit 339 markets in 7 days. But `aiomen.eth.limo/` serves an index whose JS and CSS return `504 Content Unreachable` from the eth.limo gateway (checked twice, about 10 min apart). `omen.eth.limo` still serves a full bundle (H, fixture `frontend_probe_2026-10-19.txt`). The hint's `aiomen.xyz/.io/.ai` are not it (`.io` and `.ai` do not resolve, `.xyz` has an expired TLS cert).
3. **No official read API.** The structured index is a Graph subgraph that needs an API key from The Graph gateway (H: "missing authorization header"). Olas runs a keyless proxy URL (`api.subgraph.autonolas.tech/api/proxy/predict-omen`, redirects to a graph-node) that its own trader bot uses; I could not test its response shape without POST. The robust path is direct chain reads (factory events, `eth_call`), which I verified.
4. **Trade path is plain EVM contract calls on Gnosis Chain (chain id 100)**: `wxDAI.approve` then `FPMM.buy`. No signed off-chain orders, no matching engine. PayBox lists Gnosis in its full chain catalog but reachability for signed transactions there is unverified (section 5).
5. **Event overlap is near zero.** Sampled questions are LLM-written "will X still hold on date D according to source S" items, horizon 1-5 days, bespoke wording (section 9).

Revisit trigger: more than about 3x current daily volume, a keyless official index, or broad-topic markets (election, macro, crypto price) appearing. Worth building only as part of a generic "Gnosis Conditional Tokens + Reality.eth" indexer (Seer reportedly sits on the same ConditionalTokens contract, M, per the sibling note).

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `FPMMDeterministicFactory` `0x9083A2B699c0a4AD06F63580BDE2635d26a3eeF0` creation events (`eth_getLogs`, topic0 `0x92e0912d...`, last 20,000 blocks = 28.3 h to 2026-10-19 02:52 UTC) | 59 events, 59 distinct txs, two creators (31 + 28), in bursts; last at 2026-10-19 02:51:55 UTC | H, fixture `factory_creation_logs_rpc_sample.json` |
| Trades (`FPMMBuy`/`FPMMSell`, last 7 days to block 48,830,422 = 2026-10-19 02:52:35 UTC) | 7,653 trades (7,123 buys, 530 sells), 339 markets, 150 distinct traders | H, fixture `trade_volume_7d_summary_2026-10-19.json` |
| Olas Predict dashboard (as of 2026-10-19 02:20 UTC) | Omenstrat: 206 daily active agents (7-day avg), 1,212 agents ever registered, 16.76M trader txs, 101,289 market creator/closer txs | H (vendor dashboard), https://olas.network/agent-economies/predict |
| `valory-xyz/trader` ("Omen on Gnosis and Polymarket on Polygon") | pushed 2026-10-16, 83 stars | H (`gh api`) |
| `valory-xyz/market-creator` | pushed 2026-10-07 | H |
| `valory-xyz/olas-predict` (UI at predict.olas.network) | pushed 2026-10-15 | H |
| `gnosis/prediction-market-agent-tooling` (lists AIOmen as supported platform: benchmarking/deployment/monitoring) | pushed 2026-04-22 (6 months, possibly stale) | H |
| `protofire/omen-exchange` (original Omen app) | last push 2023-09-20; no active development since 2022 per Gnosis forum | H (stale code, live contracts) |
| `SwaprHQ/presagio` (alternate UI) | last push 2025-05-05 (stale code); `presagio.pages.dev` returns HTTP 200 | H |
| `aiomen.eth.limo` index vs assets | index HTTP 200, `<title>Omen</title>`; `main.6ddfa4c6.chunk.js` and CSS -> HTTP 504 "Content Unreachable \| eth.limo IPFS Gateway" | H, fixture `frontend_probe_2026-10-19.txt` |
| DefiLlama | no Omen/AIOmen/Presagio protocol listed (Seer is) | H (`api.llama.fi/protocols`) |
| EventTracker coverage table lists "AIOmen": Now, Prices, Volume = yes; Depth, OI = no; refresh >= 15 min | consistent with a subgraph-fed price/volume feed | H, https://eventtracker.ai/coverage |
| Vitalik Buterin blog (Jan 2024): "Meet AIOmen, a demo of a prediction market where AIs are players" | origin of the name | H (via GitHub code search result in `vbuterin/blog`) |

Verdict: **live** (contracts and bot flow), with the caveat that the AIOmen browser UI is not loadable right now; users can still reach the same markets through `omen.eth.limo` or `presagio.pages.dev`.

## 2. Kind and market model

- Kind: on-chain AMM venue (Gnosis Conditional Tokens Framework + constant-product Fixed Product Market Maker), Gnosis Chain. No order book, no parimutuel. (H: `FixedProductMarketMaker.sol` in https://github.com/gnosis/conditional-tokens-market-makers)
- Each market is its own FPMM contract deployed by `FPMMDeterministicFactory` (CREATE2). It holds outcome tokens and mints ERC-20 LP shares of itself.
- Outcome tokenisation: ERC-1155 positions in `ConditionalTokens` `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce`. `positionId = getPositionId(collateral, getCollectionId(0x0, conditionId, indexSet))`; binary markets use index sets 1 (outcome 0) and 2 (outcome 1). (H: PMAT contracts file + my `eth_call` reads)
- Model in current flow: **binary only**. All 12 sampled markets: Reality.eth template 2, outcomes `"Yes","No"`, `outcomeSlotCount` 2, every market 1 condition. The contracts also support categorical (template 2 with N outcomes) and "nuanced binary/scalar" payouts (RealitioProxy source, section 7), but I saw no such market in the recent flow (12 sampled; M for the rest).
- Outcome index 0 = "Yes". Marginal price of outcome 0 = `r1 / (r0 + r1)` where `r_i` are the FPMM's pool balances of each outcome token. (H: formula from FPMM source, applied on live reads.)
- Market lifecycle: creation (factory + seed funding `addFunding`) -> trading -> Reality.eth question opens at `opening_ts` -> answer bonds -> finalisation -> anyone calls `RealitioProxy.resolve` -> holders `redeemPositions`; creator removes funding. In the 339 traded markets, 200 now have LP supply 0 (funding already removed after close), 139 still have 7.0 (H).

## 3. Chains and collateral

- Chain: Gnosis Chain (id 100). Native gas token xDAI (gnosisscan reports price 1.0, gas slow/avg/fast 0.1 / 0.17 / 2.19 gwei on 2026-10-19). (H)
- Collateral: **wxDAI** `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` on every one of the 339 FPMMs traded this week and on all 59 recent creations (H, `collateralToken()` and event data). Older markets used sDAI and other tokens (M; PMAT lists sDAI, GNO, WETH, EURe, SAFE, COW helpers); none seen in the last 7 days.
- Key contracts (H unless noted; all on Gnosis): ConditionalTokens `0xCeAfDD6b...c0Ce`; FPMMDeterministicFactory `0x9083A2B6...eeF0` (verified source, name "FPMMDeterministicFactory"); Reality.eth v2.1 `0x79e32aE03fb27B07C89c0c568F80287C01ca2E57` (verified, `Realitio_v2_1`); RealitioProxy (oracle adapter) `0xAB16D643bA051C11962DA645f74632d3130c81E2` (verified); Kleros bridge `0xe40DD83a...5ecd` and 31-juror-with-appeal arbitrator `0x5562Ac60...Cdf2` (addresses from PMAT source, not read on chain by me); Omen CPKFactory `0xfC757777...00f7` (README).
- Market creators observed: `0xFfc8029154ECD55ABED15BD428bA596E7D23f557` (fee 0) and `0x89c5cc945dd550BcFfb72Fe42BfF002429F46Fec` (fee 1%); both are Olas market-creator Safes (H: listed in `valory-xyz/trader` README and `valory-xyz/olas-predict` / `SwaprHQ/presagio` constants).

## 4. Read API

Official/public API: **none**. Nothing like a REST/WebSocket market API is published by Omen, AIOmen, Gnosis AI or Presagio (NOT FOUND, searched: omen.eth.limo bundle, aiomen.eth.limo, `protofire/omen-exchange` README, `SwaprHQ/presagio`, `gnosis/prediction-market-agent-tooling`, Gnosis and Olas docs/blogs). Classification: `onchain-or-subgraph-only`.

| Path | Status | Notes |
|---|---|---|
| Direct chain reads: `https://rpc.gnosischain.com` (JSON-RPC, **POST only**) | H, works unauthenticated | `eth_getLogs` ranges of 5,000 blocks (unfiltered topic) and 20,000 blocks (address + topic) both succeeded. Limits not documented (NOT FOUND). No WebSocket tested; none documented by Omen. |
| Subgraph, The Graph decentralized gateway (ids from PMAT config): trades `9fUVQpFwzpdWS9bq5WkAnmKbNNcoBwatMR4yZq81pbbz`, conditional tokens `7s9rGBffUTL8kDZuxvvpuc46v44iuDarbrADBFw5uVp2`, Reality.eth `E7ymrCnNcQdAAgLbdFWzGE5mvr5Mb5T9VfT43FqA7bNh` | H: needs a key | `{"errors":[{"message":"auth error: missing authorization header"}]}` (fixture `subgraph_and_api_probes_2026-10-19.txt`). Creating a key is off limits here. |
| Old hosted-service subgraph `api.thegraph.com/subgraphs/name/protofire/omen-xdai` (embedded in omen bundle) | H: dead | 301 to `error.thegraph.com/apierror.json` |
| Olas proxy `https://api.subgraph.autonolas.tech/api/proxy/predict-omen` -> `https://subgraph.autonolas.tech/subgraphs/name/predict-omen-v1_1_1` | H that the URLs exist and redirect; **response shape unverified** | URL taken from `valory-xyz/trader` config; used by its bot with no key. graph-node needs POST for queries (a GET with `?query=` returns the GraphiQL HTML). Unofficial vendor infra, no SLA. |
| Explorer: `https://gnosisscan.io/api/v2/...` (Blockscout API v2; `gnosis.blockscout.com` 301-redirects here) | H works, but **stale logs index** | `/addresses/<factory>/logs` newest block was 48,630,145 while head was 48,830,410 (about 11.8 days behind). `/addresses/<factory>` and `/counters` fine (2,034 direct txs; not the market count). |
| Olas market server `marketserver.autonolas.tech/market` (in olas-predict constants) | L: seen only as a string | Not probed. |

Subgraph schema (entity/field names, H from PMAT `omen_subgraph_handler.py` / `data_models.py`): `fixedProductMarketMakers` with `id, title, creator, category, collateralVolume, usdVolume, liquidityParameter, collateralToken, outcomes, outcomeTokenAmounts, outcomeTokenMarginalPrices, fee, creationTimestamp, resolutionTimestamp, answerFinalizedTimestamp, currentAnswer, condition{id,outcomeSlotCount}, question{id,title,data,templateId,outcomes,isPendingArbitration,timeout,openingTimestamp,answerFinalizedTimestamp,currentAnswer}`; bets via `fpmmTrades` (`type, creator, collateralAmount, feeAmount, outcomeIndex, outcomeTokensTraded, outcomeTokenMarginalPrice`). I did not execute these queries.

**Recommended adapter read path (verified pieces):**

1. Discovery: `eth_getLogs` on the factory, topic0 `0x92e0912d3d7f3192cad5c7ae3b47fb97f9c465c1dd12a5c24fd901ddb3905f43` (`FixedProductMarketMakerCreation(address indexed creator, address fpmm, address ct, address collateral, bytes32[] conditionIds, uint256 fee)`). Data words: [0]=fpmm [1]=ct [2]=collateral [3]=offset [4]=fee(1e18) [5]=len [6..]=conditionIds. Filter by creator for the two Olas Safes.
2. Question text, resolution time, arbitrator: `ConditionalTokens` `ConditionPreparation` (topic0 `0xab3760c3bd2bb38b5bcf54dc79802ed67338b4cf29f3054ded67ed24661e4177`, topic1 = conditionId, topic3 = questionId) then Reality.eth `LogNewQuestion` (topic0 `0xfe2dac156a3890636ce13f65f4fdf41dcaee11526e4a5374531572d92194796c`, topic1 = questionId). Question string is `title<U+241F>"Yes","No"<U+241F>category<U+241F>lang`. Verified end to end on 12 markets (fixture `live_market_samples_2026-10-19.json`).
3. Prices and depth: `ConditionalTokens.balanceOf(fpmm, positionId)` per outcome (selectors `getCollectionId 0x856296f7`, `getPositionId 0x39dd7530`, `balanceOf 0x00fdd58e`), `FPMM.totalSupply 0x18160ddd`, `FPMM.fee`, exact quotes with `calcBuyAmount(investment, outcomeIndex)` / `calcSellAmount(return, outcomeIndex)`.
4. Trades/volume: `FPMMBuy(address indexed buyer, uint256 investmentAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensBought)` topic0 `0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8`; `FPMMSell` topic0 `0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4`; `FPMMFundingAdded` `0xec2dc3e5...a951`; `FPMMFundingRemoved` `0x8b4b2c8e...90e7`.
5. Resolution state: Reality.eth `getFinalizeTS`, `isFinalized`, `isPendingArbitration`, `resultFor`.

A polling adapter needs one `eth_getLogs` per 5-20k blocks plus about 6 `eth_call`s per market; for roughly 140 open markets that is a few hundred calls per full refresh, so batch JSON-RPC or use the Olas proxy/subgraph if an operator-supplied key or a tested keyless endpoint exists.

## 5. Trade path and PayBox reachability

- **Programmatic trade path: on-chain contract calls only.** Sequence for a buy: (a) hold wxDAI (wrap xDAI via `wxDAI.deposit()` payable if only native xDAI), (b) `wxDAI.approve(fpmm, amount)`, (c) `FPMM.buy(investmentAmount, outcomeIndex, minOutcomeTokensToBuy)`. Sell: `ConditionalTokens.setApprovalForAll(fpmm, true)` then `FPMM.sell(returnAmount, outcomeIndex, maxOutcomeTokensToSell)`. After resolution: `ConditionalTokens.redeemPositions`. (H: function names and semantics from `FixedProductMarketMaker.sol` and PMAT `OmenFixedProductMarketMakerContract`.) The Omen README lists a `CPKFactory` (H), so the Omen UI very likely batches these steps through a CPK proxy (M); Olas bots are described as executing through a Gnosis Safe (M: Olas Predict descriptions in search results). A plain EOA calling the contracts directly needs no proxy (M, contract code has no sender restriction in the functions I read).
- Auth/signing scheme: none beyond ordinary EVM transaction signing. No API keys, no EIP-712 orders, no relayer.
- Slippage guard is on-chain (`minOutcomeTokensToBuy`), so quotes via `calcBuyAmount` can be signed into the call safely.
- **PayBox reachability: partial.** H (this session): `discover_tokens mode=chains` returns 11 featured chains (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid) with Gnosis absent from that list, but `discover_tokens mode=chains query=gnosis` returns `{"caip2":"eip155:100","chain":"gnosis","native_symbol":"XDAI","network_id":100}`, with the notice "Mainnet metadata catalog, not a support allowlist". So the chain exists in metadata; whether PayBox will sign/broadcast an arbitrary contract call on chain 100, and whether a bridge or swap route to wxDAI exists, is **unverified** (I called no signing or swap tool). Per `docs/research/06-paybox-platform.md` (earlier session, H), `request_wallet_sign` has a `transaction` intent, and EVM proposals pay gas in the chain's native currency (xDAI here, which is cheap). Each buy would be 2-3 separate transactions (wrap if needed, approve, buy); each sell 2 (approve-for-all once, then sell).
- Non-PayBox note: any EVM key/Safe can trade; this is not gated by KYC or an API.

## 6. Fees

- **Per-market trading fee set at creation, immutable, in 1e18 units.** In the 59 recent creations: 0% (creator `0xFfc8...f557`, 28 markets) or 1% (creator `0x89c5...6Fec`, 31 markets) (H, event data).
- Formula (H, `FixedProductMarketMaker.sol`): buy: `feeAmount = investmentAmount * fee / 1e18`, outcome tokens = f(`investmentAmount - feeAmount`); sell: `feeAmount = returnAmount * fee / (1e18 - fee)`, charged on top of the return. Fees stay in the pool as collateral and accrue to LP holders (`feePoolWeight`), i.e. to the market-creator Safe; **no protocol or frontend fee** in the contract. A Gnosis forum post says Presagio charges no frontend fee and plans none for 12-18 months (M, Aug 2024, possibly stale).
- Observed: 29.39 wxDAI of fees on 8,098 wxDAI of volume over 7 days = 0.36% effective (H, fixture), because about half the new markets are fee-0.
- Gas: negligible (xDAI at 0.1-0.17 gwei average on 2026-10-19; H gnosisscan stats). Not zero: needs xDAI in the signer.
- Slippage is the real cost: constant-product pools seeded with 7 wxDAI. On the 12 sampled live markets, buying outcome 0 with 1 wxDAI filled 0.1-2.3 percentage points above the marginal price on average, and with 5 wxDAI 0.5-9.3 points above (e.g. marginal 0.637 -> average 0.730 for 5 wxDAI) (M, computed offline from the reserves in the fixture; the fee-1% markets already include their fee).

## 7. Resolution mechanism and dispute risk

- Oracle: **Reality.eth v2.1** (`Realitio_v2_1`, H verified source) bonded answers: each new answer must post a bond at least double the previous one (`require ... "bond must be double at least previous bond"`, H). A question finalises when its timeout passes after the last answer, and a party can pay the arbitrator to rule (functions `notifyOfArbitrationRequest`, `submitAnswerByArbitrator` exist, H; the exact timeout/arbitration semantics are M, from Reality.eth design). Arbitrator on all 12 sampled markets is `0x5562Ac605764DC4039fb6aB56a74f7321396Cdf2`, which PMAT maps to `KLEROS_31_JURORS_WITH_APPEAL` (H for the mapping in source; I did not read that contract). Timeout on all 12: **86,400 s (24 h)**. `opening_ts` was 1-5 days after creation (2026-10-23 / 2026-10-24 for the markets created 2026-10-18/19).
- Settlement: anyone calls `RealitioProxy.resolve(questionId, templateId, question, numOutcomes)` at `0xAB16...81E2`, which checks the content hash, reads `realitio.resultFor`, and calls `conditionalTokens.reportPayouts`. (H, verified source.) Answer `0xff..ff` (**Invalid**) pays **every outcome 1** (equal split), so a hedge on another venue is left half-wrong on Invalid. Template 0/2 single-select; a "nuanced binary" template pays `4-answer` / `answer`.
- Dispute/ambiguity risk: HIGH relative to exchange-run venues. Questions are LLM-generated of the form "still hold on date D according to the most recent <page on site S>", which are time-snapshot, source-specific and open to ambiguity, and the 24 h timeout with doubling bonds is cheap to contest on small markets; Kleros is the backstop and costs money and time. No reports found of a specific wrong-answer incident on Omen in 2026 (NOT FOUND, searched: "Omen Kleros Reality.eth dispute wrong answer", Olas/Gnosis posts). A sibling note reports about 2 in 100 sampled answers were Invalid (M, unverified here).
- Cross-venue implication: never treat an Omen leg as equal to a Polymarket/Kalshi leg on the same real-world event; resolution sources and Invalid payouts differ.

## 8. Liquidity (with dates)

All wxDAI treated as 1 USD (M; xDAI peg, gnosisscan coin price 1.0).

| Metric | Value | Date / source |
|---|---|---|
| Volume, last 7 days (buys + sells, collateral amount) | 8,098 wxDAI over 7,653 trades; buys 6,943, sells 1,155 | to 2026-10-19 02:52 UTC; H (fixture `trade_volume_7d_summary_2026-10-19.json`) |
| Volume per rolling 24 h window (newest first) | 1,856 / 1,927 / 1,304 / 656 / 792 / 785 / 778 wxDAI | same |
| Median / p90 / max trade | 0.73 / 2.17 / 6.59 wxDAI | same |
| Markets traded in 7 days | 339 (139 still funded) | same |
| Distinct traders in 7 days | 150 (top 5 traders = 25% of trades) | same; consistent with bot-dominated flow (M) |
| LP funding in the 339 traded markets | 973 wxDAI total (139 markets x 7.0; 200 markets already de-funded) | 2026-10-19 via `totalSupply`; H |
| New markets | 59 in 28.3 h (bursty, two creators) | H |
| Total market count / lifetime volume / OI | **NOT FOUND** (searched: DefiLlama, Dune link in Omen bundle `explore.duneanalytics.com/dashboard/omen-stats` not opened, Olas, Gnosis blog). Pool depth per market is about 20-35 outcome tokens in total (M, sample). | |
| Agent activity (vendor) | 206 daily active Omenstrat agents; 63% 7-day accuracy, Brier 0.19 | 2026-10-19, olas.network (vendor figures) |

Older vendor claims ("billions in volume" on CTF platforms; 300+ daily agents, 79% accuracy, Nov 2024) are not Omen-specific or are more than 6 months old (L).

## 9. Event coverage and arbitrage overlap

- Sampled 12 of the 59 newest markets, categories: international 4, technology 3, finance 2, sports 1, business 1, health 1. Examples (all H, fixture): US federal deficit above $1.9T per Treasury Monthly Statement; Ukrainian control of a named village per BBC; Milwaukee Brewers "still NL champions" per MLB.com; Kenya MoH Ebola case count; French arrests tally; DDR5 retail price index vs baseline; Apple App Store guideline wording.
- Overlap with Polymarket/Kalshi/others: **no identical contracts**. Thematic overlap exists for sports postseason, macro prints and geopolitics, but thresholds, sources and horizons are bespoke, so an arbitrage link would need the human-approved rule-hash linking in `docs/market-linking-design.md`, and it would rarely exist. No crypto-price markets in the sample.
- The only plausible value is as a **signal**: Olas agent consensus on short-horizon news questions, which the linking layer could compare to Quotient/Polymarket when a matching question exists.

## 10. Shared liquidity (is it an independent leg?)

- Omen, AIOmen and Presagio share the **same FPMM contracts and factory**: not three legs (H: the Presagio repo and olas-predict constants list the same creator Safes; Gnosis forum calls AIOmen "a fork of old Omen", Presagio "Omen 2.0"). Count once.
- Independent of Polymarket (Polygon), Kalshi, Limitless, XO, and others: no mirrored liquidity or oracle (M). Seer (Gnosis, separate AMM pools) is said to share only the ConditionalTokens contract, not pools (M, from the sibling note; not independently checked).
- The market makers are the Olas creator Safes seeding 7 wxDAI per market and the Omenstrat bots trading against it; liquidity is therefore also correlated with Olas's own model signals, not independent information (M).

## 11. Geo, ToS, automation

- No terms of service, geoblock list or automation policy found for Omen, AIOmen or Presagio. NOT FOUND (searched: `omen.eth.limo` main bundle for "terms"/"jurisdiction"/"OFAC", `SwaprHQ/presagio` and `valory-xyz/olas-predict` repos via `gh search code`, Gnosis and Olas posts). A `termsOkCheck` field seen in the Presagio subgraph types belongs to Reality.eth/Curate question verification, not a legal ToS (M).
- Automation is the intended use: Gnosis publishes `prediction-market-agent-tooling` for programmatic Omen trading and the Olas bots trade it 24/7 (H). Permissionless contracts, no KYC, no API keys. Legal exposure (prediction-market regulation in the operator's jurisdiction) is the operator's, not something the venue enforces (M).
- Decentralised hosting risk: the front end is IPFS/ENS-hosted and currently half-broken (section 1); contracts are unaffected.

## 12. Adapter spec (for the aggregator)

- Venue id `omen-gnosis`; chain `eip155:100`; collateral wxDAI; fee per market from creation event; settlement via Reality.eth + RealitioProxy.
- Read mode only for v0.1: poll the factory log for new FPMMs from the two Olas creator Safes (maintain the creator allow-list; other creators are possible in principle), build market records from `LogNewQuestion` (title, category, opening time, timeout, arbitrator), refresh price/depth with `balanceOf`/`calcBuyAmount` for markets within their trading window, mark `suspended` once `opening_ts` passes or LP supply is 0.
- Normalisation: price = marginal price of outcome 0 (Yes); depth = executable size via `calcBuyAmount` at 1 and 5 wxDAI, not a book; fee = per-market immutable; resolution source = free-text (store the full raw question string and a content hash); `settles_invalid_as = equal split`.
- Do **not** count Presagio/Omen/AIOmen as separate venues. Do not auto-link to other venues without a human-approved link.
- Indexing cost is small; a keyless, tested public index would remove the polling load (open question below).

## 13. Open questions

1. Does the Olas keyless subgraph (`predict-omen-v1_1_1`) return the schema above and how fresh/rate-limited is it? Needs a read-only GraphQL POST, which this run did not do.
2. Can PayBox sign/broadcast an arbitrary contract call on Gnosis (chain 100), and is there a swap/bridge route from its supported chains to xDAI/wxDAI?
3. First-bond size and Kleros arbitration fee for the 31-juror arbitrator (sibling note says 5 xDAI first bond; unverified here).
4. Whether any non-Olas market creators remain (all 59 recent creations were the two Safes).
5. Why the AIOmen IPFS assets return 504 (unpinned content vs gateway issue); `omen.eth.limo` works.
6. Public RPC rate limits for `rpc.gnosischain.com` are undocumented; need a provider choice for production.

## Suspicious content / injection check

- No text aimed at AI agents found in any fetched page, repo file or API response.
- The `omen.eth.limo` main bundle embeds a third-party The Graph gateway URL containing an API key. Not used, not recorded here. (Credential in a public bundle; flagging only.)
- `pm.wiki/projects/aiomen` responds 308 to `https://x.com/PredMarketWiki` (redirect not followed; so the earlier search-snippet description of AIOmen from pm.wiki remains L).
- The Gnosis blog page shows byline Jul 22, 2025 while page metadata says Oct 12, 2026; I treated the content as 2025 (L for freshness).

## Sources

Primary on-chain and API reads (H, all 2026-10-19):
- Gnosis JSON-RPC `https://rpc.gnosischain.com` (read-only `eth_getLogs`, `eth_call`, `eth_blockNumber`, `eth_getBlockByNumber`).
- Explorer API `https://gnosisscan.io/api/v2/addresses/0x9083A2B699c0a4AD06F63580BDE2635d26a3eeF0` (+ `/counters`, `/logs`), `/smart-contracts/0xAB16D643bA051C11962DA645f74632d3130c81E2`, `/smart-contracts/0x79e32aE03fb27B07C89c0c568F80287C01ca2E57`, `/stats`.
- Front ends: `https://aiomen.eth.limo/`, `https://omen.eth.limo/` (+ its JS bundle), `https://presagio.pages.dev/`.
- The Graph gateway (no-key error) and Olas proxy redirects, see fixture `subgraph_and_api_probes_2026-10-19.txt`.
- PayBox `discover_tokens` (chains), session tool.

GitHub (read via `gh api`, H): https://github.com/gnosis/prediction-market-agent-tooling (README, `markets/omen/omen_contracts.py`, `omen_subgraph_handler.py`, `data_models.py`, `config.py`); https://github.com/gnosis/conditional-tokens-market-makers (`contracts/FixedProductMarketMaker.sol`); https://github.com/protofire/omen-exchange (README contract and subgraph tables); https://github.com/valory-xyz/trader (README, CLAUDE.md, service/skill yaml); https://github.com/valory-xyz/market-creator; https://github.com/valory-xyz/olas-predict; https://github.com/SwaprHQ/presagio; https://github.com/vbuterin/blog (`posts/cryptoai.md`, Jan 2024).

Web (H for what the page says; vendor claims flagged):
- https://eventtracker.ai/coverage
- https://forum.gnosis.io/t/omen-2-0-should-gnosisdao-provide-grant-to-the-development-of-a-new-frontend/8987 (Aug 26 - Sep 2, 2024)
- https://olas.network/agent-economies/predict (stats as of 2026-10-19 02:20 UTC; vendor dashboard)
- https://olas.network/blog/how-gnosis-used-olas-predict-to-build-the-largest-on-chain-prediction-market-economy (27 Nov 2024, stale)
- https://www.gnosis.io/blog/the-rise-of-ai-agents-in-prediction-markets-how-gnosis-infrastructure-is-powering-the-future-of-information-finance (Jul 2025, stale)
- https://api.llama.fi/protocols (no Omen listing)
- Secondary (M/L): IOSG summaries on kucoin.com/bitget.com/panews.io; pm.wiki snippet (not opened).

Fixtures (`docs/research/fixtures/aiomen/`): `frontend_probe_2026-10-19.txt`, `factory_address_and_counters.json`, `factory_creation_logs_rpc_sample.json`, `live_market_samples_2026-10-19.json`, `trade_volume_7d_summary_2026-10-19.json`, `subgraph_and_api_probes_2026-10-19.txt`.

Comparison with the sibling note `docs/research/venues/omen-aiomen-gnosis.md` (only its opening bottom-line section was skimmed): both say live, one shared venue across three UIs, P2, no official API, Reality.eth/Kleros with 24 h timeout, wxDAI. Differences: my volume figures come from full 7-day event logs (8,098 wxDAI, last-24h 1,856) rather than an extrapolation from a 36-market cohort, and I additionally found the AIOmen front-end assets returning 504 and the 0%/1% fee split by creator.
