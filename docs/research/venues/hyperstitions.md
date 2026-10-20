# Hyperstitions (hyperstitions.com) - venue spec

Researched 2026-10-19. Read-only: public web pages, unauthenticated GETs to DefiLlama, CoinGecko and Sourcify public APIs, Monadscan public address pages (read through WebFetch, which returns a small-model extraction rather than raw HTML), TLS handshakes and DNS lookups, `gh api` raw reads of public repos. No accounts, no wallet connection, no POST (so no JSON-RPC `eth_call` either), no signing, no PayBox money or signing tools (one read-only `discover_tokens` chain lookup only). Generic User-Agent only. Fixtures in `docs/research/fixtures/hyperstitions/`.

Confidence tags: H = read first-hand in a primary source this session; M = secondary, inferred, or relayed through a summariser; L = weak or stale. Where Monadscan facts are tagged H they were read on the explorer page itself (the explorer is the primary on-chain record), but the extraction step was a summariser, so the exact contract addresses and counts should be re-checked before anyone relies on them.

## Verdict

- Adapter priority: **skip**.
- Product is functionally **dead**, even though a marketing page and a token still exist. The last on-chain market activity was **2026-01-31** (refunds), the last transaction from the project deployer was **2026-03-04**, the docs and app sites were **deleted from Vercel** (`DEPLOYMENT_NOT_FOUND`, TLS certs expired Aug and Sep 2026), DefiLlama shows **zero volume since 2025-12-17**, and CoinGecko has no price update since 2026-06-25 and no tickers.
- Even when alive it would not be worth an adapter: no API (on-chain only), collateral is the project's own volatile token HST (not USD), per-market centralised resolver with no dispute path, markets are self-referential crypto micro-events (token price targets of its own launches, tweet mentions) with essentially no overlap with other venues, and the headline volume looks circular (see Liquidity).
- The only reason to keep it on any list: the concept (market creator subsidises one side so a group has a financial incentive to cause the outcome) is a manipulation-risk flag, i.e. a reason to distrust such venues as price signals.

## Liveness (still live in 2026?) - NO (landing page only)

Evidence, newest first:

- **www.hyperstitions.com** returns 200, static Next.js page served from Vercel cache (`age: 463516` s, about 5.4 days), page text unchanged: "$9M+ Total Volume", "7 Active Markets", "3 Resolved YES", recent markets table dated Dec 2025 to Jan 2026. `sitemap.xml` lastmod 2026-10-13 and a Let's Encrypt cert issued 2026-09-17 show the landing page is still being redeployed or auto-renewed. It contains **no link to an app or docs**, only the X account and seven X posts (H, `fixtures/hyperstitions/www_home_visible_text_2026-10-19.txt`, `www_sitemap_2026-10-19.xml`). `/docs`, `/app`, `/markets`, `/api`, `/api/markets`, `/terms`, `/tos`, `/privacy`, `/legal` all 404 (H).
- **docs.hyperstitions.com and app.hyperstitions.com** (surfaced by web search as the docs and trading UI) both resolve to Vercel but answer `404 x-vercel-error: DEPLOYMENT_NOT_FOUND` on `GET /` (deployment deleted), and their TLS certificates **expired and were not renewed**: docs cert notAfter 2026-08-16, app cert notAfter 2026-09-11 (H, `docs_app_vercel_404_2026-10-19.txt`). `api.hyperstitions.com` does not resolve (H).
- **On-chain** (Monad mainnet, chain id 143, Monadscan pages read 2026-10-19):
  - Latest PAMM market contract `0x512d81DC69617B00FD415E42a0927bBeb975282e` (deployed 2026-01-16 13:30:43 UTC by the project deployer): 71 transactions, **latest 2026-01-31 09:49:28** (a `Refund`), preceded by `Invalidate` of the second market on 2026-01-30 22:40:57 and refunds to several traders. Only two markets were ever created on it (2026-01-16 18:25:33 and 2026-01-30 17:56:02). Holds 0.41 HST (H).
  - Original PAMM `0x97b4a6b501C55cCC7A597E259266E7E28A2d0BE0` (the one DefiLlama tracks): 3,427 transactions, **latest 2025-12-17 20:35:20 UTC (block 42698976)**, MON balance 0, holds 1,570,020 HST worth $235.99 (H).
  - Pre-launch test PAMM `0x02D41ACb39c102FCF90d798AD0004673d9032F4E`: 2 transactions, both `Create Market` on 2025-12-04 (H).
  - Deployer `0xC5f80A2887edb752dFA120371B69B821a36bd8ab` (public tag "HYPERSTITIONS: Deployer"): 88 transactions, latest **2026-03-04 15:51** (collect LP fees, withdraw WMON, swap on Uniswap Universal Router, transfer HST: looks like treasury wind-down), nothing since (H).
