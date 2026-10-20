# ParamX (Sui) - adapter spec

Researched 2026-10-19 (~01:30-02:10 UTC). READ-ONLY: unauthenticated GETs to `api.paramx.xyz`, one public WebSocket read (documented `subscribe` ops only), `gh api` file reads of the vendor's public repos, public static assets of the vendor's web app, DefiLlama public API, App Store lookup, one read-only PayBox `discover_tokens` (chains) call. No account, no key, nothing signed, no POST/PUT/DELETE, no wallet, no browser automation. No third-party code cloned, installed or run (the only script run was my own 25-line WebSocket reader).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (docs, READMEs, API payloads, web-app JS) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/paramx/` (12 files, each <= 8 KB).

## 0. Verdict

**adapter_priority: P2** (read-only price feed only; do not build a trade leg).

1. Live (H): API serves fresh books and a live WebSocket; mainnet since about 2026-09-21; iOS app (view-only) released 2026-10-13.
2. **Not a YES/NO binary on a terminal price.** It is a "touch" contract: a tile pays $1 if the underlying prints a trade inside a price range at any time during a window (5m / 1h / 1d windows). The DefiLlama blurb ("YES/NO range contracts") is loose (H, section 2).
3. **Best API in this batch of venues**: official, public, no key, OpenAPI 3.1, REST + WebSocket with full books, per-tile contract detail, public tape (H, section 4). A read adapter is about a day of work.
4. **Liquidity is effectively nil and house-made** (H/M, section 10): the entire public trade tape is about 47 trades and about $258 notional since 2026-09-27; the only liquidity provider is ParamX's own market maker (address printed in its docs), which holds $316.81 cash while posting 36,546 resting orders. Quotes are a Monte Carlo model of Coinbase volatility, not crowd consensus.
5. **Not reachable from PayBox** (H, section 6): Sui is not in PayBox's chain catalog, orders need an Ed25519 trading key registered by a Sui transaction, and the exchange refuses deposits and orders from US and UK IPs.
6. Centralised operator and oracle, 2-of-3 admin multisig that can upgrade the contract and emergency-sweep a contract's pool (H, section 8).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.paramx.xyz/v1/exchange` | 200, `network: mainnet`, package `0xd8fca804...` (v2), `taker_fee_bps: 30` | H |
| Live prices | `GET /v1/instruments/1/price` BTC `82351.75` at ts 1792374541024 = 2026-10-19 01:49:01Z | H |
| Books | `GET /v1/books?instrument_id=1` returned 1,312 books; `GET /v1/markets?instrument_id=1` 1,315 tiles (767 two-sided) | H |
| WebSocket | `wss://ws.paramx.xyz/v1` acked 3 subscriptions and pushed `top_of_book`, `book`, `underlying_trades` frames (fixture `ws_frames_sample.json`) | H |
| Market-maker quotes refreshed | book `version` values on the sampled tile were 20-40 s old (version = epoch micro-seconds) | H |
| Launch | DefiLlama adapter PR merged 2026-09-24 (opened 2026-09-21); GitHub org `paramxxyz` created 2026-09-28; earliest public trade 2026-09-27 | H |
| iOS app "ParamX Markets" (view-only) | releaseDate 2026-10-13, v1.0.2 on 2026-10-17, 0 ratings; sold under an individual developer account | H |
| Landing page claims | "21 Listed markets", "~9,000 quotes refreshed every 10 seconds", "Volume to date $-" (blank) | H (page); live API lists only 15 instruments as `listed:true` (6 crypto + 9 equities/ETFs), 27 CME futures `listed:false` |
| Landing page quality | template placeholders left in HTML comments (investors, team, audit "placeholder") | H |

Very young (about 4 weeks on mainnet). Treat as an early-stage product with a single team and no published audit ("Smart contract audit: Auditor, scope and date placeholder" on the landing page; DefiLlama PR: "List of audit links: None").

## 2. What it is

