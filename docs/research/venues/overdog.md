# OVERDOG (overdog.bet) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public overdog.bet pages, public unauthenticated GETs (overdog.bet HTML, robots.txt, sitemaps; Polymarket `data-api`, `clob` and `gamma-api` public endpoints for cross-checks). No account, sign-in, wallet, key, signature, POST/PUT/DELETE, or PayBox tool was used. Third-party and venue pages were treated as untrusted data. Nothing in them was followed; no instructions aimed at AI agents were found.

Honesty notes on method:
- The shared WebSearch budget ran out after the first two searches (one standard-style result list, one refused). Discovery therefore rests on one search plus first-party probing. Independent coverage/reviews of OVERDOG: NOT FOUND (searched: "Overdog.bet Polymarket sportsbook crypto betting"; a second search for news/launch coverage was refused by the budget).
- Several WebFetch results are small-model page summaries, tagged accordingly. One such summary (on the fee pages) flagged "arithmetic discrepancies" that turned out to be wrong; I re-did the arithmetic myself (section 6).
- In one batched shell command I requested `/api` and `/api/markets` on overdog.bet (both 404) in the same call that fetched `robots.txt`; `robots.txt` then showed `Disallow: /api/`. I made no further `/api/` requests after reading it.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (each well under 50 KB): `docs/research/fixtures/overdog/` (section 11).

---

## 0. Bottom line

1. **Live, yes (H).** `https://overdog.bet` returns HTTP 200 (served 2026-10-19 04:02 GMT, Next.js behind Cloudflare). Terms effective 21 June 2026; sitemaps show daily updates through 2026-10-19.
2. **It is a custodial front-end skin on Polymarket, not a venue (H).** OVERDOG's own FAQ: "Every market shown is a real Polymarket market, and orders route onto Polymarket's exchange under our verified builder code ... the liquidity, the settlement and the oracle are Polymarket's." The homepage's server-rendered data carries Polymarket event ids, `conditionId`s and CLOB `tokenId`s, and I confirmed those same ids resolve on Polymarket's public CLOB and Gamma APIs (section 3).
3. **Shared liquidity: NOT an independent arbitrage leg (H).** Every OVERDOG price is a Polymarket CLOB price. Arbitrage between OVERDOG and Polymarket is impossible by construction (same book, plus 1% extra fee).
4. **No public API, no docs, no SDK (H for absence on-site).** `robots.txt` disallows `/api/` and `/dev/`; the page CSP is `connect-src 'self'`, so any internal API is same-origin, undocumented, and off-limits to crawlers. No developer docs, GitHub, or X/Twitter link appears anywhere on the site.
5. **Tiny routed volume and shrinking (H).** Polymarket's own public builder API shows OVERDOG at **$8.41M cumulative** since ~2026-03-22 (rank 71), **$123K in October to date** (rank 90 monthly), **$7.9K last week**, **$217 last day**, 35 active users in the month. Peak week was 2026-07-05 at $2.25M. See section 8.
6. **adapter_priority = skip.** Duplicate liquidity, no API, custodial and non-wallet-reachable. The only integration value: recognise it as an alias of Polymarket so the aggregator never double-counts it, and use `builderCode` volume as a lead-source for other Polymarket front-ends (section 13).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://overdog.bet/` | 200, 540 KB HTML, `<title>` "Crypto Betting Powered by Polymarket \| OVERDOG", date header 2026-10-19 04:02:50 GMT | H |
| Homepage "Prices as of 04:02 AM", live fixtures for 19-25 Oct 2026 (CS2 Alliance v TheMongolz, UCL Man City v AEK, El Clasico etc.) | live board | H |
| `/sitemap/pools.xml` | 1,555 futures URLs, latest `lastmod` 2026-10-19T00:25Z | H |
| Terms of Service | "effective date 21 June 2026" | M (WebFetch summary) |
| Polymarket builder register | `OVERDOG`, `verified: true`, weekly volume rows from week of 2026-03-22 through week of 2026-10-18 | H |
| Trend | Declining: weekly volume $2.25M (2026-07-05) -> $60K-$146K (Sep) -> $8K (week of 10-18, partial) | H |

