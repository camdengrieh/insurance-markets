# Omen / AIOmen / Presagio (Gnosis Chain): venue spec for the aggregator and arbitrage scanner

Researched 2026-10-19 (probes about 02:15-02:50 UTC). READ-ONLY: unauthenticated GETs of public pages, static JS read as text (nothing executed), explorer GET endpoints, `gh api` file reads, and three read-only PayBox `discover_tokens` calls. No account, wallet, key, signature, POST/PUT/DELETE, payment, or money-moving PayBox tool. Public JSON-RPC (`eth_call`, POST) was deliberately not used.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred or computed by me from H data; **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing. The WebSearch budget was exhausted before I could run any news search (every query returned "budget used up"), so news, social and "DXdao deprioritised in 2022" claims could not be checked.

---

## 0. Bottom line

**adapter_priority: P2 (signal-only, thin).** Omen is alive, permissionless and has its own liquidity, but it is a bot-fed micro venue, not an arbitrage leg.

1. **Live, but only as an Olas bot economy.** Two Olas "market-creator" Safes create exactly 36 new binary markets per day (up to 2026-10-19 02:25 UTC), with 7 xDAI of seed liquidity each, and Olas-style agent Safes buy into them. Since 2026-01 essentially 100% of new Omen markets come from those two Safes. (H, section 1)
2. **Omen, AIOmen and Presagio are one venue.** Same Gnosis Chain FPMM contracts, three front ends. Do not count them as three legs. (H, section 2)
3. **Tiny liquidity.** Roughly 140 markets open at once, 7 xDAI of LP seed each, about USD 0.9k to 1.3k of volume per day, about USD 1k of pool liquidity and about USD 4k to 6k of open interest (all M, extrapolated from a 36-market cohort and 16 live samples). A USD 10 order on a fresh 7/7 pool moves the price from 0.50 to 0.855 (average fill 0.708). (section 10)
4. **No official read API.** The only structured index (Omen subgraphs on The Graph) needs an API key; hosted-service URLs are dead. Everything else is on-chain events plus `eth_call`. A keyless explorer GET path exists but the explorer's logs index is stuck 12 days behind. (section 5)
5. **Trade path is plain EVM contract calls** on Gnosis Chain (`FPMM.buy` / `sell`), no off-chain signed orders. PayBox lists Gnosis in its chain/token catalog, but signing/broadcast support there is unverified, and every trade needs 2 to 3 separate one-call proposals. (section 6)
6. **Almost no event overlap with other venues.** Questions are LLM-generated, short-horizon, bespoke ("Will X publish any new statement between date A and date B...?"). In a 377-question sample: 0 crypto-price, 5 commodity/stock-price, 6 macro, 22 election-ish, 13 sports-ish questions. (section 11)
7. **Resolution is Reality.eth v2.1 with a 24 h timeout, 5 xDAI first bond and Kleros as the final arbiter.** An Invalid answer pays every outcome 1/n, so a cross-venue hedge loses about half the notional on Invalid. About 2 of 100 sampled answers were Invalid. (section 8)

Worth building only if the aggregator wants a generic Gnosis CTF + Reality.eth indexer anyway (it would also serve Seer, which shares the ConditionalTokens contract). Otherwise skip. Revisit trigger: more than 3x the current daily volume, a keyless public index appearing, or the creators changing to broad-topic questions.

---

## 1. Is it still live? (H unless noted)

