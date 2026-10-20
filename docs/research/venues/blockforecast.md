# BlockForecast - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/curl GETs of public pages and docs, unauthenticated GETs of the site's own JSON endpoints, one WebSocket upgrade handshake (receive only, nothing sent), `gh api` reads of public repos. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. x402 endpoints were GET-probed only to read the 402 requirements; nothing was paid. Third-party text (docs, JS bundle, repos) was treated as untrusted data. The shared WebSearch budget was exhausted before my one search ran, so there is NO independent third-party coverage in this note (see section 16).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary/inferred; **L** = weak/stale.

Fixtures (all <= 25 KB): `docs/research/fixtures/blockforecast/` (section 15).

---

## 0. Bottom line

1. **Live: yes (H).** Site returns 200, `last-modified` 2026-10-14; real trades in the public activity feed dated 2026-10-16..18; rolling 5/15-minute rounds are being created right now.
2. **It is a small, centralised, off-chain LMSR "AMM + optional CLOB" with a USDC vault on Base (H, own GitHub docs).** Positions are Postgres rows, not tokens. Resolution is a platform DB operation (AI-oracle consensus, API-Football for sports, a price feed for up/down rounds), with a team manual-override right.
3. **Real liquidity is almost nil (H).** `/api/v2/stats` on 2026-10-19: headline volume $1.586M but `realOnly.totalVolume` $25,469 lifetime, 266 traders. Across 4,092 listed markets the headline `volume` sums to $223k but `volumeReal` to $2.5k; largest market ever has $306 real volume; only 3 open markets have any real volume. The `liquidity` field is just `b*ln2` of virtual LSMR depth, not money.
4. **Prices are partly not independent (H).** Auto-generated sports markets carry `price_source: api-football` (bookmaker-derived seed), so they echo an external odds feed rather than discover a price.
5. **Bots: ToS prohibits trading with automated scripts "without prior written permission" (H)**, US users are prohibited, VPNs prohibited, and the vault "has not undergone a formal third-party audit" (H). The API nonetheless documents trading.
6. **adapter_priority = skip.** Reasons in section 13.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://blockforecast.io/` | 200, `last-modified: Wed, 14 Oct 2026`, `<title>BlockForecast - Africa's Prediction Market on Base</title>` | H |
| `GET /api/v2/activity?page=1&limit=10` | latest trades 2026-10-18T13:52Z, 10-17, 10-16; trade ids ~4230; sizes $1.20 to $5 | H |
| `GET /api/v2/markets/206164` | 15-minute BTC round created 2026-10-19T04:34Z, i.e. the round generator is running | H |
| `GET /api/v2/oracle/dashboard` | newest recent resolution 2026-10-19T00:04Z | H |
| Docs repo `gr8estman/docs` | last commit 2026-06-28 (3.7 months old) | H |
| System-docs repo `gr8estman/blockforecast-v4` | last push 2026-04-28 (about 5.7 months: borderline stale; used for architecture only) | H |
| DefiLlama `GET api.llama.fi/protocols` | no entry matching "blockforecast" (so no TVL listing) | H |
| Hint repo `gr8estman/BlockForecast` | **Not the prediction market.** It is "V1": a Solana token-risk terminal (package.json deps `@solana/web3.js`, `@jup-ag/api`; README "Solana risk dashboard"); last push 2026-02-27, stale. Its GitHub description (binary markets on Base) does not match its contents. The real docs are in `blockforecast-v4`. | H |

Verdict: **still_live = true**. (Domain/brand age: GitHub org activity starts 2026-02-23, so the prediction-market product is roughly 6 months old.)

---

## 2. Kind and market model

