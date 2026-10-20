# Strix Lab (strixlab.io) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:35-03:50 UTC). READ-ONLY: official docs, unauthenticated GETs on documented API hosts, one public WebSocket subscribe (order book channel, no auth), npm/unpkg and Basescan page reads. No account, wallet, API key, signature, POST/PUT/DELETE, on-chain call or PayBox tool. Third-party pages and API responses were treated as untrusted data; nothing in them was followed.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/strix-lab/` (listed in section 14).

---

## 0. Bottom line

1. **Live, independent order book, but tiny and mostly the operator's own market making.** First on-chain fill 2026-06-13; trades were still settling on Base at 2026-10-19 03:05 UTC; a new BTC 5m window and 15m window market is created every 5/15 minutes. (H)
2. **Good, official, public read API** (REST + WebSocket, no key for market data, tick-exact decimal strings, `seq`-ordered books). This is the easiest part: a read adapter is cheap. (H)
3. **Liquidity is negligible.** Last 100 public fills (about 66 h, 2026-10-16 09:12 to 10-19 03:05 UTC) total **$339** notional; touch depth on most books is $1-$300; the Base `ConditionalTokens` contract holds **2,401 USDC** of collateral (about the open-interest ceiling). The venue's own Dune dashboard says most settled volume is Strix's own market making and customer-originated volume is about 10% (data to 2026-09-06). (H data, M for what it means)
4. **Not a clean arbitrage leg.** Taker fee = rate x p x (1-p) per share (rate 0.07 for crypto, 0.022 for sports); US persons barred by ToS; most markets resolve by an **operator EOA ("MANUAL")**, not an oracle, with no dispute window; the exchange/CTF contracts are **unverified** on Basescan; `lastPrice` fields are stale (use the book mid).
5. **Trading is not wallet-signed.** Orders are authenticated with HMAC API keys that can only be minted in the Strix web app after a Privy login. A PayBox EVM wallet can fund the account (plain USDC transfer on Base) but cannot place orders by signature. **paybox_reachable = partial** (funding only).
6. **adapter_priority = P2** (signal-only / thin). Cheap keyless read adapter for a price signal and cross-venue comparison on a handful of Polymarket-style questions; do not build a trade adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://api.strixlab.io/api/ok` | `{"success":true,"data":{"status":"ok"}}`; `/time` returned 1792381123 (2026-10-19 03:38:43 UTC) | H |
| Newest public fill | `settledAt 2026-10-19T03:05:04Z`, tx `0x5f00247d...` (fixture `activity_sample.json`) | H |
| Rolling markets being created | BTC 5m window `03:40-03:45 UTC` existed at 03:40; the 03:35-03:40 window settled at 03:40:08 UTC (`/markets/:id` fixture `market_one.json`) | H |
| New fixtures listed | EPL "Tottenham vs Coventry" created 2026-10-18 06:48 UTC, expiry 2026-10-19 22:00 UTC | H |
| Open events right now | 12 (`/events?status=open`); sports category: 81 events in total, 78 of them settled | H |
| SDK | `strix-sdk` 0.2.6 published 2026-09-18 on npm (MIT; GitHub repo `StrixLab-org/strix-sdk-ts` returns 404 to `gh api`, i.e. private or removed) | H (npm), H (404) |
| Terms of Use | "Last updated: July 10, 2026" | H |
| Dune dashboard | data through 2026-09-06 only (6 weeks stale at read time) | H (page), L for freshness |
| Staging | `https://api-staging.strixlab.io/api/ok` 200 (testnet is Sepolia; slug `amm-11155111-...`) | H |

Verdict: **still_live = true**, small, young (about 4 months).

---

## 2. Kind and market model

