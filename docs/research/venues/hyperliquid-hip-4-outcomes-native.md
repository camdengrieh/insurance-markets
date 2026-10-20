# Hyperliquid HIP-4 Outcomes (native) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 01:29-01:45 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs, unauthenticated WebSocket `subscribe` frames, read-only PayBox discovery calls (`discover_plugins`, `get_contract`). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own computation/inference; **L** = weak or stale.

Method limits (read these first):
- `POST /info` (outcomeMeta, l2Book REST, settledOutcome) is the documented REST read path and is POST-only (live `GET /info` -> 405 `allow: POST`, H, fixture `http_get_info_405.txt`). POST is forbidden by this task's ground rules, so **I did not capture `outcomeMeta` or any REST response**. Live shapes come from the documented public WebSocket (`wss://api.hyperliquid.xyz/ws`, HTTP GET upgrade then `subscribe` frames only; never the WS `post` method).
- Consequence: I could **not** read market titles for existing outcomes. The hint's "NFL games resolving 2026-10-18 / ZEC binaries 2026-10-23 / venue tags txyz, out, skew" came from the discovery stage's `outcomeMeta` call and are **not independently verified here** (M). I saw venue tag `out` first-hand in live `outcomeCreated` frames.
- WebSearch budget was exhausted mid-session; no new searches. Third-party facts reuse pages I could fetch directly, plus the earlier project note `docs/research/venues/hyperliquid-outcomes-hip-4.md` (a lead, re-verified below where tagged H).

---

## 0. Bottom line

