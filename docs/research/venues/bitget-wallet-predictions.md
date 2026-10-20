# Bitget Wallet Predictions: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (probes about 04:15 to 04:45 UTC). READ-ONLY: public unauthenticated GETs with User-Agent `insurance-markets-research/0.1` to `web3.bitget.com` (the predictions page, its terms, the Terms of Use, robots.txt, sitemaps), `docs.polymarket.com`, `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com`; `gh api` reads of public Bitget repos; WebFetch/WebSearch of public pages. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data and nothing in it was followed. The shared WebSearch budget ran out partway through, so a couple of searches I wanted (a second-provider check) were not possible; that is stated where it matters.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, summariser output, a sibling research note, or my inference; **L** = weak or stale (older than 6 months). "NOT FOUND (searched: ...)" means exactly that, not "no".

Relation to existing notes: `docs/research/venues/bitget-wallet-polymarket-builder.md` covers the same product under a different discovery label (Polymarket builder). This note re-verifies its central claims independently and adds the sports-market and v2 builder-API data. The scanner registry should hold **one** record for both labels.

Fixtures (5 files, each < 5 KB): `docs/research/fixtures/bitget-wallet-predictions/` (section 13).

---

## 0. Bottom line

**adapter_priority: skip** (as an arbitrage leg or data source). Keep one registry record: `kind: frontend-of`, `upstream: polymarket`, `independent_liquidity: false`.

1. **Live** (2026-10-19): `https://web3.bitget.com/predictions` returns HTTP 200; all 2,004 event URLs in its sitemap carry `lastmod` 2026-10-19; the SSR payload shows events updated minutes before fetch; Polymarket's builder leaderboard still lists "Bitget Wallet". (H)
2. **It is a front end inside a non-custodial wallet, not a venue.** Bitget's own terms: the service "will be provided by third-party service provider(s), for example Polymarket" and Bitget "does not act as an exchange, broker, dealer, intermediary, bookmaker...". Its launch blog (2026-04-17) and the June 2026 press coverage name only Polymarket. (H)
3. **100% shared liquidity with Polymarket.** For 9 of 9 events compared (8 top-volume events plus an EPL match) every Bitget market has the same `conditionId` and `clobTokenIds` as Polymarket Gamma, event volumes match to within minutes of drift (identical to the cent on one event), and the embedded order-book levels match Polymarket's CLOB. (H, fixtures `shared-liquidity-sample-8-events.json`, `bitget-sports-market-vs-polymarket.json`)
4. **No official prediction API.** Bitget's developer docs, sitemaps and GitHub orgs contain nothing on predictions. Trading happens only in the mobile app. The Bitget Wallet Terms of Use bans automated access to its services. (H)
5. **Small and fading.** About $44.9M of builder-attributed Polymarket volume since launch, peaking at $6.3M in the week of 2026-06-28 (World Cup promotion); recent full weeks are $0.8M to $1.9M. (H, fixture `polymarket-builders-volume-weekly-bitget.json`)