- **Kind:** centralised off-chain prediction exchange with an on-chain custody vault on Base (H: `blockforecast-v4/docs/TRADING_ENGINE.md`, `SMART_CONTRACTS.md`). kind = onchain-other in discovery, but execution is not on-chain.
- **Outcomes:** binary YES/NO. Categorical events are modelled as a "pool" of linked binary markets (`poolId`, `poolOutcomeIndex`, `poolOutcomes[]` with per-outcome price; e.g. a Headies category with 6+ nominees). NO-side quotes are unsupported on pooled markets (live: `GET .../139247/quote?side=no` -> HTTP 500 `"Multi-outcome markets do not support NO quotes."`) (H). No scalar markets found.
- **Pricing:** LMSR ("LSMR" in their docs): `C(q)=b*ln(e^(qYes/b)+e^(qNo/b))`, `P(yes)=e^(qYes/b)/(e^(qYes/b)+e^(qNo/b))`, platform max loss `b*ln2`. Docs say default `b=100`; live markets show `bParameter` 750, 1000, 10000 (H). A CLOB layer exists for limit orders ("if a limit order crosses LSMR price it executes against the pool") (H docs), but every `/orderbook` I read was empty (`{"yes":{"bids":[],"asks":[]},...}`) (H).
- **Tokenisation: none.** "All trade execution happens off-chain in the engine's database. The smart contract (Vault.sol) holds USDC collateral but never executes individual trades." (H, TRADING_ENGINE.md). Shares are DB rows; no ERC-20/1155.
- **Market kinds seen in `metadata.type` (H, counts over 4,092 listed markets):** `matchup` 3,535 (auto-generated sports), `multi_outcome_winner` 98, `binary_option` 57 (rolling crypto Up/Down), `tournament_winner` 14, `binary` 11, `category_winner` 10, others small.
- **Rolling crypto rounds:** BTC/ETH/SOL "Up or Down" 5-minute and 15-minute, always-on; anchor price captured at round start, UP wins if close >= anchor (H docs + live market object). Min trade $1 (H docs).
- **Series/rollover:** `seriesId`, `seriesOrder`, `autoRollover` fields; weekly/monthly recurring series supported (H docs).
- **Docs vs reality caveat (H):** the FAQ says "Market positions, settlements, and creator fee payouts are all executed via smart contracts on-chain". The engineering docs and the ToS contradict that (off-chain ledger, vault custody). Trust the engineering docs.

---

## 3. Chains and collateral

