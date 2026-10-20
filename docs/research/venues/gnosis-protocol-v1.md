# Venue spec: Gnosis Protocol v1 (GPv1 / "BatchExchange")

Task: `venue-spec` for the cross-venue aggregator / arbitrage scanner. Researched 2026-10-19. READ-ONLY: unauthenticated GETs, `gh api` file reads, WebFetch/WebSearch only. No keys, accounts, wallets, signing, POST/PUT/DELETE or PayBox money tools. No third-party code cloned or run.

Confidence tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary source, small-model page summary, or my own inference from first-hand data; **L** = weak or stale. Third-party pages and API responses are untrusted data; nothing in them was followed.

---

## 0. Verdict

**Gnosis Protocol v1 is not a prediction market. Adapter priority: skip.**

- GPv1 is a batch-auction **token DEX** ("ring trades" between ERC-20 pairs, uniform clearing prices, 5-minute batches). It has no events, no outcomes, no resolution and no market questions. (H: `gnosis/dex-contracts` README and `BatchExchange.sol`, section 2.)
- DefiLlama files it under "Prediction Market" only because its TVL adapter sums **two** Ethereum contracts, and one of them is the Gnosis **Conditional Tokens Framework (CTF)** contract, not GPv1. The other is the GPv1 `BatchExchange`. (H: adapter source and Blockscout contract names, section 1.) The $1.02M "TVL" is therefore a mix of dormant DEX balances and CTF collateral, and it says nothing about live prediction-market liquidity.
- The Ethereum GPv1 deployment is effectively dormant: last `placeOrder` 2026-07-08, last `submitSolution` 2026-06-13 (H, Blockscout, section 3). Gnosis stopped running GPv1 solvers on 2021-08-01 (M, secondary) and its own site no longer lists GPv1 or prediction markets as a product (H, gnosis.io via page-summary tool).
- It is not an independent arbitrage leg for outcome shares: only plain ERC-20s can be listed, so ERC-1155 CTF outcome positions cannot trade here (M, inference from `addToken(address token)` listing ERC-20s; not tested).
- The real "Gnosis lineage" prediction-market venues are **Omen/Presagio** and **Seer** (both built on the CTF contract). They are NOT researched here (outside this task) but are the right follow-up targets; DefiLlama lists **Seer** as a separate "Prediction Market" protocol (Gnosis Chain + Ethereum, TVL about $340.8K on 2026-10-19; H, section 6).

---

## 1. Why DefiLlama calls it a prediction market (H)

- `GET https://api.llama.fi/protocol/gnosis-protocol-v1` (fetched 2026-10-19): `category: "Prediction Market"`, `chains: ["Ethereum"]`, `url: https://gnosis.io/`, description "Gnosis builds new market mechanisms for decentralized finance." The `address` field `0x6810e776880C02933D47DB1b9fc05908e5386b96` is the **GNO token**, not a GPv1 contract (H: Blockscout `/api/v2/tokens/...` returned name Gnosis, symbol GNO, ERC-20, 18 decimals).
- TVL code path: `https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/gnosis/index.js` (read via `gh api`, H). It sums a fixed token list held by two owners on Ethereum:
  - `0xc59b0e4de5f1248c1140964e0ff287b192407e0c`: Blockscout name **ConditionalTokens** (verified contract). This is the CTF contract, which holds collateral for outcome positions.
  - `0x6f400810b62df8e13fded51be75ff5393eaa841f`: Blockscout name **BatchExchange** (verified contract). `gnosis/dex-contracts` `networks.json` lists the same address as the chain-1 `BatchExchange` (H).
- DefiLlama TVL now: **$1,019,306 on 2026-10-18** (H, same endpoint, last point). Peak $85.4M on 2020-08-09. The series has 2,461 daily points from 2020-01-23.
- Per-contract balances, Blockscout `token-balances` (H for the raw numbers, M for the USD sums because they use the explorer's own rates and only priced tokens, so they are lower bounds and do not match DefiLlama's whitelist exactly):
  - BatchExchange (GPv1): about **$577K**, mostly 144.7 WETH, 181.4K USDC, 19.5K DAI, 11.3K USDT, plus long-tail ERC-20 dust (111 distinct tokens). This is users' un-withdrawn exchange balances, not trading depth.
  - ConditionalTokens (CTF): about **$588K**, 80.9 WETH, 140K DAI, 110K USDS, 93K USDC, 25.8K sDAI, 155.8 GNO. This is collateral locked behind outcome positions of whatever markets still sit on the Ethereum CTF.
