# Olympus (olympusx.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, unauthenticated GETs to Olympus and Polymarket public hosts, `gh api` reads, one PayBox catalog search (discovery only). No account, sign-in, API key, wallet, signature, POST/PUT/DELETE or money-moving PayBox tool was used. Third-party pages and API text were treated as untrusted data and nothing in them was followed. WebSearch was unavailable (the session's search budget was used up), so there is no news or user-report corroboration; every claim comes from Olympus's own site and docs, Polymarket's docs and public hosts, or GitHub.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak, undated or self-reported marketing.

Fixtures (<= 50 KB each): `docs/research/fixtures/olympus-olympusx-app/` (section 10).

---

## 0. Bottom line

1. **Olympus is a front-end / broker terminal, not a venue.** It is a non-custodial-branded web terminal operated by RST Tech LLC that routes orders to Polymarket (copy trading, manual trading, bonds, LP rewards), to Polymarket Perps, to Polymarket Combos (RFQ), and to Dimes (a leverage layer that itself buys positions on Polymarket) (H: https://www.olympusx.app/llms.txt, https://www.olympusx.app/docs/12-api, https://dimes.fi).
2. **It shares liquidity with Polymarket, so it is NOT an independent arbitrage leg.** Market ids, token ids and prices are Polymarket's (`conditionId`, `clobTokenIds`); Olympus's own API tells you to look markets up on Polymarket Gamma (H: docs/12-api). Polymarket's builder leaderboard lists "Olympusx.app" as a builder (order flow carrying its builder code), rank 44 with $1.07M "1m Volume" on 2026-10-19 (H, https://builders.polymarket.com; window label ambiguous). That is a small slice of Polymarket's flow.
3. **Still live (2026-10-19).** Site, API health and docs all respond; ToS v2.0 dated 2026-08-02; sitemap lastmod 2026-10-11 (H, section 1).
4. **Olympus's API is a wallet-scoped trading API, not a market-data API.** There is no Olympus endpoint for markets, books, trades or resolution. The only reads are your own portfolio, a trade-status poll, and two ticket-gated "top wallets" endpoints (H: docs/12-api).
5. **adapter_priority = skip.** Duplicate liquidity, no market-data API, a custodial-style signing model (Olympus servers sign), extra fees of up to 0.75% on top of Polymarket's own, and asynchronous queued execution. For aggregation use Polymarket directly (covered by the parallel workflow). The only possible residual value is "who are the smart wallets Olympus ranks" as a signal, and Polymarket's own data API already exposes wallet leaderboards without a support ticket.

---

## 1. Is it still live? (2026)

| Thing | Evidence | Verdict | Tag |
|---|---|---|---|
| Marketing site | `https://olympusx.app/` -> 308 -> `https://www.olympusx.app/` 200 (Vercel, Next.js), 2026-10-19 | live; canonical host is `www` | H |
| API host | `GET https://api.olympusx.app/health` -> 200 `{"status":"ok","timestamp":"2026-10-19T04:07:32.752Z"}` | live | H |
| Docs | `https://www.olympusx.app/docs` 200; `llms.txt` and `llms-full.txt` (168 KB) served | live | H |
| Terms | "Version: 2.0, Last Updated: August 2, 2026" (RST Tech LLC) | maintained in 2026 | H |
| Sitemap | 616 URLs, newest `lastmod` 2026-10-11 | maintained | H |
| Docs API examples | timestamps 2026-05-09, 2026-08-18, 2026-09-14 | active through Sept 2026 | M |
| Polymarket builder leaderboard | lists "Olympusx.app" at rank 44, 2026-10-19 | order flow is flowing | H |
| Community CLI | `github.com/fciaf420/olympus-cli`, MIT, 1 star, created 2026-05-16, last push 2026-06-17 | small and not updated for 4 months | H |
| Usage claims | home-page bundle hardcodes "2K+ Active Traders", "$35M+ Volume Traded", "200K+ Trades Executed", "<1s Execution Speed"; "Top 20 builder on Polymarket" | self-reported, undated; the builder leaderboard now shows rank 44 | L |

Method note: the shared scratchpad had a filename collision early on (a `home.html` from another agent showed a different site). I discarded that, re-fetched into a private subdirectory, and verified key files by SHA-256 on re-fetch. Nothing in this note depends on the discarded file. NOT FOUND: any status page.

---

## 2. Kind and market model

- **Kind: broker-or-frontend** (confirmed). ToS section 3: "Olympus does not create, operate, control, resolve, or guarantee prediction markets or other third-party trading venues. RST Tech LLC is not a broker, exchange, market maker, clearinghouse, custodian, fiduciary, or counterparty to your trades." (H: https://www.olympusx.app/terms).
- **Prediction markets: Polymarket CLOB**, binary and multi-outcome (Polymarket categorical events via neg-risk), order book, outcome = ERC-1155-style conditional token identified by a `tokenId` from Polymarket's `clobTokenIds` (H: docs/12-api, docs/09-market-pages "Multi-Outcome Events"). Olympus only submits to markets with `enableOrderBook=true` and `acceptingOrders` (H: docs/12-api).
- **Order types in the UI:** market buy/sell (best ask/bid), limit buy/sell with expiry, stop-loss / take-profit triggers (H: docs/09-market-pages). The Trading API exposes only a subset (section 4).
- **Product modules (all wrappers):**
  - Copy trading: mirrors a followed wallet's Polymarket trades into your trading wallet "within the same second (0-second delay) when conditions allow" (L, vendor claim, docs/04). Detection mechanism NOT FOUND (searched llms-full for websocket, mempool, polling).
  - Bonds / Autobond: ranks Polymarket outcomes priced >= 97% (H: home page, docs/18-bonds).
  - LP rewards: places maker orders on Polymarket reward markets (H: docs/16-lp-rewards).
  - Combos: multi-leg parlays, "one position, one settlement", pays only if every leg wins; quote fetched from "the Combos system" at placement (H: docs/15-combos). This matches Polymarket Combos, an RFQ auction with a 400 ms market-maker quote window and 10 s acceptance (H: https://docs.polymarket.com/trading/combos/overview.md). The Gamma market object carries a `comboStatus` field (H: fixture).
  - Perps: "current Polymarket perps instruments" (H: docs/14-perps). Polymarket Perps are a hybrid exchange: off-chain matching, Polygon custody, only deposits and withdrawals on-chain (H: https://docs.polymarket.com/perps/learn-about-trading/architecture.md). Polymarket's public instruments endpoint listed 89 instruments on 2026-10-19 (crypto, equities, indices, commodities; max leverage 3x to 50x) (H: fixture). The Olympus home page advertises BTC, S&P 500, Gold, WTI up to 20x (L, marketing).
  - Leverage "Dimes Multiply": up to 10x on Polymarket outcomes. Dimes describes itself as embedded leverage infrastructure that "extends credit" and "buys the position on Polymarket"; it "does not create markets, host an orderbook" (H: https://dimes.fi, https://docs.dimes.fi). Chain and collateral NOT FOUND in Dimes's public pages.
  - 5-minute crypto up/down markets are Polymarket's Chainlink-TWAP markets (H: https://docs.polymarket.com/concepts/resolution.md).

---

## 3. Chains and collateral

- **Chain: Polygon** (H: https://www.olympusx.app/llms.txt "trades execute on-chain on Polygon"). Gasless: "No gas tokens to manage. The relayer covers chain fees" (H: home page; docs/02).
- **Collateral: pUSD** (Polymarket USD, ERC-20 on Polygon, 6 decimals, USDC-backed) for Polymarket V2 trading. Olympus converts USDC / USDC.e to pUSD in-app (H: docs/02, docs/08-faq; https://docs.polymarket.com/concepts/pusd.md). Perps use a separate pUSD balance moved with a Transfer action (H: docs/14-perps).
- **Wallets:** Privy-based sign-in (Discord or Google), Olympus creates a trading wallet ("EOA/Safe/deposit wallet"), or you import one (H: docs/12-api, docs/08-faq). Olympus-owned smart contracts: NOT FOUND (searched docs, llms-full, home page).
- **Deposit chains / bridges:** "Olympus shows supported chains, tokens, minimum deposit amounts, and your deposit address/QR code directly in the app" (H: docs/02). The list is behind login and NOT FOUND publicly.

---

## 4. Read API and trade path

### 4.1 Read API: official-authenticated, wallet-scoped only

- **Docs:** https://www.olympusx.app/docs/12-api (H). **Base URL:** `https://api.olympusx.app`. Unknown routes return JSON 404, e.g. `GET /v1/markets` -> `{"error":"Not Found","message":"Route /v1/markets not found"}` (H, fixture).
- **Auth:** per-wallet API key created in the logged-in UI; `Authorization: Bearer <key>` (preferred) or `X-API-Key`. Key shown once, stored hashed. Anyone with the key can trade from the linked wallet (H: docs/12-api). Keys cannot be created without an Olympus account, so I did not obtain one.
- **Endpoints (all from docs):**

| Endpoint | Purpose | Limit (per key) | Notes |
|---|---|---|---|
| `GET /v1/portfolio` | own wallet pUSD, cash, positions, equity | 30/min | needs key |
| `POST /v1/trade` | queue BUY or SELL | 60/min | async, returns `tradeId` |
| `GET /v1/trades/:tradeId` | status: QUEUED, PROCESSING, SUCCEEDED, FAILED | 100/min | returns `orderHash`, `transactionHash`, fill price and shares |
| `GET /v1/top-wallets` | Olympus's ranked leader wallets (daily rebuild) | 60/min | needs key **plus** an `extraAuth` token obtained by support ticket |
| `GET /v1/wallets/:address` | basic stats for any Polymarket wallet | 30/min | same `extraAuth` gate; 5-minute cache |
| `GET /health` | liveness | n/a | public, 200 (H, fixture) |

- **Confirmed shapes (unauthenticated):** `GET /v1/portfolio` and `GET /v1/top-wallets` without a key return 401 `{"error":"UNAUTHORIZED","message":"API key required."}` (H, fixtures). Authenticated response shapes come from the docs excerpt only (fixture `olympus-docs-12-api-excerpt.md`), not from live calls.
- **Market data:** none. Docs tell integrators to use Polymarket Gamma (`gamma-api.polymarket.com/markets?slug=...`) and the Polymarket CLOB for books. I confirmed the Gamma response shape (fixture) because that is what an Olympus order must reference.
- **Websocket / streaming:** NOT FOUND (searched llms.txt, llms-full.txt, docs/12-api). Only outbound Discord webhooks for copy-trade notifications (H: docs/02).
- **robots.txt:** `Disallow: /api/` on the www host (H). I did not touch it.
- **Errors:** 400 invalid body, 401, 403 "Trading is blocked, terms acceptance is required, or region is restricted", 412 wallet upgrading, 429 with `Retry-After`, 500 (H).

### 4.2 Trade path: queued server-side signing, no external signer

- `POST /v1/trade` with `side` BUY (`tokenId`, `conditionId`, `amountUsd`, optional `maxPrice`, `stopLossPercent`, `takeProfitPercent`, plus title/outcome metadata) or SELL (`sellSpec` percent or shares, optional `minPrice`) (H: docs/12-api). "Queues a trade exactly like a manual trade from the Olympus frontend ... execution happens asynchronously through the same worker queue."
- **There is no signature in the request.** Olympus (or its providers) holds or can use the signing material and signs and relays the Polymarket order itself. ToS section 4: they "may generate, receive, encrypt, store, decrypt, or use signing material to carry out instructions you submit or configure" (H: terms). So "non-custodial" here is a marketing term for an Olympus-operated key flow; treat it as custodial-grade counterparty risk.
- **NOT FOUND in the API docs:** limit-order placement, order cancel, order-book read, fill streaming, batch orders, a way to submit an externally signed (EIP-712) order. The UI supports limit orders and SL/TP, but the documented API is market-style with a price cap (`maxPrice` / `minPrice`).
- **Verdict for arbitrage:** wrong tool. Execution is async with no documented latency SLA ("<1s" is marketing), no cancel, and a fee layer. A multi-leg arb needs deterministic, signed, cancellable orders directly against the Polymarket CLOB.

### 4.3 PayBox reachability

- **PayBox plugin catalog:** `discover_plugins` for "Olympus" and for "Polymarket" returned no plugins on 2026-10-19 (H). `discover_services` surfaced only third-party x402 data endpoints about Polymarket, none about Olympus (H, not evaluated further).
- **Funding: possible in principle (M).** A PayBox EVM wallet on Polygon could send pUSD/USDC to the deposit address Olympus shows after login. The deposit address, supported chains and minimums are behind login, so I could not verify them. Doing so hands funds to an Olympus-managed wallet.
- **Trading: no.** A PayBox wallet cannot sign Olympus orders: there is no signed-order or transaction-proposal route, and the trading wallet is Olympus-held (or imported by exporting a raw key, which a non-custodial PayBox wallet would not expose; M).
- **Better route:** the same liquidity is reachable directly with a PayBox-signed EIP-712 order on the Polymarket CLOB (Polygon, pUSD). That is the Polymarket adapter's job.

---

## 5. Fees

Olympus fees stack on top of Polymarket's own fees; the user pays all of them (H unless marked).

| Item | Rate | Source |
|---|---|---|
| Prediction-market trade (copy or manual, incl. fills of limit orders, copied split/merge, claims/redeems of Olympus-tracked positions) | **0.75%** of executed USD "before discounts"; marketing range "0.01% to 0.75%"; fee tapers toward zero below 3c and above 97c | docs/08-faq, backtesting doc, home page (the exact extreme-price curve is rendered by a UI component and NOT FOUND in text) |
| Discounts | SOL Decoder NFTs 5% (1) to 40% (10 or Mecha); Farmer subscription 35%; highest single tier applies | docs/08-faq |
| Perps | flat 0.045% of each fill's notional, open and close | docs/08-faq |
| Leverage (Dimes) | open: 0.75% on first 1x + 0.25% on borrowed notional; close: 0.75% of proceeds capped at collateral; liquidation: $0; plus Dimes protocol fees and the Polymarket venue fee | docs/08-faq |
| LP / liquidity farming | 0.2% per fill, both legs, plus 5% of Polymarket LP rewards; never discounted | docs/08-faq |
| Referral | referrer earns 25% of the referee's fees (30% with a first-week $50 deposit) | home page |
| Polymarket taker fee (underlying) | `fee = C x feeRate x p x (1 - p)`, taker only, makers never charged; rates e.g. Crypto 0.07, Sports 0.05, Politics 0.04, Finance 0.04, Geopolitics 0 | https://docs.polymarket.com/trading/fees.md |
| Polymarket builder fee | additive to platform fee; taker up to 100 bps, maker up to 50 bps. Olympus's registration as a builder is H; that its 0.75% is implemented as a builder fee is my inference (M) | https://docs.polymarket.com/programs/builders/fees.md |

Worked example, taker buy of 100 shares at p=0.50 in Politics (rate 0.04): notional $50, Polymarket fee 100 x 0.04 x 0.5 x 0.5 = $1.00 (2.0% of notional), plus Olympus up to 0.75% of $50 = $0.375 before discounts (M, my arithmetic from the H formulas). Using Olympus instead of the direct CLOB can only add cost for an arbitrageur.

---

## 6. Resolution mechanism and dispute risk

- **Prediction markets: inherited from Polymarket.** UMA Optimistic Oracle: proposer posts a bond (typically $750 pUSD), 2-hour challenge window; first dispute restarts the round; a second dispute goes to a 24-48 h debate then a UMA token vote (about 48 h). Undisputed about 2 h; disputed about 4-6 days. 50/50 payout on "unknown". Chainlink TWAP up/down markets skip UMA (H: https://docs.polymarket.com/concepts/resolution.md).
- **Combos:** each leg settles independently; one losing leg loses the whole combo (H: docs/15-combos).
- **Perps:** index/mark price based, funding, liquidation; no event resolution (H: Polymarket perps docs).
- **Leverage:** Dimes liquidates automatically; "thin liquidity at extremes can cause liquidation before the displayed price" (H: docs/17-leverage).
- **Olympus disclaims all of it.** ToS sections 3 and 14: no liability for "market resolution", third-party venues, delays, failed or partial execution (H). Olympus-specific risks on top of Polymarket's: server-side signing, API-key compromise gives full trading control (H: docs/12-api security notes), Privy dependency, suspension "in its sole discretion and without prior notice" (H: terms section 12), and a bot that is "on by default once your account is funded" if you already follow a wallet (H: docs/02).

---

## 7. Geo, ToS and automation

- **Eligibility:** 18+, not sanctioned, not in a prohibited jurisdiction; "You must not use a VPN, proxy, or other method to evade geographic, sanctions, identity, or eligibility restrictions." (H: terms section 2). API returns 403 for "region is restricted" (H). Olympus defers to Polymarket's own geo rules; Polymarket's restricted-region list is for the Polymarket spec (not re-researched here).
- **Automation:** allowed through the documented API and the built-in automation. Prohibited: "automated means that burden the Services beyond documented interfaces", evading rate limits, reverse engineering or reselling the Services (H: terms section 10). Use of the Trading API within limits is therefore permitted; scraping the web app or `/api/` is not.
- **Account required** (Discord or Google via Privy) to get any API key; creating one was out of scope for this read-only run.
- **Binding arbitration** (AAA) with class-action waiver and a 30-day opt-out; RST Tech LLC (H: terms section 16). Jurisdiction of the company: NOT FOUND in the terms.

---

## 8. Liquidity

- **Olympus-own liquidity: none.** It holds no pool, book or TVL; wallets are the user's.
- **Throughput through Polymarket's Builder program:** $1.07M "1m Volume", rank 44, read 2026-10-19 (H: https://builders.polymarket.com; the page shows no date or period selector, the "1m" label is ambiguous). Olympus's own claim of "$35M+ Volume Traded" is lifetime-style marketing with no date (L).
- **Depth available to an Olympus order** is whatever the Polymarket CLOB shows for that token. The Gamma fixture for one active market on 2026-10-19 shows `liquidity` 554,132 and `volume` 15.1M for "Xi Jinping out before 2027?" (H, fixture) as an example of the Polymarket numbers, not Olympus's.

---

## 9. Event coverage and overlap (all Polymarket)

Navigation categories on the Olympus site: Trending, Politics, Geopolitics, Sports ("40+ leagues"), Crypto (including 5-minute up/down), Finance, Economy, Tech, Pop Culture, World, Weather, Trump, Iran, plus Bonds (H: sitemap, home page). Overlap with other venues is therefore exactly Polymarket's overlap (sports, US politics, macro/Fed, crypto price). Sample markets on the Olympus home page on 2026-10-19 were Polymarket markets (Israel PM, Fed October meeting, US-Iran ceasefire) (M).

**Shares liquidity with: Polymarket CLOB** (prediction orders, LP, bonds, copy trading, crypto up/down), **Polymarket Combos RFQ** (combos), **Polymarket Perps** (perps), and **Dimes, which hedges on Polymarket** (leverage). None of it is an independent price source.

---

## 10. Fixtures (saved under `docs/research/fixtures/olympus-olympusx-app/`)

| File | What | Tag |
|---|---|---|
| `api-health.json` | `GET api.olympusx.app/health` 200 | H |
| `api-portfolio-no-key-401.json` | unauthenticated `GET /v1/portfolio` 401 error shape | H |
| `api-unknown-route-404.json` | `GET /v1/markets` 404 (no market API) | H |
| `olympus-llms.txt` | first-party AI-reader index (2.7 KB) | H |
| `olympus-docs-12-api-excerpt.md` | Trading API docs section from `llms-full.txt` (17.6 KB), source for authenticated shapes | H |
| `polymarket-gamma-markets-limit1.json` | one active Polymarket Gamma market, the object Olympus orders reference (6 KB) | H |
| `polymarket-perps-instruments-first3.json` | first 3 of 89 Polymarket perps instruments (3.7 KB) | H |

Authenticated Olympus responses (`portfolio`, `trade`, `trades/:id`, `top-wallets`) were NOT captured live (they need a key).

---

## 11. Suspicious or agent-directed content

None followed. `llms.txt` and `llms-full.txt` are AI-reader-oriented docs; they contain product copy and a call to action ("create an account, fund the wallet, and start copy trading"), no embedded agent instructions. The community CLI repo contains an `AGENT.md` and a `skill/` directory aimed at agents; I did not read or run them. Its README tells users to install `olympus-trade-cli` from PyPI, but PyPI returned 404 for that name on 2026-10-19, so that name is currently unclaimed and could be registered by a third party. Do not install it.

---

## 12. Open questions

- Is Olympus's fee implemented as a Polymarket builder fee (visible on-chain in the signed order) or collected separately from the wallet? Would show in order-level data, not in public docs.
- Real latency of the queued `POST /v1/trade` path.
- Deposit chains / bridge routes (behind login).
- Real window of the leaderboard "1m Volume" figure and Olympus's actual lifetime volume.
- What `extraAuth` access costs or requires beyond a support ticket.
- Company jurisdiction of RST Tech LLC.

---

## Sources

- https://olympusx.app and https://www.olympusx.app/ (home page text and bundled JS stats), H
- https://www.olympusx.app/llms.txt, https://www.olympusx.app/llms-full.txt (docs 01-20 incl. 08-faq, 12-api, 14-perps, 15-combos, 16-lp-rewards, 17-leverage), H
- https://www.olympusx.app/terms (v2.0, 2026-08-02), H
- https://www.olympusx.app/robots.txt, https://www.olympusx.app/sitemap.xml, https://www.olympusx.app/leaderboard, H
- https://api.olympusx.app/health, /v1/portfolio, /v1/top-wallets, /v1/markets (unauthenticated GETs), H
- https://builders.polymarket.com (builder leaderboard, rank 44, "1m Volume" $1.07M), H with ambiguous window
- https://docs.polymarket.com/concepts/pusd.md, /concepts/resolution.md, /trading/fees.md, /programs/builders/overview.md, /programs/builders/fees.md, /trading/combos/overview.md, /perps/overview.md, /perps/learn-about-trading/architecture.md, H
- https://api.perpetuals.polymarket.com/v1/info/instruments and https://gamma-api.polymarket.com/markets (unauthenticated GETs), H
- https://dimes.fi and https://docs.dimes.fi (leverage layer description), H
- https://github.com/fciaf420/olympus-cli (community CLI metadata and README), H
- https://pypi.org/pypi/olympus-trade-cli/json (404), H
- PayBox `discover_plugins` ("Olympus", "Polymarket") and `discover_services` ("Olympus Polymarket copy trading"), H