- **Chain:** Base mainnet (chain id 8453) (H: x402 `network":"eip155:8453"`, ToS, docs). Testnet: Base Sepolia 84532 (H, SMART_CONTRACTS.md). A Solana leg exists only for the post-resolution "Metamorphosis" token launch on Bags.fm (not a trading venue for the markets) (H docs, M relevance).
- **Collateral:** native USDC on Base, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (H, public Circle address, quoted in SMART_CONTRACTS.md and x402 docs). Deposits via in-app LI.FI bridge from any chain (Ethereum, Polygon, Arbitrum, Optimism, BNB, Solana ...) or CEX withdrawal to Base; swap/bridge cost 0.1 to 0.4% plus gas (H, how-to-deposit).
- **Vault:** "BlockForecast Vault smart contract ... deployed on Base mainnet", UUPS proxy, ERC-7201 storage, operator-authorised withdrawals, upgrade timelock, emergency withdrawal if the platform is unreachable for 24h+ (H, ToS text in `TermsPage-D5HOLsiF.js` and SMART_CONTRACTS.md). **Vault address: NOT FOUND** (searched: docs.blockforecast.io pages, the 7 v4 docs, the main JS bundle (only 3 placeholder-looking `0x` literals), GitHub repos of the owner). Basescan/vault TVL therefore not checked.
- Funds are credited to an off-chain per-address balance (`GET /api/balances/{addr}` -> `usdcAvailable/usdcLocked/usdcTotal`) (H).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **Exists but needs a key.** Docs: https://docs.blockforecast.io/developers/public-api . Base `https://blockforecast.io/api/v2/public/`. Header `X-API-Key: bf_...`. | H |
| Unauthenticated check | `GET /api/v2/public/markets?limit=1` -> **401** `{"success":false,"error":"Invalid or missing API key."}` | H |
| Key issuance | Wallet-signed: `POST /api/v2/auth/challenge` {address, action:"issue"} -> `message` ("BlockForecast API Key\nAction: issue\nAddress: ...\nNonce: ...\nTimestamp: ..."), sign EIP-191 `personal_sign`, `POST /api/v2/auth/token` -> `bf_...` key shown once; max 5 keys per wallet. Also via UI at /settings/api-keys. **Not executed (would create a key).** | H docs |
| Rate limit (official) | 60 req/min per key, rolling window; headers `X-RateLimit-Limit/Remaining/Reset`, `Retry-After` on 429; higher quota "by email, provisioned manually", pitched at "an arbitrage bot running across hundreds of markets" | H docs |
| Official read endpoints | `GET /public/markets` (status, category, limit<=100, offset, sort), `GET /public/markets/:id` (id, tickerId or slug), `GET /public/markets/:id/trades`, `/price`, `/history` (OHLC), `GET /public/positions`, `/positions/history`, `/balance` | H docs |
| Docs inconsistency | Public-API page shows `{markets,total,limit,offset}`; quickstart says every v2 response is `{success:true,data:{...}}`; list filter documented as `status=open` on one page and `status=active` on others. Response shapes of the keyed API were **not** verified (no key). | H |
| **Unofficial but unauthenticated** | The website's own JSON endpoints answer unauthenticated GETs (found in the public JS bundle `/assets/index-p8xtwj1-.js`): base `https://blockforecast.io/api/v2`: `GET /markets?status=&category=&sort=&page=&limit=&q=&lite=true` -> `{markets:[...],total,page}`; `GET /markets/:id`; `GET /markets/:id/quote?side=yes|no&amount=USDC`; `/markets/:id/sell-quote`; `/markets/:id/quote-limit`; `/markets/:id/price`; `/markets/:id/orderbook`; `/markets/:id/trades?limit=`; `/markets/:id/chart?timeframe=`; `GET /activity?page=&limit=`; `GET /stats`; `GET /oracle/dashboard`; `GET /oracle/:id`; `/leaderboard`. Response header `x-ratelimit-limit: 3000`, `cache-control: public, max-age=10`. These are undocumented and may change or be blocked; ToS bans unauthorised scraping. | H (behaviour), M (stability) |
| Live list sample | 9 markets returned for `limit=3` (pooled outcomes are expanded), fields: id, slug, tickerId, question, category, status, qYes, qNo, bParameter, yesPrice, noPrice, volume, **volumeReal**, liquidity, resolutionCriteria, resolutionSource, sourceWhitelist, createdAt, tradingClosesAt, resolvesAt, resolvedOutcome, seriesId, metadata{type,...}, hasOrderbook, poolId, poolOutcomes[], peerFunded, delisted, ... | H (fixture `markets_list_default_page1.json`) |
| Pagination | `limit<=100` honoured; `lite=true` shrinks payload; `total` 4,096 vs 4,092 unique ids collected across 41 pages (ordering shifts while paging) | H |
| WebSocket | `wss://blockforecast.io/ws/global` accepts an unauthenticated upgrade (101) and streams: `connected`, `spot_price` (BTC/ETH/SOL, about 4 Hz), `ping`; the client code also handles `price_update {marketId,yesPrice,noPrice,volume}`, `activity_batch {trades}`, `new_market`, `market_resolved`. Per-user channel `/ws/user/{address}` exists (auth not tested). Undocumented officially (docs only mention a "WebSocket broadcaster" in passing). | H (handshake + frames), M (other event shapes from client code) |
| Paid x402 reads | `GET /api/v2/x402/info` free (H); `GET /api/v2/x402/feed` $0.001, `GET /api/v2/x402/oracle/resolve?q=` $0.05; unpaid GET -> **HTTP 402** `{"x402Version":2,"accepts":[{"scheme":"exact","price":"$0.001","network":"eip155:8453","payTo":"<platform address>"}],...}` with header `x-payment-required: true`. Recorded and stopped. | H |
| Resolution data | Per-market `status`, `resolvedOutcome`, `resolvedAt`, `payoutStatus`, `payoutReleaseAt`, `hasActiveAppeal`; oracle records `GET /oracle/:id`, dashboard `GET /oracle/dashboard` | H |
| On-chain / subgraph | Only vault deposit/withdraw events (no market data on-chain) (H docs) | H |

