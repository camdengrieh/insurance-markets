# The simExchange (thesimexchange.com): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`), WebFetch, WebSearch. No account was created, nothing was submitted, nothing was signed or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page was read through the WebFetch summariser rather than raw.

## Verdict

**adapter_priority: skip.** This is not a live prediction-market venue in 2026, and even when it was live it was a virtual-money game with no money leg, no API and no event overlap with any other venue.

1. **Virtual currency only.** Players trade "DKP", described by the venue as "entirely fictitious" with "no actual corresponding monetary value", "not convertible or transferrable in any way". [H, https://www.simexchange.com/tos.php, Terms last updated 2007-02-05]
2. **Frozen since 2011.** Page footer: "Copyright © 2006 - 2011 The simExchange, LLC". [H, https://www.simexchange.com/frontpage.php] The newest blog post is "Delistings for September 2011", posted 2011-08-30. [H, https://www.simexchange.com/blog.php] The highest stock id that resolves is 695 (Elder Scrolls V: Skyrim, PS3); ids 698, 700, 720, 750, 760, 800, 1000, 1500, 3000 all return "Title not found". [H, probed 2026-10-19]
3. **Zero activity on the live pages.** Every ticker on the front page shows a 0.00 / 0.0% change and Metascore "Volume: 0"; the Wii stock page shows "Daily Volume 0" on every contract. The newest futures listed are US monthly sales for Sept 2010 (window 2010-08-29 to 2010-10-02). [H, front page and stock.php?id=12] The Wikipedia article says both futures types were deactivated in September 2010 and only GLS stock trading remained. [H, https://en.wikipedia.org/wiki/The_simExchange, fetch-summarised]
4. **Backend looks broken.** Pages print the literal PHP error text `Unable to retrieve yesterday\'s rank`; the Help page `Help/Get_Started` returns HTTP 500; "Latest Video Game News" is empty. [H, 2026-10-19]
5. **The branded domain is down.** `thesimexchange.com`, `www.thesimexchange.com` (http and https), `/robots.txt` and `/index.php` all return `HTTP 403` with a 52-byte body "403 - Forbidden | Access to this page is forbidden." served via Cloudflare, with the same ETag on every path. [H, curl 2026-10-19; see Caveats]
6. **Founder's own site treats it as past.** `www.simexchange.com/` returns a 301 to `http://shiaustreet.com/`, a private-equity/venture page whose bio says "He was the founder of SimExchange and a pioneer in prediction markets." [H, curl and WebFetch 2026-10-19; page Last-Modified 2025-06-26]
7. **No official API, ever.** NOT FOUND (searched: homepage links, `data.php`, `api.php`, `rss.php`, `feed.xml`, `sitemap.xml` all 404; no developer or API link in nav or footer; Wikipedia; web search). The only machine-ish surface is server-rendered HTML.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| `www.thesimexchange.com` (canonical brand domain; the ToS says "The thesimexchange.com website") | HTTP 403 for every path tried | H, `fixtures/the-simexchange/thesimexchange-root-403.txt` |
| `www.simexchange.com` (older domain, same codebase) | `/` 301 to founder's PE site; but legacy PHP pages (`frontpage.php`, `stock.php?id=N`, `blog.php`, `tos.php`, `new_account.php`) still serve HTTP 200 from an Apache host | H, `fixtures/the-simexchange/simexchange-root-redirects.txt`, `simexchange-frontpage.html` |
| Market data | Frozen 2010/2011 snapshot; no price moves, no volume, no new listings | H, see Verdict 2 and 3 |
| Account signup form | The form renders (`new_account.php` HTTP 200). Whether registration or login works was NOT tested (would be creating an account). | H for rendering; unknown for function |
| Forum | Thread list shows "Last Post" dates up to 2023-04-13 on old 2011 blog threads, plus titles such as "Article: Good MOrning Quotes" (2020-11-17) and "Article: Guide tactique Teamfight" (2019-07-26) on game-stock pages. Reads as comment spam on an abandoned board, not trading discussion. | H, `fixtures/the-simexchange/simexchange-forum-recent-threads.txt`; interpretation M |
| Wikipedia | Infobox says "Online"; text says the site "still has players" yet users called it "a ghost town" and data is "unlikely to remain influential". | H (fetch-summarised), https://en.wikipedia.org/wiki/The_simExchange. Stale versus the venue's own pages. |
| Domain registration | `thesimexchange.com` created 2019-11-18, expires 2027-11-18 (Namecheap); `simexchange.com` created 2009-09-05, expires 2027-09-05, updated 2026-09-06. | H (whois). Registration alone is not liveness. |

Conclusion: the web server is up (L-M: someone renews the domains and keeps an Apache host running), but the venue is functionally dead. Treat as `still_live: false`. Anything older than 6 months is stale; everything market-related here is 15 years stale.

## 2. Kind and market model

- **kind: forecasting-nonmoney** (virtual-currency game, explicitly not gambling). [H, ToS]
- **Market model (historic, from the venue's own About page):** each tradable is a "stock" whose price is a point forecast, quoted in DKP. "if the PS3's stock is at 5,000 DKP, this corresponds to a forecast of 50 million units sold globally over the PS3's lifetime"; users can buy up to their estimate and "short sell" down to it. [H, https://www.simexchange.com/about.php] That is a **scalar** market, not binary or categorical.
  - Global Lifetime Sales (GLS) stocks: 1 DKP = 10,000 copies, no expiry. [H (fetch-summarised) Wikipedia]
  - NPD monthly sales futures (launched 2007) and Metacritic Metascore futures (launched 2007-09; price 90.00 DKP = predicted Metascore 90) existed; both were deactivated in 2010. [H (fetch-summarised) Wikipedia; Metacritic futures page still renders as an empty template]
  - Mechanism: order-book-style matching (the robots.txt disallows `/engine_trading/`, `/engine_futures/`, `/editOrder/`). The exact matching rules and the "Game Rules" page were NOT readable (Help page 500). [M]
- **Tokenisation:** none. Off-chain database rows keyed by `stock.php?id=N` (ids 10 to 695 seen).

## 3. Chains and collateral

None. DKP is an in-site virtual balance, not a token on any chain. [H, ToS] No EVM, Solana or other chain integration was found (searched: site, ToS, Wikipedia, web search).

## 4. Read API

- **exists: none.** NOT FOUND (searched: nav and footer links, `/api.php`, `/data.php`, `/rss.php`, `/feed.xml`, `/sitemap.xml`, site search, Wikipedia, web search for "simExchange API"). The Blog page mentions "Add the Blog Feed" but the feed was not located or read.
- The only readable surface is HTML: `https://www.simexchange.com/stock.php?id=N` (one stock per page, includes forecast value, daily volume, total volume), `frontpage.php` (hardware forecasts and a top-stocks box), `blog.php`, `futures-metacritic.php`. All responses carry `Cache-Control: no-store` and a `PHPSESSID` cookie; no auth needed to GET. [H]
- **Rate limits / websocket:** NOT FOUND. No documented limits and nothing real-time (data is static anyway).
- **Fixtures saved** (all unauthenticated GET, 2026-10-19): `docs/research/fixtures/the-simexchange/`
  - `simexchange-frontpage.html` (13.9 KB), `simexchange-stock-id12-wii.html` (15.3 KB), `simexchange-robots.txt`, `simexchange-forum-recent-threads.txt`, `simexchange-blog-top-post-header.txt`, `shiaustreet-home-excerpt.txt`, `thesimexchange-root-403.txt`, `simexchange-root-redirects.txt`.
  - These are HTML or text, not JSON; the point of keeping them is evidence of the frozen state, not a schema to code against.

## 5. Trade path

**none.** No API, no signing scheme, no wallet. Orders could only be placed by a logged-in human through the website UI, in virtual currency. Not reachable through PayBox: **paybox_reachable = no** (no chain, no collateral token, no payment rail, no signed-order or transaction-proposal interface). [H/M]

## 6. Fees

NOT FOUND (searched: ToS, About, front page; the Help section returns 500). The ToS says the site "is provided free of charge to Qualified Users". [H] Virtual-currency commission rules, if any, are undocumented.

## 7. Resolution and dispute risk

- GLS stocks have no expiry, so there is no resolution event. Delisting cashes shares out "at the last traded price" (blog "Delistings for September 2011"). [H, https://www.simexchange.com/blog.php]
- Futures settled against NPD monthly unit data and Metacritic scores; discontinued after NPD stopped publicly releasing unit sales (October 2010 announcement). [H (fetch-summarised) Wikipedia]
- Dispute risk is moot; there is no real money and no oracle.

## 8. Geo, ToS and automation

- ToS: "an online game ... for your entertainment"; "any actual betting, wagering or gambling based on the information provided on the Website ... is strictly prohibited." [H, tos.php]
- Eligibility: age 13+, one account per person, real name, birthday and email required at registration. [H, tos.php]
- Automation: no explicit anti-bot clause found; clause xv prohibits harvesting or storing "information about the users of this Website or the Content posted by others". User content or per-user data should not be scraped. [H, tos.php clause xv] `robots.txt` (on simexchange.com) disallows `/charts/`, `/engine_trading/`, `/engine_futures/`, `/editOrder/`, `/research/`, `/news/`, `/comment/`, `/friends/`, `/voting/`, `/wiki/` and lists a sitemap at `thesimexchange.com/sitemap.php` (which is behind the 403). [H, `simexchange-robots.txt`]
- Geo: no geo-block observed on simexchange.com; thesimexchange.com 403 is uniform across paths and not shown to be geo-based (see Caveats).

## 9. Liquidity

- Current: effectively zero. Daily volume 0 on every contract seen; zero price change everywhere. [H, 2026-10-19 page fetches; the pages are a 2010/2011 snapshot]
- Historical order of magnitude only: the Wii page shows lifetime "Total Volume" of 190,354 for the GLS stock and 369,117 / 170,619 / 170,184 for the Sept / Aug / July 2010 US monthly futures (mapping of numbers to contracts inferred from page layout); units unlabelled on the page (presumably DKP or shares). [H for the numbers, L for the mapping and units; stock.php?id=12]
- A 2010-era advertiser page claimed ">350,000 page views per month from over 30,000 unique visitors". Not verified, and from the site's peak. [L, search snippet of `thesimexchange.com/advertise.php`, not re-fetched]
- No TVL or OI concept (no money).

## 10. Event overlap (arbitrage relevance)

None. Video game unit sales and Metacritic scores in 2006 to 2010. No sports, politics, crypto or macro. No overlap with XO, Polymarket, Kalshi or any other covered venue, and no live prices to compare. At most it is a historical dataset of crowd forecasts for game sales through 2011.

## 11. Shared liquidity

None. It is a standalone, closed virtual-money game; it neither shares nor feeds liquidity from any other venue.

## 12. Suspicious content / injected instructions

None found in the pages read. Forum thread titles such as "Article: Good MOrning Quotes" and "Article: Guide tactique Teamfight" look like spam comments on an abandoned board; no instructions to AI agents were found (pages were grep-scanned for agent-directed phrases).

## 13. Caveats and open questions

- The 403 on `thesimexchange.com` was observed with the generic `insurance-markets-research/0.1` User-Agent only. A browser User-Agent was not tried (deliberately no spoofing), so it is possible that the block is UA-based. The `simexchange.com` host serving the same codebase shows the data is frozen regardless.
- The front-page data is served from a live Apache/PHP box, so an old database could still back it. Whether orders can still be placed after login was NOT tested (would require an account).
- Whether the site ever had a user-facing CSV or data export ("data" nav tab) is unknown; the tab link was not resolved to a page.

## Revisit trigger

Cheap check: `GET https://www.simexchange.com/frontpage.php` and look for non-zero "Today's change", a copyright line later than 2011, or `stock.php?id=700` resolving to a real title. None expected. Not worth scheduling.

## Sources

- [H] https://www.simexchange.com/frontpage.php (front page; copyright "2006 - 2011"; all changes 0.00%)
- [H] https://www.simexchange.com/stock.php?id=12 (Wii; daily volume 0; Sept 2010 futures window)
- [H] https://www.simexchange.com/about.php (market model, DKP, forecasts-as-prices)
- [H] https://www.simexchange.com/tos.php (Terms last updated 2007-02-05: virtual currency, no gambling, clause xv)
- [H] https://www.simexchange.com/blog.php (latest post 2011-08-30; delisting mechanics)
- [H] https://www.simexchange.com/community-threadview.php (forum, last-post dates 2019-2023, spam-like titles)
- [H] https://www.simexchange.com/robots.txt
- [H] http://www.thesimexchange.com/ and /robots.txt (HTTP 403, 2026-10-19)
- [H] http://shiaustreet.com/ (founder PE site; "He was the founder of SimExchange")
- [H, fetch-summarised] https://en.wikipedia.org/wiki/The_simExchange
- [H] whois for thesimexchange.com and simexchange.com (registration dates, 2026-10-19)
- [M] https://archive.org/wayback/available?url=simexchange.com/frontpage.php (no capture after 2019 returned for the nearest-2020 query; weak evidence of a static page)
- Web search (extended), 2026-10-19: no 2026 news, closure or acquisition notice found. NOT FOUND (searched: "simExchange" with shut down, dormant, acquired, 2026; "simExchange API").
