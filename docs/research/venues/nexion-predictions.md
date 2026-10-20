# Nexion Predictions (nexionpulse.com/bet, "PulseBet" / "PolyBet") - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: web reads, unauthenticated GETs to public APIs (DefiLlama, PulseChain Blockscout, CoinGecko, 4byte-style signature DB), static download and text search of the venue's own front-end JavaScript (not executed), `gh api` file reads. No wallet connected, no account, no key, nothing signed, no POST/PUT/DELETE (so no JSON-RPC `eth_call`), no PayBox money or signing tool called (one read-only PayBox `discover_tokens` chain listing). No third-party code cloned or run. Third-party text is untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak / stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: technically reachable, economically dead (H).** The front end still serves (HTTP 200 SPA shell) and the contracts exist, but: DefiLlama TVL is **$0 since 2026-08-30** (peak ever $171); the last user transactions I found were **2026-07-05** (World Cup hub) and **2026-05-12** (5-minute Up/Down game) (I did not enumerate the transaction lists of the 21 individual factory-market clones; TVL $0 and the owner drains below imply no live balances); the project's own 2026-10-07 audit lists every prediction contract as "all 0 ... skipped: empty". Details in section 1.
- **Adapter priority: skip.** Each of these is sufficient on its own:
  1. No liquidity: TVL $0, lifetime user flow of the whole venue is tens of USD (section 10).
  2. No API of any kind: no REST/WS, no subgraph, contract source not verified on the explorer; only the ABI embedded in the site bundle (section 5).
  3. Custodial admin: a single EOA owner can withdraw tokens from markets and did so in bulk on 2026-06-11 and 2026-08-29 (section 8).
  4. Markets are admin/hobbyist-created, resolved by a named EOA, with no dispute path (section 8).
  5. Chain is PulseChain (369), which is not one of PayBox's 11 featured chains (section 6).
- Worth keeping only as a negative datapoint: "DefiLlama lists it as a Prediction Market with a TVL adapter" is not evidence of a live venue.

## 1. Liveness evidence (H unless marked)