- **Social**: the project's last market announcement visible on the site is X post id 2012231019995308192 = **2026-01-16 18:30 UTC** (decoded from the snowflake id; "Top #6 Kaito Mindshare"). I could not read X itself, so I do not know whether later posts exist (L on "nothing since").
- **Token**: HST `0x97401d48a80b15bc7291599e24b590eedcd7ce37` still exists. CoinGecko `last_updated` 2026-06-25, price $0.00015, market cap $64.6K, 24h volume $122.7, ATL $0.000147 on 2026-06-24, **no tickers, no 30-day price series** (H, `coingecko_coin_2026-10-19.json`). A Monadscan token page snippet dated 2026-10-11 shows 512 holders and "market cap" $150,310 (that figure is exactly price times 1B total supply, i.e. FDV, M). LBank's price page states "LBank does not support trading or services for this token" (H).
- No news, shutdown notice or relaunch announcement found (searched: web "Hyperstitions HST Monad shut down OR sunset OR paused OR relaunch 2026", X not readable).

Timeline (H unless noted): 2025-10-14 concept tweet from a third party about "hyperstition markets" (M, not the project); 2025-12-03/04 launch, HST ATH $0.007013 at 2025-12-04 09:30 UTC; volume only on 2025-12-04, 05, 08, 09, 11, 12, 17; 2025-12-10 DefiLlama TVL PR opened and closed unmerged; 2026-01-16 third PAMM deployed and one market run; 2026-01-30/31 second market invalidated and refunded; 2026-03-04 deployer wind-down transactions; 2026-06-25 last CoinGecko data; 2026-08-16 and 2026-09-11 docs/app certs lapse.

## Kind and market model

- Kind: **onchain-other**, fully on-chain **AMM + parimutuel hybrid** ("PAMM", described as "Pot-split AMM"). No order book, no off-chain matcher.
- Site/aggregator description: "parimutuel-style betting combined with constant-product pricing and virtual liquidity"; markets "sometimes lasting only hours"; winners split the pot pro rata (LBank page and a web-search summary of the docs; M/L, the docs themselves are down).
- Contract (verified on Monadscan, "Exact Match", Solidity 0.8.30, optimizer 200 runs, cancun, license None; Sourcify has **no** match for any of the three PAMM addresses or for ZAMM; H for verified status, M for the ABI list because it came through a summariser):
  - Constructor `(address _zamm, address _stt)`; immutables `HST_TOKEN()` and `ZAMM()`. The event field is named `sttIn`/`sttOut` ("stake token"), and the adapter on DefiLlama treats it as HST. Collateral and payout are in **HST, not USD** (H via the DefiLlama adapter, M via bytecode reference).
  - `createMarket(string description, address resolver, uint72 close, bool canClose, uint256 seedYes, uint256 seedNo)` and `createMarketWithPMTuning(..., PMTuning t)` where `PMTuning = {uint32 lateRampStart, uint16 lateRampMaxBps, uint16 extremeMaxBps}`. No caller restriction is visible in the ABI, so market creation looks **permissionless** (M).
  - Trading: `buyYesViaPool`, `buyNoViaPool`, `sellYesViaPool`, `sellNoViaPool`. Quotes: `quoteBuyYes(marketId, yesOut)` / `quoteBuyNo` returning `oppIn`, `sttInFair`, `p0`/`p1`; `quoteSellYes`, `quoteSellNo`; `impliedYesProb`. Views: `getPool` (returns `rYes`, `rNo`, `kLast`), `getMarket`, `getMarkets`, `getUserMarkets`, `getMarketId`, `getNoId`, `markets`, `marketCount`, `allMarkets`, `descriptions`, `tradingOpen`, `winningId`, `pmTuning`, `pmTuningFinal` (M).
  - Lifecycle: `closeMarket`, `resolve(marketId, bool outcome)`, `claim(marketId, to)`; the third deployment also shows `Invalidate` and `Refund` calls in the deployer's and traders' transaction lists (H, method names on Monadscan).
  - Events: `Created`, `Seeded`, `Bought(buyer, id, sharesOut, sttIn)`, `Sold(seller, id, sharesIn, sttOut)`, `Closed`, `Resolved`, `Claimed`, `PMTuningSet`, `ResolverFeeSet`, ERC-6909-style `Transfer`/`Approval`/`OperatorSet` (M; the `Bought`/`Sold` signatures are H from the DefiLlama adapter source).
