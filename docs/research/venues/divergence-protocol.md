# Divergence Protocol (divergence-protocol.com): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: official site, docs (GitBook, `.md` pages), official GitHub (via `gh api`), the public Next.js bundle of the app (read as text, not executed), unauthenticated GETs to the project's own API host, CoinGecko, GeckoTerminal, DefiLlama and a Medium RSS feed. Nothing was signed, posted, paid or installed. No JSON-RPC calls were made (they are POSTs, which the ground rules exclude), so **no on-chain state was read**.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

Limits of this pass: the shared WebSearch budget was exhausted, so there was no independent news/X/Telegram/Discord corroboration of status. Arbitrum Blockscout answered the cloudflare challenge (HTTP 403, `cf-mitigated: challenge`) so it was skipped, not worked around.

## Verdict

**adapter_priority: skip.** The protocol is dormant as a prediction venue.

- The only event-style markets ("Dive Bar") were a handful of 2024 pilots (Euro 2024, Paris Olympics, a Fed cut by 2024-09-30, BTC/ETH ATH by 2024-08-30). All have expired; the config repo has not changed since 2024-08-04. [H]
- The core product is digital (binary) options on BTCUSD and ETHUSD with daily/weekly/monthly expiries on Arbitrum One. No evidence of any active pool or any volume was found in 2026. [M, absence of evidence]
- No documented public read API, no websocket, no order-book; the only machine interface is the contracts plus an undocumented backend that returns placeholder/empty data. [H]
- Tiny scale (Euro 2024 incentive pools were 2,500 to 5,000 USDT), ToS excludes US/UK/EU/Canada, and settlement is owner-configurable. [H]

Revisit trigger (cheap, scriptable): `GET https://api.divergence-protocol.com/mostTvlBk` returns a non-zero collateral address and a real expiry (today: `["0x0000000000000000000000000000000000000000","BTC",0]`), or a new post appears on the Medium feed (last post 2024-07-09). Fixtures: `api-mostTvlBk.json`, `medium-feed-titles.txt`.

## 1. Is it still live? (piece by piece)

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| www.divergence-protocol.com | Serves HTTP 200, static React page, title "Divergence", description "Composable Crypto Options. Seamless, Capital Efficient, On-Chain." Last-modified 2025-03-29. No shutdown notice. | H: curl; WebFetch of it returned only the title (client-rendered) |
| app.divergence-protocol.com | Serves HTTP 200 (Next.js). Page chunk last-modified 2025-03-21. Meta: "Divergence is a decentralized exchange for trading options on arbitrum." Nav: Trade, Divebar, Analytics. | H: curl headers + HTML |
| docs.divergence-protocol.com | Serves HTTP 200 (GitBook, has `llms.txt`). Docs describe v1 on Arbitrum One. | H |
| api.divergence-protocol.com | Serves HTTP 200 (`Hello, Divers!`, AWS API Gateway, `access-control-allow-origin: *`). `/mostTvlBk` returns a placeholder. | H: fixtures `api-root.txt`, `api-mostTvlBk.json` |
| analytics.divergence-protocol.com | HTTP 200, but the page is an S3 static build last-modified 2024-05-28 (pre-v1 data source likely dead) | H: curl headers |
| Subgraph `api.thegraph.com/subgraphs/name/burlinpeter/divergence...` (hardcoded in app) | The Graph hosted service: GET returns 301 to `error.thegraph.com`, which does not resolve. Treat as dead. | H: curl; sunset itself is M |
| GitHub `DivergenceProtocol/diver-contracts` | Public, not archived, last push 2024-08-19, 2 stars, no license | H |
| GitHub `DivergenceProtocol/divebar` (prediction-market metadata) | Last commit 2024-08-04 ("update fed rate cut title") | H |
| Medium blog | Last post 2024-07-09 "Launching EURO2024 Prediction Markets"; before that 2023-12-21 "Divergence v1 is Live!" | H: RSS, feed lastBuildDate 2026-10-19 |
| DIVER token (Ethereum `0xfb78...d5f4`) | Exists. CoinGecko: price $0.00113, mcap about $746.6k, 24h volume $42.4k but CoinGecko `last_updated` is 2026-06-27 (stale by about 4 months). GeckoTerminal 2026-10-19: DIVER/WETH Uniswap v3 pool reserve about $3.1k, 24h volume $0. | H: fixtures `coingecko-coin-divergence-protocol.json`, `geckoterminal-diver-token-pools.json` |
| DefiLlama | **NOT FOUND** in `/protocols` (name/slug contains "diver": only unrelated DiversiFi on Solana and Apollo Diversified Credit) and not in the 35 protocols of `/overview/options`. | H: searched 2026-10-19 |