| Evidence | Result |
|---|---|
| Factory activity (`FPMMDeterministicFactory` `0x9083A2B699c0a4AD06F63580BDE2635d26a3eeF0`, Gnosis) | Distinct creation txs per day, from internal calls into the factory: 36 on every day 2026-10-05 to 2026-10-18; 20 by 02:25 UTC on 2026-10-19 (fixture `factory_creations_per_day.json`). Latest creation tx seen 2026-10-19T02:24:55Z. |
| Market creation share | 15,000 creation events paged back to 2025-04-23: Olas creator Safes make 100% of creations in 2026-01, 2026-03, 2026-05 to 2026-10; 2026-02 and 2026-04 contain 1 and 69 creations by others (fixture `creations_by_month_and_question_sample.json`). Non-wxDAI collateral (mostly sDAI) appears in 2025 and in 2026-04 (59 creations) and not at all since 2026-05. Human or third-party market creation has effectively stopped. |
| Trading today | 16 sampled FPMMs from creation txs of 2026-10-12/16/18/19: each took 14 to 51 xDAI of wxDAI inflow (incl. the 7 xDAI seed); the market created 2026-10-19T01:56Z already had 26 inflow transfers by 02:26Z (fixture `live_market_samples_2026-10-19.json`). All 4 sampled buyer addresses are `GnosisSafeProxy` contracts (M: consistent with agent Safes). |
| Market lifecycle | Creator Safe pulls its LP position about 3.8 to 3.9 days after creation (sample FPMM created 2026-10-07T05:48Z, LP withdrawn 2026-10-11T00:14Z; five more 2026-10-04 markets withdrawn 2026-10-08 00:54 to 02:53Z). So about 140 markets are open at any time (M: 36/day x about 3.9 days). |
| Explorer logs index | The address-logs endpoint of the Gnosis explorer is stuck at 2026-10-07T14:43:50Z for every contract I tried (factory, ConditionalTokens, wxDAI, an FPMM), while chain head was block 48,830,168 at 2026-10-19T02:30:55Z. The transactions, internal-transactions, token-transfers and token-balances endpoints are current. A naive "no events since 2026-10-07" would be wrong (fixture `explorer_logs_index_stall_evidence.json`). |
| Ethereum mainnet deployment | Dead: last `FixedProductMarketMakerCreation` on the Ethereum factory `0x89023DEb1d9a9a62fF3A5ca8F23Be8d87A576220` is 2023-05-08 (eth.blockscout.com logs, H). |
| Olas code | `valory-xyz/market-creator` pushed 2026-10-07 (not archived); `valory-xyz/trader` ("Omen on Gnosis and Polymarket on Polygon") pushed 2026-10-16; `valory-xyz/omen-protocol` pushed 2026-07-06. (`gh api`) |
| Gnosis AI repos | `gnosis/prediction-market-agent` last push 2026-04-17, `gnosis/prediction-market-agent-tooling` 2026-04-22: about 6 months old, possibly stale, but they still describe Omen/Presagio as the Gnosis venue. |
| Front ends | `https://omen.eth.limo/`, `https://aiomen.eth.limo/` and `https://presagio.pages.dev/` all return HTTP 200 on 2026-10-19 (fixture `omen_frontends_headers_manifest.txt`). |
| DXdao "deprioritised Omen in 2022" (from the discovery hint) | NOT FOUND (searched: WebSearch unavailable, budget exhausted; repo/manifest only). The `omen.eth.limo` manifest still says `providedBy: DXdao`; the `protofire/omen-exchange` repo's last commits on master are from 2021 (pushed 2023-09-20) and `protofire/omen-subgraph` is archived (2023-01-24). Treat the hint as plausible but unverified (L). |

Verdict: **still_live = true**, as a bot-driven venue on Gnosis Chain.

The DefiLlama hint ("Gnosis Protocol v1, about USD 1.0M TVL") is unrelated: that entry is a token DEX whose TVL adapter also counts the Ethereum ConditionalTokens contract; see `docs/research/venues/gnosis-protocol-v1.md`. DefiLlama has no Omen or Presagio entry (own check of `api.llama.fi/protocols`, 8,758 rows, 2026-10-19: no name, slug or url containing "omen" or "presagio"; Seer is listed separately) (H).

---

## 2. Name map: Omen = AIOmen = Presagio

