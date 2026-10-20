# Hollywood Stock Exchange (HSX) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 03:55-04:05 UTC). READ-ONLY: public unauthenticated GETs of hsx.com pages (robots.txt, home, FAQ, glossary, Terms, About/History/Press/Contact, list pages, security detail pages, one chart-data CSV), WebFetch/WebSearch of public pages, public unauthenticated GETs to the Polymarket Gamma and Kalshi public APIs (cross-check only) and a GitHub repository search. No account, login, wallet, key, signature, trade URL, POST/PUT/DELETE, PayBox tool or browser automation was used. Generic User-Agent `insurance-markets-research/0.1` only. Third-party pages were treated as untrusted data; nothing in them was followed.

Limits of this research (read first):
- **The shared web-search budget ran out after the first search**, so ownership and legal history rely on the HSX site itself, one Wikipedia read, and the single search result set (Crunchbase/Tracxn snippets). Anything about Cantor Fitzgerald ownership or the 2010 box-office-futures ban is M/L, not first-hand.
- HSX has **no API and no developer docs**; everything below about data access is an HTML scrape of public pages plus one undocumented CSV endpoint that the public pages themselves call.
- The price-formation formula ("Virtual Specialist") is patented and not published. NOT FOUND.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/hollywood-stock-exchange-hsx/` (section 13).

---

## 0. Bottom line

1. **Live, but it is a free-to-play game, not a market you can trade for value.** The site is serving current data (IPO of "Wet" on 2026-10-16, blog posts to 2026-10-18, weekend box office table for 2026-10-09, daily price CSV through 2026-10-17). Currency is "Hollywood Dollars" (H$), "entirely fictitious and ha[ve] no actual corresponding dollar amount"; real-money betting on its information is "strictly prohibited" by its Terms (H). There is nothing to deposit, nothing to withdraw, no chain, no token.
2. **No API.** Prices are available only as HTML tables (`/security/list.php`, `/security/view/{SYMBOL}`) plus an undocumented per-security CSV of daily closes (`/chart/detail_chart_data.php?id=N`). No order book, no bid/ask, no trade tape, no websocket (H for what the pages show; NOT FOUND for any API/docs).
3. **Not tradable from PayBox, and not an arbitrage leg.** Trading needs an HSX username/password session on the website (login page is behind `/login/`, disallowed in robots.txt). Terms ban "computer program-assisted trading". Payoffs are in H$ so nothing real can be locked in (H).
4. **The only possible value is as a read-only crowd forecast for US box office** (and, in season, award nominations): HSX opening-weekend derivatives are quoted in H$ = USD millions, and Polymarket lists opening-weekend box-office bracket markets for the same films (Street Fighter, Whalefall, Wildwood, Sense and Sensibility were all in both on 2026-10-19; H). Those Polymarket markets are thin ($0.1k-$102k total volume). Kalshi's Entertainment series list has no box-office-gross series (H).
5. **ToS cuts against even the read-only use**: "personal, non-commercial enjoyment", "you may not download or save a copy of the Web site or any portion thereof", and the "actual betting, wagering or gambling based on the information provided on the Web site ... is strictly prohibited" clause (Terms last updated 2009-09-10; H). Using HSX prices to place real-money bets elsewhere is exactly what that clause forbids. Written permission would be needed; HSX advertises "research and prediction market services" contact for data (H, Contact page).
6. **adapter_priority = skip.** No API, no money, no execution, ToS-hostile, thin overlap. Revisit as a P2 "signal-only box office reference" only if a movie/entertainment vertical is wanted AND HSX grants written permission for data use.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.hsx.com/` on 2026-10-19 | HTTP 200, CloudFront, title "The Entertainment Market - Box Office Futures \| HSX.com"; "Latest IPO" = Wet; Spin Factor blog posts dated Sunday Oct 18, Thursday Oct 15, Wed Oct 14 (page gives no year; "Opening This Week" lists Oct 14 and Oct 16 releases, one explicitly "Oct 14, 2026") | H |
| `GET https://www.hsx.com/robots.txt` | 200, `last-modified: Fri, 16 Oct 2026 17:29:12 GMT`; disallows only `/search/` and `/login/`; sitemap index lists static, securities, blog, forum sitemaps. Fixture `hsx_robots_txt_2026-10-19.txt` | H |
| `/security/feature.php?type=boxoffice` | "Weekend Box Office, Weekend of Friday, October 9, 2026": #1 Other Mommy (IATHS) $27,805,825; Resident Evil (RESE8) shown as "delisted" after week 4 with total gross $138,738,566. Shows HSX ties to real grosses (see section 8) | H |
| `/security/view/STFTR` (Street Fighter) | Status Active, Phase Release, 3,575 theaters, today's volume 10,959,721 shares | H |
| Derivatives list | 24 live rows incl. IPOs on 2026-08-23, 2026-09-30, 2026-10-07 | H |
| Chart CSV for AVNG5 | Daily closes 2025-10-18 .. 2026-10-17 (364 rows). Fixture | H |
| Wikipedia (WebFetch summary; page last edited 2026-06-26) | "acquired by units of Cantor Fitzgerald"; HQ Century City, Los Angeles; several features discontinued (music market, top-gainer prizes, eBay buyout) | M |
| WebSearch result snippets | Crunchbase: "acquired by Cantor Fitzgerald"; Tracxn: founded 1996 Los Angeles, "$27M over 3 rounds", dates inconsistent | M / L |
| Staleness flags | About page footer says "Copyright (c) 1996-2024"; History page's latest entry is June 2009; Terms "Last updated on 9/10/2009"; Press page's newest item is Feb 2010. Static pages are old but the market data is current | H |