Verdict: **still_live = true**, but low and falling flow. No source older than 6 months used.

---

## 2. Kind and market model

- **Kind: broker-or-frontend (H).** Branding: "sports and esports betting terminal powered by Polymarket", "verified Polymarket Builder" (links to `https://builders.polymarket.com/`). It also runs a Telegram Mini App and Telegram channel (`https://t.me/overdog_bet`) per the Terms (M).
- **Market model (inherited from Polymarket, H for the mapping):** binary outcome tokens on a central limit order book (CLOB). A 3-way soccer match is 3 separate binary markets (home / draw / away), each with its own `conditionId` and Yes/No `tokenId`s. The SSR payload shows per-match `arity` (2 or 3), `cells[]` with `{tokenId, outcomeIndex, conditionId, label, price, suspended, tickSize}`, `marketCount`/`extraMarketCount` (e.g. 11 markets on a CS2 BO3), and `volume24hMicro` (micro-USD; 113,569,915,252 = $113.6K for the first row). OVERDOG's own display of "price" is the cost to buy the outcome (0.38 + 0.63 = 1.01 on the Alliance/TheMongolz row), shown also as decimal odds (2.63 / 1.59).
- **Categories: sports (16 listed in nav) and esports (8 listed), plus futures/"pools" pages (H).** Sports in nav: soccer, American football, basketball, tennis, baseball, hockey, MMA, cricket, F1, darts, rugby union, table tennis, chess, pickleball, golf, boxing. Esports: LoL, CS2, Dota 2, Valorant, Honor of Kings, Mobile Legends, Overwatch, R6 Siege. (The hint said 19/12; the nav I fetched lists 16/8, with more reachable through sitemaps. Immaterial.)
- **Combos (parlays) are a separate, under-documented product (M).** `/combos` (WebFetch summary): legs auto-selected from fixtures within two days, headline match-winner markets only, no two legs from one game; the multiple is a quoted number, "not the product of the leg odds", correlated legs priced lower, quotes up to ~12 minutes old, binding for a short countdown; cash-out "at the market's current price for the whole set"; a separate combo fee is "included in the quoted multiple" (size not given); "Combo Boosts on us - up to +34%". There is no native Polymarket multi-leg order type that I verified, so the counterparty (OVERDOG, a third party, or Polymarket) is **NOT FOUND**. Treat combos as out of scope for the aggregator.

---

## 3. Shared liquidity (confirmed first-hand)

Steps (all unauthenticated GETs, generic User-Agent):

1. OVERDOG homepage SSR row: `key: "1177845"`, `href: /esports/cs2/cs2-all-mglz-2026-10-19`, `conditionId: 0xf43836...a5bf`, outcome-0 `tokenId: 34669868...4987` price 0.38.
2. `GET https://gamma-api.polymarket.com/events/1177845` -> 200; `slug: cs2-all-mglz-2026-10-19`, title "Counter-Strike: Alliance vs TheMongolz (BO3) - 1win Private Club #2 Playoffs". Same event, same slug as OVERDOG's URL tail.
3. `GET https://clob.polymarket.com/markets/0xf43836...a5bf` -> 200; `enable_order_book: true`, `accepting_orders: true`, `minimum_order_size: 5`, `minimum_tick_size: 0.01`. Same resolution text OVERDOG relies on.
4. `GET https://clob.polymarket.com/book?token_id=34669868...4987` -> 200 with full bid/ask ladder (fixture).

Conclusion (H): **OVERDOG market id = Polymarket `conditionId`; outcome id = Polymarket CLOB `tokenId`; event key = Polymarket event id.** The aggregator should key OVERDOG rows on these and mark `liquidity_source = polymarket`, `independent = false`.

