# PredicTools (predic.tools) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 04:07-04:12 UTC). READ-ONLY: page/JS reads, `gh api` searches, and unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`. No account, login, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, site JS and API text were treated as untrusted data; nothing in them was followed or executed (site JS was downloaded as text and grepped only).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/predictools/` (listed in section 12).

---

## 0. Bottom line

1. **PredicTools is not a venue. It is a custodial-style front end / trading terminal for Polymarket and Kalshi.** Its own copy: "Unified terminal for Polymarket and Kalshi with real-time data and seamless trading." (H, https://www.predic.tools/, landing i18n payload) and ToS section 2: "predic.tools is a trading terminal that provides a unified interface for accessing prediction markets on Polymarket and Kalshi." (H, https://www.predic.tools/terms). This resolves the discovery hint ("Venue(s) it terminals are not stated"): **Polymarket (Polygon CLOB) and Kalshi.**
2. **It has no liquidity of its own.** Every order goes to Polymarket's on-chain CLOB or Kalshi's exchange (ToS: "All trades on Polymarket are executed on-chain via the Polygon blockchain. All trades on Kalshi are executed through Kalshi's regulated exchange." H). It is therefore **not an independent arbitrage leg**: it duplicates two venues already covered by the parallel workflow.
3. **No official API.** An unofficial backend (`https://api.predic.tools/api` + Socket.IO) exists, visible in the site's own JS, but it is undocumented, session-authenticated for trading, and **returned Cloudflare 525 (origin SSL handshake failed) on every probe 04:08-04:12 UTC** (H). The public "Public API for third-party integrations" and "Cross-Platform Arbitrage" are roadmap items, not shipped (H).
4. **Weak project signals**: a ~$10k-market-cap Solana token launched 2026-01-15, a 2% "tax" claim, telegram promo with a "tap to verify" lure, terms last updated 2025-12-04, server-side generated wallets and a form that takes your Kalshi RSA private key. Treat as a possible low-quality or risky operator (section 10).
5. **adapter_priority = skip.** Nothing here that Polymarket + Kalshi adapters do not already give us, and it forbids bots. The only use is competitive intel (they list "Cross-Platform Arbitrage" on their roadmap).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://predic.tools/` | HTTP 307 -> `https://www.predic.tools/`, then 200 (Vercel, Next.js, HTML title "predic.tools - Real-Time Prediction Market Trading Terminal", footer "(c) 2026 predic.tools", "build 17c6147"), fetched 2026-10-19 | H |
| Vercel edge `age` header | 928,897 s (~10.7 days) on 2026-10-19, implies the current deployment is from about 2026-10-08 or earlier (cache age only bounds it) | M |
| Wayback CDX captures | first 2026-01-08, latest seen 2026-08-16 (`web.archive.org/cdx/search/cdx?url=predic.tools`) | H |
| Token `PREDIC` | Jupiter token API `updatedAt` 2026-10-19T02:34Z, `firstPool.createdAt` 2026-01-15T22:17Z (https://lite-api.jup.ag/tokens/v2/search?query=<mint>) | H |
| **Backend API** | `https://api.predic.tools/api/markets/stats`, `/api/markets?...`, `/`, `/health`, `/socket.io/...` all returned **HTTP 525** (Cloudflare "SSL handshake failed" to origin) at 04:08, 04:09, 04:10, 04:11 and 04:12 UTC. Fixture: `api-predic-tools-525-probe.txt` | H |
| Telegram `t.me/s/predictools` | public preview shows a "Channel created" notice and a promo video with ~4.86K views; no dates on page; no outage notice | M (small-model summary) |
| X `@predictools` | WebFetch returned HTTP 402 Payment Required; nothing retrieved, nothing paid | H (the 402) |

Verdict: **still_live = true for the marketing/front-end site, but the app backend was failing on 2026-10-19 (5 probes over ~4 minutes), so market data and trading could not work at probe time.** Whether this is transient is unknown. The footer's green "Connected" dot is static HTML, not a health check (H, present in server-rendered HTML before any JS).

---

## 2. Kind and market model

- **Kind (H):** broker / front-end terminal over two upstream venues. No market creation, no own contracts, no own order book.
- **Market model: inherited.** Polymarket = binary/categorical on a hybrid-decentralised CLOB, outcome shares are ERC-1155 conditional tokens, identified by `clobTokenIds` (client reads `platformData.clobTokenIds`, a JSON string, and calls `clob.polymarket.com/book?token_id=` for each of YES/NO) (H, site JS chunk 8804). Kalshi = CFTC-regulated binary contracts on a central order book, identified by `ticker` (H, `/kalshi/positions?ticker=`). Both are covered by the parallel workflow; do not duplicate.
- **Normalised market object seen in the client (H, site JS):** `platform in {POLYMARKET, KALSHI}`, `platformId`, `yesPrice`, `noPrice`, `volume24h`, `updatedAt`, `platformData`. Useful only as evidence that they flatten both venues into one YES/NO model.
- The UI offers a "15 min" filter (H, i18n `filters.fifteenMin`), i.e. short-dated crypto-price markets from Polymarket.
- A **demo / paper mode** exists (`/beta/demo/open-position`, `/beta/demo/balance`, "Virtual Balance", leaderboard, quests, referrals) (H, site JS). The roadmap still lists "Live Platform Launch: Transition from demo to fully operational trading terminal" under Phase 2 without a done marker, so **whether real-money trading is switched on is unconfirmed** (see open questions).

---

## 3. Chains and collateral

- Polymarket leg: **Polygon**, USDC.e. The wallet page has a flow "Converting Native USDC to USDC.e ... Swapping via Uniswap V3" and shows a POL (gas) balance column (H, i18n `wallet.conversion`, `wallet.table.pol`). ToS section 6 lists gas "(POL/MATIC)" (H).
- Kalshi leg: USD at Kalshi, no chain.
- The `$PREDIC` token is on **Solana** (mint `AaRLHCvt6G8e3dbxLvN6BQi2S34Lvv3eeBjKNzc2QZB9`, classic SPL Token program, 6 decimals), unrelated to trading collateral (H, Jupiter API + site `/token` page). It is a promo / "premium discount" token (section 7).
- Auth is Auth0 (Google, X/Twitter, email) (H, privacy policy section 2.1 and `/auth/login?connection=`).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official API / docs | **None.** No docs link, no GitHub org (searched `gh api search/repositories` and `search/users` for predictools / predic.tools: no official hit), no developer page. Roadmap Phase 3 ("Coming Soon", locked): "API Access for Developers: Public API for third-party integrations." | H (roadmap), M (absence) |
| Unofficial backend | Base `https://api.predic.tools/api`; Socket.IO at `https://api.predic.tools` (`transports: websocket, polling`) | H (site JS) |
| Client-side unauthenticated GETs (no Authorization header sent) | `GET /markets?platform&status&activeOnly&category&search&limit&offset&sortBy&sortOrder` -> `{success, data[], total, hasMore}`; `GET /markets/{id}`; `GET /markets/{id}/similar?limit=`; `GET /markets/stats`; `GET /markets/popular-searches`; `GET /markets/categories` | H (site JS), **not verified live (525)** |
| Socket.IO events seen | `market:updated`, `markets:updated`, a trades event (used by the Live Trades page) | H (site JS) |
| Auth for user routes | `Authorization: Bearer <token>` fetched from the app's own `/api/auth/token`; 401 -> client logs out; **429 -> "Too many requests. Please try again later."** No numeric rate limit published | H (site JS) |
| Response shape sample | **NOT FOUND**: backend returned 525 so no real JSON was captured (searched: GET /markets/stats, /markets?limit=2, /, /health, /socket.io poll). Endpoint inventory derived from JS is saved as a fixture instead | H |

Aggregator advice: do **not** build on `api.predic.tools`. Read Polymarket and Kalshi directly. The only unique thing it exposes (their `/markets/{id}/similar` cross-venue matches) is of unknown quality and unreachable.

---

## 5. Trade path

- **Programmatic order placement: none supported.** There is no documented or keyed API. The site's own routes are `POST /trade/quote`, `POST /trade/execute` (with an `Idempotency-Key` header), `POST /trade/cancel`, `/trade/positions`, `/trade/open-orders/{id}`, `/trade/redeem-all/{id}`, `/wallet/create`, `/wallet/import`, `/wallet/list`, `/kalshi/link`, `/kalshi/trade`, `/kalshi/orders`, `/kalshi/orders/cancel` (H, site JS; none called by me).
- **Signing model: server-side custody.** Terms 4: "For Polymarket trading, you may create wallets through predic.tools. You can export your private keys at any time". Landing: "Secure Wallets - AES-256 encrypted keys, your funds stay safe". Wallet UI has "Export Private Key", "Send", "Delete" (H). So the **site backend, not the user, signs Polymarket orders** for wallets it generated or imported (`/wallet/import`).
- **Kalshi link sends credentials to their server:** `POST /kalshi/link` with body `{apiKey, privateKey}` (H, site JS). Terms say "Your Kalshi account remains under your control" (H) but the key material is uploaded.
- Consequence: an agent could only "trade PredicTools" by logging in via Auth0 as a human and handing the service a private key. Never do that. Trade the underlying venues directly.

---

## 6. PayBox / EVM wallet reachability

**paybox_reachable = no (as a venue).**

- There is nothing to sign or propose against PredicTools: no contracts, no EIP-712 order schema, no deposit address, no HTTP API with wallet auth. Auth is Auth0 social/email login and wallets are minted server-side.
- The underlying Polymarket leg is on Polygon and is reachable by a PayBox EVM wallet through Polymarket's own CLOB signing (covered by the parallel workflow's Polymarket spec). The Kalshi leg is not wallet-based at all.
- Importing a PayBox-controlled key into `/wallet/import` would hand a private key to a third party: **do not**.

---

## 7. Fees

- **Platform fee: 0.** Terms 6: "predic.tools does not charge additional fees for trades. However, you may incur: Platform fees charged by Polymarket or Kalshi; Blockchain gas fees (POL/MATIC); Network fees for cryptocurrency transfers." Landing: "0% Fees - Zero trading fees". Token page: "PredicTools remains completely free to use ... The $PREDIC token economics and subscription model allow us to maintain this commitment." (H).
- Roadmap: "Premium Subscription: Enable monthly subscription access, with $PREDIC discounts" (H, unshipped or unconfirmed).
- **$PREDIC token: "2% buy/sell tax on $PREDIC"**, allocated to rewards, tournaments and development (H, `/token`). My inference (M): the mint uses the classic SPL Token program (Jupiter `tokenProgram: TokenkegQ...`), which has no native transfer-fee mechanism, so the claim cannot be enforced by the mint itself. Could be a DEX/launchpad fee or just copy. Not verified.
- Whether PredicTools earns a Polymarket "builder" fee or a Kalshi referral rebate is **NOT FOUND** (searched site JS for builder/fee fields in the execute payload: none seen on loaded routes).
- Upstream fees: see the Polymarket and Kalshi specs.

---

## 8. Resolution mechanism and dispute risk

Inherited from the upstream venue (Polymarket's oracle process, Kalshi's exchange rules). The UI has a "Resolution Rules" panel and a "Pending resolution / Claim" flow (H, i18n `resolution`, `portfolio.pendingResolution`), but PredicTools does not resolve anything. ToS 9 disclaims responsibility: "predic.tools is not responsible for: Actions or omissions of Polymarket, Kalshi, or any third-party service ... Market data accuracy or latency ... Unauthorized access to your accounts or wallets." (H). Extra risk on top of upstream: custodial key theft or service shutdown, with no recourse.

---

## 9. Geo, ToS, automation

- Terms last updated **"December 4, 2025"** (>6 months old, possibly stale) (H, https://www.predic.tools/terms, privacy policy has the same date).
- Eligibility: 18+, "not a resident of, or accessing the Service from, a restricted jurisdiction". Regional notice: "Polymarket is not available in the United States ... you confirm you are not a US person" (H).
- The app runs a client-side region check: it calls `https://clob.polymarket.com/markets` with a 5 s timeout and, on failure, shows "Region Restricted: Polymarket APIs are unavailable in your location. Some features may not work." (H, layout chunk).
- **Automation: prohibited.** Terms 7: "Use bots, scrapers, or automated tools without authorization" (H). Also prohibits "wash trading" and bypassing "security measures or access restrictions". Terms may be changed or access terminated "at any time, for any reason, without notice" (§13).
- Contacts in the terms/privacy pages are generic role mailboxes of the service; none recorded here.

---

## 10. Liquidity and traction

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| PredicTools trading volume / users / OI | **NOT FOUND** (searched: site, Telegram preview, web search, GitHub lists; Messari page returned 429; X returned 402) | 2026-10-19 | n/a |
| Own liquidity | none (brokered) | ToS section 2 | H |
| `$PREDIC` market cap / FDV | $9,901.91 | Jupiter token API, `updatedAt` 2026-10-19T02:34Z | H |
| `$PREDIC` on-chain liquidity | $4,550.68 | same | H |
| Holders | 2,207; top-holder concentration 38.5%; organic score 0 ("low"); mint and freeze authority disabled | same | H |
| CoinMarketCap | cap ~$9.71K, 24h volume $0, rank ~#7511; page data internally inconsistent (ATH below ATL) | https://coinmarketcap.com/currencies/predictools/ , 2026-10-19 | M (summary) |
| DexScreener | `token-pairs/v1/solana/<mint>` returned `[]` and `latest/dex/tokens/<mint>` returned `{"pairs":null}` on 2026-10-19 | api.dexscreener.com | H |

Token facts do not measure the terminal's usage; they only show a tiny project. Fixture: `jupiter-token-search-PREDIC.json`.

**Suspicious / low-trust signals** (not instructions followed, only recorded): roadmap leads with "Token Launch" and "CEX Listings" before the product; "publicly doxxed advisor" promised but not named; Telegram promo post reportedly asks readers to "tap to verify" they are human (M, small-model summary of t.me/s/predictools) which is a common lure pattern; `/wallet/import` and `/kalshi/link` collect private keys.

---

## 11. Event categories, overlap, shared liquidity

- Categories: whatever Polymarket/Kalshi list (`/markets/categories` route exists; not fetched). Sports, politics, crypto price (15-minute markets), macro all overlap other venues, but **only because they are the same markets**.
- **Liquidity shared with: Polymarket (Polygon CLOB) and Kalshi, 100%.** A PredicTools price equals the upstream price by construction. It must **not** be modelled as an independent leg; adding it would double-count the same book and produce phantom arbitrage between a venue and itself.
- Competitive note: their roadmap lists "Predic.Scan", "Predic.Mirror" (strategy mirroring) and "Cross-Platform Arbitrage: Seamless arbitrage tools across prediction markets" as Phase 3 "Coming Soon" (H). If it ever ships, it competes with our aggregator rather than supplying signal.

---

## 12. Fixtures saved

`docs/research/fixtures/predictools/`:
- `api-predic-tools-525-probe.txt` - headers and body of the failing unauthenticated GET (shows the backend outage evidence).
- `jupiter-token-search-PREDIC.json` - real Jupiter token API response for `$PREDIC` (884 B).
- `site-js-endpoint-inventory.json` - endpoint list derived by reading the site's own JS (my derivation, not an official spec; not verified live).

No real API JSON for markets could be captured (backend 525).

---

## 13. Adapter priority and recommendation

**skip.** Reasons: broker with no independent liquidity (100% Polymarket + Kalshi), no official API, backend returning 525, bots forbidden by ToS, custodial and key-collecting flows, tiny token-only traction. If we want its cross-venue "similar markets" matching as a hint, do our own linking (see `docs/market-linking-design.md`).

Re-check triggers: official API/docs page appears; "Cross-Platform Arbitrage" ships; backend recovers and shows real volume.

## 14. Open questions

1. Is the 525 transient or is the backend gone? (Re-probe later; only a few minutes of data.)
2. Is real-money trading live or still demo-only? (`/beta/demo/*` exists; roadmap lists "Live Platform Launch".)
3. Does PredicTools collect a Polymarket builder fee or Kalshi referral revenue behind the "0% fees" claim?
4. Real response shape of `GET /markets` and `/markets/{id}/similar` (needs the backend up).

## Sources

- https://www.predic.tools/ and https://predic.tools/ (redirect), fetched 2026-10-19 (HTML, headers, Next.js payload, i18n strings) - H
- https://www.predic.tools/terms (Terms of Service, last updated 2025-12-04) - H (read from the page's route chunk `terms/page-293b505a1b6a184f.js`)
- https://www.predic.tools/privacy (Privacy Policy, last updated 2025-12-04), `/token`, `/roadmap` (route chunks) - H
- Site JS chunks under https://www.predic.tools/_next/static/chunks/ (build 17c6147): API base URL, route inventory, Socket.IO, region check, Polymarket CLOB calls, Kalshi link flow - H (static reading only)
- https://api.predic.tools/api/... probes (HTTP 525), 2026-10-19 04:08-04:12 UTC - H
- https://coinmarketcap.com/currencies/predictools/ - M (WebFetch summary)
- https://lite-api.jup.ag/tokens/v2/search?query=AaRLHCvt6G8e3dbxLvN6BQi2S34Lvv3eeBjKNzc2QZB9 - H
- https://api.dexscreener.com/token-pairs/v1/solana/AaRLHCvt6G8e3dbxLvN6BQi2S34Lvv3eeBjKNzc2QZB9 and /latest/dex/tokens/... - H
- https://web.archive.org/cdx/search/cdx?url=predic.tools - H
- https://t.me/s/predictools - M (WebFetch summary, no dates)
- https://x.com/predictools - HTTP 402, nothing retrieved
- Web search (extended) for "predic.tools" / "PredicTools": only the official site, token aggregator pages and generic SEO articles (Yahoo Finance, Messari, Phantom, BeInCrypto, WEEX, 3Commas, Bybit); no independent review or usage data; the Messari blurb ("onchain prediction markets") disagrees with the official site and is treated as L
- GitHub: community lists (aarora4/Awesome-Prediction-Market-Tools, Kresmion/prediction-market-trading-tools-and-terminals) contain no predic.tools entry; no official repo/org found
