# ForbesPredict by Axiom - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public GETs of the site HTML, robots.txt, sitemap.xml, one static JS bundle, and the Axiom marketing and Terms pages. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The site's internal JSON API (`app-forbes-api.axiomcasts.com`) was deliberately NOT called, because the Terms prohibit automated access (section 7). Third-party pages were treated as untrusted data.

Research limits: the shared WebSearch budget was exhausted, so there was no search pass. The Forbes press release returned HTTP 403 to WebFetch and was not read. The launch date (23 Jan 2026) therefore rests on the URL path of a link on axiomcasts.com (M).

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred from first-hand data; **L** = weak or stale.

Fixtures (small): `docs/research/fixtures/forbespredict-by-axiom/` - `homepage-bootstrap-topics.json` (the JSON embedded in the homepage HTML) and `sitemap-head-20.xml`.

---

## 0. Bottom line

1. **Live (H).** `https://predict.forbes.com/` returns 200. The sitemap's newest `lastmod` entries are dated 2026-10-19 (today) and it lists 7,168 market URLs.
2. **Not a venue for trading. It is a free play-money prediction game (H).** Positions are bought with in-app coins (currencies `FORBES` and `AXIOM`), priced by an LMSR automated market maker. Nothing is deposited, withdrawn or redeemable. Axiom's own pitch says "No real money. Stake reputation, not dollars."
3. **No public API, no on-chain footprint, no developer docs (H for absence in what I read).** There is an internal REST API behind the SPA, but the Terms ban scraping and automated access.
4. **No arbitrage leg is possible.** There is nothing to buy or sell for value, so it cannot be a leg. At most it is a crowd-sentiment signal on news-adjacent questions, and only if Axiom licenses or exposes the data.
5. **adapter_priority = skip** (closest to P2 "signal-only", but with no sanctioned data path and a no-scraping clause I would not build an adapter). Revisit only if Axiom publishes an API or agrees to data sharing.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://predict.forbes.com/` | HTTP 200, `<title>ForbesPredict by Axiom`, description "Predict what happens next in the news you're already reading. Free to play, always." | H |
| Homepage embedded bootstrap JSON | 18 topics with `marketCount`, summing to 4,850 (largest: Celebrities & Entertainment 1,298; Sports & Olympics 1,068; Markets & Economy 852; Politics & Government 464; Tech & AI 387; Crypto & Digital Assets 31). Flags in `clientConfig`: `streaksEnabled:false`, `leaderboardsEnabled:false`, `midtermsEnabled:false`. Embedded at epoch ms 1792385656609 (about 2026-10-19). | H |
| `GET /sitemap.xml` | 7,168 `<url>` entries, newest lastmod 2026-10-19T04:13Z. New markets appear several times a day. The count (7,168) is higher than the 4,850 topic total, probably because it includes resolved or closed markets (inference). | H / M |
| axiomcasts.com | Banner "LIVE - Davos 2026 - Announcing our launch partnership with Forbes". Terms last modified 25 Feb 2026. Footer "2026 Axiom". | H |
| Launch date | Link on axiomcasts.com: `forbes.com/sites/pr/2026/01/23/forbes-partners-with-axiom-to-launch-forbespredict-...`. Press release itself not read (403). | M |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind: forecasting-nonmoney (play-money, media-embedded).** Operator is Axiomcasts LLC (Dover, DE), "an entity independent of Forbes" per its Terms (H). Axiom pitches itself as a white-label "prediction layer for media" with Forbes as launch partner; other publishers may follow (H, marketing page).
- **Market model: binary YES/NO only (H).** The client schema constrains `outcomes` to the pair YES/NO. The topic/market schema also has `yesVotes`, `noVotes`, `totalVotes`, `yesPrice`, `noPrice`. The bundle's cast-submit schema allows `outcomeIndex` up to 31, so multi-outcome may exist in the backend, but the public schema I saw is binary (M).
- **Pricing: LMSR automated market maker, not an order book (H, from bundle strings).** Market objects carry `algorithmParams: {baseB, alpha}`, `currentQuantities`, `effectiveLiquidity`, and a simulate-cast endpoint returning `cost`, `sharesPurchased`, `avgPrice`, `projectedPrices`. Users submit "casts" with `tokenAmount` plus optional `minSharesOut` / `maxAvgPrice` (slippage guards). The bundle also contains legacy order/trade event names (`BUY/SELL`, `LIMIT/MARKET`, `TradeSettled`), so an earlier order-book design may have existed. Current mechanics appear to be LMSR (M).
- **Market states:** `paused`, `open`, `locked`, `resolved`, `settled` (H, bundle enum). Markets have `locksAt` and `resolvingAt` timestamps.
- **Tokenisation: none.** Positions are rows in a server database (H for absence of any contract or chain reference in the bundle).
- **Question style:** editorially generated, mostly long-dated corporate, entertainment, sports and tech questions, e.g. "Affirm will outperform Visa stock through December 31st", "Riot will nerf Hush within 30 days of her Valorant launch" (H, sitemap slugs).

