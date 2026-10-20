# Lightcone (impact markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran about 03:35-03:45 UTC). READ-ONLY: unauthenticated GETs to `api.lightcone.xyz`, `lightcone.xyz`, `docs.lightcone.xyz`, `ws.lightcone.xyz` (handshake only, nothing subscribed), the npm registry, `gh api` raw file reads of the public SDK repo, and one WebFetch of the QQ article. No account, key, wallet, signature or POST. Generic User-Agent `insurance-markets-research/0.1` only. WebSearch was unavailable (session budget used up), so discovery relied on the SDK/npm/GitHub route instead.

Tags: **H** = read first-hand in a primary source this session (cited), **M** = secondary / inferred from first-hand data, **L** = weak or stale (older than 6 months counts as possibly stale).

Fixtures (each <= 50 KB): `docs/research/fixtures/lightcone-impact-markets/` (listed in section 13).

---

## 0. Bottom line

1. **Live, real, on Solana mainnet, but a pilot with effectively zero liquidity. adapter_priority = P2 (watch / canary, do not build a trading leg).** Platform open interest is **$5.42** and all-time volume **$16.07** (H, API, 2026-10-19). Only 3 markets have ever existed (2 resolved, 1 active), all "US 2026 midterms". All 6 order books of the active market are empty (H).
2. **The discovery lead was right and now has a primary source.** The venue is `lightcone.xyz`; the official SDK README calls it "the Lightcone impact market protocol" (H). Earlier "NOT FOUND" notes were because the website sits behind HTTP Basic auth (401) and the docs behind a login.
3. **There is a clean public read API** (`https://api.lightcone.xyz`, REST + WebSocket, no key for reads). Confirmed with real responses (fixtures). The official OpenAPI spec and the docs are private; the public MIT-licensed SDK is the best specification (H).
4. **Not a probability venue.** An "impact market" quotes *asset A vs asset B conditional on outcome X* (for example SOL priced in USDC if "Democrats Sweep"). No book quotes P(outcome) directly, so it is **not a direct arbitrage leg** against Polymarket/Kalshi-style binaries. Its value is as a *signal* (conditional price spread = market-implied event impact on an asset), and that signal is empty today.
5. **Trading is closed to outsiders in practice**: website gated, docs gated, `is_beta` flag in the session object, server-side order submission needs an issued API key (issuance process not public), Solana-only (no EVM path), and on-chain steps require Solana "v1" transactions.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://lightcone.xyz/` | HTTP 401, `www-authenticate: Basic realm="Lightcone"`, empty body (CloudFront). The page is not publicly viewable; it is a password gate, not a dead site. The CSP header lists `api.lightcone.xyz`, `wss://ws.lightcone.xyz`, Privy auth, Solana RPC providers, so a real web app sits behind it. | H |
| `https://api.lightcone.xyz/` and `/health` | HTTP 200, body `OK` (Cloudflare). | H |
| `https://api.lightcone.xyz/api/metrics/platform` | 200 JSON; `active_markets: 1`, `active_orderbooks: 6`, `updated_at: 2026-10-09T23:34Z`. | H |
| Open-interest history endpoint | `timestamp` 2026-10-19T03:42Z (live), first non-zero OI day 2026-07-28, flat at $5.41678137 since at least 2026-10-14. | H |
| `https://docs.lightcone.xyz/` | 302 to `/login?redirect=...` (Mintlify, login required, including `llms.txt`, `sitemap.xml`, `openapi.json`). | H |
| `app.lightcone.xyz` | 502 at probe time; `ws.lightcone.xyz/ws` answers a WebSocket upgrade with 101 Switching Protocols. | H |
| SDK repo `github.com/lightcone-street/lightcone-sdk` | Public, created 2026-01-21, last push 2026-10-14, commits 2026-10-06 to 2026-10-12. npm `@lightconexyz/lightcone-sdk` latest 0.8.3 (published 2026-09-14), `next` 0.8.4-rc.59, license MIT, created 2026-02-10. Org `lightcone-street` created 2025-07-21; it has only this one public repo. | H |
| Press | Castle Labs essay, translated by Block unicorn on Tencent News 2026-01-16 (9 months old, possibly stale): "Lightcone lets users trade on the 'impact' of an event" (S&P 500 after an FDA decision). Names no URL, founders, chain or funding. | M |
| Third-party context | distbit.xyz post 2026-02-03 lists Lightcone with Proof, if.market, Branchpoint and MetaDAO as platforms "building or piloting" conditional (impact-future) markets. | M |