- Outcomes: **binary YES/NO only**. Each market has a YES id (= market id) and a NO id (`getNoId`), tokenised as **ERC-6909-style multi-token balances inside the PAMM contract** (functions `approve(spender,id,amount)`, `transfer(receiver,id,amount)`, `setOperator`, `balanceOf`), with a **ZAMM pool** (Uniswap-V2-style AMM on ERC-6909, contract `0xe5e5bE029793A4481287Be2BFc37e2D38316c422`, verified on Monadscan, same code family as the public `z0r0z/zAMM` repo, M) providing the YES/NO reserves (M).
- Mechanism claims from the project (L, marketing): the protocol "subsidizes the NO side" so YES is cheap; "before the market opens, the protocol buys NO with emissions" (web-search summary of the docs). The ABI shows `seedYes`/`seedNo` parameters and `SeedBothSides`/`PoolNotSeeded` errors, consistent with creator-seeded pools (M). The exact pricing code was **not readable** (Monadscan source tab did not render through the fetcher).
- Markets seen (site table, all from Dec 2025 to Jan 2026, H as to what the page says): "Token reaches $0.0077" (NO, $252K), "Token reaches $0.003" (YES, $211K), "@[handle] mentions the token" (NO, $1.06M), "Launchpad token reaches $200K MC" (NO, $7.42M), "Capricorn liquidity pool hits $1M" (YES, $81K), "@[handle] changes PFP to $EMO" (NO, $35K), "Top #6 Kaito Mindshare" (YES, $6K). All are about small tokens or social-media behaviour.

## Chains and collateral

- Chain: **Monad mainnet**, chain id **143**, native MON (H: DefiLlama `chains: ["Monad"]`, Monadscan, docs.monad.xyz/developer-essentials/network-information). Site only says "EVM" / "EVM-compatible Layer 1".
- Collateral: **HST** ERC-20 `0x97401d48a80b15bc7291599e24b590eedcd7ce37` (18 decimals per adapter `/1e18`, total supply 1,000,000,000, circulating about 429.9M; CoinGecko id `hyperstitions`; H). Bets are denominated in this volatile token, so every position carries HST price risk on top of outcome risk. Price path (CoinGecko history, H): $0.00553 (2025-12-04), $0.00235 (2025-12-11), $0.00137 (2025-12-17), $0.00051 (2026-02-01), $0.00015 (2026-06-25 last update).
- Treasury address listed in the DefiLlama PR: `0x7efd20565D24f6bf5F01e4E514D330cd4cEfB471` (H as to the PR text).

## Read API

