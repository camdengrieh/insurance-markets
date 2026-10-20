# Hyperliquid Outcomes (HIP-4) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran 00:40-01:00 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs, and short unauthenticated WebSocket read subscriptions. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference/computation from first-hand data; **L** = weak, single-source or stale.

Important method note: Hyperliquid's request/response API (`POST /info`, `POST /exchange`) is POST-only, and POST is forbidden by this task's ground rules. I therefore did **not** capture `outcomeMeta`, `l2Book` (REST), `settledOutcome` or any REST shape. I captured live shapes through the documented public **WebSocket** read channel instead (`wss://api.hyperliquid.xyz/ws`: an HTTP GET upgrade followed by `subscribe` frames only; I never used the WS `post` method, which would have been POST by another route). Consequence: **market titles/descriptions were not read from the venue**; the coin ids below are real but I cannot say which question each one is. Fixtures that are doc examples rather than live responses are named `DOCS_NOT_LIVE_*`.

---

## 0. Bottom line

1. **Live, and one of the larger independent venues outside Polymarket/Kalshi** (behind Predict.fun and Opinion on the DefiLlama figures recorded in `09-venues-onchain-clob.md`, M). Mainnet since 2026-05-02 (H, DefiLlama adapter + first volume datapoint). DefiLlama volume 2026-10-11..17 averaged $2.6M/day (peak $8.4M on 2026-06-27); a third-party tracker shows $3.48M for the 24h to 2026-10-19 00:39 UTC. Live order books were updating sub-second on 2026-10-19 (H, my WS capture).
2. **Not "BTC daily binary only" any more.** The hint and the official HIP-4 page describe only the protocol's recurring BTC binary. Today there are ~350 live outcomes (704 `#` coins in `allMids`, H) across crypto-price (BTC/ETH/SOL/HYPE daily ladders), **sports** (NFL, NBA, soccer, LoL, World Cup winner), **Fed/central-bank rate decisions**, stocks/commodities, awards, IPO and AI-model markets, many deployed by third-party "deployers" (mainly Outcome.xyz) under the permissionless mechanism that opened on mainnet on 2026-08-29 (M).
3. **Model:** fully collateralised binary outcomes, two spot-like tokens (Yes/No) on a **merged central limit order book** on HyperCore (not an AMM, not parimutuel). Collateral is **USDC** (H official doc sample; the older USDH is retired, M).
4. **API is good and keyless:** free WebSocket (`l2Book`, `trades`, `bbo`, `activeAssetCtx`, `allMids`, `outcomeMetaUpdates`) plus REST `POST /info` (`outcomeMeta`, `outcomeTemplates`, `settledOutcome`, `l2Book`). Trading is by EIP-712-signed L1 actions to `POST /exchange` with official SDKs; an API ("agent") wallet can sign on behalf of the main wallet.
5. **Biggest risks for an arbitrage leg:** (a) resolution: only the protocol-recurring crypto markets settle by code; ~all of the rest are **deployer-settled with no trader dispute process** (slashing of the deployer's stake by validator vote is the only remedy) (M); (b) **US and Ontario residents are barred** from the Interface and outcome markets additionally carry an open-ended "Excluded Persons" list (H); (c) fees are no longer zero (see section 7) and the exact rate is not in the official docs; (d) PayBox reach is only **partial** (HyperCore is not an EVM chain: no transaction proposals; needs typed-data signing and, realistically, an approved agent key).
6. **adapter_priority = P1.** Build the read adapter first (WS; crypto-price ladder and Fed/sports matching are where cross-venue edge exists). Trading adapter is second phase. Not P0 because liquidity is a few $M/day with ~$2.3M open interest, resolution is mostly deployer-trust, and PayBox reach is partial.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Official HIP-4 page lists recurring BTC binary settling daily 06:00 UTC; "Multi-outcome markets will be supported but are not part of the initial mainnet release" (page is undated and stale on both counts) | https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (fetched 2026-10-19) | H |
| Live `allMids` over WS (2026-10-19 00:4x UTC) contained **704** `#<encoding>` keys = 352 outcomes x 2 sides, all Yes/No pairs summing to 1.0 | fixture `ws_allMids_outcome_keys.json` | H |
| Live `l2Book` timestamps 1792370845947 ms = 2026-10-19T00:47:25Z; book updated 3 times in 15 s on one market | fixture `ws_l2Book_yes_no_pair.json` | H |
| DefiLlama `hyperliquid-outcomes` daily volume non-zero every day from 2026-05-02 to 2026-10-17 (last complete day; series 169 points) | `GET https://api.llama.fi/summary/dexs/hyperliquid-outcomes` | H |
| DefiLlama adapter comment: "HIP-4 outcome markets, live on mainnet since 2026-05-02"; `start: '2026-05-02'` | `gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts` | H |
| Terms of Use last updated 2026-06-15 and contain dedicated outcome-market clauses (1.7, 1.8) | static JS chunk of app.hyperliquid.xyz (section 9) | H |
| Listed on DefiLlama as category "Prediction Market" (`defillamaId 8941`, `listedAt` 1791495619 = 2026-10-08) | llama JSON | H |
| The hint's "The Block ~$6.26M daily, page modified 2026-10-16" | Not re-verified (no The Block dashboard URL found by search). Differs from DefiLlama ($2-3M, halved) and from the tracker ($3.5M, both sides counted); different counting is the likely cause | L |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** on-chain central limit order book (CLOB), native to HyperCore (the Hyperliquid L1). Outcomes are "fully collateralized contracts that settle within a fixed range"; "no leverage or liquidations". (HIP-4 page.)
- **Outcome / side / token (H, asset-ids page https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** each outcome has an integer `outcome` id and two sides 0/1 (`sideSpecs`, normally Yes/No). `encoding = 10*outcome + side`. Spot coin `#<encoding>` (books, WS), token name `+<encoding>` (balances), order asset id `100_000_000 + encoding`. Example in docs: outcome 1, side 0 -> `#10`, `+10`, `100000010`. Live example (mine): outcome 13228 -> Yes `#132280`, No `#132281`.
- **Merged book (H, HIP-4 page + my capture):** "an order to buy Yes at price p is equivalent to an order to sell No at 1-p". Live check: Yes best ask 0.78709, No best bid 0.21291 (sum 1.00000). So an aggregator needs **one** book per outcome; derive No = 1 - Yes (bid<->ask swap). Priority is price-side-time.
- **Binary, scalar-capable, categorical via "questions" (H):**
  - Standalone outcome settles Yes -> `settleFraction` quote tokens, No -> `1 - settleFraction`. Standalone outcomes may settle to any fraction in [0,1] (docs example `"0.66"` for scalar payouts); outcomes inside a question must settle exactly 0 or 1 (hip-4-deployer-actions page, which carries a "Testnet-only" banner; a third-party guide describes the same rules on mainnet, M).
  - *Question* = set of outcomes where exactly one settles Yes; each outcome has its own book; `negate`/`merge` operations link them (redeem a full set of No shares across outcomes before settlement). Every question has an automatic fallback outcome ("other"). Up to 100 named outcomes per question (deployer-actions page).
  - Manual `splitOutcome` (X USDC -> X Yes + X No), `mergeOutcome`, `mergeQuestion`, `negateOutcome` actions exist (`userOutcome` exchange action; also CoreWriter action 17).
- **Price domain:** probabilities in (0,1), quote = USDC. Live books show prices to 5 significant figures (0.78708/0.78709, tick 1e-5 near 0.79) and **integer** share sizes ("802.0"). Tick, min order size and min notional are **not stated in the official HIP-4 docs** (NOT FOUND). Chainstack (M, stale re collateral) says range 0.001-0.999, tick 0.0001 on the BTC binary and min notional $10; my sample trades include a $3.94 fill so the $10 is an order-level rule at most.
- **Market identity strings (H, info-endpoint/spot page):**
  - Recurring protocol markets: `name = "Recurring"`, `description = class:priceBinary|underlying:BTC|expiry:20260526-0600|targetPrice:77363|period:1d` (Yes if the underlying mark price at `expiry` is above/at `targetPrice`), or `class:priceBucket|...|priceThresholds:<lower>,<upper>|period:1d` (question with outcomes `index:0/1/2`: below lower / between / at-or-above upper). `underlying` is a perp coin name. Docs also show a `period:3m` HYPE example and a `period:15m` bucket example.
  - Template markets: `name = "template:<id>"`, description = sorted `keyword:value|...` (e.g. `expiry:...|target:...|underlying:...`), full human text lives in the template (`outcomeTemplates`). Template ids in the docs: `binaryPrice`, `policyRateDecision`, `policyRateDecrease`; a third-party tracker lists 28 approved mainnet templates (section 11).
  - Settled lookups: `{"type":"settledOutcome","outcome":N}` -> `spec`, `settleFraction`, `details` (e.g. `"price:76876.9"`).
- **Series uniqueness (H):** at most one recurring series per (seriesType, underlying, period).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | **HyperCore** (Hyperliquid L1), not an EVM chain. Order flow, balances and outcome tokens live here. | H |
| HyperEVM | chain id 999 (HYPE gas). Reachable from HyperCore via system transfers; EVM contracts can act on HyperCore through the CoreWriter contract `0x3333...3333` (limit order = action 1 with `uint32 asset`; outcome split/merge/negate = action 17). Whether CoreWriter action 1 accepts outcome asset ids (100,000,000+) is not stated (NOT FOUND); outcome tokens are not documented as transferable to HyperEVM as ERC-20s (NOT FOUND: searched transfers + interacting-with-hypercore pages). | H (CoreWriter facts), L (outcome support) |
| Quote / collateral | **USDC.** Official `settledOutcome` sample shows `"quoteToken": "USDC"`. A third-party guide says canonical markets moved from USDH to USDC under "AQAv2" on 2026-06-20 and "All USDH-denominated markets on HyperCore have settled". Official aligned-quote page: "AQAv2 will be a requirement for quote assets to be listed against HIP-4 ... on a future network upgrade". Chainstack still says USDH (older). | H (sample), M (migration date), L (Chainstack) |
| Funding in | Wallet-connected users: "USDC deposits via Arbitrum only. Deposits below 5 USDC are lost." Email wallets: Arbitrum, Base, Ethereum, Polygon via Across. Also Circle CCTP Arbitrum -> HyperCore, and Unit Protocol for BTC/ETH/SOL/Base/etc. | H (support FAQ + USDC page) |
| Withdrawal | Not researched (NOT FOUND this session). | - |

---

## 4. Read API

- **Docs:** https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (index of every page: `.../llms.txt`; every page also serves raw markdown by appending `.md`). H
- **Base URLs (H):** REST `https://api.hyperliquid.xyz/info` (POST), `https://api.hyperliquid.xyz/exchange` (POST); WebSocket `wss://api.hyperliquid.xyz/ws`; testnet `api.hyperliquid-testnet.xyz`. Bulk history: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` (builder-codes page).
- **Auth:** none for market data. Per-IP limits only. H
- **Rate limits (H, rate-limits page):**
  - REST: 1200 weight/min per IP aggregated. `l2Book`, `allMids`, `orderStatus`, `clearinghouseState`, `spotClearinghouseState`: weight 2; other documented info requests weight 20 (`outcomeMeta` is "documented", so assume 20); `userRole` 60; list endpoints add weight per 20 items.
  - WebSocket: max 10 connections, 30 new connections/min, **1000 subscriptions**, 2000 messages sent/min, 100 inflight post messages. Server drops idle connections after 60 s: send `{"method":"ping"}`; reconnect on drops and use the snapshot ack (timeouts page).
  - Address-based limits apply to actions only: 1 request per 1 USDC traded since inception with a 10,000-request buffer; when limited, 1 request per 10 s; open-order cap 1000 (+1 per 5M USDC volume, max 5000).
- **Discovery of markets:**
  - REST `{"type":"outcomeMeta"}` -> `{outcomes:[{outcome,name,description,sideSpecs:[{name}]}], questions:[{question,name,description,fallbackOutcome,namedOutcomes,settledNamedOutcomes}]}` (doc example; the doc example shows `outcomes` only; `questions` per WS type defs and Chainstack/pmxt). A third-party guide says mainnet `outcomeMeta` now also returns a top-level `feeScale` field (M, unverified by me). The response gives **no coin strings or asset ids**: compute them from `outcome` and side. NOT captured live (POST).
  - REST `{"type":"outcomeTemplates"}` (template id, role, name/description with `{keyword}` placeholders, typed keywords), `{"type":"outcomeDeployerLimits","venue":...}`.
  - WS `{"type":"outcomeMetaUpdates"}` -> arrays of `{outcomeCreated: OutcomeSpec} | {outcomeSettled: n} | {questionUpdated} | {questionSettled: n}`. Live: the ack arrives, **no snapshot** is sent (my 100 s capture saw only the ack). So bootstrap from `outcomeMeta`, then follow this stream. H
  - WS `allMids` (no params) already includes every outcome coin as `"#<enc>": "<mid>"` (704 of 1352 keys in my capture). Useful as a cheap liveness/universe list, but mid-only and with no titles. H
- **Prices / books:** WS `l2Book` for `#<enc>` (`levels:[bids,asks]`, each `{px,sz,n}` as strings, 20 levels per side, optional `nSigFigs`/`mantissa`/`fast`; snapshot pushed on blocks at least 0.5 s apart), WS `bbo`, REST `l2Book` (weight 2). Because the book is merged, subscribe to side 0 only. H (docs + capture)
- **Trades:** WS `trades` for `#<enc>` -> `[{coin,side:"B"|"A",px,sz,time,hash,tid,users:[buyer,seller]}]` (each match appears once per matched order). H. REST `recentTrades`/`candleSnapshot` exist for spot coins (weights above); not verified for `#` coins.
- **Volume / OI:** WS `activeAssetCtx` for `#<enc>` pushes `activeSpotAssetCtx` = `{coin, ctx:{prevDayPx, dayNtlVlm, markPx, midPx, circulatingSupply, totalSupply, dayBaseVlm}}`. `dayNtlVlm` is rolling 24h USDC notional; `circulatingSupply` of the Yes token = shares outstanding (each backed by $1) = an open-interest proxy. H (captured). Note: the paid x402 service "alphapipeline hip4" claims "Hyperliquid doesn't expose [volume] for HIP-4": that is wrong for the official API (L).
- **Resolution data:** REST `settledOutcome`; WS `outcomeSettled`. Per a third-party guide, settlement details are **pruned from L1 state** (since 2026-08-14), so persist results on receipt (M).
- **Free hosted alternatives / paid wrappers (do not use for core):** PayBox discovery shows pay-per-call x402 wrappers: x402Atlas `GET https://hyperliquid-predict.use.x402atlas.com/outcomes` (catalog, 5000 atomic USDC = $0.005 on Base/Polygon/Arbitrum/Solana) and `/settled` ($0.01), and alphapipeline `hip4-snapshot`/`hip4-price-ladder` ($0.01 USDC on Base). I did not call them; payment requirements recorded from the PayBox catalog only. L (third parties; polling-based, ~5 min).
- **Official SDKs:** Python SDK `hyperliquid-dex/hyperliquid-python-sdk` is referenced by the docs for signing and WS examples. pmxt (`pmxt-dev/pmxt`, `core/src/exchanges/hyperliquid/`) already has a third-party adapter with typed raw shapes (M); I read its `config.ts`/`fetcher.ts` only.

### Live response shapes confirmed (fixtures in `docs/research/fixtures/hyperliquid-outcomes-hip-4/`)

| Fixture | What it shows | Source |
|---|---|---|
| `ws_l2Book_yes_no_pair.json` | Real `l2Book` for Yes `#132280` and No `#132281`: 20x20 levels, merged-book identity | WS |
| `ws_trades_outcome_redacted.json` | Real `trades` batch (wallet addresses of counterparties redacted by me) | WS |
| `ws_activeSpotAssetCtx_sample.json` | Real `activeSpotAssetCtx` with `dayNtlVlm`, `circulatingSupply` | WS |
| `ws_allMids_outcome_keys.json` | All 704 outcome mids from one `allMids` message | WS |
| `ws_outcomeMetaUpdates_ack.json` | Ack only; no snapshot | WS |
| `derived_outcome_liquidity_ranking.json` | **Derived by me** from 345 `activeAssetCtx` streams: totals + top 25 | WS |
| `defillama_hyperliquid-outcomes_summary_trimmed.json` | DefiLlama volume/fees, last 60 days, methodology | GET |
| `DOCS_NOT_LIVE_outcomeMeta_settledOutcome_shapes.json` | Doc examples for the POST-only calls, **not live** | docs |

---

## 5. Trade path (programmatic)

- **Mechanism (H):** signed actions posted to `POST https://api.hyperliquid.xyz/exchange` (or the same payload over WS `post`). Outcome orders use the normal `order` action with `a = 100_000_000 + encoding`, `b` (is-buy), `p`, `s` (integer shares), `r`, and `t` = `{limit:{tif:"Alo"|"Ioc"|"Gtc"}}`; `cloid` optional; `nonce` = ms timestamp; `expiresAfter` optional. Outcome-specific actions: `{"type":"userOutcome","splitOutcome"|"mergeOutcome"|"mergeQuestion"|"negateOutcome":{...}}`. Responses use the standard `{"status":"ok","response":{"type":"order","data":{"statuses":[{"resting":{"oid":...}}]}}}` shape (docs).
- **Signing (H, signing + nonces pages):** two schemes. L1 actions (orders, cancels, outcome ops) = msgpack-hash "phantom agent" signed as EIP-712 (domain `Exchange`, chainId 1337); user-signed actions (`approveAgent`, withdrawals, `approveBuilderFee`) = EIP-712 with `signatureChainId` such as `0xa4b1` (Arbitrum). The docs strongly recommend using an SDK; wrong signatures yield an unrelated recovered signer. Field order in msgpack matters.
- **API/agent wallets (H):** the master wallet approves an agent address (`approveAgent`; 1 unnamed + up to 3 named; expiry <= 180 days); the agent key only signs, account queries still use the master address. Nonces: highest 100 stored per signer, window (T-2 days, T+1 day); use one agent key per process; do not reuse deregistered agent addresses (replay risk).
- **Builder codes (H):** optional `{"b": addr, "f": tenths-of-bp}` per order; user must pre-approve a max fee with the main wallet; for outcomes builder fees may also apply to buys (deployer-actions page). Builder fee max 1% on spot per builder-codes page.
- **Batching/limits:** exchange weight `1 + floor(batch/40)`; address limits in section 4.
- **Sandbox:** testnet exists (`api.hyperliquid-testnet.xyz`) and permissionless deployer actions are documented "Testnet-only" (but live on mainnet per third parties, section 8).

---

## 6. Reachability from a PayBox wallet

**Verdict: partial.** Reasons:

1. **No EVM transaction proposals for trading (H/M).** Outcomes trade on HyperCore, which takes signed actions, not EVM transactions. PayBox's chain catalog lists "Hyperliquid" as `eip155:999` (HyperEVM, HYPE) (live `discover_tokens` mode=chains, H), which is the wrong layer for the order book. PayBox's official `hyperliquid` plugin is **spot browse only**: tools `hyperliquid_markets`, `hyperliquid_prices` ("current mid prices for every Hyperliquid market"), `hyperliquid_token`; the description says it "helps discover markets before a Hyperliquid trade tool exists". It is not enabled for this account (live `discover_plugins` + `get_contract`, H). `hyperliquid_prices` may expose `#` mids via `allMids` (unverified; I did not enable or call it).
2. **Funding is reachable (H/M):** USDC on Arbitrum is in the PayBox chain set (Arbitrum 42161 is listed; the x402 catalog also pays in Arbitrum native USDC). Wallet-connected deposits are "Arbitrum only", minimum 5 USDC (below that is lost). The exact bridge call (ERC-20 transfer to Bridge2 vs CCTP `depositForBurn`) was not verified this session.
3. **Order signing is reachable only with an agent key or per-order typed-data requests (M).** PayBox `request_wallet_sign` supports `typedData`/`raw` per `docs/research/06-paybox-platform.md`; an order is an EIP-712 `Agent` struct whose `connectionId` is a keccak of msgpack-encoded action fields, which the caller (our plugin) must compute. A human-in-the-loop signature per order cannot meet arbitrage latency; the practical path is a one-time `approveAgent` signed through PayBox and a separate locally-held agent key that signs orders. That puts a trade-capable (not withdraw-capable, M) key outside PayBox.
4. **HyperEVM CoreWriter route (L):** an EVM contract on chain 999 could place orders/outcome ops via CoreWriter (orders are delayed on-chain "a few seconds" per docs) and PayBox could sign transactions to it. Needs a custom deployed contract and asset-id support is unconfirmed. Not recommended for v1.
5. **Geo:** US and Ontario residents are prohibited (section 9); the plugin must surface this before enabling trading.

---

## 7. Fees

- **Structure (H, official fees page https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, section "Outcome tokens"):** fees are charged **only when closing or settling**, not when opening. Mint (split) = no fee. Normal trade: one side pays, "both users get `fee_paying_px * sz`" volume credit. Burn (merge): taker pays (or both). Settlement fee scales with `settle_fraction * sz`. **No maker rebates** on outcomes: would-be rebate takers pay zero as makers. Only fee-paying volume counts toward tiers.
- **Rate (conflict, partly resolved):**
  - Official HIP-4 page still says "Fees are currently zero for outcome markets for initial testing" (undated; **stale**).
  - DefiLlama adapter (H): "Hyperliquid's own fee was zero during the initial testing period: until 2026-08-14 the only outcome fees in the indexer are builder-code fees, Hyperliquid's share starts on 2026-08-15." Revenue goes 99% to the Assistance Fund (HYPE buybacks), 1% to HLP.
  - A third-party guide (M, single source, updated 2026-08-31) says the 2026-08-14 announcement set the average outcome fee at **half of non-outcome spot fees** (spot base tier taker 0.070% -> about 0.035%), and that the mainnet `outcomeMeta` carries `feeScale`. A search snippet also shows an app announcement dated 2026-08-24 "Outcome (HIP-4) fees will be enabled" (L, could not open the SPA); the activation date is unresolved.
  - **The official docs give no numeric outcome fee rate** (NOT FOUND: fees page, info-endpoint `userFees` fields, deployer-actions page only say "base outcome trading fee rate"). Read it live from `userFees`/`outcomeMeta` at runtime.
  - Empirical all-in effective rate (M, my computation): DefiLlama daily fees / daily (halved) volume for 2026-09-03..2026-10-17 = **11-25 bps, typically 12-16 bps**, which includes builder-code fees.
- **Deployer fee scale (H, deployer-actions page):** template instances carry `deployerFeeScale` in [0,10]; users pay `base * (scale + max(scale,1))`, the deployer receives the `scale` component, the protocol the rest (scale 1 = 2x base, 50% to the deployer; scale 10 = 20x base). So **fees differ per deployer** and can be many times the base rate; the aggregator must read each market's scale.
- **Who pays:** the party that closes (sells) or holds to settlement; opening buys are free. A buy-and-hold-to-expiry leg pays a settlement-side fee; a round trip pays on the exit.
- **Other costs:** USDC bridge in/out; HyperEVM gas only on the CoreWriter route; builder fees if routed via a front-end.

---

## 8. Resolution mechanism and dispute risk

Three tiers (H for the protocol rules; M for how deployers behave in practice):

1. **Protocol auto-settle (recurring crypto markets):** no oracle, no human. Rule from the contract spec (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications): settles Yes iff `markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice`, using the **HyperCore mark price** of the underlying perp, linearly interpolated between the mark updates around `settlementTime`. Daily series settle at 06:00 UTC. Basis risk vs other venues: HL mark price (a robust composite index, see robust-price-indices page) is not Binance/Chainlink/Coinbase spot, and the time (06:00 UTC) differs from most competitors' reference times.
2. **Validator vote ("canonical" markets):** set by validator vote; Hyperliquid said these "should be rare" and "ideally fewer than 10 outcomes" per year (The Block, 2026-07-20, M quoting the announcement).
3. **Deployer-settled (permissionless):** a deployer (stake 500,000 HYPE locked >= 183 days) instantiates a validator-voted **template** and later calls `settleOutcome`/`settleQuestion2` itself (or via authorised sub-deployers). Template text fixes the resolution wording (e.g. `binaryPrice`: "Settlement is according to the {seconds}-second TWAP of {priceDescription} price ending at {time}. If {perp} is delisted ... settlement is instead according to the settlement price at delisting"; `policyRateDecision`: official-source Decision Value, tie-breaks to "No change" if no decision is published by the deadline) (H, outcomeTemplates example). Validators can **slash** the deployer's stake for poorly defined markets, incorrect settlement or failure to settle within one week (M, The Block + deployer-actions "slashable" text). `details` must be empty and the settle action must echo the outcome's name/description/side names exactly.
   - **No trader-initiated dispute or challenge window** is documented; a tracker FAQ says the same (M). Whether an incorrect settlement can be reversed after a slash is NOT FOUND.
   - Per the tracker, 286 of 291 currently open markets are deployer-settled (M). Mainnet had 3 registered deployers on 2026-10-19 and Outcome.xyz carried ~92% of external-venue volume since 2026-08-29 (M, TokenPost 2026-10-07). Concentration in one deployer is a correlated settlement risk.
   - The Interface terms add: the Company "has no involvement in the execution, settlement or resolution" and disclaims "erroneous outcome determination and disputed settlements" (H, Terms 1.2, 6.4).
- **Timing:** automatic payout on settlement ("no claim/redeem call", Chainstack, M). Resolution can lag for deployer markets (slash threshold is one week).

For arbitrage: treat protocol-settled crypto binaries as the only legs with machine-checkable resolution; discount or exclude deployer-settled legs unless the template wording and the counter-venue's rules text are compared field by field (same-title is not same-payoff).

---

## 9. Geo, ToS and automation (primary source, H)

Source: the Terms of Use text inside the app's static bundle, `https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js` (read as text, nothing executed), "Last updated on June 15, 2026".

- 1.6: Interface "not available to 'Restricted Persons'": residents/entities in "the United States of America or Ontario, Canada", sanctioned jurisdictions, and citizens of those territories wherever located.
- 1.7-1.8: outcome markets are additionally unavailable to "Excluded Persons" - persons in "certain jurisdictions that we designate from time to time" or where access "would require us or any third party to obtain any license, registration, approval or authorization". They may block the "outcome markets tab" and prohibit circumvention. The list is not published in the terms (NOT FOUND), so a plugin cannot hard-code it.
- 3.1.5/1.9: using VPNs/proxies to conceal location is prohibited and a "represent and warrant" applies.
- 3.1.8: prohibits bots/scripts "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions, or disrupt" Hyperliquid. Not a blanket bot ban; the API and SDKs are the intended automation route (but the terms govern the Interface; whether they bind direct API use is a legal question I did not resolve).
- 11.x: LCIA arbitration in London, English law, no class actions, no US courts.
- Reading public market data over the API/WS needs no account; the geo clauses attach to using the Interface/trading.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Daily volume, DefiLlama (each trade counted once, "halved") | 2026-10-10 $2.91M; 10-11 $3.72M; 10-12 $2.99M; 10-13 $2.70M; 10-14 $2.08M; 10-15 $1.90M; 10-16 $2.26M; 10-17 $2.85M. Last-7-complete-days sum $18.5M (avg $2.64M/day). Note DefiLlama's own `total7d` ($14.8M) omits a day in the window. | api.llama.fi, fetched 2026-10-19 | H |
| Longer window | May $47.2M, Jun $74.1M, Jul $58.5M, Aug $11.5M, Sep $39.8M (sum of daily series); all-time $258.0M; peak day $8.42M (2026-06-27). 30 days to 10-17: $45.1M | same | H (computed) |
| Tracker (both sides of each match counted) | 24h $3.48M (189,555 trades, 1,935 traders); 7d $22.0M; 30d $59.9M; all-time $350.6M; snapshot 2026-10-19 00:39 UTC | liquidiction.xyz/hip4/stats (WebFetch summary) | M |
| Live 24h notional, Yes-side coins only | **$2.49M** across 345 coins, 199 with non-zero volume | my WS sweep, 2026-10-19 ~00:55 UTC, fixture `derived_outcome_liquidity_ranking.json` | H (data) / M (interpretation) |
| Open interest proxy | Sum of Yes-token `circulatingSupply` = 2.35M shares = **~$2.35M** locked collateral across 345 live outcomes (each share backed by $1) | same | M (derived; excludes 7 coins that did not answer) |
| Top books | Top 3 by 24h: `#36000` $248k (supply 60.8k), `#132280` $212k, `#132130` $159k. Median open outcome has ~916 Yes shares outstanding | same | H |
| Depth/spread (live) | `#132280` bid 0.78708 / ask 0.78709; 20 levels each side hold ~$5.2k bid and ~$12.1k ask. `#36000`: 0.86899/0.86900, ~$6.4k / ~$13.4k. Third-party median spread of 25 most active books: 0.29 cents (2026-10-07) | my WS capture 2026-10-19 00:47 UTC; TokenPost | H / M |
| Concentration | By category, 30d to ~10-05: soccer + American football + esports 45%, crypto price 42%, stocks/commodities 7%, Fed 6%; cumulative soccer 28% | TokenPost 2026-10-07 | M |
| Fee revenue | ~$3.4k/day at $2.9M/day volume (DefiLlama fees, 2026-10-17) | api.llama.fi | H |
| Incentives | A rewards programme existed ($273k paid to 2,487 wallets by 2026-10-05, ~$2.7M annualised); September volume spike followed the 2026-08-29 opening. Part of the volume may be incentive-driven. | TokenPost | M |

Reading: roughly $2-3.5M/day of volume and ~$2.3M of open interest. Tight spreads and a few thousand dollars of depth in the top 20-30 books; most of the ~350 markets are thin (median 916 shares outstanding). Third-party daily volume claims of "$80M" (Crypto Briefing) conflict with DefiLlama (peak $8.4M) and are treated as L.

---

## 11. Event categories and cross-venue overlap (where arbitrage can exist)

| Category on HL | Examples seen (M unless noted) | Overlaps | Arb quality |
|---|---|---|---|
| **Crypto price** | BTC/ETH/SOL/HYPE "above $X" 1d ladders (`priceBinary`), BTC range buckets (`priceBucket`), touch and scalar templates; recurring series settle 06:00 UTC (H) | Polymarket, Limitless, Predict.fun, Kalshi, Opinion crypto ladders | Best overlap but needs expiry-time and reference-price alignment (HL mark price, 06:00 UTC) |
| **Sports** | NFL, NBA, soccer (Champions League, Premier League), LoL, "2026 World Cup Champion" ($11.9M all-time, the biggest market) | Polymarket, Kalshi, SX Bet, Azuro, Smarkets | Strong for outright winners/futures; match markets resolve by deployer, not an official feed |
| **Macro / Fed** | `policyRateDecision` (No change / Decrease / Increase) (H template); Fed decisions live | Kalshi, Polymarket | Good: same official source (FOMC statement) |
| **Stocks, commodities, indices** | price binaries on HIP-3/trade.xyz index perps | Kalshi, Polymarket | Partial |
| Awards, IPO, AI-model head-to-head, culture, weather, tech | `awardWinner`, `companyIpoConfirmed`, `aiModelHeadToHead` templates | Polymarket | Thin, text-risk |

28 approved mainnet templates per the tracker (price: binaryPrice, binaryPriceExternal, priceTouch, scalarPrice; rates x6; sports x11; awards x4; companies x2; AI x1) (M, liquidiction.xyz/hip4, 2026-10-19). Another guide listed only 7 templates on 2026-08-31 (M), so the catalog grows weekly: the adapter must not hard-code categories.

---

## 12. Does it share liquidity with another venue?

**No: it is an independent leg.** All front-ends route into the same HyperCore books via builder codes (H: builder-codes page; DefiLlama books Outcome.xyz, Liquidiction, Tradoor, Liquid, Phantom, Based, etc. as "Interface" adapters over the Hyperliquid outcome flow, `factory/hyperliquid.ts`). Treat them as **one book**: DefiLlama's "Outcome.xyz Outcome" ($4.86M 24h, $148M all-time) is attribution of the same fills, not additive. I found no evidence of Hyperliquid books mirroring Polymarket, Kalshi or any other venue (NOT FOUND: searched docs, DefiLlama, tracker). HL perps (including HIP-3 index perps) are a hedging instrument for the crypto/stock outcomes, not shared liquidity.

---

## 13. Adapter spec for the aggregator

- **Universe/bootstrap:** `POST /info {"type":"outcomeMeta"}` once at start and every ~5 min as a safety net (weight 20); parse `name` (`Recurring` vs `template:<id>`), `description` key/values, `questions`. Then WS `outcomeMetaUpdates` for creates/settles. Cross-check the universe with the `#` keys of `allMids`.
- **Quotes:** for each live outcome subscribe WS `l2Book` on `#<10*outcome>` (Yes) only; 352 subscriptions fit one connection (limit 1000, 10 connections). Optionally `bbo` for lighter bandwidth. Derive No: `bid_no = 1 - ask_yes`, `ask_no = 1 - bid_yes`. Price strings, 5 sig figs; sizes are integer shares; each share pays $1.
- **Liquidity filter:** use `activeAssetCtx` (`dayNtlVlm`, `circulatingSupply`) to rank; ignore markets with tiny supply.
- **Resolution metadata for the linker:** tier (recurring / validator / deployer + `venue`), expiry (`YYYYMMDD-HHMM` UTC), underlying, target/thresholds, template id, quote token.
- **Fee model:** fee on close/settle only; rate = base outcome rate x `(scale + max(scale,1))` (+ builder fee if any). Read live; do not hard-code 0 (the HIP-4 page is stale).
- **Settled results:** call `settledOutcome` on `outcomeSettled`; persist (L1 pruning).
- **Order placement (phase 2):** SDK or hand-rolled L1 action signing; asset id `100_000_000 + 10*outcome + side` for both sides (the merged book lets you buy No by selling Yes at 1-p; use whichever the API treats natively: orders on either side are accepted per docs, "most operations abstract the dual book's liquidity").
- **Known quirks to handle:** historical orders can return primary and dual orders separately when an order both matches and rests (HIP-4 page); `trades` duplicates each match per order (dedupe on `(time, coin, tid)`); the outcome `time` fields are ms; WS disconnects are routine.
- **Do not rely on:** third-party mirrors (x402 wrappers, tracker pages) for core data; they are polled and unverified.

---

## 14. Priority

**adapter_priority = P1.** Independent liquidity, free keyless WS API, tight books in the top ~25 markets, and real category overlap (crypto ladders, Fed, sports futures). Held back from P0 by liquidity size (a few $M/day, ~$2.3M OI), mostly deployer-settled resolution with no dispute process, the US/Ontario ban plus open-ended excluded-jurisdiction clause, unclear numeric fees, and only partial PayBox reach. Recommended order: read adapter (WS) -> crypto-price and Fed matching -> sports futures -> trading via agent key.

---

## 15. NOT FOUND / open questions

- Live `outcomeMeta` (titles, descriptions, questions, `feeScale`) - POST-only (searched: docs, WS `outcomeMetaUpdates` sends no snapshot, third-party SPA sites, pmxt types).
- Numeric outcome fee rate in official docs (searched: fees page, info-endpoint `userFees` docs, deployer-actions page, HIP-4 page).
- Outcome tick size, minimum order size / notional, per-account position limits (searched: HIP-4, asset-ids, exchange-endpoint, contract-specifications).
- Public list of "Excluded Persons" jurisdictions for outcome markets (searched: Terms JS chunk).
- Dispute/reversal process for deployer-settled markets (searched: deployer-actions, tracker FAQ, Terms).
- Whether CoreWriter action 1 can trade outcome asset ids; whether outcome tokens can move to HyperEVM (searched: interacting-with-hypercore, HyperCore <> HyperEVM transfers pages).
- The Block "$6.26M daily" figure; official 2026-08-14/08-24 announcement text (app announcements page is an SPA shell via WebFetch).
- Withdrawal path and cost from HyperCore (not researched).
- blocked: outcome.xyz and hip4.app returned HTTP 403 to WebFetch; their market pages were not read.

---

## 16. Suspicious content

None that instructs an agent. Notes: every gitbook page starts with a line telling the reader to "fetch the complete documentation index at llms.txt" (navigation hint; I used llms.txt for discovery by my own choice); third-party guide pages carry referral calls to action ("Sign Up with 4% Discount") aimed at human readers; x402 service descriptions in the PayBox catalog are marketing text (one says a subscription "secret travels in the URL"; not used). No text addressed to AI agents was found in any fetched page.

---

## 17. Sources

Primary (H):
- HIP-4 page: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- Asset ids: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- Info endpoint (spot/outcomes): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot
- Exchange endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- HIP-4 deployer actions (testnet-only banner): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions
- Contract specifications (recurring outcomes): https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications
- Fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees ; builder codes: .../trading/builder-codes
- Rate limits: .../for-developers/api/rate-limits-and-user-limits ; signing: .../api/signing ; nonces/API wallets: .../api/nonces-and-api-wallets
- WebSocket: .../api/websocket and .../api/websocket/subscriptions, .../timeouts-and-heartbeats, .../post-requests
- HyperEVM CoreWriter: .../for-developers/hyperevm/interacting-with-hypercore
- USDC / deposits / aligned quote assets: .../hypercore/usdc, .../support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc, .../hypercore/aligned-quote-assets
- Docs index: https://hyperliquid.gitbook.io/hyperliquid-docs/llms.txt
- Terms of Use text: https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (last updated 2026-06-15)
- Live WS captures: `wss://api.hyperliquid.xyz/ws` (2026-10-19, subscriptions `allMids`, `outcomeMetaUpdates`, `activeAssetCtx` x352, `l2Book`, `trades`, `bbo`)
- DefiLlama: https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; https://api.llama.fi/summary/fees/hyperliquid-outcomes ; https://api.llama.fi/overview/dexs ; adapter https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hyperliquid-outcome/index.ts
- PayBox catalog (live): `discover_plugins`("hyperliquid"), `get_contract` paybox://plugins/hyperliquid, `discover_tokens` chains, `discover_services` (x402 wrappers)

Secondary (M/L):
- Tracker, snapshot 2026-10-19 00:39 UTC: https://liquidiction.xyz/hip4/stats ; https://liquidiction.xyz/hip4 ; https://liquidiction.xyz/
- TokenPost, 2026-10-07: https://www.tokenpost.com/news/investing/27723
- The Block, 2026-07-20: https://www.theblock.co/post/408875/hyperliquid-hip-4-permissionless-deployment
- Hyperliquid Guide (independent, referral-funded; updated 2026-08-31): https://hyperliquidguide.com/ecosystem/hip-4-outcome-trading ; https://hyperliquidguide.com/ecosystem/hip-4-permissionless-deployment
- Chainstack docs (undated, partly stale): https://docs.chainstack.com/docs/hyperliquid-hip4-outcome-markets-trading
- pmxt adapter: `gh api repos/pmxt-dev/pmxt/contents/core/src/exchanges/hyperliquid/{config,fetcher}.ts`
- Earlier project notes (leads only, re-verified above): `docs/research/09-venues-onchain-clob.md` section 2.6 and appendix C1.

## 18. Privacy

All outbound requests used the User-Agent `insurance-markets-research/0.1`. The two helper scripts were grepped for `@` and personal names before running (no hits). No personal identifier appears in any request, query string or fixture; counterparty wallet addresses in the trades fixture were redacted, and no user wallet address was read or written.