1. **Live.** 334 outcomes (668 `#` coins) in `allMids` at 2026-10-19 01:30Z; `l2Book` updated every ~0.5-5 s; DefiLlama shows non-zero volume every day 2026-05-02..2026-10-18 (H).
2. **Native on-chain CLOB on HyperCore** (not EVM), fully collateralised binary outcomes, Yes/No tokens on a **merged** book, collateral **USDC**, no leverage. Multi-outcome "questions" and scalar-capable standalone outcomes exist (H).
3. **Best-in-class free API for an aggregator**: keyless WebSocket (`l2Book`, `bbo`, `trades`, `activeAssetCtx`, `allMids`, `outcomeMetaUpdates`), REST `POST /info`; official rate limits documented (H). Trading = EIP-712-signed actions to `POST /exchange`; agent wallets supported (H).
4. **Independent liquidity** (not a mirror of Polymarket/Kalshi). Size is modest: DefiLlama $3.13M volume on 2026-10-18, $17.9M over the last 7 complete days; ~$2.7M of collateral locked across live outcomes (my derivation) (H data / M interpretation).
5. **Main risks as an arbitrage leg:** (a) ~98% of open markets are **deployer-settled with no trader dispute window** (tracker: 284 of 289 open, M); (b) **US and Ontario residents barred**, plus an unpublished "Excluded Persons" list for outcome markets (H, Terms of 2026-06-15); (c) numeric outcome fee is **not in the official docs** (HIP-4 page still says zero; stale); (d) PayBox reach is **partial**: HyperCore takes signed actions not EVM transaction proposals, and PayBox's own Hyperliquid plugin is read-only spot browsing.
6. **adapter_priority = P1.** Read adapter first (WS). Trading adapter second phase, behind a geo gate.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| Live `allMids` WS frame 2026-10-19 ~01:30Z contained 668 `#<enc>` keys = 334 outcomes x 2 sides (fixture `ws_allMids_outcome_keys.json`) | H |
| Live `l2Book` frames: 35 updates in 180 s for one market, e.g. times 1792373495055 (= 2026-10-19T01:31:35Z) onward (fixture `ws_l2Book_yes_no_pair.json`) | H |
| Live `outcomeMetaUpdates` stream delivered `outcomeSettled` 14247-14249 and `outcomeCreated` 14250 (BTC) and 14251 (HYPE) within a 25 s window (fixture `ws_outcomeMetaUpdates_events.json`) | H |
| DefiLlama `hyperliquid-outcomes`: daily volume > 0 on every one of 170 days 2026-05-02..2026-10-18; category "Prediction Market"; listed 2026-10-08 (`https://api.llama.fi/summary/dexs/hyperliquid-outcomes`) | H |
| DefiLlama adapter comment "HIP-4 outcome markets, live on mainnet since 2026-05-02" (`gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts`) | H |
| Terms of Use "Last updated on June 15, 2026" with dedicated outcome-market clauses 1.7/1.8 (`https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js`, read as text) | H |
| Official HIP-4 page still describes only the daily BTC recurring binary, says multi-outcome is "not part of the initial mainnet release" and "Fees are currently zero ... for initial testing": **undated and stale** on all three counts | H |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind (H):** on-chain CLOB, native to HyperCore (the Hyperliquid L1). "Outcomes are fully collateralized contracts that settle within a fixed range"; "does not involve leverage or liquidations". https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** each outcome has integer `outcome` and two sides 0/1 (`sideSpecs`, normally Yes/No). `encoding = 10*outcome + side`; coin `#<encoding>` (books/WS), token `+<encoding>` (balances), order asset id `100_000_000 + encoding`. Example: outcome 1, side 0 -> `#10`, `+10`, `100000010`.
- **Merged book (H, doc + live):** "Yes and No books for the same outcome are merged... a buy of Yes at p equals a sell of No at 1-p". Live check: Yes bid/ask 0.78708/0.78709; No bid/ask 0.21291/0.21292; Yes ask + No bid = 1.00000 (fixture `ws_l2Book_yes_no_pair.json`). So an aggregator needs **one** book per outcome (subscribe to side 0) and derives No by swapping sides at 1-p. Priority is price-side-time.
- **Payout (H):** Yes settles to `settleFraction` quote tokens, No to `1 - settleFraction`. Standalone outcomes can settle to any fraction in [0,1] (docs example "0.66"; scalar-capable); outcomes in a question must settle exactly 0 or 1 (hip-4-deployer-actions page, which carries a **"Testnet-only"** banner; mainnet parity M).
- **Questions / categorical (H):** a question = set of outcomes where exactly one settles Yes; one book per outcome; `negateOutcome`/`mergeQuestion` link them; every question has a protocol "fallback" outcome; up to 100 named outcomes per question (testnet doc).
- **Manual operations (H, exchange-endpoint):** `{"type":"userOutcome","splitOutcome"|"mergeOutcome"|"mergeQuestion"|"negateOutcome":{...}}` (split X quote -> X Yes + X No; merge reverses).
- **Price/size domain:** probabilities in (0,1), quote USDC, prices shown to 5 significant figures (live tick 1e-5 near 0.79), **integer share sizes** (live "875.0"). Tick, min order size/notional are **NOT FOUND** in official docs (searched: HIP-4 page, asset-ids, exchange-endpoint, contract-specifications, fees). Third-party claims of a $10 minimum are unverified (L).
- **Market identity strings (H):**
  - Protocol recurring: `name="Recurring"`, `description = class:priceBinary|underlying:BTC|expiry:20260526-0600|targetPrice:77363|period:1d`; or `class:priceBucket|...|priceThresholds:<lower>,<upper>|period:15m` (a 3-outcome question, `index:0/1/2`) (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot and .../trading/contract-specifications). At most one recurring series per (seriesType, underlying, period).
  - Deployer templates: `name="template:<id>"`, description `key:value|...`. **Live example (H):** outcome 14250, `name:"template:binaryPrice"`, `description:"perp:BTC|priceDescription:BTC-USDC perp mark|seconds:60|threshold:82444|time:20261019-0145"`, `sideSpecs:[{"name":"template:Yes"},{"name":"template:No"}]`, `quoteToken:"USDC"`, `venue:"out"`, `deployerFeeScale:"1.0"`. The `outcomeCreated` frame therefore carries quote token, deployer venue and fee scale.
  - Template text (H, docs example of `outcomeTemplates`): binaryPrice = "resolves to Yes if the {perp} price is above {threshold} at {time}... Settlement is according to the {seconds}-second TWAP of {priceDescription} price ending at {time}. If {perp} is delisted ... settlement price at delisting." Keywords: perp, priceDescription, seconds, threshold, time. policyRateDecision keywords: decisionDeadline, decisionLabel, institution, officialSource, policyMeasure, scheduledDecision.