- Official public API: **NONE**. `exists: onchain-or-subgraph-only`.
- NOT FOUND (searched: homepage HTML and links, `/docs`, `/api`, `/api/markets`, `/llms.txt` (404 page), `api.hyperstitions.com` (no DNS), docs and app subdomains (deployments deleted), GitHub repo search for "hyperstitions" (0 hits), DefiLlama listing (`github: null`), web search for REST/SDK/OpenAPI/subgraph/GraphQL/WebSocket). Docs content could not be read at all: Wayback Machine returned 429 and "temporarily offline" on 2026-10-19.
- Practical read path (documented in principle, **not exercised** because JSON-RPC is POST): call the PAMM view functions (`getMarkets`, `getPool`, `impliedYesProb`, `quoteBuyYes`...) or `eth_getLogs` for `Bought`/`Sold`/`Created`/`Resolved` on Monad public RPC. Public endpoints (docs.monad.xyz, H): `https://rpc.monad.xyz` (QuickNode, 25 rps, batch 100, WSS `wss://rpc.monad.xyz`), `https://rpc1.monad.xyz` (Alchemy, 15 rps), `https://rpc2.monad.xyz` (Goldsky, 300 per 10 s), `https://rpc3.monad.xyz` (Ankr), `https://rpc-mainnet.monadinfra.com` (20 rps). Explorers: monadscan.com, monadvision.com. Etherscan-V2-style API needs a key (`Missing/Invalid API Key` seen, H), and the Monad Blockscout host I tried returned 404.
- Third-party aggregates that do exist: DefiLlama volume adapter (`dexs/hyperstitions/index.ts`, targets `0x97b4...0BE0`, events `Bought`/`Sold`, start 2025-12-03; it does **not** include the newer `0x512d...` contract; H) and CoinGecko token data. DefiLlama TVL adapter PR #17375 was **closed unmerged** on the DefiLlama-Adapters repo (created 2025-12-10; stated TVL $40; H), so the DefiLlama listing is volume-only (`tvl: []`).
- Rate limits for an official API: not applicable. Websocket: none (RPC WSS only).

### Fixtures (all unauthenticated GETs, 2026-10-19)

These are shapes of aggregator responses, not a Hyperstitions API (none exists).

- `defillama_protocol_2026-10-19.json` (663 B): `api.llama.fi/protocol/hyperstitions` (id 7135, token address, `chains: ["Monad"]`, empty TVL).
- `defillama_dexs_summary_2026-10-19.json` (20 KB): `api.llama.fi/summary/dexs/hyperstitions`; `totalDataChart` has 319 daily points from 2025-12-04 to 2026-10-18, only 7 non-zero.
- `coingecko_coin_2026-10-19.json` (20 KB), `coingecko_simple_price_2026-10-19.json` (187 B, `last_updated_at` 1782398980 = 2026-06-25).
- `docs_app_vercel_404_2026-10-19.txt` (response headers, DEPLOYMENT_NOT_FOUND, cert dates), `www_home_visible_text_2026-10-19.txt`, `www_sitemap_2026-10-19.xml`.

## Trade path

- Programmatic trading would be **direct contract calls** to the PAMM contract: `approve` HST to the contract, then `buyYesViaPool` / `buyNoViaPool` / `sellYesViaPool` / `sellNoViaPool`, then `claim` after `resolve`. No API key, no off-chain order signing, no EIP-712 order scheme found. Exact parameter lists (min-out, receiver, deadline) are **NOT FOUND** (searched: Monadscan ABI summary lists names only; Sourcify has no match; docs offline).
- Currently there is nothing to trade: no open market and no app. A new market could be created permissionlessly by anyone (M), but that is not an arbitrage leg.

## PayBox reachability

- `paybox_reachable`: **partial**. Monad (eip155:143, MON) is present in PayBox's chain catalog when searched by name (`discover_tokens mode=chains query=monad`, 2026-10-19), though not among the 11 featured chains listed in `06-paybox-platform.md`, and the tool says the catalog "is not a support allowlist" and "Signing permissions are unchanged". Whether PayBox can propose arbitrary contract calls on Monad is unverified here. Funding would need MON for gas plus HST (swap via a Uniswap pool on Monad; the deployer used Uniswap Universal Router `0x0D97Dc...9dc3` and an LP position, H as to the tx labels). Moot because there is no live market.

## Fees

