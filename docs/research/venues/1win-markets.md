# 1win Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, public unauthenticated GETs (1win.com HTML shell, robots.txt, sitemap.xml, one static JS bundle; Polymarket Gamma/Data public endpoints for a cross-check), `gh api` repository search. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The internal 1win `/api/...` endpoints (visible only as preload hints in the page head) were deliberately NOT probed: they are undocumented. Third-party pages were treated as untrusted data; nothing in them was followed. The CoinGape "Visit 1win" link is an affiliate redirect and was not followed; the press-release links carry a `?p=...` affiliate parameter, which was stripped from every URL I requested.

Research limit: the shared WebSearch budget was exhausted after the first search, so discovery relies on that one search, WebFetch of the articles it returned, and first-party probing of 1win.com. Nothing below comes from a second search pass.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/1win-markets/` (section 12). There is no public data API, so there are no market-data fixtures.

---

## 0. Bottom line

1. **Live, yes (H).** `https://1win.com/betting/markets` returns HTTP 200 with title "1win Prediction Markets: Sports, Crypto & More" (build `0.4383.0` dated 16/10/2026, three days before this probe). Company-sourced press releases of 15 and 17 July 2026 describe expansions (a World Cup 2026 category, then four crypto markets).
2. **It is a section of a casino and sportsbook operator, not an exchange (H for the host, M for the rest).** 1win's own JSON-LD calls the site "1win Online Casino" / "1win Casino & Sports Betting". Markets is a Yes/No product inside that custodial account system. CoinGape (M) says: centralized, custodial, fixed-odds, no public order book, no on-chain verification.
3. **No API, no on-chain footprint, no documentation found.** The page is a client-rendered Vue shell; the HTML contains zero market data. No developer docs, no GitHub org, no subgraph, no contract. The only GitHub hits for "1win" are third-party scraping repos (not read, untrusted).
4. **Cannot be traded by a wallet.** Positions live in a custodial 1win account; deposit through a hosted payment widget. No signed-order or transaction-proposal path exists.
5. **Possible duplicate liquidity or a copied question set.** Three of the four launch-announcement crypto questions have near-identical titles to live Polymarket events (section 8). I could not determine whether 1win mirrors Polymarket prices or just copies the question templates. Treat as non-independent until proven otherwise.
6. **adapter_priority = skip.** No machine-readable access, custodial/casino ToS context, unknown settlement, and a likely overlap with an already-covered venue. Revisit only if 1win publishes an API or a Polymarket-builder style integration is confirmed.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://1win.com/betting/markets` | 307 -> `/th/betting/markets` (geo-locale redirect by Cloudflare) -> 200, 96 KB HTML. `<title>` "1win Prediction Markets: Sports, Crypto & More"; meta description "Predict politics, sports, crypto, tech and culture events with 1win Markets. Follow live prices, market moves and event outcomes." | H |
| Frontend build | `window.buildConfig`: branch `0.4383.0`, time `16/10/2026, 16:39:11`, env `production` | H |
| Page region policy | `INITIAL_DATA.regionalAccessPolicy` = `{"name":"open"}` for the region the request came from (Thailand). Which countries are *not* open is NOT FOUND (only the single region's policy is embedded in the page). | H (for TH) |
| Launch-announcement press (July 2026) | World Cup 2026 category (CoinGape press-release, dated 15 Jul, updated 17 Jul, **explicitly paid / sponsored content**); four crypto markets (iGaming.News, Yogonet, NEXT.io, GamblingNews, all 17 Jul 2026, same company text) | M (company-sourced) |
| When did Markets launch? | NOT FOUND (all four 17-Jul articles say "has added/expanded"; none dates the original launch) | - |
| Last-update age | Everything primary is < 6 months old. No stale (> 6 month) sources used. | - |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind: custodial centralized "prediction markets" section of an online casino/sportsbook** (H for hosting context; M for the rest). Evidence for the hosting context: sitemap.xml has 138 URLs, all casino/sportsbook/bonus pages and `/rules`; none is a markets or prediction URL (H). JSON-LD `@graph` = Organization + "1win Online Casino" EntertainmentBusiness + WebSite "1win Casino & Sports Betting" (H).
- **Market model: Yes/No or "a small set of clearly defined outcomes"** (M, press release text: "answer yes-or-no questions or pick from clearly defined outcomes"). Categories named: sports, politics, technology, entertainment/culture, global events, crypto, FIFA World Cup 2026 (M).
- **Pricing mechanism: NOT FOUND.** The page says "live prices, market moves" (H, meta description), which implies a price per outcome, but the sources do not say order book vs AMM vs fixed price. CoinGape (M) says "Centralized bookmaker odds" and "Does not provide a publicly visible order book or peer-to-peer trading". So: house-priced, custodial, no tokenised outcomes (M).
- **Outcome tokenisation: none that is public.** CoinGape (M): "Users cannot independently verify positions and settlement through an on-chain smart contract."
- **Event URL pattern (H, from the iGaming.News links):** `https://1win.com/betting/markets/event/<slug>-<numeric id>`, e.g. `what-price-will-xrp-hit-in-2026-36791859`. Ids are 8-digit 1win-internal ids (not Polymarket ids: `GET gamma-api.polymarket.com/events/36792741` -> "id not found"). A category page exists at `/betting/markets/world-cup-2048`. Fetching an event URL with WebFetch returned only the generic casino banner (the app is client-rendered), so no per-market price, rule or end date was readable.

---

## 3. Chains and collateral

- **Chain: none** (M, CoinGape: "No native chain, but supports multi-network crypto payments").
- **Collateral/funding (M, CoinGape, not verified on 1win):** "BTC, ETH, Litecoin, USDT, BNB, plus 20+ fiat currencies via cards, e-wallets and local payment rails"; minimum deposit "typically between $5 and $10", varies by region.
- **What the page loads (H):** an import map with `paywidget` (v1.95.0) and `playchat` (v6.6.7) micro-frontend modules; deposits are mediated by that hosted widget, not by a published contract address.
- Settlement currency of Markets positions specifically: NOT FOUND (searched: all four July articles, CoinGape, 1win rules page via WebFetch = title only).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **NONE FOUND.** No developer docs link in sitemap, robots.txt, JSON-LD or HTML. | H (absence in those files) |
| Official authenticated API | NOT FOUND (searched: site, sitemap, GitHub repo search for `1win api`, `1win markets prediction`) | M |
| On-chain / subgraph | None (custodial) | M |
| Internal web API | The SPA preloads `/api/web/v1/user`, an SDUI template config under `/api/web/v2/sdui/templates/...` and `/api/USER-SERVICE-API/api-v3-oauth-config` (H, from `<link rel=preload>` and the inline script). Undocumented, session-oriented, **not probed**; unusable as a supported integration. | H (existence only) |
| WebSocket | NOT FOUND | - |
| Unofficial | Third-party GitHub scraping repos for 1win exist (`gh api search/repositories`); they target the sportsbook, were not read, and are untrusted. | M |
| robots.txt | Only `Disallow: /*?trid=` and `/*&trid=`; sitemap listed. Does not mention the markets section or any API (fixture `robots.txt`). | H |

Aggregator consequence: there is no supported way to read prices, books, trades or resolutions. Scraping an undocumented SPA behind Cloudflare, with a service worker and a server-driven UI layer, is not an acceptable adapter foundation.

---

## 5. Trade path

**None for a program.** Trading requires a 1win account session in the web/app UI (login, likely KYC; NOT FOUND whether Markets has its own KYC tier). There is no order-signing scheme, no API key scheme and no transaction proposal flow. (H for absence in the public surface; M for the account requirement.)

PayBox reachability: **no.** A PayBox EVM wallet could at most `request_transfer` to a custodial deposit address *after a human creates and verifies an account*, which is outside this research's rules and gives no programmatic order path. No chain-level interface exists to sign against (Base/Ethereum/BNB/Arbitrum/Polygon/Solana: not applicable).

---

## 6. Fees

- **"Not publicly disclosed"** (M, CoinGape ranking table and review). No fee schedule found on 1win.com (page is an empty shell to fetchers). Because pricing is house-set (M), the implicit fee is the bookmaker margin in the quoted prices; the size of that margin is NOT FOUND. A Yes + No sum above 100% would reveal it, but I could not read prices.
- Deposit/withdrawal fees: NOT FOUND.

---

## 7. Resolution mechanism and dispute risk

- **Mechanism: NOT FOUND** (searched: four July 2026 news items, CoinGape, `/rules` via WebFetch = title only, `/betting/markets` shell). No UMA/Chainlink/oracle is named anywhere. CoinGape (M): settlement cannot be verified on-chain.
- **Dispute risk: high by construction (M).** A custodial operator that sets prices and settles on its own judgement, under a Curacao-style licence with no public escalation path (see 9), gives the user no on-chain recourse. Void/cancel rules for "Yes/No" crypto-price questions: NOT FOUND.

---

## 8. Event coverage and overlap (where arbitrage could exist)

| Category | 1win Markets | Overlap venues | Tag |
|---|---|---|---|
| Crypto price / relative market cap | HYPE end-2026 price, "HYPE flip SOL by 31 Dec 2026", XRP 2026 price, DOGE end-2026 price | Polymarket (see below), Kalshi, Limitless etc. | M |
| Sports (incl. FIFA World Cup 2026) | yes (custom tournament scenarios) | Polymarket, Kalshi, sportsbooks and Azuro-style books | M |
| Politics | yes (named, no examples) | Polymarket, Kalshi, PredictIt | M |
| Tech / entertainment / global events | yes (named) | Polymarket | M |
| Macro | not named | - | - |

**Overlap with Polymarket (public Gamma search, 2026-10-19, H for the Polymarket side; the match is an M-level inference):**

- Polymarket "What price will XRP hit in 2026?" (id 89530, ends 2027-01-01, volume about $0.48M)
- Polymarket "What price will Dogecoin hit in 2026?" (id 89554)
- Polymarket "Will HYPE flip SOL by December 31?" (id 428484, ends 2027-01-01, volume about $0.27M)
- A Polymarket "What price will HYPE hit in 2026?" event was not returned by the search I ran.

The 1win slugs `what-price-will-xrp-hit-in-2026`, `what-price-will-dogecoin-hit-in-2026` and `will-hype-flip-sol-by-december-31-2026` follow the same wording. Direct slug lookups of the 1win slugs on Polymarket returned `[]`. The Polymarket Data API builder leaderboard (top 50, ALL and MONTH windows) contains no 1win-like builder name (H, but the list is truncated at 50, so absence is only weak evidence).

**Liquidity independence: UNKNOWN, and the safe assumption is "not independent".** Either 1win copies Polymarket's question templates (then 1win's quote is a house price on a market with a public reference price, i.e. a potential edge *signal*, but unreachable), or it syndicates Polymarket liquidity (then it is not an independent leg). Either way the scanner cannot act on it.