- **Omen** (`omen.eth.limo`): original 2020 to 2021 front end by DXdao/Protofire, now a static IPFS build (etag is the CID `bafybeics6wz...`). Its bundle still carries Rinkeby and Sokol networks, hosted-service subgraph URLs and an embedded Graph gateway URL (the key in it is a third party's and was not used or recorded). Whether the app still renders markets cannot be checked without a browser; the subgraph URLs it uses either redirect (hosted service, see fixture `thegraph_omen_subgraph_no_key.txt`) or need that embedded key. (H on contents, L on whether it works)
- **AIOmen** (`aiomen.eth.limo`): a second IPFS build (different CID, same 4,001-byte index). The Gnosis tooling README lists "AIOmen" as the venue name, and the Olas README calls the same venue "Omen" and links `aiomen.eth.limo`. (H: `gnosis/prediction-market-agent-tooling` README, `valory-xyz/market-creator` and `trader` READMEs)
- **Presagio** (`presagio.pages.dev`, Next.js on Cloudflare Pages): the Gnosis-built front end, page metadata "Presagio - Where predictions meet AI agents" / "Bet on prediction markets in Gnosis Chain, enhanced by AI." Gnosis' own README says: "Presagio (with former name Omen)". It queries the same Omen subgraphs and Dune queries. (H: page RSC payload, bundle strings, `gnosis/prediction-market-agent` README)
- Name collisions: `presagio.xyz` is a different thing (a HIP-4 Hyperliquid front end, see `presagio-presagio-xyz-hip-4-interface.md`). The SoK catalogue's "Presagio (Omen 2.0 on Gnosis, Swapr)" is a third reference I did not resolve (NOT FOUND, searched: repo and bundle text only).
- Relation to Seer: Seer shares the Gnosis ConditionalTokens contract `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce` but not pools (Seer outcome tokens trade on Swapr/Uniswap). The Seer repo's guide `coming-from-omen.mdx` is a good independent description of Omen's contracts. (H)

---

## 3. Kind and market model

- **Kind:** `onchain-amm`. One Fixed Product Market Maker (FPMM, Gnosis `conditional-tokens-market-makers`) contract per market; the FPMM is both the AMM and the LP token. No order book. Each FPMM is an EIP-1167 clone of implementation `0x907E5E6E8391395f6D518ae29Bfe593051bBEC52`. (H: explorer `proxy_type: eip1167`)
- **Tokenisation:** Gnosis Conditional Tokens (ERC-1155) in the singleton `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce`. Position id = `keccak256(collateral, collectionId)`; for a binary market `indexSet` 1 = outcome 0 ("Yes"), 2 = outcome 1 ("No"). Outcome tokens are NOT wrapped to ERC-20 (Seer wraps; Omen does not). I derived the position ids offline with the CTHelpers algorithm (keccak, then lift to alt_bn128 and take x with parity bit) and they match the FPMM's on-chain token ids exactly (fixture `explorer_fpmm_token_balances_and_price_derivation.json`). (H)
- **Market types:** binary and categorical (N outcomes) via template 2; scalar via the separate scalar oracle adapter (`Reality.eth Oracle Adapters (Scalar)` `0xb97FCb6adf4c4aF9981932a004e6CC47173d0Bfc` in the Omen README; `scalarLow/scalarHigh` in the subgraph schema); multi-condition FPMMs exist in the factory ABI (`conditionIds[]`), but the Olas bots create single-condition binary markets only: all 377 sampled questions have outcomes `"Yes","No"` and the 50 newest creation events each carry exactly one condition id. (H on the bots; M on categorical/scalar/multi-condition support, taken from the schema and ABI, not from live markets)
- **Pricing (H, from `FixedProductMarketMaker.sol`):** with pool balances `B_i` (the FPMM's ERC-1155 balances), spot `p_i = prod_{j!=i} B_j / sum_k prod_{j!=k} B_j`; binary: `p_yes = B_no / (B_yes + B_no)`, and the two prices sum to exactly 1. Buy of `x` collateral with fee `f`: `x' = x(1-f)`; tokens out `= B_i + x' - ceil(B_i * prod_{j!=i} B_j/(B_j + x'))`. Sell is the mirror image (fee added on top of the return amount). The contract exposes `calcBuyAmount(investmentAmount, outcomeIndex)` and `calcSellAmount(returnAmount, outcomeIndex)` as views for exact quotes.
- A full set (1 Yes + 1 No) always splits from or merges to exactly 1 collateral at the CTF, so the AMM price is bounded by split/merge arbitrage like any CTF venue. (H: lifecycle doc in `valory-xyz/market-creator/.claude/docs/omen_lifecycle.md`)

---

## 4. Chains, collateral and contracts

| Item | Value | Evidence |
|---|---|---|
| Live chain | Gnosis Chain (chain id 100, block time about 5 s, native xDAI at USD 1.0, average gas about 0.17 gwei) | H: explorer `/api/v2/stats` 2026-10-19 |
| Dead chain | Ethereum mainnet (factory `0x89023DEb...`, CT `0xC59b0e4De5F1248C1140964E0fF287B192407E0C`), last market creation 2023-05-08 | H |
| ConditionalTokens | `0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce` (shared with Seer) | H |
| FPMM factory | `0x9083A2B699c0a4AD06F63580BDE2635d26a3eeF0`, event `FixedProductMarketMakerCreation(creator, fixedProductMarketMaker, conditionalTokens, collateralToken, conditionIds[], fee)`, deterministic (CREATE2, `create2FixedProductMarketMaker`) | H |
| Oracle adapter ("RealitioProxy") | `0xAB16D643bA051C11962DA645f74632d3130c81E2` (the `oracle` in `ConditionPreparation` of a current bot market; the Omen README lists an older `0x2bf1BFb0...`) | H |
| Reality.eth | `Realitio_v2_1` `0x79e32aE03fb27B07C89c0c568F80287C01ca2E57` | H |
| Arbitrator | Kleros `0x5562Ac605764DC4039fb6aB56a74f7321396Cdf2` ("31 jurors with appeal" in the tooling enum); alternatives `0xe40DD83a262da3f56976038F1554Fe541Fa75ecd` (511 jurors, no appeal) and DXdao `0xFe14059344b74043Af518d12931600C0f52dF7c5` | H (tooling code), all 377 sampled questions use `0x5562...` |
| Collateral | wxDAI `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d` for all bot markets since 2026-05; earlier also sDAI `0xaf204776c7245bF4147c2612BF6e5972Ee483701`, GNO, EURe, SAFE, COW, WETH, Metri Super Group (tooling `CollateralTokenChoice` and constants) | H |

Collateral is plain USD-pegged (wxDAI) so share prices are USD probabilities directly (M, wxDAI at USD 0.9999992 in PayBox's catalog at fetch time, H for that number).

---

## 5. Read API

**Official public API: none.** NOT FOUND (searched: omen.eth.limo and aiomen.eth.limo bundles, `protofire/omen-exchange` README, `gnosis/prediction-market-agent-tooling` README and code, presagio.pages.dev bundle). Options in order of usefulness:

1. **On-chain events + `eth_call` on a Gnosis RPC (recommended for an adapter).**
   - Discover markets: `FixedProductMarketMakerCreation` on the factory; question text and closing time from `Realitio_v2_1.LogNewQuestion` in the same tx (`question` string uses U+241F separators: title, outcomes, category, language; `opening_ts`, `timeout`, `arbitrator` fields). Fixture `market_creation_tx_decoded.json` has one fully decoded creation tx.
   - Prices and depth: `CT.balanceOfBatch([fpmm...], positionIds)` and the pricing formulas in section 3, or `FPMM.calcBuyAmount/calcSellAmount` for executable quotes; `FPMM.fee()`, `totalSupply()` (LP shares). Position ids must be computed locally (CTHelpers algorithm) or taken from `ConditionalTokens` events.
   - Trades: `FPMMBuy(buyer indexed, investmentAmount, feeAmount, outcomeIndex indexed, outcomeTokensBought)` and `FPMMSell(...)`, plus `FPMMFundingAdded/Removed`. Topic0 values (computed with `cast keccak`): FPMMBuy `0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8`, FPMMSell `0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4` (FPMMBuy topic0 H: it equals `topics[0]` of an explorer-decoded `FPMMBuy` log; FPMMSell is M, same computation but no live Sell event seen).
   - Resolution: `Realitio_v2_1.LogNewAnswer/LogFinalize`, `ConditionalTokens.ConditionResolution/PayoutRedemption`, `payoutNumerators/payoutDenominator` views.
   - Public Gnosis RPC base URL: NOT FOUND in a primary source this session (the Omen 2021 bundle references `rpc.xdaichain.com`, probably stale; `rpc.gnosischain.com` is the commonly used one, L). JSON-RPC is POST-only, so I did not call it. Rate limits NOT FOUND. WebSocket: none from the venue; `eth_subscribe` on a WS-capable RPC provider would be the only way (not probed).
2. **The Graph subgraphs (what Omen, Presagio and the Olas/Gnosis agents all use).** Ids from `gnosis/prediction-market-agent-tooling` (`omen_subgraph_handler.py`): Omen trades `9fUVQpFwzpdWS9bq5WkAnmKbNNcoBwatMR4yZq81pbbz`, ConditionalTokens `7s9rGBffUTL8kDZuxvvpuc46v44iuDarbrADBFw5uVp2`, Reality `E7ymrCnNcQdAAgLbdFWzGE5mvr5Mb5T9VfT43FqA7bNh`, thumbnails `EWN14ciGK53PpUiKSm7kMWQ6G4iz3tDrRLyZ1iXMQEdu`, agent-result mapping `J6bJEnbqJpAvNyQE8i58M9mKF4zqo33BEJRdnXmqa6Kn`, all at `https://gateway-arbitrum.network.thegraph.com/api/{graph_api_key}/subgraphs/id/<id>`. A GET without a key returns `{"errors":[{"message":"auth error: missing authorization header"}]}` (H, fixture `thegraph_omen_subgraph_no_key.txt`). So: **authenticated** (a free Graph Studio key; I did not create one). The old hosted-service URL `api.thegraph.com/subgraphs/name/protofire/omen-xdai` now 301-redirects to `error.thegraph.com/apierror.json` (H). Useful entities (schema from the archived `protofire/omen-subgraph`, H): `FixedProductMarketMaker` (`outcomeTokenAmounts`, `outcomeTokenMarginalPrices`, `fee`, `usdLiquidityMeasure`, `usdVolume`, `usdRunningDailyVolume`, `title`, `outcomes`, `category`, `openingTimestamp`, `resolutionTimestamp`, `payouts`, `currentAnswer`, `currentAnswerBond`, `isPendingArbitration`, `curatedByDxDaoOrKleros`), `FpmmTrade`, `FpmmParticipation`, `Condition`, `Question`. Note the Omen subgraph's `Question.id` is the Reality `questionId`, unlike the Reality subgraph (tooling comments, H).
3. **Keyless explorer GETs (fallback and what produced my fixtures).** The Gnosis explorer is now Blockscout-style at `https://gnosisscan.io/api/v2/...` (`gnosis.blockscout.com` 301-redirects there; both H). Working keyless endpoints: `/addresses/{fpmm}/token-balances` (live pool balances: two ERC-1155 positions plus the wxDAI fee pot as an ERC-20 entry), `/addresses/{a}/token-transfers`, `/addresses/{factory}/internal-transactions` (live market-creation calls), `/addresses/{a}/transactions`, `/transactions/{hash}/logs`, `/stats`. Gotchas: (a) `/addresses/{a}/logs` is 12 days stale and returns empty `transaction_hash` fields; (b) pagination `next_page_params` must be sent back with booleans lower-cased (`true`), else HTTP 422; (c) the Etherscan-style `module=proxy&action=eth_call` is not supported ("Unknown module"), so there is no GET path for `eth_call`; (d) `/smart-contracts/{fpmm}/methods-read` returns 404 for clones. Rate limits NOT FOUND; I stayed under about 3 requests/s with no throttling.
4. **Dune** (`dune.com/gnosischain_team/ai-agents-overview-omen-prediction-markets`; Presagio's own stats use Dune queries 3582994, 3781367, 4537552, 4565681, 4576765 via `api.dune.com/api/v1/query/<id>/results`): needs a Dune API key. Public dashboard page read through the fetch summariser shows raw per-action rows labelled USD up to about 2026-07-26 but no totals (L; not parsed further).

Fixtures with real response shapes (all under `docs/research/fixtures/omen-aiomen-gnosis/`): `explorer_factory_creation_logs_first4.json`, `explorer_fpmm_token_balances_and_price_derivation.json`, `explorer_fpmm_events_sample.json`, `market_creation_tx_decoded.json`, `explorer_fpmm_token_transfers_head.json`, `live_market_samples_2026-10-19.json`, `cohort_2026-10-04_36_markets.json`, `creations_by_month_and_question_sample.json`, `factory_creations_per_day.json`, `explorer_logs_index_stall_evidence.json`, `thegraph_omen_subgraph_no_key.txt`, `omen_frontends_headers_manifest.txt`.

---

## 6. Trade path and PayBox reachability

**Programmatic trading: yes, with ordinary EVM transactions on Gnosis Chain. No off-chain order, no API key, no EIP-712 order.** (H: `OmenFixedProductMarketMakerContract` in `gnosis/prediction-market-agent-tooling`, FPMM source)

| Action | Calls |
|---|---|
| Buy | (native xDAI users: `wxDAI.deposit{value}`) then `wxDAI.approve(fpmm, amount)` then `FPMM.buy(investmentAmount, outcomeIndex, minOutcomeTokensToBuy)`; get the min from `calcBuyAmount` with your slippage. |
| Sell | once `ConditionalTokens.setApprovalForAll(fpmm, true)`, then `FPMM.sell(returnAmount, outcomeIndex, maxOutcomeTokensToSell)` with the max from `calcSellAmount`. |
| Add/remove liquidity | `FPMM.addFunding(amount, [])` / `removeFunding(shares)`. |
| Merge/split | `ConditionalTokens.mergePositions/splitPosition` directly (no market maker involved). |
| Settle | after Reality finalises: `OracleAdapter(0xAB16...).resolve(questionId, templateId, question, numOutcomes)` (permissionless, M) then `ConditionalTokens.redeemPositions(wxDAI, 0x0, conditionId, [1,2])`. |

The Omen web app batches these through a CPK/Safe proxy; a plain EOA does them as separate transactions. Positions are held by `msg.sender`. The signing scheme is whatever the wallet uses (EOA ECDSA or Safe), nothing venue-specific.

**PayBox:**
- `discover_tokens mode=chains query=gnosis` returns `{caip2: "eip155:100", chain: "gnosis", name: "Gnosis", native_symbol: "XDAI", network_id: 100}` and a token search on `eip155:100` returns WXDAI `0xe91d153e0b41518a2ce8dd3d7944fa863463a97d` (USD 0.9999992, 27,606 holders, USD 62.7k liquidity, USD 130k 24 h volume). (H, live PayBox calls 2026-10-19. Note: `06-paybox-platform.md` lists 11 chains without Gnosis; that is most likely the default "featured" listing, since a query on the full catalog does return Gnosis (M).) The tool's own notice says "Mainnet metadata catalog, not a support allowlist ... Signing permissions are unchanged." (H)
- A plugin transaction proposal accepts any `eip155:<id>` syntactically, but "the selected network must be available in PayBox" and the failure mode for an unsupported chain is NOT FOUND (see `06-paybox-platform.md`, section 3). One call per proposal, so a first buy is up to 3 proposals (wrap, approve, buy) and a sell is 2 (setApprovalForAll, sell), each needing approval; the wallet needs xDAI for gas. PayBox's buy-link destinations are Base, Ethereum, Robinhood and Solana only (project note 06), so funding Gnosis needs a bridge or a swap route PayBox may or may not offer (unverified; `request_swap` is a money tool and was not called).
- Verdict: **paybox_reachable = partial.** The same EVM address works on every chain and Gnosis is in the catalog, but nobody has shown a Gnosis proposal or swap through PayBox, and the multi-step flow is clumsy. Test with the portal's "Validate transaction" on `eip155:100` before relying on it.

---

## 7. Fees

- **Market fee `f`, set per market at creation** (`fee` argument of `create2FixedProductMarketMaker`; unit `1e18 = 100%`). The Olas market-creator default in `service.yaml` is `market_fee: 2.0`, but the live bot markets are **0% (2,002 of 4,000 creations in 2026-06-18..10-07) and 1% (`1e16`, 1,998 of 4,000)**; the earlier 2.0 default is not what is on chain (H, fixture `factory_creations_per_day.json`). The Omen UI default is 2% (M, from the market-creator default and `coming-from-omen`: "usually 2%").
- **Who pays:** the trader. Buy: `feeAmount = investmentAmount * f`, deducted before pricing (`FPMMBuy.feeAmount`). Sell: `feeAmount = returnAmount * f / (1-f)` is taken from the tokens sold on top of `returnAmount`. Fees go to the pool's `feePoolWeight` and are claimable pro rata by LPs; the wxDAI fee pot is visible as the FPMM's ERC-20 balance (e.g. 0.2856 wxDAI after about 28.6 xDAI traded on a 1% market). (H: source)
- **No protocol or platform fee** in the FPMM source (H: the fee-related lines of `FixedProductMarketMaker.sol` only touch `feePoolWeight`). Front-end fee: none found (NOT FOUND, searched: Presagio and Omen bundles).
- **Gas:** about 0.17 gwei average on Gnosis, so a transaction costs a fraction of a cent (H, explorer stats). Funding and bridging costs are outside the venue.
- **Effective cost is dominated by price impact**, not fees (section 10): a 1% fee on a USD 10 order into a 7/7 pool moves the average fill from 0.708 to 0.714 (0.6 points), against 20.8 points of price impact from the 0.50 spot.

---

## 8. Resolution mechanism and dispute risk

- **Oracle:** Reality.eth v2.1 (`Realitio_v2_1`) with the Omen adapter as the CTF `oracle`. Template 2 (single select, `"Yes","No"`), `timeout` 86,400 s (24 h) after the latest answer, arbitrator Kleros `0x5562...`, `opening_ts` set about 4.8 days after creation in the decoded sample (creation 2026-10-07T05:48Z, opening 2026-10-12T00:00Z). The Olas resolver posts the first answer with a **5 xDAI bond** (all 100 sampled `LogNewAnswer` events had bond 5.0 xDAI: 53 "No", 45 "Yes", 2 Invalid `0xff..ff`). Anyone can challenge by doubling the bond within the timeout; if the bond game does not settle, `requestArbitration` sends it to Kleros. (H for parameters from `LogNewQuestion`/`LogNewAnswer`; the generic bond-doubling description is M from Reality.eth design; the Reality docs page I tried returned 404)
- **Finalising:** after the timeout without a new answer, anyone calls the adapter's `resolve` which reports payouts to the CTF; then holders `redeemPositions`. (M, from lifecycle doc and tooling)
- **Invalid answer:** every outcome pays `1/n` (binary: 0.5 each). (M: stated in Seer's `coming-from-omen` guide, quoting Omen's `getSingleSelectPayouts`; I did not read that contract's source.) So hedging Omen Yes against Polymarket No loses about half the notional if Omen resolves Invalid, and 2% of sampled initial answers were Invalid.
- **"Answered too soon" / reopen**: Reality.eth supports reopening; Omen's handling is not documented here (NOT FOUND).
- **Dispute and quality risk is high for this venue's actual question set**: LLM-generated questions with source clauses like "according to official statements", cheap-looking 5 xDAI bond, 24 h timeout, one initial answerer (the Olas resolver). The sample includes stale premises (e.g. "Will the Federal Reserve benchmark lending rate still be reported at 5.5% or higher on October 6, 2026", H as text, M as judgement). Cross-venue pairs would have rule-text divergence by construction.
- Kleros arbitration cost and juror timelines were not researched.

---

## 9. Geo, ToS and automation

- **No ToS, privacy or geo-restriction text found** in the Omen bundle, the Presagio bundle (grep for terms/privacy/jurisdiction/restricted/risk returned nothing), or `presagio.pages.dev/terms` (HTTP 404). Omen/AIOmen are static IPFS front ends behind eth.limo with no server-side geo-block mechanism; the contracts are permissionless. NOT FOUND (searched: those bundles, READMEs, Gnosis/Olas repos). Absence of a ToS is not a legal clearance, and the venue's operators (Gnosis, Olas) are not US-exempt in any way I could check.
- **Automation is explicitly the use case**: `gnosis/prediction-market-agent` ("AI Agent frameworks ... betting agent") and `valory-xyz/trader` ship open-source bots for exactly this venue (Gnosis repos LGPL-3.0 per the GitHub licence field; Apache-2.0 stated in the `omen-protocol` README). No rate limits or API terms because there is no first-party API.
- Public Graph and Dune endpoints are gated by third-party keys whose terms are those of The Graph and Dune (not read).

---

## 10. Liquidity (figures dated; all M unless stated)

| Metric | Value | Basis |
|---|---|---|
| New markets per day | 36 (constant since at least 2026-06-18; 1,000+ per month since 2026-05) | H, fixtures |
| Seed liquidity per market | 7 xDAI (7e18 per outcome, `FPMMFundingAdded.amountsAdded`), removed by the creator about 3.9 days later | H (36 of 36 in the 2026-10-04 cohort) |
| Open markets at once | about 140 | M (36/day x 3.9 days) |
| Volume per market over its life | about 25 xDAI (2026-10-04 cohort: 36 markets, 818 buys, 0 sells, 899.2 xDAI bought through 2026-10-07T14:43Z, i.e. about 3.4 days of life, every buy from a distinct address within a market); the 16 live samples show 7 to 44 xDAI net of the seed (the top one was 30 minutes old), several still open | H on the numbers, M on extrapolation |
| Daily volume | about USD 0.9k to 1.3k (one new cohort a day x about 25 to 36 xDAI) | M |
| Pool liquidity (LP) | about USD 1k (140 x 7) | M |
| Open interest (collateral locked in the CTF for open markets) | about USD 4k to 6k (140 x (7 + about 25 to 35)) | M |
| TVL listed by DefiLlama | none (no Omen entry) | H |
| Largest single market / human-created legacy markets | NOT FOUND (searched: needs the subgraph key; explorer cannot rank markets) | |

**Depth illustration** (pure FPMM maths on a fresh 7/7 pool, fee 0): USD 1 buys 1.875 shares (average 0.533, price moves 0.50 to 0.566); USD 10 buys 14.12 shares (average 0.708, price to 0.855); USD 50 buys 56.1 shares (average 0.891, price to 0.985). With the project's USD 10 per-order cap a "fair" 6-cent gross gap is unreachable; Omen can only be a quote, not an execution leg.

Takers are many different Safe contracts (4 of 4 sampled buyers are `GnosisSafeProxy`), consistent with Olas "Omenstrat" agents (M, inference; the Olas README states Omenstrat trades Omen).

---

## 11. Event coverage and overlap with other venues

Sample: 377 `LogNewQuestion` events, 2026-09-27 to 2026-10-07, all from the two Olas creator Safes (fixture `creations_by_month_and_question_sample.json`).

- Categories (self-labelled by the question generator): politics 91, international 63, business 46, finance 43, weather 41, health 28, science 25, technology 12, sustainability 12, entertainment 10, sports 3 (others 3).
- Keyword overlap with typical Polymarket/Kalshi topics: crypto price 0; commodity/stock price 5 (e.g. "Will the price of Brent crude oil remain below USD 105 per barrel on October 8, 2026"); macro/central bank 6; election or vote 22 (e.g. Brazilian general-election results); sports match 13; "announce/issue/publish" statements 84 (about 22%).
- Format: 218 of 377 are "on <date>" checks and 113 are "between <date> and <date>" windows, so horizons are 1 to 5 days. Rules are sourced to "official" websites, which will rarely match another venue's resolution source.
- Conclusion: **overlap that supports arbitrage is close to zero** (at best a handful of commodity/election/macro lookalikes per week, with different rules and dates). Any link must go through the project's human-approved, rule-hash-pinned link registry. Omen's value to the aggregator would be as a free crowd/agent signal on obscure news-event questions, not as a leg.

---

## 12. Shared liquidity

- Omen, AIOmen and Presagio use the same FPMM contracts: **one liquidity pool, three front ends**. Count it once.
- Shares the ConditionalTokens contract with Seer but **not** liquidity (Seer's outcome tokens trade on Swapr/Uniswap pools). Same-event pairs between Omen and Seer would be independent legs, but there are no same-event pairs because the question sets are generated separately.
- Not linked to Polymarket: Olas' "Polystrat" is a separate trader on Polymarket (H, `valory-xyz/trader` README), no shared book.

---

## 13. Adapter sketch (if built)

1. Poll factory creation events (or the live explorer `internal-transactions` as a keyless cross-check) for new FPMMs; join `LogNewQuestion` by `questionId` from the condition for title, close time, category.
2. For open FPMMs, one `balanceOfBatch` per block range to get pool balances; compute `p_i` and executable quotes locally with the section 3 formulas (verify against `calcBuyAmount`). Do not use token-balances endpoint ERC-20 entries as outcome balances (it also lists the wxDAI fee pot).
3. Treat the venue as `kind=amm-pool`, `fee` from the FPMM, `outcomes` binary, `invalid_payout = 1/n`, `resolution_source = Reality.eth v2.1 / Kleros`, `settlement ~ opening + 24 h`.
4. Exclude markets where pool balance of any outcome is below a floor, expire markets whose LP was withdrawn (pool balances near 0 or empty token-balances list, seen on 2026-10-12 samples).
5. The same indexer code covers Seer's CTF positions, so cost is incremental if Seer is built (see `seer.md`).

---

## 14. NOT FOUND

- Any official Omen, AIOmen or Presagio API, docs site, terms of use, privacy policy or geo policy (searched: bundles, READMEs, eth.limo and pages.dev hosts, Gnosis/Olas repos).
- News or social confirmation of Omen's governance status, the "DXdao deprioritised in 2022" claim, or Gnosis/Olas plans (searched: WebSearch unavailable, budget exhausted).
- Aggregate all-time volume, OI or TVL for Omen from a primary source (The Graph and Dune both need keys; DefiLlama has no listing).
- Public Gnosis RPC rate limits and a verified public RPC URL (JSON-RPC is POST and was not used).
- Whether PayBox can simulate, sign and broadcast on `eip155:100`.
- Kleros dispute cost and juror timing for the `0x5562...` arbitrator.
- How Omen/Presagio handle Reality "answered too soon" reopening.
- Whether `omen.eth.limo` still renders markets in a browser.

## 15. Open questions

1. Is daily volume stable at about USD 0.9k to 1.3k, or growing/declining? (Needs a 2-week poll of `internal-transactions` plus wxDAI inflow per market.)
2. Does any non-bot party (human LPs) still hold meaningful liquidity in older Omen markets? (Needs a Graph key to rank `fixedProductMarketMakers` by `usdLiquidityMeasure`.)
3. Are the Olas buyers a closed set of agents whose position changes could serve as an "AI-agent consensus" signal?
4. Does PayBox accept Gnosis transaction proposals?

---

## Sources

Primary, first-hand this session:
- https://omen.eth.limo/ and /manifest.json, https://omen.eth.limo/static/js/main.c5d67692.chunk.js (read as text) [H]
- https://aiomen.eth.limo/ [H]
- https://presagio.pages.dev/ and its `/_next/static/chunks/*` (read as text) [H]
- https://github.com/gnosis/prediction-market-agent-tooling (README; `prediction_market_agent_tooling/markets/omen/{omen_contracts.py, omen_subgraph_handler.py, omen_constants.py, data_models.py}`, `config.py`) [H; pushed 2026-04-22]
- https://github.com/gnosis/prediction-market-agent (README; pushed 2026-04-17) [H]
- https://github.com/valory-xyz/market-creator (README, `.claude/docs/omen_lifecycle.md`, `service.yaml`, `create_market_tx.py`; pushed 2026-10-07), https://github.com/valory-xyz/trader (README; pushed 2026-10-16), https://github.com/valory-xyz/omen-protocol (README; pushed 2026-07-06) [H]
- https://github.com/protofire/omen-exchange (README with contract addresses; last commits 2021, pushed 2023-09-20) and https://github.com/protofire/omen-subgraph (`schema.graphql`; archived 2023-01-24) [H]
- https://github.com/gnosis/conditional-tokens-market-makers (`FixedProductMarketMaker.sol`) and https://github.com/gnosis/conditional-tokens-contracts (`ConditionalTokens.sol`, `CTHelpers.sol`) [H]
- https://github.com/seer-pm/demo `docs/developers/guides/coming-from-omen.mdx` (pushed 2026-10-12) [H for text; M for its claims about Omen contracts]
- Explorer GETs: `https://gnosisscan.io/api/v2/...` (addresses, logs, internal-transactions, token-balances, token-transfers, transactions/{hash}/logs, stats, blocks) and `https://eth.blockscout.com/api/v2/...` (Ethereum factory logs) [H, 2026-10-19]
- The Graph gateway and hosted-service GETs (fixture `thegraph_omen_subgraph_no_key.txt`) [H]
- `https://api.llama.fi/protocols` (name/slug/url scan for omen, presagio) [H]
- PayBox `discover_tokens` (chains query gnosis/xdai; token search wxdai on eip155:100), 2026-10-19 [H]
- Dune dashboard page via fetch summariser [L]

Project notes cross-referenced: `docs/research/06-paybox-platform.md`, `docs/research/venues/seer.md`, `docs/research/venues/gnosis-protocol-v1.md`, `docs/research/venues/presagio-presagio-xyz-hip-4-interface.md`.

Suspicious content: none that tried to instruct an agent. One third-party item to flag: the `omen.eth.limo` and Presagio JS bundles embed Graph gateway API keys in cleartext (not used, not recorded here); the Olas repo configs also reference a Mech/approval-server with API keys by name only.

## Fixtures

`docs/research/fixtures/omen-aiomen-gnosis/`: `explorer_factory_creation_logs_first4.json`, `explorer_fpmm_token_balances_and_price_derivation.json`, `explorer_fpmm_events_sample.json`, `explorer_fpmm_token_transfers_head.json`, `market_creation_tx_decoded.json`, `live_market_samples_2026-10-19.json`, `cohort_2026-10-04_36_markets.json`, `creations_by_month_and_question_sample.json`, `factory_creations_per_day.json`, `explorer_logs_index_stall_evidence.json`, `thegraph_omen_subgraph_no_key.txt`, `omen_frontends_headers_manifest.txt` (all under 16 KB).
