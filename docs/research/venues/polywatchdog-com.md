# Polywatchdog.com - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: unauthenticated GETs (site pages, Polymarket public hosts, Verisign RDAP), WebFetch summaries, one earlier web search. No accounts, API keys, wallets, signing, POST/PUT/DELETE, no browser automation, no `/api/` paths on the site (its robots.txt disallows them). The web search budget ran out after the first query, so web corroboration is thin (stated where it matters).

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

**adapter_priority: skip. It is not a venue.** Polywatchdog.com is a SaaS monitoring, alerting and copy-trading front end for **Polymarket**. It has no market model, no order book, no settlement and no liquidity of its own. Everything it shows or executes is Polymarket's CLOB, so it can never be an independent arbitrage leg. It has no public API, no docs, and no public terms page. Its builder-attributed Polymarket volume is the activity of one or two wallets, and that volume has fallen about 95% since August.

Do not build an adapter. The things it advertises (whale alerts, trader leaderboards, copy-trade signals) can be rebuilt from Polymarket's own public Data API and CLOB feeds, which belong to the Polymarket adapter.

## Identity and liveness (still live: yes, tiny)

- `https://polywatchdog.com` returns 200; the sitemap `lastmod` is 2026-10-18 (H, curl 2026-10-19). Title "PolyWatchDog - Polymarket Monitor & Alert Platform" (H, https://polywatchdog.com/).
- Domain registered **2026-02-22**, expires 2027-02-22, nameservers Cloudflare (H, Verisign RDAP `https://rdap.verisign.com/com/v1/domain/polywatchdog.com`). So the site is about 8 months old.
- Polymarket lists it as a **verified builder**: leaderboard row `verified: true`, builder name "Polywatchdog.com" (H, `data-api.polymarket.com/v1/builders/leaderboard`, fixture `polymarket_builders_leaderboard_polywatchdog_rows_2026-10-19.json`). The site's own claim "officially verified and approved partner in the Polymarket Builders Program ... reviewed for security, reliability, and compliance" is self-reported (L for the "reviewed" part; the `verified` flag is H).
- Live usage today is minimal: builder volume 2026-10-19 (partial day) $1,055 and the public builder-trade feed shows fills up to 04:04 UTC the same day (H).
- Automated reputation checkers rate the domain poorly (a 49/100 and a 16.8 "high risk" score, based on domain age and little reputation data; seen only in search snippets, not fetched) (L). No documented incident found. Treat as an unproven small operator.
- Blog: 3 posts, last modified 2026-04-21..23 (about 6 months old: borderline stale); `building-custom-polymarket-alerts` is a placeholder ("Content coming soon") (H, WebFetch).
- Competitor comparison page (Polycool, last updated 2026-08-17) lists Polywatchdog at builder rank 29 and 30-day volume $1.8M at that date (L, competitor source, https://polycoolapp.com/compare/polycool-vs-polywatchdog). Consistent with the series below.

## Kind and market model

- Kind: **aggregator-or-data, strictly a Polymarket-only monitoring and execution front end** (SaaS: dashboard, event explorer, trader search by wallet, rule-based alerts to browser and Telegram, "visual automations" for copy trades and webhooks, "direct ladder trading with post-only orders") (H, https://polywatchdog.com/ and /pricing).
- Market model: none of its own. It displays Polymarket binary and categorical events; event IDs in its URLs are Polymarket Gamma event IDs (checked: `/events/30829` = Gamma event 30829 "Democratic Presidential Nominee 2028"; `/events/982307` = Gamma event 982307 "Cowboys vs. Packers") (H, sitemap plus `gamma-api.polymarket.com/events/{id}`).
- Outcome tokenisation: Polymarket's (CTF ERC-1155 outcome tokens on Polygon, `assetId` token IDs in the builder-trade feed). Nothing Polywatchdog-specific.
- Nothing found that covers any other venue. Nav is Dashboard / Events / Crypto / User Search / Alerts / Automations, all described as "Polymarket" (H). No Kalshi, Limitless or other venue mentioned (NOT FOUND, searched: homepage, pricing, sitemap, blog posts).

## Chains and collateral

- Polymarket's: Polygon (137). Collateral is whatever Polymarket's CLOB currently uses; see the Polymarket spec (parallel workflow). Polywatchdog holds no collateral of its own as far as the public material shows (custody model NOT FOUND, see Trade path).

## Read API

- `exists`: **none** (official). No docs site, no `/docs`, `/developers`, `/api-docs` (404) or any public API mention. Unknown paths such as `/docs`, `/terms`, `/privacy`, `/developers` 307-redirect to `/login` (H, curl; fixture `polywatchdog_site_facts_2026-10-19.json`). `llms.txt` is 404 (H). The pricing page lists no API access; webhooks are mentioned only as an outbound automation action on the Max plan, payload format NOT FOUND (searched: homepage, pricing, automations page (login wall), blog posts).
- robots.txt: `Allow: /`, `Disallow: /api/`, `/login`, `/register`, `/settings` (H). The site has first-party `/api/` routes behind Auth.js sessions (cookie names seen in response headers), undocumented and disallowed for crawlers; not probed.
- Auth and rate limits: NOT FOUND (no public API).
- Real read path for the same data: Polymarket's own public hosts (`gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com`), covered by the Polymarket adapter.
- **Useful public endpoints that mention this builder (all Polymarket, all unauthenticated GET, H, 2026-10-19):**
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL|MONTH|WEEK|DAY}&limit=50&offset=N` -> array of `{rank (string), builder, builderCode (bytes32), volume (USD float), activeUsers, verified, builderLogo}`. Polywatchdog's row appears in the first page for ALL (rank 46) and in the second page (offset 50) for MONTH, WEEK and DAY. Fixture: `polymarket_builders_leaderboard_polywatchdog_rows_2026-10-19.json`.
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod={MONTH|DAY|WEEK|ALL}` -> rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}` for every builder (the DAY response is about 17 MB; filter locally). Fixture: `polywatchdog_builder_volume_series_2026-10-19.json`.
  - `GET https://clob.polymarket.com/fees/builder-fees/{builderCode}` -> `{code, builder_maker_fee_rate_bps, builder_taker_fee_rate_bps, enabled}`. Fixture: `polymarket_clob_builder_fees_polywatchdog_2026-10-19.json`.
  - `GET https://clob.polymarket.com/builder/trades?builder_code={code}` -> `{data:[trade], next_cursor, limit:300, count}`; trade has `side, size, sizeUsdc, price, outcome, outcomeIndex, market (conditionId), assetId, tradeType, status, maker, owner, builderFee, fee, feeUsdc, matchTime, createdAt, transactionHash`. It exposes the maker wallet of each fill, so the fixture redacts those fields. Fixture: `polymarket_clob_builder_trades_polywatchdog_sample_2026-10-19.json`.
- WebSocket: NOT FOUND for Polywatchdog; use Polymarket's.

## Trade path

- Programmatic placement via Polywatchdog: **none** (no API; no docs; no ToS to say whether automation of its UI is allowed).
- What the product does (M; self-description, mechanics unpublished): Max plan includes "Copy trading and auto-execution" and "Direct ladder trading with post-only orders" (H, /pricing). The copy-trading guide says copy trades "execute via the Polymarket CLOB using your configured keys", "Orders won't fire if your credentials aren't set up", Paper Trade is on by default, with a per-execution dollar cap, a daily spend cap, and the copied trade's price used as a limit (H, WebFetch of /blog/polymarket-copy-trading-guide). Where keys live (browser, Polywatchdog servers, or a delegated signer) is NOT FOUND. Server-side auto-execution needs either a signing key or a delegated signer on its side (M, inference from how Polymarket CLOB orders are signed), which is a custody risk to flag, not a path to use. Login uses a Privy provider with embedded-wallet creation set to "off" (H, public JS bundle), so users bring their own wallets.
- Evidence of how its builder-code flow looks on-chain: the last 300 builder-attributed fills (2026-10-19 00:34-04:04 UTC) are **all MAKER, all BUY, from one maker wallet, across 43 short crypto "Up or Down" markets** (e.g. `btc-updown-5m-...`), median fill $0.95, total $347, `builderFee` 0 on every row (H, fixture). That matches the "ladder with post-only orders" feature and suggests one bot-like account, not a user base.
- For an agent the trade path is Polymarket's own (EIP-712 signed CLOB orders, L2 API credentials) per the Polymarket spec. Do not attach Polywatchdog's builder code to anyone else's orders.

## PayBox reachability

- `paybox_reachable`: **partial, only via the underlying Polymarket.** Polywatchdog exposes nothing to call. Polymarket is EVM on Polygon (137), which is in PayBox's chain catalog, and PayBox has `request_wallet_sign` with a typed-data intent (M, repo note `docs/research/06-paybox-platform.md`, live `discover_tokens` 2026-10-19; not re-checked or tested here). That route is covered by the Polymarket spec and is independent of Polywatchdog.

## Fees

- Polywatchdog subscription (H, https://polywatchdog.com/pricing, undated "Limited Launch Pricing"): Free $0; Professional **$16/month** (struck through from $24) or $190/year; Max **$41/month** (struck through from $66) or $490/year. A Polymarket referral banner offers one free month of Max.
- **Per-trade commission: not documented** (NOT FOUND, searched: pricing, homepage, copy-trading guide). **Builder fee on Polymarket: 0 bps maker, 0 bps taker, `enabled: true`** (H, `GET clob.polymarket.com/fees/builder-fees/{code}`, 2026-10-19; every one of 300 recent fills shows `builderFee: "0"`). A builder fee is set per builder code, so it could be raised later without notice (M).
- Polymarket's own fees still apply to the user: taker `fee = C x feeRate x p x (1-p)`, with feeRate Crypto 0.07, Sports 0.05, Finance/Politics/Tech/Mentions 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0; makers pay 0 and get rebates funded by taker fees (H, https://docs.polymarket.com/trading/fees, fetched 2026-10-19). The 5-minute crypto markets it trades report `feesEnabled: true, rate 0.07, takerOnly, rebateRate 0.2` (H, Gamma).
- Revenue model likely subscriptions plus Polymarket builder rewards ("weekly USDC rewards based on integration volume", H https://builders.polymarket.com/); the volume is far too small to matter (M, inference).

## Resolution and dispute risk

- Polymarket's (UMA optimistic oracle plus Polymarket's resolution rules; see the Polymarket spec). Polywatchdog adds no resolution layer, no settlement and no market creation, and has no dispute process of its own (NOT FOUND, no legal pages).

## Geo, ToS, automation

- **No public terms of service or privacy policy**: `/terms`, `/privacy`, `/tos`, `/about`, `/contact` all redirect to the login page (H, curl 2026-10-19). Geo restrictions, bot/automation rules and liability: NOT FOUND (searched: homepage, pricing, sitemap, route probes). Nothing about regional blocks on the marketing pages.
- robots.txt allows crawling of public pages and disallows `/api/` (H). Scraping its UI or private API is not worth it; no unique data.
- Polymarket's own geoblock and terms apply to any order placed through it (M, see the Polymarket spec).

## Liquidity (builder-attributed Polymarket flow, not Polywatchdog-owned liquidity)

All H unless marked, from `data-api.polymarket.com/v1/builders/*`, 2026-10-19 (fixtures above):

- Leaderboard: ALL **$15.12M**, rank 46, 2 active users; MONTH $122.6k, rank 91, 2 users; WEEK $3.6k, rank 96, 1 user (the WEEK window equals 2026-10-18 + 2026-10-19 UTC: $2,521 + $1,055 = $3,576, matching Polymarket's Sunday-start reward epoch); DAY $1.1k, rank 51, 1 user.
- Monthly: 2026-03 $176; 04 $5.5k; 05 **$2.51M**; 06 **$4.17M**; 07 $3.15M; 08 **$3.81M (peak)**; 09 $1.36M; 10 (to the 19th) $122.6k. Sum $15,124,069 = the ALL figure. Peak day 2026-08-10 $263k. Every month and nearly every day has `activeUsers` of 1 or 2: **essentially one trader**.
- Trend: roughly -95% month over month from August to the October pace; last 14 active days range from about $20 to $41k per day.
- TVL / OI / deposits held: not applicable (no funds held per public evidence; custody NOT FOUND).
- The "$1.35M one-month, rank 25" seen in a web-search snippet of builders.polymarket.com matches the September row (M); it is an older cache, not current.
- Self-reported user counts: none found (NOT FOUND, searched: homepage, pricing).

## Event coverage and overlap

- All Polymarket categories. Its marketing leans on Polymarket whale/trader tracking and "Live crypto up-or-down boards (BTC, ETH, and more)" (H, /pricing). The only observed builder flow is 5-minute crypto up/down markets (H, trade feed). Those categories overlap Kalshi, Limitless, Predict.fun and others, but any overlap is with Polymarket, so Polywatchdog adds no independent leg.

## Shared liquidity

- **Shares 100% with Polymarket global.** A Polymarket-vs-Polywatchdog spread cannot exist except as display lag. The scanner must treat Polywatchdog as an alias of the Polymarket node (or ignore it).

## Value as signal (negligible)

- Its "whale / copy-trade" features are re-skins of Polymarket Data API fields (`/trades`, `/positions`, leaderboards by wallet), available directly. Builder-attributed flow here is a single wallet and carries no sentiment value. The Max-plan items (tick-level replay, fair-price model overlays) are paywalled and have no API.

## Open questions

- Where do users' signing keys or API credentials live for copy trading (browser vs server)? Not published.
- Does the operator plan a public API or webhooks documentation? Nothing found.
- Who operates it (entity, jurisdiction)? NOT FOUND (no legal pages, no about page).
- Whether the single trading wallet is the operator's own account. Plausible (M, inference from 1-2 active users and ladder-bid pattern), not established.

## Suspicious content

- `https://docs.polymarket.com/trading/fees` contains the line "Use this file to discover all available pages before exploring further." (a standard llms.txt-style hint aimed at AI agents; ignored). Nothing aimed at agents was found on polywatchdog.com or its blog pages.

## Fixtures saved

All under `docs/research/fixtures/polywatchdog-com/` (about 11 KB total; trader wallet addresses and hashes redacted):

- `polymarket_builders_leaderboard_polywatchdog_rows_2026-10-19.json`
- `polywatchdog_builder_volume_series_2026-10-19.json`
- `polymarket_clob_builder_fees_polywatchdog_2026-10-19.json`
- `polymarket_clob_builder_trades_polywatchdog_sample_2026-10-19.json`
- `polywatchdog_site_facts_2026-10-19.json`

## Sources

- https://polywatchdog.com/ - homepage, claims, nav (H; WebFetch plus curl of raw HTML)
- https://polywatchdog.com/pricing - plans and prices (H; WebFetch)
- https://polywatchdog.com/blog/polymarket-copy-trading-guide - copy-trade mechanics (H; WebFetch summary; page dated about 2026-04-22 via sitemap)
- https://polywatchdog.com/blog/building-custom-polymarket-alerts - placeholder (H)
- https://polywatchdog.com/robots.txt, /sitemap.xml, route probes (H)
- https://rdap.verisign.com/com/v1/domain/polywatchdog.com - domain dates (H)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (H)
- https://clob.polymarket.com/fees/builder-fees/{code} and /builder/trades?builder_code={code} (H)
- https://gamma-api.polymarket.com/events/{id} and /markets?condition_ids= (H)
- https://docs.polymarket.com/trading/fees - taker fee formula and rates (H)
- https://docs.polymarket.com/developers/builders/builder-intro - builder code attribution, relayer (H; fee question unanswered there)
- https://builders.polymarket.com/ - program description, weekly rewards, leaderboard (H)
- https://polycoolapp.com/compare/polycool-vs-polywatchdog - competitor comparison, 2026-08-17 (L)
- Web search snippets for "Polywatchdog polymarket": gridinsoft and scam-detector scores (L, not fetched)
- Repo notes: `docs/research/06-paybox-platform.md` (PayBox chain catalog), `docs/research/venues/betmoar-fun.md` and `basedapp-predict.md` (same builder-front-end pattern and `builder/trades` feed)