- **Kind (H):** off-chain central-limit order book (Go matching engine per Dune page) with on-chain settlement on Base; Gnosis/Polymarket-style ERC-1155 conditional tokens. Docs: "Strix Lab runs a central-limit order book. Orders match off-chain in milliseconds and settle on-chain in USDC" (dev.strixlab.io/readme).
- **Structure (H, `GET /events`):** Event > Market (one binary question) > 2 Outcomes (YES `outcomeIndex 1`, NO `outcomeIndex 0`), each carrying a `tokenId` (a large decimal string = ERC-1155 id) plus `conditionId`, `questionId`, `indexSet`, `collectionId`.
- **`marketType` values seen live (H):** `CTF` (binary), `NEG_RISK` (multi-outcome: N binary markets, at most one resolves YES), `OOV2_CTF`, `OOV2_NEG_RISK` (same shapes, UMA Optimistic Oracle V2 resolution). The SDK docs/typings say `OOV3_*`; the live API says `OOV2_*` (doc drift, H).
- **Binary only.** No scalar markets, no categorical single-token markets (categorical = NEG_RISK set of binaries). Football match events are NEG_RISK with two legs ("Tottenham" wins, "Coventry" wins in 90 min + stoppage); a draw resolves BOTH legs NO and has no leg of its own (H, rule text in `events_open_sample.json`).
- **Prices:** decimals 0.0001-0.9999; `tickSize` 0.01 or 0.001 per **event**; quantities are decimal strings, up to 6 dp; minimum order value $1.00 (H, dev docs concepts).
- **YES/NO books are mirrors:** `bid YES @ P == ask NO @ (1-P)`. Live books carry `"normalized": true`, meaning the book already folds in the complement outcome's orders; SDK 0.2.6 changelog: "don't add the complement book on top" (H, unpkg CHANGELOG). The older dev-doc page (orderbook.md) still says to subscribe to both legs and merge; follow the `normalized` flag.
- **Rolling crypto series (H):** "Bitcoin Up or Down 5M/15M" are single `eventType CRYPTO_ROLLING` events with `expiryTime 2099-01-01` that embed **every historical window as a market** (15,542 markets in the 5m event: 15,536 SETTLED + 6 OPEN; 7,068 in the 15m event). `GET /events?status=open` is therefore about **36 MB raw / 7.9 MB gzip**; any request that includes crypto (also `category=crypto`) returns the same bulk. Use `category=sports|politics|finance|culture|esports|tech` for lean pulls, or fetch single markets via `/markets/:id`.
- **User/odd markets (H):** one event `amm-8453-40b5efcfeecc71bf` (`OOV2_CTF`, no category, zero volume, "Indonesia haze by December 31, 2026") looks machine- or user-created; its creation path is NOT FOUND (docs landing says "Users can create their own markets"; the `create-a-market` doc page 404s).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Base mainnet (chain id 8453) | H (docs deposit page: "Strix Lab runs on Base"; Dune) |
| Collateral | Native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Circle, confirmed on a settlement tx), 6 decimals | H |
| StrixExchange | `0x92D1C5a9c6eA22ed321bC80400F353bE64e105E5` (Basescan: "Contract: Unverified", 32,717 txs at 2026-10-19 03:41 UTC) | H (address from Dune; status from Basescan) |
| ConditionalTokens (ERC-1155) | `0x42c4ccB89dD78b808c45C0c9Fa46f019A0F791DC` (Unverified; holds 2,401.017041 USDC at 2026-10-19 03:41 UTC; 45,271 txs) | H |
| Contract deployer | `0xa4687a65A4F679C55f68EaF6eA88cD7C48B61228` (creator of Exchange, CTF and the UMA resolver; also the UMA **proposer** in the one settled OOV2 market) | H (Basescan "Contract Creator"; resolution fixture) |
| Operator / MANUAL resolver | `0x4c15F76C43595cef074FdccE1Bbd5d40E309B2d2` (EOA, 22,420 txs, holds about $15 of ETH); appears as `resolverAddress` on nearly all markets (425 of 433 markets sampled: first 200 markets per event of `/events?status=open`) | H |
| UMA resolver contract | `0xFe28C82D003c1cB0E601801823b5FD0A053F4Fb4` (Unverified, 11 txs) | H |
| Settlement tx sender | `0x6Ca8266B9a20B04216e3Fb9D7238Ef669FBC00dD` (sample tx `0x754c5542...`, a relayer EOA; gas paid by the operator per ToS 5.2) | H (one tx) |
| Neg Risk Adapter / other | NOT FOUND (the Dune page lists "Not listed"; no neg-risk adapter address in docs) | - |