| Check | Result | Source |
|---|---|---|
| Site `/bet` | HTTP 200, `text/html`, 3,310 bytes: a client-rendered React shell (title "NEXION Protocol - DeFi on PulseChain | Lending, Farms, Vaults, Prediction Markets"). WebFetch saw only the title. Page contents (markets) cannot be seen without executing JS; not done. | https://nexionpulse.com/bet |
| Canonical domain | `<link rel=canonical>` and the sitemap point to `nexionprotocol.com`, which **did not resolve** (curl exit 6) from this host on 2026-10-19; `nexionpulse.com` serves instead. | https://nexionpulse.com/ , https://nexionpulse.com/sitemap.xml |
| DefiLlama listing | id 7439 "Nexion Predictions", category Prediction Market, chain Pulse, url nexionpulse.com/bet, description "Trade on the outcome of future events with yield-bearing collateral.", `listedAt` 2026-02-21, `doublecounted` (collateral also sits in Nexion's GLOW lending pools). `audits: "0"`. | https://api.llama.fi/protocol/nexion-predictions |
| DefiLlama TVL | $164 on 2026-02-21; max $171 (May 2026); about $3 after 2026-06-12; $7-9 in August; **$0 from 2026-08-30 to the last point 2026-10-18 20:22 UTC**. Parent "Nexion" shows PulseChain TVL $162 (other products) on the same pull. DefiLlama has no volume (dexs) adapter for it ("Dexs for nexion-predictions not found"). | same + https://api.llama.fi/protocol/nexion ; fixture `defillama_protocol_nexion-predictions_2026-10-19.json` |
| TVL adapter | Enumerates markets from one factory `0x0f93380bb3442E6c7fE56f92d8193C6C39a0dC37` (`getMarketsCount`, `getMarkets`, per-market `collateral`, `getTotalValue`). | https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/nexion-predictions/index.js (read via `gh api`) |
| Factory activity | Deployed 2026-02-01 11:20 UTC; 53 transactions in total; **21 successful market creations, 2026-02-01 to 2026-06-06**; last transaction of any kind 2026-08-29 08:59 UTC (owner-signed `withdrawTokenFromMarket`). No creation after 2026-06-06. | https://api.scan.pulsechain.com/api/v2/addresses/0x0f93380bb3442E6c7fE56f92d8193C6C39a0dC37/transactions ; fixtures `factory_market_creations_decoded_2026-10-19.json`, `blockscout_factory_address_2026-10-19.json` |
| 5-minute Up/Down game ("UpDownBet") | Proxy `0x9b4748c73d9b1deA662BF154D8faB6d454271E6B` (created 2026-04-30), only 10 transactions in the explorer list, **newest 2026-05-12 03:19 UTC** (`betUp`, `resolve`, `claim`); balance 11,020 PLS (about $0.07 at 2026-10-19 CoinGecko price). | https://api.scan.pulsechain.com/api/v2/addresses/0x9b4748c73d9b1deA662BF154D8faB6d454271E6B (+ `/transactions`) |
| World Cup hub | `0xf42830EDaF38A7112DbA23f8D0035bCdA4d72820` (proxy, created 2026-06-06); 53 transactions; 7 non-owner senders; last non-owner transaction **2026-07-05 23:43 UTC**; last owner transaction 2026-08-29. | https://api.scan.pulsechain.com/api/v2/addresses/0xf42830EDaF38A7112DbA23f8D0035bCdA4d72820/transactions ; fixture `worldcup_hub_activity_summary_2026-10-19.json` |
| Project's own audit (2026-10-07) | Table "Value at risk": UpDownBet 11,020 PLS "skipped"; "PolyBet factories 0x0f93..., 0x38079B57... + 21 markets; WorldCup hub 0xf428... | all 0 | skipped: empty". Also: "the Betting ... sources were deleted from `main` in commit afb99835" (the contracts are no longer in the current repo). | https://nexion-1.gitbook.io/nexion/docs/audits/2026-10/pls-misc.md |
| Token | NEON $5.43e-5, 24h volume $12.9; PLS $6.45e-6, 24h volume $962 (pulled 2026-10-19 00:34 UTC). | https://api.coingecko.com/api/v3/simple/price?ids=pulsechain,nexion&vs_currencies=usd&include_24hr_vol=true |
| Third-party chatter | Two WebSearch queries (extended and standard) found nothing about Nexion's prediction product beyond the site and DefiLlama. X account `@nexionpulse` not readable here. | NOT FOUND (searched: WebSearch "Nexion Protocol PulseChain prediction markets PulseBet NEON", "PolyBet PulseChain Nexion ...", "nexionpulse X PolyBet World Cup ...") |

Naming: DefiLlama says "Nexion Predictions"; the in-app docs say "Prediction Market Factory ... Factory for PulseBet prediction markets"; the front-end i18n and the project's audit say "PolyBet". An unrelated "PolyBet" (Polygon, token PBT) exists; do not conflate (search results above).

## 2. What it actually is: four product generations (H unless marked)

1. **Factory binary AMM markets with lent collateral** (the thing DefiLlama tracks). `PredictionMarketFactoryWithLending` at `0x0f93...dC37` (unverified source) makes EIP-1167 clones of `PredictionMarketWithLending` (section 3). 21 markets: price-target markets (WPLS, HEX, PLSX and two other PulseChain tokens vs a USD target), crypto/meta questions ("Will BTC drop below $50,000 before end of 2026?", "Will pDAI peg to $1 ...", "Will PulseChain exceed 1000 TPS ...") and four NBA Finals Game 3 props (2026-06-06). See fixture `factory_market_creations_decoded_2026-10-19.json`.
2. **5-minute PLS Up/Down game ("UpDownBet")**: pari-mutuel pool, native PLS stakes, 5% fee, `RESOLVE_DEADLINE` 15 min (round cancels and refunds if unresolved), resolved from `PulseXSpotOracle` which the project's audit calls "pure `getReserves()` math, no TWAP" (project dev note 2026-05-04: https://nexion-1.gitbook.io/nexion/docs/bethedger_progress.md ; audit index https://nexion-1.gitbook.io/nexion/audit-reports/2026-05-13/00-index.md). The site home page markets this as "Place predictions on PLS price movements. Win up to 2x your stake in fast-paced 5-minute rounds" (site bundle i18n).
3. **World Cup 2026 hub** (`0xf428...`, proxy): about 600 question strings batch-created on 2026-06-06 (tournament winner 20, match results ~199, stage progress ~192, player props ~129, group winners ~46; counts from regexing calldata, M). Bets in native PLS; 7 non-owner addresses, 2.54M PLS total sent (about $16 at today's PLS price; M because the PLS price on the bet dates is unknown).
4. **Factory #2** `0x38079B57a8BFd54cF1c0517f8E302b0dfB9a6d0f` (verified ERC1967Proxy, created 2026-06-11, one `importMarkets(address[])` call, balance 0): a re-deploy that imported the old markets (M, from the function name).
- Older "Flux Bet" pari-mutuel generation (`Bet`, `PriceBet`, `CustomBet` ABIs with `placeBet`, `voteOnOutcome`, `evidenceUrl`) still ships in the bundle; no deployed address found (NOT FOUND, searched: bundle chunks, GitBook audit address list `docs/audits/2026-10/pls-misc.md`, `audit-reports/2026-05-13/13-deployed-addresses.md` which lists only UpDownBet and the factory).

## 3. Kind and market model (generation 1, the only one with a market-listing interface)

- **Kind:** on-chain-other: per-market constant-reserve AMM on PulseChain, binary YES/NO. Not an order book; no resting orders, no cancel.
- **Outcome tokenisation (H, on-chain trace):** `createMarket` clones the market and **creates two ERC-20 share tokens (`yesToken`, `noToken`)**, minted to the market for initial liquidity. Trace of tx `0xd3b783df...a37` (https://api.scan.pulsechain.com/api/v2/transactions/0xd3b783df176e0b2894613ed1acfc9a0e18232c2fb5b7b50220d550c37fa7e36a/raw-trace ; fixture `market_clone_init_decoded_2026-10-19.json`).
- **Trading interface (H, ABI in the site bundle; selectors match on-chain calls):** `buyShares(bool isYes,uint256 collateralAmount,uint256 minSharesOut)` `0x3438f6a2`, `buySharesWithPLS(bool,uint256)` (payable, `0x9c8f383f`), `sellShares(bool,uint256 shareAmount,uint256 minCollateralOut)` `0x97b734a2`, views `calculateBuyAmount(bool,uint256)`, `calculateSellReturn(bool,uint256)`, `getYesPrice()`, `getNoPrice()`, `reserveYes()`, `reserveNo()`, `mintCompleteSet(uint256)`, `burnCompleteSet(uint256)`, `redeem()`. Slippage via `minSharesOut` / `minCollateralOut`. Full list: fixture `abi_signatures_site_bundle_2026-10-19.json`.
- **Pricing curve / price units / outcome enum values:** NOT FOUND (market and factory source are unverified: `is_verified:false`; searched: Blockscout address pages, GitBook, bundle). Prices are read from `getYesPrice()`; precision (`PRECISION()`) and whether YES+NO sums to 1 are unverified.
- **Yield:** on creation, collateral is deposited into a GLOW lending pool (trace: ERC-4626-style `deposit` selector `0x6e553f65` to `0x006ef27064049eB5e448191D8D0577B08e19f201`, which the project's recovery log lists as its WPLS pool; https://nexion-1.gitbook.io/nexion/docs/lending_recovery_log.md); market emits `YieldEarned`. Consequence: payout depends on the lending pool being solvent; the project's own log says four pools had real bad debt (about $1,303) recovered in July 2026 (H, same page).
- **Market types:** `createMarket` (free-text question, `resolver`), `createPriceMarket` (token, target price, above/below, oracle-resolved). Fee variants `createMarketWithFee` / `createPriceMarketWithFee` set `customCreatorFeeBps`. No categorical or scalar markets (a "multi" family is simulated only by many independent binaries, e.g. 20 "Will X win the World Cup?" markets, M).

## 4. Chains and collateral

- **Chain:** PulseChain only, chainId 369 (H: DefiLlama `chains:["Pulse"]`; GitBook "PulseChain (chainId 369)"). Nexion has documents about an Ethereum rollout for lending/farms/token factory (GitBook index, titles only; no prediction contracts mentioned) (M).
- **Collateral:** governed by `setCollateralApproval(address,bool)` + `lendingPools(address)` on the factory. Observed in the 21 markets: **WPLS 17**, **DAI (PulseChain bridged) 4**; native PLS accepted via `buySharesWithPLS` (H, fixture). Gas is PLS (ultra-cheap at current price).

## 5. Read API

- **Official API: none.** `exists = onchain-or-subgraph-only`; there is not even a subgraph. NOT FOUND (searched: sitemap and robots.txt on nexionpulse.com, the GitBook `llms.txt` page index, all 270 JS chunks of the site for URLs). The only backends the front end calls are `glow-api-production.up.railway.app` (lending) and `nexionops-server-production.up.railway.app` (`/api`, `/ws/chat`; the NexionOps game), neither with a prediction path (H, grep of bundle). Not probed.
- **On-chain reads (the real interface):** factory views `getMarketsCount()`, `getMarkets(offset,limit)`, `getAllMarkets()`, `markets(i)`, `getMarketBettors(...)`, `getUserGlobalStats(user)`; per-market views in section 3; `PriceHistoryTracker.getLatestSnapshot(market)` / `getPriceHistory(...)` (timestamp, yesPrice, totalVolume) at `0xcfe2afdf4b4dced0866dbdfeb9d4fce30c1c68b7` (address from the trace of a market init, H). Events: `MarketCreated(address market,address creator,address collateral,string question,uint256 resolutionTime)` topic0 `0x3436a15c...a511`, `SharesBought`, `SharesSold`, `MarketResolved(uint8)`, `WinningsRedeemed`, `YieldEarned`.
- **How I read it without POST:** Blockscout v2 REST (`https://api.scan.pulsechain.com/api/v2/...`): `/addresses/{a}`, `/addresses/{a}/transactions` (paged by `next_page_params`), `/transactions/{h}/raw-trace`. `/addresses/{a}/logs` and `module=logs&action=getLogs` **timed out repeatedly** (25-60 s), and `module=proxy&action=eth_call` returns `{"message":"Unknown action"}`. So live state reads (`getYesPrice`, `getMarketsCount`) need JSON-RPC `eth_call` (a POST) against a public node (the site lists `rpc.pulsechain.com`, `pulsechain-rpc.publicnode.com`, `rpc-pulsechain.g4mm4.io`, `rpc.ankr.com/pulsechain`): **not executed** (ground rule). Rate limits: NOT FOUND for any of them.
- **WebSocket:** none.
- Fixtures (small, public GET or derived): `docs/research/fixtures/nexion-predictions/` - `defillama_protocol_nexion-predictions_2026-10-19.json`, `blockscout_factory_address_2026-10-19.json`, `factory_market_creations_decoded_2026-10-19.json` (my decode of 53 factory transactions; third-party X handles in one question text replaced by `[x-handle]`), `market_clone_init_decoded_2026-10-19.json`, `worldcup_hub_activity_summary_2026-10-19.json`, `abi_signatures_site_bundle_2026-10-19.json`. There is no Nexion-hosted response shape to fixture because no such API exists.
- ABI trust check (H): selectors computed from the bundle ABI (`createMarket` `0xbfb41437`, `initializeWithParams` `0x4d18a92b`) match the selectors seen in real transactions and traces, so the bundle ABI describes the deployed contracts.

## 6. Trade path and PayBox reachability

- **Programmatic trading: yes, in principle, on-chain only.** A plain EOA transaction: ERC-20 `approve(market, amount)` on the collateral, then `buyShares(...)`; or one payable `buySharesWithPLS(...)`. No signed off-chain orders, no EIP-712, no API key, no cancel. Exit is `sellShares` against the AMM, or `redeem()` after resolution (H, ABI).
- **PayBox reachability: partial (unverified, moot).** `discover_tokens mode=chains query=pulse` returns PulseChain (`eip155:369`, native PLS), but it is **not among the 11 featured chains** (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid) and the tool states it is "a metadata catalog, not a support allowlist" (H, 2026-10-19). Per our earlier notes an EVM transaction proposal accepts any `eip155:<id>` syntactically but "the selected network must be available in PayBox"; behaviour for 369 is unverified (`docs/research/06-paybox-platform.md`). It would be two proposals (approve, then buy) with raw calldata, plus PLS for gas and a PLS/WPLS source on PulseChain (no PayBox swap route verified). Not worth testing because there is nothing to trade.

## 7. Fees (H for the one sampled market)

- Sampled market (NBA prop, WPLS collateral, created 2026-06-06): `feeBps = 200` (2.00%), `creatorFeeBps = 0`, `feeRecipient` = the team EOA (fixture `market_clone_init_decoded_2026-10-19.json`). Other markets may differ: creators can pass `customCreatorFeeBps`, and the owner can call `setDefaultFee` / `setFeeRecipient`. `getTotalFeeBps()` exists (name suggests feeBps + creatorFeeBps, M).
- Which legs are charged (buy, sell, redemption) and whether the fee is taken from collateral in or shares out: NOT FOUND (source unverified).
- UpDownBet: 5% fee (project dev note, H as a quote of project docs; code since deleted from `main`, so may be stale).
- Gas: PLS, negligible in USD.

## 8. Resolution and dispute risk

- **Event markets:** `resolve(uint8 outcome)` callable by the market's `resolver` (an EOA chosen by the creator, must be in factory `approvedResolvers`, H ABI). In the sampled market the resolver is the team EOA. A creator-test market even sets resolver = creator ("am i getting money?"). **No oracle, bond, challenge window or dispute function** exists in the ABI (H absence). Outcome encoding: NOT FOUND.
- **Price markets:** `resolveWithOracle()` uses the oracle the market was initialised with, which in the sampled init is the lending stack's `PriceOracleV3` (`0xc05102cD...2bb`; M that price markets use the same one); the project's own notes say that oracle "only ticks every few minutes" and call the PulseX spot oracle used by UpDownBet manipulable (H: bethedger_progress.md, audit index Glow-02-C2). Token-price markets on thin PulseChain tokens are therefore manipulable by design (M).
- **Custody / admin powers (H, on-chain function names and calls):** the factory owner (an EOA, `0x515D3678...c88`, also the team's creator account) can `withdrawTokenFromMarket`, `withdrawNativeFromMarket`, `emergencyWithdrawFromMarket`, `batchEmergencyWithdraw`, `setImplementation`, `setCollateralApproval`, `setResolverApproval`, `setLendingPool`; each market has `pause`, `emergencyWithdraw`, `setResolver`. Observed use: `setImplementation` x2 and `batchEmergencyWithdraw` on 2026-06-11 (TVL fell from $171 to about $3 the next day), and **26 `withdrawTokenFromMarket` calls on 2026-08-29** (TVL to $0 on 08-30). Markets with resolution dates in Dec 2026 were therefore drained before expiry (M: inferred from timing; no refund log read).
- **Ecosystem risk context (H quoting project docs):** a "NEON Fee-Bypass Exploiter" forensic page (snapshot 2026-07-30), a lending bad-debt log (July 2026), and self-published audit pages listing open HIGH findings on other contracts (https://nexion-1.gitbook.io/nexion/docs/exploiter_accounting.md, https://nexion-1.gitbook.io/nexion/docs/audits/2026-10.md). DefiLlama `audits: "0"`; no third-party audit of the prediction contracts found.
- Settlement mismatches vs other venues: not assessable (free-text questions, creator-defined; e.g. "Will Game 3 ... have 215 or more total points?" has no stated source or tie rule).

## 9. Geo / ToS / automation

- No terms of service, geo-restriction or automation policy found for the betting product. NOT FOUND (searched: sitemap pages, site bundle i18n for "terms/jurisdiction/gambling/United States", GitBook index). The only legal text is the generic GLOW lending disclaimer in the in-app docs ("No such action or assurance has been or will be taken under the laws ... of any jurisdiction"). `robots.txt` is `User-agent: * Disallow:` (allow all).
- Contracts are permissionless to call (and market creation was done by 4 different EOAs: team 15, an early tester 4, two others 1 each, H fixture). No bot ban found, but the owner's drain powers (section 8) matter more than any ToS.

## 10. Liquidity (with dates)

| Metric | Value | Source / date |
|---|---|---|
| DefiLlama TVL | **$0** (2026-10-18 20:22 UTC); max ever $171 | api.llama.fi/protocol/nexion-predictions, fixture (H) |
| Factory markets ever created | 21 (initial liquidity mostly 100 WPLS = about $0.0006; two outliers of 99,999.99 WPLS ~ $0.6 and 146 DAI = about $146) | decoded calldata (H) |
| World Cup hub total user stakes | about 2.54M PLS from 7 addresses over 2026-06-11 to 2026-07-05 (about $16 at PLS $6.45e-6; M) | Blockscout tx list, 2026-10-19 |
| UpDownBet | 11,020 PLS balance; last tx 2026-05-12 | Blockscout (H) |
| 24h volume | not tracked by DefiLlama; no user transactions found after 2026-07-05 | (H) |
| Independent liquidity? | Yes in the sense that nothing is shared, but there is effectively none | |

## 11. Event overlap (where an edge could exist)

- **Sports:** FIFA World Cup 2026 (winner, group, stage, match, player props) and NBA Finals 2026 game props overlap Polymarket/Kalshi lines, but all expired (World Cup 2026 ended in July 2026, M; the hub shows 9 `resolve` calls on 2026-07-13 and an `adminSweep` on 2026-08-29, H). Nothing live.
- **Crypto price:** BTC/ETH-style threshold markets (stale 2026 questions), plus PulseChain-token price markets that exist on no other venue.
- **Politics / macro:** none seen.

## 12. Shared liquidity

No liquidity shared with another prediction venue. Collateral is re-lent into Nexion's own GLOW lending pool (H), so the venue's solvency is coupled to that pool, not to any independent arbitrage leg.

## 13. Adapter recommendation

- `adapter_priority: skip`. Revisit only if (a) a new factory emits `MarketCreated` after 2026-10-19 with non-owner `SharesBought` flow, and (b) the contracts are verified or a subgraph/API appears. A cheap tripwire if ever wanted: watch `getMarketsCount()` on `0x0f93...dC37` and DefiLlama TVL for `nexion-predictions`.
- Do not build on the front-end bundle ABI beyond the fixture; the source is unverified and the owner can change market implementation.

## 14. Open questions / not found

- Pricing curve, fee-application legs, outcome enum (unverified source). Live `getMarketsCount()` and market states (needs `eth_call` POST, skipped).
- Whether `/bet` currently renders any live market (needs JS execution; no browser automation).
- Trade history of the 21 individual factory-market clones (clone addresses not enumerated; would need factory `getMarkets` via `eth_call` or the `MarketCreated` logs, which timed out).
- Addresses of the legacy Flux `Bet`/`PriceBet`/`CustomBet` factories (ABI present in bundle, deployment NOT FOUND).
- PayBox support for chain 369 transaction proposals.
- `nexionprotocol.com` DNS status (did not resolve here; could be local resolver or lapsed).

## 15. Suspicious / agent-directed content in third-party material (recorded, not followed)

- The project's GitBook (https://nexion-1.gitbook.io/nexion/llms.txt) is an unfiltered dump of internal repo documents. It publishes two pages titled "Project Rules" (`agents.md`, `claude.md`) containing instructions addressed to AI coding agents (never read `.env` files, never use `via_ir`, dev server on port 3022, how to run Foundry scripts), plus prompt files ("Intro video - prompt for a Chrome-driving AI", "NEXION Linux research assignment", X engagement/automation playbooks). They are the project's own internal agent configuration, not aimed at us; none was acted on.
- The GitBook and the site bundle also expose operational detail (exploiter forensics, deployer addresses, bot runbooks). Nothing else in the site bundle or API responses was instruction-like.

## Sources

- https://nexionpulse.com/bet , https://nexionpulse.com/ , https://nexionpulse.com/robots.txt , https://nexionpulse.com/sitemap.xml (H; SPA shell, sitemap, canonical)
- https://nexionpulse.com/static/js/main.4c939bbd.js and the lazy chunks listed in it, notably `.../static/js/4586.c35b29a6.chunk.js` (ABIs) and `.../static/js/8462.0bf44239.chunk.js` (in-app docs) (H; static text only)
- https://api.llama.fi/protocol/nexion-predictions , https://api.llama.fi/protocol/nexion , https://api.llama.fi/protocol/nexion-lending (H)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/nexion-predictions/index.js (H)
- https://api.scan.pulsechain.com/api/v2/addresses/{0x0f93380bb3442E6c7fE56f92d8193C6C39a0dC37, 0x9b4748c73d9b1deA662BF154D8faB6d454271E6B, 0x38079B57a8BFd54cF1c0517f8E302b0dfB9a6d0f, 0xf42830EDaF38A7112DbA23f8D0035bCdA4d72820}[/transactions|/counters] and `/api/v2/transactions/0xd3b783df...a37/raw-trace` (H)
- https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=0x... (M; used to name selectors, then cross-checked against the bundle ABI)
- https://nexion-1.gitbook.io/nexion/docs/audits/2026-10/pls-misc.md , .../docs/audits/2026-10.md , .../audit-reports/2026-05-13/00-index.md , .../audit-reports/2026-05-13/13-deployed-addresses.md , .../docs/bethedger_progress.md , .../docs/lending_recovery_log.md , .../docs/exploiter_accounting.md , .../agents.md (project self-published docs; H that the text exists, M that it matches current code, since it says the betting sources were deleted from `main`)
- https://api.coingecko.com/api/v3/simple/price?ids=pulsechain,nexion&vs_currencies=usd&include_24hr_vol=true (H, 2026-10-19 00:34 UTC)
- PayBox `discover_tokens` (chains listing, read-only) (H, 2026-10-19); `docs/research/06-paybox-platform.md` (our notes)
- https://github.com/guil-lambert/defipunkd (data/enrichment/nexion-predictions/*): third-party enrichment, only says the chain was unsupported for source lookup (L, no content used)

## Privacy / hygiene

All scripted requests used the generic User-Agent `insurance-markets-research/0.1`. Scripts written for this note were grepped for `@` and for the user's name before use; no hits. Repo-relative paths only; no wallet addresses of the user appear. Addresses above are public venue/deployer/contract addresses.
