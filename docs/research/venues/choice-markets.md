# Choice Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, public unauthenticated GETs (choice.markets, app.choice.markets, docs.choice.markets, five `app.choice.markets/api/v1` GET endpoints), reading the two public static JS bundles. No account, login, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. Third-party text was treated as untrusted data.

Research limits: the shared WebSearch budget was exhausted before I could run my one search, so discovery relies on the task hint (predictionindex.xyz ecosystem entry), the venue's own site, docs and app. No independent press, audit, TVL or legal coverage was found or sought. `x.com/choice_markets` returned HTTP 402 to WebFetch (X paywall); I recorded it and stopped (no payment).

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred from first-hand data; **L** = weak/stale. Nothing below is older than 6 months unless stated.

Fixtures (<= 50 KB): `docs/research/fixtures/choice-markets/` (section 12).

---

## 0. Bottom line

1. **Live (H).** `choice.markets` (marketing landing page, CRA build), `app.choice.markets` (trading SPA) and `docs.choice.markets` (GitBook) all return HTTP 200 on 2026-10-19. The API serves 500 `LIVE` markets, the newest I saw created 2026-08/09 (H).
2. **Kind: onchain-other, but the trade path is a centralised backend.** Each market is its own LMSR contract on **Base (chain 8453)** with **USDC** collateral (H: `/config/contracts`, the ABI embedded in the app bundle). The contract's trade function is `executeTradeViaFactory`, i.e. trades are executed by a factory/operator after the app backend receives `POST /api/v1/orders/create` from a logged-in session (login is email, Google or X OAuth, per the app bundle and docs). Users do not sign orders with their own wallet (M, inferred from bundle; no signing code found).
3. **Public read API exists but is undocumented.** `https://app.choice.markets/api/v1/...` serves markets, prices, kline and contract config without authentication (H). There is no official developer/API documentation (NOT FOUND: docs `llms.txt` lists 19 pages, none about an API; no GitHub org found, but GitHub was not searched, see not_found).
4. **Thin real activity.** Of the first 100 listed markets, 84 show `holders = 0`, 50 show `tx_count = 0`. The headline `total_volume` field is not trustworthy as organic volume (section 9). The one kline I pulled shows about 10 USDC total traded on the top-"volume" market (H).
5. **Overlaps with covered venues in topic only** (Iran, BTC/ETH/SOL price, Ballon d'Or, F1, Israel PM, Bolsonaro, CLARITY Act). No evidence of shared liquidity; it is its own LMSR pool (M). Question wording and resolution rules are bespoke and weaker, so matches need strict rule comparison.
6. **adapter_priority = P2** (signal/price-feed only, thin, custodial-login trading, undocumented API that can change without notice).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://choice.markets/` | 200, `<title>CHOICE</title>`, CRA shell; bundle text "The AI-Powered Social Layer of Prediction Markets - Price the choice as it breaks" | H |
| `GET https://app.choice.markets/` | 200, title "Choice Markets - Turn Social Discourse into Tradable Prediction Markets" | H |
| `GET https://docs.choice.markets/overview.md` and 12 other doc pages | 200 | H |
| `GET /api/v1/events/list` | 200, `total_count: 500`, all 100 inspected rows `status: LIVE`; newest `created_at` seen 2026-08-29 | H |
| `https://api.choice.markets/` | 502 Bad Gateway from nginx (host exists, backend down or not the real API host; the app uses `app.choice.markets/api/v1`) | H |
| predictionindex.xyz/ecosystem | "Choice Markets: chain tbd, status live, binary, mechanism clob + lmsr(amm), volume n/a" | H (that the listing says it; the listing itself is a directory) |
| Launch date | NOT FOUND (searched: docs, landing page, app bundle). Earliest market `created_at` I saw is 2026-08-29 in the first-page sample; kline for that market starts the same day | M |

Verdict: **still_live = true**, young product (months, not years).

---

## 2. Kind and market model

- **Product framing (H, docs overview):** "AI-powered, social-native prediction market" where markets come from social discourse (X) and user-generated content, "list-first, review-later" moderation. Creators earn 70% of the platform fee on their market.
- **Mechanism (H docs, M for how it's wired):** docs.choice.markets "Hybrid Liquidity Engine": "order books for high-traffic markets, LMSR for long-tail markets". The on-chain ABI in the app bundle is **LMSR only** (`qYes`, `qNo`, `liquidityParam`, `previewBuy`, `previewSell`, `getYesPrice`, `getNoPrice`, `getMaxMarketMakerLoss`). The UI supports "Market" and "Limit" orders (docs web-desktop page). Whether limit orders rest in an off-chain book matched by the backend, or are just conditional LMSR orders, is NOT FOUND. No order-book/depth endpoint appeared in the bundle's API client (only `events/list`, `events/detail`, `market/kline`, balances), so treat price as an LMSR marginal price, not a book.
- **Outcome types (H, API):** binary (`outcomes: ["Yes","No"]`, 77 of first 100) and **categorical** with 3 to 13 outcomes (23 of 100, e.g. "Ballon d'Or Winner 2026", "MLB World Series Champion 2026"). Group markets exist (`group_id`, `/events/group/{id}`, `/events/create-group`). No scalar markets seen (range-style questions are expressed as separate or categorical markets).
- **Prices (H):** `current_prices[]` and `marginal_prices[]` are decimal strings per outcome, summing to ~1 (e.g. `["0.615759906","0.3842400939"]`). Prices in some old rows look rounded to 2dp ("0.68", "0.3199999999"), suggesting seeded or admin-set initial odds (`initial_odds` field).
- **Tokenisation (M):** per market contract holds balances via `userYesBalance(user)` / `userNoBalance(user)`, `totalYesSupply`, `totalNoSupply`, `outcomeYes`; the ABI has no `transfer` or ERC-1155 interface, so positions look like internal accounting, not transferable tokens. Only a binary YES/NO ABI is embedded, so how categorical markets are built on-chain is NOT FOUND (probably one binary contract per outcome or a different contract; the `contract_address` is per event in the list).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Base mainnet, chain id 8453 | H (`/config/contracts` returns `"chain_id":"8453"`) |
| Collateral | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (the standard Base native USDC address) | H |
| Factory | `0x2F7C45EF233D1CcB7Be00f4B2763D0e6926D494D` | H (as served by API); contract code/verification not checked on-chain |
| Per-market contract | `contract_address` field in each event, e.g. `0xf160de40633760bae090ec991572fab800360345` | H |
| Deposits/withdrawals | Docs: "Deposit Base Chain-based ETH/USDC from wallets like Binance or OKX into the choice.markets app"; withdraw "to the corresponding Base Chain wallet"; docs also say provide "your Choice wallet address" to claim rewards (so each user gets an app-managed address) | H |
| Min market-creation stake | UI string: "Min: 0.1 USDC, recommended: 100-10000 USDC" (initial buy when creating) | H |
| predictionindex "chain tbd" | Resolved: Base | H |

Other chains: NOT FOUND (app bundle includes a Sepolia testnet chain def and Base only).

---

## 4. Read API

Status: **`unofficial-only`** in the sense that it is public and unauthenticated but undocumented and discovered from the SPA bundle. No API reference, OpenAPI, SDK, rate-limit statement or ToS clause about API use was found (docs `llms.txt` has 19 pages, none on an API).

- Base URL: `https://app.choice.markets/api/v1` (H, from the app bundle's axios client `baseURL`, 10 s timeout).
- Response envelope: `{"code":"0","data":...,"msg":"success"}` (note `code` is the string `"0"` on most routes and the number `0` on the `agora` route).
- Auth: none needed for the five GETs I tried. Everything user-scoped (`/user/*`, `/orders/*`, `/events/my`, `/events/favorites`) uses the logged-in session; I did not call those.
- Rate limits / ws: NOT FOUND. No websocket was found for market data (the bundle's WebRTC strings relate to a bundled Agora voice SDK, not prices). The SPA polls kline every 15 to 60 s (H, bundle).
- A separate host `https://hf.choice.markets` ("high frequency" tab in the app header; HTML title CHOICE, 924 B shell) exists; not investigated, probably a separate short-duration product (L).

| Endpoint (GET) | Purpose | Verified |
|---|---|---|
| `/events/list?page_index=&page_size=` | Paged market list; `page_size=100` accepted (5 pages for 500). Fields: `event_code`, `contract_address`, `question`, `rules`, `deadline`, `category`, `status`, `outcomes[]`, `current_prices[]`, `marginal_prices[]`, `initial_odds[]`, `total_volume`, `holders`, `tx_count`, `winning_outcome`, `winner_outcome`, `group_id`, `creator_*` | H, fixture |
| `/events/detail?event_code=` | One market (same fields) | H (200, 1.9 KB) |
| `/market/kline?event_code=&period=` | OHLC per outcome + per-outcome `volume` and `tx_count` per bucket | H, fixture (no `period` given, returned 2 buckets) |
| `/config/contracts` | `chain_id`, `usdc`, `factory` | H, fixture |
| `/agora/getMarket?event_code=` | `new_marginal[]` (up to 14-slot array of marginal prices) + `updatedAt` (ms), used by the SPA for one featured event | H, fixture |
| `/events/priority`, `/events/group/{id}` | featured and group markets | seen in bundle, not called |
| `/events/{id}/balance`, `/user/positions`, `/user/transactions`, `/user/orders/{id}` | user-scoped | seen, not called |

On-chain alternative (H for ABI, not exercised): each market contract exposes `getYesPrice`, `getNoPrice`, `previewBuy`, `previewSell`, `qYes`, `qNo`, `liquidityParam`, `resolved`, `outcomeYes`, and emits `Trade`, `PriceUpdated`, `MarketResolved`, `MarketFinalized`, `Redeemed` events. An aggregator could read these via Base RPC, but needs the market list from the API (or the factory's events, ABI for the factory not captured).

Resolution data: `status` (LIVE seen; other status values NOT FOUND in a sample of 100 LIVE rows), `winning_outcome` / `winner_outcome` fields (null while live). Resolved-market listing filter parameters: NOT FOUND.

---

## 5. Trade path

- **Programmatic placement:** The SPA calls `POST /api/v1/orders/create` (payload shape not captured, deliberately not probed) with a login session (email-code login `POST /user/email/send-code` + `/user/email/login`, Google OAuth, X OAuth). Docs: "Login With X" (desktop extension) and "Login With Google" (mobile PWA at `m.choice.markets`). No API keys, no wallet-signature auth (no `signMessage`/`signTypedData` in the bundle) and no public trading API were found (H for absence in the bundle, M for conclusion).
- **Contract path:** `executeTradeViaFactory(...)` (params include `minOut`, `isYes`, `isBuy`, a user, and an order id guarded by `usedOrderIds`) is the on-chain trade function. The name and the `Ownable` + `factory` pattern indicate only the factory can call it, so a user wallet cannot trade directly against the market (M, not verified by simulating the call).
- **Via PayBox (EVM wallet on Base):** a PayBox Base wallet can **fund** an account (USDC transfer to the user's Choice deposit address; an app-managed "Choice wallet", docs) but cannot **place** orders by a transaction proposal or signed order, because order placement needs a Choice login session and the backend executes the trade. So `paybox_reachable = partial` (deposit/withdraw only; trading would need a logged-in browser session, which is out of scope and against our no-automation rules). Wallet type (custodial vs. embedded MPC) is NOT FOUND; "Choice wallet address" suggests the platform controls keys (M).

---

## 6. Fees

| Fee | Value | Tag |
|---|---|---|
| Platform fee | "1% fee on the winning side" (charged when value is realised) | H (docs fees-and-incentive-design, FAQ "1% fee on winning positions") |
| Creator share | 70% of the platform fee to the market creator, 30% to the platform | H (docs) |
| Trading spread | LMSR price impact from `liquidityParam`; no explicit trade fee in docs | M |
| On-chain | `executeTradeViaFactory` returns `(outputAmount, fee)` and the ABI has `feesSettled`, `settleFees`, `feeVault`, `FeesWithdrawn`, so there IS a fee computed per trade on-chain; docs do not explain it. Formula/rate NOT FOUND | H (ABI) / L (interpretation) |
| Gas | Paid by platform (user never submits a tx for trading, M); deposits/withdrawals are normal Base transfers | M |

For arbitrage maths, model the fee conservatively as 1% of winnings plus unknown per-trade fee until a `previewBuy`/`previewSell` comparison is done on-chain.

---

## 7. Resolution mechanism and dispute risk

- **Docs (H):** markets resolve directly if the outcome is clear; disputed or ambiguous outcomes route to an "AI-assisted adjudication" path ("Agent Jury": multiple agents gather evidence, debate, produce a verdict). Moderation is post-listing; an "Agent editorial team" removes or downranks rule-breaking markets. Docs "Resolution Design Principles" says markets "should" define question, outcomes, source and edge cases and that the docs should state evidence sources, dispute windows, jury triggers and cancellation conditions, but it does not state them (H, NOT FOUND for the concrete rules).
- **Per market (H):** each market carries free-text `rules` written by the creator (e.g. "resolves to No if no final resolution by the cutoff"); the create form has a `resolution_method` field and "Official Review" before listing (docs: "Typically 24h" in the app UI string).
- **On-chain (H ABI):** `resolved`, `finalizeMarket`, `outcomeYes`, `redeem`, `owner` / `transferOwnership`. Finalisation is an owner-only action (Ownable) so resolution is centralised and trust-based, no oracle or UMA-style dispute bond (M).
- **Risks:** operator discretion and AI adjudication, subjective UGC questions, "post-listing review" so ambiguous markets can be live, docs themselves list spam, manipulation, brigading and liquidity fragmentation as open challenges (H, "Risks and Product Challenges"). Dispute risk: high compared with Polymarket/Kalshi. An arbitrage leg here carries resolution-basis risk against a regulated or UMA-resolved counterpart.

---

## 8. Geo / ToS / automation

- Geo restrictions: NOT FOUND (searched: docs pages in `llms.txt`, app bundle strings, landing page). The app menu has "Terms of Use" and "Privacy Policy" links but I did not locate or read the target pages (the docs site does not host them). So no verified statement on US or other jurisdictions.
- Automation/ToS: NOT FOUND. Because API use is undocumented and trading requires an X/Google/email login, treat automated trading as not permitted until the ToS is read.
- Account model: login via X, Google or email code; one app-managed wallet per account (docs); KYC: none mentioned (L, absence of evidence).
- Regulatory posture: none stated; a UGC, crypto-collateralised, offshore-style venue (M).

---

## 9. Liquidity

| Metric | Value | Source/date | Tag |
|---|---|---|---|
| Markets live | 500 (`total_count`) | `/events/list`, 2026-10-19 | H |
| Sum of `total_volume` for first 100 rows | 21,151,843 (units unknown); max 1,093,318; median 192,550 | `/events/list?page_size=100`, 2026-10-19 | H (numbers) / L (meaning) |
| Real activity | first 100 rows: `holders=0` for 84, `1` for 13, `2` for 3; `tx_count=0` for 50, `2` for 25, max 63 | same | H |
| Kline cross-check | the #1 market by `total_volume` (1,093,318, holders 1, tx_count 1) shows a total of 9.999286 in per-outcome kline volume over 2 buckets, i.e. about 10 USDC | `/market/kline`, 2026-10-19 | H |
| Conclusion | `total_volume` looks like a seeded or scaled number (probably includes initial liquidity or 6-decimal raw units) and is NOT organic volume. Organic volume is on the order of tens to low hundreds of USDC per market, but I have not summed it | | M |
| TVL / OI | NOT FOUND (no endpoint). Could be computed on-chain from the USDC balance of each market contract | | - |
| Rewards/points programme | `/user/points`, `/user/leaderboard`, `/user/rebate`, invitations exist in the app, i.e. airdrop-style farming incentives, which may inflate small-size activity | bundle | H (existence) / M (effect) |

---

## 10. Event coverage and overlap

Categories in the API (first 100 rows): Politics 33, Other 18, Sports 17, Finance 15, Crypto 9, Tech 8 (H). Topics overlapping covered venues (likely arbitrage or signal matches, all unverified for rule equivalence):
- **Geopolitics/politics:** "Will the United States invade Iran before 2027?", "US and Iran permanent peace agreement by...", Israel PM / election questions, France 2027 presidential, Bolsonaro custody, Hamas disarm, CLARITY Act signed in 2026.
- **Crypto price:** "Will Bitcoin reach $90,000 before Oct 30, 2026?", ETH hit-price, "Will Solana hit $140 by Dec 31, 2026", "Will NVIDIA reach $264 in December 2026".
- **Sports/awards:** Ballon d'Or 2026 (two separate markets), F1 Drivers Champion, MLB World Series Champion 2026, UFC.
- **Corporate/macro:** Largest company by market cap at end of 2026, best AI model end of 2026, "Eurozone GDP Q3 2026 0.8%-1.1%", KOSPI all-time high.
- **Unique/long tail (no arbitrage, no counterpart):** celebrity, Banksy, Myspace relaunch, meme-coin questions.

Resolution wording is hand-written per market with different cutoffs (typically Dec 31 2026), so cross-venue matching must be done via the `rules` text and `deadline`, not title alone.

Shared liquidity: NOT FOUND any statement that Choice routes orders to or mirrors another venue (docs describe an own LMSR/order-book hybrid). Treat as an **independent but very thin** leg (M). Initial prices look seeded (`initial_odds` e.g. 0.62/0.38) and might be copied from other venues at creation time (L, speculation; not verified).

---

## 11. Adapter assessment

- **Priority: P2.** Reasons: (a) real volume is tiny, (b) the API is undocumented (can break), (c) trading requires a logged-in session with X/Google/email so we cannot trade through PayBox, (d) resolution is centralised/AI-adjudicated, (e) price quotes from an LMSR with unknown `liquidityParam` are not executable at size.
- **What is cheap and useful:** a read-only price/signal adapter. One call `GET /events/list?page_size=100&page_index=1..5` returns all 500 markets with prices, rules and deadlines (about 160 KB per page of 100). Poll every few minutes. Map `event_code` to market id, `outcomes[i]` to `current_prices[i]`, `deadline` to close time.
- **Optional on-chain depth:** call `previewBuy`/`previewSell` and read `liquidityParam` on a market contract through Base RPC to compute true executable price and the maximum loss; this would turn the signal into a sized quote (not done).
- **Upgrade to P1 if:** Choice publishes an API/ToS permitting automation, a wallet-signed order path appears, or organic volume is shown to be material.

---

## 12. Fixtures

All from unauthenticated GETs with `User-Agent: insurance-markets-research/0.1`, 2026-10-19:
- `docs/research/fixtures/choice-markets/events-list-6.json` - first 6 rows of `/events/list?page_size=100&page_index=1` (envelope kept, `data.list` truncated to 6; `total_count` 500, `total_page` 5) (13 KB)
- `docs/research/fixtures/choice-markets/config-contracts.json` - `/config/contracts` (162 B)
- `docs/research/fixtures/choice-markets/market-kline.json` - `/market/kline?event_code=zhg1u62mz3Pzd1E` (424 B)
- `docs/research/fixtures/choice-markets/agora-getMarket.json` - `/agora/getMarket?event_code=U2Ts7m4rJ6cbOWQ` (127 B)

## 13. Suspicious content

None found. The only AI-agent-directed text seen was the standard GitBook banner on each docs page ("For the complete documentation index, see llms.txt..."), which is benign navigation and was not treated as an instruction (used `llms.txt` only because it is a normal documentation index). Third-party hosted images in docs (GitBook files, Lark Suite) were not fetched.

## 14. Sources

- https://choice.markets/ and its bundle https://choice.markets/static/js/main.c2945641.js (H; links to app, X, Telegram)
- https://app.choice.markets/ and bundle https://app.choice.markets/assets/index-CkONnYoU.js (H; API client, market ABI, route list)
- https://docs.choice.markets/llms.txt, overview.md, how-choice-markets-works.md, hybrid-liquidity-engine.md, fees-and-incentive-design.md, resolution-design-principles.md, agent-systems.md, moderation-and-review.md, risks-and-product-challenges.md, faq.md, core-concepts.md, how-to-start/web-desktop.md, how-to-start/mobile.md, how-to-start/how-to-claim.md (all H, read 2026-10-19)
- https://app.choice.markets/api/v1/events/list, /events/detail, /market/kline, /config/contracts, /agora/getMarket (H, fetched 2026-10-19)
- https://predictionindex.xyz/ecosystem (H for the listing text; directory, secondary)
- https://x.com/choice_markets (WebFetch returned HTTP 402; not read, no payment attempted)
- https://api.choice.markets/ (502 Bad Gateway)
