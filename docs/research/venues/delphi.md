# Delphi (Gensyn) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public GETs, docs, `gh api` file reads. No accounts, no API key created, no POST/RPC calls, no PayBox money or signing tools (only read-only `discover_tokens`).
Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak, stale or rough estimate.

## Verdict

- **Adapter priority: P2 (signal-only / thin).** Live, independent liquidity, readable on-chain, but depth is about $70 per market and about $0.5k/day gross volume. The REST API needs a key from a generator page I did not use. Settlement is by an AI judge with no appeal. Trading is geoblocked in the US and South Korea. PayBox has no route to the Gensyn chain.
- It is **not** a duplicate of another venue's liquidity (own contracts on its own chain). Overlap with other venues is real (daily crypto thresholds, commodity closes, MLB moneylines) but the capital in each market makes any arbitrage worth single-digit dollars.
- Possible value: the "Predict Anything" forecaster odds as a model-probability signal, and Delphi's templated daily markets as cheap cross-checks. Build last.

## 1. Liveness

- **Live as of 2026-10-19.** Mainnet launched 2026-04-22 (H: https://www.gensyn.ai/news/delphi). `https://api.delphi.fyi/health` returned `{"status":"ok"}` on 2026-10-19 (H, fixture `api_health.json`).
- Gateway `0x982a...a8d5` (automated settlement) had trades, redemptions and `resolveMarket` calls on 2026-10-17/18 (H: Blockscout API, fixture `blockscout_gateway_logs_sample.json`). The factory created a batch of markets daily through 2026-10-16 13:56 UTC (H: Blockscout factory logs). No factory events were seen for 2026-10-17/18 in the first page; a weekend pause is plausible (L).
- Docs reference dates up to 2026-10-12 and `news.delphi.fyi` posts up to 2026-10-07, "LMSR markets now available" and "Introducing Predict Anything" both 2026-09-29 (H).
- DefiLlama lists it as "Prediction Market", chain Gensyn, listedAt 2026-05-13 (H: `https://api.llama.fi/protocol/delphi`). Its TVL is empty; only volume and fees adapters exist.

## 2. Kind and market model

- **kind: onchain-other.** Gensyn markets it as an "information market" platform: creators or Delphi's forecaster open a market, anyone trades, AI settles (H: https://docs.delphi.fyi/what-is-delphi.md).
- **Two mechanisms, badge on every market (H: https://docs.delphi.fyi/explore-and-trade.md, https://docs.delphi.fyi/help.md):**
  - **DPM (Dynamic Parimutuel):** buy into a pool, winners split it. Payout is NOT fixed at trade time; it changes with later trades. Selling liquidates the whole position in that outcome. SDK docs say all Delphi app markets on mainnet use DPM (H: https://docs.delphi.fyi/tools/sdk/methods.md, SDK 2.1.0, last pushed 2026-08-03). On-chain state per market: `outcomeCount, k, tradingFee, tradingDeadline, settlementDeadline, pool, tradingFees`.
  - **LMSR:** price = probability, each winning share pays $1, partial sells allowed. Docs/news say LMSR became available in the app on 2026-09-29 and is "recommended" (H: help page, news.delphi.fyi). The SDK docs (pre-dating this) only list LMSR for a separate testnet agent competition (`competition-testnet`, TST token). The mainnet LMSR gateway/factory address is **NOT FOUND** in any doc; the `LmsrGateway` source is in the public contracts repo (H, section 5).
- **Outcomes:** binary and categorical; 2 to 20 outcomes per market (H: https://docs.delphi.fyi/create-a-market.md). No scalar markets found. Outcomes are indexed `0..n-1`; labels live in off-chain metadata `outcomes[]` (H: SDK API docs). Positions are internal share balances held by the market proxy contract (gateway exposes `balanceOf(marketProxy, owner, outcomeIdx)` plus `allowance(...,id)` / `isOperator`, which looks ERC-6909-style; shares 18 decimals), not transferable-ERC20 outcome tokens in any documented flow (M).
- **Pricing is on-chain only.** The REST API does not return prices; the SDK reads `spotPrices` / `spotImpliedProbabilities` from the gateway via multicall (H: SDK `DelphiClient.ts`, `fetchPricesForMarkets`). DPM: `prob[0]+prob[1] = 1e18`; spot price 0.65 means about 65 percent (H).
- **No-outcome state:** if the AI workflow cannot pick a winner, shares pay the **final market price at close**, not $1/$0 and not a refund (H: https://docs.delphi.fyi/how-ai-settlement-works.md). This breaks pure-arbitrage payoffs against venues that pay $1/$0 or void at cost.
- LMSR cost function per Gensyn guide: `C(q) = b ln(sum exp(q_i/b))`, max creator loss `b ln n` (H: https://www.gensyn.ai/guides/lmsr-logarithmic-market-scoring-rule). Trade fee tau applied on top of the cost delta (buys pay (1+tau)dC, sells receive (1-tau)|dC|) (H, same page, illustrative 0.5-2 percent).

## 3. Chains and collateral

- **Gensyn Mainnet**, chain id **685689**, OP Stack L2 on Ethereum, gas token ETH, public RPC `https://gensyn-mainnet.g.alchemy.com/public`, explorer `https://gensyn-mainnet.explorer.alchemy.com` (H: https://docs.gensyn.network/network-information).
- **Collateral: USDC.e** `0x5b32c997211621d55a89Cc5abAF1cC21F3A6ddF5` (6 decimals), bridged via Stargate (H: same page; SDK config table). Withdraw to Base/Ethereum is via the app wallet menu (H: help page).
- Contracts (H: https://docs.delphi.fyi/tools/sdk/configuration.md; verified on the explorer):
  - Gateway, automated settlement: `0x982a67aE92D8de361957249fB2BB4a62BCc6A8d5` (explorer name `DynamicParimutuelGateway`, verified, 12,312 txns on 2026-10-19)
  - Factory, automated settlement: `0x9C73417f79a1361c6aF9Bd828343badEE1b84936` (`DelphiFactory`, verified, 350 txns)
  - Gateway, legacy: `0x4e4e85c52E0F414cc67eE88d0C649Ec81698d700` (20,211 txns); Factory legacy `0x4596d847eA56DCf9A37944c13793Af802Fc5D1eC`
  - Market implementation seen in recent proxies: `0x28Eff177D2d36B98C2Ae75305230fbB76387bC4A` (`DynamicParimutuelMarket`, verified)
  - Testnet chain id 685685 with a play-money `$TEST` token; the press "87,000 traders / $4.88M" figure is testnet (M, https://www.theblock.co via search summary), not real volume.
- Gas: embedded wallets are gas-sponsored; external wallets pay ETH (H: help page). Base fee is about 0.09 gwei (H: Blockscout `/stats`).

## 4. Read API

**exists: official-authenticated** (REST needs a key) plus a public on-chain and subgraph path.

- **Docs:** https://docs.delphi.fyi/tools/sdk/api.md (also `/tools/sdk.md`, `/configuration.md`, `/methods.md`, `/subgraph.md`; index at https://docs.delphi.fyi/llms.txt). SDK: npm `@gensyn-ai/gensyn-delphi-sdk` 2.1.0, MIT, https://github.com/gensyn-ai/gensyn-delphi-sdk (H).
- **REST base URLs:** mainnet `https://api.delphi.fyi/`; testnet and competition `https://delphi-api.gensyn.ai/` (H: configuration table).
- **Endpoints (H, from SDK source `apiGet` calls):**
  - `GET /health` (no auth) -> `{"status":"ok"}`. Confirmed live (fixture `api_health.json`).
  - `GET /markets?skip&limit&status&category&orderBy&verifiable&competitionId` -> `{markets:[...]}`; `status` in open | awaiting_settlement | settled | expired | failed; `orderBy` in liquidity | created | settles_at; default limit 50.
  - `GET /markets/{marketProxyAddress}`
  - `GET /positions?wallet&redeemedOrLiquidated&skip&limit`
  - Market fields: `id` (proxy address), `appMarketId`, `status`, `category`, `deployer`, `implementation`, `metadataUri`, `metadata{question,outcomes[],resolutionCriteria,endDate}`, `dataSources`, `createdAt`, `resolvesAt`, `settlesAt`, `settledAt`, `winningOutcomeIdx`, `tradingFee`, `proof`, `error`, `verifiable`. No price, volume, or liquidity fields in the documented type (H).
- **Auth:** header `X-API-Key`. Unauthenticated `GET https://api.delphi.fyi/markets` returned **401 `{"error":"missing X-API-Key header"}`** (H, fixture `api_markets_no_key_401.txt`). Keys come from `https://api-access.delphi.fyi/` (mainnet) and `https://delphi-api-access.gensyn.ai/` (testnet) (H: configuration page). I did **not** generate a key (rule: no sign-ups/keys). Whether the key is free, tied to a wallet or login, and its terms: **NOT FOUND** (searched: configuration page, README, key-generator landing page which renders only a title).
- **Rate limits:** NOT FOUND (searched: docs index, SDK source, 401 response headers carry no rate-limit headers). **WebSocket:** NOT FOUND (searched: docs index, SDK source). Poll or read events.
- **Public, no-key read paths:**
  1. **Goldsky subgraph** (GraphQL): `https://api.goldsky.com/api/public/project_cmnoqdag1obop01z3efnu8ssq/subgraphs/delphi-mainnet-autoset/1.0.0/gn`. GET returns a GraphiQL HTML page (H, so the deployment exists), queries need POST which I did not do. Entities: `gatewayBuys`, `gatewaySells`, `gatewayRedemptions`, `gatewayLiquidations`, `gatewayMarketSettleds`, `gatewayMarketFaileds`, `marketResolutionRequesteds`; fields `marketProxy, buyer/seller, outcomeIdx, tokensIn (6 dec), sharesOut (18 dec), timestamp_`; first 1000 per page (H: subgraph docs). Default endpoint indexes only automated-settlement gateways, legacy history is a different deployment. **Live response shape NOT confirmed** (needs POST).
  2. **RPC reads** (eth_call, POST, not done): `quoteBuyExactOut`, `quoteSellExactIn`, `spotPrices`, `spotImpliedProbabilities`, `totalSupplies`, `getMarket`, `marketStatus` on the gateway (H: methods docs). This is the only way to get prices and depth.
  3. **Blockscout GET API** on the explorer (third-party Alchemy-hosted, unauthenticated): `/api/v2/addresses/{gateway}/logs` returns decoded `GatewayBuy/Sell/Redemption/MarketSettled/MarketResolutionRequested`; `/addresses/{factory}/logs` returns `NewMarketProxy(deployer, implementation, newMarketProxy, (metadataUri, hash))`. Confirmed live (H, fixture `blockscout_gateway_logs_sample.json`).
  4. **Market metadata** is a public JSON at the `metadataUri` (a GCS bucket `...-delphi-mainnet-market-metadata`), fields `question, outcomes[], model{model_identifier,prompt_context}, initial_liquidity, initial_pool, refund, market_creation_fee, version, data_sources[], settlement_starts` (H, fixtures `market_metadata_*.json`). Note: no `category` key in these 50 samples even though the REST type has `category`.
- Sampled shapes: see `docs/research/fixtures/delphi/`.

## 5. Trade path

- **Programmatic, on-chain only.** No order book, no off-chain signed orders. Flow (H: methods docs + SDK `token.ts`):
  1. `quoteBuyExactOut(market, outcomeIdx, sharesOut)` (view) -> `tokensIn`
  2. ERC-20 `approve(spender = marketProxy, amount)` on USDC.e. Spender is the **market proxy**, one approval per market (H: SDK `approveToken` args `[marketAddress, amount]`).
  3. `gateway.buyExactOut(market, outcomeIdx, sharesOut, maxTokensIn)` (slippage cap in the call). Sells: `sellExactIn(market, outcomeIdx, sharesIn, minTokensOut)`. Exits: `redeem(market)` after settle; `liquidate(market, outcomeIndices[])` for expired/failed.
  4. LMSR gateway adds `buyExactOutWithPermit` (EIP-2612 permit path, one tx) (H: `ILmsrGateway.sol` in https://github.com/gensyn-ai/delphi-smart-contracts, MIT).
- **Signing:** ordinary EOA EIP-1559 transactions on chain 685689. The SDK supports a raw private key or a Coinbase CDP server wallet. Embedded app wallets get sponsored gas.
- **Constraints:** min share delta 0.01, min tokens delta 0.01 (LMSR gateway constants, H). LMSR has a per-outcome max trade the market can absorb (H: explore-and-trade).
- Market creation by agents is not supported for listable markets: "Markets must be created through the Delphi UI" (H: agentic-trading docs).
- Agent skill exists: `npx skills add https://github.com/gensyn-ai/gensyn-delphi-skills --skill delphi` (MIT, last push 2026-08-03). Not installed or executed.

## 6. PayBox reachability: **partial (leaning no)**

- Gensyn (685689) is **not** in PayBox's chain catalog: `discover_tokens mode=chains query=gensyn` returned 0; `search chain=eip155:685689 query=USDC` returned 0 tokens (H, 2026-10-19; consistent with `docs/research/06-paybox-platform.md`, 11-chain catalog). Catalog is "not a support allowlist" (tool notice) so this is evidence, not proof.
- Plugin `io.paybox/transactionProposal` for EVM requires the chain "be available in PayBox" and is one call only, so approve + buy would be two proposals on an unsupported chain (M). Funding also needs USDC.e on Gensyn (Stargate bridge) plus ETH for gas, neither reachable through `request_swap` (M).
- Possible workaround: `request_wallet_sign` with `transaction` intent signs a caller-built EIP-1559 tx for any chainId without broadcasting (per doc 06), then the agent broadcasts to the Gensyn RPC itself. Untested for chain 685689 (NOT FOUND). Same EVM address is shared across all `eip155:*` chains (doc 06, H).
- No gasless path via PayBox; embedded-wallet gas sponsorship applies only to Delphi's own app wallets (M).

## 7. Fees

- **Trading fee: default 2 percent of every trade, set per market** (H: create-a-market page "default trading fee percentage is 2%"; stored as `config.tradingFee`, 1e18 = 100 percent, readable via `getMarket`). Fee is added on buy and deducted on sell; preview shows it before confirm (H: ToS section 5, explore-and-trade).
- **Split:** creator 1.5 percent and protocol 0.5 percent (buyback/burn vault) of volume (M: https://www.theblock.co/post/398419/a16z-crypto-gensyn-delphi-ai-settled-information-markets-platform; also search summaries). On-chain `TRADING_FEES_RECIPIENT_PCT` (read by DefiLlama's adapter) sets the recipient share per market. Docs only say the creator share "currently differs by market type" (H: help page).
- DefiLlama-implied effective fee: 1,240 / 84,228 = about 1.5 percent (M; legacy gateway only, mixed markets).
- **Market creation fee:** 1 USDC (`market_creation_fee: "1000000"` in metadata, H). Seed: 100 USDC `initial_liquidity`, DPM split `initial_pool` 70.71 + `refund` 29.29 (H, fixtures).
- Gas: negligible (about 0.09 gwei) but needed in ETH for external wallets. Deposit bridging has a fixed third-party bridge fee (H: help page).
- Creator fees accrue at trade and pay at settlement; if a market expires, realized payouts can differ (H: DefiLlama methodology).

## 8. Resolution mechanism and dispute risk

- **Automated Settlement** (H: https://docs.delphi.fyi/how-ai-settlement-works.md): question, outcomes, data sources, settlement criteria, analyst models and judge model are fixed at creation. After trading close, waits 1-12 h (default 8 h), two analyst models review evidence, a judge model selects the outcome, result goes on-chain. Every market settles within 48 h of close (contract-enforced). The judge runs in Gensyn REE and emits a receipt proving computation, not factual correctness.
- Metadata of the sampled markets names the model `Qwen/Qwen3-32B` for all 50 (H, fixtures), which differs from the "two frontier analysts + open-source judge" wording in the docs (M, unresolved wording gap).
- **On-chain plumbing:** the contracts repo shows an `IOracle` relayer (`TruebitOracleRelayer`) wired into the gateway by the **gateway owner** via `setOracleRelayer`, UUPS-upgradeable; keeper calls `resolveMarket`, relayer calls `settleMarket` / `failMarket` (H: https://github.com/gensyn-ai/delphi-smart-contracts, `LmsrGateway.sol`, `IOracle.sol`, README). This is the LMSR deployment; whether DPM mainnet uses the same relayer is not stated (NOT FOUND). Admin/owner centralization applies in either case (M). Is the owner a timelock? A `DeployTimelock` script exists; mainnet owner **NOT FOUND**.
- **Dispute/appeal: none.** ToS s.6: Gensyn "cannot override, reverse or substitute a settlement decision"; the system "may return an incorrect decision, be delayed, or return no decision", causing "incorrect payouts or locked funds"; liability capped at the greater of $100 or 12-month fees (H: https://delphi.fyi/tos).
- States: open, awaiting_settlement, settled, expired, failed (+ app-level "No Outcome" and "Removed"). Gensyn may hide or remove markets "for legal, regulatory, or other reasons"; positions are not cancelled (H: ToS s.11). Legacy markets were creator-settled with a 24 h deadline.
- **Audit:** Trail of Bits review of the DPM markets, 2026-04 (H: PDF exists at `trailofbits/publications/reviews/2026-04-gensyn-delphidynamicparamutuelmarkets-securityreview.pdf`, listed in the repo's `audits/auditLinks.md`). No audit is listed for the LMSR contracts (NOT FOUND). Contracts repo disclaimer says it does not represent the code is audited.
- Resolution-rule risk for arbitrage: single-source rules (CoinGecko price at 23:45 UTC, Yahoo Finance daily close of one futures contract, MLB `gamePk` result) differ from Polymarket/Kalshi sources, and postponed games resolve to "neither" (H, fixtures). Treat as basis risk, not a hedge.

## 9. Geo, ToS, automation

- **Blocked for trading and market creation:** United States and territories, South Korea, plus Cuba, Iran, North Korea, Syria, Russia, and Crimea/Donetsk/Luhansk (H: https://docs.delphi.fyi/help.md). Blocked users can still view markets and submit non-monetary predictions. ToS s.2 bars VPN/other-person-account circumvention, requires age 18+, and bars US-organized entities (H: https://delphi.fyi/tos).
- **Automation:** no dedicated bot/API clause in the ToS; s.9 prohibits wash trading, sham transactions, coordinated misleading volume, and evading "usage limits" (H). Gensyn itself publishes an SDK and an "Agentic Trading Toolkit", so programmatic trading is explicitly supported (H). API key terms NOT FOUND.
- Geo enforcement is applied in the Gensyn-hosted interface; the contracts are permissionless (`DISCLAIMER.md` says users alone are responsible for legality) (H). Do not rely on that for a US-resident operator.

## 10. Liquidity

- **Per-market depth is tiny.** Each templated market is seeded with 100 USDC (DPM pool 70.71 USDC). A sampled open market proxy held **71.80 USDC.e** (H: Blockscout `token-balances`, 2026-10-19). A $10 trade moves a DPM price materially.
- **Volume, real money:**
  - DefiLlama: all-time **$84,228**, 30d $13.57, 7d $3.57, 24h $0 as of 2026-10-19 (H: `https://api.llama.fi/summary/dexs/delphi`, fixture `defillama_dexs_summary.json`). By month: Apr $68.6k, May $7.4k, Jun $8.2k, Jul-Sep ~0, Oct $13.6.
  - **That number undercounts.** The DefiLlama adapter reads only the **legacy** gateway `0x4e4e...d700` (H: `DefiLlama/dimension-adapters/dexs/delphi/index.ts`), not the automated-settlement gateway `0x982a...` where current trading happens.
  - Own sample on the automated gateway: 30 buys totalling $395 in the 24 h to 2026-10-17 23:03 UTC, plus 7 sells totalling $147 in the same page of logs (M, single window, Blockscout). Roughly **$0.5k/day gross**, average trade about $13. Cumulative on the new gateway is unknown; 12,312 txns total suggests low hundreds of thousands at most (L).
  - TVL: not tracked (DefiLlama TVL empty). OI: not published.
- The app's leaderboard and per-market volume exist in the UI but need JS rendering; not read (no browser automation).
- Testnet "millions" and 87k-trader figures are play money (M).

## 11. Event coverage and overlap (where arbitrage could exist)

Sample of the last 50 factory-created markets (2026-10-01 to 2026-10-16, all by one deployer address, presumably Delphi's own automation) (H: metadata fixtures):

| Type | Count of 50 | Example | Overlaps |
|---|---|---|---|
| Commodity daily close (Yahoo Finance) | 27 | "Will Gold (GCZ26.CMX) exceed $4,169/oz on Yahoo's 16 Oct 2026 daily close?" (Brent, WTI, Silver, Gold) | Kalshi / Polymarket commodity brackets (different strikes and source) |
| Crypto price threshold (CoinGecko 23:45 UTC) | 16 | "Will Bitcoin exceed $82,400 on CoinGecko at 23:45 UTC on 14 Oct 2026?" (BTC, SOL, LINK, UNI, ARB) | Polymarket / Limitless / Kalshi crypto dailies (different strike, time, oracle) |
| MLB game winner | 7 | "Milwaukee Brewers vs. Los Angeles Dodgers ... MLB Game Winner" (statsapi.mlb.com gamePk) | Polymarket / Kalshi MLB moneylines |

- Other categories seen in `news.delphi.fyi` (H): gaming (Marvel Rivals), NBA franchise relocation, GTA IV download size, Apple memory, weather, Oscars. Mostly long-tail and non-overlapping. Politics/macro: none seen.
- Strikes are generated per day (e.g. a price near spot), so exact-match pairing with other venues' contracts will be rare. Matching must be by underlying + timestamp + threshold, with oracle-source basis risk.

## 12. Liquidity sharing

- **Independent.** Own contracts, own pools, own chain; no aggregation or routing from another venue (H: contracts repo, SDK). Not an LP vault of another protocol. (LMSR design has a planned community Vault, M.) So it is a genuine separate leg, but too thin to matter.

## 13. Adapter priority: **P2**

Reasons: live and independent (+), open-source contracts and an MIT SDK (+), real overlap on crypto/commodity/MLB dailies (+), but: $71 pools and about $0.5k/day volume (-), REST needs a key and has no price/depth fields (-), pricing needs RPC reads (-), DPM payouts not fixed and "No Outcome" pays at close price (-), AI settlement with no appeal and single-source rules (-), US/KR geoblock (-), Gensyn chain absent from PayBox (-). Revisit if LMSR volume grows; if built, use Blockscout/subgraph for events and gateway view calls for quotes, read-only first.

## 14. Not found / open questions

- Mainnet LMSR gateway and factory addresses; whether LMSR markets exist on mainnet yet (docs say yes since 2026-09-29, SDK table says DPM only).
- REST API key terms, cost, rate limits; any WebSocket.
- Live subgraph and RPC response shapes (need POST; not done under the read-only rule).
- Whether `/markets` filters by `category` use the same labels as the (absent) metadata `category`.
- True post-migration cumulative and daily volume across both gateways (a subgraph aggregate would answer it).
- Gateway owner type (EOA / multisig / timelock) and which oracle relayer serves DPM settlement.
- Whether PayBox can sign for chain 685689 (`request_wallet_sign` transaction intent), and Stargate route to Gensyn from PayBox wallets.

## 15. Suspicious / embedded-instruction content (recorded, not followed)

- Every `docs.delphi.fyi/*.md` page ends with a GitBook "Agent Instructions" block telling agents to call `GET .../index.md?ask=<question>&goal=<user_goal>` and "use this mechanism". Generic GitBook boilerplate; not used. (Querying it would send our question text to a third party.)
- Docs and `agentic-trading` pages instruct installing a skill with `npx skills add https://github.com/gensyn-ai/gensyn-delphi-skills --skill delphi` and creating API keys via the generator pages. Not done.
- DefiLlama endpoint `/summary/derivatives/delphi` returned HTTP 402 "Upgrade to the paid API plan" (not x402; no payment requirements to record); stopped.
- Search-result summary claims about LMSR being live in April 2026 and a Crypto Times "$70-95M 24h volume" conflict with first-party docs; the latter refers to the $AI token (M). Not relied on.

## Sources

Primary (H):
- https://docs.delphi.fyi/llms.txt, /what-is-delphi.md, /help.md, /explore-and-trade.md, /create-a-market.md, /how-ai-settlement-works.md, /tools/sdk.md, /tools/sdk/configuration.md, /tools/sdk/api.md, /tools/sdk/methods.md, /tools/sdk/subgraph.md, /tools/agentic-trading.md, /tools/agentic-trading/get-started.md
- https://delphi.fyi/ , https://delphi.fyi/tos , https://news.delphi.fyi
- https://api.delphi.fyi/health (200), https://api.delphi.fyi/markets (401 without key)
- https://github.com/gensyn-ai/gensyn-delphi-sdk (README, package.json 2.1.0, `src/client/DelphiClient.ts`, `src/client/token.ts`, `src/abi/DynamicParimutuelGateway.ts`; MIT; pushed 2026-08-03)
- https://github.com/gensyn-ai/delphi-smart-contracts (README, `audits/auditLinks.md`, `DISCLAIMER.md`, `src/lmsr/gateway/*`, `src/IOracle.sol`, `script/input/*`; MIT; pushed 2026-09-10)
- https://github.com/gensyn-ai/gensyn-delphi-skills (tree and commit dates only)
- https://github.com/trailofbits/publications (file listing of the DPM review PDF)
- https://docs.gensyn.network/network-information ; https://www.gensyn.ai/news/delphi ; https://www.gensyn.ai/guides/lmsr-logarithmic-market-scoring-rule
- https://gensyn-mainnet.explorer.alchemy.com/api/v2/ (addresses, counters, logs, token-balances, stats)
- https://api.llama.fi/protocol/delphi , /summary/dexs/delphi , /summary/fees/delphi ; https://github.com/DefiLlama/dimension-adapters (dexs/delphi/index.ts)
- Public market metadata JSON in the Delphi GCS metadata bucket (via `NewMarketProxy` events)
- PayBox `discover_tokens` (read-only), `docs/research/06-paybox-platform.md`

Secondary (M):
- https://www.theblock.co/post/398419/a16z-crypto-gensyn-delphi-ai-settled-information-markets-platform (fees 1.5 / 0.5, backers)
- Search summaries of prnewswire / bitcoin.com / DeFi Rate coverage (launch date, 2 percent fee, testnet volumes)

## Fixtures (`docs/research/fixtures/delphi/`)

- `api_health.json` (live `/health`), `api_markets_no_key_401.txt` (auth wall)
- `market_metadata_commodity_gold.json`, `market_metadata_crypto_btc.json`, `market_metadata_mlb.json` (public per-market metadata)
- `blockscout_gateway_logs_sample.json` (12 decoded gateway events), `defillama_dexs_summary.json`
- No REST `/markets` or subgraph sample: needs an API key or POST, both outside the read-only rules.
