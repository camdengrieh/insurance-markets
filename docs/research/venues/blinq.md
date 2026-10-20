# Blinq (predictions.blinq.fi / blinq.fi) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:30-04:45 UTC). READ-ONLY: page and bundle reads, `gh api` file reads, unauthenticated GETs, PayBox catalog reads (`discover_tokens` only). No account, wallet, signature, API key, POST, on-chain call or money-moving PayBox tool. JSON-RPC `eth_call` was deliberately NOT used because it is an HTTP POST. Third-party pages, repo text and explorer pages were treated as untrusted data; nothing in them was followed. WebSearch hit the shared session budget after two queries, so press and X coverage is thin (x.com returned HTTP 402 with no payment terms shown; recorded and stopped).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/blinq/` (section 12).

---

## 0. Bottom line

1. **Blinq is currently PAUSED.** As of 2026-10-19 the app at `predictions.blinq.fi` is a static shell that says "We're under maintenance. Blinq is currently unavailable. Trading, wallets and all markets are paused", with the Connect Wallet button disabled ("Unavailable during maintenance"). The page was last deployed 2026-10-18 06:10 GMT. (H)
2. **It is a crypto up/down game, not an event-market venue.** Live products (until the pause): Price Arena (Up/Down and "Relative/Momentum" on BTC/ETH/SOL plus later stocks and commodities, fixed windows 5m-1h) and Candle Rush (green/red candle on 5m/15m/30m). Every "event" market on the marketing site is labelled demo data. (H)
3. **Chain is Monad (chain 143), not BNB Chain.** The PI hint "BNB Chain" is not supported by any primary source. One third-party memo says a future "Blinq Markets (BSC)" is planned; nothing is live. (H for Monad, M/L for BSC plan)
4. **Fixed-odds against a house vault, not an order book.** Price Arena payouts are a per-market `winRatio` (changelog: "win up to 1.95x"), with open and close fees; there is no price discovery and no secondary market. Candle Rush's pool mechanics are only described in marketing copy. (H for ABI and "1.95x", M for the vault model, which is inferred from the upstream ApolloX source)
5. **Liquidity is effectively nil right now.** The Diamond contract holds 13.92 USDC and 58.97 MON (explorer, 2026-10-19); the 15 most recent transactions to it are all keeper/admin "Update ..." calls, none are user bets, with nothing newer than 2026-10-18 22:00 UTC. (M, WebFetch summary of monadscan.com)
6. **adapter_priority = skip** while paused. There is no documented public read API (the beta API host no longer resolves), odds are fixed so there is no signal, and capacity per side is capped by tiny `maxUpUsd/maxDownUsd`. Revisit as P2 (signal-only) only if it relaunches with disclosed volume (section 11).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://predictions.blinq.fi/` (curl, 2026-10-19 04:31 UTC) | HTTP 200, Vercel; `last-modified: Sun, 18 Oct 2026 06:10:37 GMT`; HTML shell only (`<title>Blinq \| Candle Rush & Prediction Markets</title>`) | H |
| App bundle `/assets/index-BfJBGsjD.js` (52 KB) | Entire app is a maintenance screen: heading "We're under maintenance", body "Blinq is currently unavailable. Trading, wallets and all markets are paused while we work behind the scenes."; header nav items rendered `aria-disabled`; Connect Wallet button `disabled` with title "Unavailable during maintenance"; "Spot Market" and "Derivatives" flagged `soon:true`. Fixture `predictions_bundle_maintenance_excerpt_2026-10-19.js.txt`. | H |
| `sitemap.xml` | lists only `/` and `/price-arena` | H |
| Monad official protocol registry | `monad-crypto/protocols` `mainnet/blinq.jsonc`: `"live": true` (registry entry; may lag the pause) | H |
| Contract activity | `monadscan.com/txs?a=<Diamond>`: latest 15 txs all from one admin/keeper address, "Update Relative ..." / "Update Predictio..." at 2026-10-18 22:00:02-05 and 2026-10-16 21:00:01; no `placeBet/predictAndBet/predictRelativeAndBet` rows visible. Lifetime tx count 686,259. | M (WebFetch summary; page columns truncated) |
| Last public changelog entry | 2026-04-06 "Live Stocks Are Here" (`blinq-fi/updates-config`, repo last pushed 2026-04-06) | H |
| Launch date | 2026-01-16 "Blinq Launch" (changelog); contract created about 302 days before 2026-10-19 per explorer, i.e. around late December 2025 | H / M |

