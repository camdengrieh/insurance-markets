# Polytrader (polytrader.ai) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. Polytrader is not a venue. It is a front-end / AI-assistant / custodial-wallet broker that routes orders to the Polymarket CLOB (H). It has no market model, order book, resolution or liquidity of its own, and no public API (H, NOT FOUND elsewhere).
- Any edge Polytrader could "see" is Polymarket edge, which the Polymarket adapter already covers. It is not an independent arbitrage leg (H: docs say it places bets on Polymarket via a custodial wallet).
- Signal value for Quotient/aggregation: none usable. Its "insights" are gated behind holding 500,000 $POLY and have no API (H).
- Name-collision warning: at least four unrelated products use "Polytrader" (see Identity). The DefiLlama numbers labelled "Polytrader" appear to belong to **polytrader.app**, not polytrader.ai (H evidence below).

## Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| polytrader.ai homepage | HTTP 200 on 2026-10-19, Next.js on Vercel, title "Polytrader", meta "Your AI assistant for Polymarket success!" | H |
| Nav | Markets (/markets), Profile (/profile), Connect (wallet) | H |
| Footer links | docs (polytrader.gitbook.io -> 307 -> docs.polytrader.ai), X @polytraderAI, Telegram t.me/polytraderai; no GitHub, no terms, no privacy link | H |
| /terms /privacy /tos /api /api/trpc /robots.txt /sitemap.xml /openapi.json | all HTTP 404 | H |
| Docs freshness | Docs are Nov 2024 - Jan 2025 vintage (a screenshot filename is dated 2025-01-24; token launched 2024-11-25). No evidence of docs updates in 2026. Treat as possibly stale (>6 months). | M |
| Product activity in 2026 | Site is up; markets UI is a client-rendered app on an internal tRPC backend. I could not verify real trading activity on polytrader.ai itself. | M |
| $POLY token (Virtuals agent id 6348, Base) | Still listed, status AVAILABLE, but volume24h = $1.37, liquidityUsd ~ $42.6k, mcap ~ 92k VIRTUAL on 2026-10-19; Solana Wormhole pool: 24h volume $12, FDV ~ $7.7k. Effectively dormant token. | H |
| DefiLlama listing | id 7887, "Polytrader", category Interface, tag "Polymarket Builder", chain Polygon, url polytrader.ai, twitter polytraderAI, description "Polytrader is a prediction platform powered by Polymarket". `doublecounted: true`. | H |

### Four different "Polytrader"s (do not conflate)