Source code, ABI and audit for StrixExchange / ConditionalTokens: **NOT FOUND** (searched: Basescan "Unverified" banner, Sourcify v2 returns no match for the Exchange address, Dune page, docs, web search "Strix Lab audit", GitHub org 404). Other chains: none (staging = Sepolia).

---

## 4. Read API (official, public, unauthenticated for market data)

- **Docs:** https://dev.strixlab.io (GitBook; every page has a `.md` twin; index at `/llms.txt`). Product docs: https://docs.strixlab.io (also `/llms.txt`). (H)
- **Base URLs (H):** REST `https://api.strixlab.io/api`; WebSocket `wss://api.strixlab.io/ws`; testnet `https://api-staging.strixlab.io/api` / `wss://api-staging.strixlab.io/ws`.
- **Envelope (H):** `{"success":true,"data":...}` or `{"success":false,"code":"...","message":"..."}`; branch on `code`.
- **Public endpoints** (no key; shapes confirmed live unless noted):

| Endpoint | Notes | Live-confirmed |
|---|---|---|
| `GET /ok`, `GET /time` | liveness, `{serverTime}` unix seconds | H |
| `GET /events?status=&category=&tag=&search=&limit=&offset=&includeTotal=` | limit 1-100 (default 20). Full event with `markets[]`, `outcomes[]`, `tickSize`, `rule` (resolution text), `expiryTime`, `volume` (event total), tags, `sportsDetail` | H |
| `GET /events/:idOrSlug` | one event (do NOT call for the BTC rolling slugs, about 26 MB) | doc only |
| `GET /events/:id/resolution` | `resolverType` (`MANUAL` or `UMA_OOV2`), `finalOutcome`, `assertionInProgress`, `oracle{state,proposedOutcome,proposer,disputer,livenessEndsAt,settled}` | H (both types) |
| `GET /markets/:id` | one market incl. `resolvedAt`, `winningOutcomeId`, `resolverAddress`, `conditionId` | H |
| `GET /orderbook/:tokenId?depth=` | `{tokenId,bids[{price,size}],asks[],normalized,seq,ts}`; depth <= 200 | H |
| `GET /midpoint/:tokenId`, `GET /price/:tokenId/:buy\|sell` | 404 on a one-sided book (doc) | H (two-sided case) |
| `GET /kline?outcomeId=&interval=m1..d1&from=&to=` | OHLCV strings, has a `synthetic` flag on filler candles | H |
| `GET /activity?limit=&offset=` | all settled fills platform-wide with `price, quantity, settledAt, txHash, matchType (STANDARD\|CROSS_OUTCOME), taker/maker side` and **trader wallet addresses + usernames** (13,514 fills total) | H |
| `GET /categories`, `GET /leaderboard` | categories live: esports, tech, culture, crypto, finance, sports, politics | H (categories) |

- **WebSocket (H, probed):** connect, receive `{"type":"connected"}`, send `{"type":"subscribe","markets":[tokenId...],"depth":N}`, receive `orderbook.snapshot` (with `seq`, `ts`, `levels.{bids,asks}`, `normalized`) then `orderbook.delta` (`size 0` removes the level; flushed about every 150 ms, coalesced), `last_trade_price`, `market.status_update`. Trades channel: `{"type":"subscribe","channel":"trades","markets":[...]}` -> `trade.executed` (taker side). Server pings every 30 s; slow consumers are dropped; re-subscribe after reconnect; SDK 0.2.6 re-requests a snapshot every 15 s as a gap guard. Private `user` channel needs HMAC.
- **Rate limits (H, dev docs):** API-key traffic: reads 500/s, order writes 300 per 10 s, bulk cancels exempt; `429` carries `Retry-After`. Limits for **unauthenticated** reads: NOT FOUND (searched: rest.md, errors-and-rate-limits.md; no `RateLimit-*` headers on `/ok` or `/events`). Be polite; prefer WS for books.
- **Auth for private endpoints (H):** headers `STRIX-API-KEY`, `STRIX-TIMESTAMP` (unix seconds, +-30 s), `STRIX-PASSPHRASE`, `STRIX-SIGNATURE = base64(HMAC-SHA256(apiSecret, timestamp + METHOD + path + body))` where `path` EXCLUDES the `/api` prefix and includes the query string. WS auth signs `timestamp + "GET" + "/ws"`.