Verdict: **still_live = false in the sense that matters (trading paused, UI replaced by maintenance notice since about 2026-10-18)**. The project itself (org, registry entry, marketing site) still exists. No ETA found. Whether this is a short maintenance, a migration, or a wind-down is unknown.

Marketing site (`www.blinq.fi`, "Blinq | Trade the outcome") is a separate Vite build (last modified 2026-10-17 23:22 GMT) and still describes "Live prediction markets, settled in USDC", but its own footer says "Prices, duels and balances on this page are demo data" and a margin demo says "Simulation for illustration. The margin layer is not live." (H)

---

## 2. Kind and market model

- **Kind (H):** on-chain, gamified short-dated price prediction on Monad, settled in USDC, built as an EIP-2535 Diamond (`0x928dC8aFe312df45576B15B08C086c5427fd8207`). Explorer labels the verified contract "ApolloX" (M, monadscan summary), i.e. a fork or deployment of the ApolloX/Aster perp-contracts prediction modules. Org tagline: "The Derivatives Layer for Prediction Markets" (GitHub org `blinq-fi`).
- **Products** (official `blinq-fi/agent-skill` SKILLS.md, H):
  - **Candle Rush:** will the next candle of asset X close GREEN (close > open, `side=0`) or RED (`side=1`); candles 300/900/1800 s; bet is placed on a FUTURE candle open (`openTime` = next bucket start, rejected if already passed). `placeBet`, `batchPlaceBet`, `claim(asset, intervalSeconds, openTime, betId)`, `batchClaim`.
  - **Price Arena UP/DOWN:** `predictAndBet({recipient, predictionPairBase, isUp, period, tokenIn, amountIn, price, broker})`; closes above/below entry after N minutes (period enum: 0=1m, 1=5m, 2=10m, 3=15m, 4=30m, 5=1h, per mm-bot `types.go`).
  - **Price Arena RELATIVE ("Momentum"):** `predictRelativeAndBet({... ruleType 0=highest/1=lowest, sideIndex, assets[], acceptableEntryPrices[]})`: which asset in a basket has the best or worst % move.
