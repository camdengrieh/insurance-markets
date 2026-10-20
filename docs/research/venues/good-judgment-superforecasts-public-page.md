# Good Judgment Superforecasts (public page) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: skip. This is not a market. It is a human-curated HTML table of superforecaster
consensus probabilities, not tradable, with no API. The URL the discovery hint pointed at
(https://goodjudgment.io/superforecasts/) now serves only a meta-refresh redirect stub to
http://www.goodjudgment.com, and goodjudgment.com returns HTTP 403 to non-browser clients. The page is
unreachable for an automated scraper, and the Metaforecast scraper written against it is dated.
Good Judgment Inc. remains a live company. Its public forecast pages, if they still exist on
goodjudgment.com, could not be read this session.

## Liveness (2026)

- GET https://goodjudgment.io/superforecasts/ (UA insurance-markets-research/0.1) returned 200, 428 bytes,
  text/html. The body is a stub with title "Good Judgment Inc", `<meta name="robots" content="noindex,nofollow">`
  and `<meta http-equiv="refresh" content="0; url=http://www.goodjudgment.com">`. [H] Fixture saved:
  docs/research/fixtures/good-judgment-superforecasts-public-page/goodjudgment.io-superforecasts-2026-10-19.html
- https://goodjudgment.io/robots.txt returned 200 with `User-agent: *` and `Disallow: /`. [H]
- https://goodjudgment.com/, /superforecasts/, /wp-json/, /resources/ and /terms-of-use/ all returned 403 via curl
  and WebFetch. [H] I could not read the current public forecasts or the ToS. The company is likely behind a
  bot-blocking WAF. I did not try to evade it.
- The .io table scraped by Metaforecast is therefore gone from that URL (it redirects). [H]
- Metaforecast's goodjudgment.ts: the file's last change was 2024-04-05 (the repo's last commit overall was
  2025-02-09). The scraper itself logs "Note that failing is not unexpected; see utils/pullSuperforecastsManually".
  [H, via gh api] Stale and fragile even when the page worked.
- The WebSearch budget was exhausted this session, so I could not independently confirm what Good Judgment now
  publishes publicly. Not found (searched: WebFetch of goodjudgment.com pages, 403).

## Kind and market model

- Kind: forecasting-nonmoney. A curated consensus-probability table, not a market. [H, from scraper source]
- Structure per the scraper: one table per question with a title, a BACKGROUND text, and rows of options with
  a percentage (`probability = Number(cell.split("%")[0]) / 100`). So categorical or multi-option questions
  with probabilities per option, plus Superforecaster commentary text. [H]
- No order book, no AMM, no tokens, no prices, no volume, no trades. Updates are manual, at an unknown cadence.
  There is no timestamp field in the scraped structure. [H]

## Read API

- exists: none (HTML only). Official docs: NOT FOUND (searched: goodjudgment.io, goodjudgment.com blocked 403).
- Base URL: none. The only machine path was HTML scraping of the old URL, which now redirects.
- Auth and limits: n/a. robots.txt on .io is Disallow: /. [H]
- Good Judgment sells FutureFirst / Superforecaster analytics subscriptions commercially [M, general knowledge,
  not verified this session]. That is the likely official data path, paid and contract-based. Not verified.

## Trade path

None. No orders, no signing, no wallet, no chains, no collateral. PayBox reachability: no (nothing to
transact with).

## Fees, resolution, liquidity

- Fees: none (not a venue).
- Resolution: not applicable. Questions have a real-world outcome, but the page publishes the current
  consensus, not a settled market. No dispute mechanism applies to the page.
- Liquidity: none. There is no volume, OI or TVL.
- Shares liquidity with another venue: no. It is not a venue.

## Geo / ToS / automation

- ToS: NOT FOUND (goodjudgment.com/terms-of-use returned 403). Scraping the .io page would conflict with
  its `Disallow: /` robots.txt and the page is now a noindex redirect stub. [H]
- Automation: bot-blocked (403 on .com). Do not build a scraper.

## Event coverage / arbitrage relevance

- Historically geopolitics, elections, macro and technology questions, per the scraper's use [M]. These overlap
  Polymarket, Kalshi and Metaculus topics, but a non-tradable probability can only be a weak signal, not an
  arbitrage leg. Nothing was verified about 2026 content.
- Possible use: a manual or low-frequency prior for a Quotient-style signal layer, if a licensed feed is ever
  obtained. Not worth an adapter now.

## Relation to Good Judgment Open

Distinct product. Good Judgment Open (gjopen.com) is a crowd forecasting platform (see good-judgment-open.md in
this directory). In this session https://www.gjopen.com/ returned 200 and /questions returned 406 to the
generic UA. [H] The Superforecasts page was a different, curated table of Superforecaster panel numbers.

## Open questions

- Does goodjudgment.com still publish a public superforecasts page, and under what URL and terms? (403 blocked)
- Is there a paid data feed or API (FutureFirst), and at what price? Not verified.

## Sources

- https://goodjudgment.io/superforecasts/ (fetched 2026-10-19, redirect stub) [H]
- https://goodjudgment.io/robots.txt [H]
- https://github.com/quantified-uncertainty/metaforecast/blob/main/src/backend/platforms/goodjudgment.ts
  (read via gh api; scraper logic, last changed 2024-04-05) [H]
- https://goodjudgment.com/ , /superforecasts/ , /terms-of-use/ (HTTP 403, unreadable) [H for the 403]
- https://www.gjopen.com/ (200), /questions (406) [H]

## Suspicious content

None found. The goodjudgment.io stub contained only a meta refresh redirect, with no instructions aimed at AI agents.
