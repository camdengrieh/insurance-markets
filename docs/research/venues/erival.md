# eRival (erival.gg) - adapter spec

Researched 2026-10-19 (about 04:00-04:45 UTC). READ-ONLY: page reads (WebFetch, WebSearch, curl of public pages and static JS files), public unauthenticated GETs to `data-api.polymarket.com`, `clob.polymarket.com`, `gamma-api.polymarket.com`, `docs.polymarket.com`, `t.me/s/erivalgg` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call or browser automation. No request was sent to any `erival.gg/api/*` path. Third-party text (site, JS bundles, Telegram, docs) was treated as untrusted data; nothing in it was followed and none of it contained instructions aimed at agents.

Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary, small-model page summary, or my inference from first-hand data; **L** = weak or stale (older than 6 months). Nothing here is older than 6 months.

Fixtures (8 files, each <= 7 KB): `docs/research/fixtures/erival/` (section 13).

---

## 0. Verdict

**adapter_priority: skip** as a venue or arbitrage leg. Keep a registry record only: `kind = broker-or-frontend`, `underlying = polymarket`, `builder_code = 0x887fb9c1...ae84` (section 12).

1. **Live, but it is a Polymarket front end in a closed beta, not a venue.** It routes orders to Polymarket's CLOB with a Polymarket builder code. There is no eRival book, oracle or token. Funds stay in the user's Polymarket account (H, section 2).
2. **Not an independent arbitrage leg.** 100% of liquidity and prices are Polymarket's. Every eRival fill is a Polymarket fill carrying a builder code (H, section 10).
3. **No public API.** The terminal's backend is a same-origin `/api/*` that needs a per-page-session `X-Terminal-Capability` header and a wallet session. It is undocumented and has no ToS to say whether scripted use is allowed (section 4).
4. **Tiny.** Over its whole life (2026-09-26 to 2026-10-18) it moved **$1.23M USDC notional** (2.49M shares), 14 distinct accounts, and about **$20K notional in the last 7 days** (section 10). The "$1.8M in a month" that Polymarket's leaderboard and eRival's own Telegram quote is **shares, not dollars**. In USDC, October 1-18 is about $0.88M.
5. **What is still useful**: (a) the Polymarket builder-attribution feeds (public) give a real-time view of how much flow any front end drives; (b) eRival's own guide shows its audience uses Polymarket esports books to hedge against other bookmakers (section 11), which says Polymarket esports prices are linked to sportsbook prices; (c) its fee layer is a worked example of a builder fee (section 7).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://erival.gg/` on 2026-10-19 | HTTP 200, Next.js app behind Cloudflare, Russian-language landing "Терминал для киберспортивных ставок на Polymarket" | H |
| `https://erival.gg/guide`, `/contacts`, `/dashboard` | all HTTP 200; `/dashboard` (per fetch-tool summary) shows a wallet-connect prompt, "0 markets" and a cold stream until a wallet session exists | H for 200s, M for dashboard state |
| Polymarket `GET /v2/builders/volume?interval=day` | eRival rows for every day 2026-09-26 .. 2026-10-18 (23 rows) | H |
| Polymarket `GET clob /builder/trades?builder_code=...` | newest trade 2026-10-18 22:56:26 UTC; first trade 2026-09-26 | H |
| Polymarket builders leaderboard | "eRival.gg", `verified: true`, rank 34 by MONTH, rank 93 by WEEK (not in DAY for 2026-10-19), rank 112 ALL | H |
| Telegram `https://t.me/s/erivalgg` | channel created 2026-10-14 18:27 UTC; one real post 2026-10-17 15:17 UTC: "eRival официально верифицирован Polymarket ... Результаты первого месяца закрытой беты ... больше $1,8 млн ... 34-е место". Preview shows 2 subscribers. | H |

**still_live = true**, with caveat: the operator itself calls it a **closed beta** (H). Whether the dashboard is open to any MetaMask wallet or allow-listed is unknown (NOT FOUND: no statement on the site; searched `/`, `/guide`, `/contacts`, Telegram preview).

Launch date: first attributed trade 2026-09-26 (H, builder trades), so about 3.5 weeks old.

---

## 2. Kind and market model