- **Assets:** BTC, ETH, SOL (addresses and Pyth ids in SKILLS.md, fixture); stocks AAPL, AMZN, TSLA, NVDA, GOOG, META, NFLX added 2026-04-06 (changelog, H); GOLD, SILVER, WTI mentioned in SKILLS.md tolerance table (H, not verified live).
- **Outcome tokenisation:** none. Positions are contract records keyed by id (events `PredictAndBetPending`, `PredictAndBet`, `PredictRelativePending`; Candle Rush by `(asset, interval, openTime, betId)`), not ERC-20/1155 shares. No transfer or sell-before-expiry path is documented. (H for ABI, M for "no secondary market")
- **Pricing model (M):** upstream ApolloX `PredictUpDownFacet.sol` (`apollox-finance/apollox-perp-contracts`, same `PendingPrediction`/`PredictAndBetPending` fields as Blinq's ABI) is fixed-odds against the protocol vault: on a win the user gets `betAmount + betAmount*winRatio/1e4 - closeFee`, paid from the vault; on a loss the stake (less a close fee) goes to the vault; per-side USD caps `maxUpUsd/maxDownUsd` (and `maxSideUsd[]` for relative). This contradicts the marketing demo text "the winning side splits the pool / Closed flat. Pools return" (www.blinq.fi bundle), which may describe Candle Rush or may be loose copy. Which model each live Blinq facet uses is NOT verified.
- **Two-step entry (H via upstream code, M for Blinq):** the bet first emits `...Pending`; a keeper callback supplies the oracle entry price; the bet is refunded if the feed is late (`FEED_DELAY`) or the entry price breaches the user's `price` tolerance (`USER_PRICE`). So entry price is not known at signing time.

---

## 3. Chains and collateral

- **Chain: Monad mainnet, chain id 143** (SKILLS.md and mm-bot `config.yaml`; Monad registry; airdrop/ecosystem pages). RPC `https://rpc.monad.xyz`. (H)
- **Collateral: USDC** `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`, 6 decimals (SKILLS.md). PayBox's token catalog lists the same address as "USDC" on eip155:143 (liquidity about $14.7M, 24h volume about $1.9M per catalog, 2026-10-19). (H)
- `getTokenForPrediction(token)` view exists, so other tokens may be whitelisted, but the docs say "USDC is the only payment token". (H)
- **Funding in the UI (changelog 2026-04-03, H):** cross-chain USDC deposits from Ethereum, Arbitrum, Base and more are auto-bridged into the Blinq account ("Rescue Funds" for stuck deposits). This is app plumbing, not a documented API.
- **Gas:** the app sponsors gas through ZeroDev smart accounts with a paymaster ("no MON needed", changelog 2026-01-29) and uses session keys (2026-02-12). A raw EOA must hold MON; the official bot funds sub-wallets with 0.5-1 MON per about 50-100 txs. (H)
- **BNB Chain:** NOT FOUND in any primary source. Only a third-party VC memo (`yoitsyoung/foundry-nyc-33` memo 03) says "Blinq Markets (BSC)" for planned permissionless market creation, and a CryptoRank-style page claims Dfyn rebranded to blinq; neither verified. A BscScan address (0xb02690b1...3ea12d00e) surfaced in a search result for this query but could not be fetched (HTTP 403) and no source ties it to Blinq. (L)

---

## 4. Read API

**Verdict: no documented public read API. On-chain reads plus Pyth are possible in principle; the market-metadata API is private and its host currently does not resolve.**

| Item | Finding | Tag |
|---|---|---|
| Docs | NOT FOUND (searched: `docs.blinq.fi` NXDOMAIN, `api.blinq.fi` NXDOMAIN, `research.blinq.fi` NXDOMAIN, `blinq.fi/changelog` not fetched, site bundles, `blinq-fi` org repos, web search). Only the agent skill file is "documentation". | H |
| Market registry | Official bot queries a Hasura GraphQL (`HASURA_URL`, `POST`, optional `x-hasura-admin-secret`) with collections `PredictionConfig {chainId,minBetUsd,predictionBet,predictionSettle}` and `PredictionMarket {id,name,kind(UP_DOWN\|RELATIVE),base,marketHash,ruleType,assets,periodKeys,periods{period,periodSeconds,status,winRatio,openFeeP,winCloseFeeP,loseCloseFeeP,payoutBps,netWinPayoutBps,maxUpUsd,maxDownUsd,maxSideUsd}}`. The URL is an env var and is not published. Fixture `blinq-fi_mm-bot_hasura_graphql_query.txt`. | H (query), URL NOT FOUND |
| API host | `https://beta.api.blinq.fi/reward-service/api/rewards/points/{address}` (points only; from a third-party points-aggregator adapter, `0xPortalLabs/points-adapters`). `beta.api.blinq.fi` did not resolve on 2026-10-19 (curl exit 6). | M / H |
| On-chain getters | `getPredictionConfig()` -> `(minBetUsd, isActive, autoSettle)`; `getTokenForPrediction(address)`; `getRelativeMarkets(start,size)` returns name, marketHash, ruleType, assets, `pythPriceIds`, periods with `winRatio/openFeeP/winCloseFeeP/loseCloseFeeP/maxSideUsd`. UP/DOWN pair config getters are in upstream ApolloX (`getPredictionPairByBase`, `getPredictionMarket`) but not in Blinq's published ABI subset. I did not call them (POST). | H (ABI), calls untested |
| Events | `PredictAndBetPending`, `PredictRelativePending`, upstream `PredictAndBet`, `SettlePredictionSuccessful`, `PendingPredictionRefund`. Usable for volume indexing from Monad logs. | H / M |
| Prices | Pyth Hermes `https://hermes.pyth.network/v2/updates/price/latest?ids[]=...` and SSE `.../stream` (documented in SKILLS.md). The web app itself uses `https://pyth.dourolabs.app/hermes`, Pyth benchmarks `https://pyth.dourolabs.app/v1/real_time` and Aster futures klines `https://fapi.asterdex.com/fapi/v3/markPriceKlines` + `wss://fstream.asterdex.com/plain/stream` for charts. These are reference prices, not Blinq data. | H |
| Auth / rate limits / WebSocket | No Blinq API auth or limits documented. Web app wallet login is Dynamic.xyz + hCaptcha (CSP of `predictions.blinq.fi`); smart accounts/session keys via ZeroDev. No Blinq WebSocket documented. | H / NOT FOUND |

Real response shapes: **none obtainable** (no public endpoint). Fixtures saved are the live maintenance shell, the Monad registry entry, the official agent-skill spec, the Hasura query text and the changelog JSON (section 12).

---

## 5. Trade path

**Direct EVM contract calls on Monad (H, official `blinq-fi/agent-skill` SKILLS.md; also mm-bot Go code):**

1. One-time: `USDC.approve(DIAMOND, MAX_UINT256)` (approval check, then tx).
2. Hold MON for gas (gas limits suggested: 800,000 for Candle Rush; 1,000,000 for Price Arena) unless going through Blinq's gasless smart-account route.
3. `diamond.placeBet(...)` / `predictAndBet(...)` / `predictRelativeAndBet(...)` as in section 2. `amountIn` is `uint96`, `broker` is `uint24` (wrong widths change the selector and revert). Broker `1` is the default. `price` = acceptable entry in 1e8 fixed point, built from a fresh Pyth price (<= 30 s old) widened by a tolerance (100 bps crypto, 300-1000 bps commodities/equities).
4. Candle Rush: `claim`/`batchClaim` after settlement; Price Arena settles automatically via keeper (config flag `autoSettle`).

- **Signing scheme:** ordinary EVM transaction signatures (chain id 143). No EIP-712 order signing, no API key, no CLOB. (H)
- **Cancel:** no cancel or exit documented. A bet is final once placed, apart from refunds on late feed/slippage. (H absence)
- **Aggregator implication:** it is a "take fixed odds" venue. There is no quoting, no limit orders, no way to be a maker, so it can only be a taker leg at the fixed payout.

---

## 6. PayBox reachability

**paybox_reachable = partial (untested, and moot while paused).**

- PayBox's chain catalog does contain Monad: `discover_tokens mode=chains query=monad` returned `{caip2: eip155:143, chain: monad, native_symbol: MON}` (not among the 11 "featured" chains recorded in `docs/research/06-paybox-platform.md`), and the Monad USDC address above is in the token catalog. The tool notes it is "not a support allowlist". (H, 2026-10-19)
- Trade shape is an ERC-20 `approve` + one Diamond call, both single-call EVM transactions, so the `io.paybox/transactionProposal`/`request_wallet_sign` `transaction` shapes could express it if PayBox supports chain 143 for signing/proposals. Support for proposals or raw signing on 143, and whether PayBox can broadcast, is NOT FOUND and untested. Per the project's PayBox notes an EVM MPC wallet shares one address across all `eip155:*` chains, and the EOA pays gas in the native currency (MON).
- Getting funds onto Monad (USDC + MON) through PayBox swaps/bridges is unverified; Monad is not a "featured" swap chain. A user would need to bridge externally.
- Blinq's gasless route requires its own smart account/session-key login (Dynamic + ZeroDev), which PayBox cannot drive.

---

## 7. Fees

- Per-market parameters exist on chain per period: `openFeeP`, `winCloseFeeP`, `loseCloseFeeP`, `winRatio` (all basis points /1e4; `uint16`). **Actual values NOT FOUND** (would need `getRelativeMarkets` / pair config reads or the private Hasura; not read).
- Upstream ApolloX formulas (M, inferred; Blinq's deployed code not read): `openFee = amountIn * openFeeP / 1e4`, deducted from the stake at entry (payer: bettor); `betAmount = amountIn - openFee`. Win: `profit = betAmount * winRatio / 1e4`, `closeFee = betAmount * winCloseFeeP / 1e4`, payout `betAmount + profit - closeFee`. Loss: bettor loses `betAmount`; `closeFee = betAmount * loseCloseFeeP / 1e4` goes to fee manager, rest to vault.
- Headline payout: "win up to 1.95x" (launch changelog 2026-01-16, H), implying `winRatio` up to about 95% before fees, so the house edge is the 1.95x payout vs a fair 2.0x plus fees, not a quoted spread.
- Broker id on each bet routes a share of fees to a broker (upstream `chargePredictionOpenFee(..., broker)`); the default broker `1` is Blinq's. (M)
- Rewards: third-party listing claims referral rewards of "30-38% of protocol fees" (buildermaps JSON, L).
- Gas: sponsored in the Blinq app; else MON on Monad.

---

## 8. Resolution mechanism and dispute risk

- **Source of truth:** Pyth price feeds (Hermes) per asset (`priceId` list in SKILLS.md); the app marketing says "priced by Pyth" (Monad registry description, H). The web chart also pulls Aster mark-price klines; which source determines Candle Rush open/close is NOT FOUND.
- **Who settles:** a keeper/admin address posts prices and settles (explorer shows a single address repeatedly calling "Update Predictio..."/"Update Relative ...", M; upstream design has `settlePredictions(SettlePrediction[])` and `predictionCallback(id, price)` taking a keeper-provided price, M). Whether the contract verifies Pyth update proofs on chain: NOT FOUND.
- **Dispute path:** none documented. This is an operator-trusted oracle/keeper model, not UMA or a challenge window. Diamond proxy means the admin can swap facets (upgradeable), and the same admin controls market config (`Update ...` calls). Third-party memo says no public audits (L).
- **Edge cases:** refunds on stale feed or slippage; flat close "Pools return" (marketing). Equity/commodity feeds can lag, hence wider tolerance guidance.

---

## 9. Geo / ToS / automation

- **ToS / geo:** NOT FOUND (searched: both site bundles' strings, `robots.txt`, sitemap; no legal/terms/privacy route exists in the maintenance shell). The marketing footer only says "Prediction markets carry risk, and positions can lose their full value." No geo-block statement was found; hCaptcha and Dynamic.xyz auth are loaded by the app (CSP). (H absence)
- **Automation:** explicitly supported by the operator's own org: `blinq-fi/agent-skill` ("How to place bets on the on-chain prediction protocol... implement a client in any language that can sign EVM transactions") and `blinq-fi/mm-bot`. `robots.txt` allows all crawlers. (H)
- **Caution (M):** both the skill file and `mm-bot` recommend/implement "hedged pairs" (opposite sides from two wallets, "one always wins (minus fees)", random wallet selection that "simulates organic activity", up to 1,250 deterministic wallets, optional referral-code redemption). That is volume/points farming for the airdrop programme, not arbitrage, and it makes Blinq's volume and activity figures unreliable. It is also a sybil/ToS risk for any rewards, though not necessarily for plain trading. The org `blinq-fi` is not GitHub-verified, but it is linked from the Monad registry domain (`blinq.fi`) and its repos use the registry's contract address, so attribution is M-high.

---

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Diamond USDC balance | 13.922931 USDC | monadscan address page, 2026-10-19 | M |
| Diamond native balance | 58.965 MON (about $1.26) | same | M |
| Lifetime txs to Diamond | 686,259 | same | M |
| Recent user activity | none visible in latest 15 txs (back to 2026-10-16 21:00 UTC) | monadscan txs list, 2026-10-19 | M |
| Volume / OI / TVL | not disclosed. Third-party memo (Foundry NYC 3.3, written about March 2026): "No verifiable on-chain volume data found"; not on DefiLlama (`api.llama.fi/protocols` has no Blinq entry, checked 2026-10-19) | memo L, DefiLlama H | |
| Per-bet sizing | official bot bets 0.1-1 USDC per leg; `minBetUsd` in `getPredictionConfig`; caps `maxUpUsd/maxDownUsd/maxSideUsd` unknown | mm-bot `config.yaml` | H |

Interpretation (M): the vault is the counterparty (upstream design) and holds about $14, so the venue cannot honour winning bets of any size right now. Treat depth as zero.

---

## 11. Event categories, overlap, shared liquidity

- **Live categories (until the pause):** crypto price direction (BTC/ETH/SOL; windows 5m, 15m, 30m, 60m), "relative momentum" among crypto baskets, single-stock up/down (7 US tech names), commodities (gold, silver, WTI; M). All of it is price-based and settled from Pyth.
- **Overlap with other venues (where arbitrage could exist):** short-window BTC/ETH/SOL up/down markets on Polymarket, Limitless, Kalshi 15-minute crypto, 9lives (15-minute BTC). No sports, politics or macro event liquidity: the "Fed cuts in December", "Arsenal reach the Champions League quarter-finals" etc. cards on `www.blinq.fi` are labelled "Demo markets with illustrative prices". (H)
- **Why it is a poor arbitrage leg:** (a) fixed odds with fees on entry and exit, no quote improvement; (b) entry price is fixed by oracle callback after the bet, so legs on other venues have basis risk (different strikes/reference prices, e.g. Blinq's entry vs Polymarket's window-open Chainlink price); (c) caps and tiny vault; (d) no exit; (e) the official hedged-pair pattern loses the fees on every cycle by construction.
- **Shared liquidity:** none with Polymarket/Kalshi today (own vault, own Diamond). The planned "terminal"/margin layer is to route to Polymarket and Kalshi and add leverage (marketing: "Building the margin layer for prediction markets"; "not live"; third-party: Polymarket markets "can be traded through this layer"). If that launches, those markets would be NOT independent legs; they would share Polymarket/Kalshi liquidity. The Diamond is an ApolloX-derived deployment; no evidence it shares liquidity with Aster. (H for "not live", M for the rest)

---

## 12. Adapter recommendation and fixtures

**adapter_priority = skip** (reason: trading paused with UI replaced by maintenance notice; near-zero vault; no public read API; fixed-odds house model = no price signal; farming-inflated volume).

If it relaunches: P2 (signal-only at best). A minimal adapter would be (1) on-chain reads of the Diamond on Monad (`getPredictionConfig`, `getRelativeMarkets`, event logs) and Pyth Hermes, no Blinq API needed; (2) trade via two-call EVM flow above. It would still not be an independent price-discovery source.

Fixtures saved in `docs/research/fixtures/blinq/`:

- `predictions_home_2026-10-19.http.txt` - headers and HTML of `https://predictions.blinq.fi/` (200, Vercel, `last-modified 2026-10-18 06:10:37 GMT`).
- `predictions_bundle_maintenance_excerpt_2026-10-19.js.txt` - excerpts of the app bundle proving the maintenance state and disabled nav/CTA.
- `monad-crypto_protocols_mainnet_blinq.jsonc` - Monad official registry entry (Diamond address, categories, `live: true`).
- `blinq-fi_agent-skill_SKILLS.md` - official betting spec (function ABIs, addresses, Pyth ids, tolerance math). Untrusted data; no embedded instructions beyond the technical steps.
- `blinq-fi_mm-bot_hasura_graphql_query.txt` - the GraphQL query the official bot uses for market metadata.
- `blinq-fi_updates-config_featuredUpdate.json` - official in-app changelog 2026-01-16 to 2026-04-06 (launch, gasless, Candle Rush, Zero Risk Mode, cross-chain deposits, stocks).

No real market-data API response could be captured (no public endpoint reachable).

---

## 13. Open questions

1. Why is Blinq paused (since about 2026-10-17/18) and is it coming back, migrating chains (e.g. to BSC), or winding down? Check `x.com/blinqFi` and Discord (X returned HTTP 402 to WebFetch; Discord invite `discord.gg/blinq` in registry, `discord.gg/sCGyH6cGwn` in the app bundle).
2. Actual `winRatio/openFeeP/winCloseFeeP/loseCloseFeeP` and `maxSideUsd` per market (needs `eth_call` on `getRelativeMarkets` / pair getters, which is a JSON-RPC POST; not done under this task's read-only rules).
3. Is Candle Rush pool-based or fixed-odds, and which oracle sets the candle open/close?
4. Does the live contract verify Pyth proofs on chain or trust a keeper-posted price?
5. Does PayBox actually support signing/proposals on eip155:143, and can the PayBox wallet obtain Monad USDC + MON?
6. The BscScan address 0xb02690b16fd8696ef13a63e3272404b3ea12d00e that appeared in search: is it any Blinq contract? (explorers returned 403/404 to unauthenticated probes)
7. Is the unverified-org `blinq-fi/mm-bot` run by the team (a volume-seeding tool) or a community tool?

---

## 14. Sources

Primary (H unless noted):

- `https://predictions.blinq.fi/` and `/assets/index-BfJBGsjD.js`, `/robots.txt`, `/sitemap.xml` (fetched 2026-10-19 with UA `insurance-markets-research/0.1`)
- `https://www.blinq.fi/` and `/assets/index-CrQl6n3L.js` (marketing site, demo disclaimers)
- `https://github.com/blinq-fi/agent-skill` (SKILLS.md; repo created 2026-06-08)
- `https://github.com/blinq-fi/mm-bot` (README, ARCHITECTURE, `config.yaml`, `internal/contracts/diamond.go`, `candlerush.go`, `internal/markets/*.go`)
- `https://github.com/blinq-fi/updates-config` (`featuredUpdate.json`, changelog)
- `https://github.com/monad-crypto/protocols/blob/main/mainnet/blinq.jsonc` (official Monad registry)
- `https://github.com/router-protocol/blinq-static-assets` (static images repo; indicates a Router Protocol org link, M)
- `https://github.com/apollox-finance/apollox-perp-contracts` (`IPredictUpDown.sol`, `IPredictionManager.sol`, `PredictUpDownFacet.sol`) - upstream code, used for the payout/fee model (M for Blinq)
- PayBox `discover_tokens` (chains `monad`, USDC on eip155:143), 2026-10-19
- `https://monadscan.com/address/0x928dC8aFe312df45576B15B08C086c5427fd8207` and `/txs?a=...` (WebFetch summaries, M)
- `https://api.llama.fi/protocols` (no Blinq entry)

Secondary / weak:

- `https://airdrops.io/blinq/` (updated 2026-07-24; "in beta", Monad, USDC, backers Sigma Capital / BlockTheory / Anurag Arjun) - M
- `https://airdropalert.com/airdrops/blinq-trading-terminal/` - M/L (affiliate-style)
- `github.com/yoitsyoung/foundry-nyc-33/blob/main/memos/03-blinq.md` (third-party VC memo; BSC plan, no verifiable volume) - L
- `github.com/chainbase-labs/buildermaps.io` `blinq.json` (30-38% referral claim, Opinion-Economy description) and `github.com/0x3f-lancers/dapp-registry` `blinq/meta.json` - L
- `github.com/0xPortalLabs/points-adapters` `adapters/blinq.ts` (beta API host path) - M
- `https://cryptorank.io/price/blinq` (403 on fetch; only the search snippet about a Dfyn rebrand) - L

---

## 15. NOT FOUND (searched: ...)

- Public API docs, OpenAPI, GraphQL endpoint URL (searched: site bundles, `blinq-fi` repos, docs/api/research subdomains, web search).
- Terms of service, geo restrictions, KYC (searched: site bundles, robots/sitemap, org repos).
- Actual fee and winRatio values; TVL/volume/OI figures; audit reports.
- Any primary source for BNB Chain deployment.
- Any maintenance ETA or announcement (X blocked with 402; Discord not read).

## 16. Suspicious content

None found. SKILLS.md and mm-bot docs are written as agent-oriented technical instructions (Step 0, bet pseudo-code); treated as data, not followed. Web search listed a `moltbook.com` post titled "BLINQ AGENT COMPETITION"; fetched once, it had no content beyond the title and no instructions.
