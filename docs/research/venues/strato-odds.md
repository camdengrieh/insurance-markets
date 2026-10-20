# Venue spec: STRATO Odds (stratoodds.com)

Researched 2026-10-19. Read-only: GET requests to the public site and its documented `/api/v1` read API, the site's own JS bundle read as text (never executed), GitHub files via `gh api`, the DefiLlama public API. No wallet, no sign-in, no POST, no signing, no account. Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that.

## Verdict

| Item | Value |
|---|---|
| Adapter priority | **P2** (read-only signal adapter at most; do not build a trade path) |
| Still live (2026)? | Yes. Mainnet app returns 200; `/health` ok; newest market created 2026-10-19 ~00:14 UTC (marketId 7634); newest fill 2026-10-19 00:13:59 UTC [H, API] |
| Independent leg? | Yes in the narrow sense: its own order book, no shared liquidity with another venue [H]. But almost all resting liquidity is one house market maker that quotes "around the live oracle price" [H, site FAQ], so the price is largely a model of spot, not independent information [M]. |
| Read API | Official-public, unauthenticated REST JSON under `/api/v1`, documented on `/docs#api`, no OpenAPI spec [H] |
| Trade path | Authenticated gateway builds unsigned STRATO function-call txs; user signs EIP-712 typed data (domain `STRATO`/`1`) and POSTs to `/rpc/submit`. Not standard EVM calldata. Not exercised (POST) [H from bundle source, M on live behavior] |
| PayBox reach | **Partial**: read yes; trading is conceivable only as an agent-orchestrated `request_wallet_sign` (message + typedData) flow against a non-EVM chain, untested; funding needs a USDC bridge from Base/Ethereum/Linea |
| Liquidity | Tiny: TVL about $1.07k, about $0.6k total resting depth across 12 open markets, about $18k/7d organic fill volume (all as of 2026-10-19) |

Why P2 and not skip: the API is clean and free, the venue is live, and it covers an unusual overlap set (hourly and daily threshold markets on BTC, ETH, DOGE, gold, silver, Brent, NVDA, S&P 500) that other venues also list. Why not P1: resting depth is $30-$110 per side per market with spreads up to about 30 cents (and many one-sided or empty books), a 2% taker fee, a first-party oracle that differs from other venues' benchmarks, and volume that tracks prize competitions. Revisit if TVL or 30d volume passes roughly $1M.

## What it is

- BlockApps' prediction product on its own L1, **STRATO** (SolidVM, PBFT). Site footer: "(c) BlockApps Inc."; JSON-LD publisher "BlockApps"; terms are STRATO Nexus, Inc.'s [H, site HTML, strato.nexus/terms].
- Mainnet since at least 2026-08-18 (DefiLlama adapter `start`); first prize competition ran 2026-09-11 to 09-18 ("The Silver Chase"), then 09-23 to 09-30, then 09-30 to 10-07 [H adapter, H strato.nexus/blog index]. DefiLlama listing 2026-09-25 (`listedAt` 1790357459; PR merged 2026-09-25) [H].
- `canonical`/`og:url` in the HTML still point at `testnet.stratoodds.com`, but `GET /api/v1/config` on stratoodds.com reports `"network":"mainnet"` and the footer says "runs on STRATO mainnet: USDST here is real value" [H]. A separate testnet host exists (200 OK) and its USDST is test currency [H].
- Volume is driven by weekly trading competitions with prizes in saveUSDST and tokenized metals (e.g. $4,950 "CrossMint Circuit", $1,725 + 7 oz yieldSILVST "First Mover Advantage") [H, strato.nexus/blog index; prize totals as summarized by WebFetch, M]. Expect volume to be incentive-shaped.

## Market model

