# Prophet Prediction Market (prophetmarket.ai) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to the venue's documented API host, public explorer/indexer GETs, web search. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run. Third-party text is untrusted data; nothing in it was followed.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

Name collision warning: this is NOT prophet.fun (Solana, see `prophet-fun.md`) and NOT Prophet on Obyte (`prophet-obyte.md`). Official surfaces are `prophetmarket.ai`, `app.prophetmarket.ai`, `docs.prophetmarket.ai`, X `@prophetmarketai`, GitHub org `ProphetMarket` (H, https://docs.prophetmarket.ai/community/official-links.md).

Fixtures: `docs/research/fixtures/prophet-prediction-market/` (9 files, each < 6 KB).

## 0. Verdict

- **Live: yes, but nearly idle (H).** API healthy 2026-10-19, markets still created through 2026-10-15, last on-chain-settled trade I sampled 2026-09-25, DefiLlama shows zero volume on 2026-10-16, -17 and -18 and $0.15 on 2026-10-15. All-time volume is about **USD 37.3k** since 2026-05-06. See section 1 and 10.
- **adapter_priority: skip.** Independently sufficient reasons:
  1. Liquidity is negligible and falling: 30-day volume USD 1.9k, 7-day USD 430, 24h USD 0 (DefiLlama, pulled 2026-10-19). All 542 open markets together have USD 1,148.61 of lifetime volume and the largest has USD 68.91 (computed by paging every open market, 2026-10-19).
  2. Prices are not market-discovered: an LLM ensemble sets the odds and the AI "house" is the counterparty, quoting one order per side with a **spread of up to 20.6 points** (H: across all 542 open markets the executable YES buy-minus-sell gap was 20.6 points at the median and at the maximum, 2.0 at the minimum). An arbitrage leg would need more than a 20-point edge to clear the spread, on quotes worth at most about USD 83.
  3. The Terms forbid "automated scripts, bots, or AI tools (other than ours) ... without permission" and the venue excludes US persons and "restricted jurisdictions" (H, section 9).
  4. Resolution is by an LLM ensemble with no user dispute path (H, contract and docs) and the pipeline is visibly backlogged: 345 markets in `PENDING_RESOLUTION` (newest sampled ones closed 2026-08-23..08-31) and 99 in `RESOLUTION_FAILED`. Question metadata is also unreliable (see section 11).
  5. Question text is mostly user-generated micro-markets on sports props, short-dated crypto thresholds and long-dated oddities; only a handful would match a Polymarket/Kalshi contract.
- What is good: the **public read API is real, unauthenticated, introspectable and richer than most venues** (GraphQL with order book, trades, price history, per-market AI model votes). If a signal-only feed is ever wanted, a read-only poller is about half a day of work. Keep it as an optional P2 curiosity; do not spend v1 time on it.
- Docs and live schema disagree in many places (section 4). Code against introspection, not the docs.

## 1. Liveness evidence (all H unless marked)

| Check | Result | Source |
|---|---|---|
| App health | `{"status":"healthy","go":true,"nextjs":true}`, 2026-10-19 | https://app.prophetmarket.ai/health |
| API discovery | `{"graphql":"/graphql","health":"/health","service":"Prophet API","version":"0.1.0"}` | https://app.prophetmarket.ai/api/ (`/api` 301s to `/api/`) |
| Chain sync | `synced:true`, 0 blocks behind, `chainHead` 95,604,795 at fetch time | fixture `07-config-and-chain-status.json` |
| Docs site | HTTP 200; GitBook; 63 markdown pages in `llms.txt` | https://docs.prophetmarket.ai/llms.txt |
| Newest market created | 2026-10-15T03:19Z (sports prop); 100 newest resolved markets created 2026-10-10..2026-10-15, about 20-30 per day, and the newest market of any status I found was created 2026-10-15T03:19Z | live `markets(sort:CREATED_AT_DESC, filter:{status:RESOLVED})` |
| Last sampled settled trade | 2026-09-25T12:20Z with `settlementTxHash`, `settlementBlock` 94,422,474 | fixture `04-trades.json` |
| DefiLlama volume | 24h $0; 7d $429.92; 30d $1,927.27; all-time $37,262.66; first non-zero day 2026-05-06; last non-zero day 2026-10-15 ($0.15) | https://api.llama.fi/summary/dexs/prophet-prediction-market (pulled 2026-10-19 ~00:47 UTC) |
| DefiLlama TVL | Listed (id 8334, category "Prediction Market", chain Polygon) but TVL series is empty | https://api.llama.fi/protocol/prophet-prediction-market |
| Launch | Press release 2026-05-06: "live $10,000 trading tranche", Tranche 1 scheduled to run through 2026-05-08; sponsored/commissioned release, not independent reporting | https://cryptobriefing.com/prophet-launches-ai-powered-prediction-market-with-live-10000-trading-tranche/ (M for the framing; GlobeNewswire original returned 403 to WebFetch) |
| Contract on Polygon | `ProphetCTFExchange` `0x127aD3A6e55EbBDaecC0eaeb12615879611e1839`, Sourcify exact match (verified 2026-06-20), deployed in block 86,244,025; Polygonscan shows the creator label `alphagrowthdeployer.eth`, "170 days ago" | https://sourcify.dev/server/v2/contract/137/0x127aD3A6e55EbBDaecC0eaeb12615879611e1839 ; https://polygonscan.com/address/0x127aD3A6e55EbBDaecC0eaeb12615879611e1839 |
| Per-contract activity | NOT FOUND. Blockscout answered with a Cloudflare challenge (not worked around); Etherscan V2 needs a key; Polygonscan tx table is JS-loaded. | n/a |

Trajectory (DefiLlama monthly sums, M derived from the daily series): 2026-05 $1,968; 2026-06 $14,382 (World Cup / NHL final / FOMC markets); 2026-07 $9,739; 2026-08 $8,600; 2026-09 $1,442; 2026-10 to the 18th $1,131. Peak day 2026-06-12 $2,930.

## 2. Kind and market model

- **Kind:** on-chain-settled central limit order book (CLOB) on a **fork/wrapper of the Polymarket CTF Exchange**, with an **AI "house" as the main liquidity counterparty** and an LLM ensemble that prices every new market. Matching is off-chain and operator-submitted. (H: https://docs.prophetmarket.ai/get-started/api/prices-and-order-book.md says "Prophet uses a Central Limit Order Book (CLOB)"; https://github.com/ProphetMarket/lp-vaults README "Prophet runs a CLOB prediction market built on top of the Polymarket CTF Exchange"; Terms: "users trade directly against the AI".)
- **Binary only.** Every market is a Yes/No question with `resolutionRules` text and a `resolutionDate`; the oracle contract only accepts 2-slot conditions and payout vectors `[1,0]`, `[0,1]`, `[1,1]` (void). No categorical, no scalar. (H: https://docs.prophetmarket.ai/core-concepts/markets.md; `Resolution.sol` in https://github.com/ProphetMarket/contracts)
- **Tokenisation:** Gnosis Conditional Tokens (ERC-1155) shares, `$1 = 1 YES + 1 NO`. Each market exposes `conditionId`, `yesPositionId`, `noPositionId` (decimal uint256 token IDs) in the API (fixture `02-markets-open-top3.json`). Shares are fungible per market; the chain does not record cost basis, which is why a void pays 50c per share (H: https://docs.prophetmarket.ai/cancellation.md).
- **Price quoting:** integer basis points (0-10000), money in integer cents, shares as floats. The API gives a per-side executable `quote.{yes,no}.{buy,sell}.{displayBps,orderPriceBps}` plus `probabilityYesBps/probabilityNoBps` (the AI/mid estimate). YES and NO quotes do not sum to 10000. (H: https://docs.prophetmarket.ai/api/conventions.md plus live schema.)
- **Market creation is permissionless for depositors**: write a question and a resolution date and the ensemble prices it "typically in under thirty seconds" (H, https://docs.prophetmarket.ai/core-concepts/markets.md). Live data confirms thousands of tiny user-generated markets: 542 `OPEN`, 17,835 resolved, 1,752 cancelled (see section 10).
- **LP vaults (not live as far as I can tell):** `ProphetMarket/lp-vaults` implements per-market Uniswap-v3-style concentrated-liquidity vaults so outside LPs can pool USDC, with "the platform pays LP income off-chain". Mainnet deployment record is blank in the repo's DEPLOYMENT.md and I found no mainnet vault factory address. (H README; M for "not live".)

## 3. Chains, collateral, contracts

- **Chain:** Polygon PoS (chain ID 137) only (H: https://docs.prophetmarket.ai/your-wallet/wallet-overview.md "Polygon - All positions and settlement"). Testnet: Polygon Amoy 80002.
- **Collateral:** native Circle USDC on Polygon `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` ("Do not use the bridged USDC.e") (H: https://github.com/ProphetMarket/lp-vaults/blob/master/DEPLOYMENT.md section 2).
- **Contracts, Polygon mainnet (H, same file):**
  - ProphetCTFExchange `0x127aD3A6e55EbBDaecC0eaeb12615879611e1839` (EIP-712 domain name "Prophet CTF Exchange", version "1"; H from `ProphetCTFExchange.sol`)
  - Gnosis ConditionalTokens `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (M: I recognise this as the same CTF contract Polymarket uses on Polygon, but Prophet's conditions have a different oracle and question IDs, so tokens are not interchangeable with Polymarket's)
  - Poly Safe factory `0xD0d6655B69d5589402593a854836bbe5305ab09B`, Safe master copy `0x0b71A0e839474D7eCF2ED1546fBB1D0603D19760`
  - Resolution (AI oracle) contract: mainnet address NOT FOUND (searched: contracts repo README/DEPLOY_TESTNET.md, lp-vaults DEPLOYMENT.md, docs). Source: `ProphetMarket/contracts/src/Resolution.sol`.
  - Older exchange `0xe97fe5338f70c4e82a5292b274ad16d87799c476` is listed as replaced (H, lp-vaults DEPLOYMENT.md).
- **User account model:** each user has a **1-of-1 Gnosis Safe** on Polygon owned by their signing key (Privy embedded wallet for email/Google login, or an external EOA). USDC and shares sit in the Safe, not at the signing EOA address; deposits must go to the Safe address (H: https://docs.prophetmarket.ai/your-wallet/wallet-overview.md).
- **Funding paths:** direct native-USDC transfer on Polygon to the Safe, or a LiFi cross-chain route into the Safe (H: https://docs.prophetmarket.ai/your-wallet/deposits.md). Withdrawals are Polygon-only, USDC-only (H: .../withdrawals.md).
- **Gas:** Prophet (or Privy's paymaster) sponsors Polygon gas for user actions (H: docs fees page; Terms s.2 and s.9).
- **Audits (files only, not read):** Failsafe "prophet-markets-security-assessment-v1.pdf" and Hashlock "audit-report-v1.pdf" in `ProphetMarket/contracts/audits`; "NM_0986_Prophet.pdf" in lp-vaults; ChainSecurity audit of the upstream Polymarket exchange in the ctf-exchange fork. DefiLlama lists `audits: "0"`. (H for existence; contents NOT READ, no PDF tooling in this session.)

## 4. Read API

**Official, public, unauthenticated for market data. GraphQL, introspection on.**

- Docs: https://docs.prophetmarket.ai/api/overview.md (auth/market/price pages under `/get-started/api/*.md` have content; the same-named pages under `/api/*.md` are mostly empty stubs). Playground: https://app.prophetmarket.ai/api/playground (HTTP 200).
- Endpoint: `https://app.prophetmarket.ai/graphql`. Docs show `POST`; **`GET /graphql?query=...&variables=...` also works for queries** (H, all fixtures were fetched with GET). A GET with no query returns HTTP 422 `no operation provided`.
- WebSocket: `wss://app.prophetmarket.ai/graphql`, sub-protocol `graphql-transport-ws` (H: HTTP/1.1 upgrade returned `101 Switching Protocols` with that sub-protocol; I did not subscribe). Docs say `graphql-ws`.
- Auth for reads: none. Protected fields return HTTP 200 with `errors:[{message:"UNAUTHORIZED"}]` and `data:null` (H, docs; not exercised).
- Rate limits: none documented ("No rate limits are documented, and none were observable in testing"); dozens of GETs from one IP raised no limit. Order placement has an undocumented cooldown (H, https://docs.prophetmarket.ai/reference/limits-and-guardrails.md).
- Errors: HTTP 200 + `errors[]`; live validation errors do carry `extensions.code` (docs say they do not).
- Schema size (live introspection): 39 queries, 35 mutations, 9 subscriptions (docs say 33/30/9). Fixture `09-schema-root-fields.json`.

Key public queries (live-schema names; types verified by introspection):

| Need | Query | Notes |
|---|---|---|
| Catalog | `markets(input:{first,after,filter:{status,statusIn,categorySlug,topicSlug,search,resolvingBefore,resolvingAfter,creatorId,maxPriceBps},sort})` | Relay cursor pagination, `totalCount`. Sort: `VOLUME_DESC` (tier-ranked, not strictly by volume), `CREATED_AT_*`, `RESOLUTION_DATE_*`, `FOR_YOU`. Page size 100 worked. |
| One market | `market(id:ID!)`, `marketBySlug(slug)` | fields incl. `question`, `resolutionRules`, `resolutionDate`, `status`, `probabilityYesBps`, `quote`, `volumeCents`, `isLiquid`, `conditionId`, `yesPositionId`, `noPositionId`, `category`, `topics`, `similarMarkets` |
| Categories | `categories{name slug marketCount totalVolumeCents}`, `topicsByCategory(categorySlug)` | 12 categories |
| Book | `orderBook(marketId:ID!, outcome:BetOutcome!, depth:Int)` | `bids/asks[{priceBps shares orderCount}]`, `bestBidBps bestAskBps spreadBps midpointBps lastTradePriceBps`. One call per outcome. |
| Limits | `marketBetLimits(marketId)` -> `{yes,no}{maxBetCents currentOddsBps}`; `bettingConfig{minBetCents maxInitialBetCents betPresets}`; `marketConfig{maxQuestionLength maxExposurePerMarketCents maxBetPerMarketCents}` | |
| Trades | `trades(marketId:ID!, outcome, first, after)` -> `{id outcome priceBps shares valueCents isMaker createdAt onChainSettled settlementTxHash settlementBlock failureReason}` | anonymous (no trader id) |
| History | `priceHistory(marketId:ID!, since:Time!)` -> `{yesPriceBps noPriceBps source createdAt}` | |
| Resolution | `resolutionEvent(marketId)`, `resolutionTransparency(marketId)` | per-model votes with `model`, `vote`, `confidence`, `reasoning`; `reportPayoutsTxHash`, `resolutionContractTxHash`; `ipfsCid` was null in my sample |
| Health | `health`, `chainSyncStatus{synced mainWorkerBlocksBehind usdcWorkerBlocksBehind chainHead}`, `geoCheck{country blocked}` (not called; reveals caller IP country) | |
| Extras | `leaderboard`, `traderScorecard`, `traderByUsername`, `lifiSupportedChains/Tokens` | not explored |

Subscriptions (live schema): `marketPriceUpdated`, `orderBookUpdated`, `tradeExecuted`, `marketCreated` public per docs; `orderUpdated`, `balanceUpdated`, `settlementUpdated`, `viewerLifiTransferUpdates`, `mePendingOddsSessionUpdates` account-scoped. Docs list different names for the authenticated ones (`userOrderUpdated` etc.).

**Docs vs live-schema drift (H, introspection 2026-10-19). Code against the schema:**

| Docs say | Live schema |
|---|---|
| `Market.yesPriceBps`, `noPriceBps` | not present; use `probabilityYesBps/NoBps` and `quote.*` |
| `bettingConfig.spreadBps` ("2000 for 20%") | not present |
| `orderBook(marketId: String!)`, levels with `amountCents` | `marketId: ID!`, `outcome: BetOutcome!` required, levels carry `shares` (float) |
| `marketBetLimits{minBetCents maxBetCents}` | returns `{yes{maxBetCents currentOddsBps} no{...}}` |
| `trades` node `side`, `amountCents` | node has `outcome`, `shares`, `valueCents` |
| `priceHistory{timestamp priceBps}` | `{yesPriceBps noPriceBps source createdAt}` |
| `resolutionTransparency{voteBreakdown{yes no uncertain} modelVotes{modelName} blockchainTxHash}` | `voteBreakdown` is a String ("YES: 0, NO: 4, UNCERTAIN: 0"), `modelVotes{model}`, `reportPayoutsTxHash`, `resolutionContractTxHash` |
| `MarketFilter.resolvesAfter/Before` | `resolvingAfter/Before`, plus `statusIn`, `maxPriceBps` |
| `resolutionEvent.outcome` in `RESOLVED_YES/NO/CANCELLED` | `resolutionEvent.outcome` returned `"NO"` (enum `BetOutcome`); `resolutionTransparency.outcome` returned `"RESOLVED_NO"` |

Data-quality oddities seen in one sample (fixture `05`): the 6 listed `modelVotes` (minimax-m2.7, mistral-small-3.2, claude-sonnet-4.6, grok-4.3, gpt-5.4, gemini-2.5-pro, all with the `:online` suffix) conflict with `voteBreakdown` "NO: 4". And `isLiquid` is true for exactly 1 of 542 open markets (meaning undocumented).

Units pitfall: the 12 category `totalVolumeCents` values sum to 139,521 (about USD 1,395), while summing `volumeCents` over all 542 open markets gives USD 1,148.61 and DefiLlama's all-time on-chain volume is USD 37.3k. The three measure different scopes (the category figure's scope is NOT FOUND). Use per-market `volumeCents`.

## 5. Trade path

- **Programmatic trading exists in principle but is account-gated, Privy-bootstrapped and contractually restricted.** (H: https://docs.prophetmarket.ai/get-started/api/authentication.md)
  1. Session token (from signing in to the app via Privy), sent in the `Authorization` header.
  2. Optional HMAC credentials for "scripts, bots, server-side integrations": `generateApiChallenge` -> sign EIP-712 typed data -> `registerApiCredentials(signature, nonce, timestamp)` -> `{apiKey, apiSecret}` (secret shown once). "Both calls require a valid session token to bootstrap the credentials." How the HMAC key is then presented (header names, signing string) is NOT FOUND (searched: auth page, overview, conventions, FAQ).
  3. Simple orders: `placeBet` / `placeOrder` need a verified email and balance (server-side flow). Settled orders: `orderParams(marketId, outcome, side, amountCents, priceBps)` -> sign EIP-712 -> `submitSignedOrder`; `cancelOrder` exists.
  4. Market creation: `initiateMarket` -> `startOddsCalculation` -> `marketCreationOrderParams` -> `createMarketWithBet`.
  5. Wallet ops: `provisionWallet`, `relaySafeDeployment`, `relaySafeTransaction`, `executeWithdrawal` (+ OTP mutations), `claimMarketPayout`.
- **On-chain order format (H, `ProphetMarket/ctf-exchange` `OrderStructs.sol`):** Polymarket-style `Order{salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration, nonce, feeRateBps, side, signatureType, signature}`; signature types EOA / POLY_PROXY / POLY_GNOSIS_SAFE / POLY_1271. For a Safe user the maker is the Safe and the signer is the owner EOA. EIP-712 domain: name "Prophet CTF Exchange", version "1", chainId 137, verifyingContract the exchange.
- **Matching is operator-only:** `fillOrder`, `fillOrders`, `matchOrders` are `onlyOperator`; the source states "OPERATOR TRUST ASSUMPTION ... Users should be aware that the operator can selectively execute or withhold fills" (H, `ProphetCTFExchange.sol`). So there is no permissionless on-chain way to hit the book; everything flows through Prophet's server. Split/merge/redeem on the CTF are separate, but the order book is not.
- Order size limits: `marketBetLimits` on the sampled open market: max USD 83.35 (YES) / 75.33 (NO). `marketConfig.maxBetPerMarketCents`=10 and `maxExposurePerMarketCents`=30 look like tiny global defaults (meaning of the unit/scope NOT FOUND).

## 6. PayBox reachability

**partial (M, reasoned from `docs/research/06-paybox-platform.md` and the contracts; nothing was executed).**

- Technically favourable: Polygon (137) is in PayBox's chain catalog; an EVM PayBox wallet "shares one address across every eip155 chain"; `request_wallet_sign` can produce EIP-712 `typedData` signatures with no domain/chainId allowlist documented; native USDC can be sent to the user's Safe with a normal Polygon transfer; the order is a plain EOA-signed EIP-712 struct (no smart-account wrapper needed, unlike XO's Kernel scheme).
- Blocking or unknown:
  1. **Bootstrap needs a Prophet/Privy session** and a verified email. A programmatic wallet login path (e.g. SIWE without the Privy SDK) is NOT FOUND (searched: auth page, mutations list shows only `registerWithPrivy`).
  2. The Safe is a separate contract address; it must be deployed through Prophet's `relaySafeDeployment` before funds are sent, and the signer EOA address is not the deposit address.
  3. Execution is operator-matched by Prophet; no PayBox transaction proposal can place an order on-chain by itself.
  4. Terms prohibit bots without permission; US persons excluded. Passkey/approval behaviour of `request_wallet_sign` under autonomous grants is unresolved (see platform notes).
  5. Value: orders worth at most about USD 83 at a ~20-point spread. Not worth the engineering or the signing-oracle exposure.
- A PayBox plugin is not recommended here.

## 7. Fees

- **No separate commission. The spread is the revenue** (H: https://docs.prophetmarket.ai/reference/fees-spread-and-gas.md "Prophet does not charge a separate commission line. The cost of trading is the spread ... currently around twenty percent ... the rate may be adjusted depending on the risk profile of a market"). The Terms say "Prophet does not charge trading fees on the core process (zero-sum design)" (H, Terms s.9), which is consistent only if "fee" excludes the spread.
- **Measured spread is capped near 20.6 points and narrower at the extremes** (H data, M inference). Paging all 542 open markets: executable YES spread (`quote.yes.buy.orderPriceBps - quote.yes.sell.orderPriceBps`) min 199, median 2060, max 2060 bps. Example: on `7852ff9a-...` (YES mid about 37%) bid 27.41 / ask 47.01 = 19.6 points (`spreadBps` 1960; NO side 52.99 / 72.59, also 1960). Buying YES at the ask and NO at the ask costs 119.6 cents for a 100-cent payoff; selling both at the bids yields 80.4 cents, so there is no internal complete-set arbitrage. On a 95% market the executable spread was about 3 points and on a 2-3% market about 2 points, so it shrinks toward the price extremes while capping at about 20.6 points.
- Order struct has `feeRateBps` (contract max 1000 = 10%); the rate Prophet actually signs into orders is NOT FOUND (trade records carry no fee field).
- Who pays: trader pays the spread; Prophet pays Polygon gas; the user pays LiFi bridging fees and source-chain gas on cross-chain deposits. Withdrawals are Polygon USDC only.
- Rounding rule claimed: ask rounds up, bid rounds down, "the price you see is the price you get" (docs; not tested).

## 8. Resolution mechanism and dispute risk

- **Pipeline (H docs: https://docs.prophetmarket.ai/core-concepts/resolution.md):** wait 3 hours after `resolutionDate`; an ensemble of LLMs reads the stated source; retry with exponential backoff for up to about 2 days; then manual resolution by the Prophet team; post the result to the `Resolution` contract; a 12 hour cooldown; anyone calls the finalise function; winners redeem 1 USDC per share. Best case about 15 hours. Void pays 50c per share on both sides.
- **Contract reality (H, `ProphetMarket/contracts/src/Resolution.sol` at repo HEAD; deployed bytecode not compared):** single `oracle` address calls `reportPayouts(conditionId, questionId, payouts, ipfsCid)` -> pending for `cooldownPeriod` (bounded 1h..72h) -> `finalizePayouts` callable by anyone -> forwards to the Gnosis CTF. **The owner can call `overrideReport` on a pending report and reset the cooldown**, and can change the oracle (`setOracle`); a `CooldownPeriodUpdated` event implies the cooldown is also adjustable (setter not read). The contract states "There is no user-facing dispute mechanism - this is by design." The docs stress that the 12 hour window is enforced by the contract and that Prophet "cannot shorten it, override it, or make an exception to it"; the source additionally lets the owner replace a pending outcome (which restarts the cooldown), which the docs do not mention.
- **Observed behaviour:** `resolvedAt` 2026-06-18T08:24Z for a market with `resolutionDate` 2026-06-18T04:59Z (about 3.4 h, matches the buffer). Counts: `PENDING_RESOLUTION` 345, `RESOLUTION_FAILED` 99 (including "Bitcoin close above $110,000 by October 12, 2026", `RESOLUTION_FAILED`), `CANCELLED` 1,752 versus 17,835 resolved (about 8.9% of finished markets voided). The sampled pending markets closed 2026-08-23..08-31 and were still `PENDING_RESOLUTION` on 2026-10-19, versus the documented 15 hours to 2 days. (H counts; M for generalising the pending sample.)
- Sample resolution record quality is good (cites federalreserve.gov and press; fixture `05`), but `ipfsCid` was null although the docs promise permanent IPFS proof, and the sampled record lists 6 model votes against a breakdown string that counts 4.
- Dispute risk for an arbitrage book: high. LLM-based, finalised payouts are irreversible, 50c voids that disregard cost basis, and resolution rules are often written by the market creator or the model rather than a standard contract. A "same event" match on Polymarket/Kalshi can resolve differently.

## 9. Geo, ToS and automation

- US persons and "restricted jurisdictions" excluded: docs "Prophet is not available to US citizens or residents ... not a technicality and it is not waivable" (H: https://docs.prophetmarket.ai/availability.md). The sign-in flow requires attesting "you are not a U.S. person or located in a restricted jurisdiction" and the app shows "We've detected you are accessing Prophet from a restricted jurisdiction. Trading is not available from your current location." (H, JS chunks served by app.prophetmarket.ai). A `geoCheck{country blocked}` query evaluates the request origin IP (H docs; not called to avoid recording a location). The list of restricted countries is NOT FOUND (searched: availability page, ToS, privacy, app chunks).
- Terms of Service (effective/last updated 2026-03-13), H, https://app.prophetmarket.ai/terms (served in the Next.js payload): s.7 Prohibited Conduct includes "Use automated scripts, bots, or AI tools (other than ours) to interact with the Platform without permission" and "Attempt to interfere with, hack, or exploit the Platform, smart contracts, or blockchain"; wash trading and front-running also banned. Tension: the API docs advertise HMAC credentials for "scripts, bots, server-side integrations". Treat permission as required. Governing law Panama, binding individual arbitration in Panama City, class-action waiver, liability capped at USD 100, "team@prophetmarket.ai" is the legal contact, Prophet is incorporated in Panama (privacy policy).
- Docs say Prophet publishes no support inbox; support is Discord only (H, official-links page).
- Read-only use of the public GraphQL API for data is not mentioned as restricted; whether polling counts as "automated scripts" under s.7 is unclear (L). Keep polling light and cache.

## 10. Liquidity (with dates)

| Metric | Value | Date / source |
|---|---|---|
| All-time volume | USD 37,262.66 | DefiLlama, 2026-10-19 |
| 30d / 7d / 24h volume | USD 1,927.27 / 429.92 / 0 | DefiLlama, 2026-10-19 |
| Zero-volume days | 2026-10-16, 10-17, 10-18 | DefiLlama daily series |
| TVL | not tracked (empty series) | DefiLlama |
| Open markets | 542; sum of per-market `volumeCents` USD 1,148.61; only 10 have >= USD 10; `isLiquid` true for 1; earliest `resolutionDate` 2026-10-23, latest 2045-12-31; category-level total USD 1,395 (different scope) | live API, 2026-10-19 (fixtures `01`, `08`) |
| Largest open market | USD 68.91 lifetime (Julius Malema prison market, resolves 2026-12-31) | live API |
| Largest resolved markets seen (top of the `RESOLVED` volume sort) | USD 1,219.81 (NHL Vegas v Carolina goals, June 2026); next USD 1,061.92 (FOMC June 17) | live API |
| 100 newest resolved markets | USD 510.74 total, median USD 4.99, max USD 10.07 (all sports props, created 2026-10-10..10-15) | live API |
| Depth on sampled book | one house order per side: 362.8 shares bid 27.41c, 177.3 shares ask 47.01c (about USD 83 at the ask) | live API, 2026-10-19 |
| Resolved / void / pending / failed | 17,835 (10,697 YES + 7,138 NO) / 1,752 / 345 / 99 | live API counts, fixture `08` |

The trade list for the top open market had only 21 trades in total, all taker YES buys at the house ask (fixture `04`).

## 11. Event coverage and overlap

Categories (12): Politics 110 markets, Sports 73, Companies 69, Tech & Science 59, World 48, Culture 44, Financials 41, Crypto 40, Economics 30, Health 17, Climate 5, Transportation 3 (open markets, fixture `01`).

- **Sports:** the bulk of recent flow is micro-props (NBA preseason game total points, UEFA Youth League goals, NHL/soccer totals, World Cup match props). Overlap with Polymarket/Kalshi sports exists for headline games but prop lines are bespoke.
- **Crypto price:** daily/threshold markets ("Bitcoin above 79k by June 12", "Bitcoin close above $110,000 by October 12", "XRP above 1.3$ by June 16th") plus oddities (USDT/USDC peg thresholds at 1.38-1.63, stable-coin price markets with USD 0.35 volume). Overlaps Polymarket/Kalshi BTC ladders in subject only; thresholds and time stamps rarely match.
- **Macro:** a few (FOMC June 17 "signal a rate cut" resolved NO, USD 1,062 volume). Possible overlap with Kalshi/Polymarket Fed markets, but the contract definition differs.
- **Politics/world:** long-dated one-offs (Putin leaves office by end-2026, US-Iran deal, Argentina dollarisation by 2028) that do overlap Polymarket topics.
- **Data-quality warning (M):** the open market "Will France win the 2026 FIFA World Cup?" is still `OPEN` with resolution rules citing a "final match on December 18, 2026" although the 2026 World Cup final was scheduled for July 19, 2026 (my background knowledge; not re-verified). The question was created 2026-06-22. Dates and thresholds generated by the LLM can therefore be wrong, which makes automatic cross-venue matching dangerous.
- Net: where overlap exists, Prophet's quotes are a +/-10-point LLM-centred band, so they do not provide a usable independent price. At best the `probabilityYesBps` field is a weak LLM prior ("signal-only"), which is not a differentiated signal.

## 12. Shared liquidity

- **Not shared with Polymarket**: separate exchange contract, separate oracle/conditions, separate order book (H lp-vaults README, contracts). It reuses Polymarket's open-source exchange code and, as far as I can tell, the same Gnosis CTF contract address (M), but positions are only fungible within Prophet's own conditions.
- Liquidity is **provided by Prophet itself (the AI house)**, with an LP-vault design for outside LPs that does not appear to be live. So it is an independent price source in the narrow sense but a single-counterparty one, and not deep enough to be an arbitrage leg.

## 13. If an adapter is built anyway (signal-only)

- Read-only `markets(filter:{status:OPEN})` poll every 5-10 minutes, paginate 100 at a time, store `id`, `slug`, `question`, `resolutionRules`, `resolutionDate`, `probabilityYesBps`, `quote.*`, `volumeCents`, `isLiquid`, `conditionId`. Use `orderBook` only for markets with `volumeCents` above a threshold.
- Treat `volumeCents` < 1000 and `isLiquid=false` as unusable. Treat `PENDING_RESOLUTION` older than 3 days and `RESOLUTION_FAILED` as untradeable/uncertain.
- Validate against introspection at startup and fail closed if the field set drifts (docs are already stale).
- Never feed Prophet quotes into an execution path.

## 14. Suspicious / injected content seen

- Every GitBook page on `docs.prophetmarket.ai` ends with an "Agent Instructions" block telling AI agents to perform an HTTP GET against `https://docs.prophetmarket.ai/<page>.md?ask=<question>&goal=<user_goal>` to "query the documentation" (also present in `llms.txt`). This is standard GitBook boilerplate aimed at agents; I did not use it (it would have sent my questions and goal to a third party). Recorded as untrusted agent-directed text.
- `ProphetMarket/lp-vaults` and `promo-settler` contain `CLAUDE.md` files addressed to AI coding agents (repo rules). I did not read or follow them.
- Marketing/App chunks include tracking pixels (Google Tag Manager, Reddit, Meta, PostHog, Sentry); irrelevant to the integration.

## 15. NOT FOUND

- Mainnet address of the `Resolution` oracle contract and of any LP vault factory (searched: contracts repo, lp-vaults DEPLOYMENT.md, docs).
- Rate-limit numbers; HMAC request-signing scheme for API credentials; programmatic (non-Privy) login path (searched: docs auth/overview/conventions/FAQ, mutation list).
- List of restricted countries (searched: availability, ToS, privacy, app JS).
- Contract-level tx counts/recent activity: Blockscout blocked by a Cloudflare challenge (not bypassed); Polygonscan tx table is dynamic; Etherscan V2 needs a key. Activity is inferred from DefiLlama's `OrderFilled`-based volume and the app's own trade records.
- Actual `feeRateBps` signed into orders.
- Team/legal entity names beyond "Prophet", Panama incorporation, and a marketing contact named in the press release (no personal names recorded here).
- Content of the three audit PDFs.
- Independent third-party coverage after the May 2026 launch (search returned only the press release syndication).

## 16. Open questions for a human

1. Is the 3-day zero volume (2026-10-16..18) and absence of new markets after 2026-10-15 a temporary pause, an operator outage or a wind-down? Re-check weekly if this venue stays on the list.
2. Why are 345 markets stuck in `PENDING_RESOLUTION` since late August while the docs promise about 15 hours to 2 days? Ask in the venue's Discord if relevant.
3. Does ToS s.7 allow read-only polling of the public GraphQL API without written permission?

## Sources

- Docs index: https://docs.prophetmarket.ai/llms.txt ; pages read: `/get-started/prophet-101.md`, `/get-started/how-prophet-differs.md`, `/introduction.md`, `/core-concepts/{markets,shares-and-the-invariant,prices-spread-and-rounding,orders-and-matching,resolution}.md`, `/cancellation.md`, `/reference/{fees-spread-and-gas,limits-and-guardrails,on-chain-first}.md`, `/your-wallet/{wallet-overview,sign-in-methods,deposits,withdrawals}.md`, `/safety/{risks,audits}.md`, `/what-prophet-cannot-do.md`, `/availability.md`, `/resources/faq.md`, `/community/official-links.md`, `/api/overview.md`, `/api/conventions.md`, `/get-started/api/{authentication,market-data,prices-and-order-book,quickstart,real-time-subscriptions,resolution-data,api}.md` (all fetched 2026-10-19)
- Live API (unauthenticated GET): https://app.prophetmarket.ai/graphql ; https://app.prophetmarket.ai/health ; https://app.prophetmarket.ai/api/ (all 2026-10-19)
- App legal pages: https://app.prophetmarket.ai/terms (last updated 2026-03-13), https://app.prophetmarket.ai/privacy ; app JS chunks under https://app.prophetmarket.ai/_next/static/chunks/ (restricted-jurisdiction strings)
- GitHub (read via `gh api` raw): https://github.com/ProphetMarket/lp-vaults (README.md, DEPLOYMENT.md), https://github.com/ProphetMarket/contracts (README.md, src/ProphetCTFExchange.sol, src/Resolution.sol, audits/ file list), https://github.com/ProphetMarket/ctf-exchange (src/exchange/libraries/OrderStructs.sol, src/exchange/mixins/Fees.sol). Org created 2026-02-06, 5 public repos.
- DefiLlama: https://api.llama.fi/protocol/prophet-prediction-market ; https://api.llama.fi/summary/dexs/prophet-prediction-market ; https://defillama.com/protocol/prophet-prediction-market (WebFetch 403; used the API instead)
- Sourcify: https://sourcify.dev/server/v2/contract/137/0x127aD3A6e55EbBDaecC0eaeb12615879611e1839 ; Polygonscan address page (HTML)
- Press (M, sponsored release): https://cryptobriefing.com/prophet-launches-ai-powered-prediction-market-with-live-10000-trading-tranche/ ; syndications of the 2026-05-06 GlobeNewswire release
- Internal context: `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md`, sibling notes `prophet-fun.md`, `prophet-obyte.md`
- Fixtures (this session): `docs/research/fixtures/prophet-prediction-market/01-categories.json` .. `09-schema-root-fields.json`
