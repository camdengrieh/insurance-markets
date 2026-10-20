# Kairo (kairo.market, Arc) - adapter spec

Researched 2026-10-19 (~02:30-03:00 UTC). READ-ONLY: unauthenticated GETs to kairo.market and public data APIs, WebFetch page reads, `gh api` searches. No account, no wallet, no API key, nothing signed, no POST/PUT/DELETE (so no JSON-RPC calls, see section 3), no browser automation. No third-party code cloned, installed or run. No PayBox tools called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (web pages, READMEs, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/kairo/` (8 files, each <= 3 KB).
Web search budget for the session ran out after one search, so some cross-checks (Arc mainnet launch news, overlap with Polymarket/Kalshi market lists) are NOT done; they are listed under Open questions.

## 0. Verdict

**adapter_priority: skip** (revisit trigger: a hosted market-data endpoint or multi-thousand-USD pools appear).

1. **Live, but a toy-sized pool set.** Arc mainnet is live (DefiLlama: Arc chain id 5042, TVL about $528.7M on 2026-10-19, H) and Kairo's prediction contracts are deployed there (deployment block 19591313, H per Kairo's contracts page). Trades are dated "1d ago" to "18d ago" on the live page (M, WebFetch-rendered). But the whole market set I could see has about $260 of traded volume and about $100 of liquidity in USD terms (section 10).
2. **No hosted prediction-market API.** Kairo's own pages say "No hosted indexer exists" and "No hosted REST or GraphQL API is offered yet" (H). The only route is reading events and contract state from an Arc RPC. The contracts are not source-verified, no ABI is published, and the RPC could not be reached from this environment (section 3).
3. **Several pools are denominated in the KAIRO token** (about $300K market cap, about $5K 24h volume, H), not USDC, so they are not clean arbitrage legs.
4. **Unaudited, single deployer key, geo-restricted** (United States and about 25 other countries listed, H), automation terms vague.
5. **Overlap is almost nil.** Most markets are Arc-native token-launch questions (KAIRO market cap, TOLLY, ARCANUS). Two or three generic markets (F1 2026 champion, GTA 6 PC announcement, Circle ARC airdrop) may overlap big venues but carry about $0-$25 of liquidity.

Why not P2: even as a "signal" the data is unobservable without custom RPC log decoding, and the signal would be about micro-cap Arc tokens.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site up | `https://kairo.market/` HTTP 200, 2026-10-19; footer "(c) 2026 Proodos Group BV"; interface "not licensed, registered or approved by any regulator" | H |
| Arc mainnet live | DefiLlama `GET https://api.llama.fi/v2/chains`: name Arc, chainId 5042, tvl 528,654,544 on 2026-10-19 (fixture `defillama_arc_chain_row.json`). About 27 Arc-only protocols in `GET https://api.llama.fi/protocols` (Aero Lite DEX $3.4M, Argus launchpad $0.97M, ...). Kairo itself is NOT in the DefiLlama protocol list | H |
| Kairo contracts on mainnet | `https://kairo.market/contracts` lists six addresses under "Arc mainnet", chain id 5042, RPC `https://rpc.mainnet.arc.io`, deployment block 19591313, version V1 (fixture `contracts_page_text.txt`). **The same page also says "Arc Mainnet: No mainnet deployment exists."** (stale second block; the page contradicts itself, H) | H |
| Docs date | Protocol docs "version 1.0, effective 2026-09-06"; audits page "last updated 2026-09-07" | H |
| Recent trades | Live page lists 16 confirmed trades aged 1d to 18d, the newest "1d ago" (fixture `live_page_rows_via_webfetch.txt`; extracted by the WebFetch tool's renderer, not a raw API) | M |
| Token | KAIRO ERC-20 `0x3EAd4E80e9e5bC0e01682D7Ee74C4881b040D3EA`, CoinGecko id `kairo`, price $0.00031673, mcap $299,508, 24h volume $4,907, only pair Uniswap V3 (Arc) KAIRO/USDC, last trade 2026-10-19 02:39Z (CoinGecko API, fixture `coingecko_kairo_trimmed.json`). Price -47.6% in 7 days per the CoinGecko page | H |
| Hint "deposits closed, not audited" | Applies to **Finance** (BTC-backed financing) and **Funds** only ("currently closed"). Prediction markets and swap are not described as closed | H |
| Arc explorer | `arc-scan.org` (linked by Kairo) returned Cloudflare error 1033 (origin tunnel down) to GET on 2026-10-19 | H |
| Public mainnet date | A social post (found by search, X page itself not readable) said Arc public mainnet planned 2026-09-16; not verified | L |

Chain-status note: Kairo's `/docs/networks` says Arc mainnet is what the public interface uses and a testnet config exists for internal testing only (H). The hint's "mainnet/testnet unclear" is therefore resolved: **mainnet**.

## 2. What it is and the market model

- **Kind**: onchain AMM prediction markets plus a wider DeFi hub (swap, perps, finance, funds, token launcher, "KAIRO Agent" powered by Circle Agent Stack). Operator: Proodos Group BV, Netherlands, registration number "not yet published" (H, /about). Tagline "the financial layer of Arc".
- **Market model (H, `/docs/protocol`, `/docs/markets`, `/smart-contracts`)**: **binary only**, permissionless creation ("exactly one unambiguous YES/NO answer"). Pricing is a **fixed-product market maker (FPMM) vendored from upstream** on top of **Gnosis ConditionalTokens**. "All trades are market orders against the market's automated market maker. There are no limit orders." Each winning share redeems for 1 collateral unit.
  - Tokenisation (M): Gnosis ConditionalTokens positions are ERC-1155 position ids; Kairo's docs only say positions are minted/split/merged/redeemed and do not name the standard or the FPMM version. The "Gnosis framework" label appears on the contracts page (H).
  - Price read (M, from upstream FPMM, not stated by Kairo): for a 2-outcome pool the YES price is `bal_NO / (bal_YES + bal_NO)` using the pool's ConditionalTokens balances; `calcBuyAmount` / `calcSellAmount` give executable quotes. NOT verified against Kairo's bytecode.
- **Contracts, Arc mainnet (chain id 5042), all H from `https://kairo.market/contracts`**:
  - MarketFactory `0x9f7c7ba45877a5FbeF7ff7756a4983B4Fe30FFd3` (deploys each market: condition, market maker, resolver registration, creator bond, seed liquidity)
  - TradeRouter `0x4297597FfFa61107F395B2db668F5645a8c62F79` (single entry for buys, sells, add/remove liquidity, fee accounting; has a minimum-output slippage check)
  - ProtocolConfig `0x4cA84ae4371e030f46eF3940B2613EF95ef0641a` (fee split, bonds, min liquidity, min duration, dispute window)
  - BondedResolutionAdapter `0x6Ab5beC9dC7D574C25Df9bdD73132217b8797948`
  - ConditionalTokens `0x34Ba6e273D8B41D02920864f0AEf0F5EB9f9474E`
  - USDC `0x3600000000000000000000000000000000000000` (6 decimals, "collateral and gas token")
  - "Explorer source verification: not submitted yet" for all six. Not proxy-upgradeable (H, /transparency).
- **Collateral**: docs say USDC ("Markets settle in USDC"; bond and seed liquidity in USDC). **But the markets page says "Markets settle on-chain in USDC or KAIRO" and the live page shows most pools denominated in KAIRO** (H/M, inconsistent with the create-market doc, which mentions only USDC). So collateral is per-market: USDC or KAIRO token.
- **Other product lines** (not prediction markets): "Up or Down" simplified directional markets (named on the site and by CoinGecko; `/up-or-down` and `/docs/up-or-down` returned 404/"page doesn't exist" to my fetch; assets, round length and oracle NOT FOUND; a search snippet said it starts with BTC fast rounds, L); perps (a Hyperliquid builder-code front end, section 3); Uniswap V3/V4 swap router (0.25% fee); BTC-backed Finance; Funds baskets; token launcher (49 USDC).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Prediction-market REST/GraphQL | **None.** `/status`: "No hosted indexer exists... No hosted REST or GraphQL API is offered yet." `/api` page: "Prediction markets: no hosted endpoint yet. Data must be read directly from Arc." My guesses `GET /api/markets` and `/api/public/v1/markets` returned the HTML 404 page | H |
| On-chain reads | Official route: Arc RPC `https://rpc.mainnet.arc.io`. Market discovery = `MarketCreated` logs from MarketFactory; volume/fees/pool data = `Trade` logs on TradeRouter; live prices and positions from the market maker and ConditionalTokens contracts. "Any consumer can reproduce the UI's figures from these two events" (`/docs/protocol`, `/api`). **Event ABIs/topics are not published and contracts are not verified**, so an adapter must derive them (upstream Gnosis FPMM + Kairo-specific router events). NOT FOUND: event signatures, function signatures, repo | H |
| RPC reachability from this run | `rpc.mainnet.arc.io`, `docs.arc.io`, `explorer.arc.io` resolve here to 146.112.61.106 (a range I associate with a DNS-filter block page; not verified) and TLS verification fails ("unable to get local issuer certificate", same in WebFetch). So the RPC was **not contacted**. JSON-RPC is POST-based and the ground rules forbid POST, so no `eth_call`/`eth_getLogs` was attempted even where reachable | H (failure), M (cause) |
| Perps REST (not prediction markets) | **Public, no key, CORS open.** Base `https://kairo.market/api/public/perps/v1`; health `/api/public/perps/health`. Endpoints `/markets`, `/markets/:symbol`, `/candles/:symbol?interval=&limit=`, `/account/:address`, `/positions/:address`, `/orders/:address`, `/fills/:address`, `/builder`, `/approval/:address`. **Rate limit 20 req/s per client, burst 120** (docs). Confirmed live: `/health` -> `{"ok":true,"latencyMs":664,"prices":1352,"detail":"live"}`; `/v1/builder` -> fee 0.03%, active; `/v1/markets` -> 385 markets, 132,684 bytes, `cache-control: public, max-age=3`. Rows carry `venueLabel` (Hyperliquid 234, XYZ 136, Ventuals 15), `category` (crypto, stocks, indices, commodities, forex, preipo), mark/oracle/mid price, funding, open interest, 24h volume (fixtures `perps_*.json`) | H |
| Swap quote API | `GET https://kairo.market/api/public/v1/swap/quote?tokenIn&tokenOut&amountIn&slippageBps`; needs `x-api-key` (keys start `kairo_`, created by connecting a wallet). Unauthenticated -> `401 {"error":"Missing or invalid x-api-key header"}` (fixture `swap_quote_unauthenticated_401.json`). Quotes only (Uniswap V3/V4 on Arc); no market data; limits NOT FOUND. I did not create a key | H |
| WebSocket | NOT FOUND (searched: /api, /developers, /docs, /status). Site CSP allows `wss:` generally, which proves nothing | H |
| Docs | `https://kairo.market/docs` (index), `/docs/protocol`, `/docs/markets`, `/docs/networks`, `/contracts`, `/smart-contracts`, `/resolution`, `/fees`, `/api`, `/developers`, `/status`; sitemap `https://kairo.market/sitemap.xml`. No OpenAPI. Pages are client-rendered React; plain curl gets a shell, the WebFetch tool renders them | H |
| Source repo / SDK | NOT FOUND (searched: site links, /open-source page mentions `OPEN_SOURCE_NOTICES.md "in the repository"` with no URL, CoinGecko `repos_url` empty, `gh` repo and code search for "kairo.market"; only unrelated or third-party hits). `@kairo/perps-sdk` is named in the perps docs for the perps product | H |

**Resolution data** (proposal, challenge, finalised, payout vector) is on-chain via BondedResolutionAdapter and ConditionalTokens events/state; no API.

## 4. Trade path (programmatic: yes in principle, undocumented)

- Everything is a wallet-signed EVM transaction on Arc (H, trading guide): approve USDC (or KAIRO) once to the TradeRouter, then call the router to buy/sell/add/remove liquidity with a `minimum output` argument; after finalisation the user redeems winning positions from their own wallet ("You sign the redemption transaction yourself"). No signed-order/off-chain order flow, no limit orders, no API-key trading.
- Function signatures and calldata layout: **NOT FOUND** (contracts unverified; no ABI). An integrator would have to fetch bytecode over RPC and match selectors against upstream Gnosis FPMM and guess the router's API, or capture them from the web app (which this run did not do: no browser automation, no wallet).
- Arc gas is paid in USDC (native), not by Kairo (H, /fees). Gas amount per trade: NOT FOUND.
- Quote-vs-execute for an arbitrage scanner: price is the FPMM's pool-balance ratio; execution price slips along the constant-product curve and a 1.50% fee applies (section 7). The router's minimum-output argument makes the transaction revert instead of filling badly (H).

## 5. PayBox reachability: **partial**

- Arc (chain 5042) is one of the 11 entries in PayBox's `discover_tokens` chain catalog (H via `docs/research/06-paybox-platform.md`, queried 2026-10-19; not re-run here), and this session's PayBox connector instructions refer to "Arc native USDC" for portfolio/swap (M). The catalog is "not a support allowlist".
- The one Open Plugin that targets Arc says "Arc is read-only from PayBox until PayBox signs on Arc" (M, `docs/research/05-paybox-reference-plugins-b.md`). Whether an `io.paybox/transactionProposal` for `eip155:5042` simulates and signs: NOT FOUND / unverified.
- If PayBox can sign on Arc, the two calls Kairo needs (ERC-20 approve, router call) are plain single-call EVM transactions, so the proposal shape would fit; but the router ABI is unknown (section 4), so calldata cannot be built reliably today.
- Funding: PayBox swaps/bridges into Arc USDC are routed by MoonX, and the live quote decides whether a given token route is available (M, repo note 06).
- Policy blocker independent of tech: United States users are "Access restricted" (section 9).

## 6. Liquidity sharing: independent but negligible

- Prediction pools: each market is its own FPMM pool seeded by its creator and traders; no evidence of routing to or mirroring any other venue (H: self-contained contracts on Arc; the docs never mention an external book). So Kairo is an **independent** leg in principle.
- Perps product: a front end to Hyperliquid and its builder deployers (XYZ, Ventuals) with a 0.03% builder fee (H, `perps_markets_sample.json`, `/builder`). **Not independent liquidity**; irrelevant to prediction arbitrage except as a hedge venue for crypto prices.
- Swap: aggregates Uniswap V3/V4 pools on Arc (H, /developers).

## 7. Fees

| Item | Value | Who pays | Tag |
|---|---|---|---|
| Prediction-market trade | **1.50% of trade size, deducted at execution**: 1.00% protocol, 0.25% market creator, 0.25% retained in the pool | trader (buys and sells) | H (`/fees`, `/docs/markets`) |
| Round trip before resolution | about 3.0% (1.5% in, 1.5% out) plus curve slippage | trader | M (arithmetic) |
| Pool/LP | The 0.25% stays in the pool; how to add liquidity is not covered in the trading guide | traders | H |
| Market creation | No fee; refundable bond (10 USDC per footer) plus seed liquidity (minimum read from ProtocolConfig) | creator | H (`/fees`) |
| Resolution bond | Set in ProtocolConfig; amount NOT FOUND | proposer / challenger | H |
| Claim/deposit/withdraw/interface spread | "no deposit, withdrawal or claim fees... no interface spread" | - | H |
| Gas | Arc gas in USDC to the network; amount NOT FOUND | transactor | H |
| Fee formula source | `TradeRouter` splits a total fee that `ProtocolConfig` enforces to equal the sum of three components; owner can change fees "for future activity" | - | H (`/smart-contracts`) |

NOT FOUND: whether the 1.5% is charged on collateral in (buy) or output (sell), and the FPMM's own internal fee parameter (searched /fees, /docs/markets, /smart-contracts, /docs/protocol).

## 8. Resolution mechanism and dispute risk (high)

From `https://kairo.market/resolution` and `/market-rules` (H):
1. After the close time trading stops. **Anyone** may propose YES, NO or INVALID by posting a USDC bond (amount in ProtocolConfig). The creator has no special authority; the interface has no privileged resolver.
2. A **challenge window** (length stored in ProtocolConfig; value NOT FOUND) lets anyone dispute by posting a bond. A challenge moves the market to "disputed".
3. Disputed markets follow "the adapter's escalation rules", which the docs **do not describe**; the market stays unclaimable until a final outcome is reported on chain.
4. An unchallenged proposal finalises; payout vector is reported to ConditionalTokens; winners redeem in their own transaction. Collateral does not expire.
5. **No oracle** is used ("No other oracle is used, and none is implied"). If nobody proposes, "the market stays open for resolution indefinitely".
6. Rules text (source, edge cases) is written by the market creator; ambiguity falls back to the written rules. A quality score flags vague questions (H, /market-integrity). There is no automated wash-trade enforcement; staff can only label or de-rank in the interface (H).

Dispute risk for an aggregator: **high**. Resolution depends on a bond economy with tiny, unknown bonds and an undefined escalation, resolution can be indefinitely delayed, and rule text is creator-authored, so rule-hash pinning against another venue's text (see `docs/market-linking-design.md`) will rarely match.

Admin and code risk (H, /transparency, /audits, /smart-contracts): owner is a **single deployer key, not a multisig, not timelocked**; it can change fees, bonds and limits for future activity, but cannot resolve markets or move collateral; contracts not proxy-upgradeable; **"No external audit has been completed"**, audit table "Not started", "No funded bounty programme exists yet"; source verification not submitted.

## 9. Geo, ToS, automation

- Geography (H, `/restricted-jurisdictions`, "provisional, pending legal review"): **United States is "Access restricted"**, as are Brazil, Cyprus, Czech Republic, Germany, Greece, Hungary, Italy, Netherlands, Poland, Portugal, Romania, Spain, Switzerland, Ukraine, United Kingdom, China, India, Indonesia, Iraq, Japan, Singapore, South Korea, Taiwan, Thailand, Australia; France view-only; Iran and North Korea sanctioned. Enforced by IP geolocation; VPN/proxy use "breaches the Terms".
- Terms s3: users must not be in listed jurisdictions or use a VPN/proxy/false location to circumvent (H, /terms). Terms s18 bars "wash trading and self-dealing" and attacking the platform.
- Automation: no explicit bot ban. Acceptable-use s2 prohibits "Automated abuse of the interface or of RPC infrastructure" (undefined) and price manipulation (H, /acceptable-use). Perps API is explicitly open to programmatic reads (20 rps).
- Platform cannot pause, edit, resolve or delete an on-chain market; interface-hidden markets remain tradable on Arc (H, /market-integrity).
- Legal status: "not licensed, registered or approved by any regulator"; documents "not yet reviewed by qualified legal counsel" (H).

## 10. Liquidity (dated)

All figures read 2026-10-19; USD conversion uses KAIRO = $0.00031673 (CoinGecko API 2026-10-19 02:42Z), and the token fell about 48% in 7 days, so KAIRO-denominated pools are worth less than they looked when funded.

| Market (from live page, M) | Traded | Liquidity | Traders | Approx USD (volume / liquidity) |
|---|---|---|---|---|
| Will KAIRO reach 5M marketcap by the end of this year? (Yes 31c) | 200K KAIRO | 100K KAIRO | 2 | $63 / $32 |
| Will Circle announce an ARC token airdrop before 1st november? (Yes 20c) | 50K KAIRO | 50K KAIRO | 1 | $16 / $16 |
| Will KAIRO win the Perps War against Synthra? (Yes 36c) | 22K KAIRO | 10K KAIRO | 3 | $7 / $3 |
| Will TOLLY reach 100M MC before year end? (Yes 64c) | $174.68 | $20.00 | 9 | $175 / $20 |
| Will $ARCANUS reach a $500k marketcap by Dec 31, 2026? | $0 | $25.00 | 0 | $0 / $25 |
| Will Rockstar announce a PC version of GTA 6 before December 31, 2026? | 0 | 10 KAIRO | 0 | $0 / $0.003 |

- Total of the six "most traded": about **$260 volume, about $96 liquidity**. The three market-cap markets expiring 2026-10-15 and one earlier (traded up to 3.7M KAIRO in one buy, 18 days ago) are not in the ranking, so some historical volume is missing; at today's token price even 3.7M KAIRO is about $1.2K.
- Platform-level TVL/volume/OI for prediction markets: **NOT FOUND** (searched: /transparency, /leaderboard (empty "No trades in this period yet"), /markets (loading shell), DefiLlama protocols list (no Kairo entry)). Leaderboard counts only "KAIRO Launch trades".
- Token context: KAIRO mcap $299.5K, 24h volume about $4.9-5.2K (CoinGecko). Arc chain TVL $528.7M (DefiLlama), so the host chain is large; Kairo's share of it is not visible.
- Inconsistency: the WebFetch render of `/markets` showed only a "Reading markets from Arc..." loading state on two attempts, while `/live` rendered full rows. I could not enumerate all markets (M).

## 11. Event-category overlap (where arbitrage could exist)

- Crypto price: Kairo's "market cap" questions are about KAIRO/TOLLY/ARCANUS/ArgusPad tokens, which no other covered venue lists. No BTC/ETH price-ladder markets seen (the "Up or Down" product may add some, unverified).
- Sports: one F1 market ("Kimi Antonelli F1 World Champion 2026", 48d left, no liquidity shown). Overlap with Polymarket/Kalshi plausible (not checked: web search budget exhausted).
- Pop culture / corporate: GTA 6 PC announcement; Circle ARC token airdrop before 1 November (Circle is Arc's sponsor; a Polymarket/Kalshi equivalent might exist, not checked).
- Politics, macro: none seen.
- Net: even the overlapping markets carry about $0-$16 of liquidity, below any fee/gas floor (1.5% fee, USDC gas, 10 USD per-order cap in this project).

## 12. Adapter sketch (only if the trigger in section 0 is met)

1. Discover: `eth_getLogs` on MarketFactory for `MarketCreated` from block 19591313; decode with an ABI reverse-engineered from bytecode or from the web app's JS (needs a PayBox-independent RPC; `rpc.mainnet.arc.io` per Kairo).
2. Price: read FPMM pool balances from ConditionalTokens (`balanceOf(pool, positionId)`), YES = `bal_NO/(bal_YES+bal_NO)`; for sizing use `calcBuyAmount`. Add 1.5% fee each way.
3. Skip KAIRO-denominated pools by default (collateral token read from the market maker); only USDC pools are comparable.
4. Resolution state from BondedResolutionAdapter events; treat any market without a finalised outcome after close as unresolvable for arbitrage purposes.
5. Execution: do not build until PayBox signing on Arc is confirmed, the ABI is verified on an explorer, and the geo restriction is cleared for the operator.
6. Useful free by-product: the public perps API (`/markets`) gives a keyless crypto/stocks/indices/commodities price and funding feed, but it is a mirror of Hyperliquid and its deployers (the Hyperliquid venue itself is the better source).

## Open questions

- Is `rpc.mainnet.arc.io` a normal public JSON-RPC endpoint from an unfiltered network? (Blocked here by DNS/TLS; and POST was out of scope.) Does it allow `eth_getLogs` over wide ranges, and what are its rate limits?
- Router/market function and event signatures; internal FPMM fee; resolution bond size; challenge window length; escalation path for disputed markets.
- Full list of markets (the `/markets` page did not render); how many are USDC-collateral vs KAIRO-collateral.
- What "Up or Down" markets are (assets, round length, oracle) and whether they are live.
- Whether PayBox can simulate and sign `eip155:5042` proposals.
- Whether the F1 / GTA 6 / ARC-airdrop markets match live questions on Polymarket or Kalshi (excluded from this workflow's scope; cross-check in the linking work).
- The contradiction on `/contracts` ("No mainnet deployment exists" vs addresses listed): almost certainly a stale block, but it shows the docs are unmaintained in places.
- Other Arc prediction-market entrants seen only in search results and not researched: arction.app, arktion.app, arcanamarkets.netlify.app, the Circle sample repo `circlefin/arc-prediction-markets` (testnet demo with UMA OOv2 and a 2% constant-product fee, "not production-ready"), and a hobby launchpad repo `tonytheruthla/arclight`. None is Kairo.

## Not found

- Hosted prediction-market API, indexer, WebSocket, OpenAPI (searched: /api, /developers, /status, /docs, sitemap).
- Contract ABIs, event/function signatures, source repo, verified source (searched: /contracts, /smart-contracts, /open-source, /docs/protocol, GitHub repo and code search, CoinGecko links).
- Audit report, bug bounty (searched: /audits, /security, /transparency): none exist.
- Prediction-market TVL/volume/OI aggregates (searched: DefiLlama protocols and chains, /leaderboard, /live).
- Resolution bond amount, challenge window length, escalation rules, FPMM fee, gas cost per trade.
- Arc docs (`docs.arc.io`) and explorer pages (blocked/TLS or origin down); X profile (HTTP 402 to WebFetch, stopped, no payment requirements shown); Medium article about Kairo (HTTP 403).
- Rate limit for the swap quote API and for the Arc RPC.

## Sources

Primary (Kairo, all fetched 2026-10-19):
- https://kairo.market/ (home), /docs, /docs/protocol, /docs/markets, /docs/networks, /docs/create-market
- https://kairo.market/contracts (contract addresses, chain id 5042, RPC, deployment block)
- https://kairo.market/smart-contracts, /transparency, /audits
- https://kairo.market/resolution, /market-rules, /market-integrity
- https://kairo.market/fees, /trading-guide
- https://kairo.market/status ("No hosted indexer", "No hosted REST or GraphQL API")
- https://kairo.market/api (perps API docs: base URL, endpoints, 20 rps / burst 120, "prediction markets: no hosted endpoint yet")
- https://kairo.market/developers (swap quote API, `x-api-key`)
- https://kairo.market/restricted-jurisdictions, /terms, /acceptable-use, /prohibited-markets, /about, /open-source, /leaderboard, /live, /markets
- https://kairo.market/api/public/perps/health, /api/public/perps/v1/builder, /api/public/perps/v1/markets, /api/public/v1/swap/quote (live GETs, fixtures saved)
- https://kairo.market/sitemap.xml, /robots.txt (allows all)
Secondary:
- https://api.coingecko.com/api/v3/coins/kairo and https://www.coingecko.com/en/coins/kairo (token data; description matches Kairo's: USDC collateral, AMM, "Up or Down" markets, perps "under development")
- https://api.llama.fi/v2/chains and https://api.llama.fi/protocols (Arc chain TVL; no Kairo entry)
- https://github.com/circlefin/arc-prediction-markets (unrelated Circle testnet sample app), `gh api` search results (no Kairo repo)
- `docs/research/06-paybox-platform.md`, `docs/research/05-paybox-reference-plugins-b.md` (PayBox chain catalog and Arc signing statements; M)
- Blocked/unreachable: https://rpc.mainnet.arc.io, https://docs.arc.io, https://explorer.arc.io (TLS verification failed here), https://arc-scan.org (Cloudflare 1033), https://x.com/kairo_market (HTTP 402), the Medium write-up (HTTP 403).

Privacy: scripted requests used only the User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere; scripts and fixtures were grepped for "@" and personal strings before finishing.

## Suspicious content

None found. No text aimed at AI agents was seen in any fetched page. Notable non-injection oddities: the `/contracts` page contradicting itself about mainnet deployment; the X profile returning HTTP 402 (no payment requirements were shown to the tool; stopped, nothing paid); the `/docs/up-or-down` URL returning an in-app "documentation page doesn't exist" view while the sitemap lists it.