**Data-quality warnings for an aggregator (all H, live 2026-10-19, fixture `price_orderbook_quote_samples.json`):**
- `GET /markets/:id/price` returns 0.5/0.5 on a pooled market whose list price is 0.4434 and whose quote averages 0.447. Use list `yesPrice`/`noPrice` or, better, `/quote`.
- `volume` (headline) is roughly 90x `volumeReal` in aggregate. Use `volumeReal` and the quote; never treat `liquidity` (= `b*ln2`, e.g. 693.147 or 6931.47) as depth.
- On the 15-min BTC round, list `yesPrice` 0.60, `/price` 0.50, but `/quote?side=yes&amount=10` gave avgPrice **0.794** and `side=no` avgPrice **0.353** (sum of the two executable prices 1.147), with undocumented fields `edgeAppliedUsdc` and `edgePctAtQuote: 0.05`. Meaning NOT FOUND (searched: all docs pages, bundle). Treat the quote endpoint as the only executable price and expect a wide effective spread on rolling rounds.

---

## 5. Trade path

- **Documented:** `POST /api/v2/public/markets/:id/trade` with `X-API-Key` (listed in the "additional endpoints" table; **request body schema NOT FOUND** in the docs pages I read). `POST /api/v2/public/markets` creates markets (creator approval needed).
- **Observed in the web client (bundle, not executed):** `POST /api/v2/trade {marketId, side, amountUsdc, walletAddress, maxPrice?}`; `POST /api/v2/sell {marketId, side, shares, walletAddress, minProceedsUsdc?}`; limit orders under `/api/v2/orders`, `/orders/cancel`, `/trigger-orders`; `POST /api/v2/withdraw {walletAddress, amountUsdc, destinationAddress}`. The client code attaches **no explicit signature or Authorization header** to these calls (it uses plain `fetch`; whether the server relies on a session cookie is NOT TESTED). I did not POST anything. Do not assume per-order signing exists.
- **Auth scheme:** one-time EIP-191 wallet signature mints a long-lived bearer key (`bf_...`, SHA-256 stored server-side). Orders are then plain authenticated HTTP; there is no per-order EIP-712/EIP-1271 signature and no on-chain trade transaction (H docs).
- **x402 path:** EIP-3009 `transferWithAuthorization` USDC payments on Base per call; the paid endpoints are data/oracle/market-creation only, not trading (H).

## 6. PayBox reachability

**partial.**
- Base is in PayBox's chain catalog and `request_wallet_sign` supports an EIP-191 `message` (H, repo note `docs/research/06-paybox-platform.md`, 2026-10-19), so an agent could in principle sign the key-issuance challenge, and `pay_x402` could in principle cover the $0.001 feed. Neither was attempted here.
- Funding needs a USDC transfer on Base to the platform's deposit/vault target, which is **not published** (section 3). Trades themselves are off-chain bearer-key HTTP calls, so PayBox transaction proposals or signed orders are not in the per-trade loop and its spend policy would not see trades. The bearer key lives with the agent.
- Net: technically reachable for key minting and funding, not as a signed-order/proposal venue. Plus the ToS bot ban and unaudited vault make it unsuitable regardless.

---

## 7. Fees