---

## 9. Geo, ToS, automation

- **Blocked jurisdictions (M, CoinGape only):** US, UK, France, Germany. Not confirmed on 1win's own pages.
- **Licence:** CoinGape (M) is internally inconsistent on its face: the review text says "Curacao license" while the table says "CGA online-gaming licence". Inference (M): these are probably the same thing, since CGA is the Curacao Gaming Authority, so the "inconsistency" may be only wording. Neither 1win's own page nor the licence number was read (L for the operator entity; NOT FOUND). Yogonet's page only has a "Curacao" tag (not a statement).
- **Region gate (H):** page-level `regionalAccessPolicy` exists and was "open" for the probing region.
- **Automation / bot / API rules: NOT FOUND.** `https://1win.com/rules` returned only the title "1win Online Casino & Sports Betting" to the fetcher. Casino-sportsbook terms commonly forbid automated play and multi-accounting, but I could not read 1win's text, so I do not claim it.
- **Compliance flags for an aggregator:** operator is a gambling business serving users in jurisdictions that exclude the US/UK/FR/DE (M); using PayBox funds there would need a human-owned, verified account. Not appropriate for an autonomous agent.

---

## 10. Liquidity

- Volume / open interest / TVL / user counts: **NOT FOUND** (searched: all four July 2026 articles (none give any figure), CoinGape ("Fees: Not publicly disclosed"; no volume), DefiLlama `/protocols` list (no 1win entry, H, 2026-10-19), 1win page shell).
- Liquidity depth: unknowable without UI/API access. Custodial house-priced limits are typical for bookmaker-style products (M, inference; not evidence).
- Operator scale (context only): 1win claims "11,000+" casino games in its JSON-LD (H, marketing copy), which says nothing about Markets volume.

