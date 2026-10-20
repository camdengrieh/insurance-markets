# EVplusAI Predictions (pm.evplus.ai) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`, `gh api` file reads, page/bundle reads, web search. No account, sign-up, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages, repos and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/evplusai-predictions/` (7 files, all <= 23 KB).

## 0. Verdict

- **Kind:** hosted trading-bot SaaS, not a market venue. EVPLUS runs one dedicated AWS server per user bot; the bot trades **Polymarket.com's CLOB** (and, for "Outcome.xyz" bots, Hyperliquid Outcome markets) from the user's own wallet using a trade-only session key / agent key. Users pay a credit subscription plus a Polymarket builder fee. It has **no markets, no order book, no oracle and no market-data API of its own**. (H: its Terms of Service and FAQ, shipped in the site bundle.)
- **Live?** Yes, but small and shrinking. Site up 2026-10-19; Terms "Last Updated: 2 October 2026"; Polymarket's builder leaderboard shows EVplusAI trading through 2026-10-18 (about $115k that day, 5 active users); DefiLlama builder-fee revenue fell from $16.3k in May to about $132 for 2026-10-01..18 after the builder fee was cut from about 10 bps to about 1 bp (H data, M interpretation).
- **Liquidity is 100% Polymarket (plus Hyperliquid Outcome for the Outcome.xyz bots).** It is **not an independent arbitrage leg** and adds nothing a Polymarket adapter does not already see.
- **No public API.** The only backend is a private, Clerk-authenticated, per-profile web API (`api-web.evplus.ai`). No docs, no keys, no websocket of its own.
- **adapter_priority: skip.** The one reusable thing is generic and belongs in the Polymarket adapter: builder-code-attributed trade flow from `clob.polymarket.com/builder/trades` (works for any builder, including this one). For EVplus it is flow from about 5 accounts, near-zero signal.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `https://pm.evplus.ai/` returns HTTP 200, a Vite/React SPA titled "EVPLUS \| Situation Room" (2026-10-19) | H | GET https://pm.evplus.ai/ |
| Terms of Service text in the SPA bundle: "Last Updated: 2 October 2026"; it describes "EVPLUS, the hosted trading-bot service at pm.evplus.ai" | H | https://pm.evplus.ai/assets/main-CpV1l_20.js |
| Backend root `https://api-web.evplus.ai/` answers "EVPOLY Platform backend is running."; response header `x-evpoly-product-mode: polymarket`; `GET /v1/meta` returned 200 (body not read) | H | GET api-web.evplus.ai |
| Polymarket builder leaderboard row for builder "EVplusAI", verified=true, builder code `0xb8d6bf0c...d415`: 2026-10-18 volume 114,612.91, 5 active users, daily rank 35 of 201 builders; rows exist continuously from 2026-02-26 | H | https://data-api.polymarket.com/v1/builders/volume (filtered fixture) |
| Live attributed trades: 300 trades between 2026-10-18T20:15Z and 2026-10-19T00:42Z | H | https://clob.polymarket.com/builder/trades?builder_code=... (fixture) |
| DefiLlama id 7855 "EVplusAI Predictions", category Interface, tag "Polymarket Builder", chain Polygon, description "Polymarket Bot.", parent `evplusai` (siblings: EVplusAI, EVplusAI Perps, EVplusAI Spot) | H | https://api.llama.fi/protocol/evplusai-predictions |
| Parent brand has moved most of its marketing to a Robinhood Chain terminal, EVP token (launched 2026-08-31) and Uniswap v4 pools; evplus.ai and docs.evplus.ai do not mention prediction markets at all | H | https://www.evplus.ai/ , https://docs.evplus.ai/ , https://www.evplus.ai/tokenomics |

Trend (H data, M reading): DefiLlama builder fees by month: Apr (from 04-28) $503, May $16,291 (peak day 2026-05-06 $853), Jun $10,252, Jul $8,108, Aug $5,655, Sep $2,412, Oct 1-18 $132. Effective rate (fees / DefiLlama USD volume) was about 10 bps through 2026-09-19, stepped down over 09-20..09-30 and has been about 1 bp since 2026-10-01. That coincides with the 2026-10-02 Terms, which price the service as $99 per bot per 30 days in credits. Reading: monetisation moved from builder fee to subscription. Volume itself is flat-to-down (Polymarket-reported 30d about $2.46M; peak day 2026-05-28 about $884k).