Scanner rule: any "Bitget price" is a Polymarket price. Treat Bitget as an alias of Polymarket and never count it as a leg.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://web3.bitget.com/predictions` | HTTP 200, 2,071,314 bytes, Next.js SSR with `__NEXT_DATA__`; featured BTC 5-minute event updated 2026-10-19T04:23Z; the page lists 7 category tabs plus All | H |
| Event sitemap `https://web3.bitget.com/com/predictions/predictions_event_sitemap_en.xml` | 2,004 `<loc>` entries, every `lastmod` = 2026-10-19; list sitemap has 365 URLs | H |
| Launch announcement | Bitget blog "Predict What's Next: AI-Powered Prediction Markets Live on Bitget Wallet", dated 2026-04-17 (https://web3.bitget.com/en/blog/articles/prediction-markets-polymarket) | H (date and provider via a summarising fetch of the page, so partly M) |
| Press | GlobeNewswire 2026-04-22 "Bitget Wallet Launches AI-Powered Prediction Market Access Through Polymarket Integration" (found via search; the page itself returned HTTP 403 to me, so its text is unread); Bitget news 2026-06-05 on the World Cup feature | M |
| Polymarket builder program | "Bitget Wallet" is on the leaderboard in ALL (rank 27), WEEK (22), MONTH (27) and DAY windows, `verified: true` (https://data-api.polymarket.com/v1/builders/leaderboard and /v2/...) | H |
| Terms | "Bitget Wallet Prediction Markets Terms and Conditions, Updated on [11-Mar-2026]" (https://web3.bitget.com/predictions/terms-and-rules) | H |

**still_live = true.** The product launched 2026-04-17, under 6 months ago. The World Cup reward campaigns (June 4 to July 20, and June 11 to June 30) are over (M). The Bitget Wallet Terms of Use are dated 10-Nov-2025, about 11 months old, so their currency is L even though the text is H.

The discovery hint said the "Powered by" provider was not named in the fetched text. Confirmed: the footer has the words "Powered by" followed by an unlabeled SVG wordmark (82x15, no title or aria-label) inside a link to the terms page; the provider name is not present as text. Provider identity therefore rests on the terms ("for example Polymarket") and the id-level match in section 12. (H)

## 2. Kind and market model

- **Kind (H):** broker/front end ("Predictions" tab) in the Bitget Wallet app, routing to Polymarket's CLOB. The 3 featured events carry deep links of the form `https://newshare.bwb.online/en/polymarket/event?slug={polymarket_slug}&_nobar=true&_needChain` (the path segment is `polymarket`), and all event slugs equal Polymarket event slugs (for example `epl-tot-cov-2026-10-19`).
- **Model (H, from the Bitget payload and Polymarket docs):** Polymarket's. Binary Yes/No conditional tokens, one CLOB book per outcome token, multi-outcome events as neg-risk groups (`neg_risk: true` in the Bitget book payload). Price tick 0.01 and `min_order_size` 5 shares in the sampled book. Sports events hold sub-markets grouped by `sportsMarketType` (for example `moneyline`); other events use a `bgw_default` group. No scalar markets seen.
- **Tokenisation (H):** Polymarket conditional tokens. Bitget exposes `conditionId`, `clobTokenIds` and `positionIds` unchanged, with `version: "v1"` on the sampled market.
- **Catalogue is a filtered subset of Polymarket (M, from the sibling note's count, not re-measured):** zero-volume placeholder markets are hidden and about 5 of Polymarket's top-100 events had no Bitget page. I did not re-measure this.
- **Parser gotchas (H):** (a) Bitget `outcomePrices` are integer-cent strings (`["65","36"]` for a market whose Gamma prices are `["0.645","0.355"]`), so they can sum to 101; (b) the SSR preview carries only 3 markets per event (a 128-market Polymarket event shows 3); (c) CLOB `/book` arrays are sorted worst-to-best, so the LAST element is the best level, and Bitget embeds 3 levels in the same order.

## 3. Chains and collateral

- **Settlement: Polygon (chain 137), collateral pUSD.** Polymarket docs: pUSD "is a standard ERC-20 token on Polygon, backed by USDC", network "Polygon mainnet" (https://docs.polymarket.com/concepts/pusd.md). (H for Polymarket; M that Bitget's flow settles identically, because Bitget does not document it, but the identical conditionIds, token ids and books strongly imply the same CLOB.)
- **Funding (Bitget claim, L for truth):** the launch blog says users can top up via Apple Pay and other payment methods and that "gas abstraction" covers major EVM chains and Solana. The bridge or on-ramp behind it is NOT FOUND (searched: terms, blog, page SSR, Bitget docs sitemap).
- **Account type:** NOT FOUND (searched: terms, blog, SSR payload). Whether the user signs as an EOA, proxy, Safe or Polymarket deposit wallet is undocumented by Bitget.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official Bitget prediction API | **None.** Bitget Wallet docs sitemap (`/com/docs/docs_sitemap_en.xml`) lists only legacy wallet guide pages (lastmod 2023-12-05); the page footer links developer docs at `/en/docs/authentication` (Trading API, Wallet Connect, Pay). Repos `bitget-wallet-ai-lab/{bitget-wallet-skill,bitget-wallet-mcp,bitget-wallet-cli,...}` (last pushes 2026-03 to 2026-05) have no prediction or Polymarket file or README mention (skill repo `docs/` lists address-find, alpha, market-data, rwa, social-wallet, swap, token-analyze, transfer, wallet-signing, x402-payments). | H |
| Public pages | `GET /predictions`, `/predictions/{category}`, `/predictions/event/{slug}` serve SSR HTML with `__NEXT_DATA__` JSON (events, markets, 3-level books, volumes). Public and unauthenticated, but see section 9 on the automation ban. | H |
| Internal backend / WebSocket | The sibling note found POST endpoints on `api-web.bitkeep.fun/prediction-markets/api/` and a `prediction-markets-ws.bitkeep.app` WebSocket in the page bundle. I did not re-inspect or call them (POST is out of bounds; no docs, auth or rate-limit information). | M |
| Rate limits / auth for Bitget | NOT FOUND (searched: terms, ToU, robots.txt, docs sitemap). | H |
| robots.txt | Allows named AI crawlers and disallows only `/*/dapp/browsinghistory`, `/dapp/collect`, `/dapp/searchresults`. It does not override the ToU automation clause. | H |
| **Canonical read path** | Use Polymarket's official APIs, which return the same ids and books: Gamma `https://gamma-api.polymarket.com` (`/events/slug/{slug}`, `/events?order=volume24hr`), CLOB `https://clob.polymarket.com` (`/book?token_id=`), Data API. Docs index: https://docs.polymarket.com/llms.txt. Cloudflare limits (docs `api-reference/rate-limits.md`): Gamma 4,000 req/10 s general, `/events` 500 req/10 s, `/markets` 300 req/10 s; CLOB general 15,000 req/10 s. Throttled, not rejected. | H |

Confirmed response shapes (unauthenticated GETs, fixtures saved):
- Bitget SSR event: `{id, slug, title, endDate, startTime, resolutionSource, volume (string), tag, tagLabel, secondTag, seriesTitle, gameId, deeplink, markets{<group>:[{conditionId, question, outcomes, outcomePrices (cents), clobTokenIds[2], positionIds[2], version, volume, usdcSize, bookInfo{<tokenId>:{bids[3], asks[3], tick_size, min_order_size, neg_risk, last_trade_price}}}]}}`. Fixture `bitget-sports-market-vs-polymarket.json`. (H)
- Polymarket v2 builder leaderboard, `GET https://data-api.polymarket.com/v2/builders/leaderboard?timePeriod=ALL&limit=50`: `{data:[{rank:int, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`. Docs say Data API **v1 retires 2026-10-24** and maps `/v1/builders/*` to `/v2/builders/*` (https://docs.polymarket.com/migrate/data-api-v1-to-v2.md); v1 returns a bare array with camelCase fields and string ranks. Fixture `polymarket-builders-leaderboard-bitget-rows.json`. (H)
- `GET .../v2/builders/volume?timePeriod=WEEK` returns all builders' weekly buckets (`date` = Sunday start, `rank`, `builder_name`, `volume`, `active_users`), 2.4 MB / 7,561 rows; filtered fixture `polymarket-builders-volume-weekly-bitget.json`. (H)

## 5. Trade path

- **Bitget:** orders are placed only inside the Bitget Wallet mobile app. The website is browse-only; its UI string reads "Scan with Bitget Wallet app to place order". There is no documented REST, SDK or signing scheme for third parties. (H)
- **Underneath (M):** Polymarket CLOB orders carrying Bitget's builder code `0x9e6b4ca0e5b559c5a3683b66e0b82df37abff18ee33b2ed25837567f2029825a` (public identifier, shown in the leaderboard fixture). Polymarket docs: the `builder` field is a `bytes32` in the signed order struct (`salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, builder`) (https://docs.polymarket.com/programs/builders/fees.md). (H for the docs, M that Bitget uses exactly this path)
- **Agent path:** to trade these markets, use the Polymarket adapter directly. Reusing Bitget's builder code from third-party software is not offered by Bitget and would route builder fees to Bitget; do not attempt it.

## 6. Reachable through PayBox? **no** (Bitget as a distinct venue)

- A PayBox EVM wallet cannot trade "on Bitget": no Bitget order API, no Bitget contract to propose transactions to, and the flow is mobile-app-only. (H)
- The same markets are reachable only through the Polymarket route: Polygon (137) is in PayBox's chain catalog per `docs/research/06-paybox-platform.md` (M, a sibling note's live `discover_tokens` result, not re-run), `request_wallet_sign` has a `typedData` intent for the EIP-712 orders (M, sibling note), and the pUSD approvals are ordinary EVM transactions. All of that belongs to the Polymarket adapter, not to a Bitget adapter. I called no PayBox tool.

## 7. Fees

- **Bitget's own fee: NOT FOUND** (searched: prediction terms, blog, SSR payload, Polymarket builder docs, docs index). The terms only say users "must pay the fees and charges for the Services as specified from time to time on the Platform" and that third-party markets and networks "may charge fees (including trading fees, spreads, gas fees)". Polymarket says builder profiles and fee rates are "publicly queryable" but I found no documented endpoint that returns a builder's fee rate (searched: builder fees, overview and tiers docs, llms.txt). (H)
- **Polymarket platform fee (H, https://docs.polymarket.com/trading/fees.md):** `fee = C x feeRate x p x (1 - p)`, taker only; rates Crypto 0.07, Sports 0.05, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0; makers pay 0 and receive rebates.
- **Builder fee (H, https://docs.polymarket.com/programs/builders/fees.md):** `builder_fee = notional x bps / 10000`, additive to the platform fee, cap 100 bps taker and 50 bps maker, default 0, one change per 7 days with 3 days' notice.
- **Net (M):** a Bitget user pays at least the direct Polymarket cost plus an unknown builder fee of at most 1% taker, plus any on-ramp cost. Execution is never better than Polymarket direct.

## 8. Resolution mechanism and dispute risk

Entirely Polymarket's. UMA Optimistic Oracle for prediction markets (bond "typically $750 pUSD", 2-hour challenge period, a second dispute escalates to a UMA DVM token-holder vote) and Chainlink TWAP for up/down markets (https://docs.polymarket.com/concepts/resolution.md; the Bitget SSR payload's `resolutionSource` for the BTC 5-minute market is a Chainlink stream URL). (H) Bitget disclaims all of it: it "does not guarantee that any market will resolve as you expect, resolve at all, or resolve on any particular timeline" and is not responsible for manipulation, low liquidity, or "any decision by a Third-Party Market to pause, suspend, modify, or terminate markets". (H, Bitget terms section 4) Extra Bitget-specific risk: Bitget can hide or delist events and can restrict by region (section 9), which can limit exit through its app. Whether positions can also be managed on polymarket.com is NOT FOUND (searched: terms, blog).

## 9. Geo, ToS and automation

- **Bitget prediction terms (H):** the service "is restricted or may be illegal in some jurisdictions, including but not limited to Singapore, China and South Korea" and "is only available to certain users in certain countries/jurisdictions". The page carries the string "not available in your region". Polymarket's own IP-based geoblock (US close-only and many others; see `docs/research/08-venues-polymarket-kalshi.md`) applies on top (M).
- **Bitget Wallet Terms of Use (H, https://web3.bitget.com/resource/newTerms.html, dated 10-Nov-2025):** excluded countries include Crimea/Donetsk/Luhansk, Cuba, North Korea, Iran, Sudan, Syria, Iraq, Libya, Yemen, Afghanistan, Singapore and others; the operator is BGW Technology Limited (Anjouan, Union of Comoros).
- **Automation (H, same ToU):** users must not "use any automated programs, software, engines, web crawlers, web analysis tools, data mining tools or similar tools to access the Bitget Wallet's services, collect or process the content provided by the Bitget Wallet". Do not build the scanner on Bitget pages or its internal API. My own handful of GETs to the public predictions page, terms, sitemaps and robots.txt was verification, not a pattern to copy into production. robots.txt does not grant a ToU exception.
- No bot or VPN clause specific to prediction markets was found beyond the above (NOT FOUND, searched: prediction terms, ToU).

## 10. Liquidity (all builder-attributed Polymarket volume, from Polymarket's Data API, fetched 2026-10-19)

There is no separate TVL or open interest: positions are ordinary Polymarket positions. Whether `volume` counts one or both sides of a trade is not documented (M).

| Window | Volume (USD) | Active users | Tag |
|---|---|---|---|
| All time (since 2026-04-17), rank 27 | 44.88M | 32,357 | H |
| Peak week (bucket starting 2026-06-28) | 6.29M | 16,163 | H |
| Weeks starting 2026-08-02 to 2026-09-27 | 0.48M to 1.14M each | 330 to 448 | H |
| Week starting 2026-10-04 | 1.93M | 336 | H |
| Week starting 2026-10-11 | 1.38M | 361 | H |
| Partial week from 2026-10-18 (about 1.2 days) | 0.32M | 130 | H |
| MONTH window (partial October), rank 27 | 4.01M | 640 | H |

Scale: the top 100 Polymarket events alone showed $25.1M of 24h volume at 2026-10-19 ~04:40Z (Gamma `volume24hr` summed; time-of-day dependent). Bitget's recent daily flow (about $0.2M) is therefore roughly 1% of that or less. Largest events displayed on the page (their volumes are Polymarket's whole-event volume, not Bitget's share): Democratic Presidential Nominee 2028 $1.295B, Republican Presidential Nominee 2028 $713M, Next French Presidential Election $153M, Bitcoin price-hit market $76M, Fed rate cuts 2026 $54.5M. The hint's "$12K to $54.4M" range was a truncated sample of the same page. (H)

## 11. Event coverage (where arbitrage would exist, but only as a Polymarket alias)

Bitget tabs: Sports, Crypto, Finance, Politics, Tech, Climate & Science, Culture (H). The SSR sample covers an EPL match, US politics (2028 nominees, 2026 midterms balance of power), Israel and French elections, a US-Iran ceasefire event, BTC/ETH price-hit and 5m/15m up-down markets, Fed rate cuts and tech/culture/weather categories. Every category overlaps Kalshi, Limitless, Predict.fun and the rest, but each Bitget market is simply Polymarket's market. No macro/economics top-level tab; Fed and rates sit under Finance. (H)

## 12. Shared liquidity

**Shares 100% with Polymarket International.** Same CLOB, same conditional tokens, same UMA/Chainlink resolution. Evidence (H, fixtures):
- 8 top-volume Bitget events: all 24 displayed markets have `conditionId` present in Gamma and `clobTokenIds` identical; event volumes agree to within minutes of drift (for example 74,159,289.85318905 on both sides for the aliens event, 1,295,105,428.66 vs 1,295,105,612.73 for the Democratic nominee event).
- EPL Tottenham v Coventry: 3 of 3 conditionIds and token ids identical, per-market volumes identical (27669.399884 on both), and the best bid 0.35 and best ask 0.36 on the No token match the live CLOB (sizes differ by about 100 shares through book drift between fetches).

Mapping rule for the market-linking layer: Bitget event slug == Polymarket event slug; market identity == `conditionId`. The same relationship holds for other wallet front ends on the builder leaderboard (see `gate-polymarket-integration-gate-app.md`, `metamask-polymarket-integration.md`). It is **NOT an independent arbitrage leg**.

Limit of this check: I could not run a second search for a second provider (search budget exhausted). The page itself contains zero occurrences of Kalshi, Limitless, Predict.fun, Myriad, Opinion, Azuro or Manifold (and 624 of Polymarket), the 9 events I compared (of 79 in the SSR payload) all exist on Polymarket Gamma under the same slug, the 3 featured deep links use a `/polymarket/` path, and the terms say only "for example Polymarket" with "third-party service provider(s)" in the plural. A future second provider is possible but unevidenced. (H for the page checks, M for the conclusion)

## 13. Fixtures (`docs/research/fixtures/bitget-wallet-predictions/`)

| File | What |
|---|---|
| `bitget-sports-market-vs-polymarket.json` | One Bitget market (EPL moneyline) next to Gamma and CLOB: same ids, volume and book; includes parser gotchas |
| `shared-liquidity-sample-8-events.json` | Bitget vs Gamma event volume and id match for the 8 largest Bitget events |
| `bitget-predictions-page-summary.json` | Shape of the SSR payload, category counts, sitemap counts, top events, deeplink pattern, "Powered by" element description |
| `polymarket-builders-leaderboard-bitget-rows.json` | Bitget row (and neighbours) from the v1 leaderboard windows, plus the v2 shape |
| `polymarket-builders-volume-weekly-bitget.json` | Bitget weekly builder volume series (28 rows, 2026-04-12 to 2026-10-18) |

## 14. Recommendation

- **adapter_priority: skip.** Duplicate liquidity, no official API, mobile-only trading, ToU forbids automated access, volume fading.
- Registry entry: `kind: frontend-of`, `upstream: polymarket`, `independent_liquidity: false`, alias rule slug-equal / conditionId-equal. Merge with the existing `bitget-wallet-polymarket-builder` record.
- Optional and low value: Polymarket's public v2 builder endpoints give a weekly retail-attention series (volume and active users) for this builder code. It is a weak signal of mobile retail flow, not worth a dedicated adapter. Use `/v2/` routes: v1 retires 2026-10-24.

## 15. NOT FOUND and open questions

- Bitget's builder fee rate. (searched: Bitget prediction terms, blog, SSR payload, Polymarket builder fees/overview/tiers docs and llms.txt)
- Any official Bitget prediction API, SDK, docs page, WebSocket documentation or rate limit. (searched: web3.bitget.com docs sitemap, page footer links, `bitget-wallet-ai-lab` repos, robots.txt, ToU)
- The account type Bitget creates for the user (EOA, proxy, Safe, deposit wallet) and the bridge behind "instant funding". (searched: terms, blog, SSR payload)
- Whether a second provider has been added after June 2026. (the one search for it ran before the budget ended and returned only Polymarket coverage, nothing dated October 2026)
- The GlobeNewswire release body (HTTP 403 to my fetch), so the April 22 press release is known only from search-result titles.

## 16. Sources

- Bitget predictions page: https://web3.bitget.com/predictions (H, fetched 2026-10-19)
- Bitget prediction terms: https://web3.bitget.com/predictions/terms-and-rules (H, "Updated on [11-Mar-2026]")
- Bitget Wallet Terms of Use: https://web3.bitget.com/resource/newTerms.html (H, dated 10-Nov-2025, L for currency)
- Bitget launch blog: https://web3.bitget.com/en/blog/articles/prediction-markets-polymarket (H/M, summariser fetch)
- Bitget news, World Cup feature: https://www.bitget.com/news/detail/12560605445240 (M, summariser fetch)
- Press release (title only, body unread): https://www.globenewswire.com/news-release/2026/04/22/3278876/0/en/Bitget-Wallet-Launches-AI-Powered-Prediction-Market-Access-Through-Polymarket-Integration.html (M)
- Bitget robots.txt, sitemaps: https://web3.bitget.com/robots.txt, https://web3.bitget.com/com-all-sitemap.xml, https://web3.bitget.com/com/predictions/predictions_event_sitemap_en.xml (H)
- Bitget GitHub: https://github.com/bitget-wallet-ai-lab (H, repo list and skill-repo file tree)
- Polymarket docs: https://docs.polymarket.com/llms.txt, /trading/fees.md, /programs/builders/fees.md, /programs/builders/overview.md, /concepts/pusd.md, /concepts/resolution.md, /api-reference/rate-limits.md, /migrate/data-api-v1-to-v2.md (H)
- Polymarket APIs: https://gamma-api.polymarket.com/events/slug/{slug}, https://clob.polymarket.com/book, https://data-api.polymarket.com/v1|v2/builders/{leaderboard,volume} (H)
- Sibling notes: `docs/research/venues/bitget-wallet-polymarket-builder.md`, `docs/research/06-paybox-platform.md`, `docs/research/08-venues-polymarket-kalshi.md` (M)
