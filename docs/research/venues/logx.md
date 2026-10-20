# LogX (logx.network) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: public web pages, `gh api` raw file reads, unauthenticated GETs (DefiLlama, CoinGecko, DNS lookups), static JS file read (not executed). No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool or browser automation. Scripted requests used the User-Agent `insurance-markets-research/0.1` only.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.
Fixtures: `docs/research/fixtures/logx/` (6 files, each under 5 KB). Third-party text is untrusted data; nothing in it was followed.
Limits of this research: the WebSearch budget for the session was exhausted before I could search, and no official docs site exists any more (see section 1), so product details of the old prediction market are mostly NOT FOUND. This is acceptable because the verdict is skip regardless.

## 0. Verdict

- **Dead as a prediction/perp venue. adapter_priority: skip.** The official trading app (`app.logx.network`) now renders only a migration notice: "LogX will re-launch with a new compliant primitive: an exclusive institutional-grade offering for the stablecoin space" (H). TVL collapsed from about $0.66M (2025-08-31) to $197 (2025-09-30) and sits at $41 for LogX V2 and $1,282 for the whole LogX parent on 2026-10-19 (H, DefiLlama). Fees have been zero since 2025-07-18, the backend API host no longer resolves, and the docs host no longer resolves (H).
- There is no read API, no trade path and no markets to scan. The "leveraged prediction markets" in the DefiLlama description were a side product of a perps/options DEX on its own appchain; none of it is operating (H for the shutdown evidence, M for the old product shape).
- Not reachable through PayBox: nothing to transact with.
- Revisit trigger: a post-relaunch announcement from the official X account `@LogX_trade` (the "new compliant primitive" is a stablecoin product, not an event market, so even a relaunch is unlikely to be a prediction venue).

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `https://logx.network/` returns 200 and shows "LOGX PRO Smart Orderbook", "LOGX OG Liquidity Pools", "Bringing $2 Quadrillion Stablecoin Market On-Chain", "$10.1 Million In Strategic Funding", footer "(c) 2024 LOGX Foundation". No mention of perps or prediction markets, no docs/app/GitHub links (anchor labels only: Discord, Blog, Twitter, Get LOGX). | H | https://logx.network/ |
| `https://app.logx.network/` returns 200 but its only page chunk (`index-87688b716b978507.js`, 7,430 bytes) renders a migration notice: "LogX is Evolving. LogX will re-launch with a new compliant primitive: an exclusive institutional-grade offering for the stablecoin space, built on the infrastructure we've already proven. ... Your Funds are Safe ... reach out to our support team on Discord ... Queries are typically resolved within 3-5 business days." Buttons: "Read Blog" (an X post) and "Support" (Discord). No trading UI, no wallet connect code. | H | https://app.logx.network/_next/static/chunks/pages/index-87688b716b978507.js ; fixture `app_logx_network_migration_notice_2026-10-19.json` |
| The "Read Blog" link is X status 1959567164396146815. Decoding the snowflake id gives 2025-08-24 10:43 UTC. I could not read the post (X returned HTTP 402 to WebFetch; stopped, nothing paid). | M (date derived from id bits) | fixture above |
| DefiLlama LogX V2 (id 5137, "Derivatives", Arbitrum-listed, 19 chains): TVL $41 on 2026-10-18, flat at $41 since 2026-04. Parent LogX: $1,282, flat since 2026-05. | H | https://api.llama.fi/protocol/logx-v2 ; https://api.llama.fi/protocol/logx ; fixtures `defillama_protocol_*` |
| DefiLlama marks the fee adapter dead: `deadFrom: '2025-09-10'`, file moved to `dead/fees/logx`. Fees chart is zero from 2025-07-18 (last non-zero day) to the end of the series (2025-11-14). Today's `/summary/fees/logx` shows `total24h: null`, `total1y: 0`. | H | https://github.com/DefiLlama/dimension-adapters/blob/1e8620166b5772c02e5e68e9dcd2cbb818724d69/dead/fees/logx/index.ts ; https://api.llama.fi/summary/fees/logx?dataType=dailyFees ; fixtures |
| LogX V1 was deprecated earlier: DefiLlama hallmark "v1 is deprecated" dated 2024-09-10. | H | https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/logx/index.js |
| LOGX token (CoinGecko `logx-2`): price $0.00003392, market cap $27.2k, 24h volume $679 on 2026-10-19. | H | https://api.coingecko.com/api/v3/simple/price?ids=logx-2&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true ; fixture |

Staleness: the homepage footer says 2024 and the marketing copy predates the pivot; everything used for the verdict is dated 2025-08 to 2026-10. Nothing older than 6 months is relied on for a "live" claim.