- NOT FOUND for the trading fee (searched: homepage, LBank page, Monadscan ABI summary, Sourcify; source tab not rendered). Docs offline.
- Inferred from ABI (M/L): a **per-resolver fee** in bps (`setResolverFeeBps(uint16)`, `resolverFeeBps(address)`, `ResolverFeeSet` event, `FeeOverflow` error; a bytecode comparison against 1000 suggests a cap of 10%, L). Pool swap fee through ZAMM: unknown (Uniswap-V2-style pools normally take a fixed fee; NOT FOUND for these pools). `PMTuning.lateRampMaxBps` / `extremeMaxBps` suggest additional bps charges or price adjustments late in a market or at extreme probabilities (L).
- LBank page: "Trading fees generated within the ecosystem are typically used for token buybacks" (L, generic aggregator copy).

## Resolution mechanism and dispute risk

- Per-market **`resolver` address chosen by the market creator** at `createMarket`; only that address can call `resolve(marketId, outcome)` (`OnlyResolver` error); `closeMarket` is available when `canClose` is true (`NotClosable` error); the newer contract adds `Invalidate` and `Refund` (H on method names, M on semantics). No oracle, no bonding, no dispute window or appeal seen anywhere (NOT FOUND, searched: ABI function and error list, homepage, FAQ).
- Who the resolver was in practice: NOT FOUND (not read from chain; the deployer called `Resolve` and `Close Market` on 2026-01-16 and `Invalidate` on 2026-01-30, H, so the project operator acted as resolver at least for those).
- Dispute risk: **very high**. A single trusted party resolves, can invalidate, and (by design) is also the party that subsidises one side. Resolution sources for the listed markets are X posts, Kaito mindshare rank, token price and market cap thresholds, which are subjective or manipulable. A UI-level bet that "participants push the price toward the target" is explicitly the product thesis, so the markets are open to self-fulfilling manipulation by construction.

## Geo / ToS / automation

- NOT FOUND (searched: homepage and footer, `/terms`, `/tos`, `/privacy`, `/legal` all 404; docs and app deployments deleted). No geo-block or KYC evidence either way. Contracts look permissionless (M). Automation rules: none stated.

## Liquidity

- DefiLlama (`api.llama.fi/summary/dexs/hyperstitions`, fetched 2026-10-19, last data point 2026-10-18): all-time volume **$9,069,279**; 24h, 7d, 30d volume all **0**. Daily USD volume (H): 2025-12-04 252,942; 12-05 211,618; 12-08 340,518; 12-09 721,854; **12-11 7,424,790**; 12-12 81,826; 12-17 35,731; nothing after. The homepage's "$9.06M" equals this sum.
- Volume quality: the adapter prices raw HST amounts at CoinGecko's token price. Dividing 12-11's $7.42M by that day's HST price ($0.00235) gives about **3.16 billion HST**, over three times the entire 1B supply, and CoinGecko showed only $10.6K of HST spot volume that day. So the number reflects heavy recycling of a few holders' tokens through the pools (or a pricing artefact), not $9M of distinct risk capital (M, my arithmetic on H inputs). The Prediction Markets Index entry, which I could not open, reportedly lists total volume under $100K (L, search snippet).
- Current depth: PAMM `0x97b4...0BE0` holds 1.57M HST = **$235.99** (Monadscan, 2026-10-19, H). DefiLlama TVL: none listed; the closed PR stated $40 (2025-12-10). HST market cap $64.6K and 24h volume $122.7 (CoinGecko, data stamped 2026-06-25, stale 4 months, H). Any quote would be a few dollars deep at best.

## Event coverage / overlap with other venues

- Crypto micro-events only: price or market-cap targets for small and launchpad tokens, a single-account tweet mention, a profile-picture change, Kaito mindshare rank, DEX pool TVL. No sports, politics, macro, or major-asset (BTC/ETH) price markets seen.
- Overlap with Polymarket, Kalshi, Limitless, XO and others: effectively **none** (at most a loose analogue to "will X mention Y" and token-price-threshold markets on other venues, but these specific events are not listed elsewhere). Nothing for an arbitrage scanner; as a signal source the quotes are single-resolver, token-denominated and manipulable.

## Shares liquidity with another venue?