- **Kind (H):** broker/front end ("terminal") for Polymarket esports and a few combat sports. Landing: "Деньги остаются на вашем аккаунте Polymarket"; guide: "Депозит и вывод - на polymarket.com. Терминал только для торговли."
- **Market model:** Polymarket's. Binary Yes/No conditional tokens on the Polymarket CLOB, shown as team A vs team B with decimal odds (price 0.49 shown as 2.04x). Fast mode = FOK market buy sized against the visible asks; Pro mode = Polymarket order book with limit buy/sell and "buy at take" (H, guide).
- **Games listed (H, guide + dashboard):** CS2, Dota 2, LoL, Valorant, UFC, boxing. Match winner ("Moneyline") and per-map winner lines ("Map 1 Winner"); the bundle also names a `map_2` line type (M).
- **Tokenisation:** Polymarket conditional tokens, 6 decimals; contract addresses in the bundle (V2 exchange `0xE111180000d2663C0091e4f400237545B87B996B`, neg-risk exchange `0xe2222d279d744050d28e00520010520000310F59`) match MetaMask's integration and Polymarket's published V2 set (M, bundle chunk `458-...js`; authoritative list belongs to the Polymarket spec).
- **Sample underlying market (H, Gamma, 2026-10-19):** event `cs2-prv-mgc-2026-10-19`, market "Counter-Strike: PARIVISION vs magic - Map 1 Winner", `sportsMarketType: child_moneyline`, tick 0.01, `orderMinSize` 5, `negRisk: false`, `feeSchedule {exponent 1, rate 0.05, takerOnly true, rebateRate 0.15}`. Fixture 7.

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Polygon only (bundle references `polygon-rpc.com`, polygonscan, chainId 137) | M (bundle) |
| Collateral | Polymarket's (pUSD in V2, per Polymarket docs and MetaMask note; the site text says only "баланс на Polymarket") | M |
| Deposit / withdraw | on polymarket.com, not in eRival | H (guide) |
| Wallet | "Вход через MetaMask - без регистрации" (browser wallet via `window.ethereum`). Same wallet as on polymarket.com | H (landing, guide) |
| Account type | Polymarket Deposit Wallet signed with signature type `POLY_1271`; bundle also accepts signature types 0-3 (EOA, proxy, Safe, 1271) | M (bundle) |

## 4. Read API

**Official public read API for eRival: none.** NOT FOUND (searched: landing, `/guide`, `/contacts`, footer, `robots.txt` (comments only, no rules), no `sitemap.xml` (404), no docs/developers/API link anywhere, Telegram preview, web search "eRival.gg"). No rate limits, no OpenAPI, no SDK.

What exists is an internal backend (M, from reading the public JS chunks only; **none of these paths were requested**):

- Every call goes through `terminalFetch`, which only accepts same-origin `/api/...` paths and adds headers `X-Terminal-Capability` and `X-Terminal-Account` (value `guest` when not connected). The capability value comes from the page session, so a bare `curl` is not a supported client.
- Path inventory (fixture 5): `/api/markets/esports`, `/api/markets/metadata`, `/api/orderbook`, `/api/market-stream` and `/api/public-trades/stream` (SSE), `/api/account/summary`, `/api/order/fok`, `/api/order/burst`, `/api/order/manage`, `/api/builder/fees`, `/api/auth/*`, `/api/session-key/*`, `/api/signer/*`.
- The market list and books are just Polymarket data (Gamma esports filter plus CLOB book) re-served. An aggregator gets the same data first-hand from Polymarket, so there is nothing to gain from the eRival backend.

**Useful public data that does exist (H, unauthenticated GET, 2026-10-19), all on Polymarket hosts:**

