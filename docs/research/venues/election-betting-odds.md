# Election Betting Odds - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch and unauthenticated GETs of public pages on electionbettingodds.com with the generic User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. Third-party page content was treated as untrusted data; no embedded instructions were found.

Limits: the shared WebSearch budget was exhausted, so no web search was possible (no external coverage, ownership news or ToS searches). Everything below comes from the site itself.

Tags: H = read first-hand this session; M = inferred; L = weak/stale.

## Summary

- **Not a trading venue.** Election Betting Odds (EBO) is a free, static-HTML display site (Maxim Lott and John Stossel) that averages prices from Betfair, Smarkets, PredictIt, Polymarket and Kalshi. There is nothing to trade on it and no API. [H]
- **Still live.** Homepage says "Odds update every minute | Last updated: 12:51AM EDT on Oct 19, 2026"; HTTP `Last-Modified` was Mon, 19 Oct 2026 04:52:35 GMT, fetched the same day. [H] https://electionbettingodds.com/
- **Role for us:** benchmark / cross-check signal only. Every number it shows is derived from venues we adapt directly, so it is not an independent leg and adds no liquidity. Scraping it would be strictly worse than reading the five source venues. [M]
- adapter_priority: skip (or P2 at most as a sanity-check signal source).

## Kind and market model

- Kind: aggregator-or-data (display only, US politics). [H]
- Markets shown: Senate control 2026, House control 2026, Governor map 2026, DEM and GOP nomination 2028, presidential party 2028, 2028 by candidate, state-level races (nav links on the homepage). [H] https://electionbettingodds.com/
- Output is a single blended "chance" per outcome (e.g. DEM 63.2 / REP 36.8 for Senate control), plus a per-venue bid-ask range and "total $ bet" in hover tooltips. [H] fixture `home-senate-control-block.html`
- State race odds use only Polymarket, Kalshi and PredictIt (per site). [H]

## Chains and collateral

N/A. EBO holds no funds. Source venues have their own collateral (Polymarket on Polygon USDC, Kalshi USD, Betfair and Smarkets fiat GBP/EUR, PredictIt USD). [M, covered by their own notes]

## Read API

- exists: **none** (official). No API, data download, embed or licensing statement on the homepage or on `/about.html`. [H] https://electionbettingodds.com/about.html (last-modified 2024-11-04)
- `/robots.txt` and `/sitemap.xml` return 404. [H]
- Data is baked into server-rendered static HTML regenerated about every minute (homepage `Last-Modified` was 04:52 GMT, Senate page 04:51 GMT). No JSON/CSV endpoints, no websocket. [H]
- Where numbers sit (only if someone insisted on scraping, which we should not):
  - Homepage `/`: tooltip tables per outcome with rows `Venue | bid-ask range % | total $ bet`; the blended percent and 4h/day/week change. ~97 KB. [H]
  - Per-market pages (e.g. `/Senate-Control-2026.html`, ~810 KB): an inline Google Charts `DataTable` with `data.addRows([[new Date(y,m0,d,h,mi,s),DEM,REP,],...])`. 18,684 rows in the Senate page, starting 2024-11-16 (the series is shared with an older market lineage), latest row 2026-10-19 00:51:54 with 63.2 / 36.8. Note JS month is 0-based. [H] fixture `senate-2026-chart-series-excerpt.txt`
  - Chart page loads `https://www.google.com/jsapi` (third-party script, not executed). [H]
- Auth and limits: none stated; no rate-limit documentation. [H, NOT FOUND]
- Fragility: HTML layout is a hand-built legacy page (HTML 3.2 doctype, Apache 2.4.7 on Ubuntu); no schema stability promise. [H]

Fixtures saved under `docs/research/fixtures/election-betting-odds/`:
- `home-senate-control-block.html` (excerpt of homepage Senate block)
- `senate-2026-chart-series-excerpt.txt` (first and last rows of the embedded series)
- `home-response-headers.txt`

## Methodology (useful as a benchmark definition)

From `/about.html` [H, last modified 2024-11-04, so M-L for current accuracy]:
- Equal weight per exchange; explicitly NOT volume-weighted (since 2 Apr 2024) because the author doubts venues report volume consistently.
- Convert each venue's bid and ask to probabilities first, then average: (1/Bid + 1/Ask)/2 on odds-style prices.
- If bid-ask spread exceeds 10 points use the bid alone; if bid > 50% and spread > 10 use the ask alone.
- No fee adjustment is described. Notes PredictIt 5% withdrawal fee and $850 per-contract limit overvaluing longshots.
- Says average spread ~0.5% and cross-venue differences of a point or two are not significant.
- Disclaimer: Americans may not use Betfair, Smarkets, or Polymarket (stale, predates Polymarket US).