---

## 4. Read API

- **Official/public API: none (H for the on-site absence, searched: homepage, footer, /support, /proof, /legal/terms, robots.txt, sitemaps, /llms.txt (404), /docs (404), /openapi.json (404), /sitemap.xml (404)).**
- `robots.txt` (H, fixture): `Allow: /`, `Disallow: /dev/`, `Disallow: /api/`; sitemaps `/sitemap/pages.xml`, `/sitemap/sports.xml`, `/sitemap/pools.xml`.
- The page CSP has `connect-src 'self'` (H), so the live board is fed by an undocumented same-origin backend. I did not probe it.
- Data is available only as SSR HTML/RSC payload on public pages (homepage, `/sports/...`, `/esports/...`). This is scraping an undocumented format and offers nothing the Polymarket APIs do not already give directly.
- **Use Polymarket's public APIs instead** (documented in the parallel Polymarket workflow): Gamma `https://gamma-api.polymarket.com` (`/events/{id}`, `/events?slug=`), CLOB `https://clob.polymarket.com` (`/markets/{conditionId}`, `/book?token_id=`), Data API `https://data-api.polymarket.com`. I saw no auth requirement on the GETs above; rate limits NOT FOUND this session for these.
- WebSocket: none from OVERDOG (NOT FOUND). Polymarket's CLOB WS is the place to look.
- Docs URL: none. Closest: `https://overdog.bet/proof` (marketing/trust page, no technical content).

---

## 5. Trade path