**Adapter gotchas (all H unless noted):**
1. **`lastPrice` is stale.** Site shows "Arsenal 48%" / "Antonelli 87%" from `lastPrice`, while live books at 03:41 UTC were Arsenal 0.61/0.62 and Antonelli 0.97/0.98; Iran YES `lastPrice` 0.23 vs book 0.15/0.16 (kline confirms about 0.15 all October). Always compute from the book; require both sides and a size floor.
2. **Documented status filter is wrong.** Docs: `open|closed|resolved`. Live: `open` and `settled` (any case) work; `resolved` returns 0 items; `closed` returns **HTTP 500** with an unhandled Prisma error that echoes the server query (fixture `error_status_closed_500.json`). Use `status=settled` for history.
3. **Event `volume` is lifetime** and unit (one-sided vs two-sided) is not stated; `markets[].volume` sums to it.
4. **tokenId, not `outcome.id`**, for orders/books/WS; YES = `outcomeIndex 1` even when the display name reads reversed on NEG_RISK.
5. **One-sided/empty books are common** (BTC 5m: 03:35 window had one 1000-share bid at 0.01 and no ask).
6. **Payload size** (section 2): avoid unfiltered `/events`.
7. **Settlement lag:** fills settle on-chain about 15-20 s after the match; positions are indexed 30 s-2 min later. Book deltas are real-time off-chain.

---

## 5. Trade path

- **Programmatic placement exists, but via HMAC API keys, not wallet signatures (H).** `POST /orders` (limit; GTC/GTD/FOK/FAK), `POST /orders/market` (BUY `maxSpend`, SELL `quantity`), `POST /orders/batch` (<= 15), `DELETE /orders/:orderHash`, `POST /orders/batch-cancel` (<= 100), `DELETE /orders` (kill switch). The order body has **no signature or nonce field**; the response is an acknowledgement (`OPEN`, `filledQuantity 0`) and fills arrive about 15-20 s later over the WS user channel as `trade.settled`.
- **Key issuance (H):** "In the app: Settings -> API Keys -> Generate Keys"; keys cannot be generated from a restricted region ("Not available: Creating an account, Placing new orders, Splitting, Generating API keys"). Secret and passphrase are shown once.
- **Account/wallet model (H docs, M interpretation):** sign-in via Privy (email, Google, or an external wallet); email/Google creates a Privy **embedded wallet** that is both the trading wallet and the USDC deposit address (`GET /auth/whoami -> walletAddress`). Docs call it "self-custodial" and say Strix "cannot move your funds without your authorization". Yet on the sample settlement tx (H, Basescan) an operator relayer calls StrixExchange, which pulls USDC straight from **both** the maker and taker wallets and mints the ERC-1155 shares in the same tx, with no end-user signature in the API flow. So the exchange contract (and whoever can drive it) holds standing spending authority over user wallets (M). How the per-order authorisation is produced (Privy delegated signing vs contract-level operator authority) is NOT FOUND (searched: all dev and product doc pages, SDK typings, ToS custody clauses; contract unverified).
- **On-chain ops via API:** `POST /positions/split|merge|redeem` return a `txHash` (the platform submits them); `GET /positions/claimable`. Withdrawals are "website-only" (Telegram bot key cannot withdraw); no withdrawal endpoint is documented. Direct user-signed calls to the CTF/Exchange are not documented and the ABI is unpublished.
- **Other front ends (H):** Telegram bot `@strixlab_Ai_bot` (mints its own labelled API key), TypeScript SDK `strix-sdk` (MIT, dependency `ws` only).

## 6. Can a PayBox EVM wallet trade it?

