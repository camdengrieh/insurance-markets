# Entrave (entrave.com) - venue spec

Researched 2026-10-19. READ-ONLY: public web pages, unauthenticated GETs (CoinGecko public API, GeckoTerminal public API, Sourcify, Discord invite lookup, DNS/whois), and `gh api` reads of the two GitHub accounts the listing points to. No accounts, wallets, keys, signing, POST/PUT/DELETE (so no JSON-RPC `eth_call` / `eth_getCode` either), no PayBox tools called, no browser automation. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**. Status: **not live in any usable sense** (H, details below).
- The official domain `entrave.com` is a parked, for-sale domain (Afternic/GoDaddy). There is no app, no docs, no API, no live Discord invite, no fetchable X account, and no public source for the market contracts. The only primary-source artefact is a one-commit "subgraph" GitHub repo from 2025-10-28 (the day the project's two GitHub accounts and its ENTRV token were created).
- What the repo does reveal is the intended design: a **crowd-funded "presale" per question**, which on graduation mints ERC-20 YES and NO tokens and seeds two PancakeSwap Infinity (v4) pools (YES/USDC and NO/USDC) on BNB Chain, resolved through Reality.eth with an owner-callable force-resolve override. That is a reasonable AMM design, but nothing proves any market was ever opened, and there is nothing to poll.
- The only measurable trading is in the **ENTRV meme-style token** (PancakeSwap v2/v3 and four.meme pools): $5.47M lifetime volume in the PancakeSwap v3 ENTRV/WBNB pool, 93% of it in October 2025 (launch week), under $1K per month since 2026-01, last day with any volume 2026-10-17 ($0.17). That is token speculation, not prediction-market liquidity (H, GeckoTerminal).
- Re-check triggers (any one makes it worth a second look): `entrave.com` (or another official domain) serves an app; a public Graph/subgraph query URL or a verified `PresaleManagerPCS` appears; CoinGecko/GeckoTerminal show pools for YES/NO tokens; the Prediction Index status moves off "waitlist".

## Liveness (still live in 2026?)

- **Website is parked for sale (H).** `GET https://entrave.com/` returns HTTP 200 with a 114-byte page whose only content is `window.location.href="/lander"`; WebFetch of the same URL got `307 -> https://forsale.godaddy.com/forsale/entrave.com` (a GoDaddy domain-for-sale page). Nameservers are `ns1.afternic.com` / `ns2.afternic.com`; A records 76.223.54.146 and 13.248.169.48; `app.`, `docs.` and `api.` subdomains resolve to the same two parking IPs (wildcard). whois (registrar and dates only): registrar GoDaddy, created 2005-05-10, updated 2026-06-11, expiry 2027-05-10. The 2005 creation date means the domain predates the project, so it may never have been the project's own site; I could not tell.
- **No alternative official domain (H).** `entrave.market`, `.io`, `.xyz`, `.fun`, `.app`, `.finance`, `.bet`, `.exchange`, `.org`, `.ai`, `.trade`, `tryentrave.com`, `tryentrave.xyz` all return NXDOMAIN (checked with dig on 2026-10-19).
- **Discord invite is dead (H).** CoinGecko lists `discord.gg/entrave`; `GET https://discord.com/api/v9/invites/entrave?with_counts=true` returns `{"message":"Unknown Invite","code":10006}`.
- **X account `@TryEntrave` (CoinGecko's listed handle): unreadable.** WebFetch of `https://x.com/TryEntrave` returned HTTP 402 (X gating the fetch tool; no payment requirements were offered, so this is not an x402 challenge). Activity unknown.
- **CoinGecko (H, API read 2026-10-19):** `entrave` / ENTRV, category "BNB Chain Ecosystem" + "Prediction Markets", `tickers: []`, `last_updated` 2026-09-24, no docs link, no whitepaper. The public page says "ENTRV tokens have stopped trading ... on all exchanges listed on CoinGecko" and "This coin doesn't currently have any trading pairs" (H, WebFetch of https://www.coingecko.com/en/coins/entrave). Market cap $2,146, 24h volume $2.98.
- **Prediction Index (M):** its ecosystem snapshot (HTML payload, saved 2026-10-18 in `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`) lists Entrave as BNB Smart Chain, binary, mechanism `amm`, website entrave.com, status **"waitlist"** (the site's own label; no launch).
- **DefiLlama (H):** `GET https://api.llama.fi/protocols` has no protocol whose name or URL contains "entrave" (no TVL or volume tracked).
- **GitHub (H):** two accounts, both created 2025-10-28, one repo each, one commit each, nothing since (see Sources). `entrave-market/entrave-contract`, the repo named in the subgraph manifest, returns 404 (not public).
- **Third-party coverage (L):** one extended WebSearch found only a Forbes price-tracker page repeating CoinGecko's description (WebFetch of that Forbes URL returned 404, so unread). No news, no audit, no announcement found. A second search was refused (session search budget exhausted), so coverage is thinner than I would like.

## Kind and market model

- Kind: on-chain, creator-driven prediction market, **AMM-based** (PancakeSwap Infinity / v4 concentrated-liquidity pools), BNB Chain. Source: CoinGecko description (H as a quote of the listing, not a product statement), Prediction Index (M), and the subgraph manifest/schema/ABIs (H that they say this; M that it was ever deployed as described).
- Lifecycle from the ABI/schema/events (H for the text, M for the semantics, no Solidity source seen):
  1. `createPresale(string question, uint256 targetAmount, uint32 deadline, uint256 minBond)` returns a `bytes32 presaleId`; the creator pays a creation fee (`PresaleCreationFeePaid`). Entity states: Active, Pending, Graduated, Cancelled, Resolved.
  2. `contributeToPresale(presaleId, amount)`: contributors fund the market in USDC until `targetAmount`; `cancelPresale`, `withdrawFromCancelledPresale` and `withdrawFromUnbondedPresale` give refunds.
  3. `graduatePresale(presaleId, yesOdds, noOdds)` (and an owner-style `forceGraduatePresale`): `TokenFactory.createPresaleTokens` mints a **YES and a NO ERC-20** (initial supply set by the manager), and `LiquidityManagerPCS.createLiquidity(presaleId, yesToken, noToken, tokenAmount, yesUsdcAmount, noUsdcAmount)` opens **two separate pools, YES/USDC and NO/USDC**, each as a concentrated-liquidity position NFT (`yesPositionId`, `noPositionId`, `tickLower`, `tickUpper`, optional `hooks` address, one pool fee per deployment). The initial odds are supplied by the caller at graduation (the schema stores `yesOdds`, `noOdds`).
  4. Trading: swap YES or NO against USDC in the pool, either directly on PancakeSwap or via the project's `SwapperV4FromPosition.swapFromPosition(positionId, tokenIn, tokenOut, amountIn, amountOutMinimum, recipient, deadline)` (wraps the Universal Router; it also has views `getMarketOdds`, `getMarketPricing`, `getPoolPrices`). `splitPresale(presaleId, usdcAmount)` appears to mint a YES+NO complete set from USDC (M; the event is commented out in the subgraph as "not in ABI yet").
  5. Resolution via Reality.eth, then `redeemTokens(presaleId, yesAmount, noAmount)` for USDC; creator and early funders claim LP shares (`claimCreatorShare`, `claimPresalerShare`).
- Binary only (Prediction Index lists `outcomeTypes: ["binary"]`; the ABI has only YES/NO tokens). No categorical or scalar. H for what the files say, M for "only".
- **Important arbitrage consequence:** YES and NO live in two independent AMM pools, so `price(YES) + price(NO)` can drift from 1.00. Complete-set mint/redeem (`splitPresale`, `redeemTokens`) would bound this, but that is speculative without the source. Pool prices come from `sqrtPriceX96` with a convexity from the tick range, not from a simple 1/x curve.
- Points: the subgraph awards "1 point per 1 token" of swap input ("Points calculation data", `pointsEarned`) - an incentive/farming signal (L, from code comments), which would inflate any volume numbers.

## Chains and collateral

- Chain: **BNB Smart Chain (chain id 56)** (H: manifest `network: bsc`; CoinGecko `binance-smart-chain`).
- Collateral: **USDC** by name (`USDC()` getter, `usdcAddress`, `usdcAmount` fields) with the code assuming 6 decimals and a 50 USDC default creation fee (the bootstrap block in `core.ts` is a Base-testnet template with TestUSDC/MockReality placeholder addresses, so L). Which USDC token address is used on BSC is NOT FOUND (the manifest does not state it; USDC on BSC (Binance-Peg) has 18 decimals, which would conflict with the 6-decimal assumption, so the subgraph may be mis-configured; M).
- Contracts claimed by the manifest (H that the file says so; **existence on-chain and bytecode NOT verified**, see Not found):
  - PresaleManagerPCS `0x46573032AEB982966716c7aB67b9a2051F8AD9c9`
  - TokenFactory `0x757b107204dFB12ab4ED52C96a3E68F1a872c39a`
  - LiquidityManagerPCS `0x5Fce5955Ad2a5C1a1E65D710c87E35810B054aA7`
  - SwapperV4FromPosition `0xF0609E8027BE4eF74C6FD2a93CDc3Ba578ff01e1`
  - startBlock 65531343.
  - Sourcify has **no match** for any of the four (`match: null`, H). The only Sourcify-verified contract is the ENTRV token (below).
- ENTRV token: `0xd6b8e4f8c9f4694ae8e2a9565f7e039307e98b34`, 18 decimals, supply 1,000,000,000, Sourcify exact match (verified 2026-06-04) (H). Pools (GeckoTerminal search, H): PancakeSwap v2 ENTRV/WBNB (x2), PancakeSwap v3 ENTRV/WBNB 1%, PancakeSwap v2 ENTRV/USDT, four.meme ENTRV/USDT, all created 2025-10-28. Reserves $3.0K-$6.8K each. This token is not a market contract and is irrelevant to prediction-market pricing.

## Read API

- `exists`: **onchain-or-subgraph-only** in principle, and in practice **none**.
- No official REST/WebSocket API, OpenAPI spec, docs site or llms.txt exists (the docs host does not exist; CoinGecko lists no docs link). NOT FOUND (searched: entrave.com, CoinGecko links, GitHub accounts, DNS of obvious alternative domains).
- The subgraph in `entraveprediction-prog/entrave-prediction/subgraph` (The Graph, AssemblyScript, `package.json` deploy target `graph deploy --studio presale-manager-protocol`) is the only indexer evidence. No public query URL is published (NOT FOUND); a query would be a GraphQL POST anyway. Useful entities if one ever appears: `Presale` (question, targetAmount, raisedAmount, deadline, state, yesToken, noToken, yesOdds, noOdds, resolutionMode, totalSwapVolume), `PoolKey`, `Swap`, `SwapVolume`, `PresaleResolution`, `PresaleRedemption`.
- On-chain reads that would be needed (all `eth_call`, i.e. JSON-RPC POST, which I did not run): `presales(bytes32)`, `getResolutionDetails`, `SwapperV4FromPosition.getMarketOdds/getMarketPricing`. Market discovery would need `PresaleCreated(bytes32,string,address,uint256,uint256,bytes32)` event logs.
- Rate limits / WebSocket: NOT FOUND (no service).

## Trade path

- Programmatic trading would be **plain EVM transactions on BSC, no off-chain orders and no signing scheme beyond a normal tx** (M, inferred from the ABI): `USDC.approve` then `contributeToPresale`, or `approve` then `SwapperV4FromPosition.swapFromPosition(...)`, then `redeemTokens`/`claim*` after resolution. No API key, no HMAC, no typed data.
- Nothing is verifiable end to end: contracts unverified on Sourcify, no source repo, no front end, and I cannot confirm any graduated market exists.

## PayBox reachability

- **partial (in principle only).** BNB Smart Chain (56) is in PayBox's chain catalog (H, local notes `docs/research/06-paybox-platform.md`, live `discover_tokens mode=chains` on 2026-10-19; the tool says the catalog is "metadata, not a support allowlist"). Every call above is a plain unsigned EVM transaction a PayBox EVM wallet could propose, with USDC on BSC as the funding asset.
- Blockers: no discoverable live market, no verified contract, no read API to find market ids or token addresses, and the project appears abandoned. I called no PayBox tools for this note.

## Fees

All fee fields are public getters whose values I could not read (needs `eth_call`). Names are H (ABI); values are NOT FOUND unless marked.

- Presale creation: `presaleCreationFeeUSDC()` (flat) and `presaleCreationFeeBps()` (percent); template default in the subgraph bootstrap is 50 USDC (L, placeholder block). Paid by the creator.
- `protocolFeeBps()` and `creatorFeeBps()` (applied at resolution/profit distribution, `ProfitDistributed`); all four adjustable by the owner through `updateFees(...)`. Formula NOT FOUND.
- Pool swap fee: `LiquidityManagerPCS.fee()` (uint24, owner-settable via `setFee`; PancakeSwap Infinity CL units where 10,000 = 1%); the schema comment gives "e.g. 30000 for 3%" (L). Paid by the swapper, earned by LPs (creator and early funders hold the LP positions).
- Gas: BNB, paid by the trader (no sponsorship found).

## Resolution mechanism and dispute risk

- Primary: **Reality.eth** (`REALITIO()`, immutable `QUESTION_TIMEOUT` set in the constructor, per-market `minBond`); `resolvePresale(presaleId)` reads the finalised answer (H from ABI/schema; Reality.eth address, arbitrator and timeout on BSC are NOT FOUND; the bootstrap block says 7 days, L).
- **Admin override:** the ABI exposes `forceResolvePresale(presaleId, answer)` and `forceGraduatePresale`, and the schema has `resolutionMode: RealityEth | ForceResolved` and a `PresaleForceResolved` event. Access control is not visible in an ABI; the names and `transferOwnership/renounceOwnership` getters imply an owner (M). That is a centralisation/rug risk: the owner can fix the outcome.
- **Shortfall risk:** events `PresaleResolvedWithShortfall` and `InsufficientShortfallCoverage`, a `shortfallCoverageFund` and a `protocolReserveFund` show that AMM pool reserves may not cover all redemptions at 1 USDC per winning token and that the protocol tops up from a fund of unknown size (M). A winning YES token may therefore not redeem at par.
- Dispute risk is high and unquantifiable: unverified contracts, owner-controlled override, creator-written questions, anyone can create.

## Geo, ToS and automation

- NOT FOUND (no live site, no terms page, no docs). Nothing about geo-blocking, KYC or bots. Treat as unknown, not as permissive.

## Liquidity (with dates)

- Prediction-market liquidity/volume/OI/TVL: **NOT FOUND** (no DefiLlama entry, no subgraph endpoint, no market list). Assume zero until shown otherwise.
- Token only (not market liquidity): ENTRV lifetime volume across the v3 pool $5,470,158 (GeckoTerminal daily OHLCV, 119 active days, 2025-10-28 to 2026-10-17, H): 2025-10 $5.10M, 2025-11 $0.36M, 2025-12 $5.3K, 2026-01 $742, 2026-02 $445, 2026-03 $15, 2026-04 $70, 2026-05 $7, 2026-06 $52, 2026-07 $11, 2026-08 $3, 2026-09 $77, 2026-10 (to the 17th) $0.17. 24h volume 0 on every ENTRV pool on 2026-10-19. CoinGecko market cap $2,146 on 2026-10-19 (GeckoTerminal $2,014).

## Event categories and overlap with other venues

- Claimed (Prediction Index topics, M): crypto, culture, finance, politics, social, sports, tech - i.e. anything a creator writes. No actual markets seen, so overlap with Polymarket/Kalshi/etc. for arbitrage is **NOT FOUND**. Creator-written free-text questions would also be hard to link to canonical events.

## Liquidity sharing

- Not shared with another prediction-market venue. The AMM pools are PancakeSwap Infinity pools, so the YES/NO tokens are tradable by any PancakeSwap router (an aggregator on BSC could route against them), but this is not liquidity shared with a prediction venue. Moot while no markets are visible.

## Suspicious content

- None aimed at AI agents. The parking page contains only a JS redirect; the GoDaddy page returned "Access Denied" to curl (generic edge block). The subgraph repo contains build/boilerplate files and a docker-compose with a default Postgres password (`let-me-in`) that is the stock Graph example, not a secret. I did not run or install any repo code.
- Provenance flag (L): both GitHub accounts were created on the same day as the token with no history; `helpers.ts` still carries what looks like the Uniswap-v2 subgraph template (`FACTORY_ADDRESS`, `UNTRACKED_PAIRS`, `User`/`Pair` types; M) and the repo's LICENSE is 35,149 bytes (content not read; GPL-3.0 text is about that size) while `package.json` says MIT (L). Treat the repo as a template adaptation, not as evidence of a shipped product.

## Not found

- NOT FOUND (searched: entrave.com, GitHub accounts, CoinGecko, GeckoTerminal, DefiLlama, Prediction Index snapshot): official docs, API reference, OpenAPI spec, WebSocket, rate limits, terms of service, geo policy, audit, team, any announced launch date.
- NOT FOUND: confirmation that the four manager contracts exist on BSC (no keyless GET explorer; Sourcify `match: null`; JSON-RPC requires POST, which this task forbids). Creation date, tx count and any market id are therefore unknown.
- NOT FOUND: any real market (YES/NO token address, pool, question), the USDC address used, fee values, the Reality.eth arbitrator, the owner address.
- NOT FOUND: the Solidity source (`entrave-market/entrave-contract` is not public).
- NOT FOUND: X (`@TryEntrave`) posts (fetch refused with 402).
- Search coverage: one extended WebSearch run; the second was refused by the session budget.

## Open questions

- Did any presale ever graduate on BSC mainnet? A single `eth_getLogs` for `PresaleGraduated` on `0x4657...` would settle it (needs a read-only JSON-RPC POST, which an operator can run if allowed).
- Is the `PresaleManagerPCS` set still owned by an EOA, and could the owner force-resolve? (`owner()` read.)
- Is `entrave.com` for sale because the project folded, or was it never the project's domain?

## Fixtures (docs/research/fixtures/entrave/)

No official read API exists, so these are evidence snapshots, not adapter fixtures.

- `coingecko_coin_entrave_2026-10-19.json` - trimmed CoinGecko `/coins/entrave` (listing, links, `tickers: []`, `last_updated`).
- `geckoterminal_pool_entrv_wbnb_2026-10-19.json` - ENTRV/WBNB 1% PancakeSwap v3 pool snapshot (reserve, zero 24h volume).
- `geckoterminal_pool_ohlcv_day_2026-10-19.json` - daily OHLCV for that pool (119 rows).
- `geckoterminal_search_pools_entrave_2026-10-19.json` - the five ENTRV token pools.
- `entrave_com_and_github_probe_2026-10-19.json` - parking evidence (HTTP, NS, whois dates only, NXDOMAIN list, Discord invite result, GitHub account facts).
- `subgraph_manifest_facts_2026-10-19.json` - contract addresses and caveats from the subgraph manifest.
- `abi_function_signatures_2026-10-19.txt` - function signatures extracted from the four ABI JSON files in the GitHub repo.

## Sources

- https://entrave.com (probe: JS redirect to `/lander`; WebFetch 307 to `https://forsale.godaddy.com/forsale/entrave.com`) - H, 2026-10-19. NS `ns1/ns2.afternic.com` via dig, whois dates - H.
- https://api.coingecko.com/api/v3/coins/entrave and https://www.coingecko.com/en/coins/entrave - H (listing and "stopped trading" notice; the listing text is the project's own claim, no docs link).
- https://api.geckoterminal.com/api/v2/networks/bsc/pools/0xf989380c6dc5921a97f5c3078e54a42effbee25c (+ `/ohlcv/day`, `/search/pools?query=entrave&network=bsc`, `/tokens/0xd6b8...8b34`) - H for the numbers, M for the interpretation. Note the CoinGecko page-level ATH/ATL strings looked inconsistent in the WebFetch summary; the API values (ATH $0.00089208 on 2025-10-30, ATL $0.00000214 on 2026-07-02) are consistent.
- https://sourcify.dev/server/v2/contract/56/{address} - H (`match: null` for the four manager addresses; exact match for the ENTRV token).
- https://github.com/entraveprediction-prog/entrave-prediction (subgraph/README.md, subgraph.yaml, schema.graphql, src/mappings/core.ts and helpers.ts, abis/*.json) read with `gh api` raw - H for content, M/L for deployment status. Account created 2025-10-28T21:02:34Z, repo pushed 2025-10-28T22:21:50Z, one commit "initial".
- https://github.com/entrave-market/subgraph (copy of the same subgraph, created 2025-10-28, one commit "Init"); `entrave-market/entrave-contract` 404 - H.
- https://discord.com/api/v9/invites/entrave?with_counts=true - H (Unknown Invite).
- https://x.com/TryEntrave - fetch refused (402), unread.
- `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (Prediction Index snapshot: Entrave, BSC, binary, amm, waitlist) - M.
- https://api.llama.fi/protocols - H (no Entrave entry).
- Forbes price-tracker page surfaced by search (https://www.forbes.com/digital-assets/assets/entrave-entrv-2/) - L (search snippet only; fetch returned 404).
- Local: `docs/research/06-paybox-platform.md` (PayBox chain catalog includes BNB Smart Chain 56) - H/M as stated there.