Verdict: **still_live = true (H)** as a game. Operating entity named on the site: Hollywood Stock Exchange, LLC (H, trademark notice). Owner/parent: Cantor Fitzgerald units per Wikipedia/Crunchbase (M; the site does not say).

## 2. Kind and market model

- **Kind:** forecasting, non-money. A virtual-currency "stock market" game / prediction-market research panel. Not a regulated exchange; Terms call the securities "fictitious novelty interests" that "are not, and should not be considered to be, stocks, bonds, or any other form of equity or debt security" (H, Terms).
- **Pricing engine:** not an order book. The "Virtual Specialist" is "the core technology of the Movie Market. It guarantees the execution of all trades" (H, Glossary). Trades execute at the then-current price; the quoted price can move between submit and fill ("slippage") (H, FAQ). The price-impact function is undisclosed (About page lists US patents 5,950,176; 6,505,174; 7,006,991; 7,487,123). Treat as a dealer/AMM-like market maker with an unknown curve (M inference). No depth, spread or book is shown.
- **Securities are scalar, not binary** (H):
  - **MovieStock:** price = expected domestic gross in USD millions over the first four weekends of wide release ("H$1 represents $1 million at the box office"; 12 weekends if limited). Example 2026-10-19: Avengers: Doomsday AVNG5 H$683.29 (release 2026-12-18).
  - **StarBond / CelebStock:** price = trailing average gross (TAG) of up to the last five credited films, each capped at $250M.
  - **Funds** (4 listed, e.g. "The Animal Fund" ZOO H$67.17) and **TVStocks**.
  - **Hollywood Derivatives:** opening-weekend security (`.OW`, price = expected opening-weekend gross in $M), `Call` (`.CA`) and `Put` (`.PU`) options at a strike, and Blockbuster Warrants (`.BW`, call-like on 12-weekend gross). Award-event derivatives (NominOptions, AwardOptions) are defined in the glossary but none were listed on 2026-10-19.
- **Order types:** buy, sell, short, cover, market and limit orders. No stop-loss ("a limit sell order can only be set at a price higher than the current trading price"). No margin calls; negative cash allowed (H, FAQ).
- **Tokenisation:** none. Positions are rows in an HSX account, identified by ticker symbol (e.g. `STFTR`, `STFTR.OW`, `STFTR.CA`).

## 3. Chains and collateral

- **Chain: none. Collateral: H$ only.** Each account starts with H$2,000,000 (home page, glossary); referral bonus H$25,000. H$ "have no actual corresponding dollar amount" and users "are not entitled to receive any real currency, unless otherwise determined by HSX, in its sole discretion" (H, Terms). No deposit or withdrawal path exists.