**paybox_reachable = partial (funding only).**
- **Funding: yes (M).** Deposit = send native USDC on Base to the Strix account's wallet address; that is a plain ERC-20 transfer a PayBox EVM wallet can propose on Base (Base is in PayBox's catalog per the project's own platform notes). It still requires a Strix account to exist first (browser Privy login), a non-restricted region, and a real deposit address from `whoami`. Wrong chain or token = permanent loss (docs).
- **Signed orders: no.** No EIP-712/EIP-1271 order is accepted by the public API, so `request_wallet_sign` `typedData` has nothing to sign. External-wallet login ("Strix Lab uses that wallet directly") is browser-based; whether an API-key order can then spend that external wallet (approvals, delegation) is NOT FOUND.
- **Transaction proposals: not for trading.** The only user-facing on-chain primitives (split/merge/redeem, withdraw) are executed by Strix; no documented calldata for a PayBox proposal.
- **What a PayBox plugin could do (M):** hold the three HMAC credentials as a secret and sign REST calls inside the plugin (HMAC is plain SHA-256, easy in plugin code); PayBox cannot mint the keys, and keeping a live trading secret in a plugin is a larger trust surface than a wallet signature. Not recommended for a thin venue.

---

## 7. Fees (H, https://docs.strixlab.io/trading/fees)

- **Makers pay nothing.** Takers pay `fee = shares x feeRate x price x (1 - price)` (USDC); symmetric around 50c; below 0.00001 USDC no fee.
- Rates: Sports 0.022; Finance, Politics, Tech 0.032; Economics, Culture 0.038; Other/Default 0.040; Weather 0.045; **Crypto 0.070**; Geopolitics 0.000. Worked example (100 shares at 50c): Sports $0.55, Politics $0.80, Crypto $1.75 (3.5% of the $50 spent).
- Who pays/how: on a **sell** the fee comes out of USDC proceeds; on a **buy** it is taken as an equal value of **shares** (you receive slightly fewer shares). Gas is paid by the operator (ToS 5.2, "currently").
- The live `/categories` list has no "geopolitics" slug; the Iran/Taiwan markets are `category: politics` (rate 0.032 if the table is applied by API category). Whether any live market is fee-free: NOT FOUND.
- Withdrawal and deposit fees: NOT FOUND (none documented; Base gas only).
- Liquidity rewards (weekly, per market, "not fixed or guaranteed") and Strix Points exist (H docs), which is one more reason resting-order depth may be incentive-driven.

## 8. Resolution mechanism and dispute risk

Three paths observed in live data (H):
1. **MANUAL (dominant).** `resolverType: "MANUAL"`, `resolverAddress` = operator EOA `0x4c15F7...2d2` (Strix). All sampled sports fixtures and all BTC windows settle this way (BTC window `03:35-03:40` had `resolvedAt 03:40:08`). No proposal, liveness window, bond or dispute path. Resolution text is per-market `rule`; docs: "the authoritative source its settlement is based on"; ToS 7.3 "final and binding"; 7.5 lets Strix correct "manifest errors", re-propose or void; 7.4 voided binary shares redeem at US$0.50.
2. **UMA_OOV2.** For `OOV2_*` markets: resolver contract `0xFe28...3f4`, `oracle.state/proposedOutcome/livenessEndsAt/disputer`; the one settled example had proposer `0xa4687a65...1228` (the deployer, i.e. Strix itself) and no disputer. ToS 7.2 names "UMA's Optimistic Oracle" as the **default**, but the live data shows manual settlement for the large majority; treat the ToS as aspirational (M).
3. **BTC rolling series:** settles on a **proprietary "Strix BTC Index 30-second TWAP"** (average of Chainlink, Coinbase and Kraken BTC/USD "with safeguards"), UP if close >= open reading. "Exchange spot quotes, other oracles and any figure drawn on the chart are indicative only." Basis risk against Polymarket/Limitless Chainlink-only windows.

Dispute/venue risk summary (M): resolver and market maker are the same entity; contracts unverified, no audit found; funds are an ERC-1155 position in a contract you cannot audit.

## 9. Geo, ToS, automation