- No. Self-contained pools inside PAMM/ZAMM on Monad. It does reuse a public AMM family (ZAMM, z0r0z) but not another venue's liquidity. So it is independent, but there is no liquidity to be independent about.

## Adapter recommendation

- **skip.** Re-check only if (a) a new PAMM deployment or a market-creation transaction appears from the deployer, or (b) an app or docs site returns, or (c) HST regains CoinGecko tickers. If revived, the adapter would be an on-chain reader (Monad RPC `eth_call` on `getMarkets`/`getPool`/`impliedYesProb`, logs for `Bought`/`Sold`), read-only signal use at most.

## NOT FOUND (all searched)

- Official docs content (site deleted; Wayback unavailable 2026-10-19; only search-engine summaries of it).
- Pricing and fee formulas (Monadscan source tab did not render; Sourcify no match for the PAMM and ZAMM addresses).
- Terms of service, geo restrictions, KYC.
- Resolver addresses per market, market list on `0x512d...` (only 2 `Create Market` txs seen), exact function parameter lists.
- Any public REST, GraphQL, subgraph, SDK or WebSocket; any GitHub repository for the protocol.
- Shutdown or sunset announcement (X not readable).

## Open questions

- Who is the resolver on live markets and is it always the deployer?
- Did a later PAMM version ship from a different deployer address after 2026-03-04?
- What is the real ZAMM pool fee and the PMTuning behaviour?
- Is the $9M DefiLlama volume mostly self-trading (needs log-level analysis of `Bought`/`Sold` on `0x97b4...0BE0`, which requires JSON-RPC POSTs I did not make)?

## Sources

- Official site (H): https://www.hyperstitions.com/ , https://www.hyperstitions.com/sitemap.xml , https://www.hyperstitions.com/robots.txt ; X account https://x.com/hyperstiti0ns (not fetched; post ids decoded to dates only).
- Docs/app (H that they are gone): https://docs.hyperstitions.com/ and https://app.hyperstitions.com/ (Vercel `DEPLOYMENT_NOT_FOUND`, expired certs); titles and contents seen only in web-search result summaries (M/L).
- DefiLlama (H): https://api.llama.fi/protocol/hyperstitions , https://api.llama.fi/summary/dexs/hyperstitions , adapter https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hyperstitions/index.ts , closed TVL PR https://github.com/DefiLlama/DefiLlama-Adapters/pull/17375 (also https://defillama.com/protocol/hyperstitions, which returned 403 to the fetcher).
- CoinGecko (H): https://api.coingecko.com/api/v3/coins/hyperstitions , `/simple/price`, `/coins/hyperstitions/history?date=...` , page https://www.coingecko.com/en/coins/hyperstitions (search hit only).
- Monadscan (H for what the pages show, extracted via summariser): https://monadscan.com/address/0x97b4a6b501C55cCC7A597E259266E7E28A2d0BE0 , https://monadscan.com/address/0x512d81DC69617B00FD415E42a0927bBeb975282e , https://monadscan.com/address/0x02D41ACb39c102FCF90d798AD0004673d9032F4E , https://monadscan.com/address/0xe5e5bE029793A4481287Be2BFc37e2D38316c422 , https://monadscan.com/address/0xC5f80A2887edb752dFA120371B69B821a36bd8ab ; token page https://monadscan.com/token/0x97401d48a80b15bc7291599e24b590eedcd7ce37 (403 to the fetcher; the 2026-10-11 holder count is from a search snippet, M).
- Sourcify v2 lookups (no match): https://sourcify.dev/server/v2/contract/143/{address}.
- Monad network info (H): https://docs.monad.xyz/developer-essentials/network-information .
- Aggregator descriptions (L): https://www.lbank.com/price/hyperstitions , https://www.alchemy.com/dapps/hyperstitions .
- Upstream AMM family (M): https://github.com/z0r0z/zAMM (ZAMM.sol, Uniswap V2 style on ERC-6909; the PAMM source itself was not found in any public repo).
- PayBox chain catalog (H): `discover_tokens mode=chains query=monad`, 2026-10-19; prior note `docs/research/06-paybox-platform.md`.