## 4. Read API

**None official.** Exists = `none` (no API, no docs, no key program; searched: site nav, Help/Topics/Tools pages, sitemap index, robots.txt, GitHub; see section 15).

De facto public, unauthenticated data surfaces (all H, fetched 2026-10-19; HTML or CSV, session cookie `PHPSESSID` is set but not required):

| Surface | URL | Content |
|---|---|---|
| Security lists | `https://www.hsx.com/security/list.php?id=1` (MovieStocks, 17 pages x 50), `id=2` (StarBonds, 28 pages), `id=3` (Derivatives, 24 rows, 1 page), `id=4` (Funds, 4 rows); paging `&sfield=name&sdir=asc&page=N`; other sort: `sfield=price_change`, `accts_holding` | Table rows with `data-symbol`, name, current price (`sorttable_customkey`), change today |
| Security detail | `https://www.hsx.com/security/view/{SYMBOL}` | Symbol, status (Active/Halted), IPO date, genre, phase, release date, release pattern, theaters, gross, price, change today, "Shares Held Long/Short on HSX", "Trading Volume on HSX (Today)", this week/month/season/year high-low |
| Price history | `https://www.hsx.com/chart/detail_chart_data.php?id={internal id}` (internal id is embedded in the detail page's chart script; e.g. AVNG5 = 43812) | CSV `Date,Close`, daily, about 1 year |
| Box office | `https://www.hsx.com/security/feature.php?type=boxoffice` (also `opening`, `upcoming`, `tvstock`); `/calendar/` | Weekly grosses vs HSX price, release schedule |

- **Auth:** none for the above. Trading and portfolio are behind `/login/` (not touched).
- **Rate limits:** NOT FOUND (not documented). About 45 sequential GETs in a few minutes returned HTTP 200 with no 429 or challenge. Pages send `cache-control: no-store`; CloudFront in front.
- **Websocket / streaming:** none seen. Prices update continuously during the day; the "change today" counters reset around 2 a.m. (H, FAQ).
- **No trade history, order book, bid/ask or per-trade data** is exposed. Only last/current price, change, volume today, shares held long/short.
- **Unofficial clients:** GitHub search found only `dovinmu/hsx` (5 stars, last push 2016-09-23) and a junk fork; no maintained library (H, `gh api search`).

## 5. Trade path

**None programmatic.** Browser session login (HTML form at `/login/`), then trades via `/trade/?symbol=SYM` forms. The home page also embeds links of the shape `/trade/index.php?symbol=...&tradeType=buy&shares=1&action=submit&trade_origin_url=/` (a GET-submittable trade URL for logged-in users; observed in page source only, not requested; H for the link text). No API key, no signing scheme, no webhook (H). Terms forbid "computer program-assisted trading" and the glossary defines "unauthorized computer program-assisted trading" as manipulation (section 9).

## 6. Reachable from PayBox?

**No.** (`paybox_reachable = no`.) HSX has no on-chain component and no accepted collateral other than its own play-money. An EVM or Solana wallet reached through PayBox cannot hold H$, post a transaction proposal, or sign an order for HSX. Nothing to test (and no PayBox tool was called).

## 7. Fees

All H$, so economically moot, but recorded for completeness (H, Glossary + FAQ):
- **Commission:** "All trades made on the Movie Market are subject to a one-percent commission, with a minimum of 2 cents per share, automatically deducted from your portfolio." (Ambiguous whether 2 cents per share is the floor on the 1% charge; formula NOT FOUND beyond this sentence.)
- **Cash-out:** no commission when a MovieStock cashes out (FAQ).
- **Inactivity fee:** accounts with no trade for 30 days are charged "a % of their uninvested cash balance" (rate NOT FOUND).
- **Manipulation penalties:** 1st offence fine of 25% of portfolio and a 15-day ban; 2nd 50% and 30 days; 3rd portfolio confiscated.
- No gas, no chain fees, no deposit/withdrawal fees.

## 8. Resolution mechanism and dispute risk

Mechanical, rule-based, from published rules (H, Glossary and FAQ):
- **MovieStock:** delists and cashes out "on the first business day after its fourth weekend of wide release" (wide release = 650+ theaters); limited-release films after 12 weekends; straight-to-video or TV films cash out at H$0.00. Cash-out price = domestic box-office gross in USD millions (H$1 = $1M). Source: **Exhibitor Relations Co. (ERC)**; "if ERC does not report box-office for a film, alternate sources may be used".
- **Administrative price adjustment:** a MovieStock is typically halted at wide release and "adjusts in price after its opening weekend ... to bring the expected box office gross in line with the actual box office gross" (average multiplier cited: 2.7 times opening weekend). So prices jump by rule around release weekends and are not a pure market signal at that point.
- **Options:** cash-out = opening-weekend box office minus strike (call), reverse for put; both zero if the film is not widely released. **Blockbuster Warrants:** cash out at max(12-weekend gross - strike, 0).
- **StarBond:** adjusts to the new trailing average gross the day after a credited film delists; each film capped at $250M.
- **Dispute risk:** no appeals process described; HSX is "sole owner" and decides at its "sole discretion"; manipulation rulings are "final". Since nothing real is staked, dispute risk is irrelevant economically, but a data consumer should note that HSX may use "alternate sources" and may change rules without notice (Terms).

## 9. Geo, ToS and automation

Quotes (H, https://www.hsx.com/about/?page=terms, "Last updated on 9/10/2009" so very stale):
- Scope: "provided ... for your and others' personal, non-commercial enjoyment" and "solely for entertainment purposes". Minimum age 13.
- Automation: users may not "actually or attempting to manipulate ... by ... registering multiple accounts ...; using computer program-assisted trading." Glossary: manipulation includes "unauthorized computer program-assisted trading using a single or multiple HSX accounts".
- Data use: "you may not download or save a copy of the Web site or any portion thereof, for any purpose"; "Only if you obtain prior written consent ... may you publish, display or commercially exploit any material from the Web site".
- Real money: "any actual betting, wagering or gambling based on the information provided on the Web site or through the Hollywood Stock Exchange is strictly prohibited."
- Geo: "We control and operate this site from our offices in the United States ... Persons who choose to access this site from other locations do so at their own risk." No geoblock was seen on public pages from the research host (location not recorded). Registration-time restrictions NOT FOUND (did not register). California law and courts.
- robots.txt allows crawling everything except `/search/` and `/login/` (H). Operating the scrape within robots.txt does not clear the Terms.

Net: any aggregator use is at best a gray-area scrape for a non-commercial reference; commercial redistribution or acting on the data with real money needs HSX's written consent.

## 10. Liquidity

In real money: **zero** (virtual currency). In-game activity, as shown on detail pages on 2026-10-19 (H, shares, not USD):

| Symbol | Price (H$) | Held long | Held short | Volume today (shares) |
|---|---|---|---|---|
| AVNG5 Avengers: Doomsday | 683.29 | 330,712,449 | 6,537,068 | 335,304 |
| STFTR Street Fighter | 76.07 | 124,146,815 | 31,246,374 | 10,959,721 |
| WILDW Wildwood | 26.63 | 81,266,087 | 16,798,197 | 1,160,833 |
| WILDW.OW (opening weekend) | 10.38 | 15,972,467 | 3,509,906 | 351,000 |
| STFTR.OW (halted) | 31.68 | 8,396,761 | 16,670,179 | 0 |

- Registered-user count and any dollar-equivalent volume: NOT FOUND. The list pages show about 850 MovieStocks (17 pages x 50) but most are dormant (many sit at an unchanged price); active trading is concentrated in roughly the 10-30 films that are near release.
- For comparison, the real-money Polymarket box-office events that overlap had total volume of about $0.1k (Wildwood, new) to $102k (Street Fighter) on 2026-10-19 (H, Gamma API).

## 11. Event categories and overlap (where arbitrage could exist)

| HSX category | Overlap with other venues | Tag |
|---|---|---|
| US movie opening-weekend gross (`.OW`, calls/puts, MovieStock for 4-week gross) | **Polymarket** lists opening-weekend box-office bracket events resolved from The Numbers daily box-office tab. On 2026-10-19: Street Fighter (vol $101,966), Whalefall ($80,953), Sense and Sensibility ($29,434), Wildwood ($130, ends 2026-10-25), plus "Other Mommy" and "The Social Reckoning" 2nd-weekend events | H |
| Same, Kalshi | None found: the Entertainment category returned 2,595 series; none titled gross/opening weekend/box office except Golden Globes box-office-award series. Kalshi's film coverage is Rotten Tomatoes scores (179 series), Oscars (73), Netflix rankings | H |
| Awards (Oscars/Emmys via AwardOptions/NominOptions) | Would overlap Kalshi/Polymarket award markets, but no award derivatives were listed on 2026-10-19 (season not open) | H (absence), M (future) |
| TV, StarBonds, funds | No real-money counterpart found | M |
| Sports, politics, crypto price, macro | None (the HSX "Sports Stock Exchange" and others are discontinued or unlisted; Wikipedia says some features were discontinued) | M |

Worked example of the one overlap seen (H numbers, M interpretation): Street Fighter opened Oct 16-18. HSX `STFTR.OW` showed H$31.68 (status Halted), Polymarket's bracket "between 30m and 35m" was priced 0.981. They agree. Whalefall: HSX `WHALF.OW` H$10.31 still "Active" with 0.00 change, while Polymarket's "less than 8m" bracket was priced 0.813 and "8m-10m" 0.1735, i.e. Polymarket had already moved toward post-weekend actuals and HSX had not (HSX adjusts by rule after the weekend). So HSX lags real-money venues around release weekends; it is most informative before release. Cannot be traded against.

Possible edge from HSX data is information, not arbitrage: pre-release HSX MovieStock levels as a prior for Polymarket opening-weekend brackets. Value unproven (no backtest done here).

## 12. Shared liquidity

None. HSX runs its own closed H$ economy; no liquidity is shared with or routed to any other venue (H). Wikipedia says Cantor "has used HSX's moviestock prices to assist Cantor's gambling operations in the United Kingdom" (M, Wikipedia via WebFetch, possibly stale): that is a data use, not shared liquidity. HSX is **independent of every other venue**, but also not tradable, so it is not an arbitrage leg.

## 13. Fixtures

All under `docs/research/fixtures/hollywood-stock-exchange-hsx/` (each well under 50 KB):
- `hsx_chart_detail_chart_data_id43812_AVNG5_2026-10-19.csv` - raw CSV (6.5 KB), header `Date,Close`, last row `2026-10-17,681.38`.
- `hsx_list_moviestocks_page1_parsed_2026-10-19.json` - 50 parsed rows of `list.php?id=1` page 1 (HTML scrape output, not an API response).
- `hsx_list_derivatives_all_parsed_2026-10-19.json` - all 24 derivative/TV-stock rows.
- `hsx_security_view_extracts_2026-10-19.json` - fields extracted from 7 detail pages (volume, long/short, status, chart id).
- `hsx_robots_txt_2026-10-19.txt` - raw robots.txt.
- `polymarket_gamma_box_office_overlap_trimmed_2026-10-19.json` - trimmed Gamma events for three overlapping films (cross-check only).
- `kalshi_entertainment_series_film_overlap_check_2026-10-19.json` - result of the Kalshi series keyword check.

## 14. Adapter notes (only if the decision in section 0 is reversed)

- Scraper only: list pages (`id=1,2,3,4`, paginated) + detail pages + chart CSV. Parse `tr[data-symbol]` and `sorttable_customkey` for price/change. Symbol grammar: `<FILM CODE>[.OW|.CA|.PU|.BW]`.
- Normalisation: HSX price is a **scalar in USD millions** (not a probability). Map to a bracket probability only through an assumed distribution; do not present as a YES price. Sign convention for `.PU`: payoff = max(strike - gross, 0).
- Cadence: poll no faster than every few minutes and only for films within ~4 weeks of release; skip dormant names.
- Linking: join to Polymarket opening-weekend events by film title and weekend dates; the Polymarket resolution source is The Numbers daily box-office tab, HSX uses ERC. Different sources, so settle-basis risk exists.
- Do not implement trading. Keep a feature flag `signal_only: true`, `tradable: false`, `independent: true`, and a ToS note.

## 15. NOT FOUND (searched: hsx.com nav, Help/Topics/FAQ/Glossary/Tools, About/History/Press/Contact/Privacy, sitemap index, robots.txt, GitHub repo search, one web search)

- Any official or documented API, key program, rate-limit policy, websocket, or data-licence terms page.
- The price-impact / Virtual Specialist formula (patent numbers only).
- Registered-user count, daily active users, or any real-dollar volume.
- Exact commission formula beyond the glossary sentence; the inactivity-fee percentage.
- Registration geo-restrictions (did not register).
- Terms or product changes since 2009 (Terms show a 2009 date; About footer says 2024; no 2026 legal notice found).
- First-hand confirmation of ownership by Cantor Fitzgerald or of the 2010 US box-office-futures ban (search budget exhausted; the ban recollection is L).

## 16. Open questions

1. Would HSX grant written permission for non-commercial or research-licensed use of its prices? (contact route: the "research and prediction market services" contact on the Contact page.)
2. Does HSX pre-release MovieStock price add predictive power over Polymarket opening-weekend brackets? Needs a backtest using the chart CSVs against final grosses; not done.
3. Is any real-money operator still using HSX data as a reference price (Wikipedia mentions Cantor's UK betting)? Unverified.
4. Do Oscar-season AwardOptions/NominOptions reopen (usually late in the year) and would they overlap Kalshi/Polymarket award markets? Check again in Dec-Feb.

## 17. Suspicious content (embedded instructions or AI-aimed text seen in third-party material)

None found. A keyword scan of the fetched HSX pages for AI/agent-directed phrasing found only false positives (the substring "llm" inside a cast member's surname). No instructions from any page were followed.

## Sources

Primary (HSX, all fetched 2026-10-19; H):
- https://www.hsx.com/ (home, live data, blog dates)
- https://www.hsx.com/robots.txt
- https://www.hsx.com/sitemap.xml
- https://www.hsx.com/about/?page=terms (Terms and Conditions, last updated 2009-09-10)
- https://www.hsx.com/help/?page=faq (FAQ: cash-out, limit orders, shorting, slippage, MovieStock adjustments)
- https://www.hsx.com/help/?page=glossary (commission, cash-out price, options, warrants, manipulation penalties, Virtual Specialist)
- https://www.hsx.com/about/ (company description, patents, trademark notice, copyright 1996-2024)
- https://www.hsx.com/about/?page=history, https://www.hsx.com/about/?page=press, https://www.hsx.com/about/?page=contact
- https://www.hsx.com/security/list.php?id=1 (MovieStocks), `id=2` (StarBonds), `id=3` (Derivatives), `id=4` (Funds)
- https://www.hsx.com/security/view/AVNG5, `/STFTR`, `/WILDW`, `/STFTR.OW`, `/WILDW.OW`, `/STFTR.CA`, `/SPID9.BW`
- https://www.hsx.com/security/feature.php?type=boxoffice
- https://www.hsx.com/chart/detail_chart_data.php?id=43812

Cross-checks (public APIs, used only to look for overlap; H for the response contents):
- https://gamma-api.polymarket.com/public-search?q=box%20office and `/events?slug=street-fighter-opening-weekend-box-office` (also `whalefall-...`, `wildwood-...`)
- https://api.elections.kalshi.com/trade-api/v2/series?category=Entertainment

Secondary (M / L):
- https://en.wikipedia.org/wiki/Hollywood_Stock_Exchange (via WebFetch summary; ownership by Cantor Fitzgerald units, discontinued features; page last edited 2026-06-26)
- WebSearch result set "Hollywood Stock Exchange HSX 2026" (Crunchbase and Tracxn company profiles, Kaggle HSX dataset listing; snippets only)
- GitHub repo search results (`dovinmu/hsx`, last push 2016-09-23)