- **Kind**: onchain-clob in the loose sense: a **centralised off-chain order book** (Rust, operator-run) with **on-chain settlement of every fill** in a Move contract on Sui. Self-custodial in the sense that the contract holds cash and positions and only pays out to the account's own address, but the operator is required to accept deposits, run withdrawals and submit fills (H, docs "How it works", Operator section).
- **Market model (H, `public-contracts` README + docs page)**:
  - Instrument = a **tile** = (underlying, window `[start,end)`, price range `[min_strike,max_strike)`). One share pays **$1 if any trade in the underlying prints inside the range during the window** (docs page says "inside the range, inclusive"; `instruments.md` says `[min,max)`: boundary rule is contradictory, see section 13).
  - Grids: `5m` (300 s), `1h`, `1d` windows with per-instrument price steps (BTC live: $50 / $250 / $500; the repo doc still says $100 / $500 / $2,000, so docs lag the live API).
  - "Big tile" = rectangle of tiles traded as one contract (pays if any part touched), priced by RFQ against the market maker; error codes `NO_QUOTE` / `QUOTES_UNAVAILABLE` exist but the RFQ endpoint is **not in the OpenAPI document** (NOT FOUND).
  - **Not categorical and not scalar.** Each tile is independent; adjacent tiles are not mutually exclusive (several tiles can touch in one window).
  - Long = YES (touched). Short (sell beyond holdings) = NO, locks `1 - price` of cash per share (collateral $1/share, receive price). So complement price is `1 - p`.
- **Tokenisation**: none. Positions are rows in a Move `Table<address, Position{amount,is_short}>` inside the single shared `Exchange<USDC>` object (H, `paramx.move`). Not transferable, no outcome tokens, no ERC-1155, not composable.
- **Contract id** = u256 packing `underlying_id<<224 | start<<192 | end<<160 | max_strike<<96 | min_strike<<32` (H). The id is derivable from terms, so an adapter can build ids without listing.
- **Instruments (live `GET /v1/instruments`, H)**: crypto BTC(1), ETH(2), ZEC(3), HYPE(4), SOL(5), XRP(6); US equities/ETFs AAPL, AMZN, GOOGL, META, MSFT, NVDA, TSLA, SPY, QQQ (ids 7-15, hours Mon-Fri 04:00-20:00 New York); CME futures ids 16-46 present but `listed:false`.
- **Price sources**: Coinbase trades for crypto; "Massive" market data for US equities/ETFs and CME futures (H, docs page).
- **Market maker**: ParamX runs it from an ordinary account; two bids and two asks per tile; prices from Monte Carlo (2,000 paths per grid, recent volatility); only quotes tiles whose window has not started; quotes behind better user prices (H, docs page).

## 3. Chains and collateral

- Chain: **Sui mainnet only** (H). Devnet clone for paper trading at `https://api.paramx.xyz/devnet/v1` and `wss://ws.paramx.xyz/devnet/v1` (weekly wipes, faucet 1,000 test USDC/day) (H, repo README).
- Collateral: **native Circle USDC on Sui**, `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`, 6 decimals (H, `/v1/exchange`). Fully collateralised: $1 per outstanding share.
- Contract addresses (H, `/v1/exchange` and repo README): original package `0x60f883f9...8ed7`, current package (v2) `0xd8fca804...eb0b`, Exchange object `0xce8d8975...deec`, operator `0x17e74883...e6bb`, gas sponsor `0xf07723f3...8b42`.
- Gas: ParamX's gas sponsor pays for deposit, trading-key registration and (off-chain-matched) fills; "You don't need any SUI" (H, repo README). Sponsor co-signs only those exact transaction shapes (`SPONSOR_REJECTED` otherwise).
- Funding routes in the web app: Stripe card and Mayan cross-chain swaps land USDC in the user's Sui wallet first, then a deposit transaction moves it into exchange cash (H, docs page). No direct EVM deposit address.

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs | `https://app.paramx.xyz/developers` (SPA; same text as repo `docs/*.md`) and `https://app.paramx.xyz/docs` (how it works). Repos `github.com/paramxxyz/nautilus-paramx` (docs, Rust client LGPL-3.0-or-later, Python Nautilus adapter, signing vectors) and `github.com/paramxxyz/public-contracts` (Move interface). | H |
| REST | `https://api.paramx.xyz/v1`, official, public, **no API key** (OpenAPI 3.1 at `/v1/openapi.json`, `securitySchemes: null`) | H |
| WebSocket | `wss://ws.paramx.xyz/v1`, public, no auth; account channel also needs no login ("Accounts are public on chain") | H |
| Rate limits | 300 HTTP requests/min per IP (`RATE_LIMITED` 429); 20 WS connections per IP; 2,000 subscriptions per connection (max 20 account); client disconnected if 8 MB behind. No `X-RateLimit-*` headers seen on responses. | H (docs); headers NOT FOUND |
| Geo on reads | Reads work from a US IP (all my calls succeeded). Only deposits and orders are region-blocked. | H |
| Pagination / size | `/markets?instrument_id=1` = 420 KB for 1,315 tiles; `/books?instrument_id=1` = 260 KB; `/accounts/{mm}/orders` = 14 MB. Use `grid=` filter and WebSocket. | H |

