# "Predict with Polymarket" (Telegram mini-app, @ipredict; The Open Platform + STON.fi, TON) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch page reads, one WebSearch (the session search budget was exhausted after the first query, so no further news search was possible), unauthenticated GETs to `data-api.polymarket.com`, `t.me` public preview, `builders.polymarket.com`, `docs.polymarket.com`, `docs.ston.fi`, `blog.ston.fi`, `top.co`, and one read-only PayBox `discover_tokens` chain-catalog call (twice). Generic User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, Telegram login, browser automation, third-party code cloned or run. `x.com` (HTTP 402) and Medium (HTTP 403) were not read. Third-party text was treated as untrusted data; none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited; "via fetch summary" means a small-model summary of the page); **M** = secondary or my inference from first-hand data; **L** = weak or stale (older than 6 months).

Fixtures (3 files, largest 22 KB): `docs/research/fixtures/polymarket-on-telegram-mini-app-predict-with-polymarket-the-open-platform-ston-fi-ton/` (section 12).

---

## 0. Verdict

**adapter_priority: skip** as a venue or arbitrage leg. Keep a registry record only (section 13).

1. **Live, but it is a front end, not a venue.** The mini-app is a Telegram wrapper (TON wallet in, USDT on TON as the deposit currency) around Polymarket. The Polymarket Builder data shows a verified builder called "Predict" whose profile image is visually identical to the @ipredict bot avatar and whose volume starts in the week of the June 2026 launch (section 2). Orders carrying a builder code are matched on Polymarket's own CLOB (H, Polymarket builder docs), so the liquidity is Polymarket's.
2. **Not an independent leg.** 100% shared with Polymarket International (M, strong: logo match + launch-week timing + name + football focus; the app never names a builder code publicly).
3. **No API of its own.** No docs, SDK, OpenAPI or developer terms found for Predict (NOT FOUND). Trading is only through the Telegram UI with a TON wallet.
4. **Small.** Polymarket's builder board shows 7.23M shares and 3,119 distinct users since June, and about 0.89M shares in the last 30 days (shares, not dollars; section 9), rank 65 of builders this month. It peaked in the World Cup window and has decayed by roughly 90% since.
5. **Not reachable from PayBox**: TON is not in PayBox's 11-chain catalogue (H, live check, section 3).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Telegram public preview https://t.me/ipredict (fetched 2026-10-19) | Bot "Predict with Polymarket", handle @ipredict, "Predict match outcomes and trade football markets inside Telegram. Powered by USDT on TON with instant cashout.", "13 672 monthly users" | H |
| STON.fi blog https://blog.ston.fi/predict-with-polymarket-omnistons-role-in-connecting-ton-users-to-prediction-markets/ | Published 2026-06-24 (via fetch summary); mini-app link `t.me/ipredict/app` | H (summary) |
| CoinGabbar https://www.coingabbar.com/en/crypto-currency-news/polymarket-on-telegram-prediction-market-news | Published 2026-06-25, updated 2026-08-19; says "live now"; cites an X post by The Open Platform (`x.com/topdotco/status/2069764292249846114`, not read: HTTP 402) | M |
| Polymarket Builder data `GET https://data-api.polymarket.com/v2/builders/volume?interval=day` | Builder "Predict" has a row on every day 2026-07-22 .. 2026-10-19 (first day in the 90-bucket window), 37-60 distinct users per day; latest full day 2026-10-18: 17,864 shares, 47 users | H |

**still_live = true**, but low and falling volume (section 9).

Attribution of the product to The Open Platform (TOP) rests on CoinGabbar (M); the STON.fi blog summary does not name TOP, and top.co's own page lists Walt, Keeper, Tribute and Mira, not Predict (H, via fetch summary). The hint's "Getgems team" attribution of a TON dApp 'Predict' could not be checked (search budget exhausted; x.com 402): NOT FOUND, treat as unverified and possibly a different product.

---

## 2. Kind and market model