| Purpose | Endpoint | Notes |
|---|---|---|
| Builder rank and volume | `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day\|week\|month\|all&limit=200` | rows `{rank, builder_name, builder_code, verified, volume, active_users}`; `volume` is **shares** per docs. Cursor pagination (`pagination.next_cursor`). Fixture 1. |
| Builder volume over time | `GET .../v2/builders/volume?interval=day\|week&limit=<buckets, max 90>` | one row per builder per bucket. 5.9 MB for 90 daily buckets: filter client-side. Fixture 2. |
| Legacy | `GET .../v1/builders/leaderboard?timePeriod=MONTH` and `/v1/builders/volume` | **Data API v1 is retired on 2026-10-24** (H, docs.polymarket.com migrate page). Fixture 3. |
| Per-trade attribution | `GET https://clob.polymarket.com/builder/trades?builder_code=<code>&next_cursor=<opaque>` | Public, no auth, 300 rows per page, offset-style cursor (`MzAw` = base64 "300"). Row has `tradeType` TAKER/MAKER, `side`, `size` (shares), `sizeUsdc`, `price`, `market` (conditionId), `assetId`, `builderFee`, `feeUsdc`, `builderCode`, `matchTime`. Contains third-party trader account fields (not copied). Fixture 4. The docs I read describe this as "public builder trade history, filtered by builder code" in the SDK migration notes but do not print the HTTP path; the path is what I called and it answered 200 (H for response, M that it is the supported route). |

eRival's builder code: `0x887fb9c12a401879896f42a828178d0c29094df17a6e22a3475cfaeb2362ae84` (H, Data API leaderboard, same value in v1 and v2, and in every trade row).

Auth/limits: none for the above; rate limits not measured (13 sequential page requests at about 0.7 s spacing succeeded).

Websocket: none from eRival (it uses SSE internally, bundle). Polymarket's own sockets apply (see Polymarket spec).

## 5. Trade path

**Official programmatic order placement on eRival: none.** The only supported path is the browser UI with MetaMask. For an agent, the trade path is Polymarket directly (CLOB V2, EIP-712 orders, optional `builderCode` on each order); see the Polymarket spec.

How the terminal itself works (M, reverse-engineered from the public bundle; treat as unverified):