## 2. Market model

- **No native markets.** Every instrument is a Polymarket market (binary YES/NO or Up/Down outcome tokens on Polymarket's CTF/CLOB; trade rows carry `market` = condition id, `assetId` = token id, `outcome`, `outcomeIndex`). The Outcome.xyz bots trade Hyperliquid Outcome markets (see `docs/research/venues/hyperliquid-outcomes-hip-4.md`). Tokenisation, order book and pricing are therefore Polymarket's and Hyperliquid's; see the Polymarket venue note.
- **What the bots trade** (H, strings in `BotSettings` chunk, EVPLUS's own descriptions, not independently verified): Polymarket 5-minute and 15-minute crypto Up/Down markets ("EVP"), pre-start "Value Buy", endgame sweeps inside a "60-second TWAP settlement" window ("Edge99", "Endgame99", "Sub Cents": "you still risk 99.9 cents to gain 0.1 cents"), longer-dated crypto price markets ("EVSnipe"), "Confirmed Hit" (trades "only when Binance confirms a hit"), "No Hit"/"Price Range + Above/Below" (buy No at 90c-95c+). Outcome.xyz: BTC 15-minute markets, optionally ETH and HYPE.
- Observed flow (H, 300-trade page 2026-10-18T20:15Z..2026-10-19T00:42Z): $20,438 notional, 47 distinct markets, **5 distinct owners**, 283 BUY / 17 SELL, 190 taker / 110 maker, outcomes Up 76 / Down 101 / Yes 20 / No 103, 80% of trades at price >= 0.95. This is a handful of whale-sized endgame sweepers.

## 3. Chains and collateral

- Polygon (Polymarket). DefiLlama `chains:["Polygon"]` (H). Collateral is **pUSD** in a Polymarket "Deposit Wallet" (FAQ: "Deposits convert to pUSD automatically") (H, FAQ). Deposits accepted from EVM networks, Solana, Bitcoin and Tron via Polymarket's bridge (H, FAQ). Outcome.xyz bots trade from the user's own Hyperliquid account in USDC (H, FAQ).
- EVPLUS holds no trading funds ("We do not hold your trading funds", ToS s5). It has no contract of its own on the prediction side, no token for it, no audit (DefiLlama `audits: "0"`, `github: null`). Credits are bought with crypto through Relay (third-party) at 10 credits per $1 and are non-refundable (H, ToS s3). DefiLlama TVL: none (Interface row, `tvl` empty).
- Legacy v1 bots could hand EVPLUS the wallet **owner key** (stored AES-256-GCM under AWS KMS); v2 does not (H, ToS s4, s16). Custody risk exists for v1 users only.

## 4. Read API

- **Official public read API: NOT FOUND.** `exists` = none. Searched: pm.evplus.ai main bundle and 20 app chunks (the lazy-loaded pages), `docs.evplus.ai` (documents only the Robinhood Chain terminal/Telegram product), `evplus.ai`, `terminal.evplus.ai`, GitHub repo search (`evplus`, `evpoly`), DefiLlama `github` field (null).
- **What exists is a private product API**: `https://api-web.evplus.ai`, `/v1/...`, Clerk email-OTP session. Paths seen in the bundle (H, not called): `/v1/auth/{clerk/login,geo,me,logout}`, `/v1/meta`, `/v1/profiles`, `/v1/profiles/{id}/v2/{bots,dashboard,limits,settings,onboarding,strategy-performance,polymarket/{balance,deposit-addresses,withdrawals,session-key/revoke},hyperliquid/agent/*}`, `/v1/profiles/{id}/home/{overview,positions,open-orders,activity,public-summary}`, `/v1/account/{credits,points,referral}`. All are account/profile-scoped bot management; none returns market data. I did not call any of them beyond the unauthenticated root and `/v1/meta` header check, and did not probe `public-summary` or `strategy-performance` (profile ids unknown).
- No documented rate limits, no websocket of its own (the bundle references only `wss://api.hyperliquid.xyz/ws` for Outcome.xyz).
- **Usable public data about EVplus (all Polymarket/DefiLlama, not EVplus):**
  1. `GET https://clob.polymarket.com/builder/trades?builder_code=0xb8d6bf0c9ec3c806c30fcb0e8da931f2940a5141cf420394c4b1d82ae7c6d415[&market=&asset_id=&before=&after=&next_cursor=]`. Unauthenticated 200 observed 2026-10-19 (300 rows, 272 KB per page); Polymarket's OpenAPI sets `security: []` for it. Fields: `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market, assetId, side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`; envelope `{data, limit, count, next_cursor}`, `next_cursor` is base64 offset, `LTE=` = end. Rate limits not documented. **Privacy note:** rows expose third-party wallet addresses (`maker`) and ids (`owner`); the stored fixture redacts them, and an adapter should hash or drop them.
  2. `GET https://data-api.polymarket.com/v1/builders/volume` (17 MB, all builders, daily; fields `dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank`). DefiLlama's helper says **v1 is retired 2026-10-24**; v2 `.../v2/builders/volume?interval=day&limit=N` (snake_case, `{data:[...]}`, max 90 daily buckets, 186 KB for 3 days) was confirmed live (H).
  3. DefiLlama: `https://api.llama.fi/protocol/evplusai-predictions`, `/summary/dexs/evplusai-predictions`, `/summary/fees/evplusai-predictions` (daily volume and builder fees; no per-trade data).

## 5. Trade path

- **Programmatic trading through EVplus: none.** Onboarding is Clerk email OTP after an IP geo check (a Cloudflare challenge host is also pre-warmed), connect a browser wallet (Rabby/MetaMask), sign the Polymarket Deposit Wallet / session-key authorization in the browser, buy credits via Relay, create a bot group in the UI, start it. Bots then trade by themselves from an AWS server (Dublin for Polymarket bots, Tokyo for Outcome.xyz). (H, FAQ and ToS s1, s4.) There is no order-placement endpoint a third party can call and no API key scheme.
- **Signing scheme inside:** the owner wallet signs in-browser; EVPLUS creates a Polymarket **session key** (CLOB-only, cannot withdraw, max 180 days, revocable) or a Hyperliquid **agent key** (trade-only, max 180 days). Orders carry the EVPLUS **builder code** (a `bytes32` in the signed order, V2 CLOB). (H, ToS s4, s6; Polymarket docs.)
- **Open-source twin:** `Degenapetrader/EVPOLY` is the Rust engine behind the same brand (created 2026-03-16, last push 2026-09-18, PolyForm Noncommercial, "manual execution API" bound to localhost with a bearer token). It is a self-hosted bot, not a public endpoint. Its README states 0.1% builder fee on taker and maker fills (H), which looks like the older hosted rate (about 10 bps through 2026-09-19), not the current 1 bp (M). I did not read its source or docs beyond the README.
- To trade the same liquidity from an agent, use Polymarket directly (separate adapter). Do not attach EVPLUS's builder code.

## 6. PayBox reachability

- **EVplus as a venue: no.** There is nothing to call: no public API, login requires an email OTP plus geo check and in-browser wallet signing, credits are bought through a Relay checkout, and bots are managed through a private UI. A PayBox EVM wallet on Polygon can trade **Polymarket** (covered by the Polymarket note) but that is the underlying venue, not EVplus. Transaction proposals or signed orders against EVplus itself do not exist.

## 7. Fees

| Fee | Value | Who pays | Tag | Source |
|---|---|---|---|---|
| EVPLUS subscription | 1.375 credits/hour per running bot, 10 credits per $1, billed per second while running: $0.1375/h, about $3.30/day, **$99 per bot per 30 days**; non-refundable, no expiry | user | H | ToS s3; FAQ |
| Polymarket builder fee (EVPLUS's cut) | UI says 0.01%; measured median `builderFee/sizeUsdc` = 9.97e-5 on 300 trades (about 1 bp); DefiLlama series shows about 10 bps until 2026-09-19. ToS: "The fee rate can change." | trader, on top of Polymarket fees | H | `V2StrategyPerformance` chunk; fixture; ToS s6 |
| Polymarket builder-fee caps | taker <= 100 bps, maker <= 50 bps, 1 bp steps, one change per 7 days, effective 3 days later; additive to platform fees | trader | H | https://docs.polymarket.com/programs/builders/fees.md |
| Polymarket platform taker fee / rebate | shown in EVPLUS' P&L view ("Polymarket taker fees", "Rebates"); formula belongs to the Polymarket note | trader | H (existence) | `V2StrategyPerformance` chunk |
| Outcome.xyz (Hyperliquid) builder fee | max 0% approved by the user | - | H | ToS s4, s6 |
| Relay (credit purchase), Polymarket bridge (deposit/withdrawal) | third-party, not stated | user | NOT FOUND | - |

## 8. Resolution and dispute risk

- EVplus does not resolve anything. Resolution, disputes and payouts are Polymarket's (or Hyperliquid's for Outcome.xyz). Cross-venue rule matching must use the Polymarket market's own rules text. EVPLUS's strategy blurbs mention a "60-second TWAP settlement" and Binance-confirmed hits for the 5/15-minute crypto markets (H, EVPLUS wording, M as to how those markets actually settle): verify against Polymarket's market description before using it in a parity check.
- Counterparty risk specific to EVplus: its bot servers can fail or stop and "leave orders and positions open" (ToS s9); a session key stays valid until expiry or revocation; Hyperliquid agent revocation inside EVPLUS does not remove the approval on Hyperliquid (ToS s4).

## 9. Geo, ToS and automation

- Terms are published (https://pm.evplus.ai/terms, rendered client-side). Geo: "You may not access or use the Service from a restricted jurisdiction"; VPN/proxy/relay use is prohibited; IP geo check before the sign-in code is sent; "we may block, suspend, or terminate access" (H, ToS s13). The restricted country/region list is loaded dynamically, NOT FOUND in static text. Polymarket's own restrictions apply on top.
- Automation: the whole service is automation, but only through its own bots. Nothing permits a third party to script the EVPLUS API; there is no API ToS. "We reserve the right to discontinue, modify, or suspend the Service at any time, for any reason, without notice" (s15). Governing law: none specified (s17). Not financial advice, "as is" (s8, s11).

## 10. Liquidity

- **Not a pool and not an order book.** TVL is not applicable (no custody). Traded volume routed by EVplus: Polymarket-reported builder volume 2026-10-18 $114.6k; 7d $459k; 30d $2.46M; last 90 daily buckets $13.7M; cumulative since 2026-02-26 $59.2M; 30-day average 6.5 active users per day (max 11); daily builder rank 25-48 of about 200 (H, v1 builders volume fixture, fetched 2026-10-19). This is about 0.35% of all-builder volume over 30 days (H, my arithmetic). DefiLlama's USD figures (24h $94,490 for 2026-10-17; 7d $331,300; 30d $2.26M; "all-time" $15.85M) cover a window that only starts 2026-07-05 (105 points), so the "all-time" label is a 105-day sum (H data, M reason: Polymarket data API serves 90 daily buckets).
- Whale concentration: 5 owners in the sampled 4.5 hours.

## 11. Event categories and overlap

- Crypto price only: Polymarket 5/15-minute BTC/ETH/SOL/XRP/DOGE/BNB/HYPE Up/Down markets, longer-dated crypto hit/range markets, plus Hyperliquid Outcome BTC/ETH/HYPE 15-minute markets (H list from the bot descriptions; the live sample shows Up/Down and Yes/No outcomes across 47 markets). No sports, politics or macro.
- Overlap with other venues is therefore only the crypto-price class (Kalshi crypto ranges, Limitless, Hyperliquid HIP-4). Any arbitrage there is between **Polymarket and those venues**, not involving EVplus as a separate leg.

## 12. Shared liquidity

- Shares 100% of its Polymarket liquidity with **Polymarket** (orders go to Polymarket's CLOB and settle on Polymarket's exchange contracts; builder code is only attribution). Outcome.xyz bots share liquidity with **Hyperliquid Outcome markets**. It is a pure overlay, so it must not be modelled as an independent venue in the aggregator.

## 13. Adapter priority

**skip.** No markets of its own, no API, duplicate liquidity, shrinking, 5-account flow. If the aggregator later wants "who is trading" signal, implement builder-code attribution once in the Polymarket adapter (all builders, not EVplus-specific), store only hashed `owner`/`maker`, and keep it P2.

## 14. NOT FOUND

- Official API docs or any public market-data endpoint on pm.evplus.ai / api-web.evplus.ai (searched: site bundle, docs.evplus.ai, evplus.ai, terminal.evplus.ai, GitHub search, DefiLlama github field).
- Restricted jurisdictions list (dynamic; not in static text).
- Audit reports, security contact, on-chain contracts of its own (none expected; DefiLlama `audits: 0`).
- The project's X account (x.com/EVplusAI) was not fetched, so no announcements or incident history were read. A later web search was refused because the session's search budget was exhausted, so independent press or incident checks are limited to one extended search that returned only project-authored pages and directory listings. No independent verification of performance claims; a directory listing says early results are "mixed" (M).
- Source or docs of `Degenapetrader/EVPOLY` beyond the README (not needed).

## Sources

- https://pm.evplus.ai/ and bundle chunks under https://pm.evplus.ai/assets/ (`main-CpV1l_20.js` Terms/Privacy/Restricted, `Help-AvEIVEi_.js` FAQ and credits, `BotSettings-B6T5EoB-.js` strategy descriptions, `web-platform-api-DlriBNpQ.js` API paths, `V2StrategyPerformance-DwVcoQnI.js` fee line items, `official-links-CPGHmDFS.js`) - H, fetched 2026-10-19.
- https://api-web.evplus.ai/ and `/v1/meta` (headers) - H.
- https://docs.evplus.ai/ , https://www.evplus.ai/ , https://www.evplus.ai/tokenomics - H (parent brand, Robinhood Chain terminal; no prediction-market content).
- https://api.llama.fi/protocol/evplusai-predictions , `/summary/dexs/evplusai-predictions` , `/summary/fees/evplusai-predictions` - H (fixtures).
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts and `helpers/polymarket.ts` (builder code, v1 retirement 2026-10-24, volume definitions) - H via `gh api`.
- https://data-api.polymarket.com/v1/builders/volume and `/v2/builders/volume?interval=day&limit=3` - H (fixtures).
- https://clob.polymarket.com/builder/trades?builder_code=0xb8d6... - H (fixtures, redacted).
- https://docs.polymarket.com/api-reference/trade/get-builder-trades.md and https://docs.polymarket.com/programs/builders/fees.md - H (read via WebFetch).
- https://github.com/Degenapetrader/EVPOLY (README only) - H for README content; M for its relation to the hosted service (same brand and builder naming).
- https://polymart.app/evplus (directory listing: "AI trading terminal for Hyperliquid and Polymarket"; security scan, "mixed" early results) - M/L, third-party.
- https://papertrade.xyz/ (Hyperliquid synthetic perps venue that the hosted bots also support; not a prediction market) - M.
- `docs/research/14-platform-of-platforms.md` (EVplus listed among the DefiLlama "Interface" prediction front ends) - H, local.

Fixtures (`docs/research/fixtures/evplusai-predictions/`): `defillama_protocol_..._2026-10-19.json`, `defillama_summary_dexs_..._2026-10-19.json`, `defillama_summary_fees_..._2026-10-19.json`, `polymarket_data_api_builders_volume_evplusai_filtered_2026-10-19.json` (90 daily v1 rows, filtered by me), `polymarket_data_api_v2_builders_volume_evplusai_2026-10-19.json`, `polymarket_clob_builder_trades_evplus_sample_2026-10-19.json` (5 rows, `owner`/`maker` redacted by me), `polymarket_clob_builder_trades_evplus_page1_stats_2026-10-19.json` (my aggregates over the 300-row page).
