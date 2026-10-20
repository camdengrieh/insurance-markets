# Hyperliquid HIP-4 Outcome Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 02:17-02:30 UTC). READ-ONLY: doc reads (`curl` GET of the gitbook `.md` pages), `gh api` file reads, unauthenticated GETs, unauthenticated WebSocket `subscribe` frames (never the WS `post` method), and read-only PayBox discovery calls (`discover_plugins`, `discover_services`, `get_contract`). No account, wallet, key, signature, POST/PUT/DELETE, payment, or PayBox money/signing tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own computation/inference; **L** = weak or stale.

Method limits (read first):
- The documented REST read path `POST https://api.hyperliquid.xyz/info` is POST-only (live `GET /info` -> `405`, `allow: POST`, H, fixture `http_get_info_405.txt`). The ground rules forbid POST, so **I did not capture `outcomeMeta` or any REST response**. Live shapes below come from the public WebSocket (`wss://api.hyperliquid.xyz/ws`: HTTP GET upgrade, then `subscribe` frames only). REST shapes are quoted from the official docs and are labelled "docs, not live".
- Consequence: I could not read machine-readable market titles. Titles/categories below come from a third-party tracker (M).
- WebSearch budget was exhausted before I started; all facts come from pages fetched directly.
- Two earlier project notes cover this same venue under other slugs (`hyperliquid-hip-4-outcomes-native.md`, `hyperliquid-outcomes-hip-4.md`). I re-verified the load-bearing facts independently below; where I did not, I say so. This file is self-contained.

---

## 0. Bottom line