- **Operator:** Strix Lab Inc., British Virgin Islands; BVI law; SIAC arbitration in Singapore (ToS preamble, 22.1-22.4). (H)
- **Restricted regions (H, docs/policies/restricted-regions + ToS 2.2-2.3):** new accounts/orders/split/API keys blocked from US, GB, FR, BE, PL, TH, SG, TW, AE and sanctioned IR, CU, KP, SY; enforced server-side by IP ("`geo_restricted`"); VPN use is a ToS breach. Cancel, merge, redeem, withdraw stay open. "The Platform is not offered to, and may not be accessed or used by, any U.S. Person."
- **Automation (H, ToS 9.1-9.3):** "Automated and algorithmic trading is permitted subject to these Terms"; Strix may rate-limit, require API keys, suspend access; **wash trading, spoofing, layering and coordinated manipulation prohibited (10.1)**; Strix and affiliates may provide liquidity, and separate market-maker agreements can override the Terms.
- Public read of market data has no stated restriction (NOT FOUND for a data-use clause).
- US-based operators of this project cannot lawfully be a trading counterparty; a read-only adapter is fine.

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Lifetime volume, 12 currently-open events | $103.7K (BTC 5m $63.8K + BTC 15m $20.5K = 81%; EPL champion $7.9K; LoL Worlds $7.8K; Iran $1.6K; F1 $1.2K; rest < $400) | `/events?status=open`, 2026-10-19 | H (unit unclear) |
| Lifetime on-chain, notional to 2026-09-06 | $74.3K one-sided / $148.7K two-sided; 5,297 matches; 100 unique addresses; 9,679 settlement txs; taker fees $284 | Dune "Strix Lab - Prediction Market on Base" (owner `ctlim`) | M (third-party dashboard, 6 weeks stale) |
| Monthly (Dune) | Jun $350; Jul $23.6K; Aug $33.3K; Sep (6 days) $17.1K, peak day 2026-09-01 $11.6K | Dune | M |
| Customer vs operator | "Most settled volume on this venue is Strix's own market making"; customer-originated about 10%; top 5 addresses 86% of notional | Dune caveat text | M |
| Open interest | $937.75 on 2026-09-06 (peak $2,041 on 2026-08-06) | Dune | M |
| Collateral held by CTF contract | 2,401.02 USDC on 2026-10-19 03:41 UTC | Basescan address page | H |
| Recent fills | last 100 fills (2026-10-16 09:12 to 10-19 03:05 UTC): $339 notional, 79 in BTC 5m/15m, 30 distinct wallets, 94 `CROSS_OUTCOME` + 6 `STANDARD`; all-time fills in feed 13,514 | `/activity` | H |
| Sports decay | 10 EPL matches 2026-09-18..20: $8,034 total ($286-$1,877 each); 9 matches 10-10/11: $20; 9 matches 10-17/18: $112 | `/events?category=sports` (30 most recent), 2026-10-19 | H |

Touch depth at 2026-10-19 ~03:41 UTC (YES token, depth=50; "USD" = sum of price x size over all levels returned, which is 4-5 levels per side from a ladder-style quoter; fixture `books_snapshot_2026-10-19.json`):

| Market | Bid / Ask | Bid USD / Ask USD |
|---|---|---|
| EPL 2027 champion: Arsenal | 0.61 / 0.62 | 304 / 213 |
| EPL 2027 champion: Man City | 0.19 / 0.20 | 111 / 55 |
| LoL Worlds: LCK | 0.68 / 0.69 | 170 / 299 |
| LoL Worlds: LPL | 0.23 / 0.24 | 137 / 74 |
| F1 champion: Antonelli | 0.97 / 0.98 | 145 / 2,598 |
| Highest-grossing 2026 film: Spider-Man | 0.95 / 0.96 | 98 / 2,315 |
| EPL Tottenham v Coventry: Tottenham / Coventry | 0.64/0.65 and 0.15/0.16 | 92/187 and 94/20 |
| US invades Iran before 2027 | 0.15 / 0.16 | 37 / 8 |
| China invades Taiwan by end-2026 | 0.02 / 0.03 | 38 / 2.5 |
| Crude oil ATH by Dec 31 | 0.10 / 0.11 | 39 / 8 |
| Anwar out as PM by Dec 31, 2026 | 0.04 / 0.08 | 22 / 14 |
| BTC 5m next window (03:40) | 0.42 / 0.48 | 11 / 14 |
| BTC 15m (03:45) | 0.48 / 0.53 | 12 / 15 |

Interpretation (M): symmetric, geometric-looking ladders (size grows away from the touch; mirrored YES/NO) are consistent with the operator's own quoting bot. Edge from a displayed price needs size awareness: a "0.15/0.16" with 8 shares at the ask is $1.28.

## 11. Event categories and cross-venue overlap (arbitrage relevance)