- **Binary YES/NO threshold markets on an asset price**: "Will the STRATO oracle price of Gold (GOLDST, USD/oz) be at or above $4,173.00 at 2026-10-19T01:00:00Z?" `>= strike` resolves YES (tie goes to YES) [H, `/api/v1/markets`].
- Assets in config (9): GOLDST, SILVST, ETH, WBTC (shown as Bitcoin), NVDA, SPY (shown as S&P 500), OIL (Brent crude), DOGE, BOOE (Book of Ethereum, a memecoin) [H, `/api/v1/config`, question text].
- Horizon: rolling roughly hourly markets (expiries at :00/:05/:45/:50) plus daily markets (e.g. expiry 22:00 UTC the next day); a given asset typically has 1-2 open [H, 12 open markets at 00:20 UTC]. No categorical or scalar markets. Market creation is owner-gated (factory owner writes the questions) [H, /docs#properties].
- **Central limit order book on-chain (not AMM, not parimutuel)**. Each resting order is its own contract holding its escrow (`OrderBook.createOffer` escrows tokens, `createBid` escrows USDST); `fill(amount)` allows partial fills; `cancel()` returns escrow [H, /docs].
- **Tokenisation**: each market has two ERC-20-style tokens, `yesToken` and `noToken`, mintable/burnable only by the market. `split(N USDST)` mints N YES + N NO; `merge` burns a pair for N USDST (any status, including after resolution); winner redeems 1 USDST per token, loser 0, INVALID 0.5 each. Invariant `yesSupply == noSupply == collateral` until resolution [H, /docs#overview].
- **Unified book**: the API/UI presents one YES-denominated book with NO orders folded in at `1 - price`. `crossMint` (YES bid + NO bid with prices summing to >= 1) and `crossMerge` (YES offer + NO offer summing to <= 1) settle against each other permissionlessly; price-improvement surplus goes to the fee collector [H, /docs#crossing].
- Price tick 0.001 USDST (strictly between 0 and 1); amount tick 1e6 wei; amounts and prices are 18-decimal wei strings [H, /docs#params].
- Trading halts at expiry (new orders, fills, crossings revert), before the outcome is written. Cancel and merge stay open [H].

## Chains and collateral

- Chain: STRATO mainnet, chain id **123354377739506**, JSON-RPC `https://app.strato.nexus/rpc`, explorer `https://stratoscan.strato.nexus` [H, github.com/strato-net/strato-token-list README; scanUrl in `/api/v1/config`]. STRATO runs **SolidVM, not EVM bytecode**, but exposes an Ethereum-style JSON-RPC [H, docs.strato.nexus]. DefiLlama's adapter notes `eth_call` returns empty data for enum getters and the chain has no Multicall3 [H, DefiLlama-Adapters PR #21244 / adapter source].
- Collateral: **USDST**, the STRATO stable dollar (18 decimals), `0x937efa7e3a77e20bbdbd7c0d32b6514f368c1010`. Minted/borrowed against collateral such as tokenized gold/silver and bridged crypto (CDP) [H, docs.strato.nexus, token list]. Peg/backing detail NOT re-verified; STRATO's own ToS warns stablecoins "may not be as stable or fully collateralized as advertised" [H].
- Funding path (public, unauthenticated `GET /api/v1/bridge/info`): USDC deposited via per-chain deposit routers on **Ethereum (1), Base (8453), Linea (59144)** mints STRATO USDC (`0x6aea...0ba8`); then a 1:1, zero-fee PSM swap USDC -> USDST (`GET /api/v1/swap/info`: `venue:"psm"`, `fee:0`, `poolUsdc` about 107,068 USDC at 2026-10-19) [H].
- Core contracts: MarketFactory `0xf0d33e7f1bfc35158acbccb39b3041f5cc27fd1a`, PriceOracle `0x...1002` (precompile-style address), PredictDapp registry `0x36656e3a30ee4b57705a4d42936af48a2f0f7e3a` (points at the live factory and order book); the order book was **replaced on 2026-09-20** and bids on the retired book `0x1d4238c266974525c371d9bf7c823e7de8ffb1b7` keep escrow until filled/cancelled [H, config + DefiLlama adapter]. Current OrderBook address: not printed in the API; read it from the registry (not done: RPC is a POST).
- Contract source: NOT FOUND (searched: github.com/strato-net org repo list, GitHub code search for MarketFactory/PredictDapp, "stratoodds"). Explorer pages exist but were not read.

## Read API

| Item | Detail |
|---|---|
| Exists | **Official-public**, unauthenticated JSON. Same data the app renders [H, /docs#api] |
| Docs | https://stratoodds.com/docs (section "Public read API"; client-rendered SPA, text lives in the JS bundle). No OpenAPI/Swagger: `/openapi.json` returns the SPA shell [H] |
| Base URL | `https://stratoodds.com/api/v1` (testnet: `https://testnet.stratoodds.com/api/v1`) [H] |
| Auth | None for reads. Writes need a wallet token (below) [H] |
| Rate limit | `RateLimit-Policy: 300;w=60` (300 requests per 60 s, per IP presumed), with `RateLimit-Limit/Remaining/Reset` headers; behind Cloudflare [H headers]. Not mentioned in docs |
| CORS | `access-control-allow-origin: https://stratoodds.com` only: server-side callers fine, third-party browser pages blocked [H headers] |
| Websocket / SSE | NOT FOUND (searched: JS bundle for `WebSocket`, `EventSource`; only Linea RPC URLs matched). The SPA polls: markets every 10 s, trades every 15 s, prices every 60 s [H bundle] |
| Pagination | `GET /markets` returns the newest 50 by default; `limit` is honored (3 returned for `limit=3`) [H]. Cursor scheme NOT FOUND |
| Errors | Unknown filter: HTTP 4xx JSON `{"error":"Unknown status filter: 4"}`; unknown market: 404 JSON [H] |

Key endpoints (from /docs and verified by GET unless noted):

| Endpoint | Returns |
|---|---|
| `GET /config` | network, USDST/oracle/factory addresses, asset map, `bookFeeBps:200`, `takerPaysFee:true`, referral/rebate flags, `bridgeChainIds:[1,8453,59144]` (fixture) |
| `GET /markets?status=open\|resolved\|invalid&asset=SYMBOL&limit=N` | market array: `address, marketId, assetSymbol, assetAddress, strike, expiry, question, resolutionSource, yesToken, noToken, collateral, status, settlementPrice, resolvedAt, claimsOpenAt, createdAt, block_timestamp` |
| `GET /markets/:address` | one market (adds `settlementPriceAt`) |
| `GET /markets/:address/book` | `{market, bids[], asks[], bestBid, bestAsk, mid, lastTrade}`; each level `{price, size, orders[{address, side, isYes, amountRemaining, rawPrice, maker}]}`; YES-denominated, NO orders folded at `1 - price` |
| `GET /markets/:address/trades?limit=N` | fills newest first: `{price, amount, kind: fill\|cross, side, blockTimestamp, trader, txHash}` |
| `GET /assets/:ASSET/trades?hours=H&limit=N` | asset-wide tape, adds `market, marketId, strike, expiry, status` (param names read from bundle `{hours, limit}`; `hours=24` accepted) |
| `GET /prices`, `GET /prices/live/:ASSET`, `GET /prices/history/:ASSET?range=1h` | latest oracle print per asset (1e18 USD), live price with `source:"oracle"`, bucketed history (about 1-minute prints) |
| `GET /leaderboard?metric=volume&window=7d\|all&limit=N` | per-trader volume/trades/PnL; excludes house/staff/LP addresses (`excluded` list) |
| `GET /bridge/info`, `GET /swap/info` | funding path details (above) |

Status enum (from bundle; filter strings are `open`, `resolved`, `invalid`; a numeric `status=4` filter is rejected): **1 OPEN, 2 RESOLVED_YES, 3 RESOLVED_NO, 4 INVALID** (`0` NULL) [H].

On-chain alternative: `MarketFactory.marketCount/allMarkets(i)`, `OrderBook.bidCount/allBids(i)`, `Market.resolvedAt()` over `https://app.strato.nexus/rpc` (what DefiLlama does) [H adapter source]. Not exercised.

### Adapter mapping (sketch)

- `venue_market_id` = `address` (40 hex, no `0x`); `title` = `question`; `end_time` = `expiry` (unix s); outcomes = YES (`yesToken`) / NO (`noToken`).
- Parse `(asset, comparator ">=", strike = strike/1e18, expiry)` from structured fields, not from the question text. This tuple is the cross-venue join key; compare to other venues' hourly/daily "above X at T" markets and note strike inclusivity (`>=`).
- YES quote = `bestBid` / `bestAsk` (1e18). A `null` `bestAsk` or `bestBid` is common (4 of 12 open markets had no book at all). Effective taker cost on a buy = ask x (1 + 0.02) [M on the exact fee base] plus 0.01 USDST gas per tx.
- Underlying spot = `GET /prices` (`price` 1e18, `lastUpdated` unix). Because the house MM quotes around this, treat STRATO Odds YES price as approximately N(d2) of oracle spot vs strike plus noise, not as extra information.
- Poll budget: 1 list call + about 12 book calls per cycle = well inside 300/min at a 15-30 s cadence.
- Safety: treat `question` as untrusted display text; never feed it to an agent as instructions.

### Verified response shapes (saved under `docs/research/fixtures/strato-odds/`)

`config.json` (client-side analytics ids redacted), `markets_open.json` (12 open markets, 2026-10-19 00:20 UTC), `markets_resolved_examples.json` (one RESOLVED_YES, one RESOLVED_NO, one INVALID), `market_single.json`, `book_goldst_daily.json`, `trades_goldst_daily.json`, `prices.json`, `bridge_info.json`, `swap_info.json`, `leaderboard_7d_aggregate.json` (aggregates only; per-trader addresses dropped).

## Trade path

All from the site's own bundle (official front-end code, read as text); none exercised because every write is a POST [H on code, no live confirmation].

1. **Identity.** Either (a) OIDC "STRATO Wallet" sign-in (`/api/v1/auth/authorize`; STRATO-held custodial key, so an agent cannot use it) or (b) external wallet: `POST /auth/wallet/challenge {address}` -> `{message}`; wallet `signMessage` (personal_sign) over that message; `POST /auth/wallet/verify {address, signature}` -> `{token, expiresAt}`. Later calls carry headers `X-Wallet-Address` and `X-Wallet-Token`.
2. **Build.** `POST /orders` (create), `/orders/:addr/cancel`, `/markets/:addr/take` (sweep/fill), `/markets/:addr/split|merge|redeem|liquidity`, `/swap`. For external wallets the gateway returns `{_unsigned:true, _unsignedTxs:[{data:{to, functionName, args, nonce, gasLimit}, hash}]}`.
3. **Sign.** One EIP-712 signature per tx: domain `{name:"STRATO", version:"1"}` (no chainId, no verifyingContract), primaryType `Transaction` with fields `to address, funcName string, args string[], nonce uint256, gasLimit uint256, network string` (network = `"STRATO"`). The SPA signs with the connected EVM wallet's own address, so the STRATO account address is the EOA address.
4. **Submit.** `POST /rpc/submit {nonce, gasLimit, to, funcName, args, network, r, s, v, txVersion:1}` then poll `POST /rpc/results [hashes]` until not `Pending`. Approve + action = two txs = two signatures ("An approve+action pair is two inputs, so 0.02" USDST gas) [H, /docs#params].
5. Gateway claim: it "never holds a key that can move a wallet user's funds" and resolution, crossing, cancel, merge, redeem are permissionless on-chain [H, /docs]. First-hand on-chain verification: not done.

Unknowns: exact challenge-message format and token lifetime; whether the gateway rate-limits or blocks non-browser clients on writes; STRATO tx nonce handling under concurrent orders; slippage/worst-price protection beyond the UI's sweep guard (docs say the UI previews a worst-price guard). NOT FOUND (searched: /docs, bundle, blog index): any documented programmatic-trading guide, API key scheme, or bot program. `strato-net/strato-griphook` (an MCP server for AI agents on STRATO) exists but is archived (last push 2026-03-12) and targets the STRATO platform, not Odds [H, GitHub org list].

## PayBox reachability

**Partial / unproven.**

- Read-only monitoring: fully reachable, plain HTTPS.
- Trading: the repo's PayBox notes say `request_wallet_sign` supports `message` and `typedData` intents on an EVM credential, with no documented domain/chainId restriction, and an EVM MPC wallet shares one address across all `eip155:*` chains (docs/research/06-paybox-platform.md section 4) [M, from earlier research, not re-tested here]. That matches STRATO's needs (personal_sign challenge, then one typedData per tx with a chainId-less domain), so an **agent-orchestrated prepare -> sign -> submit** flow (same pattern as docs/research/06) is plausible. A plugin cannot do it alone (no proposal kind for signatures).
- **Not** reachable as an `io.paybox/transactionProposal`: STRATO is SolidVM with function-name/args transactions and chain id 123354377739506, not EVM calldata, and is almost certainly absent from PayBox's chain catalog [M; catalog not queried this session].
- Funding: USDC on Ethereum or Base -> STRATO deposit router -> mints STRATO USDC -> PSM swap to USDST (itself a signed STRATO tx). Base and Ethereum are PayBox-reachable EVM chains; Linea support unchecked. The exact bridge contract calls (Permit2 approve + signed transfer + one tx, per the SPA copy) were not traced [M]. Withdrawal back to an EVM chain: NOT FOUND.
- Per-trade human friction: at least 2 signatures per fill (approve + action), 1 extra per sign-in. Under a non-autonomous grant that is several passkey prompts per trade. Not worth it at this venue's depth.

## Fees

- **Trading fee `bookFeeBps: 200` = 2.00%, `takerPaysFee: true`** [H, `/api/v1/config`]. The taker (whoever fills a resting order) pays it **on top of the quoted cost**; makers pay nothing; "A crossing has no taker and pays only the price-improvement surplus" [H, /docs#params]. The fee base (notional `amount x price` vs payout `amount`) is not stated: NOT FOUND; the docs say "added to the price you see on the ticket" [H], so treat as +2% of cost [M]. How a taker **sell** is charged on mainnet: NOT FOUND (the docs describe the older "comes out of the seller's proceeds" model only for `takerPaysFee=false`).
- Network fee: flat **0.01 USDST per transaction** (STRATO gas) [H]. No settlement/redemption fee [H].
- Referral: 25% of fees to the referrer for 180 days; taker rebate tiers present but `enabled:false`; social rewards off [H, config].
- The fee value is read from the live order book and can change when the book is replaced (it was replaced 2026-09-20); markets snapshot their parameters at creation [H, /docs].

## Resolution mechanism and dispute risk

- Source: **STRATO PriceOracle**, first-party, "median of multiple price APIs", about one print per minute since 2026-09-25 (7.5 minutes before) [H, /docs, DefiLlama PR]. Each market stores `resolutionSource` text on-chain. The set of upstream APIs is not named: NOT FOUND.
- `resolve()` is callable by anyone after expiry, needs a print with data timestamp >= expiry; first such print settles (>= strike YES, below NO). Observed: market expiring 00:05:00Z resolved at 00:05:07Z [H, fixture].
- Windows: resolve window 30 min; max price age 2 h; if the feed is stale 24 h past expiry the market voids to INVALID (0.5/0.5); **2-minute review window before payouts, during which the factory owner may `void()` a "mis-resolved" market to INVALID** [H, /docs#settlement, #params].
- **Mis-settlement guard (off-chain, platform discretion)**: before each resolve, the platform interpolates the price at the deadline from the bracketing prints and voids to INVALID when the settling price contradicts it. They measured 4.0% of 2,512 resolved mainnet markets would have settled against the interpolated price while prints were 7.5 minutes apart [H, /docs]. In the latest 50 markets listed, 1 was INVALID, 24 YES, 13 NO, 12 open [H, fixture-derived count].
- Risks for an arbitrage leg: (1) basis risk, since the oracle is not Chainlink/CME/Coinbase and other venues settle on different benchmarks and timestamps; (2) owner void power and platform-run guard (centralized, no UMA-style dispute); (3) INVALID pays 0.5 per token, which breaks a hedge against a binary leg elsewhere that resolves to 0 or 1; (4) stale/skipped prints at the deadline; (5) trading stops at expiry but resolution lands seconds to minutes later.

## Geo, ToS, automation

- Terms: https://strato.nexus/terms (STRATO Nexus, Inc., last updated 2026-06-24) [H, read in full text]. These are the umbrella STRATO terms; no clause specific to prediction markets or gambling [H, searched "prediction", "gambling"]; states the Products are "not registered or licensed by any financial regulatory authority".
- Geo: bars use in US-embargoed countries, by nationals/residents of them, by Treasury SDN/Commerce denial-order parties, and in "Restricted Territories" under US/UN/UK/EU comprehensive sanctions; account may be suspended where "accessed from a jurisdiction where we do not offer the use of our Products" [H]. No geofence observed on the read API from this (non-US) egress; whether US persons are blocked in the app: NOT FOUND (no explicit US exclusion in the terms; "laws of your jurisdiction or the United States" must not bar you).
- Automation: users agree not to use "any 'robot', 'crawler', 'scraper', 'spider', or other automated means or interface not provided by us, to access the Services or to extract data" [H]. The documented public read API is an interface they provide, so polling it is arguably fine, but the clause is broad; "monitoring their availability, performance or functionality" and benchmarking/competitive use are also barred [H]. Trading bots: not mentioned; wash trading and self-trades are prohibited and disqualify competition entries [H, terms + in-app competition rules]. A separate "API Terms of Use" (BlockApps APIs, dated 2016-05-11, stale [L]) exists and was not analyzed for Odds.
- robots.txt: `Allow: /`, `Disallow: /api/` (except `/api/v1/share/card`), `Disallow: /admin /mine /pnl /health` [H]. So the documented API is disallowed to crawlers by robots.txt while documented as public: a policy conflict worth a polite email to the operator before production use. Recommend: ask STRATO for explicit permission and rate budget; keep to one poll cycle per 15-30 s.

## Liquidity (all 2026-10-19 unless noted)

| Metric | Value | Source |
|---|---|---|
| TVL (USDST in markets + open bid escrow) | about **$1,066** | DefiLlama `api.llama.fi/protocol/strato-odds` `currentChainTvls` [H]; adapter PR snapshot 2,075.85 USDST on 2026-09-24 [H] |
| Resting depth, 12 open markets | bids about **$277**, asks about **$348** (price x size); 4 of 12 markets had an empty book | own computation from `/markets/:addr/book` at ~00:20 UTC [H] |
| Typical spread | 0.38 / 0.57, 0.45 / 0.73, 0.71 / 0.78 (bid/ask); many one-sided books | same [H] |
| Organic fill volume, 7d | about **18.5k USDST**, 1,841 fills, 19 traders (house/staff/LP addresses excluded; `truncated:true`) | `/leaderboard?window=7d` [H, unit semantics M] |
| Organic fill volume, all time | about **63k USDST**, 6,044 fills, 42 traders | `/leaderboard?window=all` [H, same caveat] |
| Markets created | 3,230 by 2026-09-24; marketId 7634 by 2026-10-19 (about 175/day) | DefiLlama PR; API [H] |
| DefiLlama volume/fees pages | none for this protocol (404 on summary endpoints) | [H] |

One house maker address supplies most resting levels (visible as `maker` on the book) [H]. The FAQ says "The platform's market maker keeps both sides quoted around the live oracle price" [H]. Treat displayed depth as revocable and model-driven.

## Event coverage and overlap

- Categories: crypto price (BTC, ETH, DOGE, BOOE), commodities (gold, silver, Brent), equity/index (NVDA, S&P 500 via SPY). **No sports, politics, or macro events.**
- Overlap with other venues is the same underlying thresholds at similar horizons: BTC/ETH hourly and daily "above X" markets and commodity or index daily markets exist elsewhere (covered by other venue specs; not verified here) [M]. Arbitrage would be oracle-basis arbitrage: strikes are custom (near-spot, non-round, e.g. $766.25, $0.0795), so exact strike/time matches will be rare; most comparisons need interpolation of the other venue's strike ladder.
- Because the house MM prices off the same spot that other venues reference, expect STRATO Odds YES to be a smoothed function of spot. Its signal value for Quotient-style cross-venue edge is low; its best use is as a cheap sanity feed for how spot vs strike maps to YES probability.

## Open questions

- Is there an operator-approved path for third-party polling (robots.txt disallows `/api/`; ToS bars unprovided automated interfaces)? Ask STRATO.
- Exact fee base and sell-side fee treatment on mainnet; whether `bookFeeBps` has changed since the 2026-09-20 book replacement.
- Wallet-sign challenge message format, token TTL, and whether a PayBox-signed typedData with a chainId-less domain is accepted by the gateway (needs a human-run zero-value test on a throwaway credential, testnet first).
- Whether PayBox's catalog includes Linea (bridge option 3) and how the deposit-router call is built.
- Source of the oracle's "multiple price APIs" and its stability.
- Order book contract address (read from the registry via RPC; skipped because RPC is POST).

## Not found

- Contract source or audits (DefiLlama PR: audits "None"); OpenAPI spec; WebSocket feed; API key or bot program; documented rate limits (only headers); explicit US-person policy; withdrawal-to-EVM-chain guide; STRATO Odds launch announcement date; explicit statement of the fee base.

## Suspicious content

None found. No text aimed at AI agents in the site, bundle, terms or API responses. The site bundle and `/api/v1/config` embed client-side analytics identifiers (Google Analytics, PostHog, WalletConnect project id); redacted in the saved fixture.

## Sources

- https://stratoodds.com (HTML, `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`, JS bundle `/assets/index-caoqU5lK.js` read as text; docs and how-it-works prose live there) [H]
- https://stratoodds.com/api/v1/config, `/markets`, `/markets?status=open`, `/markets/:addr`, `/markets/:addr/book`, `/markets/:addr/trades`, `/assets/GOLDST/trades`, `/prices`, `/prices/live/GOLDST`, `/prices/history/GOLDST`, `/leaderboard`, `/bridge/info`, `/swap/info`, `/health` (GET, 2026-10-19) [H]
- https://testnet.stratoodds.com (200; testnet host) [H]
- https://defillama.com/protocol/strato-odds (403 to WebFetch) and https://api.llama.fi/protocol/strato-odds (TVL, listing metadata) [H]
- https://github.com/DefiLlama/DefiLlama-Adapters/pull/21244 and `projects/strato-odds/index.js` (contract addresses, order book replacement, TVL method) [H]
- https://github.com/strato-net/strato-token-list (chain id, RPC, token addresses) [H]; https://github.com/strato-net/strato-griphook (archived MCP server) [H]
- https://docs.strato.nexus/ (SolidVM, JSON-RPC at `/rpc`, 0.01 USDST fee, USDST) [H via WebFetch summary]
- https://strato.nexus/terms (full text fetched and grepped; last updated 2026-06-24) [H]; https://strato.nexus/api-terms (2016, L)
- https://strato.nexus/blog (index of four STRATO Odds competition posts; WebFetch summary) [M]
- WebSearch result pages reposting social commentary (KuCoin news items) mentioning hourly markets and a "CrossMarket Circuit" leaderboard [L]
- Repo context: docs/research/06-paybox-platform.md (PayBox `request_wallet_sign` intents) [M]