Observed cross-venue spread, Senate control DEM (2026-10-19 00:51 EDT), bid-ask by venue: Kalshi 61.4-62.4, Polymarket 63.4-64.4, PredictIt 63.0-65.0, Betfair 62.5-63.3, blended 63.2. [H] That is a ~1-2 point inter-venue gap, which matches the site's own claim and is the sort of gap our scanner must beat fees and settlement-rule differences to monetise. [M]

## Trade path

None. EBO has no accounts, orders or wallets. Its venue links are plain outbound links (and PredictIt's is a `promo` URL, i.e. likely an affiliate/referral link, M). [H] https://electionbettingodds.com/

PayBox reachability: **no**. There is nothing to sign or send. Source venues' PayBox reachability belongs in their own notes.

## Fees

None charged by EBO. Site is free to view; revenue model not documented (a Substack embed `electionbetting.substack.com/embed` and Google Analytics/StatCounter are present). [H] Per-venue fees are not reflected in the blended odds. [H]

## Resolution mechanism

N/A. EBO does not resolve anything; each source venue resolves on its own rules, which differ (e.g. control of the Senate with VP tie-break definitions, certification timing). Cross-venue "arbitrage" via EBO numbers carries settlement-definition risk. [M]

## Geo, ToS, automation

- No terms of service or disclaimer page is shown; the only legal text is a footer "Copyright 2022, FTX Trading Ltd". [H]
- About page: the site was acquired by FTX Trading Ltd in 2020; FTX went bankrupt in 2022 and the site is "one of its assets"; the author says he plans to keep operating it as long as feasible. Current ownership/operator is therefore unclear (could be the FTX estate or a successor). [H on text, owner status unknown]
- Scraping rules: none stated, no robots.txt. Reuse/licensing of the blended numbers: NOT FOUND. Assume all rights reserved. [H, NOT FOUND]
- Single-person project with continuity risk (acquired-by-bankrupt-entity, 2022 copyright footer, about page unchanged since Nov 2024). [M]
- Contact: via the author's Twitter (linked in footer). [H]

## Liquidity (as shown by EBO, 2026-10-19; each figure is the underlying venues' own "total bet", not EBO's)

- Senate Control 2026: $23,495,139 total. Kalshi $15,467,498; Polymarket $7,131,268; PredictIt $598,100; Betfair $299,940. [H] https://electionbettingodds.com/
- US Presidency 2028: $765,944,803 total. Polymarket $717,241,615; Kalshi $45,463,201; Betfair $1,558,376; PredictIt $1,411,816; Smarkets $269,795. [H]
- State markets: "Over $5 million bet". [H]
- Implied venue ranking for US politics: Polymarket and Kalshi carry nearly all depth; Betfair, PredictIt and Smarkets are thin on these markets. (This is the useful takeaway for adapter prioritisation.) [M]
- The "$ bet" definition (volume vs open interest) is not documented; treat as volume-like, unverified. [L]

## Event coverage overlap

US politics only (control of chambers 2026, 2028 nominations/winner, governor and state races). Overlaps Polymarket, Kalshi, PredictIt, Betfair, Smarkets and others covered in sibling notes. No sports, crypto or macro. [H]

## Liquidity sharing

EBO has none of its own. It is a pure derivative view of Betfair, Smarkets, PredictIt, Polymarket, Kalshi (data only). Using it as a leg would double-count those venues. [H]

## Priority

**skip** for an execution adapter (no trading, no API, no own liquidity). Optional P2-style use as a manual sanity check of our own blended price (compare our aggregation against its blended number for Senate/House/2028), requiring only a polite occasional page fetch, not an integrated adapter. Methodology (1/bid, 1/ask averaged, wide-spread fallback, equal weights) is worth borrowing as a baseline in `docs/aggregation-design.md`. [M]

## Open questions

- Who owns and operates the site now (FTX estate vs author)? Not stated. Any permission to reuse data is unknown.
- Is the Polymarket odds feed global or US? The site lists Polymarket twice in its source text and its disclaimer predates Polymarket US.
- Whether "total $ bet" is volume or open interest.

## Not found

- Any API, data download, license, ToS, rate limit or robots policy (searched: homepage, /about.html, robots.txt, sitemap.xml, HTML link/script scan).
- Independent coverage of the site's current status (web search budget exhausted).

## Sources

- https://electionbettingodds.com/ [H] fetched 2026-10-19
- https://electionbettingodds.com/about.html [H] methodology, page last modified 2024-11-04
- https://electionbettingodds.com/Senate-Control-2026.html [H] embedded series
- https://electionbettingodds.com/robots.txt and /sitemap.xml [H] both 404
- Fixtures: `docs/research/fixtures/election-betting-odds/`