**Key endpoints (all GET, shapes confirmed live unless marked)**:
- `GET /v1/exchange` - addresses and constants (fixture `api_v1_exchange.json`).
- `GET /v1/instruments` - underlyings, grids, hours, `listed` (fixture `api_v1_instruments_sample.json`).
- `GET /v1/instruments/{id}/price` - last underlying trade (fixture `api_v1_instrument_price_btc.json`); `/sessions?from=&to=`.
- `GET /v1/markets?instrument_id=&grid=` - tradable tiles with resting orders: `contract_id, underlying_id, start, end (ms), min_strike, max_strike, grid, status (upcoming|active|settling|settled), orders, best_bid{price,amount}, best_ask` (fixture `api_v1_markets_btc_sample.json`).
- `GET /v1/books?instrument_id=&grid=` (all books, each with a `version`) and `GET /v1/books/{contract_id}` - `{"bids":[["0.634999","105.604877"],...],"asks":[...],"ts":...}`; prices are decimal strings in USDC per share, amounts in shares (fixture `api_v1_book_tile.json`). `/books?instrument_id=` and `/trades` are live but **missing from the OpenAPI document**.
- `GET /v1/contracts/{contract_id}` - decoded terms, `status`, `tradable`, `reason`, `outcome` (`yes`=touched/`no`) once settled (fixture `api_v1_contract_tile.json`).
- `GET /v1/trades?instrument_id=|contract_id=&limit<=500` - public tape, newest first, `trade_id, contract_id, price, amount, total_price, tx_digest, ts`; no addresses, no taker side on REST (fixture `api_v1_trades_btc.json`). Calling without a filter returns 400 `INVALID_INPUT`.
- Account (public, by address): `GET /v1/accounts/{addr}`, `/orders`, `/positions`, `/fills`, `/history` (outcome enum `open|under_review|won|lost|closed`), `/balance-history`.
- Resolution: `contract.status` + `contract.outcome`; no separate resolution endpoint. `settlement_grace_seconds: 300` from `/exchange`.
- WebSocket channels (`op:subscribe`): `book` (full book on every change, no deltas; per-contract or per-instrument), `top_of_book`, `trades` (adds `taker_side`), `underlying_trades`, `account`. Every data frame has a gapless per-connection `seq`; books carry `version`. Server pings every 30 s; close code 1012 on restart. Browsers must send Origin `app.paramx.xyz`; server clients send none. (All H; frames confirmed in fixture.)
- Prices on the wire are decimal strings; share prices in `[0,1]`; units are USDC, no cents conversion needed. Times are Unix ms except the window inside a contract id (seconds).

Confirmed response shapes: sections above reference fixtures. Docs-vs-live drift seen: BTC `price_step_usd` live `50` vs doc `100`; `/instruments` has an extra `price_unit` field; landing "21 markets" vs 15 listed.

## 5. Trade path (documented, NOT exercised)

- **Programmatic placement exists and is documented** (H, `overview.md`, `signing.md`, `api.md`): `POST /v1/orders` (+ `/orders/batch` up to 20, `/orders/cancel`, `/orders/cancel-all`, `/orders/cancel-batch` up to 200), `POST /v1/withdrawals`, `POST /v1/trading-keys`, `POST /v1/deposits`. TIF `gtc|ioc|post_only` (no FOK). Idempotency via `client_order_id` (unique per account for 7 days). No API keys: **authentication is the signature itself**.
- **Two Ed25519 keys per account**:
  1. *Wallet key* = the Sui address; signs (Sui scheme: intent-prefixed Blake2b digest) the two setup transactions `new_trading_key_transfer` and `new_deposit_transfer<USDC>`; gas sponsored.
  2. *Trading key* (any Ed25519 key, registered on chain against the wallet) signs orders, cancels and withdrawals with **raw Ed25519 over BCS bytes, no prefix, no hash**. `BuyerOrderIntent{user,total_price(u64 micro),total_amount(Option<u64>),contract_id(u256),exchange_object_id,expiry(ms),nonce(u64 random)}`; 129 bytes (121 for market). Cancels are off-chain and instant; a cancelled order's signed intent stays valid on chain until `expiry` (only the operator can submit fills), so use short expiries. Worked vectors in `vectors/signing.json`.