Name collisions to ignore: `lightcone.ai` (Tzafon computer-use model, unrelated), `@lightcone-research/*` and Loopring "Lightcone" (2019-2020, dead), `lightcone.app`, `lightcone.trade` (Cloudflare "DNS points to prohibited IP"). `lightcone.fi`/`.markets`/`.io`/`.market` do not resolve.

Verdict: **still_live = true** (mainnet program, active API, active SDK development), with the caveat that usage is at pilot/test scale.

---

## 2. Kind and market model

- **Kind:** hybrid on-chain CLOB. Orders are signed off-chain, matched by a central operator/engine, settled by a custom **Solana program** (program source repo `lightcone-pinnochio` is private). Conditional-token design (Gnosis-CTF-like: `question_id`, `condition_id`, `oracle`, `payout_numerators/denominator`). (H: SDK README, `program/README.md`, API market objects.)
- **Outcomes:** categorical, 2-6 outcomes per market (`numOutcomes` 2-6). Seen: 3 outcomes ("Democrats Sweep", "Republicans Sweep", "Other") and 5 outcomes (the retired "Balance of Power" market). Resolution can be `single_winner` or a `scalar` payout vector (fractions of a payout denominator). (H)
- **Tokenisation:** for every (outcome, collateral) pair there is an SPL conditional mint, e.g. `DSWEEPUSDC`, `DSWEEPSOL`, `DSWEEPWBTC`. One complete set (one token per outcome, same collateral) is redeemable for 1 unit of collateral (`mintCompleteSet` / `mergeCompleteSet`). (H)
- **The "impact market" part (the unusual bit):** each order book pairs the *same outcome* in two different collaterals, base = `DSWEEPSOL`, quote = `DSWEEPUSDC`. Its price is therefore the SOL/USDC (or WBTC/USDC, WETH/USDC) exchange rate *conditional on Democrats Sweep*. The active market has 6 books: {SOL, WBTC} x {Democrats Sweep, Republicans Sweep, Other}, all quoted in USDC. Comparing the DSWEEP and RSWEEP prices gives the market-implied effect of the event on the asset. (H: `GET /api/markets`, `/api/metrics/orderbooks/tickers`; the "shared outcome" orderbook layout is in the SDK README.)
- **Order types:** limit orders with time-in-force GTC / IOC / FOK / ALO (post-only); "market" = signed limit with IOC. (H, SDK order README)
- **Precision:** `price_quantum` 0.001, size quantum 0.001 base, max 5 significant figures, tick_size 1 or 1000 raw depending on the book (H, `/api/orderbook/{id}`).

---

## 3. Chains and collateral

- **Chain:** Solana mainnet only. Production program ID `F5zrhPGL9REfsQ4vHR3ESYo9zaqiVvmHoHjqRwd8cPrz` (H: SDK `env.ts`; I did not verify it on-chain because the JSON-RPC is a POST). Staging/local use devnet.
- **Collateral ("deposit assets", whitelisted globally, all `active: true` on 2026-10-19):** USDC (`EPjFWdd5...Dt1v`, 6 dp), "WBTC" (actually mint `cbbtcf3aa2...`, 8 dp, cbBTC-style mint, labelled WBTC by the API), WETH (`7vfCXTUXx5...`, 8 dp), wrapped SOL (9 dp). A market opts in to a subset (market 3: USDC, WBTC, SOL). (H: `/api/global-deposit-assets`, `/api/markets`)
- **Funding model:** collateral must first be deposited to the program (`depositToGlobal` / `globalToMarketDeposit`), which are on-chain transactions; orders then spend from that position. SOL is handled as native SOL plus a canonical WSOL account. (H, SDK README)
- **Trust / centralisation (H, SDK `program/README.md`):** `Exchange` account has `authority`, `operator` (order matching), `manager` (market setup), `feeReceiver`, a global `paused` flag. Each market has a single `oracle` pubkey (same key, `4Kh7...`, on all three markets). Program upgradeability and audits: NOT FOUND (program repo private; no audit report found).