1. Login: `/api/auth/challenge` returns a nonce; the wallet signs the Polymarket `ClobAuth` EIP-712 message ("This message attests that I control the given wallet"), `/api/auth/connect` returns a session.
2. "Enable trading": `/api/session-key/prepare` returns typed data; the user signs it in MetaMask; it authorizes a **session signer** on the user's Polymarket Deposit Wallet. Custody of that session key is `browser` (private key generated in the page and stored in browser storage as JSON) or server-held (`configuredCustody`).
3. Orders: the session key signs Polymarket V2 orders locally (signature type POLY_1271, `builderCode` field set to eRival's code, FOK for Fast mode, 4 pre-signed FOK orders for a "burst" submit), and the page posts them to eRival's `/api/order/fok` or `/api/order/burst`; eRival relays to Polymarket. Cancel is `DELETE /api/order/manage`.
4. Polymarket docs on session keys (H, docs.polymarket.com/trading/session-keys): a session key "cannot withdraw funds from the Deposit Wallet", lasts 180 days, can be scoped to CLOB, and is revoked by an on-chain transaction. Authorizing one needs a Builder API key held by the integrator.

Trust consequence (M): a user hands eRival (or their own browser storage) a 180-day trading-only key for their Polymarket wallet. Loss is bounded to trading losses/wash-trading, not withdrawal, but it is a real delegation.

## 6. PayBox reachability

**No, for eRival as a venue.** Reasons:

- No API: the backend requires a browser page session capability and a MetaMask `window.ethereum` login. Driving it from an agent means scripting an undocumented private API with no ToS permission (section 9).
- It adds nothing an agent needs: the same markets, books and fills are available at Polymarket directly, and builder attribution only changes who earns a 10-20 bps fee.
- A PayBox EVM wallet could in principle sign the `ClobAuth` login message via a typed-data signing request, but that is the Polymarket L1 auth, which the Polymarket adapter already needs. Reaching Polymarket via PayBox (Polygon, EIP-712 order signing, Deposit Wallet or EOA, session-key option) is analysed in `docs/research/08-venues-polymarket-kalshi.md` and is out of scope here.

**partial** would apply only to the underlying Polymarket flow; for this venue the answer is **no**.

## 7. Fees

All numbers are for the esports/combat markets eRival lists. The user pays; builder fee is additive to Polymarket's fee (H, docs.polymarket.com/programs/builders/fees).

| Component | Value | Tag |
|---|---|---|
| Polymarket taker fee | `fee = C x feeRate x p x (1 - p)`, C = shares, p = price. Esports Gamma `feeSchedule` on 2026-10-19: `rate 0.05, exponent 1, takerOnly true, rebateRate 0.15`. At p = 0.50 that is 2.5% of notional; at p = 0.91 it is 0.45% | H (docs formula, Gamma sample); note a few non-match esports props show `rate 0.03, rebateRate 0.25` |
| Polymarket maker fee | none ("Makers are never charged fees"); the market's `feeSchedule` carries `rebateRate 0.15` for maker rebates (exact base not stated in what I read) | H |
| eRival builder fee, advertised | landing: "Минимальные комиссии терминала: maker 0.1% . taker 0.2%". Polymarket caps builder rates at **100 bps taker / 50 bps maker**, 1 bp granularity, one change per 7 days, effective 3 days later | H |
| eRival builder fee, observed | in the 300 newest trade rows (2026-10-15..18) `builderFee / sizeUsdc` = **about 10 bps on both TAKER (230 rows) and MAKER (70 rows)**; none at 20 bps. Over the full history: $0 builder fee on all rows before 2026-09-29, then about 10 bps; total fee revenue **$859.8** on $1.23M notional (7 bps blended) | H (computed, fixture 8) |
| Example (observed row) | $500 taker BUY at 0.91: `feeUsdc` 2.75 = Polymarket fee about 2.25 + builder fee 0.50 (0.10%) | H for row, M for the decomposition |
| Gas / deposits | none charged by the terminal; deposits/withdrawals are on Polymarket | H (guide) |

Mismatch to resolve (open question 3): advertised taker 0.2% vs observed 0.1%. "Минимальные" ("minimum") suggests tiers or a dynamic `/api/builder/fees`.

Round-trip taker cost at p = 0.5 is about 5% (2 x 2.5%) plus builder fee: an arbitrage leg needs a limit/maker entry to be viable. That applies to Polymarket esports in general, not to eRival specifically.

## 8. Resolution and dispute risk

eRival has no resolution layer. Markets resolve by Polymarket's mechanism (see `docs/research/08-venues-polymarket-kalshi.md` section 2.10: UMA Optimistic Oracle with proposal/dispute, undisputed about 2 h, disputed 4-6 days, 50-50 outcome possible).

Esports specifics from the sample market's Gamma record (H, 2026-10-19): `resolutionSource: https://hltv.org`; "If the match is canceled (not played at all) or ends in a tie, this market will resolve to 50-50"; a postponed match must restart within 14 days or it resolves 50-50; for map markets "If Map 1 is not completed for any reason, this market will resolve 50-50"; `umaBond 250`, `umaReward 1.5`. Aggregator implication: model 50-50 as a distinct outcome for esports legs; a forfeit/walkover is the main tail risk.

eRival adds one operational risk: Polymarket "may disable a builder code at any time ... orders carrying a disabled code will be rejected by the CLOB" and may revoke fee rights (H, builder fees doc). The bundle has explicit error strings for "builder code disabled" (M).

## 9. Geo, ToS and automation

- **eRival's own rules: NOT FOUND** (searched: landing, `/guide`, `/contacts`, footer, Telegram preview). No Terms of Service, privacy policy, legal entity, jurisdiction list, age gate, or automation/bot clause. Only the claims "НЕ ЗАПРАШИВАЕМ ВАШИ ПРИВАТНЫЕ КЛЮЧИ!" and "Деньги остаются на вашем аккаунте Polymarket" (H). Contacts: an official Telegram channel and one personal Telegram handle for "questions and cooperation" (not copied here).
- **Polymarket's rules apply underneath.** The order ticket has a `geoBlocked` prop (M, bundle), so geoblocking is wired in. Per the sibling note (M for this task, not re-verified): Polymarket treats **RU as close-only on frontend and API**, plus other jurisdictions; geoblock is by request IP; third-party apps must not execute for users in restricted places. eRival is Russian-language and has no geo statement, so its users' eligibility is a compliance risk that is not eRival's to fix and not ours to inherit.
- **Automation**: Polymarket's builder terms reserve the right to revoke fees for "automated, self-referred, or other non-bona fide trading activity" (H, builder fees doc, quoted sparingly). No eRival statement either way. Do not build against eRival's private `/api`.
- robots.txt contains only Cloudflare "content signals" boilerplate comments and no User-agent/Disallow rules (H).

## 10. Liquidity

Source for all rows: Polymarket builder-attribution feeds and trades, pulled 2026-10-19 (H, fixtures 1-4, 8).

| Metric | Value |
|---|---|
| Whole life, 2026-09-26 .. 2026-10-18 | 3,846 trade rows (maker + taker side), **$1,230,430 USDC notional**, 2,489,571 shares, 396 distinct markets, 14 distinct trader accounts |
| Units check | Data API v2 `volume` for the same period is 2,487,970. That equals the **share** count, and docs say "`volume` is builder-attributed trading volume in shares". builders.polymarket.com labels the column "1m Volume" with a `$` and no unit; eRival's Telegram repeats "$1.8M". The USDC figure for Oct 1-18 is about $0.88M, for Sep 26-30 about $0.35M. |
| Monthly (leaderboard) | Oct 2026 to date: 1.83M shares, 10 active users, rank 34; Sep 2026: 0.66M shares, 7 users, rank 69 |
| Weekly (Sun-start buckets, shares) | w/c 09-27: 1.13M; 10-04: 0.80M; 10-11: 0.54M; 10-18 (1 day): 4.6K |
| Last 7 days (Oct 12-18) | about **$20K USDC**; 1-5 accounts per day; daily range $0.7K-$7.6K |
| Peak day | 2026-10-11: $220,846 notional, 7 accounts, 769 rows |
| Share of builder-attributed volume | about 0.3% (w/c 10-11: 0.54M of 176M shares) |
| Trend | falling sharply after 10-11; the product's own growth claim ("дальше больше") is not visible in the last week |

Underlying Polymarket esports depth, for context (Gamma, 2026-10-19, top 15 esports events by 24h volume): the largest event (LoL Worlds winner) had $201K 24h volume and $1.9M liquidity; typical CS2/LoL match events had $5K-$114K 24h volume and $15K-$131K book liquidity. That is the real size of the tradeable market regardless of front end (M, one 15-event sample).

**liquidity_shared_with: Polymarket (100%).** Not an independent arbitrage leg.

## 11. Event categories and overlap

- **Categories**: esports (CS2, Dota 2, LoL, Valorant), UFC, boxing (H, guide and dashboard).
- **Overlap with other prediction venues**: esports match markets are rare outside Polymarket; I did not check Kalshi, Polymarket US or others for esports (NOT CHECKED, belongs to those venue specs). UFC/boxing may overlap with other regulated venues (L, unverified).
- **Overlap that matters**: traditional sportsbooks. eRival's guide example 3 is titled "Вилка с другой БК" ("fork/arb with another bookmaker"): "В другой БК стоят ставки на обе команды ... Дозакрываю позицию на Polymarket лимитками по лучшему кф" (H, `/guide`). The terminal markets itself to bookmaker-arbitrage traders. Implication for the aggregator: Polymarket esports prices are likely linked to sportsbook odds (M), so a sportsbook odds feed, not another prediction market, is the natural second leg for this category.
- **Market linking note**: market identity is Polymarket's `conditionId`/`clobTokenIds`; eRival adds no ids of its own. Odds are displayed as decimal `1/price` including fees, so never ingest eRival-displayed odds as prices.

## 12. Adapter priority and what to do instead

**skip** (as an adapter). Reasons: no public API, 100% shared liquidity, closed beta, 14 accounts ever, about $20K in the last week, no ToS. It is also weak as a signal source: whatever esports order flow it carries is already visible in Polymarket's own book and trade feeds.

Cheap things worth doing:

1. Registry record (platform-registry design): `{slug: erival, kind: broker-or-frontend, underlying: polymarket, builder_code: 0x887fb9c1...ae84, url: https://erival.gg, status: live-closed-beta}`; dedupe to Polymarket liquidity.
2. Attribution monitor (optional, near-free): poll `v2/builders/leaderboard` daily to see whether eRival or any other front end grows; skip v1 (retired 2026-10-24).
3. If the Polymarket adapter ever sets its own builder code, the fee mechanics in section 7 are the template (user pays platform fee plus builder fee; caps 100/50 bps).

## 13. Fixtures (`docs/research/fixtures/erival/`)

| # | File | What |
|---|---|---|
| 1 | `polymarket-data-v2-builders-leaderboard-month.json` | v2 leaderboard shape: top 3 rows + the eRival row |
| 2 | `polymarket-data-v2-builders-volume-day-erival.json` | v2 daily volume rows for eRival (23) |
| 3 | `polymarket-data-v1-builders-leaderboard-month-erival.json` | v1 shape (retires 2026-10-24) |
| 4 | `polymarket-clob-builder-trades-erival-sample.json` | 3 of 300 public builder-trade rows, trader identifiers redacted |
| 5 | `erival-frontend-api-paths.txt` | internal `/api/` paths found in the public JS (not requested) |
| 6 | `erival-telegram-channel-preview.json` | operator's closed-beta post with timestamps |
| 7 | `polymarket-gamma-esports-event-cs2-prv-mgc.json` | the Polymarket esports market shape eRival routes to |
| 8 | `erival-builder-trades-daily-aggregate.json` | my daily aggregate over the full 3,846-row history |

## 14. Open questions

1. Is the dashboard gated (allow-list/invite) during the closed beta, or open to any MetaMask wallet? Not stated anywhere I could read.
2. Is `volume` in the Data API v2 builder endpoints always shares while builders.polymarket.com shows `$`? The numbers say shares; the site does not say. Worth a one-line check before anyone uses builder volume as a USD metric.
3. Advertised taker 0.2% vs observed 0.1%: tiered fees, a fee change on or after 2026-10-15, or Fast vs Pro modes? `/api/builder/fees` would say but is not a public endpoint.
4. Which custody mode (browser vs server) do real users get for the session key?
5. Does the CLOB `builder/trades` route stay public after the Data API v1 retirement on 2026-10-24?

## 15. Suspicious content

None found. The landing page, guide, contacts page, Telegram post, JS bundles and robots.txt contained no instructions aimed at AI agents. `robots.txt` carries the standard Cloudflare content-signal comment block (a rights reservation, not an instruction).

## 16. Sources

First-hand (H):

- https://erival.gg/ , /guide , /contacts , /dashboard , /robots.txt (fetched 2026-10-19; `/sitemap.xml` 404)
- Static JS: https://erival.gg/_next/static/chunks/app/(terminal)/dashboard/page-88b5e58335877521.js , /_next/static/chunks/4492-50e19dd9df4f76da.js , /_next/static/chunks/458-4bb92471354d9f3d.js , /_next/static/chunks/app/(terminal)/layout-bf47d381589b7b2a.js (read only; M for conclusions)
- https://t.me/s/erivalgg (public preview, 2026-10-19)
- https://builders.polymarket.com/ (eRival.gg rank 34, "1m Volume $1.83M")
- https://docs.polymarket.com/programs/builders/fees.md , /programs/builders/overview.md , /trading/session-keys.md , /trading/fees.md , /llms.txt , /llms-full.txt (Data API v2 builders endpoints, "volume is ... in shares", Data API v1 retired 2026-10-24)
- https://data-api.polymarket.com/v2/builders/leaderboard , /v2/builders/volume , /v1/builders/leaderboard , /v1/builders/volume
- https://clob.polymarket.com/builder/trades?builder_code=0x887fb9c1...ae84
- https://gamma-api.polymarket.com/events?tag_slug=esports&closed=false&active=true&limit=15&order=volume24hr&ascending=false

Secondary (M): WebSearch "eRival.gg Polymarket киберспорт терминал" (only hit was the builders.polymarket.com listing; no press coverage found); sibling notes `docs/research/08-venues-polymarket-kalshi.md` (geoblock, UMA, PayBox reachability for Polymarket) and `docs/research/venues/metamask-polymarket-integration.md` (same front-end pattern, doubled-counted liquidity).

Not found: any eRival ToS/privacy page, legal entity, API docs, sitemap, GitHub repo, press article, or third-party review (searched: site, Telegram, WebSearch extended in Russian).