- **Sports (H):** English Premier League match results (home/away win in 90 min plus stoppage; sourced from api-sports fixture ids in the slug), EPL 2027 champion, F1 drivers' champion, LoL Worlds 2026 winning region (esports). Overlaps Polymarket/Kalshi/Limitless sports. Match markets have no draw leg; map "X wins" legs to other venues' "X to win" markets and treat the draw as the remainder.
- **Politics/geopolitics (H):** US invading Iran before 2027; China invading Taiwan by end of 2026; Anwar Ibrahim out as PM. The rule text for the Iran and Anwar markets reads like Polymarket's resolution wording (M, wording match from memory of that style, not verified against the live Polymarket pages).
- **Crypto price (H):** BTC up/down 5m and 15m rolling windows; overlap with Polymarket/Limitless rolling BTC windows, but on the Strix BTC Index TWAP-30s (see section 8) and with a 3.5% crypto taker fee at 50c. Not a clean arb leg.
- **Finance/macro (H):** "Crude Oil all time high by...?" (only finance event). **Culture:** highest-grossing movie of 2026.
- **Count:** 12 open events (about 30 open non-BTC markets plus about 10 open BTC rolling windows; counted from the first 200 markets per event). The site shows 11; Dune counted 67 distinct events listed on the site by 2026-09-06 (including settled).
- There is no macro (CPI, rates) coverage today, despite docs advertising it.

## 12. Shared liquidity

Own off-chain CLOB, own contracts, own collateral pool: **not** pooled with another venue (H). BUT the operator's market making dominates the book (Dune: about 90% of volume), so these prices are a market-maker quote, not an independent crowd price, and the quoter may reference other venues' prices (NOT FOUND whether it does; do not assume Strix is a leading indicator). Treat as an additional noisy leg/signal, not a price-discovery venue.

## 13. Adapter spec (if built, read-only P2)

- **Discovery:** `GET /events?status=open&category=<non-crypto slug>&limit=100&includeTotal=false` per category; for BTC rolling, call `/events?...&category=crypto` once at low frequency only if you accept about 8 MB gzip, otherwise discover windows via the WS/`/activity` or generate the next window ids from `/markets/:id` neighbours (open question). Persist `{eventSlug, marketId, yesTokenId, noTokenId, tickSize, expiryTime, marketType, rule, resolverType}`.
- **Prices:** WS `subscribe` (depth 20-50) to YES tokens; apply `seq`-ordered snapshot/delta; resync every 15 s; use `normalized` books; price = mid when spread <= 4c and both sides >= $5, else null. Ignore `lastPrice`.
- **Normalisation:** one Strix `market` = one binary contract; YES = `outcomeIndex 1`. NEG_RISK football events map to two "X wins (90 min)" binaries; the event has no draw token.
- **Status:** `OPEN | CLOSE | SETTLED` at market level (`CLOSE` seen on a 15m window); `enableOrderBook false` = not tradable; WS `market.status_update PAUSE`.
- **Fees in edge maths:** `fee/share = rate x p x (1-p)` (taker only); sports 0.022, politics/finance 0.032, crypto 0.070.
- **Resolution risk flag:** `resolverType` MANUAL -> operator-resolved; `UMA_OOV2` -> check `oracle.state`.
- **Do not build** a trade adapter or a PayBox plugin for Strix in v0.1.

---

## 14. Fixtures (all captured 2026-10-19, unauthenticated, UA `insurance-markets-research/0.1`)

`docs/research/fixtures/strix-lab/`: `events_open_sample.json` (29 KB, 5 of 12 events, BTC trimmed), `events_settled_sports_sample.json` (14 KB), `orderbook_iran_yes.json`, `orderbook_iran_no.json`, `ws_orderbook_frames.json`, `books_snapshot_2026-10-19.json` (15 KB), `market_one.json`, `activity_sample.json` (4 fills, third-party wallets and usernames redacted), `kline_iran_yes_d1.json`, `categories.json`, `resolution_manual_iran.json`, `resolution_uma_oov2_settled.json`, `error_status_closed_500.json`. The 36 MB `/events?status=open` response was NOT saved in full.

## 15. Suspicious content and prompt-injection check