1. **polytrader.ai** (this task): AI assistant + custodial wallet, token-gated by $POLY on Base, Virtuals agent, X @polytraderAI. (H)
2. **polytrader.app**: a Polymarket trading terminal ("Basic"/"Advanced" views, orderbook UI, Safe wallet, MagicLink or MetaMask login, pUSD balances), X @PolytraderApp, Telegram t.me/polytraderapp. Its client bundle hard-codes the Polymarket **builder code** `0x6f5dfb79...bc64` and a remote builder-signing endpoint on its own host (`/api/builder`) and talks to `clob.polymarket.com`. (H, read from https://polytrader.app/js/dist/basic.js)
3. **polytraderpro**: separate Polymarket builder (different builder code 0x29f8d199...), separate DefiLlama entry "polytraderpro". polytrader.pro has an expired TLS certificate on 2026-10-19. (H for code/entry, M for site status)
4. polytraderai.com ("PolyTrader AI", a Polymarket automation product) and web3devz/polytrader (hackathon repo): unrelated per a web search result only. (L; second search could not be run, session search budget exhausted)

Key inference: DefiLlama's adapter `polytrader-app` uses builder name "Polytrader.app" and builderCode `0x6f5dfb79...` (H, factory/polymarket.ts in DefiLlama/dimension-adapters). That same code is hard-coded in polytrader.app's bundle (H). So the volume/fees DefiLlama shows under the "Polytrader" page (url polytrader.ai) are, on the evidence, **polytrader.app's** builder flow. Whether polytrader.ai and polytrader.app share an operator is NOT FOUND (neither site links the other; X handles differ). Treat DefiLlama's mapping to polytrader.ai as M/L.

## Kind and market model

- Kind: broker-or-frontend / AI assistant over Polymarket. Not a market venue. (H: "AI-powered assistant designed to enhance the user experience on Polymarket", docs "What is Polytrader.ai")
- Market model: inherited from Polymarket: binary + multi-outcome (neg-risk) events, central limit order book, outcome tokens = Polymarket CTF ERC-1155 tokens on Polygon. Not re-verified here (Polymarket spec is covered by a parallel workflow). The Polytrader market UI renders Polymarket events; for 2-outcome events it shows a probability dial, for multi-outcome a list (H, read from app/markets page chunk).
- Technical analysis: backend pulls history from Polymarket's Gamma API and computes "7 key indicators" used by the agent (H, docs "Technical Analysis").
- Autonomous trading: user-set take profit, stop loss, shares per bet, trading frequency; Terminal chat can place or close bets (H, docs).

## Chains and collateral

- Execution chain and collateral: Polygon, USDC.e per Polytrader docs ("To place bets on Polymarket, you need USDC.e (USDC on the Polygon network)") (H, docs "Deposit"). polytrader.app's UI shows pUSD balances and "bridged to USDC.e" deposits, which hints Polymarket V2 collateral (pUSD) is now in play in 2026; not independently verified here (M). Flag for the Polymarket spec.
- Funding: users can load USDC on **Base** into the account that holds $POLY and click "Fund Wallet"; an "auto-bridge" moves it to Polygon (H, docs). Bridge provider not named (NOT FOUND). The bundle references relay.link, but that is a generic wallet-SDK dependency and not confirmed as the bridge.
- Token gate: 500,000 $POLY (ERC-20 on Base, `0x2676e4e0...cedf5`; Wormhole copy on Solana) must be held by the connecting wallet "on the base network" (H, docs).
- Wallets supported at login: WalletConnect/Reown-style EVM wallets (H, bundle references walletconnect, wagmi, viem, Base RPC), plus a Telegram bot (t.me/PolyTraderBot, H link in bundle). Solana: only the bridged POLY token is mentioned; no Solana trading (H, absence).

## Read API

- exists: **none** (no official public API).
- Docs: https://docs.polytrader.ai/ (product docs only; 14 pages; sitemap https://docs.polytrader.ai/sitemap.md, full export https://docs.polytrader.ai/llms-full.txt). No API reference, no OpenAPI, no SDK. (H)
- Frontend talks to an internal tRPC backend (bundle references tRPC, `superjson`); not documented, not probed (undocumented host; skipped on purpose). (M)
- Roadmap mentions "Agent-to-Agent" access via X and a "GAME SDK" integration; nothing shipped that I could find. (H for roadmap text, NOT FOUND for shipped API)
- WebSocket: NOT FOUND.
- Rate limits / auth: NOT FOUND (no API).
- For market data use Polymarket directly (Gamma/CLOB/Data APIs): covered by the Polymarket spec.

### Public data that does exist about Polytrader (all via third parties, all GET, no auth)

| Endpoint | What | Tag |
|---|---|---|
| `GET https://api.llama.fi/protocol/polytrader` | DefiLlama metadata (fixture `defillama_protocol_polytrader.json`) | H |
| `GET https://api.llama.fi/summary/dexs/Polytrader` and `/summary/fees/Polytrader` | volume / builder-fee series (trimmed fixtures). Note slug is `Polytrader`; `polytrader-app` returns HTTP 400 | H |
| `GET https://data-api.polymarket.com/v1/builders/volume` | per-builder daily volume rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`; response is ~17 MB (53k rows), so filter client-side | H |
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH&limit=50` | builder ranking; rows `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}` | H |
| `GET https://api.virtuals.io/api/virtuals/6348` | POLY agent/token stats | H |
| `GET https://api.dexscreener.com/latest/dex/search?q=...` | POLY Solana pool | H |

Fixtures saved under `docs/research/fixtures/polytrader/` (all under 12 KB):
`defillama_protocol_polytrader.json`, `defillama_dexs_summary_polytrader_trimmed.json`, `defillama_fees_summary_polytrader_trimmed.json`, `polymarket_builders_volume_polytrader_app_last30d.json`, `polymarket_builders_leaderboard_month_polytrader.json`, `virtuals_agent_6348_summary.json`, `docs_sitemap.md`, `docs_llms_full.txt`.

## Trade path

- Programmatic order placement through Polytrader: **none**. Orders are placed through its web UI, its Telegram bot, the "Terminal" chat agent, or its autonomous agent, from a **custodial wallet generated by Polytrader** for each user after the $POLY-holding wallet connects (H, docs "Custodial Wallet"). The user can reveal that wallet's private key from /profile after a proof-of-ownership prompt (H, docs).
- Auth/signing: wallet connection to the website; mechanism (SIWE or similar) not documented (NOT FOUND). Orders are signed server-side by Polytrader's custodial key, not by the user's wallet.
- Custody: custodial (operator holds keys; user can export). This is a counterparty risk an aggregator should not take on. (H docs; risk assessment is mine)
- Reachable by an agent/PayBox EVM wallet? **No** via Polytrader: no API, token gating, UI-only login, custodial signing. **Yes, indirectly** via Polymarket itself: an EVM wallet that holds the right collateral on Polygon can sign Polymarket CLOB orders (EIP-712) directly, with no need for Polytrader. If a builder code is wanted, it is attached to the signed order (Polymarket docs: "serialized onchain as part of the signed order"). (H for builder docs; the order-signing details belong in the Polymarket spec.)
- PayBox fit: paybox_reachable = no for this venue (see Polymarket spec for the real path). No money-moving or signing tool was called in this research.

## Fees

- Polytrader.ai user-facing fees: **NOT FOUND** (searched: homepage, all 14 docs pages incl. llms-full.txt, tokenomics page, Alea Research Nov 2024 article which also says "Fees: not mentioned"). Tokenomics page states $POLY buy/sell tax 0% (H). The only stated cost of access is the 500,000 $POLY holding requirement (about $1,500 at Nov 2024 prices per the Alea article, M; now worth a tiny fraction given the ~$7.7k Solana FDV and 92k-VIRTUAL Base mcap).
- Builder fee (for polytrader.app builder code): DefiLlama says "Builder fees received by Polytrader.app from trades on Polymarket v2" (H). Realised fees $12,180 all-time, $2,124 in last 30d, $125 on 2026-10-19, against volume of $9.14M all-time (DefiLlama, fetched 2026-10-19). That implies a take rate of only about 0.1% - 0.15% of notional (derived, M). Who pays and the formula: NOT FOUND (Polymarket builder intro page does not state fee rates, H for the absence).
- Underlying Polymarket trading fees: out of scope here (parallel workflow).

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle at time of the old Polymarket design; not re-verified here). Polytrader has no resolution role (H: it is an interface; docs mention only "positions" and "manually close"). Dispute and redemption risk therefore equals Polymarket's, plus custodial-key risk at Polytrader.