## 2. Market model

NOT FOUND (searched: logx.network, app.logx.network, DefiLlama protocol and adapter code, gh code search for the official repo, WebSearch unavailable). The official docs host `docs.logx.network` returns NXDOMAIN, and `logx.network/docs` and `/blog` return 404 (H).

What can be said:
- DefiLlama's description (also in the 2024 and 2025 funding entries, category "Prediction Market") is "DeFi Superapp. Trade exotic perps, leveraged prediction markets and memecoins." (H that DefiLlama says this; M that it described the product accurately). The old app meta tags list "binary options", "prediction markets", "pre-market", "options", "exotic perps" as keywords (H, `app.logx.network` HTML before the migration page was shown, as served 2026-10-19).
- The only on-chain structure visible is an app-chain design: DefiLlama's "chain" for LogX fees is `LogX Network`, and its TVL adapter counts tokens locked in "HypCollateral contracts on different chains" (H, adapter file). The `HypCollateral` name matches Hyperlane warp-route collateral contracts (M, naming inference), meaning user funds were locked on 19 source chains and mirrored on LogX's own chain, where an order book matched trades (M).
- Whether outcome shares were tokenised, or whether prediction products were just leveraged price-event derivatives on a CLOB, is NOT FOUND.

## 3. Chains and collateral

- Source chains with collateral vaults (H, `projects/logx-v2/index.js`, 2025-04 revision): Base, Arbitrum, Mantle, Mode, BOB, Sei, Scroll, Kroma, Taiko, Optimism, Linea, Rari, Mint, Polygon, Abstract, ApeChain, Sonic, Manta, Blast. The trading chain is the LogX app-chain (M). LogX V1 vaults were on Linea, Mantle, Kroma, Manta, Telos, Fuse, Mode, zkLink Nova (H).
- Collateral held today (all dust): USDC $32.6, USDT0 $1.75, USDT $1.74, USDC.e $4.5, sDAI $0.28, wUSDM $0.20 (H, V2, 2026-10-18). Parent adds $1.2k of USDC on Telos (V1 vault, H).
- LOGX token: Arbitrum `0x59062301Fb510F4ea2417B67404CB16D31E604BA` (H, DefiLlama). Staking contract on Arbitrum `0x89E86f7d2398e8C1070d321D18c1Ce75aBF09b75` (H, adapter). Both are public contract addresses from the third-party adapter, listed for identification only; I did not interact with them.

## 4. Read API

- **exists: none (decommissioned).** No official public docs, no OpenAPI, no SDK repo found (NOT FOUND, searched: logx.network, DefiLlama metadata `github: null`, gh repository search for "logx network" which returned only unrelated repos).
- One historical backend host is known from DefiLlama's dead adapter: `https://mainnetapiserver.logx.network/api/v1/stats/charts/dailyFees` (returned `aggregatedFees.date[]` and `aggregatedFees.trading_fee[]`, 1e18-scaled strings) (H that the adapter used it). On 2026-10-19 that host returns **NXDOMAIN** (dig and curl exit 6), as do `docs.logx.network` and `api.logx.network` (H). No response fixture is possible.
- WebSocket: NOT FOUND.
- DefiLlama derivatives-volume endpoint for LogX returned HTTP 402 ("Upgrade to the paid API plan"); recorded and stopped, nothing paid.

## 5. Trade path

None. No orders can be placed: the app shows only a migration notice and the API host does not resolve (H). The old signing scheme is NOT FOUND.

## 6. PayBox reachability

**no.** There is nothing to propose: no live contract interface to transact with, no signed-order API. The old vault contracts on the 19 chains hold ~$41 in total, and I found no documentation of a withdraw/redeem flow beyond "your funds are safe, contact Discord" (H). Not a PayBox use case.

## 7. Fees

NOT FOUND (searched: logx.network, app notice, DefiLlama methodology). DefiLlama's generic methodology: fees paid by users, revenue split between treasury and token holders, supply-side revenue to LPs (H, `childProtocols[].methodology`; no formula). Historical total fees on DefiLlama: $916,059 all-time, $0 in the last year (H); roughly $0.14M-0.26M a month from Feb to Jul 2025 (H, fixture).

## 8. Resolution mechanism and dispute risk

NOT FOUND. No docs. Treat as not applicable: no markets are open. Counterparty risk today is the operator's relaunch plan and its "funds are safe" claim, which I cannot verify (L).

## 9. Geo, ToS, automation

NOT FOUND (no ToS link on the homepage or migration page; no docs). The notice describes the relaunch as a "compliant primitive" "institutional-grade offering", which suggests KYC/institutional gating for whatever comes next (M, inference from wording).