---

## 4. Read API (official, public, no key for reads)

- **Base URL:** `https://api.lightcone.xyz` (prod). WebSocket: `wss://ws.lightcone.xyz/ws`. Staging `https://api.staging.internalcone.com` (devnet, not for use). (H: SDK `env.ts`)
- **Docs:** `https://docs.lightcone.xyz` (login-gated, unreadable); published docs source `github.com/lightcone-street/docs` is private (404). The public SDK is the working spec: `github.com/lightcone-street/lightcone-sdk`. (H)
- **Envelope:** `{"status":"success","body":{...}}` or `{"status":"error","error_details":...}`. Prices and sizes are decimal strings. (H)
- **Auth for reads:** none. **Rate limits for reads:** NOT FOUND (searched: SDK README, SDK retry code, response headers - no `x-ratelimit-*`/`retry-after`). SDK retries 429 with exponential backoff. Pagination by `cursor` / `limit`.

| Purpose | Endpoint | Confirmed live |
|---|---|---|
| Markets (outcomes, collaterals, mints, books, fees, status, resolution) | `GET /api/markets`, `/api/markets/{pubkey}`, `/api/markets/by-slug/{slug}`, `/api/markets/search/by-query/{q}`, `/api/markets/search/featured` | `/api/markets` yes (3 markets, `has_more:false`) |
| Order book (top of book) | `GET /api/orderbook/{orderbook_id}` ; `/api/orderbooks/{id}/decimals` | yes (empty book) |
| Trades | `GET /api/trades?orderbook_id=&limit=&cursor=` ; `/api/trades/market` | yes (1 trade) |
| Candles | `GET /api/price-history?orderbook_id=&resolution=&from=&to=` (ms timestamps) | not called |
| Metrics / liquidity | `/api/metrics/platform`, `/markets`, `/markets/{pubkey}`, `/orderbooks/tickers`, `/orderbooks/{id}`, `/categories`, `/deposit-tokens`, `/open-interest/history` | yes |
| Collateral list | `GET /api/global-deposit-assets`, `/api/markets/{pubkey}/deposit-assets` | yes |
| Resolution | inside the market object: `market_status` (Pending/Active/Resolved/Cancelled), `resolution{kind,payout_denominator,payouts[],single_winning_outcome}`, `settled_at`. WS `Market` channel pushes settlement/activation/pause. | yes |
| User data (needs session) | `/api/users/orders`, `/users/positions`, `/users/order-fills`, `/users/deposit-token-balances`, `/api/auth/me` | no (auth) |

- **WebSocket channels (H, SDK `ws/README.md`):** `books` (top-20 snapshot, full replacement per frame, optional Hyperliquid-style `n_sig_figs`/`mantissa` aggregation, `seq` revision, `resync` flag), `trades`, `ticker` (best bid/ask/mid), `price_history` (OHLCV), `market` (lifecycle) are public; `user` and `wallet_deposit_balances` need auth. Handshake to `/ws` returned 101 (H); no frames were read.
- **Gotchas for an adapter:** (a) there is no per-outcome "price"; you must read the 6 books and carry (outcome, base collateral, quote collateral) into the normalised model; (b) `last_trade_price` is null on all books, `tickers` carry no prices while books are empty; (c) `platform` metrics are cached (`updated_at` 2026-10-09 while OI history is live), do not use them as a freshness signal; (d) `volume_*_usd` mixes SOL/WBTC/USDC converted by the venue's own price feed.

---

## 5. Trade path (programmatic)