- **No programmatic trade path for third parties (H for absence).** Sign-in is "Join with Telegram or Google" (homepage); the account is wallet-backed but OVERDOG is the custodian ("OVERDOG holds the account key as custodian, and the key can be exported behind a second factor"). There are no API keys, no signed-order interface, no webhooks.
- Terms (M, summary): "OVERDOG holds wallet keys on the user's behalf"; withdrawals and key export need 2FA; "the key alone cannot move funds outside Polymarket's contracts" (so the exported key is for a Polymarket-contract wallet; its type, e.g. proxy/Safe, is NOT FOUND).
- **Order flow (M, from OVERDOG's own description):** OVERDOG signs a Polymarket CLOB order with the user's custodied key and attaches its builder code (`0x21d90db23c70a5901c0ee20f0ee20cf7f98fce24795a4e99cbf79cf0d8d63905`, taken from the public builder API). Polymarket's builder docs say the code "is serialized onchain as part of the signed order" (M, WebFetch summary of `docs.polymarket.com/developers/builders/builder-intro`).
- **Fills are publicly verifiable (H):** the homepage's "On-chain / Real fills you can check" strip links each fill to `polygonscan.com/tx/0x...`.
- **Funding:** deposit BTC, ETH, SOL, BNB, USDT or USDC from $2; "it converts to the dollar unit the exchange trades in" (homepage FAQ). Conversion route, deposit addresses, and any swap fee: NOT FOUND (not on site without signing in; I did not sign in).
- **For an aggregator that wants to trade the same liquidity:** go to Polymarket directly (no 1% OVERDOG fee, programmable CLOB). OVERDOG adds nothing except a retail UX and Telegram/Google onboarding.

---

## 6. Fees

Formula (H, `https://overdog.bet/polymarket-fees`, cross-checked against `https://docs.polymarket.com/trading/fees`):

- **OVERDOG fee:** flat **1% of trade notional**, charged on top. Terms: "1% commission on trade volume ... plus the underlying Polymarket protocol fees"; "No vig is built into prices" (M summary of Terms).
- **Polymarket taker fee (sports):** `fee = C x feeRate x p x (1 - p)`, `feeRate = 0.05` for Sports, 0 for makers; maker rebate 15% for Sports (H, Polymarket docs page; the docs page gave no effective dates). OVERDOG's page lists other categories: crypto 7%, finance/politics/mentions/tech 4%, economics/culture/weather/other 5%, geopolitics 0%, and says the global schedule is effective 10 July 2026 (M, venue page; checked by them 19 Aug 2026). A US-entity schedule of 6% taker (cap $1.50 per 100 contracts at 50c) is also shown (M).
- **Per dollar of notional:** `0.01 + 0.05 x (1 - p)` for a sports taker, `0.01` for a maker. At 90c / 50c / 20c this is 1.5% / 3.5% / 5.0%, exactly what the homepage states (H, my arithmetic). The 1% never changes with price, so OVERDOG is strictly worse than Polymarket for the same order.
- **Worked example reconciled (my arithmetic, H on inputs):** `/polymarket-fees` shows "$100 taker bet at 62c" giving 156.74 shares, $0.97 to OVERDOG, $1.85 to Polymarket, $2.82 all-in. This is consistent if the $100 is the **total outlay including fees**: notional N solves N x (1 + 0.01 + 0.05 x 0.38) = 100, so N = $97.18, shares = 97.18 / 0.62 = 156.74, OVERDOG 1% = $0.97, Polymarket 97.18 x 0.05 x 0.38 = $1.85, total $2.82. A small-model summary of that page called this inconsistent; it is not. Percentages on that page are relative to total outlay (e.g. 3.38% at 50c = 3.5 / 103.5), on the homepage relative to notional (3.5%).
- Deposit/withdrawal fees and any swap spread on non-USD deposits: NOT FOUND (page says only "an intermediary may charge its own").
- Combos: fee "included in the quoted multiple", size NOT FOUND.

---

## 7. Resolution, geo, ToS, automation

- **Resolution (H on the mechanism, M on the oracle name):** OVERDOG "does not decide or grade outcomes"; markets "resolve through Polymarket's oracle"; winners redeem at $1 per share; payouts public on Polygon; OVERDOG says it "cannot void, re-grade, or claw back payouts" (`/proof`, `/legal/terms`, M summaries). The oracle is not named by OVERDOG (UMA is not mentioned in the Risk Disclosure). Polymarket's own market rules are what actually bind: the CS2 market's description (H, from the CLOB fixture/market endpoint) resolves to 50-50 if the match is cancelled or tied, and allows postponement up to a stated deadline (14 days). Dispute risk therefore equals Polymarket's, plus OVERDOG's custody and availability risk.
- **Custody inconsistency (M):** the Risk Disclosure says OVERDOG "does not hold" funds yet also that it holds wallet keys. The Terms and Risk pages are internally unreconciled, and no legal entity is named (contact: a single `overdog.bet` mailbox, support via a Telegram account). Treat as an anonymous custodial operator.
- **Geo (M):** no geoblocking ("does not block access by location"); sanctioned countries excluded; 18+; user responsible for local law; no regulation claimed. A search-result summary said OVERDOG "does not serve US residents because the global Polymarket exchange does not open new positions from the US"; I could not find that sentence in the Terms/Risk pages I fetched (US is not mentioned there), so this is **M, unreconciled**.
- **KYC:** none to browse, bet, or withdraw (H, homepage FAQ).
- **Automation/bots/API/scraping (M):** Terms section 8 prohibits attempts to "break, probe, or circumvent" security/access controls; nothing about bots, APIs, or scraping. `robots.txt` disallows `/api/`. Net: do not crawl `/api/`; pages are crawlable. Account suspension is possible ("suspended or restricted") without a stated process.
- **Withdrawals (M):** no approval step or hold; blockchain delay only; 2FA required; irreversible.

---

## 8. Liquidity (with sources and dates)

OVERDOG's own flow, from Polymarket's public builder API (H, fetched 2026-10-19; `volume` is Polymarket-matched volume carrying OVERDOG's builder code; Polymarket says matched volume "can take up to 24 hours to appear"):

| Window | Volume | Active users | Builder rank | Source |
|---|---|---|---|---|
| Cumulative (ALL; shown under 2026-01-01 bucket, first activity week of 2026-03-22) | $8,406,354 | 335 | 71 | `data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL` |
| October 2026 to 19 Oct (MONTH) | $123,224 | 35 | 90 | `...timePeriod=MONTH` |
| Last week (WEEK) | $7,963 | 9 | 87 | `...timePeriod=WEEK` |
| Last day (DAY) | $217 | 4 | 75 | `...timePeriod=DAY` |
| Peak week (start 2026-07-05) | $2,252,364 | 83 | 25 | `.../v1/builders/volume?timePeriod=WEEK` |

For scale, the MONTH leaders are betmoar $78.5M, traderline $52.0M, Gate $38.0M, Sharktool $29.0M, MagicMarkets $22.7M (H). OVERDOG's own absolute flow is small.

OVERDOG's homepage statistics (H as displayed, 2026-10-19 04:02 UTC): "1,669 Events, 209,111 Markets, **$5,180,583 traded in 24h**; Sports 1,573 events $4.7M; Esports 96 events $530.1K". My reading (M) is that this is Polymarket's volume on the catalog shown, **not** OVERDOG's own flow: OVERDOG's own routed day volume was $217 per the builder API, and the per-event `volume24hMicro` fields match Polymarket-wide event volume. OVERDOG does not label what the $5.18M measures. The underlying Polymarket sports book is deep (the sample CS2 token's book has bids from 1c to near the touch with thousands of shares at several levels), but that liquidity is Polymarket's and belongs to the Polymarket spec.

TVL/OI: NOT FOUND (no such page).

---

## 9. Event-category overlap

Everything OVERDOG lists exists on Polymarket (H). Overlap with other venues is therefore whatever Polymarket's sports/esports overlap is: soccer, NFL, NBA, MLB, NHL, tennis, MMA, golf, F1, CS2 and LoL/Dota/Valorant match markets against other prediction venues and sportsbooks that list the same fixtures (for example Kalshi, Limitless and on-chain sportsbooks; which of them list a given fixture was not checked here). OVERDOG offers no politics, macro, or crypto-price markets in its nav (H; only sports/esports and "futures" pools, mostly American football 634, soccer 566, basketball 97 among 1,555 futures URLs). Arbitrage exists only between **Polymarket (via any frontend)** and other venues, never between OVERDOG and Polymarket.

---

## 10. Chains and collateral

- **Settlement chain: Polygon (H, OVERDOG states "recorded on Polygon"; fills link to polygonscan.com).**
- **Deposit assets accepted by OVERDOG: BTC, ETH, SOL, BNB, USDT, USDC (H).** Bridging/swap path: NOT FOUND.
- **Trading collateral:** OVERDOG says "a dollar unit"; the exact token (USDC.e or successor) on Polymarket is covered by the Polymarket spec. NOT FOUND on OVERDOG's own pages.
- **Outcome tokens:** Polymarket CTF (ERC-1155) positions, ids = the `tokenId`s seen in SSR (M inference from Polymarket design plus matching ids).

---

## 11. Fixtures (docs/research/fixtures/overdog/)

| File | What |
|---|---|
| `overdog_ssr_top_events_2rows.json` | First 2 rows of the homepage "Top events" RSC payload (shape of Polymarket-keyed cells, prices, `volume24hMicro`) |
| `polymarket_builder_leaderboard_overdog.json` | OVERDOG's rows in Polymarket's builder leaderboard for DAY/WEEK/MONTH/ALL, plus one rank-1 row to show the shape |
| `polymarket_builder_weekly_volume_overdog.json` | OVERDOG weekly volume series (31 weeks) |
| `polymarket_clob_book_for_overdog_tokenid.json` | Polymarket CLOB `/book` for the tokenId OVERDOG displays (proves shared book) |
| `overdog_robots.txt` | `robots.txt` (Disallow `/api/`, `/dev/`) |

Privacy scan: fixtures and this note contain no personal identifier; requests used the generic User-Agent `insurance-markets-research/0.1`. The one mailbox mentioned is the venue's public contact, not the user's.

---

## 12. Adapter guidance

- Do **not** build an OVERDOG trading adapter. Create an **alias record**: `venue=overdog`, `liquidity_source=polymarket`, `key = (polymarket eventId, conditionId, tokenId)`, `independent=false`. Dedupe against the Polymarket adapter so OVERDOG never appears as a separate quote.
- If you want to show retail-route cost, compute `0.01 + feeRate(category) x (1 - p)` per dollar on the Polymarket price (taker) or `0.01` (maker). It is always above the direct Polymarket cost.
- Do not scrape OVERDOG pages for prices: they lag (cards up to minutes old for combos; board is a Polymarket mirror anyway).
- Revisit only if OVERDOG publishes a documented API or a non-Polymarket product (e.g., combos with an identified counterparty) that could carry independent liquidity.

## 13. Lead for other research: Polymarket builder register is public

`GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=50&offset=N` and `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod={DAY|WEEK|MONTH|ALL}` return, unauthenticated, every Polymarket front-end/builder with `builder`, `builderCode`, `volume`, `activeUsers`, `verified`, `rank` (H, fixtures). This is a ready-made list of Polymarket skins to classify as non-independent liquidity (top 5 this month: betmoar, traderline, Gate, Sharktool, MagicMarkets). `builders.polymarket.com` (the leaderboard page) showed only the top 50 on its 1m view and did not list OVERDOG there (M), consistent with the API where OVERDOG ranks 90 for the month.

---

## 14. Open questions / NOT FOUND

- Wallet type (proxy/Safe/EOA) and funding/deposit-conversion route behind OVERDOG's custodial key: NOT FOUND (not shown without signing in).
- Exact collateral token on OVERDOG's own pages: NOT FOUND.
- Whether OVERDOG offers resting limit orders (maker path) in its UI: M (the fee page shows a maker example at 0.99% all-in) but UI not verified.
- Counterparty and settlement of Combos: NOT FOUND.
- Legal entity, jurisdiction, governing law: NOT FOUND (Terms name none).
- Whether OVERDOG blocks US users: M, unreconciled between a search summary and the Terms.
- Independent reviews, audits, news coverage: NOT FOUND (searched: "Overdog.bet Polymarket sportsbook crypto betting"; second search refused by budget).
- Rate limits of Polymarket's builder endpoints: NOT FOUND.

---

## Sources

- https://overdog.bet/ (homepage, SSR payload, FAQ JSON-LD, 2026-10-19) - H
- https://overdog.bet/proof - M (summary)
- https://overdog.bet/legal/terms - M (summary; effective 21 June 2026)
- https://overdog.bet/legal/risk - M (summary)
- https://overdog.bet/polymarket-fees - H on formulas/examples (re-derived), M on summary flags
- https://overdog.bet/combos - M (summary)
- https://overdog.bet/support - M (summary)
- https://overdog.bet/robots.txt, /sitemap/pages.xml, /sitemap/sports.xml, /sitemap/pools.xml - H
- https://builders.polymarket.com/ - M (summary)
- https://docs.polymarket.com/developers/builders/builder-intro - M (summary)
- https://docs.polymarket.com/trading/fees - M (summary; formula quoted as given)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume - H (public GETs, 2026-10-19)
- https://gamma-api.polymarket.com/events/1177845 - H (public GET)
- https://clob.polymarket.com/markets/{conditionId} and /book?token_id= - H (public GETs)
- Web search "Overdog.bet Polymarket sportsbook crypto betting" (2026-10-19) - M (search-tool summary, venue's own marketing)