1. **Live.** 668 outcome coins (334 outcomes x 2 sides) in a live `allMids` frame at 2026-10-19 02:19Z; `l2Book` updating every few seconds; DefiLlama shows non-zero volume on every day 2026-05-02..2026-10-18 (H).
2. **Native on-chain CLOB on HyperCore**, not EVM and not an AMM. Fully collateralised Yes/No share pairs on a **merged** book, quote token **USDC** (H docs sample + M), no leverage. Binary outcomes, "questions" (exactly-one-wins categorical sets), and standalone outcomes that can settle to any fraction in [0,1] (scalar-capable; docs carry a "Testnet-only" banner for this page).
3. **Best API of any venue so far for an aggregator**: keyless WebSocket and REST, documented limits (1200 weight/min/IP REST; 1000 WS subscriptions). Trading is EIP-712-signed actions to `POST /exchange` with agent (API) wallets.
4. **Independent liquidity** (not a mirror of any other venue). **Modest size**: my live sweep gives $2.59M rolling-24h (Yes-priced) over 334 outcomes and about $2.70M of collateral locked; DefiLlama $3.13M on 2026-10-18. Only 13 books exceed $50k/day; the best book holds roughly $2-3k within 1 cent of mid.
5. **Main risks as an arbitrage leg**: (a) almost all markets are **deployer-settled with no documented trader dispute window**; (b) **US and Ontario residents barred**, plus an unpublished "Excluded Persons" list for outcome markets (Terms of 2026-06-15); (c) the **numeric outcome fee is not in the official docs** and the HIP-4 page's "fees are zero" is stale; (d) **PayBox reach is partial** (signed orders on HyperCore, not EVM transaction proposals; PayBox's own Hyperliquid plugin is read-only spot).
6. **adapter_priority = P1.** Build the read adapter first (cheap, WS); trading adapter second, behind a geo gate.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| Live `allMids` frame, 2026-10-19 ~02:19Z: 1,352 keys of which 668 are `#<enc>` outcome coins (fixture `ws_allMids_outcome_keys.json`) | H |
| Live `activeAssetCtx` replies for all 334 Yes coins; 184 with non-zero 24h volume; live `l2Book` (9 frames in 40 s for the top market) and `trades` (33 prints in 40 s) (fixtures `derived_liquidity_ranking.json`, `ws_l2Book_yes_no_pair.json`, `ws_trades_sample_redacted.json`) | H |
| DefiLlama `hyperliquid-outcomes` (id 8941, category "Prediction Market"): 170 daily points 2026-05-02..2026-10-18, all > 0; listed on DefiLlama 2026-10-08 (`listedAt` 1791495619) (https://api.llama.fi/summary/dexs/hyperliquid-outcomes) | H |
| DefiLlama adapter comment: "HIP-4 outcome markets, live on mainnet since 2026-05-02" (`gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts`) | H |
| Terms of Use "Last updated on June 15, 2026" contains dedicated outcome-market clauses (https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js) | H |
| Tracker snapshot 2026-10-19 02:10 UTC: 287 open markets, 12,687 deployed and 12,479 settled since 2026-05-02 (https://liquidiction.xyz/hip4/stats) | M |
| The official HIP-4 page is **undated and stale** on three points: it describes only the BTC recurring binary, says multi-outcome is "not part of the initial mainnet release", and says "Fees are currently zero for outcome markets for initial testing" (https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets) | H |
| Hint says one CoinGecko explainer still says testnet-only: not re-checked (not needed; mainnet is proven above) | - |

Verdict: **still_live = true.**

---

## 2. Kind and market model

- **Kind (H):** on-chain central limit order book on HyperCore. "Outcomes are fully collateralized contracts that settle within a fixed range" and offer "an alternative form of derivative trading that does not involve leverage or liquidations" (HIP-4 page).
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** each outcome has an integer `outcome` and two sides 0/1 (`sideSpecs`, normally Yes/No). `encoding = 10*outcome + side`; coin `#<encoding>` (books, WS), token `+<encoding>` (balances), order asset id `100_000_000 + encoding`. Example: outcome 1, side 0 -> `#10`, `+10`, `100000010`.
- **Payout (H):** "Yes converts to `settleFraction` quote tokens and No to `1 - settleFraction`"; `settleFraction = 1` is binary yes, `0` is binary no (HIP-4 page). One share pays $1 of face value in total.
- **Merged book (H doc + H live):** "an order to buy Yes at price `p` is equivalent to an order to sell No at price `1-p`". Live check at 02:19Z on `#36000`/`#36001`: Yes bid/ask 0.86899/0.869, No bid/ask 0.131/0.13101; same millisecond timestamp, sizes swapped (fixture `ws_l2Book_yes_no_pair.json`). **An aggregator needs one book per outcome (subscribe to side 0) and derives No as `1 - p`.** Priority is price-side-time.
- **Questions / categorical (H):** "collections of outcomes where exactly one outcome will settle to Yes, and all others will settle to No"; each outcome has its own book; `negate` and `merge` link them. Every question has a protocol-created fallback ("other") outcome; up to 100 named outcomes per question (deployer-actions page, testnet banner).
- **Scalar-capable (H, testnet-banner page):** standalone outcomes "may settle to any fraction (e.g. `"0.66"` for scalar payouts)"; outcomes inside a question must settle exactly 0 or 1.
- **Manual operations (H, exchange-endpoint):** `{"type":"userOutcome", "splitOutcome" | "mergeOutcome" | "mergeQuestion" | "negateOutcome": {...}}` (split X quote -> X Yes + X No; merge reverses; negate turns X No of one question outcome into X Yes of every other).
- **Price/size domain (H live):** prices strings with up to 5 significant figures (tick 1e-5 near 0.87), share sizes integers ("629.0"). **Tick and minimum order size/notional for outcomes: NOT FOUND** (searched: HIP-4, asset-ids, exchange-endpoint, order-book, fees, contract-specifications). The exchange-endpoint docs show a generic error "Order must have minimum value of $10." (H that the text exists; not stated to apply to outcomes).
- **Market identity strings:**
  - Protocol recurring series (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications and .../for-developers/api/info-endpoint/spot): `name="Recurring"`, `description = class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d` (standalone) or `class:priceBucket|underlying:BTC|expiry:20260507-0745|priceThresholds:81538,81783|period:15m` (a question with 3 outcomes `index:0/1/2`: below lower, between, at-or-above upper). "At most one recurring series for each (seriesType, underlying, period)".
  - Deployer templates (H, deployer-actions page): `name = template:<id>`; `description` = keyword-value pairs `key:value|key:value`; standalone side names `template:<Name>`; question fallback named `template fallback`. Templates are voted by validators and carry a `semanticRestriction`; `outcomeTemplates` returns them (example in the docs: a `policyRateDecision` question for central-bank decisions).
- **Do not hard-code categories**: the template catalogue grows (28 approved on mainnet per the tracker, M; 18 mid-September per earlier note, M).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | HyperCore (Hyperliquid L1). Outcome tokens are HyperCore spot-style tokens, not ERC-20s; no EVM contract documented for outcomes | H |
| Quote / collateral | **USDC.** Docs `settledOutcome` sample carries `"quoteToken": "USDC"`; an independent guide says canonical contracts settle in USDC and USDH (used earlier) is sunset (Hyperliquid Guide, updated 2026-08-31) | H (sample) / M (migration) |
| Funding in | Wallet-connected accounts: "USDC deposits via Arbitrum only. Deposits below 5 USDC are lost." Email-wallet accounts: Arbitrum, Base, Ethereum, Polygon via Across, below 5 USDC redirected, below 1 USDC lost (https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc). CCTP is "the preferred method for minting USDC natively on the Hyperliquid L1"; the legacy bridge is deprecated (.../for-developers/api/usdc) | H |
| Funding out | `withdraw3` signed action, no Arbitrum tx by the user; "funds arrive in 3-4 minutes" (.../for-developers/api/usdc) | H |
| HyperEVM | chain id 999 (PayBox lists it as `eip155:999`, native HYPE; docs.paybox.sh/reference/mcp-tools). CoreWriter system contract `0x3333333333333333333333333333333333333333` forwards actions to HyperCore (see section 6) | H |

---

## 4. Read API

- **Docs:** https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api ; index `.../llms.txt`; every page also serves raw markdown with a `.md` suffix (H).
- **Base URLs (H):** REST `https://api.hyperliquid.xyz/info` (POST, JSON body `{"type": ...}`) and `/exchange` (POST); WebSocket `wss://api.hyperliquid.xyz/ws`; testnet `api.hyperliquid-testnet.xyz`.
- **Auth:** none for market data; limits are per IP (H).
- **Rate limits (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits):** REST 1200 weight/min/IP; `l2Book`, `allMids`, `orderStatus`, `clearinghouseState`, `spotClearinghouseState`, `exchangeStatus` weight 2; `userRole` 60; every other documented info request weight 20 (so treat `outcomeMeta`, `outcomeTemplates`, `settledOutcome` as 20: not in the weight-2 list); exchange `1 + floor(batch/40)`. WebSocket: 10 connections, 30 new connections/min, **1000 subscriptions**, 2000 messages sent/min, 100 inflight posts. Address-based action limit: 1 request per 1 USDC traded + 10,000 buffer; open-order cap 1000 (+1 per 5M USDC, max 5000).
- **Market discovery:**
  - REST `{"type":"outcomeMeta"}` -> `{"outcomes":[{outcome,name,description,sideSpecs:[{name},{name}]}]}` (docs sample, not live). `outcomeMeta` also carries questions (`{question,name,description,fallbackOutcome,namedOutcomes[],settledNamedOutcomes[]}`) per the WS type definitions and a third-party adapter (M), and "per-outcome [deployer fee] scales" per the deployer-actions page (H). It returns no coin strings: compute them from `outcome` and side.
  - REST `{"type":"outcomeTemplates"}`, `{"type":"outcomeDeployerLimits","venue":...}`, `{"type":"settledOutcome","outcome":N}` -> `{spec{...,quoteToken}, settleFraction, details:"price:76876.9"}` (docs samples, not live; fixture `DOCS_NOT_LIVE_outcomeMeta_settledOutcome_shapes.json`).
  - WS `{"type":"outcomeMetaUpdates"}` -> arrays of `{outcomeCreated:{outcome,name,description,sideSpecs}}`, `{outcomeSettled:n}`, `{questionUpdated:{...}}`, `{questionSettled:n}` (type defs in the WS docs, H; subscribed and acked live, H). See section 4a for what I saw.
  - WS `allMids` (no `dex` param) already contains every outcome coin as `"#<enc>":"<mid>"`: a free universe/liveness list (H live). Yes mid + No mid = 1 for all 334 pairs (tolerance 0.02).
- **Books / prices (H live):** `{"method":"subscribe","subscription":{"type":"l2Book","coin":"#36000"}}` -> `{coin,time(ms),levels:[bids,asks]}`, each level `{px,sz,n}` strings, **20 levels per side**; 9 frames in 40 s for the top market. `bbo` -> `{coin,time,bbo:[bid|null,ask|null]}` on best-price changes. Because the book is merged, subscribe to side 0 only.
- **Trades (H live):** `trades` -> `[{coin,side:"B"|"A",px,sz,time,hash,tid,users:[addr,addr]}]`. The same millisecond frequently shows a B print and an A print one tick apart (0.869 vs 0.86899) with distinct `tid`: the feed is per fill-leg. Dedupe on `(hash,tid)`; do not derive volume from it.
- **Volume / open interest (H live):** `activeAssetCtx` on a `#` coin returns channel `activeSpotAssetCtx` `{coin, ctx:{prevDayPx,dayNtlVlm,markPx,midPx,circulatingSupply,totalSupply,dayBaseVlm}}`. `circulatingSupply` of a Yes token = shares outstanding = dollars of collateral locked. **Yes and No report the same `dayBaseVlm` (shares) and `dayNtlVlm(Yes)+dayNtlVlm(No) = dayBaseVlm`** (277,939.0 = 240,026.9 + 37,912.1 for `#36000`/`#36001`): never add both sides' notional (fixture `ws_activeSpotAssetCtx_yes_no.json`).
- **Capacity:** one connection easily holds all 334 `activeAssetCtx` subscriptions (I opened 334 + 8 and got 342 acks; limit 1000/IP).
- **Resolution data:** REST `settledOutcome`; WS `outcomeSettled`. A third-party guide says settlement details are pruned from L1 state (M, earlier note): persist results on receipt.
- **Third-party:** a pmxt adapter exists (`pmxt-dev/pmxt`, `core/src/exchanges/hyperliquid/`, read via `gh api`, not executed) that calls `outcomeMeta`, `allMids`, `l2Book`, `recentTrades`, `candleSnapshot`, `spotMetaAndAssetCtxs` (M). Pay-per-call x402 wrappers exist (`hyperliquid-predict.use.x402atlas.com/outcomes`, advertised 5,000 USDC base units = $0.005 per call); I did not call them and the free official API makes them unnecessary (L).

### 4a. What the live outcomeMetaUpdates stream showed

- **My listens (H):** `outcomeMetaUpdates` acked on subscribe with no snapshot, then **zero events** across about 7.5 minutes in two connections (2026-10-19 02:17-02:19Z and 02:21-02:28Z). Events are bursty, so a live-only listener must bootstrap from REST `outcomeMeta`.
- **Shape seen on mainnet by an earlier run in this repo (M, not reproduced by me; fixture `docs/research/fixtures/hyperliquid-hip-4-outcomes-native/ws_outcomeMetaUpdates_events.json`, captured 2026-10-19 ~01:30Z):** `outcomeSettled: 14247..14249` and two `outcomeCreated` frames, e.g. `{"outcome":14250,"name":"template:binaryPrice","description":"perp:BTC|priceDescription:BTC-USDC perp mark|seconds:60|threshold:82444|time:20261019-0145","sideSpecs":[{"name":"template:Yes"},{"name":"template:No"}],"quoteToken":"USDC","venue":"out","deployerFeeScale":"1.0"}`. So mainnet `outcomeCreated` carries `quoteToken`, `venue` and `deployerFeeScale` beyond the documented `OutcomeSpec` type, and the 15-minute BTC/HYPE ladders resolve on a **60-second TWAP of the perp mark**, not on the protocol's interpolated mark at expiry. Outcome ids are now around 14,250 (live `allMids` keys run up to `#142621`, i.e. outcome 14262).

---

## 5. Trade path (programmatic)

- **Mechanism (H):** signed JSON actions to `POST https://api.hyperliquid.xyz/exchange`. Outcome orders use the normal spot-style `order` action; the asset id is `100_000_000 + 10*outcome + side` (asset-ids page). Cancels by `oid`/`cloid` as for spot. Outcome operations use `{"type":"userOutcome", splitOutcome | mergeOutcome | mergeQuestion | negateOutcome}`. Exact `order` field list: see the exchange-endpoint page (`a`, `b`, `p`, `s`, `r`, `t`).
- **Signing (H, official Python SDK, `hyperliquid-dex/hyperliquid-python-sdk`, `hyperliquid/utils/signing.py`, last commit 2026-06-04):**
  - **L1 actions** (orders, cancels; `userOutcome` split/merge/negate appears to be an L1 action too, M, because its documented body carries no `signatureChainId`/`hyperliquidChain`): `connectionId = keccak(msgpack(action) || nonce(8 bytes BE) || vault flag [|| vault address] [|| expiresAfter])`, wrapped as phantom agent `{source: "a" (mainnet) | "b", connectionId}` and signed as EIP-712 typed data with domain `{name:"Exchange", version:"1", chainId:1337, verifyingContract:0x0}` and type `Agent(string source, bytes32 connectionId)`.
  - **User-signed actions** (`withdraw3`, `usdSend`, `approveAgent`, `approveBuilderFee`, ...): EIP-712 with `signatureChainId` (SDK uses `0x66eee`) and `HyperliquidTransaction:*` primary types.
  - The SDK has **no outcome-specific code** (grep for "outcome" in `signing.py` and `exchange.py` found nothing): outcome orders are generic orders with the outcome asset id, so a hand-rolled or SDK-based client must supply `100_000_000 + enc` itself. Msgpack field order matters (signing doc: "use an SDK").
- **Agent (API) wallets (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets):** "A master account can approve API wallets to sign on behalf of the master account or any of the sub-accounts"; "API wallets are only used to sign" and account queries must use the master address. Nonces: the 100 highest are stored per signer; use one API wallet per trading process; do not reuse a deregistered agent address (its nonce state may be pruned, replay risk); wallets can also be pruned on expiry or when the registering account has no funds. Counts and expiry limits are not stated on that page (NOT FOUND). Practical design (M): one `approveAgent` signature (user-signed, `HyperliquidTransaction:ApproveAgent`) from the funded wallet, then a locally held agent key signs orders at arbitrage speed.
- **Builder codes (H):** optional per-order fee; "builders earn builder fees on sell orders that specify their builder code" (HIP-4 page), and the deployer-actions page adds that builder codes can also be applied to buy orders on outcomes and are charged in the quote token. Users pre-approve a max fee (`approveBuilderFee`).
- **Sandbox:** testnet exists (`api.hyperliquid-testnet.xyz`); the permissionless-deployer docs are testnet-labelled.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial.**

1. **Signed orders: yes in principle (H docs, M design).** PayBox `request_wallet_sign` supports intents `message` (EIP-191), `typedData` (EIP-712), `transaction`, `authorization`, `raw` ("Signs a pre-computed digest as-is"), and "An EVM MPC wallet shares one address across every `eip155:*` chain" (https://docs.paybox.sh/reference/mcp-tools). A PayBox EVM wallet can therefore sign (a) the one-time `approveAgent` typed data and (b) per-order `Agent` typed data (chainId 1337) if our plugin computes the msgpack/keccak `connectionId` itself. Costs: one request/poll round trip per signature unless an agent key is used; the approver sees an opaque `bytes32`, so per-order approval UX is weak; and whether a PayBox plugin runtime may POST to `api.hyperliquid.xyz` is not established here (NOT FOUND in the PayBox docs I read).
2. **EVM transaction proposals: only on HyperEVM (chain 999) via CoreWriter (H docs).** `0x3333...3333` accepts action 1 (limit order: `(uint32 asset, bool isBuy, uint64 limitPx, uint64 sz, bool reduceOnly, uint8 tif, uint128 cloid)`, px/sz scaled 1e8) and **action 17 "Outcome operation"** `(uint8 encodedOperation, uint32 question, uint32 outcome, uint64 wei)` with 0 = Split, 1 = Merge, 2 = MergeQuestion, 3 = Negate (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore). Order actions are "delayed onchain for a few seconds". An outcome asset id (>= 100,000,000) fits `uint32`, but **the page does not say action 1 accepts outcome asset ids: NOT FOUND**. Split/merge/negate through CoreWriter are explicitly supported. Not recommended for v1.
3. **Base / Ethereum / BNB / Polygon / Solana wallets cannot trade it directly.** They can only fund: Arbitrum USDC deposit or CCTP for wallet-connected accounts; Across from Base/Ethereum/Polygon is documented only for email-wallet accounts (H).
4. **PayBox's own Hyperliquid plugin is read-only spot browsing (H):** live `discover_plugins("hyperliquid")` -> official plugin `hyperliquid`, `enabled:false`; `get_contract` shows exactly three tools, `hyperliquid_markets`, `hyperliquid_prices`, `hyperliquid_token`, all `readOnlyHint:true`, no order or outcome tool. `discover_services("hyperliquid outcomes")` returns only third-party x402 data wrappers (not used).
5. **Geo gate required** (section 9). A plugin must not attempt to trade for a US or Ontario user.

---

## 7. Fees

- **Structure (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, section "Outcome tokens"):** "Outcome trading only charges fees when closing or settling, not when opening outcome positions." Minting (split): no fee. A normal trade where one side pays: both users get volume credit `fee_paying_px * sz`. Burning (merge): both or only the taker pays. Settlement: each user's volume credit `settle_fraction * sz`. "Outcome trading does not support rebates. Users who would receive rebates for spot and perp trading pay zero fees on maker orders."
- **Numeric base rate: NOT FOUND in the official docs** (the fees page defines only perp and spot tiers; spot base tier 0.070% taker / 0.040% maker). The HIP-4 page's "Fees are currently zero for outcome markets for initial testing" is stale.
- **Deployer scaling (H, deployer-actions page):** template instances carry `deployerFeeScale` in [0,10]; users pay `base * (scale + max(scale, 1))`; the deployer gets the `scale` component, the protocol the rest; "Maker rebates are never paid on outcome markets". Scale 1 -> 2x base; scale 0 -> 1x. The scale is returned per outcome in `outcomeMeta`. A mainnet instance showed `deployerFeeScale:"1.0"` (i.e. 2x base) in an earlier run's capture (4a, M); I did not see one first-hand. The Block (2026-07-20, M) said deployers may set fees up to 50%.
- **When Hyperliquid's own fee started:** DefiLlama adapter comment: "Hyperliquid's own fee was zero during the initial testing period: until 2026-08-14 the only outcome fees in the indexer are builder-code fees, Hyperliquid's share starts on 2026-08-15" (H read of the comment; M as to truth). DefiLlama daily fees: $0.4 on 08-14, $81 on 08-15, $289 on 08-16 (H data).
- **Empirical all-in band (M, my computation: DefiLlama daily fees / DefiLlama daily volume, 45 days to 2026-10-18):** median 14.6 bps, range 11.0-24.6 bps; includes builder-code fees; volume is "halved so each trade is counted once". Use as a sanity band only. An independent guide says the average outcome fee is half of non-outcome spot fees (about 0.035% taker at base tier) (M, single source).
- **Who pays:** the closing/selling side or the holder at settlement; an opening buy is free. A buy-and-hold-to-expiry leg pays at settlement on `settle_fraction * sz`; a round trip pays on exit. Read the live `userFees` and each market's `deployerFeeScale`; never hard-code zero.
- **Other costs:** USDC in/out via Arbitrum/CCTP, builder fee if routed through a front-end, HyperEVM gas on the CoreWriter route only.

---

## 8. Resolution mechanism and dispute risk

1. **Protocol-settled recurring series (H):** no oracle, no human. Yes iff `markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice`, i.e. the linearly interpolated HyperCore **mark price** of the underlying perp at the settlement timestamp (contract-specifications page). Daily BTC series settles at 06:00 UTC (HIP-4 page). This is the only tier that is fully machine-checkable.
2. **Validator-voted canonical markets (M):** "expected to be rare", ideally "fewer than 10 outcomes or questions per year" (The Block, 2026-07-20, https://www.theblock.co/post/408875/hyperliquid-hip-4-permissionless-deployment).
3. **Deployer-settled markets (the large majority):**
   - Deployers instantiate **validator-approved templates** and settle them with `settleOutcome` / `settleQuestion2`; `nameAndDescription` and `sideNames` must echo the outcome exactly; markets contradicting the template's `semanticRestriction` "are considered malformed and slashable by validators" (deployer-actions page, H, **testnet-only banner**: mainnet parity is M).
   - Stake: The Block (2026-07-20): "HIP-4 deployers will be required to stake 500,000 HYPE", locked six months, "can be partially or fully taken away by validator vote" for poorly defined markets, incorrect settlement, or failure to settle within one week, and the article calls all details "preliminary" (M). TokenPost (2026-10-07) repeats 500,000 HYPE (M). The hint's "500k-1M" range: **the 1M figure was not found in any source I read**; the official docs give no amount (NOT FOUND).
   - **No trader-initiated dispute or challenge window is documented**: the tracker says "The documented deployer settlement flow does not include an escrowed challenge window" (M, https://liquidiction.xyz/hip4), the official docs are silent, and the Terms disclaim "erroneous outcome determination and disputed settlements" (Terms 6.4, H). Reversal after a slash: NOT FOUND.
   - Concentration (M): tracker lists 3 registered mainnet deployers; in its top-50 open markets by volume, 49 are "Deployer-settled" and 1 "Auto-settle" (snapshot 2026-10-19 02:10 UTC). TokenPost (2026-10-07): the "Outcome" venue carried 92% of external-venue volume since external venues were admitted on 2026-08-29.
4. **Arbitrage rule:** treat protocol-settled recurring binaries as the only machine-checkable legs; for deployer templates compare rule text (reference price, TWAP window, delisting and tie-break clauses, official source) against the counter-venue before pairing. The template text for the docs' `policyRateDecision` example resolves "No change" to Yes if no decision is published by a deadline: that differs from typical Polymarket/Kalshi rules.

---

## 9. Geo, ToS, automation (H, Terms text)

Source: Terms of Use inside https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js, "Last updated on June 15, 2026" (read as text on 2026-10-19).

- **Restricted Persons:** residents/entities "in the United States of America or Ontario, Canada", sanctioned jurisdictions, and citizens of restricted territories "regardless of their location" are "strictly prohibited from accessing or using the Interface".
- **Excluded Persons (outcome markets only, clauses 1.7-1.8):** persons in "certain jurisdictions that we designate from time to time" or for whom access "would require us or any third party to obtain any license, registration, approval or authorization that has not been obtained"; Hyperliquid "may implement technical, operational or other measures designed to block access to the outcome markets tab". **The designated list is NOT FOUND** (not in the Terms), so a plugin cannot hard-code it.
- Using technology "to disguise your location" is prohibited and the user warrants compliance.
- **Automation (3.1.8):** prohibits bots/scripts "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions, or disrupt the normal functioning of Hyperliquid". Not a blanket bot ban; the documented API/SDKs are the automation route. These Terms govern the Interface; whether they bind direct API use is a legal question I did not resolve.
- Reading public market data over the API needs no account; the geo clauses attach to using the Interface and trading.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Rolling 24h notional, Yes-priced, 334 Yes coins | **$2.59M** (5.94M matched shares at $1 face) | my WS sweep, 2026-10-19 02:19Z (fixture `derived_liquidity_ranking.json`) | H data / M interpretation |
| Books with volume | 184 with any, 61 > $10k, 13 > $50k, 4 > $100k | same | H |
| Collateral locked (sum of Yes `circulatingSupply`) | 2.70M shares = **about $2.70M**; 259 outcomes have supply > 0; median outcome 919 shares | same | M (derived) |
| Top books by 24h notional | `#36000` $240k (60.8k shares outstanding); `#132280` $215k; `#132130` $167k; `#131120` $114k | same | H |
| Depth, top book `#36000` | best bid 0.86899 x 629, best ask 0.869 x 846 (one tick wide); within 1 cent of mid: about $1.9k bid / $2.9k ask; within 5 cents: about $6.4k bid / $11.6k ask (20 levels per side shown) | `ws_l2Book_yes_no_pair.json`, my computation | H data / M calc |
| Execution cost for size | "A $10,000 market buy typically paid 2% to 3% above the best ask"; median spread across the 25 most active books 0.29 cents | TokenPost, 2026-10-07 | M |
| DefiLlama daily volume (each trade once) | 10-12 $2.99M; 10-13 $2.70M; 10-14 $2.08M; 10-15 $1.90M; 10-16 $2.26M; 10-17 $2.85M; **10-18 $3.13M** | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| 7d / 30d / all-time (DefiLlama) | $17.9M / $47.0M / $261.1M; peak day $8.42M on 2026-06-27; monthly (my sums): May $47.2M, Jun $74.1M, Jul $58.5M, Aug $11.5M, Sep $39.8M, Oct 1-18 $30.0M | same | H / M |
| Tracker | 24h $3.30M (180,896 trades, 2,000 traders); 7d $22.0M; 30d $60.0M; all-time $350.8M; 287 open markets | https://liquidiction.xyz/hip4/stats, 2026-10-19 02:10 UTC (counts both buyers in complementary matches) | M |
| Incentives | $1M rewards programme, $273,409 paid to 2,487 wallets by 2026-10-05; some volume may be reward-driven | TokenPost 2026-10-07 | M |
| Fee revenue | $3,603 on 2026-10-18; $21.4k over 7d | https://api.llama.fi/summary/fees/hyperliquid-outcomes | H |

Reading: about $2.5-3.5M/day and about $2.7M of collateral, spread over about 330 outcomes; a few dozen liquid books and the rest thin. Tradable size per leg is in the low thousands of dollars at the touch. Source discrepancies to keep in mind: TokenPost's "$1.25M average daily volume in the first five days of October" does not match DefiLlama (about $0.69M/day for 10-01..10-05) or the tracker; DefiLlama and the tracker use different counting conventions (L for the TokenPost figure).

---

## 11. Event categories and cross-venue overlap

Evidence: tracker open-markets table, top ~50 of 287 by 24h volume, 2026-10-19 02:10 UTC (M); docs examples (H); shares of 30-day volume from TokenPost (M).

| Category on HL | Examples seen | Overlaps | Arb quality |
|---|---|---|---|
| **Sports** (largest by volume) | NBA games (NY v PHI, DET v BOS ...), NFL games (SF v WSH, GB v DAL), Champions League and Premier League matches, LoL esports; futures: 2027 NFL winner, 2026/27 NBA winner, Champions League winner, Premier League winner, 2026 Ballon d'Or | Polymarket, Kalshi, SX Bet, Azuro, Smarkets | Good for futures/outrights; game markets are deployer-settled, check rules text and void/postponement clauses |
| **Crypto price** | daily BTC "above $X" (protocol auto-settle, 06:00 UTC), BTC touch markets, hourly/15-minute ladders | Polymarket, Kalshi, Limitless, Predict.fun, Opinion | Highest overlap, but reference price is the HyperCore perp mark (interpolated or TWAP), not a spot index: basis risk |
| **Macro / central banks** | "Federal Reserve's Open Market Committee October 2026 rate decision" (3-outcome question) | Kalshi, Polymarket | Good if the same official source is used |
| Stocks / commodities / indices | price templates on HIP-3 perps | Kalshi | Partial |

TokenPost shares of 30-day volume to about 2026-10-05: soccer + American football + esports 45%, crypto price 42%, stocks and commodities 7%, Fed 6% (M). Do not hard-code categories: templates change.

---

## 12. Shares liquidity with another venue?

**No: independent.** The HyperCore books are the only place outcome tokens trade. Third-party front-ends (Outcome, Liquidiction, trade[XYZ], Skew, and others) route into the same books through builder codes, a fee mechanism on the same book (HIP-4 page, H); other project notes (M) reach the same conclusion for the specific front-ends. **Do not model any HIP-4 front-end or deployer venue as a separate arbitrage leg or add their volumes to the base figure**: one adapter, with `deployer_venue` as an attribute. I found no evidence that HL books mirror Polymarket, Kalshi, or any other venue (NOT FOUND: searched docs, DefiLlama adapter, tracker). HL perps are a hedge instrument for crypto/stock outcomes, not shared liquidity.

---

## 13. Adapter spec for the aggregator

- **Bootstrap:** `POST /info {"type":"outcomeMeta"}` at start and every few minutes (weight 20), parse `name` (`Recurring` vs `template:<id>`), `description` key/values, `questions`, `venue`, `deployerFeeScale` when present. Then follow WS `outcomeMetaUpdates` (no snapshot on subscribe: ack only). Reconcile against `#` keys in `allMids`.
- **Quotes:** WS `l2Book` on side 0 of each live outcome (20 levels per side). Derive No: `bid_no = 1 - ask_yes`, `ask_no = 1 - bid_yes`. Each share pays $1; sizes are integer shares; price tick 1e-5. Rank/filter with `activeAssetCtx` (`dayBaseVlm`, `circulatingSupply`); do not sum Yes and No notional.
- **Metadata for the market linker:** tier (recurring / validator / deployer), expiry (`YYYYMMDD-HHMM` UTC for recurring; template `time`/`expiry` keyword otherwise), underlying perp, thresholds, TWAP seconds, template id, quote token, `deployerFeeScale`, `semanticRestriction`.
- **Fee model:** close/settle only: `base_rate * (scale + max(scale, 1))`; pull the live rate (`userFees`), not a constant.
- **Settled results:** call `settledOutcome` on each `outcomeSettled`, persist.
- **Trading (phase 2):** hand-rolled or SDK L1 signing; asset id `100_000_000 + 10*outcome + side`; start with an approved agent wallet; geo gate in front; integer share sizes; respect the 1 request per USDC traded address limit.
- **Quirks:** historical orders can show primary and dual orders separately when an order both matches and rests (HIP-4 page, H); `trades` repeats a fill per leg; "The server will close any connection if it hasn't sent a message to it in the last 60 seconds": send `{"method":"ping"}` (reply `{"channel":"pong"}`) on quiet connections, e.g. one that only follows `outcomeMetaUpdates` (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/timeouts-and-heartbeats, H).
- **Do not rely on** the tracker pages or x402 wrappers for core data.

---

## 14. Priority

**adapter_priority = P1.** Independent liquidity, free keyless documented WS/REST, tight top books, and genuine overlap with crypto ladders, FOMC decisions and sports futures. Not P0: only about $2.5-3.5M/day and about $2.7M of collateral across about 330 outcomes with low-thousands depth at the touch, nearly all markets deployer-settled with no dispute process, US/Ontario barred plus an unpublished excluded-jurisdictions list, numeric fee undocumented, and PayBox reach only partial. The read adapter is cheap enough to build now as a signal and quote source.

---

## 15. NOT FOUND / open questions

- Live `outcomeMeta` response (titles, descriptions, questions, fee scales): POST-only; not called. Needs a one-off read-only POST (permission decision for the orchestrator) or an `outcomeMetaUpdates` backfill.
- Numeric outcome base fee in official docs (searched: fees page, HIP-4 page, deployer-actions, builder-codes).
- Outcome tick size, minimum order size/notional, position limits (searched: HIP-4, asset-ids, exchange-endpoint, order-book, fees, contract-specifications).
- Mainnet HYPE stake amount in official docs (only press: 500,000 HYPE; "1M" not found anywhere).
- Public list of "Excluded Persons" jurisdictions.
- Dispute/reversal process for deployer-settled markets.
- Whether CoreWriter action 1 accepts outcome asset ids.
- Whether a PayBox plugin runtime may make outbound POSTs to `api.hyperliquid.xyz`.
- API wallet count and expiry limits (the nonces/API-wallets page does not state them).
- Reconciling DefiLlama ($3.13M on 10-18), the tracker ($3.30M/24h) and my Yes-priced $2.59M: different counting conventions; none verified against raw fills.

---

## 16. Suspicious content

None addressed to AI agents. Notes: every gitbook page starts with a navigation line pointing to `llms.txt` (benign index hint, not an instruction; I did not act on it beyond reading the index). The tracker pages are wallet-connect UI text with referral/CTA copy aimed at humans. The x402Atlas wrapper descriptions in the PayBox service catalogue are marketing text and were not used.

---

## 17. Sources

Primary (H):
- HIP-4 page: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- Asset ids: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- Info endpoint (spot and outcomes): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot
- Exchange endpoint (split/merge/negate): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- HIP-4 deployer actions (Testnet-only banner): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions
- Contract specifications (recurring outcomes): https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications
- Fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
- Rate limits: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits
- WebSocket subscriptions: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions
- HyperEVM CoreWriter: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
- USDC / deposits: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/usdc ; https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc
- Docs index: https://hyperliquid.gitbook.io/hyperliquid-docs/llms.txt
- Official Python SDK signing code: `gh api repos/hyperliquid-dex/hyperliquid-python-sdk/contents/hyperliquid/utils/signing.py`
- Terms of Use text: https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (last updated 2026-06-15)
- Live WS: `wss://api.hyperliquid.xyz/ws` (2026-10-19 02:17-02:30Z: `allMids`, `outcomeMetaUpdates`, `activeAssetCtx` x 335, `l2Book` x 2, `bbo` x 2, `trades` x 1); `GET https://api.hyperliquid.xyz/info` -> 405
- DefiLlama: https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; https://api.llama.fi/summary/fees/hyperliquid-outcomes ; adapter `gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts`
- PayBox: https://docs.paybox.sh/reference/mcp-tools ; live `discover_plugins`/`discover_services`/`get_contract paybox://plugins/hyperliquid` (2026-10-19)

Secondary (M/L):
- Tracker: https://liquidiction.xyz/hip4 ; https://liquidiction.xyz/hip4/stats (snapshot 2026-10-19 02:10 UTC)
- The Block, 2026-07-20: https://www.theblock.co/post/408875/hyperliquid-hip-4-permissionless-deployment
- TokenPost, 2026-10-07: https://www.tokenpost.com/news/investing/27723
- Hyperliquid Guide (independent; updated 2026-08-31): https://hyperliquidguide.com/ecosystem/hip-4-outcome-trading
- pmxt adapter: `gh api repos/pmxt-dev/pmxt/contents/core/src/exchanges/hyperliquid/fetcher.ts`
- Earlier project notes on the same venue: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/venues/hyperliquid-outcomes-hip-4.md`

Fixtures (all <= 5 KB, in `docs/research/fixtures/hyperliquid-hip-4-outcome-markets/`): `ws_allMids_outcome_keys.json`, `ws_activeSpotAssetCtx_yes_no.json`, `ws_l2Book_yes_no_pair.json`, `ws_bbo_sample.json`, `ws_trades_sample_redacted.json` (counterparty wallets redacted), `ws_subscription_acks.json`, `derived_liquidity_ranking.json` (derived by me), `defillama_hyperliquid-outcomes_trimmed.json`, `DOCS_NOT_LIVE_outcomeMeta_settledOutcome_shapes.json` (docs samples, not live), `http_get_info_405.txt`. No fixture for `outcomeMetaUpdates` events: I observed none.

## 18. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1` (curl `-A`, and the WebSocket handshake in a stdlib script). Scripts were grepped for `@` and personal names before running (no hits). Fixtures were checked for emails and 40-hex wallet addresses; trade counterparties are redacted. No user wallet address was read or written; no personal identifier appears in any request.