- Saved fixtures: `docs/research/fixtures/gnosis-protocol-v1/defillama_protocol_summary_2026-10-19.json` (trimmed DefiLlama response) and `blockscout_contracts_2026-10-19.json` (contract names, counters, 12 most recent tx methods per contract). Both are third-party aggregator/explorer responses, NOT a GPv1 venue API.

---

## 2. What GPv1 actually is (H, `gnosis/dex-contracts` source and README)

- README: "The **Gnosis Protocol Exchange** is a fully decentralized trading protocol which facilitates ring trades via discrete auction between several ERC20 token pairs. It uses a batch auction for arbitrage-free exchanges while maximizing trader surplus." (`https://github.com/gnosis/dex-contracts`; repo description "Smart contracts for the Gnosis Protocol v1"; not archived; last push 2022-12-11.)
- `BatchExchange.sol`: "A decentralized exchange for any ERC20 token as a multi-token batch auction with uniform clearing prices." Constants read: `BATCH_TIME = 300` s (in `EpochTokenLocker.sol`), `FEE_DENOMINATOR = 1000`, `MAX_TOUCHED_ORDERS = 30`, `AMOUNT_MINIMUM = 10**4`, `FEE_FOR_LISTING_TOKEN_IN_OWL = 10 ether`, fee token = OWL at token index 0.
- Order model: `placeOrder(uint16 buyToken, uint16 sellToken, uint32 validUntil, uint128 buyAmount, uint128 sellAmount)`: a limit sell order between two listed ERC-20 token ids. No outcomes, no binary/categorical/scalar market type, no resolution step.
- Flow: ERC-20 `approve` -> `deposit` -> `placeOrder` -> a solver calls `submitSolution` after the batch closes -> `requestWithdraw` -> `withdraw` in a later batch. Matches the method mix seen on-chain (section 3).

Market model, tokenisation, resolution, dispute risk: **not applicable** (token swaps, not event contracts). Event categories: **none**. Overlap with other venues' sports/politics/crypto-price/macro markets: **none**.

---

## 3. Is it still live? (2026)

| Deployment | Evidence | Verdict |
|---|---|---|
| Ethereum `0x6F400810b62df8E13fded51bE75fF5393eaa841F` | Blockscout (H, 2026-10-19): 175,078 lifetime txs; last 600 txs show `placeOrder` last 2026-07-08, `deposit` 2026-07-08, `placeValidFromOrders` and `submitSolution` last 2026-06-13, `withdraw`/`requestWithdraw` as late as 2026-10-18 (users draining balances). | Contract callable but **dormant**: trading stopped months ago, only withdrawals continue. |
| Gnosis Chain (chain 100) `0x25B06305CC4ec6AfCF3E7c0b673da1EF8ae26313` | Address from `networks.json` (H). Blockscout (H): 11,445 lifetime txs, holds about $28K (mostly 10.4 WETH). A full `deposit` -> `placeOrder` -> `submitSolution` -> `requestWithdraw` -> `withdraw` cycle ran within about 16 minutes on 2026-10-18 02:19-02:35 UTC. In the 600 most recent txs, `submitSolution` appears only on a handful of days (2022-2023, 2025-07-06, 2026-10-18), 3 distinct solver addresses. | Sporadic, bursty, looks machine-driven (M, inference; purpose unknown). Not a market. |
| Official frontend | `dex.gnosis.io` and `gnosis-protocol.io` do not resolve (H, curl 2026-10-19). `gnosis/dex-react` repo archived, last push 2021-01-15 (H). `docs.gnosis.io/protocol/` returns 404 (H). | Official UI/docs gone. |
| Off-chain services | `gnosis/dex-services` ("Off-chain services for the Gnosis Protocol v1") last push 2022-06-17, not archived (H). `gnosis/dex-subgraph` last push 2022-12-10 (H). | Unmaintained. |
| Operator statement | Gnosis said it would stop running the v1 solvers after 2021-08-01 because most activity had moved to v2; v1 "remains live" permissionlessly (M: WebSearch summaries of the Medium post "Gnosis Protocol v1 solvers going down"; the primary post itself was not retrievable this session). | Operator-abandoned since 2021. |
| Gnosis corporate site | `https://gnosis.io/` (WebFetch summary, M): active products Gnosis Pay, Gnosis Chain, EEZ, Circles; "previously built": Safe, CoW Protocol, Gnosis Guild, Conditional Token Framework (2018), constant product market maker (2017). GPv1, Omen, Seer and prediction markets are not listed as products. | GPv1 is not a Gnosis product in 2026. |