- 28 approved mainnet templates (price x4, policy-rate x6, sports x11, awards x4, company x2, AI x1) per a tracker (M, https://liquidiction.xyz/hip4, 2026-10-19); the catalogue grows (18 in mid-September per TokenPost, M), so do not hard-code categories.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | HyperCore (Hyperliquid L1). Not an EVM chain; no ERC-20 contracts for outcomes documented. | H |
| HyperEVM | chain id 999. CoreWriter system contract `0x3333333333333333333333333333333333333333` forwards actions to HyperCore; action 1 = limit order (`uint32 asset`), action 17 = "Outcome operation" (Split/Merge/MergeQuestion/Negate). Whether action 1 accepts outcome asset ids (>= 100,000,000) is **NOT FOUND** (page silent). | H (facts) / NOT FOUND (outcome orders) |
| Quote / collateral | **USDC** (live `quoteToken:"USDC"` in `outcomeCreated`; docs `settledOutcome` sample `"quoteToken":"USDC"`). Older USDH retired: "USDH sunset is complete", canonical markets moved to USDC on 2026-06-20 (single guide, updated 2026-08-31). | H (USDC) / M (migration) |
| Funding in | Wallet-connected: "USDC deposits via Arbitrum only"; **minimum 5 USDC, below that is lost**. Email wallets: Arbitrum, Base, Ethereum, Polygon (via Across). CCTP preferred; legacy bridge `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` (Arbitrum) deprecated. Credited < 1 minute. | H (https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc ; .../for-developers/api/usdc) |
| Withdraw out | `withdraw3` action, signed EIP-712, no Arbitrum tx by the user; "funds arrive in 3-4 minutes". Fee not stated (NOT FOUND). | H |

---

## 4. Read API

- **Docs:** https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api ; machine index `.../llms.txt`; every page also serves raw markdown with a `.md` suffix. (H)
- **Base URLs (H):** REST `https://api.hyperliquid.xyz/info` and `/exchange` (POST only); WebSocket `wss://api.hyperliquid.xyz/ws`; testnet `api.hyperliquid-testnet.xyz`.
- **Auth:** none for market data. Limits are per IP. (H)
- **Rate limits (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits):** REST 1200 weight/min/IP; `l2Book`, `allMids`, `orderStatus`, `clearinghouseState`, `spotClearinghouseState` weight 2; other documented info requests weight 20 (so assume `outcomeMeta` = 20); `userRole` 60; exchange weight `1 + floor(batch/40)`. WebSocket: max 10 connections, 30 new connections/min, **1000 subscriptions**, 2000 messages sent/min, 100 inflight posts. Address-based action limits: 1 request per 1 USDC traded + 10,000 buffer; open-order cap 1000 (+1 per 5M USDC, max 5000).
- **Market discovery:**
  - REST `{"type":"outcomeMeta"}` -> `outcomes[]` `{outcome,name,description,sideSpecs[{name}]}` (+ `questions[]`; mainnet also `quoteToken`/`venue`/`deployerFeeScale` per the live WS spec, and a guide claims a top-level `feeScale`, M). **Not captured live** (POST). It returns no coin strings: compute them from `outcome` and side.
  - REST `{"type":"outcomeTemplates"}`, `{"type":"outcomeDeployerLimits","venue":...}`, `{"type":"settledOutcome","outcome":N}` -> `{spec{...,quoteToken}, settleFraction, details:"price:76876.9"}` (H, docs; not live).
  - WS `outcomeMetaUpdates` -> arrays of `outcomeCreated{outcome,name,description,sideSpecs,quoteToken,venue,deployerFeeScale}` | `outcomeSettled:n` | `questionUpdated` | `questionSettled:n` (H live). **No snapshot on subscribe** (ack only); events are bursty (zero events in a 9 min window). Bootstrap with REST `outcomeMeta`, then follow the stream, and reconcile against the `#` keys of `allMids`.
  - WS `allMids` (no params) already includes every outcome coin as `"#<enc>":"<mid>"` (H live). Cheap universe/liveness list; no titles.
- **Books / prices (H live):** WS `l2Book` `{"type":"l2Book","coin":"#132280"}` -> `{coin, time(ms), levels:[bids,asks]}`, each level `{px,sz,n}` strings, 20 levels per side (docs: 5 if `fast`); snapshots ~every 0.5-5 s when changed. WS `bbo` -> `{coin,time,bbo:[bid|null,ask|null]}` sent only on block changes. Because the book is merged, subscribe to side 0 only (No mirrors Yes exactly in my capture).
- **Trades (H live):** WS `trades` -> `[{coin,side:"B"|"A",px,sz,time,hash,tid,users:[buyer,seller]}]`; the same match appears once per matched order (same `hash`, distinct `tid`): dedupe on `(hash,tid)`.
- **Volume / open interest proxy (H live):** WS `activeAssetCtx` on a `#` coin returns channel `activeSpotAssetCtx` `{coin, ctx:{prevDayPx,dayNtlVlm,markPx,midPx,circulatingSupply,totalSupply,dayBaseVlm}}`. `circulatingSupply` of a Yes token = shares outstanding, each backed by $1, i.e. open-interest in dollars. **Yes and No coins report the same `dayBaseVlm` (shares) and `dayNtlVlm(Yes)+dayNtlVlm(No) = dayBaseVlm`**: never add both sides (fixture `ws_yes_no_ctx_check.json`).
- **Resolution data:** REST `settledOutcome`; WS `outcomeSettled`. A guide says settlement details are pruned from L1 state since 2026-08-14 (M): persist results on receipt.
- **Capacity:** one connection holds all ~334 `l2Book` subscriptions (limit 1000/IP).
- **Third-party wrappers (not for core):** pay-per-call x402 services exist in the PayBox catalogue (L; I made no call).
- **Reference implementation:** pmxt (`pmxt-dev/pmxt`, `core/src/exchanges/hyperliquid/`) already has a third-party adapter (M, not installed or executed).

Fixtures (all in `docs/research/fixtures/hyperliquid-hip-4-outcomes-native/`): `ws_allMids_outcome_keys.json`, `ws_outcomeMetaUpdates_events.json`, `ws_l2Book_yes_no_pair.json`, `ws_bbo_sample.json`, `ws_trades_sample_redacted.json` (counterparty wallets redacted), `ws_activeSpotAssetCtx_sample.json`, `ws_yes_no_ctx_check.json`, `ws_subscription_acks.json`, `derived_liquidity_ranking.json` (derived by me), `defillama_hyperliquid-outcomes_trimmed.json`, `http_get_info_405.txt`.

---

## 5. Trade path (programmatic)

- **Mechanism (H):** signed JSON actions to `POST https://api.hyperliquid.xyz/exchange`. Outcome orders use the normal `order` action: `a = 100_000_000 + 10*outcome + side`, `b` is-buy, `p` price string, `s` size string (integer shares), `r` reduce-only, `t` `{limit:{tif:"Alo"|"Ioc"|"Gtc"}}`, optional `c` cloid, `grouping:"na"`, optional `builder:{b:addr,f:tenths-of-bp}` (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint). Cancel `{type:"cancel",cancels:[{a,o}]}`. Outcome ops via `userOutcome` (section 2).
- **Signing (H partial):** the signing page confirms two schemes (L1 actions vs user-signed actions), says "use an SDK", that msgpack field order matters, lowercase addresses, and that a wrong signature returns an unrelated recovered signer. It does **not** describe the EIP-712 domains. From SDK knowledge and the earlier project note (M): L1 actions are msgpack-hashed into a "phantom agent" signed as EIP-712 (domain `Exchange`, chainId 1337); user-signed actions (`approveAgent`, `withdraw3`, `approveBuilderFee`) use EIP-712 with `signatureChainId`/`hyperliquidChain` fields (the `withdraw3` doc lists `signatureChainId, hyperliquidChain, destination, amount, time`, H).
- **Agent (API) wallets (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets):** a master account approves agent wallets with `approveAgent`; "API wallets are only used to sign"; account queries must use the master address. Nonces: 100 highest stored per signer, must be within (T-2 days, T+1 day); one agent key per process; do not reuse deregistered agent addresses (replay risk). Number/expiry limits: the page does not state them (the earlier note's "1 unnamed + 3 named, <= 180 days" is unverified, L).
- **Builder codes (H):** optional per-order fee; user must pre-approve a max fee with the main wallet (`approveBuilderFee`, max 10 approvals); caps 0.1% perps / 1% spot. The builder-codes page does not mention outcomes; the HIP-4 page says builders earn fees "on sell orders that specify their builder code".
- **Sandbox:** testnet exists; permissionless-deployer docs are testnet-only.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial.**

1. **No EVM transaction proposals for trading (H).** Orders are signed HyperCore actions, not EVM transactions. PayBox's chain catalogue lists Hyperliquid only as `eip155:999` "native HYPE" (https://docs.paybox.sh/reference/mcp-tools, `discover_tokens` text) which is HyperEVM, a different layer from where outcomes trade.
2. **PayBox's own Hyperliquid plugin is read-only spot browsing (H):** live `discover_plugins("hyperliquid")` -> official plugin `hyperliquid`, `enabled:false`; `get_contract` shows exactly three tools `hyperliquid_markets`, `hyperliquid_prices`, `hyperliquid_token`, all `readOnlyHint:true`; the markets tool says it "helps discover markets before a Hyperliquid trade tool exists". No outcome or order tool.
3. **Funding is reachable:** USDC on Arbitrum is the documented deposit rail and Arbitrum (42161) is in PayBox's chain set (M, `docs/research/06-paybox-platform.md`). The exact bridge/CCTP call from a PayBox wallet was not verified. 5 USDC minimum, below that is lost.
4. **Signing is reachable per request (H):** `request_wallet_sign` supports intents `message` (EIP-191), `typedData` (EIP-712), `transaction`, `authorization`, `raw` (pre-computed digest); an EVM MPC wallet "shares one address across every `eip155:*` chain"; credential `approval_mode` is `always_approve`, `iframe` or `autonomous`. So a PayBox EVM wallet could sign an `approveAgent` typed-data action, and orders as `typedData`/`raw` signatures over the phantom-agent digest that **our plugin must compute** (msgpack + keccak). Latency is a request/poll round trip per signature.
5. **Practical design (M):** one-time `approveAgent` signed through PayBox, then a locally held agent key signs orders at arbitrage speed. That puts a trade-capable (not withdraw-capable, M) key outside PayBox. Alternative: CoreWriter from a custom HyperEVM contract (orders are delayed on-chain; outcome asset support unconfirmed) - not recommended for v1.
6. **Geo gate required** (section 9).

---

## 7. Fees

- **Structure (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees):** "Outcome trading only charges fees when closing or settling, not when opening outcome positions." Minting (split): no fee. Normal trade where one side pays: both users get volume credit `fee_paying_px*sz`. Burning (merge): both or only taker pay. Settlement: each user's volume credit `settle_fraction*sz`. "Outcome trading does not support rebates"; would-be rebate earners pay zero as makers. Spot base tier (Tier 0): taker 0.070%, maker 0.040%.
- **Rate:** the official fees page gives **no numeric outcome rate and no date**. The HIP-4 page's "fees are currently zero ... initial testing" is stale. DefiLlama (H, adapter + methodology): "Hyperliquid charged no outcome fee of its own before 15 Aug 2026"; fees were 0 on 2026-08-14 and non-zero from 2026-08-15 ($81). An independent guide (M, single source) says the average outcome fee is **half of non-outcome spot fees** (about 0.035% taker at base tier) and that mainnet `outcomeMeta` carries a `feeScale`.
- **Per-deployer scaling (H, testnet-banner doc):** template instances carry `deployerFeeScale` in [0,10]; users pay `base * (scale + max(scale,1))`; the deployer receives the `scale` component, the protocol the rest. **Live observation (H):** both new `out`-venue outcomes carried `deployerFeeScale:"1.0"`, i.e. 2x base. The Block (2026-07-20) said deployers may set fees up to 50% (M).
- **Empirical all-in rate (M, my computation from DefiLlama fees / DefiLlama volume, 45 days 2026-09-03..2026-10-17):** median 14.7 bps, range 11.0-24.6 bps, aggregate 14.2 bps, last 7 days 12.4 bps; includes builder-code fees, based on halved volume. Use as a sanity band, not a formula.
- **Who pays:** the party closing/selling or holding through settlement; an opening buy is free. A buy-and-hold-to-expiry leg pays at settlement; a round trip pays on exit. Read each market's `deployerFeeScale` and the account's `userFees` live; never hard-code zero.
- **Other costs:** USDC in/out via Arbitrum/CCTP; builder fee if routed through a front-end; HyperEVM gas only on the CoreWriter route.

---

## 8. Resolution mechanism and dispute risk

1. **Protocol auto-settle (recurring series):** no oracle, no human. Yes iff `markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice`, linearly interpolated HyperCore mark price of the underlying perp (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications). Daily series settle 06:00 UTC (HIP-4 page, H).
2. **Validator vote (canonical markets):** "expected to be rare", ideally "fewer than 10 outcomes or questions per year" (The Block, 2026-07-20, M).
3. **Deployer-settled (permissionless, the large majority):** a deployer staking **500,000 HYPE locked six months** instantiates a validator-voted template and settles it (or an authorised sub-deployer does) via `settleOutcome`/`settleQuestion2` (The Block H-read of an M claim; deployer-actions doc, testnet banner). The stake "can be partially or fully taken away by validator vote" for poorly defined markets, incorrect settlement or failure to settle within one week. Templates are enforced on-chain with a `semanticRestriction`; `details` must be empty and the settle action must echo the outcome's name/description exactly.
   - **Live example:** the `out` venue's BTC/HYPE ladders settle on a **60-second TWAP of the perp mark** ending at `time` (template text, H), not the protocol's interpolated mark at expiry and not Binance/Chainlink/Coinbase spot: a basis-risk source against Polymarket/Kalshi/Limitless crypto markets.
   - **No trader-initiated dispute or challenge window** is documented; tracker FAQ agrees ("no escrowed challenge window", M). The Terms disclaim "erroneous outcome determination and disputed settlements" and state the Company "has no involvement in the execution, settlement or resolution" (H, Terms 1.2, 6.4). Reversal after a slash: NOT FOUND.
   - Concentration: 3 registered mainnet deployers; 284 of 289 open markets are third-party deployer-settled (M, tracker 2026-10-19 01:29Z); Outcome.xyz carried ~92% of external-venue volume since 2026-08-29 (M, TokenPost 2026-10-05).
4. **Timing:** automatic payout at settlement; deployer markets can lag (one-week slash threshold).

Arbitrage rule: treat protocol-settled recurring binaries as the only machine-checkable legs; for deployer templates compare rules text (TWAP window, reference price, delisting clause, tie-breaks) against the counter-venue before pairing.

---

## 9. Geo, ToS, automation (H, primary text)

Source: Terms of Use inside `https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js`, "Last updated on June 15, 2026".

- 1.6: Interface "not available to 'Restricted Persons'": residents/entities in "the United States of America or Ontario, Canada", sanctioned jurisdictions, and citizens of those territories wherever located.
- 1.7-1.8: outcome markets are additionally unavailable to "Excluded Persons" (jurisdictions "that we designate from time to time", or where access "would require us or any third party to obtain any license"); they "may implement technical, operational or other measures designed to block access to the outcome markets tab". The designated list is **NOT FOUND** (not in the Terms), so a plugin cannot hard-code it.
- 1.9 / circumvention clause: VPNs/proxies to conceal location are prohibited and the user warrants not being a Restricted/Excluded Person.
- 3.1.8 "Automated or High-Frequency Abuses": bots/scripts "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions, or disrupt" the system. Not a blanket bot ban; the API/SDKs are the documented automation route. These Terms govern the Interface; whether they bind direct API use is a legal question I did not resolve.
- Reading public market data over API/WS needs no account; geo clauses attach to using the Interface and trading.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Daily volume (DefiLlama, each trade counted once) | 10-11 $3.72M; 10-12 $2.99M; 10-13 $2.70M; 10-14 $2.08M; 10-15 $1.90M; 10-16 $2.26M; 10-17 $2.85M; **10-18 $3.13M** | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| 7d / 30d / all-time | $17.9M / $47.0M / $261.1M; peak day $8.42M on 2026-06-27; monthly: May $47.2M, Jun $74.1M, Jul $58.5M, Aug $11.5M, Sep $39.8M, Oct 1-18 $30.0M | same (monthly sums computed by me) | H / M |
| Tracker | 24h $3.49M (190,417 trades, 2,003 traders); 7d $22.1M; 30d $59.9M; all-time $350.6M; 289 open markets; 12,677 deployed / 12,469 settled since 2026-05-02 | https://liquidiction.xyz/hip4/stats, snapshot 2026-10-19 01:29Z | M (definition differs from DefiLlama, unresolved) |
| Rolling 24h from live WS (Yes-priced notional) | **$2.50M** over 331 Yes coins; matched shares at $1 face **5.55M**; 184 coins with volume, 60 with > $10k, 13 with > $50k, 4 with > $100k | my sweep ~01:31Z (fixture `derived_liquidity_ranking.json`) | H data / M interpretation |
| Open interest proxy | sum of Yes `circulatingSupply` = 2.66M shares = **~$2.66M** locked collateral; median outcome has 925 shares | same | M (derived) |
| Top books | `#36000` $245k 24h (60.8k shares); `#132280` $213k; `#132130` $163k; `#131120` $113k | same | H |
| Depth/spread (live) | `#132280` bid 0.78708 / ask 0.78709 (one tick wide); top-of-book sizes 875 / 1331 shares; 20 levels per side | `ws_l2Book_yes_no_pair.json` 2026-10-19 01:31Z | H |
| Median spread, 25 most active books | 0.29 cents | TokenPost, 2026-10-05 | M |
| Incentives | $1M rewards programme, $273,409 paid to 2,487 wallets by 2026-10-05 (~$7,400/day); part of volume may be reward-driven | TokenPost | M |
| Fee revenue | $3,355 on 2026-10-17 | https://api.llama.fi/summary/fees/hyperliquid-outcomes | H |

Reading: about $2-3.5M/day and ~$2.7M collateral, spread over ~330 outcomes; a few dozen liquid books, the rest thin. Hourly/15-minute BTC and HYPE ladders and the Champions League/World Cup futures are where size sits (M). Third-party "$6.26M daily" (The Block, from the hint) and "$80M/day" claims are not reproducible against DefiLlama/WS (L).

---

## 11. Event categories and cross-venue overlap

| Category on HL | Evidence | Overlaps | Arb quality |
|---|---|---|---|
| **Crypto price** (BTC/ETH/SOL/HYPE ladders; `binaryPrice`, `priceBucket`, touch/scalar templates) | Live `outcomeCreated`: BTC and HYPE `binaryPrice` with expiry ~15 min after creation, 60 s TWAP (H); recurring daily BTC 06:00 UTC (H doc) | Polymarket, Kalshi, Limitless, Predict.fun, Opinion crypto ladders | Highest overlap; align expiry timestamp, reference price (HL perp mark TWAP vs spot index) |
| **Sports** (NFL, NBA, soccer incl. Champions League, LoL, World Cup winner) | 11 sports templates; tracker lists these open markets; hint reports NFL games (M) | Polymarket, Kalshi, SX Bet, Azuro, Smarkets | Good for outright winners/futures; match markets are deployer-settled |
| **Macro / central banks** | `policyRateDecision` etc. (6 templates, H) | Kalshi, Polymarket | Good if same official source (FOMC) |
| Stocks/commodities/indices | price templates on HIP-3/index perps (M) | Kalshi, Polymarket | Partial |
| Awards, IPO, AI models, culture | `award*`, `companyIpo*`, `aiModelHeadToHead` (M) | Polymarket | Thin, rules-text risk |

Category shares of 30-day volume to ~2026-10-05: soccer + American football + esports 45%, crypto price 42%, stocks/commodities 7%, Fed 6% (TokenPost, M).

---

## 12. Shared liquidity?

**No: an independent leg.** Hyperliquid's HyperCore book is the single venue for all outcome trading. Third-party front-ends (Outcome.xyz and others) route into the same books via builder codes, a fee mechanism on the same book (H: builder-codes page); DefiLlama books them as separate "Interface" lines whose volume is attribution of the same fills, so never add them to the base figure (M). I found no evidence that Hyperliquid books mirror Polymarket, Kalshi or any other venue (NOT FOUND: searched docs, DefiLlama adapters, tracker). HL perps (including HIP-3 index perps) are a hedge instrument for crypto/stock outcomes, not shared liquidity.

---

## 13. Adapter spec for the aggregator

- **Bootstrap:** `POST /info {"type":"outcomeMeta"}` at start and every ~5 min as a safety net (weight 20); parse `name` (`Recurring` vs `template:<id>`), `description` key/values, `questions`, `quoteToken`, `venue`, `deployerFeeScale`. Then WS `outcomeMetaUpdates`. Reconcile with the `#` keys of `allMids`. Coin id = `#` + `10*outcome + side`.
- **Quotes:** WS `l2Book` on Yes coin (side 0) per live outcome; derive No: `bid_no = 1 - ask_yes`, `ask_no = 1 - bid_yes`. Strings with 5 significant figures; integer share sizes; each share pays $1. Rank/filter with `activeAssetCtx` (`dayBaseVlm`, `circulatingSupply`); do not sum Yes and No volumes.
- **Resolution metadata for the market linker:** tier (recurring / validator / deployer + `venue`), expiry (`YYYYMMDD-HHMM` UTC for recurring; `time` for templates), underlying/perp, threshold(s), TWAP `seconds`, template id, quote token, `deployerFeeScale`.
- **Fee model:** fee on close/settle only: `base_rate * (scale + max(scale,1))`; read `userFees`/`outcomeMeta` live.
- **Settled results:** call `settledOutcome` on each `outcomeSettled`; persist (L1 pruning, M).
- **Trading (phase 2):** SDK or hand-rolled L1 signing; asset id `100_000_000 + 10*outcome + side`; start with an approved agent wallet, geo gate in front.
- **Quirks:** historical orders can show primary and dual orders separately when an order both matches and rests (HIP-4 page, "will be improved in a future network upgrade"); `trades` repeats a match per order; WS idle timeout ~60 s (send `{"method":"ping"}`) and routine disconnects (timeouts doc, earlier note, M).
- **Do not rely on** tracker pages or x402 wrappers for core data.

---

## 14. Priority

**adapter_priority = P1.** Independent liquidity, keyless documented WS/REST API, tight books in the top ~25 markets, real overlap with crypto ladders, central-bank decisions and sports futures. Not P0: liquidity is a few $M/day with ~$2.7M collateral; nearly all markets are deployer-settled with no dispute process; US/Ontario barred plus an unpublished excluded-jurisdictions list; numeric fee undocumented; PayBox reach only partial.

---

## 15. NOT FOUND / open questions

- Live `outcomeMeta` response (titles, descriptions, questions, `feeScale`) - POST-only; not called (searched: docs, WS `outcomeMetaUpdates` sends no snapshot).
- Existence of the hint's `txyz` and `skew` venue tags and the NFL/ZEC markets (only `out` observed here).
- Numeric outcome fee rate in official docs (searched: fees page, HIP-4 page, deployer-actions, builder-codes).
- Outcome tick size, minimum order size/notional, position limits (searched: HIP-4, asset-ids, exchange-endpoint, contract-specifications, fees).
- Public list of "Excluded Persons" jurisdictions (searched: Terms JS chunk).
- Dispute/reversal process for deployer-settled markets (searched: deployer-actions, Terms, tracker FAQ, The Block).
- Whether CoreWriter action 1 can trade outcome asset ids; whether outcome tokens can move to HyperEVM (searched: interacting-with-hypercore).
- API wallet count/expiry limits (nonces page says only "The wallet expires").
- EIP-712 domain details for L1 actions on the signing page (page is thin; relies on SDK knowledge).
- Withdrawal fee (`withdraw3` page silent).
- Reconciling tracker volume ($3.49M/24h) with DefiLlama ($3.13M 2026-10-18).
- No fresh web search possible (budget exhausted); announcement text for the 2026-08-14/15 fee change not read first-hand.

---

## 16. Suspicious content

None addressed to AI agents. Notes: gitbook pages begin with a navigation line pointing to `llms.txt` (benign index hint; used by my choice); the guide site carries referral calls to action aimed at humans; x402 wrapper descriptions in the PayBox catalogue are marketing text (not used).

---

## 17. Sources

Primary (H):
- HIP-4 page: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- Asset ids: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- Info endpoint (spot/outcomes): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot
- Exchange endpoint: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
- HIP-4 deployer actions (testnet-only banner): https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions
- Contract specifications: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications
- Fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees ; builder codes: .../trading/builder-codes
- Rate limits: .../for-developers/api/rate-limits-and-user-limits ; signing: .../api/signing ; nonces/API wallets: .../api/nonces-and-api-wallets
- WebSocket subscriptions: .../for-developers/api/websocket/subscriptions
- HyperEVM CoreWriter: .../for-developers/hyperevm/interacting-with-hypercore
- USDC / deposits / aligned quote assets: .../for-developers/api/usdc ; .../support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc ; .../hypercore/aligned-quote-assets
- Docs index: https://hyperliquid.gitbook.io/hyperliquid-docs/llms.txt
- Terms of Use text: https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (last updated 2026-06-15)
- Live WS: `wss://api.hyperliquid.xyz/ws` (2026-10-19 01:29-01:45Z: `allMids`, `outcomeMetaUpdates`, `activeAssetCtx` x~345, `l2Book`, `bbo`, `trades`); `GET https://api.hyperliquid.xyz/info` -> 405
- DefiLlama: https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; https://api.llama.fi/summary/fees/hyperliquid-outcomes ; adapter `gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts`
- PayBox: docs https://docs.paybox.sh/reference/mcp-tools ; live `discover_plugins("hyperliquid")` and `get_contract paybox://plugins/hyperliquid` (2026-10-19)

Secondary (M/L):
- Tracker: https://liquidiction.xyz/hip4 ; https://liquidiction.xyz/hip4/stats (snapshot 2026-10-19 01:29Z)
- TokenPost, 2026-10-05: https://www.tokenpost.com/news/investing/27723
- The Block, 2026-07-20: https://www.theblock.co/post/408875/hyperliquid-hip-4-permissionless-deployment
- Hyperliquid Guide (independent; updated 2026-08-31): https://hyperliquidguide.com/ecosystem/hip-4-outcome-trading
- Earlier project note (lead): `docs/research/venues/hyperliquid-outcomes-hip-4.md`; `docs/research/06-paybox-platform.md`

## 18. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1` (curl `-A`, and the WS handshake in a stdlib script). Scripts were grepped for `@` and personal names before running (no hits). Fixtures were scanned for emails, names and 40-hex wallet addresses (none; trade counterparties redacted). No user wallet address was read or written. The only PayBox calls were read-only plugin discovery and contract reads.