## Geo, ToS, automation

- No terms of service, privacy policy or geo-restriction text found on polytrader.ai (all common paths 404; no footer links; docs silent). NOT FOUND (searched: homepage HTML, app bundles, docs, llms-full.txt).
- Underlying Polymarket geo rules apply (Polymarket global blocks several jurisdictions including the US for the global venue; verify in the Polymarket spec).
- Automation: Polytrader itself advertises automation (autonomous trading 24/7 with take profit/stop loss). It offers no automation interface to third parties.
- polytrader.app: no terms/privacy/geo links visible either (H).

## Liquidity

- Polytrader has no liquidity of its own; it routes to Polymarket's CLOB (H for docs; Polymarket builder docs state routed orders are submitted to and matched on Polymarket's CLOB, H).
- Routed volume (builder code of polytrader.app; see Identity caveat):
  - DefiLlama (fetched 2026-10-19): 24h $201,117; 7d $626,770; 30d $2,792,484; all-time $9,139,688 (series starts 2026-07-05). `doublecounted: true`. (H)
  - Polymarket data-api builders/volume (fetched 2026-10-19), same builder code: daily rows from 2025-12-17 to 2026-10-18; sum of last 30 daily rows $4.87M; Oct 1-18 $2.45M; Sep $6.68M; Aug $5.75M; Jul $6.97M; Jan-Jun about $44.1M; total about $65.9M. Leaderboard (timePeriod=MONTH): rank 32, $2.45M, **6 active users**. Daily active users in October: 1-4. (H)
  - The two sources disagree by a large factor (DefiLlama all-time $9.1M vs Polymarket rows $65.9M); likely different window or definition. Not resolved. Either way the flow is a handful of users, a rounding error versus Polymarket (all-builder volume on 2026-10-18 about $31.7M across 201 builders, H).