Successor: Gnosis Protocol v2 -> CoW Protocol (off-chain signed intents, solver competition). It is also a DEX with no prediction-market role (M, WebSearch; not pursued further).

---

## 4. Required spec fields

| Field | Finding |
|---|---|
| Kind / market model | Batch-auction ERC-20 DEX. No prediction markets. |
| Chains / collateral | Ethereum (1) and Gnosis Chain (100) deployments of `BatchExchange` (H, `networks.json`; Rinkeby entry is dead). Any listed ERC-20; fee token OWL. |
| Read API | **NOT FOUND (official).** No public REST/WebSocket API existed in the docs I could reach (searched: dex-contracts README, dex-services README, gnosis.io, docs.gnosis.io, GitHub org repos). Read paths are on-chain only: `BatchExchangeViewer` view functions (`getOpenOrderBook`, `getFinalizedOrderBook`, `getFilteredOrdersPaginated`, `getEncodedOrdersPaginated`; H, `BatchExchangeViewer.sol`; viewer address `0x7D071fb584b51D9c38572A04E1848afd835cD457` on mainnet per `networks.json`) and contract events (`OrderPlacement`, `Deposit`, `WithdrawRequest`, `Trade`). The `dex-subgraph` was a hosted-service subgraph that I did not verify is still served (L). Rate limits/auth: n/a. No fixtures of a venue API exist because none exists; fixtures saved are third-party DefiLlama/Blockscout shapes only. |
| Trade path | Plain EVM transactions (`approve`, `deposit`, `placeOrder`, `withdraw`) plus an external solver for settlement. No signed-order API, no off-chain order book. Settlement depends on someone running a solver; none is operated by Gnosis. |
| PayBox reachability | Technically **partial** for the Ethereum deployment only, and irrelevant because there is nothing to trade that overlaps prediction markets. PayBox exposes an EVM wallet that "shares one address across every `eip155:*` chain" and `request_wallet_sign` with `transaction` (EIP-1559) / `typedData` / `message` / `raw` ops (H, `docs.paybox.sh/reference/mcp-tools` via page summary; consistent with `docs/research/06-paybox-platform.md`). Its live chain catalog lists Ethereum (1) but **not Gnosis Chain (100)** (H per note 06, 2026-10-19). Each GPv1 step would be a separate one-call transaction proposal; arbitrary-calldata acceptance is not documented (NOT FOUND in the PayBox docs summary). |
| Fees | 0.1% of executed trade volume: `FEE_DENOMINATOR = 1000`, `phi = 1/1000`, applied inside the limit-price check `limitTermRight = priceNumerator * buyTokenPrice * FEE_DENOMINATOR / (FEE_DENOMINATOR - 1)` (H, `BatchExchange.sol`). Settled through the OWL fee token, which is burned; solver reward = burnt fees. Token listing costs 10 OWL (burned). Gas paid by each user transaction and by the solver. |
| Resolution / dispute | n/a (no event outcomes). |
| Geo / ToS / automation | NOT FOUND (no terms of service for a defunct UI; permissionless contract). Not relevant to the aggregator. |
| Liquidity | DefiLlama TVL $1,019,306 (2026-10-18; mix of CTF and GPv1 balances, section 1). GPv1 trading volume: effectively zero recently; Ethereum last order 2026-07-08 (H). No volume figure from a primary source (NOT FOUND). |
| Event-category overlap | None. |
| Shared liquidity | Not applicable. The CTF contract it is conflated with is shared infrastructure for Omen, Seer, Polymarket-style positions; any CTF-based venue is a separate adapter question. |

---

## 5. Adapter recommendation