Exists and is documented in the SDK, but needs credentials we cannot obtain read-only. Facts (all H, SDK source):
1. **Session login:** `GET /api/auth/nonce`, sign the exact UTF-8 string `Sign in to Lightcone\nNonce: <nonce>` with the Solana key (Ed25519), `POST /api/auth/login_or_register_with_message {message, signature_bs58, pubkey_bytes}` returns a session cookie. Alternative: Privy (email / Google / X embedded wallet) used by the web app. Session object contains `is_beta`.
2. **Order signing (off-chain):** build a `SignedOrder`, hash with keccak256 over the 169-byte layout `nonce(8) || salt(8) || maker(32) || market(32) || baseMint(32) || quoteMint(32) || side(1) || amountIn(8) || amountOut(8) || expiration(8)`, then **Ed25519-sign the 64-char ASCII hex of that hash** (not the raw bytes). Per-user on-chain nonce (`incrementNonce` cancels all).
3. **Submit/cancel:** `POST /api/orders/submit`, `/api/orders/cancel`, `/api/orders/cancel-all`. For server-side callers the header `x-lightcone-api-key` is attached to exactly these three POSTs; browser builds refuse API keys. Issuance of an API key: NOT FOUND (searched: SDK READMEs, CONTEXT.md; the docs are gated).
4. **On-chain steps** (deposit, mint/merge complete set, init position tokens, redeem, nonce increments) are user-signed Solana transactions. The SDK emits and accepts **only Solana v1 transactions** (ADR 0004: legacy/v0, ComputeBudget and ALTs are rejected by the SDK).
5. **Rate limit on trading:** Cloudflare limits submit/cancel to **500 attempts per 10 s per source IP**; reads and WS messages are outside it (H, TS README "API Key" section).

---

## 6. Reachability from PayBox (`paybox_reachable = partial`)

- **EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): no.** Lightcone is Solana-only; an EVM key cannot place orders or hold collateral. (H)
- **PayBox Solana wallet: partial, unverified.** PayBox exposes `request_wallet_sign` ops `solanaMessage` / `solanaTransaction` / `raw` and a `solana:mainnet` proposal kind (M: `docs/research/06-paybox-platform.md`). The login string and the order hash are both plain Ed25519 signatures over short byte strings, which a `solanaMessage` intent could plausibly produce (whether PayBox signs raw bytes without a prefix: not verified). Blockers: (1) the server-side API key for order submit; (2) the Lightcone SDK requires **v1** transactions while the PayBox `solana` proposal kind is documented as legacy/v0, <= 1,232 bytes (M, second-hand from the Phase 0 notes; whether the Lightcone program itself would accept v0 transactions built by hand is unknown); (3) the beta gate. Verdict for planning: treat as not reachable.
- Read-only aggregation does not involve PayBox at all and works today.

---

## 7. Fees

- **Per-market `maker_fee_bps` and `taker_fee_bps` are stored on the market account** (program `Market.makerFeeBps/takerFeeBps`) and exposed by the API. **All three markets show 0 / 0.** The only trade seen has `taker_fee: "0.000000"`, `maker_fee: "0.000000"`; platform `fees_24h/7d/30d_usd` = 0. (H, API 2026-10-19)
- Fee formula, who pays, and any "market fee buffer" mechanics (the API has a rejection code `INSUFFICIENT_MARKET_FEE_BUFFER`): NOT FOUND (searched: SDK READMEs, error tables; docs gated). Assume fees can be switched on per market later.
- Users also pay Solana network fees and ATA/position-account rent for on-chain steps; the SDK pre-checks SOL for fees. Orders themselves are off-chain-signed. (H, SDK README)

---

## 8. Resolution mechanism and dispute risk

- **Mechanism:** a single `oracle` authority key posts the payout vector on-chain (CTF style). Market text names human/media sources: AP, CNN, Fox News and NBC, market resolves once >= 3 of 4 have "conclusively declared" House and Senate results; the retired market 1 text used AP/Fox/NBC all three, falling back to official certification. (H: `definition` field)
- **Dispute process, challenge window, bond:** NOT FOUND (searched: API fields, SDK docs). `resolution_by` is null on all markets. Treat it as **fully discretionary, single-key resolution** (M).
- **Observed behaviour (H data, M reading):** market 1 ("Balance of Power") was settled 2026-08-14 with every outcome paying 1/5, i.e. a void/refund-style scalar payout; market 2 was settled 2026-09-11 with "Other" as the single winner. The US midterms are on 2026-11-03 (statutory date, M), so both were closed **before the real-world event**, and a fresh market 3 with the same name was created 2026-09-15. This looks like pilot iteration, but it demonstrates that the oracle can settle at will.

