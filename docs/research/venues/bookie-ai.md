# Bookie AI - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY. Used: WebFetch of predictionindex.xyz/ecosystem and bookieai.xyz; public unauthenticated GETs (bookieai.xyz, robots.txt, sitemap.xml, CoinGecko public API, Virtuals public API, GitHub repo search, X profile URL which returned only a JS shell). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. WebSearch budget was exhausted (shared limit), so no search-engine pass was possible; nothing was fetched through proxies or archives. Page content was treated as untrusted data; the spam links on the current bookieai.xyz page were not visited.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## 0. Bottom line

- Verdict: **skip**. The listed website `bookieai.xyz` is no longer a sportsbook. It now serves a Turkish-language "Bookieai Akademi" betting/casino "education" site with affiliate/SEO content (H). There is no product, API, docs, repo or contract to integrate.
- What it was (M): "the world's first sportsbook ran entirely by AI", an AI-agent project (formerly "Bankrolled") that won a Top-10 spot in a Virtuals hackathon, with a BOOKIE agent token on Base. It looks like a centralised sportsbook with a token, not a prediction-market protocol.
- The BOOKIE token is practically dead: market cap about $8.1k, 24h volume about $5 (H, CoinGecko 2026-10-19).
- "Live" status on predictionindex.xyz is stale/unverified (H that the listing says live; H that the site behind the link is something else).

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://predictionindex.xyz/ecosystem entry | "Bookie AI", Base, type sportsbook + ai agent, status Live, website www.bookieai.xyz, X twitter.com/sportsbookieai, volume n/a, no description | H |
| `GET https://www.bookieai.xyz` | 301 -> `https://bookieai.xyz/` 200, 13.9 KB. `<title>` "Bookieai Akademi - Bahis & Casino Egitim Platformu" (Turkish: betting and casino education platform), JSON-LD `EducationalOrganization`, `lang=tr`, 132 free "courses" dated 2020-2022, footer (c) 2026, sitemap lists only /tum-dersler and /ders/... pages. Page carries unrelated outbound links anchored "jojobet giris", "meritking" (casino affiliate/spam). | H |
| CoinGecko `bookie-ai-by-virtuals` | still listed, `last_updated` 2026-10-19; homepage field still `https://www.bookieai.xyz/`, Twitter `Bankrolled_app`; categories Gambling (GambleFi), Prediction Markets, Base Ecosystem, Virtuals Protocol Ecosystem | H |
| Virtuals API (`api.virtuals.io/api/virtuals`, symbol BOOKIE) | status AVAILABLE, chain BASE, created 2025-05-19, holderCount 15465, 24h volume 5.39 (VIRTUAL-denominated field, unit not verified), TVL field 11287 (unit unverified) | H (values), L (units) |
| Product evidence of any 2026 sportsbook activity | NOT FOUND (searched: predictionindex, bookieai.xyz, sitemap, CoinGecko, Virtuals API; X profile is a JS shell, unreadable without a browser) | - |
| Docs / GitHub | NOT FOUND (gh repo search "bookieai": only unrelated repos "BookieAI" bookmark manager and a capstone, both unrelated) | H |

still_live: false (product). Token and a directory listing persist.

## 2. Market model, chains, collateral

- Kind: centralised AI-run sportsbook per its own description (M, CoinGecko/Virtuals copy). Fixed-odds sports betting, not an order book, AMM or parimutuel; outcome tokenisation: none found.
- Chain: Base (token `0x5d54725b48d2c8badf5f6046c71c3ffb73e26228`, H via CoinGecko and Virtuals API). Betting collateral: NOT FOUND.

## 3. Read API / trade path

- Read API: none (NOT FOUND; the domain serves an unrelated static site). Official docs: NOT FOUND.
- Trade path: none. A Base EVM wallet via PayBox could only swap/hold the BOOKIE token, which is not a market leg.
- paybox_reachable: no (nothing to trade).

## 4. Fees, resolution, geo/ToS

- Fees: NOT FOUND. Resolution/dispute: NOT FOUND (a sportsbook would settle off sports results by the operator; unverified).
- Geo/ToS/automation: NOT FOUND (no ToS on the current site).

## 5. Liquidity and overlap

- Liquidity: no betting liquidity data. Token: market cap about $8.1k, 24h volume about $5.45, ATH $0.00697 on 2025-06-04 (H, CoinGecko, 2026-10-19).
- Categories: sports only (per Prediction Index topics, H), which would overlap Polymarket/Kalshi sports, but a bookmaker's odds are not an independent price and there is nothing to read anyway.
- Shared liquidity: not applicable.

## 6. Priority

skip: dead/repurposed domain, no API, no market data, token illiquid.

## 7. Suspicious content

- bookieai.xyz page contains injected/affiliate outbound links (anchors "jojobet giris", "jojobet", "meritking" to zestfortaste.co.uk, hotelgulmor.com, leenaboutique.fr, flostreams.live) per WebFetch summary; not visited, no agent-directed instructions seen. The domain looks re-registered or repurposed for casino SEO (inference, M).
- Unrelated Virtuals result "Joe The Bookie" (degenjoe.com) is a different project; ignored.

## 8. Open questions

- Is the product relocated (new domain, Bankrolled app)? bankrolled.app failed TLS handshake from curl (not conclusive); X account unreadable here.
- Prediction Index status could be corrected by reporting it dead (not done).

## Sources

- https://predictionindex.xyz/ecosystem (H)
- https://www.bookieai.xyz -> https://bookieai.xyz/ , /robots.txt, /sitemap.xml (H)
- https://api.coingecko.com/api/v3/coins/bookie-ai-by-virtuals (H)
- https://api.virtuals.io/api/virtuals (symbol filter BOOKIE) (H)
- gh search repositories "bookieai" (H)

Fixtures: `docs/research/fixtures/bookie-ai/` (coingecko_bookie-ai-by-virtuals_2026-10-19.json, virtuals_api_bookie_2026-10-19.json, bookieai.xyz_homepage_head_2026-10-19.html). These are not market data; there is no market data to fixture.