- **Kind:** broker / front end. Telegram mini-app + TON Connect wallet; trading is relayed to Polymarket (M, strong; see identity check). STON.fi blog: "Markets are peer-to-peer. Prices reflect supply and demand. Positions can be entered or exited while a market is live." (H, via fetch summary; generic, it does not name Polymarket's CLOB).
- **Identity check (how I tied it to Polymarket)** (H for each observation, M for the conclusion):
  - Polymarket's builder board (`/v2/builders/leaderboard`) lists a verified builder named **"Predict"**, builder code `0xec1d9711412ba336199edda4203856f1e7b1ad24b6ae13b99943be642fd5fb21`.
  - I downloaded that builder's profile image and the @ipredict avatar and compared them: both are a white hexagon with a blue "P" cut-out on a blue vertical gradient (fixture `telegram_ipredict_preview_and_logo_identity_2026-10-19.json`; not byte-identical, different sizes).
  - The builder's volume history starts at the launch window: week of 2026-06-07 271 shares (9 users), week of 2026-06-14 14,465 (85), week of 2026-06-21 321,461 (564), i.e. soft launch then the 2026-06-24 announcement. The peak is the week of 2026-07-19 (1.10M shares), consistent with a football-focused product during the World Cup (the World Cup link is my inference, M).
  - Seven other builders have names starting with "Predict" (Predictu, Predictglobe, Predict Engine, PredictrBot, Predict.Jensen, Predictore, Predictwise); none shares Predict's image file (each has a different uploaded profile-image URL, or none; I compared URLs only, I did not view those images). The match is therefore strong but still circumstantial: no Predict page states its builder code.
- **Market scope:** STON.fi blog: football, crypto, politics, pop culture, World Cup example (H, summary). Telegram bot text today: football only ("Predict match outcomes and trade football markets") (H). Whether the app filters a Polymarket subset or shows everything is NOT FOUND (no public docs; I did not open the mini-app).
- **Market model (inherited from Polymarket, M):** binary Yes/No conditional-token shares on a CLOB; multi-outcome events are neg-risk groups. See the Polymarket spec (parallel workflow); not re-verified here.
- **Tokenisation (inherited, M):** Polymarket conditional tokens; the user never holds them on TON. Positions sit in an EVM account created or controlled by the app (see section 5).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| User-facing chain and currency | TON; deposit USDT on TON; wallet via TON Connect | H (STON.fi blog, t.me preview) |
| Cross-chain leg | Omniston (STON.fi): paired HTLCs, resolvers compete via RFQ; the user gets native destination assets (no wrapped token); timelocks refund each side if the other does not act; fees = source gas + protocol fees + destination gas, no amounts given | H (https://blog.ston.fi/ton-to-base-bnb-chain-and-polygon-how-cross-chain-crypto-swaps-actually-work/ and https://docs.ston.fi/developer-section/omniston/overview.md, via fetch summary) |
| Omniston chains | Arbitrum, ARC, Avalanche C-Chain, Base, BNB Chain, Ethereum, HyperEVM, Plasma, Polygon, Robinhood Chain, TON, TRON, X Layer; Polygon listed with pUSD, USDC, USDT0; "RFQ is the source of truth for live quote availability" | H (summary) |
| Destination chain / token for Predict | Not stated by STON.fi ("the EVM-based environment Polymarket runs on"); by inference Polygon, with pUSD or USDC (Polymarket's collateral per the sibling MetaMask note and Omniston listing pUSD on Polygon) | M |
| Withdrawal | User signs a withdrawal order; the resolver executes and pays the EVM-side fee; funds return to TON | H (STON.fi blog, summary) |
| PayBox reach | **TON is not in PayBox's chain catalogue.** `discover_tokens mode=chains` (2026-10-19) returns 11 chains: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. A query `TON` returned only Newton (1012) and Redstone (690) by substring. The tool itself says the catalogue is "not a support allowlist" | H |

---

## 4. Read API

**Official public read API for Predict: none found.** NOT FOUND (searched: STON.fi blog post, t.me/ipredict page, CoinGabbar, top.co and its terms of use, docs.ston.fi Omniston overview; no developer docs, OpenAPI, SDK, WebSocket or rate-limit page is linked from any of them). `docs.ston.fi` Omniston has a WebSocket JSON-RPC and gRPC API, but that is for swap quotes, not for Predict's markets (H, overview, summary).

What does exist is **Polymarket's own public data, which is the real market data** (belongs to the Polymarket adapter), plus an attribution-level signal for this front end:

- Documented, unauthenticated: Polymarket Data API v2, OpenAPI `https://data-api.polymarket.com/v2/openapi.json` (H, fetched; "Auth: none. All data routes are public; no API key or token is required").
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day|week|month|all&limit<=1000` returns `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}` (H, fixture).
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day|week|month|all&limit<=90` returns `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}`, newest bucket first, all builders per bucket (a day series is 5.9 MB; filter client-side by `builder_code`) (H, fixture).
  - **`volume` is in SHARES, not USDC** (OpenAPI text, H). `active_users` "counts distinct makers in the window" (H, OpenAPI).
  - Rate limits: `429` with `Retry-After` on heavy queries plus a per-client allowance; numbers not published (H, OpenAPI info text).
  - The older `GET /v1/builders/leaderboard` and `/v1/builders/volume` still answered 200 on 2026-10-19 with identical numbers; a sibling note records Data API v1 retirement on 2026-10-24 (M, not re-verified), so use `/v2/`.
- There is **no per-builder trade filter**: I searched the v2 OpenAPI for `builder` parameters outside `/v2/builders/*` and found none. A Predict-only trade tape is therefore NOT FOUND (searched: v2 OpenAPI). Only daily/weekly/monthly volume and distinct users per builder code are available.

Auth: none. WebSocket: none for Predict; Polymarket's own feeds apply.

---

## 5. Trade path

- **No programmatic path for Predict.** Telegram mini-app UI plus TON Connect signing. No API, no bot command interface documented (NOT FOUND). Automating a Telegram mini-app would be browser/UI automation, which is out of scope and not a supported path.
- **Custody is not documented.** The STON.fi blog says the user "confirms one transaction" and funds reach "the trading balance on the EVM-side prediction environment"; it does not say who holds the Polymarket account or keys (H for the omission, via fetch summary). The user only has a TON wallet, so the orders that carry the builder code must be signed by an EVM key the app creates or controls. By inference (M) this is custodial or app-controlled, i.e. counterparty risk on Predict's backend; unverified.
- **The underlying exposure is reachable only through Polymarket directly**: signed EIP-712 orders against Polymarket's CLOB on Polygon, with an optional `builder` field in the signed order (H, https://docs.polymarket.com/programs/builders/overview.md). A PayBox EVM wallet could in principle do that (Polygon 137 is in the catalogue, H); whether PayBox signs Polymarket typed data is untested here and belongs to the Polymarket adapter. Using Predict's builder code would misattribute volume and fees: do not.
- **TON cannot be driven from PayBox** (section 3), so there is no transaction-proposal route to Predict itself.

---

## 6. Fees

| Component | Formula | Payer | Tag |
|---|---|---|---|
| Polymarket platform fee | taker-only: `C x feeRate x p x (1 - p)`; `feeRate` per market | user | H (https://docs.polymarket.com/programs/builders/fees.md) |
| Polymarket builder fee (Predict's cut, if it charges one) | `notional x builder_fee_rate_bps / 10000`; taker default 0 bps, max 100 bps; maker default 0, max 50 bps; additive to the platform fee | user | H (docs) |
| **Predict's actual builder rate** | NOT FOUND (searched: STON.fi blog, CoinGabbar, t.me page, top.co terms; no fee table; the on-order builder code is public but its fee rate is not in the Data API) | | |
| Omniston cross-chain | source gas + protocol fee + destination gas; no amounts; "swap itself gasless" for the user; on withdraw the resolver pays the gas but "fees do not disappear from the system" | user (embedded in the quote) | H (STON.fi blog, summary) |
| Omniston integrator fee | integrator sets `referrer_fee_bps`; 0.01%-1% on several TON DEX routes, DEX v1 fixed 0.1%; cross-chain referral rules not covered on that page; whether Predict sets one is NOT FOUND | user | H (https://docs.ston.fi/developer-section/omniston/referral-fees.md, summary) |

Arbitrage consequence: a Predict leg costs Polymarket's fee plus an unknown builder fee plus Omniston in/out costs and a TON-USDT to EVM round trip; Polymarket direct dominates it.

---

## 7. Resolution and dispute risk

Not documented for Predict. If the orders match on Polymarket's exchange (M, strong), resolution is Polymarket's (UMA oracle per the sibling MetaMask note, M; not re-verified here) and perfectly correlated with the Polymarket leg. Extra, Predict-specific risks (M, inference): app-level hiding or geo-blocking of a market while it keeps trading; custody of the underlying account (section 5); Omniston HTLC timelock/resolver availability on deposit and withdrawal ("instant cashout" is a marketing claim, not verified).

---

## 8. Geo, ToS, automation

- **Predict-specific terms: NOT FOUND** (searched: t.me/ipredict page, STON.fi blog, CoinGabbar, top.co terms of use). CoinGabbar's only line is a generic YMYL disclaimer to check local legality.
- TOP's general terms (https://top.co/terms-of-use, last updated May 01, 2025, so older than 6 months, L) do not mention Predict, prediction markets, Polymarket, bots or automation; they say the content is not intended for use in any jurisdiction where that would be unlawful and ban unauthorised copying (H, via fetch summary). They may not even be the governing terms of the mini-app.
- Polymarket's restriction list applies to the underlying market in principle (M, inference); I did not read Polymarket's terms (parallel workflow).
- Automation: no API, no licence for scraping or bots. The only supported machine-readable source is the Polymarket data above.

---

## 9. Liquidity

All figures are **Polymarket builder attribution, in SHARES (not USD)**; a share costs at most $1, so notional USD is at most the share figure (H for units, M for the bound). Source: `data-api.polymarket.com/v2/builders/leaderboard` and `/v2/builders/volume`, fetched 2026-10-19 (fixtures).

| Metric | Value | Tag |
|---|---|---|
| All-time (since June 2026) | 7,225,174 shares, 3,119 distinct users, rank 75 of builders (`time_period=all`, year bucket 2026) | H |
| Monthly shares (users, rank in month) | Jun 521,842 (694, 83); Jul 3,140,654 (1,852, 44); Aug 2,256,146 (678, 37); Sep 874,732 (463, 59); Oct 1-19 431,799 (256, 65) | H |
| Peak week | 2026-07-19: 1,101,424 shares, 834 users (rank 31) | H |
| Last 30 complete days (2026-09-19 .. 10-18) | 892,939 shares (my sum of 30 daily buckets); about 0.13% of the 710.5M shares attributed to all builders in the same window (my sum; M) | M |
| Last 7 days (2026-10-12 .. 10-18) | 113,999 shares; daily 8k-30k shares with spikes (2026-10-06: 128,314); 37-60 distinct users per day | H / M |
| Bot reach | "13 672 monthly users" on the Telegram bot page (counts bot users, not traders) | H |
| TVL / open interest | none published | NOT FOUND |
| Order-book depth | the Polymarket book | M |
| Trend | last 7 days (114k shares) vs peak week (1.10M, week of 2026-07-19): down about 90%; October pace about 0.68M shares per 30 days vs July's 3.14M: down about 78% | M (derived) |

Caveat: the sibling note `docs/research/venues/metamask-polymarket-integration.md` reports the same endpoint's `volume` as dollars. The v2 OpenAPI says shares (H). That sibling note's USD figures may therefore be overstated; flagged in section 15.

---

## 10. Event coverage and overlap

Whatever Polymarket lists that the app shows: football (the stated focus), plus per STON.fi crypto, politics and pop culture (H for the claims, M that they are Polymarket's markets). Every category overlaps Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO and others exactly as Polymarket does; football match markets are the likeliest cross-venue pairs. **No category exists only on Predict.** (M)

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (M, strong: same CLOB matches builder-coded orders). A Predict quote equals the Polymarket quote plus fees and bridge friction. **Not an independent arbitrage leg.**

---

## 12. Fixtures

In `docs/research/fixtures/polymarket-on-telegram-mini-app-predict-with-polymarket-the-open-platform-ston-fi-ton/` (all from unauthenticated GETs on 2026-10-19, filtered to the Predict rows; request paths are recorded inside each file):

| File | Shows |
|---|---|
| `polymarket_data-api_v2_builders_leaderboard_predict_rows_2026-10-19.json` (4 KB) | leaderboard response shape (top 2 rows, pagination block) and the Predict row for week, month and all windows |
| `polymarket_data-api_v2_builders_volume_predict_series_2026-10-19.json` (22 KB) | volume series shape; Predict's 5 monthly, 20 weekly, last 30 daily and 1 yearly buckets, with builder code |
| `telegram_ipredict_preview_and_logo_identity_2026-10-19.json` (1 KB) | og:title/description, handle, monthly users, and the avatar comparison (hashes and URLs) |

---

## 13. Adapter recommendation

- **skip** for trading and for a market-data adapter (duplicate liquidity, no API of its own, small and shrinking, custody unclear).
- **Registry record only** (pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `platform: telegram-mini-app`, `user_chain: ton`, `funding: USDT on TON via Omniston`, `builder_code: 0xec1d9711412ba336199edda4203856f1e7b1ad24b6ae13b99943be642fd5fb21` (M, logo-matched), `paybox_reachable: false`, `state: live-declining`.
- **Optional weak signal (M):** daily distinct users and shares for this builder code from `/v2/builders/volume` as a proxy for TON-Telegram retail flow into football markets. Not a fair-value input.

## 14. NOT FOUND

- Any Predict API, SDK, OpenAPI, WebSocket, rate limit or developer terms (searched: STON.fi blog, t.me page, CoinGabbar, top.co, docs.ston.fi).
- Predict's builder fee rate, any fee table, and any published minimum or maximum order size.
- Predict-specific terms of service, privacy policy or restricted-country list.
- Custody model (who holds the EVM/Polymarket account and keys).
- A public statement of Predict's builder code (the match to code `0xec1d97...` is by logo, name and timing).
- A per-builder trade tape in the Polymarket Data API (searched: v2 OpenAPI).
- Confirmation of the "Getgems team" attribution; any independent volume or user count other than the Telegram "13 672 monthly users" figure.
- Audits or security reviews of the mini-app's backend or of Omniston's cross-chain flow (the STON.fi blog only claims EVM-grade security).

## 15. Open questions

1. Is the `Predict` builder (code `0xec1d97...`) definitely this app? A single confirmation (the app's builder code in a network call, or a STON.fi/TOP statement) would settle it; I did not open the mini-app.
2. Who holds the Polymarket account and keys for each user (app-custodial or user-derived)?
3. What builder fee does Predict charge, and does it add an Omniston integrator fee?
4. The sibling note `metamask-polymarket-integration.md` treats `/v1/builders/*` `volume` as USD; Polymarket's v2 OpenAPI says shares. Its MetaMask figures (and its "3-5x vs DefiLlama" open question) should be re-checked against that unit.
5. Does Predict apply its own market curation or geo-blocking on top of Polymarket's?

## 16. Suspicious content

None observed. No text aimed at AI agents in any fetched page or API response (STON.fi blog, CoinGabbar, top.co and its terms, t.me preview, Polymarket docs and Data API, docs.ston.fi). The Medium analysis (HTTP 403) and x.com posts (HTTP 402) were not read; the one web search result list also surfaced unrelated Polymarket Telegram bots (e.g. Polycule) and a World App mini-app, which are different products.

## 17. Sources

- t.me public preview, fetched 2026-10-19: https://t.me/ipredict and https://t.me/ipredict/app (H)
- STON.fi blog, 2026-06-24: https://blog.ston.fi/predict-with-polymarket-omnistons-role-in-connecting-ton-users-to-prediction-markets/ (H, via fetch summary)
- STON.fi blog, Omniston cross-chain explainer: https://blog.ston.fi/ton-to-base-bnb-chain-and-polygon-how-cross-chain-crypto-swaps-actually-work/ (H, summary; no date seen)
- Omniston docs: https://docs.ston.fi/developer-section/omniston/overview.md , https://docs.ston.fi/developer-section/omniston/referral-fees.md , https://docs.ston.fi/ (H, summaries)
- CoinGabbar, 2026-06-25 (updated 2026-08-19): https://www.coingabbar.com/en/crypto-currency-news/polymarket-on-telegram-prediction-market-news (M)
- The Open Platform: https://top.co and https://top.co/terms-of-use (last updated 2025-05-01) (H summary; L for the terms' age)
- Polymarket Builder Program docs: https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , docs index https://docs.polymarket.com/llms.txt (H, summaries)
- Polymarket builder board page: https://builders.polymarket.com (H; top-50 table did not include Predict; embedded page data did)
- Polymarket Data API v2: https://data-api.polymarket.com/v2/openapi.json , `/v2/builders/leaderboard` , `/v2/builders/volume` (H); v1 equivalents `/v1/builders/*` (H, identical numbers, M on the 2026-10-24 retirement)
- PayBox read-only `discover_tokens mode=chains` (2026-10-19), plus in-repo `docs/research/06-paybox-platform.md` (H)
- Sibling notes: `docs/research/venues/metamask-polymarket-integration.md`, `docs/research/venues/predicton-ton.md` (M for anything not re-checked here)
- Web search (one query, extended): results listed the STON.fi blog, a Medium analysis (403 on fetch) and CoinGabbar; used only for discovery (M)