---

## 9. Geo / ToS / automation

- Geo-blocking, restricted jurisdictions, KYC, ToS wording: NOT FOUND (searched: SDK code and READMEs, response headers; the website and docs are behind a Basic-auth gate and a login, which I did not try to bypass).
- Automation: explicitly supported for server-side clients (API key, SDK in Rust/TS/Python, per-IP rate limit statement). The product is access-gated: session carries `is_beta`, there is a referral-redeem endpoint (`/api/referral/*`) and a faucet endpoint `/api/claim` (test environments). Whether prod access requires an invite: M (inferred from the Basic-auth gate and `is_beta`).
- Treat as: do not onboard, do not trade; read-only public API use appears unrestricted but no ToS was readable (L).

---

## 10. Liquidity (all H, API, 2026-10-19 unless noted)

| Metric | Value |
|---|---|
| Open interest, all markets | **$5.41678137** (USDC $2.94, WBTC $2.48); peak daily OI USDC $15.02, WBTC $10.57 (since 2026-07-20) |
| Volume 24h / 7d / 30d / all-time | $0 / $0 / $2.34 / **$16.07** (platform metrics, `updated_at` 2026-10-09T23:34Z) |
| Unique traders | 0 (24h), 0 (7d), 2 (30d) |
| Active markets / books | 1 / 6, all books empty (snapshot `captured_at` 2026-10-08T20:08Z, revision 4) |
| Last trade seen | 2026-09-16T08:18Z, 0.00002 WBTC at 77,784 USDC (about $1.56) on the "Democrats Sweep" WBTC book |
| SOL books | zero volume ever |

No TVL/market-cap listing found (DefiLlama not checked; SDK and API are the only sources). Conclusion: no depth to trade against and no meaningful price discovery.

---

## 11. Event categories and arbitrage overlap

- **Categories listed:** `Politics` only (the metrics endpoint also lists an `uncategorized` bucket, zero volume). Active topic: "US 2026 Midterm Elections" with outcomes Democrats Sweep / Republicans Sweep / Other.
- **Cross-venue overlap:** conceptually the same underlying as the Polymarket/Kalshi "which party controls House / Senate / both" markets. But (a) Lightcone does not quote P(outcome) (books are asset-vs-asset conditional prices), (b) "Other" lumps every split-control result together, (c) books are empty. So there is **no arbitrage leg** here today.
- **Signal value (the reason to keep it on a watch list):** if liquidity ever appears, `price(DSWEEP, asset/USDC) / price(RSWEEP, asset/USDC)` is a direct market-implied "event impact on SOL/BTC/ETH" number. That is a Quotient-style signal that no other covered venue offers. Deriving P(outcome) from these books would need spot-price and independence assumptions (L, not verified).

---

## 12. Shared liquidity

None found. Own program, own operator-matched order books, own collateral vaults (H: market `vault` addresses, program ID). It does not mirror Polymarket/Kalshi/etc. (M, no sign of routing). It would be an independent leg if it had liquidity.

---

## 13. Adapter notes and fixtures

If built (low priority): a read-only poller on `GET /api/markets` + `GET /api/orderbook/{id}` + WS `books`/`ticker`, normalising each book as a *conditional pair* (outcome index, base collateral, quote collateral), not as a binary YES/NO quote. Cheap canary: poll `GET /api/metrics/platform` and `GET /api/metrics/open-interest/history` daily and promote the venue when OI exceeds a threshold (suggest > $50k) and a non-midterm category appears. No trading adapter until an API key and an access path exist.