---

## 11. Adapter recommendation

- **adapter_priority: skip.** Reasons: (1) no official API, docs, subgraph or contract; (2) custodial, casino-hosted, house-priced; (3) wallet-unreachable (no signed-order or tx-proposal path); (4) settlement mechanism undisclosed; (5) probable overlap with Polymarket questions, independence unproven; (6) no volume data to size it.
- Revisit triggers: 1win publishes a documented API or an on-chain/builder integration; or a human-run, ToS-compliant account is deliberately created and the markets page JSON is observed under written permission; or Polymarket-builder style syndication is confirmed (would still be non-independent).
- If anyone wants a signal-only feed later: the Polymarket reference prices for the same questions are already reachable from the Polymarket adapter, so 1win adds no information.

---

## 12. Fixtures

In `docs/research/fixtures/1win-markets/`:

- `markets-page-shell.json` - sanitised summary of the 2026-10-19 GET (title, meta, region policy, build stamp, import-map module names). Client IP, trace id and cookies dropped on purpose.
- `polymarket-title-overlap.json` - the Polymarket events whose titles match the 1win launch-press crypto questions, plus the failed direct-slug lookups.
- `robots.txt` - 1win robots.txt (90 bytes).

No market-data fixtures, because no documented public data API exists.

---

## 13. Suspicious content