None observed that aimed at an AI agent in docs, API responses or the SDK package files read. Notes: (a) the GitBook "page not found" response for a missing doc URL contains a block of generic "how to find the correct page" instructions (query-by-`?ask=` etc.); it is boilerplate from the docs host, was not followed; (b) docs and the Telegram page contain security warnings aimed at users ("Strix Lab will never ask you for your API secret"), not agents; (c) the unauthenticated `/activity` feed exposes other users' wallet addresses and usernames (a privacy/OSINT concern, redacted in fixtures); (d) the `status=closed` 500 response leaks server query internals (information disclosure by the venue); (e) `https://api.blockscout.com/base/...` answered HTTP 402 "Proceed with API key or make a X402 payment to continue" and `base.blockscout.com` is behind a Cloudflare challenge (403); no payment was made.

## 16. NOT FOUND / open questions

- Exchange/CTF **source, ABI, audit**: NOT FOUND (searched: Basescan, Sourcify, Dune, docs, web search, GitHub org). The SDK GitHub repo is not public (404).
- **Order-authorisation mechanism** for HMAC-API orders (delegated Privy signing vs contract operator authority) and whether "self-custodial" holds in practice: NOT FOUND.
- Whether an **external-wallet** account can be driven by API keys without browser signatures: NOT FOUND.
- **Unauthenticated read rate limits**: NOT FOUND.
- Whether the market maker **references other venues' prices** (and which markets copy Polymarket definitions): NOT FOUND (not checked; Polymarket is out of scope for this task).
- API **volume unit** (one- vs two-sided) and `lastPrice` update rule: NOT FOUND.
- Whether **any live market is in the zero-fee "Geopolitics" category**: NOT FOUND.
- Cheap way to list only OPEN windows of the rolling BTC series without the 8 MB payload: NOT FOUND (no documented market-status filter).
- Deposit/withdraw **fees and limits**, KYC level for withdrawals: NOT FOUND.
- Funding, team, audits, regulatory status beyond BVI incorporation: NOT FOUND (web search extended, 2 queries).

---

## Sources

Primary (read this session, 2026-10-19):
- https://strixlab.io (home; 11 listed markets, nav links) and https://www.strixlab.io/terms (ToS, last updated July 10, 2026) and https://www.strixlab.io/articles
- https://docs.strixlab.io/llms.txt and product pages: getting-started/what-is-strix, connect-wallet, deposit-funds; trading/how-markets-work, order-book, order-types, fees, market-resolution, trade-from-telegram; policies/restricted-regions; rewards/liquidity-rewards; resources/faq (`.md` variants)
- https://dev.strixlab.io/llms.txt and pages: readme, get-started/quickstart|concepts|installation, http-and-websocket-api/rest|authentication|websocket, typescript-sdk/events-and-markets|orderbook|orders|portfolio|websockets|errors-and-rate-limits|reference, guides/production-checklist, resources/changelog
- Live API: https://api.strixlab.io/api (`/ok`, `/time`, `/events`, `/events/:id/resolution`, `/markets/:id`, `/orderbook/:tokenId`, `/midpoint`, `/price`, `/kline`, `/activity`, `/categories`), `wss://api.strixlab.io/ws`, https://api-staging.strixlab.io/api
- https://registry.npmjs.org/strix-sdk (v0.2.6, MIT, published 2026-09-18) and https://unpkg.com/strix-sdk@0.2.6/ (`CHANGELOG.md`, `dist/index.d.ts`, read as text only, nothing installed)
- Basescan pages for the Exchange, ConditionalTokens, operator EOA, UMA resolver and sample tx `0x754c554200eeca6b3fc5caa7a5e569dc019caeee8ffeaf5ec551c51f44b58f02` (https://basescan.org/address/..., https://basescan.org/tx/...)

Secondary:
- https://dune.com/ctlim/strix-lab-prediction-market-on-base (third-party dashboard; data to 2026-09-06; contract addresses and volume caveats; read through a page-summarising fetch, so M)
- WebSearch (extended): https://x.com/StrixLab_ (profile snippet: joined June 2026, Base, Telegram bot), https://my.hiredly.com/jobs/jobs-malaysia-strix-lab-inc-job-content-host-campaign-executive (job listing), PANews links on the home page (not opened)