| Item | Value | Tag |
|---|---|---|
| Creator fee | 0.5% of each trade (buy and sell), paid to the market creator; locked at creation | H (creators/earn-fees) |
| Protocol fee | "plus a small protocol fee"; **rate NOT FOUND in docs** | H (statement) |
| Observed `totalFee` in `/quote` for $10 | $0.05 (0.5%, `feeMultiplier:1`) on rolling rounds; $0.075 (0.75%, `feeMultiplier:1.5`) on a market closing in 70 days; $0.10 (1.0%, `feeMultiplier:2`) on a market closing in 4 days. `nextTierBoundary` timestamps show a time-to-close fee ramp | H (live), M (interpretation) |
| Near-resolution ramp | Fee "ramps up" before resolution on rolling rounds; position caps and time-decaying impact caps | H docs |
| Creator withdrawal | 30% platform cut at withdrawal, min $10 | H docs |
| Market creation | $1 USDC flat, non-refundable; 5 markets per 24h per wallet | H (v4 docs, x402 info) |
| Deposit | LI.FI bridge 0.1 to 0.4% + source gas; CEX route free of platform fee | H docs |
| Withdrawal fee for traders | NOT FOUND (creator withdrawals: gas paid by engine signer) | - |
| Hidden spread | see section 4 `edgeApplied...`; round-trip `instantLossPct` observed 1.5% to 2% on slow markets and **29% to 38%** on a fresh 15-min round | H |

## 8. Resolution mechanism and dispute risk

- **Three paths (H):** (a) sports matchups: API-Football fixture statistics ("The resolver reads the fixture's statistics array", market 201517); (b) Up/Down rounds: price feed snapshot (docs: Pyth Hermes -> CoinGecko -> Binance fallback, void if all fail; the live market text says CoinGecko, so docs and market disagree); (c) everything else: AI oracle consensus over a creator-frozen source whitelist.
- **AI oracle:** docs describe 7 agents from 5+ providers with accuracy-weighted ensemble, ~12 s, void if confidence < 60%. The live dashboard (2026-10-19) shows 241 consensus resolutions, **241 "correct" (100%, self-graded by the platform)**, and recent rows with `agent_count: 3` rather than 7 (H). Only 241 of 3,587 resolved markets went through it (H counts, M inference: the rest used feeds).
- **Payout hold and appeals:** payouts held 24 h (ToS) with an appeal window of 24 h (resolution-policy) or 48 h (transparency page): docs disagree (H). Appeal -> blind adversarial agent round -> manual team review; "BlockForecast's decision on any manual override is final", "The appeal system's decision is final" (H, ToS/Terms summary).
- **Dispute risk: HIGH (M).** Single-operator, no on-chain commitment of outcomes, discretionary manual override, LLM-based resolution of free-text questions, creator-defined criteria, ToS disclaims liability for incorrect resolutions. Any cross-venue arb leg here carries resolution-basis risk against UMA/Kalshi-style resolvers.

## 9. Geo / ToS / automation

- Prohibited jurisdictions (H, `https://blockforecast.io/terms`, chunk `TermsPage-D5HOLsiF.js`): "including (without limitation) the United States, Cuba, Iran, North Korea, Syria, and OFAC-sanctioned regions"; VPN circumvention prohibited (forfeiture of funds). FAQ: no US-political markets listed. No KYC currently (H docs FAQ).
- Automation (H, same ToS): prohibited "Use automated scripts or bots to trade without prior written permission" and "Circumvent rate limits, position caps". The docs, however, advertise a trading API and an x402 agent API. **Treat bot trading as requiring written permission** (support address is on the docs/contact page).
- Custody/solvency: vault "not undergone a formal third-party audit"; "Platform balances are not FDIC-insured"; liability capped at the user's balance (H ToS). Solvency endpoint `/api/v2/transparency/solvency` returned 403 without auth (H).