## 3. Chains and collateral

None. Currency enum is `FORBES` | `AXIOM` (in-app coins, H). Terms describe "in-world currency, tokens, and/or fictional property" which Axiom owns outright (H). Users get a welcome bonus (500), daily bonus (300) and can spend 10 coins to unlock a market's arguments (H, bundle constants). No cash-out, no purchase flow found.

## 4. Read API

- **Exists: none official or public** (NOT FOUND: no developer docs, API reference, OpenAPI, GitHub org or status page; searched axiomcasts.com home and terms, predict.forbes.com HTML and bundle, robots.txt, sitemap).
- Internal host seen in the bundle: `https://app-forbes-api.axiomcasts.com` (traces to the same host's OTEL path), plus `rs-forbes.axiomcasts.com` and `share-image-forbes.axiomcasts.com`. Same-origin paths referenced by the SPA (H, names only, not called): `/api/markets`, `/api/markets/categories`, `/api/markets/sitemap`, `/api/topics`, `/api/topics/stats`, `/api/recommended-markets`, `/api/casts`, `/api/casts/flip`, `/api/user/balances`, `/api/user/positions`, `/api/auth/*`, `/api/whoami`, `/api/jurisdiction`, `/api/client-config`. A websocket/event stream also exists for the logged-in balance and position updates (message type `snapshot`, `balance_update`; ping payload `{"type":"ping"}`) (M).
- Market object fields (from the client's validation schemas, H): `marketId`, `slug`, `question`, `status`, `winningOutcome`, `currentYesPrice`, `currentNoPrice`, `currentQuantities`, `totalVolume`, `lastTradeAt`, `priceHistory`, `resolvingAt`, `locksAt`, `resolvedAt`, `resolutionCriteria`, `resolutionSource`, `resolutionReason`, `resolvedBy`, `categories`.
- **Read data that is public without the internal API:** the homepage's embedded topic counts (fixture) and the sitemap of market slugs (fixture). Robots.txt allows everything, but the Terms say scraping is only permitted for search-engine spiders.
- Auth and limits: user auth is Firebase (email link / custom token), exchanged through `/api/auth/*`. Rate limits NOT FOUND. Anonymous browsing appears possible (`anonSignupLazy:true`).
- I did not capture a live market response, so no market-data fixture exists (deliberate; see ToS).

## 5. Trade path

None for an agent. Placing a "cast" requires a logged-in Firebase session in an account that holds play coins. No signed-order or on-chain path, no API keys. **PayBox reachable: no** - there is no chain, token or contract to reach with an EVM or Solana wallet, and nothing of monetary value to trade.

## 6. Fees

No trading fees found (NOT FOUND in the bundle or Terms; searched for fee/commission terms; the only hits were unrelated). With an LMSR market maker the "cost" is path-dependent price impact, paid in play coins. There is no money fee since nothing is cashed out.

## 7. Geo, ToS and automation rules

- Terms (Axiomcasts LLC, last modified 25 Feb 2026, H): you may not "use any automated or non-automated means to access the Service for 'scraping' (except that public search engines may use spiders ...)", nor reverse engineer or resell any part of the Service, nor impact server stability. Users must be 18+. US sanctions (OFAC) exclusions apply. Axiom may add usage limits or stop the service at will.
- Geography: no region-block clause found beyond sanctions. The SPA calls `/api/jurisdiction`, so some gating may exist (M). Not a gambling product by design ("no gambling classification" per Axiom's marketing, H).
- Arbitration clause (JAMS) and class-action waiver (H).
- Data use: user preferences `doNotSell` and `doNotTrain` exist (H, schema). Axiom brands reader predictions as "first-party signal" for publishers (H).
- Consequence: do not scrape. Any ingestion needs a written data agreement with Axiom (partners@axiomcasts.com is listed on their site, H; do not contact on the user's behalf without approval).

## 8. Resolution

- Each market has `resolutionCriteria` and `resolutionSource`, with `outcomeDeterminedAt`, `resolutionReason`, `resolvedBy` (H, schema). Resolution appears to be done by Axiom/Forbes editorial staff or a generation pipeline ("generationId", suggested/replaced/regeneration_option states for AI-assisted question suggestion, M). No oracle, no dispute window or appeal path found (NOT FOUND). Dispute risk is moot for money (no money), but for signal use the labels are centralised and editorial.
- Trades settle with `MarketPayout` events paying coins to the winning side (H, event names).

## 9. Liquidity

No money, so no volume/OI/TVL in USD. Closest figures: 4,850 markets on the homepage (2026-10-19) and 7,168 sitemap URLs (2026-10-19), both H. Per-market `totalVolume` and `traders` exist but are in coins; I did not fetch values. User count, active forecasters, and coin volume: NOT FOUND (searched homepage and Axiom site).

## 10. Event overlap (arbitrage relevance)

Zero tradeable overlap, since it is not a monetary venue. Topical overlap with money venues, for a signal-only use:
- Politics & Government (464 markets), Immigration & Foreign Policy (63): overlaps with Polymarket and Kalshi, but many are long-dated and bespoke.
- Markets & Economy (852), Gold/Silver/Commodities (48), Crypto (31): some stock-relative and price-threshold questions (e.g. Affirm vs Visa), mostly not standard Kalshi/Polymarket ladders.
- Sports & Olympics (1,068): UFC/boxing/golf style questions.
- Dominant categories are celebrity, entertainment, tech and gaming, which are thin elsewhere.
Any crowd probability would be a play-money consensus, not a price, and should be weighted accordingly.

## 11. Shared liquidity

No liquidity to share. The only independent link is Axiom's own multi-publisher network (the `AXIOM` currency alongside `FORBES`); other Axiom publisher sites would likely mirror the same market set, so that is not independent either (M).

## 12. Adapter recommendation

**skip.** Reasons: no money, no sanctioned API, no-scraping Terms, centralised editorial resolution, no unique arbitrage value. If the aggregator later wants a "retail crowd sentiment" signal, request a licensed feed from Axiom rather than reading the internal API.

## 13. Open questions

- Does Axiom offer a data or API licence to partners (the site only advertises publisher partnerships)?
- Is multi-outcome supported, or YES/NO only?
- Does a public anonymous GET on `/api/markets` exist and what are its limits? (Not probed due to Terms.)
- Exact launch date (press release returned 403).
- Active user count and coin volume.

## Sources

- https://predict.forbes.com/ (H: title, description, embedded bootstrap JSON, topics)
- https://predict.forbes.com/robots.txt (H)
- https://predict.forbes.com/sitemap.xml (H: 7,168 URLs)
- https://predict.forbes.com/assets/index-h2svMnQc.js (H: static SPA bundle, read for schemas/enums/path names only; no code executed)
- https://www.axiomcasts.com/ (H: positioning, no real money, Forbes launch partner, contact for partners)
- https://www.axiomcasts.com/terms/ (H: Terms last modified 25 Feb 2026; no-scraping clause; in-world currency)
- https://www.forbes.com/sites/pr/2026/01/23/forbes-partners-with-axiom-to-launch-forbespredict-a-first-of-its-kind-prediction-platform-built-for-media/ (link seen on axiomcasts.com; fetch returned 403, NOT READ; date inferred from URL, M)
