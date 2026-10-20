# ProTrade (protrade.tech) - venue spec

Researched 2026-10-19 (fetches ~04:00Z to 04:10Z). Read-only: public web pages, the site's public static JS bundles read as text (never executed), Polymarket public docs, and unauthenticated GETs to Polymarket's documented public hosts. No account, wallet, signing, POST, payment, or browser automation. Generic User-Agent only. WebSearch budget ran out mid-session, so only one extended search was done (see Open questions).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- ProTrade is **not a venue**. It is an independent **desktop trading terminal / frontend for Polymarket** (back/lay ladders, hotkeys, live P&L) that signs orders in the user's browser and sends them to **Polymarket's CLOB** with its own Polymarket **builder code** attached (H: own site copy "independent trading interface for Polymarket", "Powered by Polymarket", "Venues: Polymarket only"; H: every builder trade below settles on Polymarket's exchange). It adds no market type, no book, no resolution. **All liquidity is Polymarket's**, so it can never be an independent arbitrage leg.
- It has **no public API, no docs, no SDK**. The only ProTrade-operated back end seen (`api.protrade.tech`) is an undocumented order relay used by its own web client (see Read API).
- It is **live and small**: about $0.3M USD/day of builder-attributed fills on 2026-10-17 and 2026-10-18, about 20 active wallets per day (H, Polymarket's own public builder-trades feed). That volume is already visible through the Polymarket adapter.
- Residual value (all via Polymarket's API, not ProTrade): (a) a labelled flow slice of about 20 professional sports/ladder traders via `GET /builder/trades?builder_code=...`, which could serve as a weak informed-flow signal for live soccer/tennis markets (M, speculative); (b) a UX reference for back/lay ladders over a binary YES/NO book; (c) a worked example of a builder fee stack for cost models.

## Liveness (still live in 2026?)

Live as of 2026-10-19 (H).

- `https://protrade.tech/` returns HTTP 200 (Vercel / Next.js), sitemap lastmod 2026-10-13, title "ProTrade - Polymarket trading terminal | Ladders, hotkeys, zero fees above $600k" (H, fetched).
- Fresh fills: the public builder-trades feed for ProTrade's builder code had rows up to `2026-10-19T03:34:39Z`; 4,800 rows reached back to 2026-10-17T13:04Z (H, see Liquidity and fixtures). The 2026-10-19 UTC day had only 13 rows by 03:34Z because live sports are mostly off at that hour (M).
- Polymarket builder leaderboard row `protrade.tech` is `verified: true`, with rank 72 DAY, 16 WEEK, 18 MONTH, 41 ALL TIME (H, fetched 2026-10-19; fixture).
- Secondary: PolyMart directory (published 2026-09-14) says public launch was 2026-08-03 per a team post, X account created July 2026, newest post 2026-09-28 (M, third-party directory quoting team posts, https://polymart.app/protrade). Team size and identity not stated (founder details minimal, per the same page). Mobile app "coming soon" (H, site).

## Kind and market model

- Kind: **broker / frontend / pro trading terminal** for Polymarket (H, site).
- Market model: whatever Polymarket lists. Binary YES/NO CLOB, plus neg-risk multi-outcome groups, with outcomes tokenised as ERC-1155 conditional tokens (M, Polymarket design, covered by the Polymarket workflow). ProTrade only re-presents each book as a price ladder: "back" = buy the outcome, "lay" = sell it, with if-win / if-lose P&L per rung (H, site copy; the lay side is a UI mapping, not a separate book).
- Coverage shown: tennis, soccer and esports boards (H, /product copy "657 games, 87 of them live" is marketing copy of unknown date, L); a polymart.app listing says live football and tennis (M). Client code also references Polymarket crypto price endpoints, a Binance data feed and an ESPN MMA scoreboard (H, bundle), so short-term crypto Up/Down and MMA are supported.
- Observed fill mix (300 rows, 2026-10-18T20:40Z to 2026-10-19T03:34Z, tiny sample): 30 distinct markets, nearly all soccer (Ligue 1, La Liga, Colombia, Argentina, Brazil, Morocco) match-winner, O/U and BTTS markets plus a few individual-player markets (likely tennis, not verified) and a few crypto Up/Down. The 12 largest markets by notional were all looked up via Polymarket CLOB `/markets/{condition_id}` and all are tagged Sports/Soccer/Games (H).

## Chains and collateral

- Chain: **Polygon** (chainId 137) only (H: client config `chainId: 137`; site says deposit USDC on Polygon).
- Collateral: site copy says "USDC", but the client code reads and moves **pUSD** (Polymarket USD, V2 collateral) from a Polymarket **deposit wallet** and also checks legacy **USDC.e** balances (H, bundle function names `getPusdBalance`, `transferPusdFromDepositWallet`, balance fields `pusd`, `usdce`; default `accountKinds: "deposit"`). Treat collateral as pUSD with legacy USDC.e (M for exact semantics; Polymarket workflow is authoritative).
- Wallet model (H, site): new users sign in with email or Google and get a **Privy embedded wallet** (self-custody claim, key exportable at any time); existing users can import a Polymarket wallet key and ProTrade re-derives the proxy address. ProTrade states it does not hold funds; "orders are signed locally" (H, site; not independently audited).
- Public identifiers: Polymarket builder code `0xe8f62837483813cd7315c30c73d0fe1356ef604cfed294bc4f956fa92871a9bb`, builder name `protrade.tech` (H: leaderboard row and client config; public attribution id, not a secret). Note: the client bundle also embeds third-party keys (RPC, analytics, database). Those are not reproduced here; they are client-side keys, but they are credentials for someone else's services and must not be used.

## Read API

- `exists`: **none** (official). NOT FOUND (searched: protrade.tech home, /product, /markets, sitemap.xml, robots.txt, /llms.txt (404), /api (404), /docs, /terms, /privacy, /legal (all 307 to `/`), docs.protrade.tech (no DNS), polymart.app listing, web search "ProTrade Polymarket API"; site and directory copy never mention an API).
- ProTrade's own back ends (H, read from its public client bundle; **not probed, undocumented, do not depend on**):
  - `https://api.protrade.tech`: "order relay". Client calls `GET /presence` with `Authorization: Bearer <Privy token>` and `GET /readyz`. The client switches order transport between `direct` (browser to clob.polymarket.com) and `relay` when it detects `geoblock`, `order_gated` or `clob_blocked` (H, bundle). See Geo.
  - Same-origin proxies `/api/gamma`, `/api/data`, `/api/clob` on protrade.tech used when the browser cannot reach Polymarket directly (H, bundle). `robots.txt` disallows `/api/`, `/popout`, `/profile`, `/deposit`, `/design`.
- Everything market-related is read from **Polymarket's** public hosts (H, client config): `https://clob.polymarket.com` (REST), `https://gamma-api.polymarket.com`, `https://data-api.polymarket.com`, `wss://ws-subscriptions-clob.polymarket.com/ws` (book/price stream), `wss://sports-api.polymarket.com/ws` (live sports state), `wss://ws-live-data.polymarket.com/`, `https://relayer-v2.polymarket.com`, `https://bridge.polymarket.com`. The Polymarket adapter should own those.
- Usable indirect reads about ProTrade flow (public, keyless, Polymarket hosts; H, fetched):
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>[&next_cursor=<cursor>]`. Docs: "a public read and doesn't require the POLY_* headers", only matched orders (H, https://docs.polymarket.com/trading/orders/attribution.md). Observed envelope `{data:[...], next_cursor, limit:300, count}`, 273 KB for 300 rows; row fields `id, tradeType (TAKER|MAKER), takerOrderHash, builder (empty string), market (condition id), assetId, side, size (shares), sizeUsdc, price, status, outcome, outcomeIndex, owner, maker (wallet), transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. The docs page describes the envelope as `items`; the live response uses `data` (docs/live mismatch, H). Fixture: `polymarket_clob_builder_trades_protrade_sample3_2026-10-19.json` (maker/owner redacted).
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day|week|month|all&limit=50&cursor=...`. Cursor-only paging: sending `offset` returns HTTP 400 `'offset' is not a query param on this API` (H, hit once by mistake). Rows `{rank, builder_name, builder_code, profile_image, verified, volume, active_users}`. Fixture: `polymarket_data-api_v2_builders_leaderboard_protrade_rows_2026-10-19.json`. Per an existing project note, Data API v1 builder endpoints retire 2026-10-24 (M, from `docs/research/venues/polycop-predictions.md`).
- Leaderboard `volume` unit is **shares**, not USD (H: DAY value 373.69 vs summed `size` of that UTC day's builder rows 374; also matches DefiLlama adapter comment cited in the PolyCop note).
- Auth, rate limits for these Polymarket endpoints: NOT FOUND in the pages read (searched: attribution page, fees page). Went through 16 sequential pages with 0.4 s spacing with no throttling.
- Extra fixtures: `protrade_client_config_excerpt_2026-10-19.json` (non-secret client config) and `protrade_builder_trades_daily_summary_2026-10-19.json` (computed daily rollup).

## Trade path

- **None for an agent against ProTrade.** There is no order API, no key issuance, no SDK. The web client authenticates with Privy and signs orders locally; its relay is bound to a Privy bearer token (H, bundle). Automating it would mean driving the web UI or reverse engineering a private relay, which is out of scope and not recommended.
- The canonical write path is **Polymarket's own CLOB API**: EIP-712 signed orders with a `builder` (bytes32) field inside the signed struct, attached by the builder before signing (H, https://docs.polymarket.com/builders/fees.md and the attribution page). The aggregator should talk to Polymarket directly; the Polymarket adapter owns it. If the project wants builder revenue it should register its own builder code rather than route through ProTrade.

## PayBox reachability

- `no` for ProTrade itself. There is no endpoint to send signed orders to and no transaction-proposal flow. A PayBox EVM wallet could only send pUSD/USDC on Polygon to a ProTrade-created Privy wallet, which hands custody to the user's Privy key rather than PayBox signing; that is pointless.
- The correct target for PayBox-driven trading is **Polymarket directly on Polygon** (covered by the other workflow): signed CLOB orders from a PayBox-controlled EVM key (or smart account) in the deposit-wallet model. Other chains (Base, Ethereum, BNB, Arbitrum, Solana) only matter as funding sources via Polymarket's bridge, not as trading chains here.

## Fees

Three stacked layers; the user pays all (H, https://docs.polymarket.com/builders/fees.md: "builder fees ... always additive"; the user placing the order pays).

1. **ProTrade builder fee** (flat share of notional): `builder_fee = notional x bps / 10000`.
   - Current schedule, effective 2026-10-01: **5 bps taker (0.05%), 2 bps maker (0.02%)** up to $600,000 monthly matched volume; **0 above $600,000**; tiers reset on the 1st (H, protrade.tech home copy). Client bundle schedule confirms: before 2026-10-01 it was 10 bps taker / 5 bps maker; from 2026-10-01 05 / 02 (H, bundle `protradeRatesAt`).
   - On-chain verification (H, first page of 300 builder rows): `builderFee / sizeUsdc` is 0.0495% to 0.05% for TAKER rows and 0.0125% to 0.02% for MAKER rows (the low maker values are probably rounding on tiny fills, M). The current schedule is live. The site says the difference from the standard rate is returned as daily cashback; any cashback is paid outside the builder-fee line and is not visible in this feed.
   - STALE conflict: polymart.app (published 2026-09-14, "Updated 2026-09-15") lists 0.10% / 0.05% up to $500k, then 0.05% / 0.025% to $1M, then 0, and a web-search snippet says "zero above $1M". These are the **pre-2026-10-01** tiers; ignore (L).
   - Polymarket caps: builder taker max 100 bps, maker max 50 bps, default 0; rate changes at most once per 7 days with a 3 day delay; Polymarket can revoke a builder's fee ability or disable a code at any time, after which orders carrying that code are rejected (H, builder fees doc).
2. **Polymarket platform taker fee** (makers pay none): `fee = shares x feeRate x p x (1 - p)`, Sports rate 0.05, Crypto 0.07, Finance/Politics/Tech/Mentions 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0; maker rebates 15% to 25% (H, https://docs.polymarket.com/trading/fees.md, page undated). Verified on 12 ProTrade taker rows: `feeUsdc - builderFee = 0.05 x shares x p x (1-p)` exactly (H, computed). The `feeUsdc` field therefore **includes** `builderFee`.
3. Network cost: gasless via Polymarket relayer for trading (M, client config shows `relayerUrl`); deposit/withdraw and bridge costs not documented by ProTrade (NOT FOUND).

Net: a ProTrade sports taker at p = 0.5 pays about 2.5% of notional to Polymarket (0.05 x 0.5 x 0.5 = 0.0125 per share against 0.5 per share; matches a 10 USDC sample row with 0.25 fee) plus 0.05% to ProTrade. The ProTrade add-on is small versus the platform fee but is still strictly worse than direct access for an aggregator.

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle with disputes; sports markets can settle on official results) (M, covered by the Polymarket workflow). ProTrade resolves nothing and offers no dispute handling.
- Extra risks beyond Polymarket: (a) **builder-code dependency**: Polymarket may disable the code at any time (H, doc above); (b) client-side signing and key custody sit in a closed-source web app with Privy-managed keys, small anonymous team (M, polymart.app: founder details minimal), no ToS or privacy page (H, 307 to `/`); (c) hotkeys "submit orders without a confirmation dialog" (M, polymart.app), a fat-finger risk if a user scripted it; (d) a security scan on polymart.app (dated 2026-10-19) reports the domain was not flagged by several wallet/phishing lists (M, third party). No hack or incident found (absence of evidence only).

## Geo, ToS and automation

- ProTrade ToS, privacy policy, restricted-country list: **NOT FOUND** (searched: home page links, /terms, /privacy, /tos, /legal (all 307 to `/`), /docs, sitemap, product page). The only text is "availability depends on your jurisdiction. Nothing on this page is financial advice." (H, site footer copy, also in the client i18n strings).
- Polymarket's rules bind the underlying trading: on the help page dated 2026-08-14 the table lists 40 fully blocked countries (page text says 39) including the US, UK, France, Germany, Italy, Australia, Singapore, plus Ontario/Quebec/Alberta/British Columbia and Crimea/Donetsk/Luhansk; Singapore, Poland, Thailand, Taiwan are close-only (the page lists them in both tables); VPNs and "similar tools" used to bypass restrictions violate ToS section 2.1.4; the page says nothing about APIs, bots, relayers or third-party interfaces (H, https://help.polymarket.com/en/articles/13364163-geographic-restrictions).
- **Compliance red flag (M, code reading, not tested):** the ProTrade client runs a geoblock check and, if the verdict is `blocked` and an order relay is configured (it is: `api.protrade.tech`), logs `indirect_connection_enabled` and routes orders through the relay instead of gating trading (H on the strings and control flow; the inference that this serves restricted-region users is M). If so, ProTrade proxies orders from its own servers for users Polymarket would block, which is the kind of circumvention Polymarket's ToS prohibits and may attract enforcement against the builder code. Do not integrate or promote it; this also reinforces the "skip" verdict.
- Automation: `robots.txt` allows AI crawlers on public pages and disallows `/api/`, `/popout`, `/profile`, `/deposit`, `/design` (H). No stated rule on programmatic use of the terminal.

## Liquidity

- Polymarket builder leaderboard for `protrade.tech` (H, fetched 2026-10-19 ~04:00Z, **unit = shares**): DAY 373.69 (2 active users, UTC day just started), WEEK 518,195 (20 users), MONTH 6,190,674 (31 users), ALL TIME 17,824,454 (65 users). The credited volume can lag by up to 24 hours (H, attribution doc). Web search surfaced the same MONTH figure, so the feed is consistent (M).
- USD from the builder-trades feed (H, 4,800 rows, fetched ~04:05Z, `sizeUsdc` summed): 2026-10-17 (partial from 13:04Z) $344,878 over 2,403 rows and 17 wallets; 2026-10-18 $300,856 over 2,384 rows and 20 wallets; 2026-10-19 to 03:34Z $245 over 13 rows. Rows are ProTrade-attributed sides (taker or maker): $270,753 taker and $375,224 maker across the window, so some trades are counted on both sides. Weekend soccer is the peak, so weekday and non-match-day volume will be lower (M). Estimated month in USD at about 0.55 USD per share is about $3.4M (M, derived; the team's own claim of "over $4M in September" is unverified, L).
- Total builder fees accrued in the window: about $210 USD over two days (H, summed `builderFee`).
- OI / TVL: NOT FOUND and not applicable (a router holds no pooled liquidity; not listed on DefiLlama protocols, searched `api.llama.fi/protocols`, 8,758 entries, no match).
- Share of Polymarket: ProTrade routes about 0.5M to 0.6M shares/day on busy days (H, above). The PolyCop note cites about 30M shares for one day across the top 50 builders, so ProTrade is low single-digit percent of builder-routed flow (M, different days) and a smaller share of all Polymarket volume (not measured). It is 100% inside Polymarket's book.

## Event coverage and arbitrage overlap

- Sports (soccer club matches, tennis, esports, some MMA) dominates ProTrade's flow (H, sample). These categories overlap Kalshi and other sportsbooks/prediction venues, but the arbitrage leg would be **Polymarket itself**, not ProTrade.
- Crypto Up/Down (short-term price) appears in a small share (11 "Up" and 3 "Down" fills of 300, H). Overlaps other crypto-price venues, again via Polymarket.
- Politics and macro: no evidence ProTrade lists or surfaces them (NOT FOUND in the product copy). Client only mentions sports boards.
- **Shares liquidity with Polymarket: yes, 100% (H).** Not an independent leg.

## Adapter notes (if ever wanted)

- No ProTrade adapter needed. Recommended implementation: a Polymarket adapter with an optional **flow-signal feed** that polls `clob.polymarket.com/builder/trades?builder_code=0xe8f62837483813cd7315c30c73d0fe1356ef604cfed294bc4f956fa92871a9bb` and tags fills as `source: protrade`. Expect ~1,200 rows/day on busy sports days; page with `next_cursor`; builder rows give wallet (`maker`), side, shares, price, tx hash, so an aggregator could map to token via `assetId`. Value is speculative; verify any signal claim with a lead/lag study before use.
- Do not use `api.protrade.tech`, `/api/clob` etc.; they are private, authenticated by Privy tokens, and may change or be geo-sensitive.

## Open questions

- Whether the geoblock relay really serves blocked jurisdictions end to end (needs controlled testing, out of scope and would risk ToS issues).
- ProTrade ToS, entity, and jurisdiction of the operator: not published. Discord (`discord.gg/XqqHf724Ah`) and X posts were not read (no account; only secondary quotes via polymart.app).
- Exact semantics of `fee` vs `feeUsdc` vs `builderFee` in Polymarket's builder-trades feed (inferred from 12 rows that `feeUsdc` = platform fee + builder fee).
- Whether the leaderboard's DAY window is strictly UTC (inferred from the 10-19 match; L).
- WebSearch was exhausted mid-session, so no independent news, hack, or reviews check beyond one extended search and the polymart.app / HeyTraders snippet (the HeyTraders comparison was seen only as a search snippet and not opened, L).

## Sources

- https://protrade.tech/ (H: fees, venue, wallet, Polygon, "independent interface", footer jurisdiction line; fetched 2026-10-19)
- https://protrade.tech/product (H: features, onboarding, "Powered by Polymarket", Privy wallet, Polygon USDC)
- https://protrade.tech/robots.txt, https://protrade.tech/sitemap.xml, https://protrade.tech/manifest.webmanifest (H)
- ProTrade public client JS bundle chunks under https://protrade.tech/_next/static/chunks/ (H for config, fee schedule, endpoint URLs and relay logic; read as text only; fixture `protrade_client_config_excerpt_2026-10-19.json`)
- https://clob.polymarket.com/builder/trades?builder_code=0xe8f6...a9bb (H, unauthenticated GET, fixtures)
- https://data-api.polymarket.com/v2/builders/leaderboard (H, unauthenticated GET, fixture)
- https://clob.polymarket.com/markets/{condition_id} (H, market tags for the sampled fills)
- https://docs.polymarket.com/builders/fees.md (H: builder fee formula, caps, additivity, revocation)
- https://docs.polymarket.com/trading/orders/attribution.md (H: builder field in signed order, public builder trades endpoint)
- https://docs.polymarket.com/trading/fees.md (H: platform taker fee formula and category rates; undated)
- https://help.polymarket.com/en/articles/13364163-geographic-restrictions (H, page dated 2026-08-14)
- https://polymart.app/protrade (M: third-party directory, published 2026-09-14, partly stale on fees)
- https://builders.polymarket.com/ and https://hey-traders.com/blog/polymarket-trading-terminal (L: seen only as web-search snippets, not opened)
- https://api.llama.fi/protocols (H for absence: no ProTrade entry among 8,758 protocols)
- docs/research/venues/polycop-predictions.md (project note, for the shares-unit and Data API v1 retirement context, M)