## 10. Liquidity

| Metric | Value | Date | Tag | Source |
|---|---|---|---|---|
| LogX V2 TVL | $41 | 2026-10-18 | H | https://api.llama.fi/protocol/logx-v2 |
| LogX parent TVL (V1 + V2) | $1,282 | 2026-10-18 | H | https://api.llama.fi/protocol/logx |
| V2 TVL peak | $1,004,687 | 2025-06-25 | H | same |
| Parent TVL peak (V1 era) | $15,687,728 | 2024-02-28 | H | same |
| V2 TVL at the migration post / at adapter deadFrom | $691k / $635k | 2025-08-24 / 2025-09-10 | H | same |
| V2 TVL month-end Aug -> Sep 2025 | $657k -> $197 | 2025 | H | same (funds withdrawn in September 2025) |
| Fees, last 12 months | $0 | 2026-10-19 | H | https://api.llama.fi/summary/fees/logx |
| Fees all-time | $916,059 | 2026-10-19 | H | same |
| LOGX 24h token volume / market cap | $679 / $27.2k | 2026-10-19 | H | CoinGecko `logx-2` |
| Funding raised | Seed $6.1M (2024-02-12, incl. Coinbase Ventures, Sequoia, Hashed) + strategic $4M (2024-09-16, incl. Cumberland DRW, Gate.io) | 2024 | M (DefiLlama raises list; site says $10.1M) | https://api.llama.fi/protocol/logx |

No open interest, no prediction-market volume series found (NOT FOUND, searched: DefiLlama; derivatives volume endpoint is paywalled).

## 11. Event coverage and arbitrage overlap

None. No live event markets. Historic categories are NOT FOUND (the "prediction market" label in DefiLlama is the only hint; the "trump" keyword on the old app page suggests US-election markets in 2024, L).

## 12. Shared liquidity

None found. It was a self-contained app-chain order book (M); no evidence that it routed to or from another prediction venue. Moot while it is dead.

## 13. Adapter plan

- **Do not build.** Optionally add `logx` to a "dead/watch" list in the venue registry with a weekly check of two cheap signals: (1) `GET https://api.llama.fi/protocol/logx-v2` TVL (reopen if it exceeds, say, $100k), (2) whether `https://app.logx.network/` still serves the migration notice.
- If it ever relaunches as a prediction venue, start by looking for new docs and API hosts, since all old ones are gone.

## 14. Suspicious content

None found in the pages read. The JS chunk and HTML contained no text addressed to AI agents.

## Sources

- https://logx.network/ (H, homepage text, read 2026-10-19)
- https://app.logx.network/ and https://app.logx.network/_next/static/chunks/pages/index-87688b716b978507.js (H, migration notice)
- https://api.llama.fi/protocol/logx-v2 and https://api.llama.fi/protocol/logx (H, TVL, chains, raises, hallmarks)
- https://api.llama.fi/summary/fees/logx?dataType=dailyFees (H, fee history; `/summary/derivatives/logx` returned HTTP 402)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/logx-v2/index.js and `.../projects/logx/index.js` (H, vault addresses, methodology, v1 deprecated hallmark)
- https://github.com/DefiLlama/dimension-adapters/blob/1e8620166b5772c02e5e68e9dcd2cbb818724d69/dead/fees/logx/index.ts (H, `deadFrom: 2025-09-10`, historical API URL)
- https://api.coingecko.com/api/v3/simple/price?ids=logx-2 (H, token price/volume/market cap)
- DNS lookups with `dig` on 2026-10-19: `mainnetapiserver.logx.network`, `docs.logx.network`, `api.logx.network` NXDOMAIN; `logx.network`, `app.logx.network` resolve (H)
- https://x.com/LogX_trade/status/1959567164396146815 (not readable: HTTP 402; date derived from id)
- Not available: WebSearch (session budget exhausted), Wayback/archives (not used by rule).

## Fixtures

- `docs/research/fixtures/logx/defillama_protocol_logx-v2_trimmed_2026-10-19.json`
- `docs/research/fixtures/logx/defillama_protocol_logx-parent_trimmed_2026-10-19.json`
- `docs/research/fixtures/logx/defillama_fees_logx_trimmed_2026-10-19.json`
- `docs/research/fixtures/logx/defillama_dead_fee_adapter_facts_2026-10-19.json`
- `docs/research/fixtures/logx/app_logx_network_migration_notice_2026-10-19.json`
- `docs/research/fixtures/logx/coingecko_simple_price_logx-2_2026-10-19.json`