Fixtures (`docs/research/fixtures/lightcone-impact-markets/`; captured 2026-10-19 via unauthenticated GET; icon/metadata URLs stripped from some to stay under 50 KB):
- `GET_api_metrics_platform.json` (2.4 KB), `GET_api_markets.trimmed.json` (33 KB, icon URLs removed), `GET_api_orderbook_4yBy_empty.json`, `GET_api_trades_orderbook_HzKF.json`, `GET_api_metrics_orderbooks_tickers.json`, `GET_api_global-deposit-assets.json`, `GET_api_metrics_open-interest_history.trimmed.json` (last 10 of 92 daily points), `GET_api_metrics_markets_BGAs.json`.
- The trade fixture contains two third-party public Solana addresses (counterparties) as returned by the API; no address of ours is anywhere in these files.

---

## 14. NOT FOUND / open questions

- NOT FOUND (searched: docs.lightcone.xyz incl. llms.txt/sitemap/openapi - login wall; GitHub `lightcone-street/docs` - private; SDK READMEs): official ToS, geo restrictions, fee formula, dispute/challenge process, API-key issuance, public-read rate limits, audit reports, upgrade authority, funding, team.
- NOT FOUND (searched: WebSearch unavailable this session): independent press beyond the Castle Labs/Block unicorn translation and the distbit post.
- Not verified: the production program on-chain (needs a JSON-RPC POST), the contents of the website behind Basic auth, whether PayBox `solanaMessage` signs raw bytes, whether the program accepts non-v1 transactions.
- Not exercised: `/api/price-history`, `/api/trades/market`, WS frames.
- Question for a human: is the Basic-auth gate a pre-launch password (then expect a public launch before the 2026-11-03 midterms, which could bring real volume)? Re-check `GET /api/metrics/platform` after that date; the active market will resolve on the midterm result.

---

## 15. Embedded instructions / suspicious content

None aimed at this task. The SDK repo ships `AGENTS.md`/`CLAUDE.md` contributor guidance for agents working inside that repo (AGENTS.md read, not followed; points to a private `conetext` repo). The website's response headers include a Sentry key in a CSP report URI; I did not record it.

---

## Sources

- https://api.lightcone.xyz/api/metrics/platform , `/api/markets`, `/api/orderbook/4yByseksChQ3wATNPHzSzshyAf7Q2NDwUB7qo3eWQA14`, `/api/trades?orderbook_id=HzKFXo15NMu6zYCxCrZPxyfKPUodAPaTnGMozhXimtHk&limit=5`, `/api/metrics/orderbooks/tickers`, `/api/metrics/markets/BGAsfnjJMp65i2TPvwCD85d5koSpt4qxP3eL9BEwKAQG`, `/api/metrics/open-interest/history`, `/api/global-deposit-assets`, `/api/auth/nonce` (nonce issued, not used), `/health` - fetched 2026-10-19 [H]
- https://lightcone.xyz/ (401 Basic realm "Lightcone"), https://docs.lightcone.xyz/ (302 to login), https://ws.lightcone.xyz/ws (101 upgrade) - 2026-10-19 [H]
- https://github.com/lightcone-street/lightcone-sdk : `README.md`, `CONTEXT.md`, `AGENTS.md`, `typescript/README.md`, `typescript/src/env.ts`, `typescript/src/domain/{market,orderbook,trade,price_history,metrics,order,position}/client.ts`, `typescript/src/auth/{index,client,native}.ts`, `typescript/src/program/{orders.ts,README.md}`, `rust/src/ws/README.md`, `rust/src/domain/order/README.md`, `docs/adr/0004-solana-v1.md` [H]
- https://www.npmjs.com/package/@lightconexyz/lightcone-sdk (registry metadata: versions, dates, MIT) [H]
- https://news.qq.com/rain/a/20260116A07T6M00 (Tencent News, 2026-01-16, Block unicorn translation of Castle Labs; possibly stale) [M]
- https://github.com/distbit0/distbit.xyz/blob/main/_posts/2026-02-03-actually-impact-futures.md (2026-02-03; possibly stale) [M]
- Repo-internal: `docs/research/06-paybox-platform.md` (PayBox signing intents and proposal kinds, second-hand) [M]