## 10. Liquidity (all with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Headline total volume | $1,586,061 | `GET /api/v2/stats`, 2026-10-19 | H |
| **Real-only total volume** | **$25,469** | same (`realOnly.totalVolume`) | H |
| Traders / trades | 266 traders; 3,299 trades (realOnly says 3,315: internal inconsistency) | same | H |
| Markets | `totalMarkets` 203,967 (mostly resolved rolling rounds, M), `activeMarkets` 2,802; list endpoint shows 505 open / 3,587 resolved | stats + list paging 2026-10-19 | H |
| Virtual depth | `totalDepth` $19.4M; `depthPerMarket` $6,931 (= 10000*ln2). This is LSMR max-loss capacity, not posted liquidity | same | H |
| Per-market real volume | sum over 4,092 listed markets $2,527; 74 markets > 0; 3 open; max $306 | derived, fixture `DERIVED_market_universe_2026-10-19.json` | H |
| Recent trade size | $1.20 to $5.00, about 10 trades in 3 days | `/activity`, 2026-10-16..18 | H |
| Vault TVL | NOT FOUND (vault address unpublished; solvency endpoint auth-gated) | - | - |

## 11. Event overlap with other venues (where arbitrage could exist)

- **Crypto Up/Down 5 and 15 min (BTC, ETH, SOL):** conceptually overlaps rolling up/down products elsewhere (M; other specs cover those venues). But the anchor is this venue's own feed at round start and the executable quote shows a very wide effective spread, so cross-venue basis and spread kill the edge (H on the quote, M conclusion).
- **Sports (football leagues incl. La Liga, Liga MX, Primeira Liga; NBA; IPL cricket; Diamond League; UFC):** 3,868 of 4,092 listed markets. Overlaps Polymarket/Kalshi/sportsbooks on major fixtures, but prices are seeded from API-Football (`price_source: api-football`, `created_via: auto-generator`), i.e. a derivative of an external odds feed, with near-zero real flow (H).
- **Politics:** Nigeria 2027 election, Nigerian policy (22 politics markets, 7 open, mostly $0 volume). No US politics. Little overlap (H counts, M).
- **Crypto price levels (e.g. "BTC close above $X on date"):** 16 total, 1 open. Overlaps Polymarket/Kalshi ladders in theory (M), no liquidity.
- **Macro/economy:** 22, all resolved, none open (H).
- **Unique (no counterpart):** Nigerian entertainment (Headies, Big Brother Naija), AfroBasket, NPFL/AFCON.

## 12. Shared liquidity with another venue?

No evidence of routing or pooling with any covered venue (NOT FOUND; searched: docs, v4 docs, bundle for `polymarket` - only footer SEO links "Polymarket alternative"). The oracle's "Crowd Reader" agent reads Polymarket data as an input to resolution (H docs), and sports seeds come from API-Football. So liquidity is independent but synthetic, and prices are not independent of external odds for sports. The Bags.fm token step (Solana) is post-resolution and separate.

## 13. adapter_priority: skip

Reasons: (1) real lifetime volume about $25k, trades of $1 to $5, so any "edge" is not executable at meaningful size; (2) headline volume and `liquidity` are inflated/virtual, which would pollute an aggregator if ingested naively; (3) ToS forbids unpermissioned bot trading and US users; (4) off-chain bearer-key execution, unaudited vault, vault address unpublished, so it does not fit PayBox's proposal/signing model; (5) discretionary AI/manual resolution with high basis risk; (6) overlapping sports prices are seeded from external odds.
Revisit if `stats.realOnly.totalVolume` exceeds about $1M, the vault address and an audit are published, and written bot permission is obtained. If ever ingested as a read-only signal, use the unauthenticated `/api/v2/markets?lite=true` with `volumeReal`, the `/quote` endpoint for executable price, and `ws/global` for pushes.

## 14. Doc/live inconsistencies and open questions