- TVL: none (no pooled funds; custodial per-user wallets). DefiLlama TVL series empty. (H)

## Event categories and overlap

- Same events as Polymarket (sports, politics, crypto price, macro, etc.). Overlap with other venues is therefore Polymarket's overlap. No Polytrader-exclusive markets found. (M: Polytrader renders Polymarket events from Gamma; the roadmap's "Cross-Markets Arbitrage" and "Market-Making Arbitrage" items are unshipped plans, H for text, NOT FOUND for any shipped feature.)

## Liquidity shared with

- **Polymarket** (100%). Not an independent arbitrage leg. Any aggregator that already reads Polymarket gets everything Polytrader could add. The only unique data would be Polytrader's per-builder flow stats (public via Polymarket data-api, see above), which has no signal value at this size.

## Suspicious content / injected instructions

- None found in the pages and API responses read. (The Virtuals agent description contains promotional language such as "AI scans real-time news ... capitalizing on arbitrage and mispricing opportunities" and "the default AI execution layer"; this is marketing copy, not an instruction, and was not acted on.)

## Open questions

1. Are polytrader.ai and polytrader.app the same operator? (Affects whether DefiLlama's flow numbers describe polytrader.ai at all.)
2. Does polytrader.ai attach a Polymarket builder code to its custodial orders, and which? Not visible; the docs do not mention one.
3. Is polytrader.ai still seeing real usage in 2026? Site is up and the token is dormant; no usage metric found.
4. Polymarket V2 / pUSD collateral change implied by polytrader.app's UI: confirm in the Polymarket spec.
5. A second web search could not be run (shared session search budget exhausted), so 2026 news / X posts about polytrader.ai were not reviewed. X page https://x.com/polytraderAI returned HTTP 200 but content was not read.

## Sources

- https://www.polytrader.ai/ and /markets (H, fetched 2026-10-19; HTML and public JS chunks read as text, nothing executed)
- https://docs.polytrader.ai/sitemap.md, https://docs.polytrader.ai/llms-full.txt (H; docs vintage Nov 2024-Jan 2025, possibly stale)
- https://polytrader.gitbook.io/polytrader/ (307 redirect to docs.polytrader.ai) (H)
- https://defillama.com/protocol/polytrader (HTTP 403 to scripted fetch; data read instead from https://api.llama.fi/protocol/polytrader and /summary/dexs|fees/Polytrader) (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H, builder code mapping and fees methodology)
- https://data-api.polymarket.com/v1/builders/volume and /v1/builders/leaderboard (H)
- https://docs.polymarket.com/developers/builders/builder-intro (H via fetch summary; fee rates not stated)
- https://polytrader.app/ and https://polytrader.app/js/dist/basic.js?ver=1.0.11 (H; builder code, CLOB host, builder-signing path)
- https://api.virtuals.io/api/virtuals/6348 (H, token stats 2026-10-19)
- https://api.dexscreener.com/latest/dex/search?q=POLY%20polytrader (H, Solana pool stats 2026-10-19)
- https://alearesearch.substack.com/p/polytrader-polymarket-trading-ai (M, Nov 26 2024 newsletter, promotional, stale)
- https://messari.io/project/polytrader (HTTP 403; only search-snippet seen, L)
- https://github.com/web3devz/polytrader, https://polytraderai.com/ (search-result titles only, L; not visited)