Net: web properties and the API gateway are up; the product has had no announced activity since 2024-08 and the backend shows no active pool. I set `still_live=false` with medium confidence (cannot rule out a live pool created without announcement, since I did not read chain state).

The CoinGecko hint ("AMM-based marketplace trading synthetic binary options on DeFi volatility; prediction-markets category") matches the CoinGecko description and categories (DeFi, Derivatives, Options, Prediction Markets, Ethereum Ecosystem). [H]

## 2. Kind and market model

- **Kind:** onchain-amm for digital options; prediction markets are a re-skin of the same contracts ("Dive Bar"). [H, https://docs.divergence-protocol.com/user-guide/dive-bar.md]
- **Instrument:** European digital (binary) options. One "Battle" (pool) per (underlying, collateral, strike, expiry); the Battle address is never reused after expiry. [H, https://docs.divergence-protocol.com/overview/protocol-basics/digital-options.md]
- **Outcome tokenisation:** each Battle mints two ERC-20s: **Spear** (digital call, pays 1 collateral if settle price >= strike) and **Shield** (digital put, pays 1 collateral otherwise). In Dive Bar pools Spear = YES and Shield = NO. LP positions are NFTs (Manager). [H]
- **Pricing/AMM:** Uniswap-v3-derived concentrated-liquidity AMM. A "virtual curve" tracks `sqrt(put price / call price)`; put-call parity forces `P_call + P_put = 1`, so a pool is effectively a single YES price with NO = 1 - YES. Quotes are bounded to [0.01, 0.99] collateral per token. LPs sell calls/puts in custom price ranges (like limit sell orders), seed deposit for selling at price N is `1 - N`. [H, protocol-basics/triangular-swaps.md, convertible-liquidity.md, options-specs.md]
- **Binary / categorical / scalar:** binary only, per strike. Multi-outcome events (e.g. "who wins the final") were modelled as two-way pairs ("Spain vs England") in Dive Bar config. [H, `github-divebar-config.json`]
- **Not an order book.** Dive Bar UI is "designed with some similarity to orderbooks", with each liquidity position a sell order in 30-tick steps. [H]
- **Exit asymmetry:** closing a long is not an instant swap; the docs say to "select a limit price to sell your holdings and confirm adding liquidity" and then finalize under Open Orders. Open shorts can only be closed in full. [H, dive-bar.md] This breaks the usual "unwind both legs" assumption of an arb scanner.

## 3. Chains and collateral

- **Chain:** Arbitrum One (chain id 42161). The docs deployment page lists only Arbitrum One. [H, https://docs.divergence-protocol.com/technical-reference/smart-contract-architecture/deployment-addresses.md]
- **Contracts (Arbitrum One):** Arena `0xA0D812cAe2376b90951192319477eF5Fe3Ac56D5`, Manager `0x55A14661d94C2cE307Ab918bb9564545282C2454`, Quoter `0x2791386ecE62d8Ec3D3b223871be192c6BD5D5D5`, Oracle `0x07C8C1e84C3814bfE2870Dfed24635Ef715aCB7c`, OracleCustom `0x1aBAE7617f6Ae462412788E5031dA3646F188607`, BattleImpl `0xB9A1B8dF279E20Ff7dC7A32EE15d3eF2d5E45F62`. [H] Existence/code not checked on chain (no RPC call made, see header).
- **Collateral:** ERC-20 whitelist ("WETH, USDT, DIVER, and Ditanic test coins" initially, 18-decimal tokens preferred); Arena can switch to permissionless mode. Stablecoin collateral => cash-settled; asset collateral => physically settled. The app's default collateral symbol is USDT. [H, options-specs.md; app bundle]
- **Underlyings whitelist:** BTCUSD, ETHUSD "in the initial phase". [H] The app code also references an "ETF" underlying filter (`battle_info.underlying.includes("ETF")`), purpose unknown. [L]
- **Other chains:** the DIVER token also exists on Ethereum, Arbitrum and Base (token only). No options contracts documented there. [H, docs/misc.-info/official-links.md]

## 4. Read API

**Official public API: none documented** (searched: docs `llms.txt` index of 50-odd pages, technical-reference section, README of `diver-contracts`, `divebar` repo; no REST/WS/GraphQL reference page). Classification: `onchain-or-subgraph-only`, plus an undocumented backend.

| Surface | What | Status |
|---|---|---|
| On-chain views | `Arena.getBattle(BattleKey)`, `Manager.positions(tokenId)`, `Manager.accountPositions(address)`, `Quoter.quoteExactInput(BattleTradeParams, battleAddr)` returns `(spend, get)`; Quoter is a revert-parsing quoter (Uniswap-v3 style, needs `eth_call`), `Quoter.getSTokenByLiquidity*`. | H (signatures from docs); not exercised |
| Public RPC referenced by app | `https://arb1.arbitrum.io/rpc` | H (in bundle) |
| `GET https://api.divergence-protocol.com/mostTvlBk` | returns `[collateral, underlying, expiry]` for the "most TVL battle"; today `["0x000...0","BTC",0]` (zero address, expiry 0, app treats `0` as "use default expiry"). Interpreted as "no battle with TVL". | H shape; M interpretation. Fixture `api-mostTvlBk.json` |
| `GET .../stoken-balance?user=<address>` | per-user Spear/Shield balances, rows carry `battle_info` (battle, collateral, underlying, ...). Returned `[]` for the zero address. | H shape of empty; row schema from client code only (L). Fixture `api-stoken-balance-zero-address.json` |
| `GET .../battles` | exists (other paths 404: `/battle`, `/pools`, `/tvl`, `/underlyings`, `/battles/active`) but returns `[]` with or without `?underlying=BTC`; params unknown, not used by the shipped client bundle. | H that it returns `[]`; semantics NOT FOUND. Fixture `api-battles-no-params.json` |
| Subgraph (The Graph hosted) | hardcoded in app; dead (see section 1) | H |
| Analytics site | static SPA from 2024-05, no API | H |
| WebSocket | NOT FOUND (searched: docs, app bundle) | |
| Auth / rate limits | None documented. API sends `access-control-allow-origin: *`. ToS only forbids "unreasonable or disproportionately large load". NOT FOUND (searched: docs, ToS, bundle) | H |

Two real response shapes were confirmed (`mostTvlBk` and the empty list endpoints) but they carry no market data. The CoinGecko coin endpoint (token only) is saved as a fixture for status context, not as a market feed.

For an adapter the only viable route would be: enumerate Battles from Arena events with `eth_getLogs` on Arbitrum, read pool state from each Battle, quote via the Quoter, and read oracle config from `Oracle`. None of this was exercised here.

## 5. Trade path

- **No off-chain signed orders.** Trading is plain contract calls on Arbitrum One. [H, docs periphery/manager.md, params.md]
- **Buy:** ERC-20 `approve(collateral -> Manager)` then `Manager.trade(TradeParams{battleKey, tradeType (buy Spear or Shield), amountSpecified, recipient, amountOutMin, sqrtPriceLimitX96, deadline})`, returns `(amountIn, amountOut, amountFee)`; Manager pays via `tradeCallback`. Slippage controls: `amountOutMin`, `sqrtPriceLimitX96`, `deadline`. [H]
- **Sell/close long:** add liquidity with Spear/Shield as seed (`Manager.addLiquidity(AddLiqParams)`, `liquidityType` collateral/Spear/Shield) at a limit price, then finalize with `removeLiquidity`/`withdrawObligation`/`redeemObligation`. Not an instant market sell. [H]
- **Exercise at expiry:** claim 1 collateral per winning token; Dive Bar docs say winners can exercise "an hour after settlement". Function name on Battle not read. [H for behaviour, NOT FOUND for exact call]
- **Create markets:** `Arena.createBattle(BattleKey)`; underlyings and collaterals whitelisted by the owner unless `setPermissionless()` was called (status unknown). [H]
- **Cancel:** not applicable (no resting off-chain orders); LP positions removed via NFT-based calls.

## 6. PayBox reachability

**paybox_reachable: partial.** Arbitrum (42161) is in PayBox's live chain catalog (repo note `docs/research/06-paybox-platform.md`, `discover_tokens mode=chains`, recorded there as H on 2026-10-19; M here since not re-run). The venue needs no EIP-712 order signing, only an ERC-20 approve plus a contract call, so any wallet that can propose arbitrary EVM transactions on Arbitrum could trade it in principle. Not "yes" because (a) I did not verify PayBox's arbitrary-calldata proposal path for this contract, (b) nothing tradable was confirmed live, and (c) the ToS excludes US/UK/EU residents. No PayBox tools were called.

## 7. Fees

All [H], https://docs.divergence-protocol.com/overview/protocol-basics/fees.md:

- **Transaction fee:** default **0.3% per notional**, "for each option token sold, a transaction fee of 0.003 collateral units applies". Charged to the trader on swap; distributed to active liquidity in range. Up to 1% tiers "may be added" via governance. Fee level is set per underlying (Arena owner `setFeeForUnderlying`), not per pool.
- **Exercise fee:** **0.15%** when option holders claim payoffs (read as `1 - 0.0015` collateral net per winning token; the base of the 0.15% is not stated, M). LPs are exempt.
- **Protocol fee:** 30% of the transaction fee plus the exercise fee (governance can change the fraction).
- No gas model documented; gas is Arbitrum gas. "Minimum Size: None. (Each transaction costs gas, however)". [H, options-specs.md]
- Trading cost for a scanner: taker pays 0.3% on tokens bought at price p, i.e. roughly 0.003 absolute per token regardless of p (so about 0.3 pp of notional, large relative to a 1 to 2 pp edge on cheap tokens). The 0.003 figure is from the docs; the "per token, not per spent" reading is my interpretation of "per notional". [M]

## 8. Resolution mechanism and dispute risk

- **Crypto-price pools:** settlement price from an on-chain oracle at expiry (UTC 08:00 daily/weekly/monthly; the 08:00 restriction was removed in contract commit 2024-07-17 "Remove the 8 o'clock time restriction"). The options-specs page says "heartbeat updates provided by Pyth"; the core Oracle docs describe a Chainlink `AggregatorV3Interface` reader; the repo has an "OraclePyth" commit (2024-05-27). The docs are inconsistent on which feed is canonical. [H for each statement, inconsistency noted]
- **Owner powers:** `Oracle.setExternalOracle(symbols, oracles)` and `Oracle.setFixPrice(symbol, ts, price)` are `onlyOwner`; `OracleCustom` exists for custom feeds. The owner can therefore set a settlement price. No timelock, multisig or dispute window is documented. [H for the function docs, NOT FOUND for governance/timelock details (searched: docs core/oracle.md, arena.md, ToS)]
- **Dive Bar (event markets):** "custom oracle contracts retrieving off-chain data feeds"; market details strings such as "Credible reports can be used. The Fed has the final word." (Fed pilot) and "Prices will be determined by the decentralized oracles" (BTC ATH). Resolution is effectively operator-decided; no UMA-style dispute flow. [H, `github-divebar-config.json`, dive-bar.md]
- **Audits:** ChainSecurity ("divergence-protocol-v1c") and MixBytes; listed by the docs, reports not read. [H that they are listed]
- **Dispute/resolution risk for cross-venue arb:** high. Strike semantics are "settles at or above strike" at a fixed 08:00 UTC fix, which rarely matches Polymarket/Kalshi crypto brackets on rules and timing; owner-set oracle adds counterparty risk.

## 9. Geo, ToS, automation

- ToS "Last Updated: March 23, 2023" (stale by 3.5 years). [H, https://docs.divergence-protocol.com/legal/terms-of-service.md]
- **Restricted Territories** include "The People's Republic of China (Mainland China), the United States of America, the United Kingdom, European Union, Canada, Australia, Burma, ... Iran ... Syria, Yemen", plus sanctions-list persons. Governing law: Seychelles. The ToS names the operator "Tenet". [H]
- **Automation:** no explicit bot/API clause found (searched ToS for scrap, robot, spider, automated, script, harvest: none). Prohibits "any action that imposes an unreasonable or disproportionately large load on our infrastructure" and "market abuse". [H]
- Docs contain the contact address for Dive Bar market requests (`mailto:`); no instruction to AI agents anywhere. The docs say "for the complete documentation index, see llms.txt", which is navigation only. [H]

## 10. Liquidity

- Options TVL / OI / volume: **NOT FOUND** (searched: DefiLlama `/protocols` and `/overview/options`, CoinGecko, GeckoTerminal, docs, app API). The only API signal is `/mostTvlBk` returning a placeholder. [H absence, M inference of near-zero]
- Scale indicators: Euro 2024 pools had incentive insurance funds of 2,500 USDT (semis) and 5,000 USDT (final) per the launch post. [H, Medium RSS 2024-07-09]
- DIVER token (not the markets): mcap about $746.6k, 24h volume $42.4k on CoinGecko (`last_updated` 2026-06-27, stale), but GeckoTerminal shows about $3.1k pooled liquidity in the main Uniswap v3 pool and $0 24h volume on 2026-10-19. [H/M]

## 11. Event overlap for arbitrage

- Core: BTCUSD and ETHUSD "above strike at 08:00 UTC" digital options. Overlaps in concept with crypto-price brackets on Polymarket, Kalshi, Limitless and others, but strikes are rounded to 2 significant figures, expiries are 08:00 UTC dailies/weeklies/monthlies, and settlement is oracle-spot not the other venues' index. Any link needs rule-hash review. [H for Divergence specs; M for overlap]
- Dive Bar pilots (sports, macro, crypto ATH): all expired 2024; no new entries since. [H]
- Politics: none. Macro: only the 2024 Fed pilot.

## 12. Shared liquidity

No. Divergence runs its own pools; Pyth/Chainlink are only price oracles, not liquidity. If it were live it would be an independent leg. The "independent liquidity" criterion is met in principle; the liquidity itself is missing. [H]

## 13. Suspicious content / hygiene

- None found aimed at AI agents in the site, docs or GitHub files read.
- The archived legacy repo `DivergenceProtocol/divergence-contracts--legacy` has a committed `.env` file in its root; **not read**, not recorded. (Credential-hygiene observation only.)
- The Dive Bar launch post advertises an "insurance fund" and an options airdrop for participants; marketing, irrelevant to the adapter.

## 14. NOT FOUND

- Official public REST/WebSocket API reference; API auth and rate limits.
- Any active Battle, TVL, OI, volume for the options markets in 2026.
- Governance, multisig or timelock for Oracle/Arena owner; canonical settlement feed (Pyth vs Chainlink).
- Exact `Battle` exercise function name (user-guide only describes UI).
- Whether Arena is in permissionless mode.
- Any post-2024-08 announcement, shutdown notice or migration notice (Twitter/Telegram/Discord not readable here; Medium last post 2024-07-09).
- On-chain contract code existence/activity (no RPC call; Blockscout cloudflare-gated).

## 15. Open questions

1. Are any Battles currently open with TVL? The decisive check is read-only JSON-RPC: Arena `getBattle` / `BattleCreated` logs on Arbitrum One since 2025-01. Needs a human OK to use `eth_call`/`eth_getLogs` (POST).
2. Who owns `Oracle` / `Arena` (EOA vs multisig), and when did the owner last transact?
3. Is the BTC/ETH daily options flow real anywhere (Arbiscan token transfer history for the Spear/Shield tokens)?

## Sources

- https://www.divergence-protocol.com/ (H; client-rendered SPA, title only via WebFetch; raw HTML read via curl)
- https://app.divergence-protocol.com/ and its Next.js chunks (`/_next/static/chunks/app/page-2cf90a71f400ffbc.js`, `app/layout-33af969cd07b8bd5.js`, `6877-9f3ab146d039e890.js`) (H, read as text)
- https://api.divergence-protocol.com/ , `/mostTvlBk`, `/battles`, `/stoken-balance?user=` (H, GET)
- https://analytics.divergence-protocol.com (H, headers)
- https://docs.divergence-protocol.com/llms.txt , overview/protocol-basics/{digital-options,triangular-swaps,convertible-liquidity,options-specs,fees}.md , user-guide/dive-bar.md , user-guide/long-options/exercise-options.md , technical-reference/{smart-contract-architecture/deployment-addresses,core/oracle,core/arena,periphery/manager,periphery/quoter,periphery/params,audit-reports}.md , legal/terms-of-service.md , misc.-info/official-links.md (H)
- https://github.com/DivergenceProtocol (org: `diver-contracts`, `divebar`, archived `divergence-contracts--legacy`, `assets`) via `gh api` (H)
- https://medium.com/feed/divergence-protocol (H, RSS GET; the medium.com page itself returned 403)
- https://api.coingecko.com/api/v3/coins/divergence-protocol (H)
- https://api.geckoterminal.com/api/v2/networks/eth/tokens/0xfb782396c9b20e564a64896181c7ac8d8979d5f4/pools (H)
- https://api.llama.fi/protocols and https://api.llama.fi/overview/options (H, searched for "diver")
- Repo note `docs/research/06-paybox-platform.md` (PayBox chain catalog, M here)
- Fixtures: `docs/research/fixtures/divergence-protocol/` (coingecko-coin-divergence-protocol.json, geckoterminal-diver-token-pools.json, api-mostTvlBk.json, api-battles-no-params.json, api-stoken-balance-zero-address.json, api-root.txt, app-bundle-endpoints.txt, docs-llms.txt, docs-deployment-addresses.md, docs-fees.md, docs-options-specs.md, github-divebar-config.json, medium-feed-titles.txt)