1. FAQ "all on-chain" vs engineering docs "off-chain ledger + vault" (H both).
2. 5/15-min halt window: docs 30 s / 60 s, live market `haltSeconds: 90` on a 15-min round (H both).
3. Rolling-round resolution source: docs Pyth Hermes, live market text CoinGecko (H both).
4. Appeal window 24 h vs 48 h; oracle 7 agents vs `agent_count: 3` (H both).
5. `realOnly.totalTrades` (3,315) > `totalTrades` (3,299) in `/stats` (H).
6. Open: vault address; protocol-fee rate; meaning of `peerFunded`, `edgeAppliedUsdc`, `volume` vs `volumeReal` (seeding?); whether `/api/v2/trade` and `/api/v2/withdraw` enforce a server-side session (client code sends only `walletAddress`; NOT TESTED, deliberately); public trade endpoint body schema; keyed-API response shape; the full ToS effective date.

## 15. Fixtures saved (`docs/research/fixtures/blockforecast/`)

`stats_2026-10-19.json`, `markets_list_default_page1.json` (24 KB, 9 markets), `market_detail_btc_15min_binary.json`, `price_orderbook_quote_samples.json` (price, orderbook, trades, 5 quote responses incl. the HTTP 500 pool-NO case), `x402_info.json`, `x402_feed_402_body.json` + `x402_feed_402_headers.txt`, `public_markets_no_key_401_body.json` + `_headers.txt`, `response_headers_markets_unauth.txt`, `ws_global_sample_frames.json`, `oracle_dashboard_2026-10-19.json`, `activity_feed_sample_redacted.json` (third-party wallet addresses and usernames redacted), `DERIVED_market_universe_2026-10-19.json` (aggregates computed this session from 41 list pages).

## 16. Sources

Primary, first-hand (all fetched 2026-10-19):
- https://blockforecast.io/ (HTML, headers, JSON-LD, meta)
- https://blockforecast.io/assets/index-p8xtwj1-.js (main bundle: endpoint list, client request code, WS code)
- https://blockforecast.io/assets/TermsPage-D5HOLsiF.js (Terms text rendered at https://blockforecast.io/terms)
- https://blockforecast.io/api/v2/{stats,markets,markets/:id,markets/:id/price,orderbook,quote,trades,activity,oracle/dashboard,x402/info,x402/feed,x402/oracle/resolve,public/markets} and `wss://blockforecast.io/ws/global`
- https://docs.blockforecast.io/llms.txt and pages: introduction, how-to-deposit, 5-minute-bitcoin-markets, creators/earn-fees, creators/overview, how-it-works/{ai-oracle,resolution-policy,transparency}, legal/{faq,terms,are-prediction-markets-legal}, developers/{quickstart,authentication,public-api,rate-limits,x402-overview,x402-create-market,claude-skill}
- https://github.com/gr8estman/blockforecast-v4 (README, docs/TRADING_ENGINE.md, SMART_CONTRACTS.md, CREATOR_ECONOMICS.md, ORACLE.md); https://github.com/gr8estman/docs (commit log); https://github.com/gr8estman/blockforecast-skills (SKILL.md); https://github.com/gr8estman/BlockForecast (V1, Solana terminal: README, package.json, metadata.json, commit log)
- https://api.llama.fi/protocols (absence check)
- Repo note `docs/research/06-paybox-platform.md` (PayBox chain catalog and `request_wallet_sign` message type)

Not available: independent third-party coverage, audits, incident reports, X/Twitter, Basescan/vault data. NOT FOUND (searched: WebSearch budget exhausted before the single query ran; no workaround attempted).

## 17. Suspicious / agent-directed content (recorded, not followed)

- Every docs.blockforecast.io page starts with a banner telling readers/agents to "Fetch the complete documentation index at https://docs.blockforecast.io/llms.txt" (Mintlify boilerplate; benign; I only fetched llms.txt as part of normal research).
- The homepage HTML comments say the JSON-LD is for "AI engines"; the docs advertise an agent skill (`bf-create-market`) that asks the user to put a raw EVM private key in `BF_AGENT_KEY` and spend USDC over x402. The docs themselves call this "plain-text private-key custody". Not installed or run.
- The site markets itself heavily to AI agents (x402, "agents can become self-funding"); nothing in it attempted to instruct this session.