- **adapter_priority: skip.** Not a prediction market; the official API, UI and docs are gone; trading is dormant; there is no outcome-share trading path.
- **Fix the discovery record:** reclassify `gnosis-protocol-v1` from `kind=onchain-other` to "not a prediction market (DEX)". Do NOT build an adapter keyed on the DefiLlama `Prediction Market` category tag for this entry.
- **Redirect effort to:** (a) **Seer** (DefiLlama slug `seer`, chains xDai + Ethereum, TVL $340,777 on 2026-10-19; H); (b) **Omen/Presagio** (CTF-based; not a DefiLlama protocol under those names in the 2026-10-19 `/protocols` list; H absence, so liveness needs a primary check); (c) the **Ethereum `ConditionalTokens` contract** only as a generic reader (`PositionSplit`, `PayoutRedemption`, `ConditionResolution` events), which yields thin signal at best (last `redeemPositions` 2026-10-02, 1,132 lifetime txs; H, Blockscout). Each of these needs its own `venue-spec` task.
- A CTF event reader would be a **P2 signal-only** idea at most, and it is outside this task.

---

## 6. Sources

H (first-hand this session, 2026-10-19):
- DefiLlama protocol API: `https://api.llama.fi/protocol/gnosis-protocol-v1`; protocol list `https://api.llama.fi/protocols` (Seer row: slug `seer`, category Prediction Market, chains xDai/Ethereum, TVL 340,777; no Omen/Presagio/CTF row).
- DefiLlama adapter source: `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/gnosis/index.js`.
- Blockscout (explorer API, GET): `https://eth.blockscout.com/api/v2/addresses/{0x6F40...841F, 0xC59b...7E0C}` (+ `/counters`, `/transactions`, `/token-balances`), `https://eth.blockscout.com/api/v2/tokens/0x6810...b96`, `https://gnosis.blockscout.com/api/v2/addresses/0x25B0...6313` (+ counters, transactions, token-balances).
- `gnosis/dex-contracts`: repo metadata, `README.md`, `networks.json`, `contracts/BatchExchange.sol`, `contracts/EpochTokenLocker.sol`, `contracts/BatchExchangeViewer.sol` (via `gh api -H "Accept: application/vnd.github.raw"`).
- `gnosis/dex-services` (README, metadata), `gnosis/dex-research` (README), `gnosis/dex-react` (metadata, archived), `gnosis/dex-subgraph` (metadata).
- DNS/HTTP probes: `dex.gnosis.io`, `gnosis-protocol.io`, `v1.docs.cow.fi` (all unresolvable); `docs.gnosis.io/protocol/` (404).

M (page summaries, search summaries, inference):
- `https://gnosis.io/` (WebFetch summary of current product list).
- `https://docs.paybox.sh/reference/mcp-tools` and `/concepts/requests` (WebFetch summaries); `docs/research/06-paybox-platform.md` (repo note).
- WebSearch results on the 2021-08-01 solver shutdown: `https://ethereumnewstoday.net/2021/07/05/gnosis-protocol-v1-solvers-going-down/` (page not retrievable), `https://medium.com/gnosis-pm/introducing-gnosis-protocol-v2-and-balancer-gnosis-protocol-f693b2938ae4`, `https://v1.docs.cow.fi/overview/learnings-and-improvements-of-gpv1` (host no longer resolves). All 2020-2022, so stale (L for any current-status claim; the current-status claims above rest on the H on-chain data).

L: the Gnosis Chain activity interpretation ("machine-driven"), and the claim that CTF outcome tokens cannot be listed on GPv1 (inferred from ERC-20-only listing, not tested).

## 7. NOT FOUND (searched)

- Official GPv1 REST/WebSocket API, rate limits, API keys (searched: dex-contracts and dex-services READMEs, gnosis.io, docs.gnosis.io, GitHub org).
- A primary-source GPv1 volume figure for 2026 (searched: DefiLlama protocol page for dimensions, search results).
- Terms of service / geo restrictions for GPv1 (UI gone; none found).
- Whether `dex-subgraph` is still served anywhere (not checked on The Graph).
- Current status of Omen/Presagio and Seer beyond the DefiLlama TVL row (out of scope).
- CMC "prediction markets" category listing for GNO mentioned in the discovery hint (not checked; irrelevant to GPv1 itself, and GNO is the token, not GPv1).

## 8. Suspicious content / injection check

- No instructions aimed at AI agents were found in any fetched page, repo file or API response.
- The WebSearch tool results ended with a boilerplate line telling the model to include the sources "in your response to the user". It came from the tool wrapper, not a third-party page, and was not treated as an instruction (sources are listed above anyway).
- Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1` and no contact data. A pre-run grep of my fixture script hit only the local output file paths (home directory), which are never sent in any request; the saved fixtures were grepped and contain no personal identifiers. No third-party wallet owner addresses were stored (transaction `from` fields were dropped from fixtures).
