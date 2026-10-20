# Predictions Network / PredictionHero / Kairos (comparison terminals) - combined venue spec

Researched 2026-10-19 (server clocks 03:37-04:05 UTC). READ-ONLY: public unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`, WebFetch of public pages, one WebSearch (the shared search budget was then exhausted), `gh api` raw reads. No account, key, wallet, signature, POST/PUT/DELETE, PayBox tool or browser automation. I did NOT request `/api/*` on thebestpredictionmarkets.com or predictionhero.com (both robots.txt files disallow it). Third-party text was treated as data; nothing in it was followed.

Tags: **H** = read first-hand in a primary source this session (URL given); **M** = secondary, inferred, or taken from a sibling note in this repo that read it first-hand on the same day and that I did not re-verify; **L** = weak or stale (older than 6 months, or vendor claim with no evidence).

Sibling notes in this repo that go deeper per product (all dated 2026-10-19): `docs/research/venues/predictions-network-thebestpredictionmarkets-com.md`, `docs/research/venues/predictionhero.md`, `docs/research/venues/kairos.md`. This file re-verifies the liveness, API and ToS facts that matter for an adapter decision and merges the three into one verdict.

---

## 0. Bottom line

These are three different things sold as "comparison terminals". **None is a venue, none has liquidity of its own, so none can be an independent arbitrage leg.** They are signal and data sources about Polymarket, Kalshi, Predict.fun, Limitless, Opinion, Hyperliquid and others.

| Product | What it is (H) | Public machine API | Trade path | Priority |
|---|---|---|---|---|
| **Predictions Network** (thebestpredictionmarkets.com) | Consumer odds-comparison + affiliate site, 10 venues | None documented. Internal `/api/*` exists but robots.txt disallows it | None (affiliate redirects) | skip as runtime adapter; P2 as a recall benchmark |
| **PredictionHero** (predictionhero.com) | Cross-venue analytics web app, 5 venues, paid in-app "Arbitrage" scanner | None public. "API & Data Licensing" is sales-gated; ToS bars scraping | None | skip |
| **Kairos** (kairos.trade) | Trading terminal + data API + execution router over Kalshi, Polymarket, Predict.fun, Hyperliquid | **Yes, free anonymous tier** (`md.kairos.trade`, `data.kairos.trade` public subset) | Yes, via Kairos (3 lanes), but direct-to-venue is cheaper | **P2** (best of the three; cheap read-only integration) |

**Group adapter_priority: P2 (signal-only).** Kairos is the only one worth code: one public endpoint (`GET data.kairos.trade/matched-markets`) gives a free cross-venue matched-pair catalog, and `md.kairos.trade` gives normalized candles, trade metrics and resolution state. Predictions Network and PredictionHero give no usable machine interface and PredictionHero's terms prohibit scraping.

Edge reality check (H, independent audit, section 9): over 4,059 Kalshi/Polymarket/Predict.fun pairs checked on 2026-10-18, only 4 had an edge confirmed after fees, and only 1 was material ($1,056 on a tennis pair). Median cross-venue last-trade gap is 1 cent. These tools surface candidates; they do not surface money.

---

## 1. Still live? (2026)

| Product | Evidence this session | Tag |
|---|---|---|
| Predictions Network | `GET https://www.thebestpredictionmarkets.com/` HTTP 200 (nginx) at 2026-10-19 03:37Z; sitemap index `lastmod` 2026-10-19T03:11Z (all 4 child sitemaps); RSS newest item pubDate 2026-10-19 03:11:43 GMT; SSR compare page JSON-LD `dateModified` 2026-10-19T03:03:18Z | H |
| PredictionHero | `GET https://predictionhero.com/` HTTP 200 (Cloudflare) 2026-10-19 03:37Z; footer "PredictionHero (c) 2026 v 0.45.0" with BETA label; page counters: 33,813 events, 2,795 matched events, 425,485 markets, 24h volume $169,224,468, open interest $1,690,407,484, total volume $145b | H |
| Kairos | `md.kairos.trade/health` returns `{"status":"ok"}`; `/v1/markets?provider=polymarket` HTTP 200 with live market `open_time` 2025-12-23 and `end_date` 2027-01-01; `data.kairos.trade/matched-markets` HTTP 200 returning live Kalshi-Polymarket game pairs closing 2026-10-23; docs index `docs.kairos.trade/llms.txt` HTTP 200; independent audit report dated 2026-10-18 | H |

Staleness flags: PredictionHero Terms say "Last updated: February 1, 2026" (8.5 months, possibly stale but it is the current text) (H). Kairos `kairos.trade/data` dashboard is stamped "Updated August 13, 2026" and is internally inconsistent ($195.8M vs $151M 24h volume for the same date) (H). The Fortune article on Kairos' seed round is dated 2026-02-03 (L, stale).

Task hint check: the hint says thebestpredictionmarkets.com lists 10 venues (H, confirmed: Polymarket, Kalshi, Limitless, Futuur, SX Bet, Gemini, OG Markets, ProphetX, PRED, Foregate in `llms.txt`). The awesome-list blurb says "12 venues" (H, gh api README line 298), a mismatch; the SSR compare page I fetched lists 9 platforms (polymarket, kalshi, limitless, og, smarkets, opinionlabs, foregate, gemini, matchbook), so the real tracked set is wider than the nav (H).

---

## 2. Kind and market model

- **Predictions Network:** independent-looking comparison "desk" with affiliate revenue. Its own text: "never takes bets, holds funds, or acts as a counterparty"; "A market is only published once two or more independent platforms price it"; "Revenue comes from affiliate commissions on outbound links" (H, https://www.thebestpredictionmarkets.com/llms.txt). Market model: none of its own; each `/compare/<slug>` page groups the same event across platforms. The SSR page carries only the title and the list of platforms, no prices (H, fetched `compare/democratic-nominee-for-2028-presidential-election`; fixture).
- **PredictionHero:** "cross-platform prediction market aggregator ... does not run markets, execute trades, or custody funds" (H, https://predictionhero.com/llms.txt). Adds a volume-weighted "PH Consensus" probability, Resolution Divergence Alerts (RDA) and match confidence (H llms.txt; field-level detail M from sibling note `predictionhero.md`, page-state fixture there). Paid Standard plan ($24.95/month) includes an "Arbitrage: Scan events for guaranteed-profit patterns" feature (H, https://help.predictionhero.com/en/articles/14626426-what-are-the-benefits-of-the-standard-plan). I did not subscribe; scanner logic and fee handling are NOT FOUND.
- **Kairos:** "unified trading platform for prediction markets", one API over Polymarket, Kalshi, Predict.fun, Hyperliquid HIP-4 (H, https://docs.kairos.trade/introduction.md). Markets are the venues' own, normalized to market -> outcomes -> contracts; binary and multi-outcome. Venue book shapes: Polymarket and Predict.fun are CLOBs with one independent book per outcome token; Kalshi one merged book; Hyperliquid two-outcome per-side book (M, sibling `kairos.md` from docs websocket page). Prices on `md` are 0-100, order entry 0-1 (M, sibling). Kairos-native constructs (all authenticated): cross-venue routed orders, "Synthetic Books", self-serve cross-venue market links (H, docs index lines for `route-quote`, `route-buy`, `route-close`, "Create (or preview) a self-serve cross-venue market link").
- Outcome tokenisation: not done by any of the three; outcome tokens are the underlying venue's (Polymarket CTF ERC-1155 token ids shown in `md` market metadata, H fixture `kairos_md_v1_markets_polymarket_limit2.json`).

---

## 3. Chains and collateral

None for the two comparison sites (no deposits, no wallets) (H). For Kairos the chain/collateral is the venue's: Polymarket on Polygon (pUSD/USDC), Predict.fun on BNB Chain, Hyperliquid on its L1 with deposits from Arbitrum, Kalshi off-chain USD (docs conflict on whether Kairos reaches Kalshi via the direct API or a Solana route; `/providers/configs` lists Solana) (M, sibling `kairos.md` section 2 and 11). Docs disagree on Predict.fun collateral (USDC vs USDT) (M). Kairos says gas is "Sponsored" on all fee tiers, qualified as "typical, not a billing guarantee" (H, https://docs.kairos.trade/trading/fees.md).

---

## 4. Read API

### 4.1 Predictions Network - none usable

| Item | Finding | Tag |
|---|---|---|
| Official docs / public API | NOT FOUND (searched: robots.txt, llms.txt, sitemap index, nav on home page; sibling note also searched `llms-full.txt`, bundle strings) | H |
| Internal JSON API | robots.txt: `Allow: /`, `Disallow: /api/`, `Disallow: /__seo/` for every named agent. Route literals in the client bundle (`/api/compare/<slug>`, `/api/spreads`, `/api/history/<slug>`, `/api/search`, ...) per sibling note; **not requested by me** | H (robots), M (routes) |
| Machine-readable public files | `llms.txt`, `rss.xml` (40 newest compared markets, title + link + category only), sitemaps (markets sitemap ~5,000 URLs per sibling), SSR compare pages (platform list, no prices) | H |
| Refresh | "Prices refresh hourly and may lag the venue by a few minutes" (bundle terms string, M sibling) | M |
| Auth, rate limits, WebSocket | NOT FOUND (no API documented; no `wss://` string in bundle per sibling) | M |

Base URL for what is public: `https://www.thebestpredictionmarkets.com` (apex `thebestpredictionmarkets.com` also serves). Key usable endpoints: `GET /rss.xml`, `GET /sitemap.xml`, `GET /compare/<slug>` (H). Real response shapes confirmed (fixtures): RSS item `{title, link, guid, pubDate, category, description}`; SSR compare page with `<h2>Platforms pricing this market</h2>` list and JSON-LD `dateModified`.

### 4.2 PredictionHero - none public

| Item | Finding | Tag |
|---|---|---|
| Official public API | NOT FOUND (searched: `/data`, `/pricing`, `/methodology` (client-rendered shells), help-center collections "Data & Sources", robots.txt, llms.txt, llms-full.txt) | H |
| Commercial API (claimed) | https://predictionhero.com/data "API & Data Licensing": real-time probability/price, liquidity, volume, spreads, market depth; "pre-computed arbitrage opportunities across platforms: best execution venue, expected profit, liquidity constraints"; JSON/CSV; Sandbox Environment; "99.9% Uptime SLA". No endpoint, schema, limit, price or key flow is published; it says contact the team | H (claimed), L (works as described) |
| Help center | "A public API or data export feature is available for research or professional use. To learn more, click here or reach out to us" (https://help.predictionhero.com/en/articles/14626770-is-there-an-api-or-can-i-embed-live-odds-on-my-website). Also says data is "sourced directly from leading prediction market platforms via their public APIs" (https://help.predictionhero.com/en/articles/14626751-how-accurate-is-the-data) | H |
| Front-end API | same-origin `/api`; robots.txt `Disallow: /api/` (allows only `/api/og/` share cards) for every agent. Not probed | H |
| Freshness | "High-activity markets may refresh as often as every 60 seconds; lower-volume markets update less frequently" (https://predictionhero.com/llms-full.txt) | H |
| WebSocket | NOT FOUND | - |

No endpoint to GET, so no API response shape confirmed. Public-HTML shapes (JSON-LD and hydration payload) are in the sibling note's fixtures; not an interface and the ToS bars scraping (section 8).

### 4.3 Kairos - official, public free tier, authenticated rest

Hosts and docs (H unless noted): docs https://docs.kairos.trade (machine index `/llms.txt`, 73 KB, HTTP 200 today); OpenAPI at `https://app.kairos.trade/openapi/{market-data-api,data-api,execution}.yaml` (M sibling); Market Data API `https://md.kairos.trade` (beta, public, no key); Data API `https://data.kairos.trade` (public subset; rest needs key); Execution API `https://execution.kairos.trade` (authenticated); market-data stream `wss://stream.kairos.trade` (protobuf, anonymous public tier; handshake 101 confirmed by sibling note, M).

Key public endpoints (H from docs index; behavior confirmed live where marked):
- `GET md/v1/markets?provider=&limit=&cursor=` enumerate active markets for one provider (**live confirmed today**, fixture). `GET md/v1/markets/{provider}/{market_id}` metadata. `POST md/v1/markets/batch`, `POST md/v1/market-identifiers/resolve` (not exercised, POST reads).
- `GET md/v1/marks` last trade price only (up to 200 pairs, heavy bucket); `GET md/v1/candles`, `GET md/v1/trades`, `GET md/v1/trades/metrics`; `GET md/v1/resolutions` (batch resolved fraction), `GET md/v1/markets/{provider}/{id}/resolution` (+ `/resolution/events` timeline).
- `GET data/matched-markets` verified cross-venue pair catalog (**live confirmed today**, fixture); `GET data/matched-markets/enriched` (adds identifiers, outcomes, reference prices; returned empty/503 for sibling; not retried); `GET data/market-clusters`, `GET data/market-links/featured` and `/lookup` (approved links with union book).
- **No REST order-book endpoint** appears in the docs index; depth comes from the WebSocket `orderbook` topic or authenticated `fee-quote` / `route-quote` (M sibling, searched all 3 OpenAPI specs).
- Authenticated and noteworthy: `GET data/.../cross-venue-arbitrage-opportunities-from-the-arb-bets-feed` described as "Server-side proxy to the Arb Bets vendor feed ... Fixed vendor parameters: $100 investment, 1.0% minimum profit. The body is the vendor's payload passed through unchanged" (H docs index line; sibling says first-party-session only, M). The WebSocket `arb` topic is denied on the anonymous tier (M sibling).

Auth and limits (H, https://docs.kairos.trade/market-data/authentication.md): every `/v1/*` md endpoint accepts anonymous requests; anonymous budget `light` 120 units/min, `heavy` 20 units/min per IP; with key 1,200 and 150; partial credential headers give 401 (no silent fallback); "The anonymous tier is a courtesy, not a contract. Kairos can switch it off at runtime." Keys are "issued by the Kairos team during the beta" there, while sibling notes record email signup in the app (conflict, minor). Observed today: md response headers `x-ratelimit-bucket: light`, `x-ratelimit-remaining: 119`, `x-ratelimit-tier: anonymous`, `cache-control: public, max-age=30`; `data.kairos.trade/matched-markets` `x-ratelimit-limit: 30` (docs say 60/min per sibling; plan for 30).

Confirmed response shapes (fixtures under `docs/research/fixtures/predictions-network-predictionhero-kairos-comparison-terminals/`):
1. `md/v1/markets?provider=polymarket&limit=2` -> `{count, exchange_id, has_more, markets[], next_cursor}`. Market keys: `market_id, condition_id, event_id, title, status ("open"), neg_risk, tick_size (0.01), open_time, end_date, fee_type ("crypto_fees_v2"), fees_enabled, taker_base_fee_bps (1000), fee_schedule {rate 0.07, exponent 1, rebate_rate 0.2, taker_only true}, outcomes[{normalized_outcome, outcome, token_id}], image, icon, raw`. No prices in this endpoint (H).
2. `data/matched-markets?limit=100` -> `{pairs[], count, limit, offset, has_more}`; each pair `{a, b, similarity (1.0 on the sample), updated_at}` where `a|b = {provider_id, provider, market_id, title, ticker, image, icon, expires_at, category}` (H; fixture trimmed to 5 pairs). Today's page of 100 raw rows returned only 32 pairs, all Kalshi-Polymarket Sports, because filtering happens after paging; `limit=5` returned `count: 0` with `has_more: true` (H, reproduced). **No outcome-orientation field and no relation type** in the pair (H).

SDK: `@kairos.trade/sdk` (github.com/kairoslive/kairos-sdk, pushed 2026-10-17 per sibling, M). Not cloned or run.

---

## 5. Trade path and PayBox reachability

- **Predictions Network and PredictionHero: none.** Every "Trade" button is an outbound affiliate link (H for both: PN llms.txt "links out to trade there"; PH llms.txt "does not run markets, execute trades, or custody funds"). `paybox_reachable = no` for these two: nothing to sign or propose.
- **Kairos: yes, three lanes, all through Kairos** (H docs read today for lane 2 and 3 gating; detail M sibling `kairos.md` section 4):
  1. Managed wallets: `POST execution/orders` with API-key headers; Kairos holds a delegated signing credential. Needs a Kairos account (email signup at app.kairos.trade) and venue onboarding. For Kalshi you also need your own Kalshi credentials. Custody is a trust question, not purely non-custodial.
  2. External execution (bring your own signer): `POST /v2/orders/intent` returns EIP-712 typed data, you sign, `POST /v2/orders/submit`. Polymarket live; Predict.fun live for EOAs; Hyperliquid "coming soon". Access: "open to any authenticated account ... no allow-list approval is required" (H, https://docs.kairos.trade/external-execution/overview.md, read today). Account creation by wallet alone is out of scope (SIWE only for already-registered addresses).
  3. Wallet API ("Kairos for wallets"): no Kairos account per user; actions via `POST /v3/actions` with wallet signatures (`eth_signTypedData_v4`, `personal_sign`, `wallet_sendCalls`). Needs a partner id: "Contact Kairos to get your partner id, regional node assignment, and production rate limits" (H, https://docs.kairos.trade/partners/integration.md); an unknown partner id returns 403 (H, wallets/reference.md). Embedded onboarding "is not self-serve yet" (H).
- **PayBox reachability: partial.** Lanes 2 and 3 need EVM EIP-712 `typedData` / `personal_sign` / raw digests, which map to PayBox `request_wallet_sign` ops, and PayBox's chain catalog includes Polygon (137), BNB Smart Chain (56) and Hyperliquid (M: `docs/research/06-paybox-platform.md`, H there on 2026-10-19, not re-verified today). A PayBox EVM wallet could therefore sign Polymarket/Predict.fun orders in principle, but: lane 3 needs a Kairos-issued partner id and lane 2 a registered Kairos account (neither obtained, none created by me); approvals are on-chain transactions sent as `wallet_sendCalls` batches in the SDK, which PayBox transaction proposals would have to replace with single `eth_sendTransaction` calls (unverified); Kalshi is not reachable by wallet signing at all; `request_wallet_sign` has no `value_cents`, so PayBox spend policy cannot cap order size (M, doc 06). **Better path: sign directly to the underlying venue (Polymarket CLOB, Predict.fun) and skip Kairos.** That avoids the Kairos platform fee and a third-party dependency.

---

## 6. Fees

- **Predictions Network:** free to read; revenue from affiliates (H). Its "best price after each platform's fee" ranking uses simplified fee text ("Polymarket: No trading fee: only Polygon gas") that conflicts with Polymarket's documented category taker fees (M: sibling note and doc 08). Do not use its fee statements.
- **PredictionHero:** Basic free; Standard $24.95/month (H, help center); API/data licence unpriced (NOT FOUND). Displayed ROI/APY are gross of venue fees (M: sibling worked example, 22c Kalshi contract shows 355% ROI = payout minus stake, no fee).
- **Kairos** (H, https://docs.kairos.trade/trading/fees.md, schedule "last updated 2026-09-02T03:28:36Z"): two charges, both paid by the trader: Kairos platform fee plus the venue's exchange fee, "Never assume either charge is zero". Platform fee = `notional x effective_bps / 10,000`; parabolic tiers: `effective bps = edge + 4 x (center - edge) x p x (1 - p)`. Maker = 0 bps on every tier. Taker (edge/center bps): Starter 10/50 (24.4 bps at 10c, 50 bps at 50c; $0.25 per 100 shares at 50c), Bronze 9/40 (30-day volume $50k), Silver and Gold lower (sibling: 8/30 at $99.9k, 5/25 at $1M, M). `GET /orders/fee-quote` returns platform + venue + all-in (kalshi, polymarket, predictfun). Venue fee example from live `md` metadata: Polymarket crypto market `fee_schedule {rate 0.07, exponent 1, rebate_rate 0.2, taker_only true}` (H fixture). Enterprise API pricing is quoted per credential, unpublished (M sibling).
- Arithmetic (M): routing through Kairos adds roughly 10-50 bps taker per leg on top of venue fees; with a median cross-venue gap of 1 cent, trading each leg directly on its venue is cheaper.

---

## 7. Resolution mechanism and dispute risk

- None of the three resolves anything; each underlying market resolves on its own venue (UMA/Polymarket, Kalshi rules, Predict.fun, Hyperliquid) (H, all three state it).
- Kairos mirrors resolution state read-only (UMA-style `proposed/disputed/resolved`, challenge window, payout numerators) on `md/v1/.../resolution` (H docs index lines; sample status `initialized` for an open market per sibling, M).
- **Matching is the real risk.** PredictionHero: matcher is "semantic title analysis ... entity recognition, time alignment" with a `matchConfidence` field but no published precision; 2,795 of ~30,932 active event groups matched (~9%) (M sibling page state; counter "MATCHED EVENTS: 2,795" H today). PredictionHero RDA text is machine-generated, can be a month old, and should be re-read against both rule texts (M sibling). Predictions Network: matcher unpublished; a search snapshot cited an 88-point gap on the 2028 Democratic nomination, which suggests outcome-mapping errors or empty books (L sibling).
- Kairos catalog audited independently (H, https://github.com/Prediction-Illinois/kairos-cross-venue `reports/latest.md`, generated 2026-10-18 15:28 UTC): 13,262 pairs listed, 13,201 outcome-aligned; not aligned: 33 different dates, 8 team not confirmed, 4 could not line up outcomes, 3 different events, others inactive/finalized. Of 14,885 pairs that settled on both venues in the last 7 days, 14,867 settled the same way (about 99.9%), 18 did not. Hyperliquid: 144 pairs with no live quotes. The catalog's `similarity` is a floor-clamped embedding score and carries almost no information (M sibling: min 0.960, 12,494 of 13,365 equal 1.0).
- Settlement timing differs across venues (Kalshi vs Polymarket expiries differ by calendar date on all 325 pairs carrying both, M sibling); capital is locked until the later resolution. Cross-venue "locked" arbitrage is only riskless if rules truly match.

---

## 8. Geo, ToS, automation

- **Predictions Network:** site is public; robots.txt explicitly allows all named AI agents everywhere except `/api/` and `/__seo/` (H). Terms (bundle strings, "June 2026", M sibling): informational only, hourly refresh, 18+; no clause on scraping/API use found. Its per-platform geo matrix has self-reported `confidence` levels (M sibling). Automation: HTML crawling permitted by robots; JSON API not.
- **PredictionHero:** Terms of Use "Last updated: February 1, 2026" (H, https://predictionhero.com/terms). Quotes: "You agree not to ... Attempt to reverse engineer, scrape, or abuse the platform" (sec. 6); "You may not copy, reproduce, distribute, or create derivative works without prior written consent, except for personal, non-commercial use" covering "data compilations" (sec. 7). robots.txt is crawler-friendly (`Allow: /`, `Content-Signal: ai-train=yes`) but disallows `/api/` and `/search?`; the ToS is stricter and governs for us. **No sanctioned automated access short of a written licence.**
- **Kairos:** geo gating is server-side on every request and fails closed (H, https://docs.kairos.trade/compliance/geo-restrictions.md): globally blocked AF, BY, CD, CF, CU, ET, IQ, IR, KP, LB, LY, ML, MM, NI, RU, SD, SO, SS, UA, VE, YE, ZW (OFAC); US blocked for Polymarket and Predict.fun only (M sibling). Underlying venue ToS also apply. Programmatic trading is a first-class use (API keys, WebSocket orders, partner lanes). **Terms of service: NOT FOUND**: `https://kairos.trade/terms` returns HTTP 404 today (H); sibling found the app's terms URL an unreadable shell. So redistribution and storage rights for catalog/market data are unknown, which matters if we persist Kairos data.
- Anonymous Kairos tiers are revocable at will (H, quoted above).

---

## 9. Liquidity

None of the three has its own liquidity (TVL/OI: not applicable). Numbers below are venue-level or tool-reported, not tradable depth.

| Figure | Value | Source and date | Tag |
|---|---|---|---|
| PredictionHero reported (aggregate over 5 venues) | 33,813 events; 425,485 markets; 2,795 matched; 24h volume $169.2M; open interest $1.69B; total volume $145b | page counters, predictionhero.com, 2026-10-19 ~03:37Z | H (as PH reports; 24h volume looks low vs Kalshi + Polymarket alone, so definition is partial, M) |
| Kairos dashboard (venue-level, not Kairos flow) | Kalshi 24h volume $155.4M, OI $1.37B, 125,366 live markets; Polymarket 24h $40.4M, 7d $195.7M, OI $352.4M, 35,683 live markets; Predict.fun, Robinhood, Crypto.com, PredictIt, Novig, ProphetX "not covered" | https://kairos.trade/data, stamped "Updated August 13, 2026" (2+ months old; page contradicts itself: $151M / $1.22B in body text) | H (stale, inconsistent) |
| Kairos own volume, users, OI | NOT FOUND (searched: kairos.trade/data, docs introduction, enterprise page via sibling, Fortune Feb 2026 via sibling) | - | - |
| Kairos matched-pair catalog | 13,262 pairs listed in the 2026-10-18 audit: Polymarket-Predict.fun 10,643 (sum of the audit's division rows; mostly mirror listings of identical titles per sibling), Kalshi-Polymarket 2,150, Kalshi-Predict.fun 320, Hyperliquid pairs 149 (68 + 56 + 25). Sibling live walk 2026-10-19 counted 13,365 live pairs (Kalshi-Polymarket 2,369) | audit report 2026-10-18 (H); sibling walk 2026-10-19 (M) | H/M |
| Depth reality | 8,979 pairs with a Predict.fun side have no Predict.fun trade yet (unpriceable) (H, "Not priced: no Predict.fun trades yet 8,979" in the audit). Median 24h volume of markets that traded in the audit samples: Kalshi sports $69,758 (3 of 8 traded), Polymarket sports $387 (4 of 39), Predict.fun sports $68 (4 of 33) (M: from sibling `kairos.md`; that part of the report was not in my truncated read) | audit report 2026-10-18 | H/M |
| Predictions Network | no volume or traffic figure published; markets sitemap ~5,000 URLs (looks like a cap) | sibling (M) | M |

---

## 10. Event categories that overlap other venues (where arbitrage exists)

- **Sports dominates everything.** Kairos catalog: Kalshi-Polymarket pairs are Sports only (all 32 pairs on today's live page were Sports, H); Polymarket-Predict.fun adds politics (456), crypto (373), economics/finance (285), tech/science (141) per the audit (H), but those are mirror listings with the Predict.fun side mostly untraded; there are no Kalshi pairs for politics, macro or crypto (H, audit division table). Audit confirmed-edge counts: Politics 2 of 188, Sports 2 of 3,344, Crypto 0 of 272, Economics 0 of 189, Tech 0 of 66 (H); confirmed edges total $1,056.62 (one tennis pair, 21,036 contracts, closes 2026-10-26) plus two Polymarket-Predict.fun politics pairs at $0.23 each. Median gap 1.0 cent in sports, 2.0 cents in crypto and tech (H).
- PredictionHero multi-venue groups (M sibling): 2028 US presidential winner and nominees (all five venues), US midterms, NFL games, Fed decision, French/Brazilian presidential elections, F1, US recession by end of 2026; its category taxonomy has 18 categories (H llms.txt).
- Predictions Network: sports/esports head-to-heads plus 2028 politics, crypto targets, a few tech/legal items (H categories in RSS: world, crypto, politics, sports, entertainment, economics; compare-page sample M sibling).
- All three overlap the venues we already cover natively (Polymarket, Kalshi, Limitless, Predict.fun, Opinion). They add no new independent venue except: Predictions Network's list contains Gemini, OG Markets, ProphetX, PRED, SX Bet, Futuur, Foregate, Smarkets, Matchbook (separate venue specs exist), and Kairos adds Hyperliquid HIP-4 outcome markets (separate venue specs exist in this repo).

---

## 11. Shared liquidity (independence)

- All three: **zero independent liquidity**. Every leg settles on an underlying venue.
- Predictions Network inflates its venue count with pass-throughs: its own registry marks `plus500` as `family: kalshi` and `predictstreet` as `family: matchbook` (H fixture from sibling bundle excerpt, grep confirmed `family:"matchbook"` and `family:"kalshi"` today); sibling note finds Foregate is a Polymarket-backed pass-through (23 of 24 sampled pages listing Foregate also list Polymarket, M).
- Kairos: Polymarket-Predict.fun pairs are largely mirror listings of the same question (10,511 of 10,557 identical titles, M sibling), and its union/"NBBO" book merges the same venues' books (H docs index "union order book").
- PredictionHero consensus is a volume-weighted blend of venue prices (H llms.txt); Polymarket + Kalshi are 94% of its cumulative volume (M sibling), so "consensus" is mostly those two.

---

## 12. Adapter priority and recommended handling

**P2 (signal-only)** for the group. Rationale:
1. No independent liquidity in any of them; the aggregation layer should never count them as a leg.
2. Machine access: Kairos only. PN's JSON API is robots-disallowed and undocumented; PH's is sales-gated with a ToS that prohibits scraping.
3. Edge is thin: 1-cent median gaps; 4 confirmed profitable pairs of 4,059 after fees, mostly sub-dollar (H audit).

Recommendations:
- **Kairos (P2, build only the cheap read-only part):** offset-walk `GET data.kairos.trade/matched-markets` (throttle at or below 30 req/min, expect empty early pages and 409/503 on cursor mode per sibling) as a *weak-label* input to our own market linking (`docs/market-linking-design.md`); never trust `similarity`; derive outcome orientation ourselves; pin rule-text hashes. Optionally use `md.kairos.trade` for candles/trade metrics/resolution lifecycle; use venue-native APIs for books and execution-grade quotes. Do not depend on the anonymous tier in production (revocable) and get written terms before persisting its data.
- **Predictions Network (skip as adapter):** at most an offline, low-rate (<=1 req/s) harvest of `sitemap-markets.xml` / `rss.xml` slugs and platform membership as a recall benchmark for our linker. No prices available; do not touch `/api/`.
- **PredictionHero (skip):** human cross-check only; revisit if the operator offers a written data licence with docs and a sandbox key.
- Peers discovered for follow-up (M, one WebSearch result list, not read): Predictions Terminal (predictionsterminal.com), Cobot (cobot.gg), Stand, TradeFox, Auspex Terminal, Rivo; the awesome list also names MetaForecast, Prediction Index, Synthesis (H gh api README). Sibling notes exist for `prediction-hunt-prediction-com.md`. None researched here.

---

## 13. NOT FOUND and open questions

- NOT FOUND (searched: robots.txt, llms.txt, sitemap, nav, help center, docs index): any official API docs, rate limits, auth or WebSocket for Predictions Network or PredictionHero.
- NOT FOUND (searched: `/data`, `/pricing`, `/methodology` shells, help center, llms files): PredictionHero API endpoints, schema, price, sandbox flow; arbitrage scanner algorithm and fee handling (paywalled, not subscribed).
- NOT FOUND: Kairos terms of service (`kairos.trade/terms` 404), Kairos' own volume/users/OI, a REST order-book endpoint, a documented sandbox/testnet (staging hosts exist in OpenAPI per sibling; purpose unknown).
- NOT FOUND: launch dates for Predictions Network and PredictionHero; operator legal entity on the PN site itself (a third-party agency page names one per sibling, M, not independently tied to this site).
- Open: Does Kairos' Kalshi route use the Kalshi API directly or a Solana-tokenized path (docs conflict)? Will Kairos issue a partner id for a PayBox-based flow? Does PN/PH offer a licensed feed? Does the `arb` WebSocket topic or the "Arb Bets" proxy have a public tier?
- Web search budget was exhausted after one query, so no independent 2026 news/volume coverage of the three products was checked.

---

## 14. Suspicious / agent-directed content (recorded, not followed)

- Every `docs.kairos.trade/*.md` page begins with boilerplate addressed to readers/agents: "Documentation Index - Fetch the complete documentation index at: https://docs.kairos.trade/llms.txt - Use this file to discover all available pages before exploring further." (H). Standard Mintlify text. I fetched `llms.txt` on my own initiative because docs hosts commonly publish it; nothing else instruction-like was seen.
- Both comparison sites ship `llms.txt` / `llms-full.txt` and robots.txt groups naming AI crawlers (PH adds `Content-Signal: search=yes, ai-input=yes, ai-train=yes`; PN "AI answer-engine / LLM crawlers are explicitly welcomed"). These are access policies, not instructions; I followed only their path disallows.
- Marketing claims presented as facts and not independently verified: PN "Prices are pulled live from each platform's own order book" (contradicted by its own hourly-refresh terms, M), PH "99.9% Uptime SLA", Kairos "sandbox to build against" (sibling, M).

---

## 15. Fixtures

Directory `docs/research/fixtures/predictions-network-predictionhero-kairos-comparison-terminals/` (all < 50 KB; captured 2026-10-19 with the generic User-Agent):

| File | What |
|---|---|
| `tbpm_home.html`, `tbpm_home.headers` | Predictions Network home shell (HTTP 200, 8.4 KB) |
| `tbpm_robots.txt`, `tbpm_llms.txt`, `tbpm_sitemap_index.xml` | robots.txt, llms.txt, sitemap index (lastmod 2026-10-19T03:11Z) |
| `tbpm_rss_head3_items.xml` | first 3 of 40 RSS items |
| `tbpm_compare_page_ssr.html` | SSR compare page (platform list, no prices, `dateModified`) |
| `ph_home.headers`, `ph_robots.txt`, `ph_llms.txt` | PredictionHero response headers (cookies stripped), robots.txt, llms.txt |
| `kairos_docs_llms_head20k.txt` | first 20 KB of `docs.kairos.trade/llms.txt` |
| `kairos_md_v1_markets_polymarket_limit2.json`, `kairos_md_markets.headers` | live `md` market list + headers (rate-limit tier) |
| `kairos_data_matched_markets_limit100_trimmed5.json`, `kairos_matched.headers` | matched-pair catalog page trimmed to 5 pairs, headers (`x-ratelimit-limit: 30`) |

---

## 16. Sources

Primary (H, all fetched 2026-10-19 unless stated):
- https://www.thebestpredictionmarkets.com/ , /robots.txt , /llms.txt , /sitemap.xml , /rss.xml , /compare/democratic-nominee-for-2028-presidential-election , /terms (HTTP 200, client-rendered, not read)
- https://predictionhero.com/ , /robots.txt , /llms.txt , /llms-full.txt , /data , /terms , /pricing and /methodology (client-rendered shells with site counters)
- https://help.predictionhero.com/en/ and articles 14626426 (Standard plan), 14626751 (data accuracy), 14626770 (API / embeds)
- https://docs.kairos.trade/llms.txt , /introduction.md , /trading/fees.md , /compliance/geo-restrictions.md , /wallets/overview.md , /wallets/reference.md , /partners/integration.md , /external-execution/overview.md , /market-data/authentication.md
- https://md.kairos.trade/health , /v1/markets?provider=polymarket&limit=2 ; https://data.kairos.trade/matched-markets?limit=5 and ?limit=100
- https://kairos.trade/data (WebFetch summary), https://kairos.trade/terms (404)
- https://github.com/Ong-pogs/awesome-prediction-market-apis (README lines ~298-304, via `gh api`)
- https://github.com/Prediction-Illinois/kairos-cross-venue `reports/latest.md` (generated 2026-10-18 15:28 UTC, via `gh api`)

Secondary / sibling notes in this repo (M; first-hand there, not re-verified here): `docs/research/venues/predictions-network-thebestpredictionmarkets-com.md`, `docs/research/venues/predictionhero.md`, `docs/research/venues/kairos.md`, `docs/research/06-paybox-platform.md`, fixture `docs/research/fixtures/predictions-network-thebestpredictionmarkets-com/bundle-platform-registry-excerpt.js`.

One WebSearch (extended) "Predictions Network prediction market aggregator terminal" returned peer-product names (M, not opened): predictionsterminal.com, cobot.gg, polymark.et listings (Stand, TradeFox), predictionmarket.tools, kairos.trade/blog/prediction-market-terminal. A second search (PredictionHero) was refused by the session search budget.