- Quirk: withdraw message has **no nonce or expiry** today, so a signed withdrawal could be replayed (funds can only go to the account's own address; vendor says a nonce is planned) (H, `signing.md`).
- Matching is off-chain by the operator; each fill is a Sui transaction `execute_trade` (tx digest returned in fills/tape). Fill finality is therefore Sui finality plus operator submission.
- Account events (`account` channel): `order`, `fill` (role maker/taker), `position`, `balance`, `settlement`; nothing is replayed, so snapshot REST then apply events.

## 6. Reachable through PayBox?

**paybox_reachable: no.**

- PayBox chain catalog (live `discover_tokens` mode=chains, 2026-10-19, H): Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. **No Sui** (a search for `sui` returns 0 entries; catalog is "metadata, not a support allowlist", so absence is evidence, not proof).
- The venue has no EVM contract. Its entry points are Sui Move calls and Ed25519 signatures. An EVM wallet key is secp256k1: it cannot be the order-signing trading key (the contract verifies Ed25519 only, H `signing.md`), and it is not a Sui address unless used through Sui's secp256k1 scheme, which PayBox does not expose.
- A PayBox Solana wallet is Ed25519, so a signature-oracle trick (`solanaMessage` / `raw`) is conceivable for the trading key and, with Sui's intent-digest rules, even for the wallet key. NOT FOUND (searched: PayBox tool schemas in `06-paybox-platform.md`, no doc says Solana message signing returns a plain Ed25519 signature over caller-chosen bytes without a message prefix). Treat as unverified and unattractive.
- Funding from EVM chains would have to go through Mayan to a Sui address that PayBox cannot control.
- Even with a signer, the exchange refuses deposits and orders from US and UK IPs (`REGION_RESTRICTED`, H).
- Realistic bot path = a dedicated key file outside PayBox (what `paramx-setup` does), which defeats PayBox's role. Not recommended.

## 7. Fees

- **Taker 30 bps (`taker_fee_bps: 30`), maker 0** (H, `/v1/exchange`, docs page). Fee = 0.30% of the fill's value, paid by the order that fills against a resting order: a taking buy pays it **on top of** the price (signed `total_price` bounds the price; fee comes on top), a taking sell pays it **out of proceeds**. Collected into `Exchange.fees` and withdrawable by the admin multisig.
- No ParamX deposit, withdrawal or gas fee; Stripe and Mayan carry their own fees (H, docs page).
- Round-trip cost for a taker that buys and sells: about 0.60% of notional plus spread. Observed spread on BTC tiles with mid in 10-90%: median 9.0 cents, quartiles 6.9 to 11.0 cents (465 tiles, 2026-10-19 ~01:52Z, M computed from `/markets`).

## 8. Resolution mechanism and dispute risk

- **ParamX-run oracle** holds one Ed25519 key stored in `Exchange.oracle_data` (H). Settlement runs every 5 minutes after a 5-minute grace period for late data (H, docs page).
  - *Touched*: a signed proof naming one trade (price, time) inside the tile; contract checks signature, range, window, instrument, exchange, then `settle_yes_side` pays each long $1/share. The trade can be checked against Coinbase (crypto) or Massive (equities) history by the user.
  - *Not touched*: a signed statement about the whole window; contract accepts it only after the window ends (`settle_no_side` returns shorts' collateral).
- **No on-chain dispute or challenge process** (NOT FOUND, searched: docs page, public-contracts README and `paramx.move`, ToS excerpt). Account history has an `under_review` outcome state of unexplained meaning (M: probably "window ended, not yet settled").
- Centralisation risks stated by the vendor itself (H, docs page): operator needed for deposits, withdrawals and fills (if it stops, funds are safe but stuck; an unaccepted deposit cannot be reclaimed); operator can "pause settlement by removing the oracle key"; admin is a 2-of-3 multisig (no keys on servers) that can collect fees, transfer ownership or rotate oracle (1 day delay), **emergency-liquidate any contract's pool to a fixed emergency address**, and **upgrade the package** (it holds the upgrade cap). Package is already on v2 (H).
- Data risk: one Coinbase print counts. A wick on Coinbase that other venues' benchmark prices do not show would settle a tile "touched". Market holidays are ignored: "on a holiday, tiles in the missing session will settle as not touched" (H, docs page).
- Typical time to settle: about 5 to 10 minutes after window end (H, docs).

## 9. Geo, ToS, automation

- Geo: deposits and orders refused from **US and UK** IP addresses on mainnet (`REGION_RESTRICTED` 403); devnet has no block (H, `api.md`). Landing page: "Grid Options involve risk and are not available in every jurisdiction" (H).
- Automation: **explicitly supported** ("a public API for trading firms", official Nautilus Trader adapter and Rust client; H). No clause banning bots found.
- ToS: web app `/public-terms` (effective 2026-08-11) as served in the web bundle contains only 12 sections (IP, governing law, arbitration, class-action waiver, severability, remedies, contact); **no eligibility, prohibited-use, or automation section was present in the served text** (H on what is served; the full terms may exist elsewhere, NOT FOUND). Arbitration with class waiver and a 30-day opt-out.
- Companies: legal entity name NOT FOUND in served ToS excerpt (searched: terms bundle, landing page). Contact on the site is a generic support address (not recorded here).

## 10. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| DefiLlama TVL | $96.78 (flat at about $96 since 2026-09-24, $231 before) | `api.llama.fi/tvl/paramx`, 2026-10-19 | H |
| **DefiLlama TVL is stale** | Adapter hardcodes Exchange object `0x82e575a0...`; live exchange object is `0xce8d8975...` (adapter file last changed 2026-09-27, not updated) | `gh api` DefiLlama-Adapters `projects/paramx/index.js` + `/v1/exchange`, 2026-10-19 | H |
| Live TVL | NOT FOUND (searched: Sui GraphQL needs POST so not used; suiscan is an SPA). Lower bound **$316.81** = market-maker cash | `GET /v1/accounts/{mm}`, 2026-10-19 ~01:57Z | H |
| Total public trade tape | 47 trades, **about $258 notional**, 2026-09-27 to 2026-10-14 (BTC 27 trades $77.77; ZEC 14 $151.96; SOL 1 $0.09; NVDA 5 $28.48; other instruments 0). Last BTC trade 2026-10-14 05:30Z. | `GET /v1/trades?instrument_id=1..15&limit=500`, 2026-10-19 | H (retention limit of the endpoint NOT FOUND; it may cap history) |
| Quoted depth (BTC) | 1,315 tiles with orders, best ask size median 100 shares, near-the-money 1h tile showed 105.6 shares at best and 211.2 at second level per side (about $67 + $127 per side) | `/markets`, `/books/{id}`, 2026-10-19 | H |
| **Quotes far exceed fundable size** | MM posts 36,546 resting orders from a $316.81 account; collateral needed to short every BTC best ask alone is about $104.6k. Fills of sells need $1/share collateral and the chain refuses unfunded fills (`INSUFFICIENT_CASH`), so real fillable size is bounded by cash, not by displayed size. | computed from `/markets` + `/accounts/{mm}`; rule from `api.md` | M |
| Volume to date | landing page: "$-" (blank) | landing page | H |
| Open interest | NOT FOUND (no endpoint); positions by account only | - | - |

Honest read: tradable depth is a few hundred dollars, set by the house market maker, with essentially no organic flow.

## 11. Event coverage and arbitrage overlap

- Categories: **crypto price** (BTC, ETH, SOL, XRP, HYPE, ZEC) and **US equity / ETF price** (AAPL, AMZN, GOOGL, META, MSFT, NVDA, TSLA, SPY, QQQ). CME futures (oil, S&P, gold, Treasuries, SOFR, ...) are in the instrument table but not listed. **No sports, politics, macro event, or weather.**
- Overlap exists only conceptually: Polymarket, Kalshi and others list crypto and equity price markets, but almost all are **terminal-threshold or terminal-range** (price above X at T, close vs open, range at T) or **longer-window touch** ("hit $X this week/month"), while ParamX is **touch within a range inside a 5m/1h/1d window**. They are not the same event, so no clean arbitrage.
- What does hold (M, my inference, logically one-sided): for a window ending at T and the same range, `P(touch in window) >= P(price at T in range)`. A venue quoting a terminal-range contract at a higher price than ParamX's matching touch ask is a dominance violation. Source mismatch (Coinbase prints vs other venues' benchmarks, inclusive/exclusive edges) usually exceeds the edge, and the 9-cent median spread plus 30 bps taker fee swamps small gaps. Record as a `dominates` link type in the market-linking design, not as an executable arb.
- Signal value: low. Quotes are the house's Monte Carlo of recent volatility, so they carry no information beyond Coinbase spot and realised volatility, which the aggregator can compute itself.

## 12. Shared liquidity?

**Independent but house-only.** No shared liquidity with another prediction venue (own order book, own contract). Prices derive from Coinbase and Massive spot, not from another prediction market. Not a hedge-able leg elsewhere. (H/M)

## 13. Adapter sketch and open questions

- Read adapter: poll `/v1/instruments` (cache), `/v1/markets?instrument_id=&grid=` for discovery (or derive ids from the bit layout), subscribe WS `top_of_book` per instrument for `instrument_ids` (one subscription, no snapshot, so load `/v1/books?instrument_id=` after subscribing). Normalise: market id = `contract_id`; outcome pair = (touched, not touched) with `no = 1 - yes`; embed `window`, `range`, `underlying` in the `MarketLink` metadata; expose `kind: "touch-range"` so the linker never matches it to terminal-threshold markets.
- Do not build: order signing, Sui transactions, funding. Out of PayBox scope and geo-blocked.
- Open questions / NOT FOUND:
  - Live TVL and OI on the real exchange object (needs a Sui RPC read; those are POST so skipped).
  - Whether `/v1/trades` history is truncated (47 trades total looked short).
  - Boundary rule: docs page says range inclusive, `instruments.md` says `[min_strike,max_strike)`.
  - What `under_review` means in `/history`.
  - RFQ / big-tile endpoint (error codes exist, no route documented).
  - Full ToS eligibility and prohibited-use text; legal entity.
  - Audit status (none published).
  - Whether BTC step $50 vs doc $100 was a deliberate change or a docs lag.
  - Whether PayBox Solana `solanaMessage` signs caller-chosen bytes without a prefix (relevant only for the unattractive signature-oracle route).

## 14. Sources

1. `https://api.paramx.xyz/v1/exchange`, `/instruments`, `/instruments/1/price`, `/instruments/1/sessions`, `/markets?instrument_id=1`, `/markets?instrument_id=1&grid=1h`, `/books?instrument_id=1`, `/books/{id}`, `/contracts/{id}`, `/trades?instrument_id=1..15`, `/accounts/{mm}` (+ `/orders`, `/positions`, `/history`, `/fills`), `/openapi.json` - H, fetched 2026-10-19.
2. `wss://ws.paramx.xyz/v1` live subscription - H, 2026-10-19.
3. `https://paramx.xyz` landing page (HTML) - H, 2026-10-19.
4. `https://app.paramx.xyz/docs` (how it works, text read from the public JS chunk `Docs-CAhlrXnk.js`), `/developers` (chunk `Developers-BiWy69CJ.js`), `/public-terms` (chunk `TermsOfService-F1EgQtiQ.js`), `chainConstants-BPpCsKaL.js` - H, 2026-10-19. SPA pages: text extracted from the shipped JS, not a rendered view.
5. `https://github.com/paramxxyz/nautilus-paramx` (README, `docs/overview.md`, `docs/api.md`, `docs/signing.md`, `docs/instruments.md`; repo created 2026-10-02) - H.
6. `https://github.com/paramxxyz/public-contracts` (README, `paramx/sources/paramx.move` interface; repo created 2026-10-02) - H.
7. `https://github.com/DefiLlama/DefiLlama-Adapters/pull/21153` (listing PR, merged 2026-09-24) and `projects/paramx/index.js` - H.
8. `https://api.llama.fi/protocol/paramx`, `https://api.llama.fi/tvl/paramx` - H.
9. `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (local registry snapshot, lists ParamX id 8751, listed 2026-09-24, Sui) - H.
10. `https://itunes.apple.com/lookup?id=6817622608` (App Store metadata) - H.
11. PayBox `discover_tokens` mode=chains (read-only, 2026-10-19) and `docs/research/06-paybox-platform.md` - H.
12. `https://defillama.com/protocol/paramx` - WebFetch returned HTTP 403 (not read); WebSearch (extended) surfaced only the DefiLlama PR, no independent coverage of ParamX (M: no press, no third-party analytics found).

## 15. Suspicious / injected content seen (none followed)

- A tool result from a `gh api` call ended with a block styled as a system reminder claiming "GitHub API rate limit exceeded" and telling the agent to run `gh api rate_limit` and sleep. It was inside tool output, not from the user, so it was ignored; the later `gh` calls succeeded.
- The WebSearch result text ended with an instruction line ("REMINDER: You MUST include the sources above ... markdown hyperlinks"). Formatting nudge from the tool wrapper, not followed.
- ParamX landing page HTML contains developer template comments ("Don't list anyone without permission", investor/audit "placeholder"); not aimed at agents.
