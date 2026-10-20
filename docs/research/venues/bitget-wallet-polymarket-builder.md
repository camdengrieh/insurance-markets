# Bitget Wallet (Polymarket builder): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `web3.bitget.com` (HTML, sitemaps, static JS read as text and never executed), `docs.polymarket.com`, `data-api.polymarket.com`, `gamma-api.polymarket.com`, `clob.polymarket.com`, `builders.polymarket.com`, `api.llama.fi`; `gh api` reads of public Bitget GitHub repos; one WebFetch of the wallet homepage. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale (older than 6 months). "NOT FOUND (searched: ...)" means exactly that, not "no".

Limitations: the shared WebSearch budget was exhausted before my first search, so nothing here comes from web search; discovery relied on first-party pages and sitemaps. The Dune dashboard named in the discovery hint was therefore not located. I did not call any undocumented Bitget endpoint (they are POST or WebSocket only).

Fixtures (6 files, each <= 16 KB): `docs/research/fixtures/bitget-wallet-polymarket-builder/` (section 14).

---

## 0. Verdict

**adapter_priority: skip** (as an arbitrage leg or a data source). Keep a registry record and an alias rule only (section 13).

1. **Live, and the product surface is confirmed.** The hint said the wallet homepage did not mention prediction markets; that is true of the homepage body, but `https://web3.bitget.com/predictions` is a live, server-rendered prediction-market browser, linked from the site nav as "Predictions" and the footer as "Prediction Markets". Its event sitemap was stamped 2026-10-19 and the page data was updated 2026-10-19T04:09Z. (H)
2. **It is a front end, not a venue.** Bitget's own terms say the service is "provided by third-party service provider(s), for example Polymarket" and that Bitget "does not act as an exchange, broker, dealer...". Bitget's blog (2026-04-17) says "We've recently integrated Polymarket into Bitget Wallet". (H)
3. **100% shared liquidity with Polymarket.** For the Ballon d'Or event all 31 Bitget markets have the same `conditionId` and the same `clobTokenIds` as Polymarket's Gamma data, event volume was identical at fetch time (about $240 apart on $53.2M in an earlier fetch minutes before), and Bitget's embedded top-3 book levels match Polymarket's CLOB (same best bid 0.66 x 99.51 and best ask 0.662 x 69.98). (H, fixture `bitget-event-vs-polymarket-ballon-dor.json`)
4. **No official prediction API, trading only in the mobile app, and the ToU bans automated access.** (H)
5. **Small and fading.** Builder-attributed volume is $44.9M all time (since 2026-04-17), peaked at about $6.3M a week during the World Cup window, and runs about $180K a day now (under 1% of the $33.4M 24h volume of Polymarket's top 100 events alone). (H)

It is not an independent leg: any "Bitget price" is a Polymarket price. The scanner must treat it as an alias of Polymarket.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://web3.bitget.com/predictions` | HTTP 200, 2.08 MB SSR page titled "Prediction Markets: Real-Time Odds & Crypto Trade \| Bitget Wallet"; featured event `btc-updown-5m-1792383000` updated 2026-10-19T04:09:21Z | H |
| `predictions_event_sitemap_en.xml` | 2,004 event URLs, every `lastmod` 2026-10-19; list sitemap 365 category URLs | H |
| Polymarket `GET /v1/builders/leaderboard` | "Bitget Wallet" present in ALL (rank 27), MONTH (27), WEEK (22) and DAY windows; `verified: true` | H |
| Polymarket `GET /v1/builders/volume?timePeriod=DAY` | non-zero volume on every UTC day from 2026-04-17 to 2026-10-18 except 2026-04-29 (no row); 2026-10-18 = $309,932, 126 active users | H |
| `https://builders.polymarket.com/` (HTML) | Bitget Wallet row, $4.01M for the month view | H |
| Launch | Blog "Prediction markets now live on Bitget Wallet", published 2026-04-17 (+08:00); first builder volume that same UTC day ($98, 2 users), first real day 2026-04-18 ($39.6K) | H |
| Terms | "Bitget Wallet Prediction Markets Terms and Conditions, Updated on [11-Mar-2026]" | H |

**still_live = true.** Launch date 2026-04-17 is under 6 months old, so nothing here is stale except the Bitget Wallet Terms of Use (updated 10-Nov-2025, about 11 months old, L for currency).

## 2. Kind and market model

- **Kind (H):** broker / front end inside a non-custodial wallet, routing orders to Polymarket's CLOB with Bitget's builder code. DefiLlama has no listing for it (`/protocols` has Bitget CEX, bgBTC, SOL, "Bitget Wallet X", "Card" and "Perps" with tag `Hyperliquid Builder`, but nothing for predictions). (H for the absence in that list)
- **Market model:** Polymarket's. Binary Yes/No (and named-outcome) tokens on a CLOB; multi-outcome events are neg-risk groups (`neg_risk: true` in Bitget's book payload). Crypto "Up or Down" 5m/15m/1h/4h series resolve from Chainlink TWAP streams. No scalar markets seen. (H, Bitget page data)
- **Tokenisation:** Polymarket conditional tokens; Bitget exposes `conditionId` and `clobTokenIds` unchanged. Sampled markets carry `version: "v1"`. Tick size 0.01 (0.001 on some books), `min_order_size` 5 shares. (H)
- **Catalogue is a filtered subset:** it shows only markets with non-zero volume (31 of 89 markets in the Ballon d'Or event; the 58 hidden are zero-volume placeholders carrying no volume). Of Polymarket's top 100 events by 24h volume, 95 have a live Bitget event page and 5 return HTTP 404: `brazil-presidential-election` (3 events), `will-china-invade-taiwan-before-2027`, `xi-jinping-out-before-2027`. Those 95 hold 95.7% of the 24h volume. So Bitget appears to run a deny-list for some political events (the client has a `blacklist` query key). The reason is not stated (M). (H for counts, fixture `bitget-coverage-of-polymarket-top100-24h.json`)
- **Gotcha for any parser:** Bitget `outcomePrices` are cents-scale strings (`["66.3","33.9"]`), Gamma's are dollar-scale. Do not mix them. (H)

## 3. Chains and collateral

- **Settlement chain: Polygon** (Polymarket CLOB signing domain `chainId: 137` in the docs; Bitget deep links carry `_needChain=matic`). (H)
- **Collateral:** Polymarket's pUSD (Polymarket docs fee page speaks of "a 1,000 pUSD taker buy"). Addresses belong to the Polymarket adapter; see `docs/research/venues/metamask-polymarket-integration.md` section 2 for the contract list as seen in MetaMask's source (M, not re-verified here). (H for pUSD name)
- **Funding UX (Bitget claim, L for truth):** "Instant funding: Top up your account via Apple Pay and other payment methods", "Gas abstraction means frictionless transactions and zero-cost top-ups across major EVM chains and Solana". Which bridge or on-ramp sits behind this is NOT FOUND (searched: blog, terms, page bundle). The bundle has native-app calls `prediction_market_deposit` / `prediction_market_withdraw` that need app version 9.39.0 or newer. (H for strings)
- **Account setup:** UI strings show "Account setup successful!", "Signing failed", "Watch-only wallet not supported", which implies the user's wallet signs messages to create or derive a Polymarket trading account. Wallet type (EOA, proxy, Safe or deposit wallet) is NOT FOUND (searched: page bundle, terms, blog). (M)

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API for Bitget prediction data | **None.** Bitget Wallet developer docs (`/en/docs`, roughly 70 pages: authentication, configuration, connect, features, guide, market, payfi, resource, telegram, trading, changelog) cover swap, bridge, market price, RWA, PayFi and wallet connect. Zero hits for "prediction" or "polymarket" in the docs auth page or the changelog. | H |
| Public repos | `bitget-wallet-ai-lab` has 6 repos (skill, MCP, CLI, partner-skill, developer-skill, cursor plugin); no mention of prediction or Polymarket in the README, SKILL or CHANGELOG files I grepped in any of them. The older GitHub account `bitgetwallet` has 10 repos by name only (bkbridge, bkexchange, bkswapv2, bwb, staking, solana-swap, dapp-integration-demos and similar); I did not grep their contents. | H |
| Public pages | `GET /predictions`, `/predictions/{category}`, `/predictions/event/{polymarket-slug}` return SSR HTML with a `__NEXT_DATA__` JSON blob (events, markets, 3-level books, volume, tag tree). Public and unauthenticated, but see section 9 on automation. | H |
| Undocumented first-party backend | The page bundle calls **POST** `https://api-web.bitkeep.fun/prediction-markets/api/` + `tags/tree`, `event/list/v2`, `event/detail`, `event/sports/list/v2`, `event/sports/live/v2`, `event/sports/props/v2`, `headline/recommend`, `price/history`, `public/search`. **Not called** (POST is out of bounds for this task; no docs, no auth or limit information). | H for presence, NOT FOUND for contract |
| WebSocket | Bundle lists `wss://prediction-markets-ws.bitkeep.app/ws/biz` plus `.asia`, `.biz`, `.fun`, `.life` and `chainnear.com` fallbacks; messages carry `best_bid`, `best_ask`, `push_ts`, score and status updates. **Not connected.** | H for presence |
| Rate limits, auth | NOT FOUND (searched: docs, terms, bundle, robots.txt). robots.txt disallows only `/*/dapp/browsinghistory`, `/collect`, `/searchresults`; it does not disallow `/predictions`. | H |
| Canonical read path | **Use Polymarket's official APIs**, which return the same ids and books: `https://gamma-api.polymarket.com` (events, markets), `https://clob.polymarket.com` (`/book`, `/prices-history`), `https://data-api.polymarket.com` (`/v1/builders/leaderboard`, `/v1/builders/volume`). Docs: https://docs.polymarket.com (llms index https://docs.polymarket.com/llms.txt). | H |

Confirmed response shapes (public GET, fixtures saved):
- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0` returns a bare array of at most 50 rows `{rank:"27", builder:"Bitget Wallet", builderCode:"0x9e6b...825a", volume:44876165.55, activeUsers:32357, verified:true, builderLogo}`. `limit=100` was still capped at 50. Fixture `polymarket-builders-leaderboard-bitget-rows.json`. (H)
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod={DAY|WEEK|MONTH|ALL}` returns every builder's series as rows `{dt, builder, builderCode, volume, activeUsers, rank}`; the DAY file is 17 MB, so filter client-side. WEEK buckets start on Sunday; the ALL window is a single cumulative bucket. Fixture `polymarket-builders-volume-bitget-series.json`. (H)
- `GET https://web3.bitget.com/predictions` SSR payload: event `{id, slug, title, endDate, resolutionSource, volume, tag, deeplink, markets{bgw_default[{conditionId, outcomes, outcomePrices(cents), clobTokenIds, usdcSize, volume, description, bookInfo{<tokenId>{bids[3], asks[3], tick_size, min_order_size, neg_risk, last_trade_price}}}]}}`. Fixture `bitget-predictions-featured-event.json`. (H)

## 5. Trade path

- **Bitget:** orders are placed **inside the Bitget Wallet mobile app**. The website is browse-only: its UI string reads "Scan with Bitget Wallet app to place order". There is no documented REST, SDK or signing scheme for third parties. (H)
- **Under the hood (M):** a Polymarket CLOB order whose signed struct carries `builder` = Bitget's `bytes32` builder code (`0x9e6b4ca0...825a`, public in the leaderboard). Polymarket docs: the builder code "is serialized onchain as part of the signed order", and orders go to `https://clob.polymarket.com` with L2 API credentials. Order signing, `signatureType` and the V2 exchange details belong to the Polymarket adapter (see `docs/research/08-venues-polymarket-kalshi.md`).
- **Agent path:** if you want to trade these markets, trade Polymarket directly via the Polymarket adapter. Reusing Bitget's builder code from third-party software is not offered, is not in any Bitget doc, and would route builder fees to Bitget; do not attempt it. (M)

## 6. Reachable through PayBox? **no** (for Bitget as a distinct venue)

- A PayBox EVM wallet cannot trade "on Bitget": there is no Bitget order API, no contract of Bitget's own to propose transactions to, and the in-app flow is mobile-only. (H)
- The underlying markets are reachable only through the Polymarket route (Polygon, EIP-712 typed-data orders, per the sibling note's reading of the `request_wallet_sign` typed-data intent, plus pUSD approvals), which the Polymarket adapter owns. Whether PayBox supports Polygon at the tool level was not checked here (no PayBox tool was called). (M)

## 7. Fees

- **Bitget's own fee: NOT FOUND** (searched: prediction terms, blog, page i18n strings, builders.polymarket.com HTML, Polymarket CLOB/Gamma/Data OpenAPI specs, docs index). Polymarket says "Builder profiles and fee rates are publicly queryable", but I found no documented endpoint that does it (`/builder/trades` is a CLOB trade endpoint, presumably builder-authenticated; not called). My guessed paths returned 404; I did not pursue more. (H for the claim, NOT FOUND for the endpoint)
- **Bitget terms:** "You must pay the fees and charges for the Services as specified from time to time on the Platform", and "Third-Party Markets and networks may charge fees (including trading fees, spreads, gas fees). Those fees are not controlled by Bitget Wallet." (H)
- **Polymarket platform fee (docs, H):** `fee = C x feeRate x p x (1 - p)`, taker only, makers never pay. Rates: Crypto 0.07; Sports 0.05; Finance, Politics, Mentions, Tech 0.04; Economics, Culture, Weather, Other 0.05; Geopolitics 0. Source https://docs.polymarket.com/trading/fees.md.
- **Polymarket builder fee (docs, H):** `builder_fee = notional x bps / 10000`, flat percent of notional, **additive** to the platform fee. Caps: taker 100 bps (1%), maker 50 bps (0.5%), 1 bp granularity, default 0. Rate changes: one per 7 days, effective 3 days after scheduling. Source https://docs.polymarket.com/programs/builders/fees.md.
- **Net:** a Bitget user pays at least what a direct Polymarket user pays, plus an unknown builder fee of at most 1% taker / 0.5% maker, plus any on-ramp cost. Execution is never better than Polymarket direct. (M)

## 8. Resolution mechanism and dispute risk

Entirely Polymarket's. UMA Optimistic Oracle for prediction markets (proposal with a bond "typically $750 pUSD", 2-hour challenge period, a second dispute escalates to a UMA DVM token-holder vote) and Chainlink TWAP for up/down markets. (H, https://docs.polymarket.com/concepts/resolution.md). Bitget "does not guarantee that any market will resolve as you expect, resolve at all, or resolve on any particular timeline" and is not responsible for manipulation, wash trading, low liquidity or Polymarket pausing or terminating markets. (H, Bitget terms). Extra Bitget-specific risk: it can hide or delist events (section 2), which may limit exit through the Bitget app; whether the user's positions can also be managed on polymarket.com is NOT FOUND. (M)

## 9. Geo, ToS and automation

- **Bitget prediction terms (H):** the service "is restricted or may be illegal in some jurisdictions, including but not limited to Singapore, China and South Korea"; eligibility is limited to "certain countries/jurisdictions". The app shows: "Due to local regulatory restrictions, this service is not available in your region." The blog disclaimer adds "may be restricted or unavailable in certain regions". Polymarket's own geoblock (US close-only, many others; IP-based) applies on top; details in `docs/research/08-venues-polymarket-kalshi.md`.
- **Automation (H, Bitget Wallet Terms of Use, "Updated on: [10]-Nov-2025"):** users may not "use any automated programs, software, engines, web crawlers, web analysis tools, data mining tools or similar tools to access the Bitget Wallet's services, collect or process the content provided by the Bitget Wallet". Do not build the scanner on Bitget pages or its internal API. Note that my own research made a small number of GETs to public Bitget pages (about 110 event/landing pages and sitemaps, spaced at 0.25 to 0.3 s) to verify the claims here; that is not a pattern to copy into production.
- No VPN or bot clause specific to prediction markets found beyond the above. (NOT FOUND, searched: prediction terms, Terms of Use keyword scan)

## 10. Liquidity

All figures are **builder-attributed Polymarket volume** for Bitget's builder code (notional matched through orders carrying the code), from Polymarket's Data API, fetched 2026-10-19. There is no separate TVL or open interest: positions are ordinary Polymarket positions. Whether `volume` counts one or both sides of a trade is not documented (M).

| Window | Volume (USD) | Active users | Leaderboard rank | Tag |
|---|---|---|---|---|
| All time (since 2026-04-17) | 44.88M | 32,357 | 27 (ALL) | H |
| 2026-04 | 0.78M | 595 | 45 | H |
| 2026-05 | 4.35M | 1,900 | 25 | H |
| 2026-06 | 12.57M | 14,643 | 17 | H |
| 2026-07 | 16.30M | 19,609 | 14 | H |
| 2026-08 | 3.88M | 1,180 | 28 | H |
| 2026-09 | 2.98M | 1,023 | 33 | H |
| 2026-10 (to 10-19, partial) | 4.01M | 640 | 27 | H |
| Peak week (starting 2026-06-28) | 6.29M | 16,163 | 14 | H |
| Last 7 full days (10-12 to 10-18) | 1.45M (avg 208K/day) | 108 to 142/day | n/a | H |
| Last 30 full days | 5.45M (avg 182K/day) | 93 to 146/day | n/a | H |

Reading: the spike from mid-June to 2026-07-19 lines up with the FIFA World Cup 2026 promotions embedded in the page strings ("Champion Pick - Share $20,000", "20-Day Prediction Streak - Share $80,000 - Coming Soon"; M for the causal link). Since the final, weekly volume fell from $6.3M at the peak to $0.5M to $1.9M a week from August on (last full week, starting 2026-10-11: $1.38M). For scale, the top 100 Polymarket events alone traded $33.4M in the trailing 24h (Gamma `volume24hr`, fetched 2026-10-19), so Bitget's daily flow is well under 1% of Polymarket's. (H for the numbers, M for the comparison)

## 11. Event coverage (where arbitrage could exist)

Bitget's tag tree (H, from the page): **Sports** (soccer, basketball, esports, cricket, baseball, football incl. NFL/CFB, ice hockey, tennis, F1, rugby), **Crypto** (5m/15m/1h/4h up-down, hit-price, weekly, airdrops, stablecoins), **Finance** (Fed rates, earnings, IPOs, indices, treasuries), **Politics** (Trump, US midterms, global elections, Brazil, Israel, France, China, Russia, Venezuela), **Tech** (AI, OpenAI, SpaceX, Apple, Musk), **Climate & Science** (temperature, hurricanes, earthquakes), **Culture** (music, movies, box office, awards). That is all of the categories that overlap Kalshi, Limitless, Predict.fun and the rest, but each is simply Polymarket's market. No macro/economics or geopolitics top-level tab exists, though geopolitical events appear under Politics (an Israel-Iran ceasefire event has a live page). Fixture `bitget-predictions-sitemap-and-tag-tree-summary.json`.

## 12. Shared liquidity

**Shares 100% with Polymarket International** (same CLOB, same conditional tokens, same UMA resolution). Identical `conditionId`s and token IDs (31 of 31 sampled), same event volume, same book. The same relationship holds for other wallets on the builder leaderboard (MetaMask, Gate, Bullpen and others). **It is NOT an independent arbitrage leg.** Mapping rule for the market-linking layer: Bitget event slug == Polymarket event slug, market identity == `conditionId`.

## 13. Recommendation

- **adapter_priority: skip.** Reasons: duplicate liquidity, no official API, mobile-only trading, ToU forbids automated access, shrinking volume.
- Keep a registry entry `kind: frontend-of`, `upstream: polymarket`, `independent_liquidity: false`, so the scanner never counts it as a leg and never double-counts volume.
- Optional, low value: Polymarket's public builder endpoints give a daily retail-attention series (volume and active users for this code). It is a weak signal of mobile retail flow, not worth a dedicated adapter.

## 14. Fixtures (`docs/research/fixtures/bitget-wallet-polymarket-builder/`)

| File | What |
|---|---|
| `polymarket-builders-leaderboard-bitget-rows.json` | Bitget row (and neighbours) from the four leaderboard windows |
| `polymarket-builders-volume-bitget-series.json` | Bitget monthly, weekly, last-60-day daily series; builder code |
| `bitget-predictions-featured-event.json` | One SSR event from `/predictions` (BTC up/down 5m), description truncated |
| `bitget-event-vs-polymarket-ballon-dor.json` | Side-by-side proof of identical ids, volume and book (Bitget vs Gamma vs CLOB) |
| `bitget-predictions-sitemap-and-tag-tree-summary.json` | Sitemap counts, category tag tree, sample slugs |
| `bitget-coverage-of-polymarket-top100-24h.json` | HTTP status of Bitget event pages for Polymarket's top 100 events by 24h volume |

## 15. NOT FOUND and open questions

- Bitget's actual builder fee rate. (searched: Bitget terms, blog, page strings, builders.polymarket.com HTML, Polymarket OpenAPI specs and docs index)
- Any official Bitget prediction API, SDK, docs page or rate limit. (searched: web3.bitget.com docs nav and changelog, `bitget-wallet-ai-lab` and `bitgetwallet` GitHub accounts, robots.txt, sitemaps)
- The wallet type behind the Bitget-created Polymarket account and whether it is usable on polymarket.com. (searched: page bundle strings, blog, terms)
- The Dune dashboard "Prediction Market User Analysis - Q1 2026" from the discovery hint. Not located because web search was unavailable; the builder code has no volume before 2026-04-17, so a Q1 dashboard cannot be measuring this integration (M).
- Why five top events return 404 on Bitget (deny-list reason).
- Whether Bitget applies a geo list stricter than Polymarket's.

## 16. Sources

1. Bitget Wallet predictions page (SSR data, tag tree, i18n strings, bundle): https://web3.bitget.com/predictions (H, fetched 2026-10-19)
2. Bitget Wallet event page used for the cross-check: https://web3.bitget.com/predictions/event/ballon-dor-winner-2026 (H)
3. Bitget Wallet prediction sitemaps: https://web3.bitget.com/com/predictions/predictions_event_sitemap_en.xml and https://web3.bitget.com/com/predictions/predictions_list_sitemap_en.xml (H)
4. Bitget Wallet Prediction Markets Terms (Updated 11-Mar-2026): https://web3.bitget.com/predictions/terms-and-rules (H)
5. Bitget Wallet Terms of Use (Updated 10-Nov-2025): https://web3.bitget.com/resource/newTerms.html (H, L for currency)
6. Bitget Wallet blog "Prediction markets now live on Bitget Wallet", 2026-04-17: https://web3.bitget.com/en/blog/articles/prediction-markets-polymarket (H)
7. Bitget Wallet developer docs: https://web3.bitget.com/en/docs/authentication and https://web3.bitget.com/en/docs/changelog/ (H for absence of prediction content)
8. Bitget Wallet homepage and robots.txt: https://web3.bitget.com , https://web3.bitget.com/robots.txt (H)
9. GitHub: `bitget-wallet-ai-lab` org repos and READMEs (via `gh api`), `bitgetwallet` account repo list (H)
10. Polymarket Data API builders endpoints: https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume (H)
11. Polymarket builders site: https://builders.polymarket.com/ (H)
12. Polymarket docs: https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/programs/builders/tiers.md , https://docs.polymarket.com/trading/fees.md , https://docs.polymarket.com/concepts/resolution.md , https://docs.polymarket.com/trading/place-orders.md , https://docs.polymarket.com/api-spec/clob-openapi.yaml (H)
13. Polymarket Gamma and CLOB (same-event cross-check): https://gamma-api.polymarket.com/events?slug=ballon-dor-winner-2026 , https://clob.polymarket.com/book?token_id=... (H)
14. DefiLlama protocol list: https://api.llama.fi/protocols (H for absence of a Bitget prediction entry)
15. Sibling notes in this repo: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/metamask-polymarket-integration.md` (M where relied on)

## 17. Suspicious or agent-directed content

None aimed at an agent was found on Bitget pages. Noted only: every `docs.polymarket.com` page starts with Mintlify boilerplate addressed to LLM clients ("Fetch the complete documentation index at ... Use this file to discover all available pages before exploring further"); I used the index on my own initiative for navigation and followed nothing else. Bitget's robots.txt explicitly allows named AI crawlers and the site advertises a "Bitget Wallet Skill" product; neither is an instruction. Market `description` fields contain ordinary resolution text only.