- None containing instructions aimed at an AI. The CoinGape "Visit 1win" link (`coingape.com/visit/ext/1win-prediction/`) is an affiliate redirect; the 1win URLs in press releases contain a `?p=` affiliate parameter. Both were avoided or stripped.
- The CoinGape World Cup article is labelled sponsored content under a paid partnership, and the crypto-markets release is the same company text syndicated across five outlets. Treat their claims as marketing.
- A GitHub repo titled as a "1win domain key exposure" appeared in the search; it was not opened (credential-exposure content, untrusted).

---

## 14. Not found / open questions

- Pricing mechanism (order book, AMM, house price), fee/margin, settlement currency, resolution source, void rules.
- Whether Markets uses Polymarket (or any third-party) liquidity or only copies question templates.
- Operator legal entity and licence number; full list of blocked countries; any bot/API prohibition text.
- Volume, user count, number of open markets.
- When Markets launched.

---

## Sources

- https://1win.com/betting/markets (-> /th/betting/markets), fetched 2026-10-19 - title, meta description, build stamp, region policy, import map, JSON-LD. H
- https://1win.com/robots.txt and https://1win.com/sitemap.xml, fetched 2026-10-19 (138 URLs; no markets or API URLs). H
- https://1win.com/rules via WebFetch (title only), https://1win.com/en/betting/markets via WebFetch (title only). H (that nothing was readable)
- https://igaming.news/news/2026-07-17/1win-expands-its-prediction-markets-with-crypto-forecasts (links to four event URLs; Yes/No format; categories). M
- https://www.yogonet.com/international/news/2026/07/17/125446-1win-introduces-cryptofocused-prediction-markets-covering-four-major-tokens ; https://www.gamblingnews.com/news/1win-expands-its-prediction-markets-with-crypto-forecasts/ ; https://next.io/news/b2b-news/1win-expands-its-prediction-markets-with-crypto-forecasts/ (same release; no partner, licence, settlement or volume stated). M
- https://coingape.com/press-releases/1win-launches-dedicated-fifa-world-cup-2026-prediction-markets/ (sponsored; World Cup category; Yes/No scenarios). M
- https://coingape.com/best-crypto-prediction-markets/ (centralized/custodial, fixed odds, blocked in US/UK/FR/DE, Curacao vs CGA, fees not disclosed, payments list). M, page-summary
- https://gamma-api.polymarket.com/public-search?q=... and /events/36792741 , https://data-api.polymarket.com/v1/builders/leaderboard (Polymarket cross-check, 2026-10-19). H for Polymarket facts
- https://api.llama.fi/protocols (no 1win entry), `gh api search/repositories` queries `1win markets prediction` and `1win api` (no official repo). H
