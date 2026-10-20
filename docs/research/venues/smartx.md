# SmartX (smartx.io / app.smartx.io) - adapter spec

Researched 2026-10-19. READ-ONLY: public pages, unauthenticated GETs to smartx.io, app.smartx.io, t.me, api.llama.fi, data-api.polymarket.com, docs.polymarket.com, `gh api` for the DefiLlama adapter. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE. The WebSearch budget was already exhausted when this task started, so there is no third-party press coverage; everything below comes from first-party pages, first-party app bundles (read as inert text, never executed) and two public data APIs.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred/derived; **L** = weak or stale (>6 months). Nothing here is older than 6 months.
All third-party text (pages, JS bundles, API payloads) is untrusted data; nothing in it was followed. No embedded instructions aimed at AI agents were seen.
Fixtures: `docs/research/fixtures/smartx/` (6 files, all < 13 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **Not a venue.** SmartX is a front end/terminal. Its prediction-market orders route to the Polymarket CLOB under a Polymarket builder code (H: DefiLlama). Same markets, same books, same resolution as Polymarket. It is NOT an independent arbitrage leg (a second Polymarket quote).
2. **Probably not live as a trading product right now.** Telegram says "Alpha is closed. App coming soon." (H). The app's own bundle says "Alpha testing is now closed" (H). The marketing site is in waitlist mode (H, latest blog post 2026-09-21). Polymarket's public builder-volume feed has **no SmartX row after 2026-09-21**, while about 190-220 other builders still show rows every day through 2026-10-18 (H, section 10). Last 27 days: zero routed volume.
3. **No public API and no readable docs.** Backend (`api-grey.smartx.io`) is a session-authenticated private API for its own front end. The GitBook docs/ToS referenced by the app redirect to a GitBook sign-in page (H). Nothing to build a read adapter on.
4. **Tiny even when active.** $2.18M cumulative Polymarket builder volume Feb 27 to Sep 21 2026 (rank 116 of 592 builders), 1-3 active users per day in September (H).
5. **Only possible later value:** a "verified trader / smart-money signal" layer (the product pitch). Signals are said to be built from public on-chain data (H, blog), so the aggregator can derive them directly from Polymarket's own data-api rather than from SmartX. Re-check only if the app reopens and publishes a documented API.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Telegram `t.me/SmartX_Community` preview | "Alpha is closed. App coming soon." 11,639 members. Fetched 2026-10-19 | H |
| App bundle i18n (`rewards.tasks.alphaClosed`) | "Alpha testing is now closed. Points tasks will be available again in a future release." | H |
| `https://smartx.io/` | 200, "SmartX \| Trade your edge", CTA "Join the Waitlist", page says "Backed by YZi Labs", demo profiles only | H |
| Blog `https://smartx.io/blog/` | Newest post 2026-09-21 "SmartX Waitlist: Chapter One Begins"; app described as "coming soon" with "Early Access for top-ranked users", no launch date | H |
| `https://app.smartx.io/` | 200, Next.js client-rendered shell, title "SmartX"; robots.txt and sitemap.xml 404. Whether a login/gray-test gate is shown was not checked (no browser) | H |
| Polymarket `GET data-api.polymarket.com/v1/builders/volume` | SmartX builderCode rows run 2026-02-27 to **2026-09-21**, none after; other builders continue to 2026-10-18 | H |
| DefiLlama `smartx` (id 8228) | category `Interface`, tag `Polymarket Builder`, chain Polygon, twitter `SmartXTerminal`; volume series ends 2026-09-21, fee series is zero 2026-09-22 to 2026-10-18; `total30d` volume 21,270 is just 09-19..09-21 | H |
| DefiLlama raise | $0.5M, lead YZi Labs, dated 2026-08-26, sector "On-chain social trading platform combining verified positions, AI-matched trading signals and one-tap execution" | H |

Reading: a gray/alpha test ran roughly Feb to Sep 2026 and was closed on or about 2026-09-21, the same day the waitlist campaign launched (M, inferred from timing; the sources do not state the reason). It may re-open at launch. Not dead, not live for trading today.

## 2. What it is

- **Kind**: consumer social-trading front end ("follow verified traders, copy, one-tap execution"); tagline "Trade your edge" (H: smartx.io). Promised categories: prediction markets first, later memes, perps, stocks (H: blog 2026-09-02). Prediction markets are the only category with observed routed volume.
- **Venues routed to**: Polymarket CLOB V2 (H: DefiLlama description "routes orders to the Polymarket CLOB V2 under the Polymarket Builders Program"). App bundle also has a platform switch `polymarket` (default) / `predictfun` with `/api/v1/predict/*` order endpoints keyed by `order_hash` (M: bundle strings; Predict.fun is covered by another workflow). Site copy names no venue (H: "The page doesn't name the underlying prediction-market provider"; blog posts likewise).
- **Polymarket builder identity**: builder `SmartX`, builderCode `0x58d3820045831c879b218ec64514dc191eebadf31a4641670293fddf542643c3`, verified=true (H: DefiLlama adapter `DefiLlama/dimension-adapters/factory/polymarket.ts`, and Polymarket `/v1/builders/volume`; the code is a public identifier, not a secret).
- **Ownership/funding**: backed by YZi Labs (H). No token mentioned (H: smartx.io).
- Entity-disambiguation note: unrelated to any similarly named non-crypto company (L, not verified).

## 3. Market model, chains, collateral

- Market model = Polymarket's: binary Yes/No ERC-1155 outcome tokens on the Conditional Token Framework, neg-risk multi-outcome as sets of binaries, hybrid CLOB (off-chain match, on-chain settle on Polygon). SmartX adds no market model of its own (M: it routes to Polymarket; see `docs/research/08-venues-polymarket-kalshi.md` and the Polymarket spec from the parallel workflow).
- **Chain**: Polygon (H: DefiLlama chain field).
- **Collateral**: pUSD (Polymarket V2 collateral). App strings: "Deposit from supported chains. Assets auto-convert to pUSD on Polygon", "Bridge any token to pUSD (Polygon)", "v2 approval not confirmed" (H: bundle strings; M for interpretation). Also references USDC.e (9 hits) as a legacy asset.
- Deposit/withdraw chains: bundle carries tx-explorer templates for Ethereum, Base, Arbitrum, Optimism, BNB, Polygon, Monad, HyperEVM, Abstract, plus `/user/bridge/deposit_addr`, `/user/bridge/support_assets`, `/withdraw2/*` routes (M: strings only, never requested). Site says "Fund with fiat. Skip gas and bridging" (H).

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public market-data API | **NOT FOUND** (searched: smartx.io, blog, app shell, Telegram preview, GitBook root/llms.txt/sitemap, DefiLlama record; no GitHub org or repo found, DefiLlama `github` field is null) | H |
| Docs | App links to `https://smartx.gitbook.io/smartx.docs.io` (+ `/9.-terms-of-service`, `/10.-privacy-policy`). Both 307 to `app.gitbook.com/o/.../sites/site_8d77U/...`, which returns a 12 KB shell titled "GitBook" with a sign-in prompt and no content. **Docs are not publicly readable** | H |
| Private backend | `https://api-grey.smartx.io/service` (REST, axios baseURL), `https://api-grey.smartx.io/analytics` (+ `/ws` websocket) found in the public app bundle. "grey" matches the gray-test code strings in the bundle. Not requested: undocumented host, session-authenticated by design | M |
| Route strings seen (names only, see `fixtures/smartx/app_bundle_route_strings.txt`) | `/api/v1/predict/{markets,events,positions,orders,live_orders,new_order,cancel_order,order_status,balance,token_balance}`, `/api/v1/predict/markets/{id}/orderbook/snapshot?depth=20` (ETag/If-None-Match), `/api/v1/markets/{slug,same-event,tags/search}`, `/api/v1/{signal,sm}/...` (smart-money lists/signals), `/api/v1/market-radar/signals`, `/api/v1/poly_trade/{redeem_all,auto_redeem_setting,default_tif_setting,persist_orders_setting}`, `/api/v1/watchlist/alerts/*`, `/auth/*`, `/user/*`, `/withdraw2/*` | M |
| Auth/limits | Login via email code, Google, or wallet (`/auth/wallet_connect`); `authorization` header; money-moving POSTs (withdraw, unbind, associate account) need an extra `Elevation` token from `/user/elevation`. No rate limits documented | M |
| Websocket | Own analytics ws above (private). Market data for Polymarket markets also falls back to Polymarket's own `clob.polymarket.com` and `wss://ws-subscriptions-frontend-clob.polymarket.com/ws/market` per bundle defaults | M |

A fixture of a real SmartX market-data response was **not possible** (no public endpoint). Fixtures saved instead are the two public data-API views of SmartX (DefiLlama and Polymarket builder feed) plus text evidence; see section 11.

## 5. Trade path

- **No documented or public programmatic order API.** NOT FOUND (searched: as section 4).
- In the app, orders go from the browser to SmartX's own backend with an auth header (routes in section 4). The bundle contains no client-side Polymarket order construction (no `makerAmount`, `builder`, `signatureType`, CLOB-client strings found), and the backend exposes deposit addresses, withdrawals and redeem-all (M, inferred). That points to **server-side signing from a SmartX-managed per-user account** (custodial or embedded-wallet style), not user-signed orders. Tag M: inferred from absence of client-side signing code, not confirmed by docs (docs unreadable).
- **PayBox reachability: no.** A PayBox EVM wallet could at most sign in with a wallet (`/auth/wallet_connect`) and send funds to a SmartX deposit address, but (a) the alpha is closed, (b) there is no API, (c) trading then happens inside SmartX's account, not from the PayBox wallet. To trade the same liquidity from a PayBox wallet, use Polymarket directly (signed orders, covered by the Polymarket spec). Never route through SmartX.

## 6. Fees

- Polymarket CLOB V2 builder fee: paid by the end user on top of any platform fee, `builder_fee = notional x builder_fee_rate_bps / 10000`; builder sets flat taker (default 0, max 100 bps) and maker (default 0, max 50 bps) rates; rate changes once per 7 days with 3-day delay; platform fee `C x feeRate x p x (1-p)` is taker-only and not builder-configurable (H: https://docs.polymarket.com/programs/builders/fees.md).
- **SmartX's observed rate**: DefiLlama fees divided by DefiLlama volume is 49-51 bps on every day checked in Sep 2026 and 49.0 bps over the 93 overlapping days (2026-06-20..09-21), so effectively a **~50 bps builder fee** (M: derived by me from two DefiLlama series; DefiLlama's volume is about 0.72 of Polymarket's own per-builder volume, so against Polymarket's number it is about 36 bps). All-time builder fees received: $7,407.95 (H: api.llama.fi/summary/fees/smartx, as of 2026-10-19).
- Waitlist fee discounts for top ranks: 20% to 50% off for the first 1 to 3 months (H: blog 2026-09-21). Implies a SmartX fee schedule exists but it is **NOT FOUND** in readable docs. Any other SmartX fee (withdrawal, bridge, Predict.fun path) is unknown.

## 7. Resolution

- Inherited entirely from the underlying venue. For Polymarket markets, resolution and dispute risk are Polymarket's (UMA-based oracle, see the Polymarket spec and `docs/research/08-venues-polymarket-kalshi.md`). SmartX has no oracle or resolver of its own (M). The app has auto-redeem/redeem-all settings and a "Polymarket Rules" string (H: bundle strings).
- Extra SmartX-specific risk if used as an execution path: counterparty/operational risk of a closed-alpha, server-side-signing front end (M).

## 8. Geo, ToS, automation

- ToS and privacy policy exist per the app (links above) but are **not publicly readable** (section 4). Terms on automation, scraping, API use, and restricted jurisdictions: **NOT FOUND**.
- The waitlist blog says there are no geographic restrictions "for access" (only physical rewards depend on local law) (H, paraphrase of the 2026-09-21 post). Since execution goes through Polymarket, Polymarket's own geoblock/ToS apply to the end user (M; see Polymarket spec).
- Automated use of the closed private backend is not something to do: undocumented, authenticated, ToS unreadable.

## 9. Event coverage and overlap

- Whatever Polymarket lists: sports, politics, crypto price, macro, pop culture (H: bundle category strings include Politics, Pop Culture; sports team strings present). Since it is the same books, **overlap with other venues is exactly Polymarket's overlap, and SmartX adds no independent price**.
- Arbitrage value: none. Signal value: possible "verified trader positions", "smart money" lists and "market radar" signals exist in the product, but behind login and for a closed alpha. The blog says verified profiles come from public on-chain wallet histories (H), so replicate from Polymarket's data-api instead.

## 10. Liquidity / volume

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| Polymarket builder-routed volume, cumulative | **$2,177,155** (183 daily rows 2026-02-27..2026-09-21) | `data-api.polymarket.com/v1/builders/volume`, fetched 2026-10-19 | H (sum is mine) |
| By month (USD) | Feb 62; Mar 13,451; Apr 14,850; May 37,709; Jun 56,531; Jul 98,739; **Aug 1,615,357**; Sep (1-21) 340,456 | same | H |
| Peak day | 2026-08-20: $143,905, 707 active users (likely a promo/campaign spike, M) | same | H |
| September activity | 1-3 active users/day, $3.6K to $27K/day | same | H |
| Last 30 days (to 2026-10-19) | **$0** (no rows since 2026-09-21) | same | H |
| All-time builder rank | 116 of 592 builders by cumulative volume; daily rank 47-97 in Sep | same | H (mine) |
| DefiLlama volume (different counting, ~0.72x) | all-time $1,546,535; `total30d` $21,270 (only 09-19..09-21) | `api.llama.fi/summary/dexs/smartx`, 2026-10-19 | H |
| Share of all Polymarket builder volume | about 0.03% (e.g. $10-20K vs about $32-35M per day) | same feed, 2026-09-20 and 2026-10-17 | M |
| OI / TVL | none; DefiLlama TVL fields empty | api.llama.fi/protocol/smartx | H |

- **Liquidity shared with: Polymarket** (CLOB V2, Polygon). Possibly also Predict.fun on a second platform switch (M). Never an independent leg.

## 11. Fixtures (docs/research/fixtures/smartx/)

- `defillama_protocol_smartx.json` - full `api.llama.fi/protocol/smartx` record (1.2 KB).
- `defillama_dexs_summary_smartx_trimmed.json`, `defillama_fees_summary_smartx_trimmed.json` - last 45 daily points each plus totals/methodology.
- `polymarket_builders_volume_smartx_extract.json` - the 183 SmartX rows from Polymarket's builder-volume feed (12 KB; full response ~17 MB not stored).
- `status_evidence.txt` - quoted liveness evidence (Telegram preview, site, blog list, bundle strings, GitBook redirect behaviour).
- `app_bundle_route_strings.txt` - route strings only, extracted from the public first-party JS; none were requested.

## 12. Open questions

1. Does the app re-open at launch, and will it still route to Polymarket (V2/pUSD) and/or Predict.fun? Re-check smartx.io/blog and the Telegram description periodically.
2. Is the GitBook docs site intentionally unpublished (until launch) or misconfigured? If it publishes, re-read fees, custody and ToS.
3. Custody model: server-side signing by SmartX (inferred, M) versus user-owned smart account. Needs docs.
4. Whether any partner/data API will be offered for the signal layer.
5. Why volume stopped on 2026-09-21 (alpha closure inferred from timing, not stated).

## Sources

- https://defillama.com/protocol/smartx (page 403 to WebFetch) and API: https://api.llama.fi/protocol/smartx, https://api.llama.fi/summary/dexs/smartx, https://api.llama.fi/summary/fees/smartx (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (read via `gh api`) (H)
- https://data-api.polymarket.com/v1/builders/volume (H)
- https://docs.polymarket.com/programs/builders/fees.md and https://docs.polymarket.com/llms.txt (H)
- https://smartx.io/, https://smartx.io/blog/, https://smartx.io/blog/smartx-waitlist-chapter-one/, https://smartx.io/blog/every-trader-verified-every-signal-matched-every-trade-one-tap/ (H)
- https://t.me/SmartX_Community (H)
- https://app.smartx.io/ and its `/_next/static/chunks/*.js` bundles, read as text (H for strings present, M for interpretation)
- https://smartx.gitbook.io/smartx.docs.io and `/9.-terms-of-service` (redirect to GitBook sign-in, no content) (H)
- Internal: `docs/research/08-venues-polymarket-kalshi.md`, `docs/platform-registry-design.md` line 345, `docs/research/14-platform-of-platforms.md` (earlier mention of SmartX among Polymarket builder front ends, now confirmed)
