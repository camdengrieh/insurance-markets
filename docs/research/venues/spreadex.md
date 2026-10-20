# Spreadex - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public pages, public PDFs (rulebooks, customer agreement), sitemap/robots, public App Store lookup, public GitHub search, Companies House page. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. Generic User-Agent `insurance-markets-research/0.1` only. Third-party pages were treated as untrusted data; no embedded instructions were found (nothing to record in suspicious_content).

Limits of this research (read first):
- **The web-search budget for this session was exhausted** (200 shared calls), so discovery rested on the one lead URL (goodmoneyguide.com), Spreadex's own site, and its legal PDFs. No independent press coverage, trading-volume or financial-results source was found.
- **Prices are not readable without running the site's JS.** The politics/specials pages are an Angular SPA; the server-rendered HTML contains copy but no prices. I did NOT probe the site's internal `api.web` / `model` / SignalR endpoints (undocumented, not a public API, and the Terms restrict automated access). Whether a logged-out visitor sees live buy/sell quotes is therefore unverified.
- PDFs were converted to text locally with macOS PDFKit (no third-party code run). Statements below come from that text unless marked M.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

---

## 0. Bottom line

1. **Live, regulated, UK-only bookmaker. Not a contract-style prediction market.** Spreadex Limited (FCA-authorised for spread betting, Gambling Commission-licensed for fixed odds) sells *spread bets* and *fixed-odds bets* on sports, politics and specials. It is the counterparty to every bet (a bookmaker book, not an exchange or order book). (H)
2. **Not tradable from PayBox.** Fiat (GBP default; EUR/USD possible), card/bank deposits in the account holder's own name, KYC, UK-centric. No chain, token, wallet or signed-order scheme. (H)
3. **No public/official API, no published data feed.** Its terms forbid "high speed or automated mass data entry" on "any betting platform" without prior written consent and list using "any software aid, programme or robot" for fixed-odds bets as an Event of Default. (H)
4. **Value to the project is marginal as a signal source:** politics (US presidential Electoral College Votes / States Won, UK general election seats / turnout) and specials are quoted as continuous *spreads*, not 0/1 probabilities. They overlap thematically with Polymarket/Kalshi but cannot be compared without a model, and there is no machine-readable access to the prices anyway. (H for products; M for the usefulness judgement)
5. **adapter_priority = skip.** No API, bot-hostile terms, fiat-only, spread-quote format. Revisit only if Spreadex offers a licensed data feed.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.spreadex.com/` and `/sports/` on 2026-10-19 | HTTP 200 (homepage 48 KB), `/sports/` 301 to `/sports/en-GB/spread-betting/` (page 300 KB) | H |
| Sitemap `https://www.spreadex.com/sitemap` (576 URLs) | Homepage lastmod 2026-10-08; `/sports/en-GB/spread-betting/politics` and `/specials` lastmod 2026-10-19 (changefreq daily). Fixture `sitemap_excerpt_2026-10-19.xml` | H |
| Rulebooks (spread betting, fixed odds) | "Effective Date: 28th August 2026" | H |
| iOS app, GB App Store lookup 2026-10-19 | "Spreadex Sports Betting App" v4.1.4 released 2026-10-15, 1,446 ratings, 4.7 avg, seller Spreadex Limited. Fixture `itunes_gb_spreadex_app_2026-10-19.json` | H |
| Companies House, Spreadex Limited no. 03720378 | Active, incorporated 1999-02-25, confirmation statement 2026-02-25, accounts to 2025-05-31 filed | M (WebFetch summary of primary page) |
| Lead article goodmoneyguide.com "UK prediction markets" | Byline 16 Oct 2026; lists "Spreadex Sports" among "similar products" to prediction markets | H (read) / M (third party) |

Verdict: **still_live = true (H).** It is a long-running bookmaker (since 1999), not a new venue.

## 2. Kind and market model

- **Kind:** UK bookmaker / market-maker. Two regulated products on one platform (H, Customer Agreement + rulebooks):
  - **Sports spread betting** (FCA): you "buy" above or "sell" below a quoted range; profit/loss = (result - buy level) x stake or (sell level - result) x stake. Losses are uncapped and can exceed stake and account balance (H, Customer Agreement r.17 and risk warning; get-started page).
  - **Sports fixed-odds betting** (Gambling Commission licence 8835): decimal/fractional odds, fixed stake and return, singles only for Specials (H, Fixed Odds Rules r.17(2)).
- **Counterparty:** Spreadex itself quotes the price and takes the other side (Customer Agreement r.17: the quote is "an offer to buy or sell ... at the price quoted"). No order book, no AMM, no peer-to-peer matching. (H)
- **Market shapes seen:**
  - *Politics spread:* Party Seats, Turnout %, Candidate Electoral College Votes, ECV Supremacy, Candidate Total States Won, States Won Supremacy, Candidate "250 Ups" (H, https://www.spreadex.com/sports/get-started/politics-spread-betting/, M on parse since read via WebFetch summary; the sitemap lastmod of that guide is 2025-09-19, so examples are dated). A "100 Index" bet type is linked but not described (L).
  - *Politics fixed odds:* Election Winner, Winning Party, Candidates, Over/Under, State Winner, Handicap (H, politics page copy; no prices on the static page).
  - *Winner-style spread ("index") markets* settle at 0 or a fixed top value (the lead article says "either settle at 0 or 50 to 100, depending on the market", M; Spreadex's own example: a Race Index pays 50/25/10 points for 1st/2nd/3rd, 0 otherwise, H).
  - *Specials:* TV/entertainment (Eurovision, I'm A Celebrity, SPOTY), politics, current affairs, financial (H, fixed-odds rules r.17 and specials page copy).
- **Tokenisation:** none. Positions are rows in an account ledger (Trading Ledger for spread bets, Fixed Odds Ledger for fixed odds). (H)
- **Menu event types (site's own ids, from the public page bootstrap model):** Politics eventTypeId 21, Specials 196, Football 23, Tennis 31, Cricket 25, Golf 27, Horse Racing 28, Motor Racing 29, Boxing 24, UFC 562, E-Sports 564, American Football 32, Basketball 56, Baseball 216, Ice Hockey 438, plus a "Financial Bets" menu. (H, fixture `politics_page_prerender_pruned_2026-10-19.json`; these ids are internal, not a public API contract.)

## 3. Chains and collateral

- **Chain: none.** Collateral is fiat in a custodial account. Default currency GBP; an account "may be designated ... Euros or US dollars" at opening; payments in other currencies are converted at spot mid with possible charges (H, Customer Agreement r.43).
- Deposits "using a payment method registered in your own name" (H, r.3). No crypto/stablecoin option found in the Customer Agreement (H: no occurrence of crypto, bitcoin or virtual currency in the PDF text; NOT FOUND on the site banking pages, which I did not read).
- Fixed-odds client money: "medium protection" segregated at Barclays/Lloyds per the fixed-odds rulebook (H). Spread-bet money protection terms not read (NOT FOUND in my extraction).

## 4. Read API

**Official/public API: none found.**

| Item | Value | Tag |
|---|---|---|
| Docs / developer portal | NOT FOUND (searched: `/api`, `/developers` -> HTTP 404; sitemap (576 URLs) has no API/developer page; footer links; GitHub) | H |
| GitHub | No official org/repo. Search for "spreadex" returns only unrelated coding-exercise repos (0 stars, 2017-2025) | H |
| Site front end | Angular SPA with SignalR realtime (strings in `main-FTGP3L3N.js`), config pointing at `https://www.spreadex.com/sports/api.web` and `https://www.spreadex.com/sports/model` (public page bootstrap data). Undocumented, internal. NOT probed. Same codebase serves the sister brand `sportingindex.com` (`isSportingIndex()` theme switch). | H (strings), unverified behaviour |
| robots.txt | Blocks only generic admin paths (`/umbraco/`, `/casino/`, `/internal/` ...) and a few named crawlers; does not disallow `/sports/`. Fixture `robots_txt_2026-10-19.txt` | H |
| Static HTML | Markets/prices not in server-rendered HTML; politics page returned copy only. | H |
| Rate limits / websocket | NOT FOUND (no public API) | - |
| Phone/app | Telephone trading desk exists for dealing (H, politics page copy and Customer Agreement r.17(4)) | H |

Real response shapes: there is no public API to sample. I saved only the public page's own bootstrap data (menu of event types, config URLs) and robots/sitemap/App Store excerpts under `docs/research/fixtures/spreadex/`. These are NOT a data contract.

## 5. Trade path

**None programmatic.** Orders are placed through the website, the iOS/Android apps or by phone, from a verified account. Terms:
- Mobile Trading Terms (8): "Use of any high speed or automated mass data entry system with any betting platform will only be permitted with our prior written consent exercised in our sole discretion." (H, https://www.spreadex.com/sports/terms-agreements/customer-agreements/)
- Event of Default (h): "If you use any software aid, programme or robot to place Fixed Odds Bets or to manipulate the outcome of such a Bet or your Account in any way." (H, Customer Agreement PDF r.7)
- A UK-registered retail bookmaker account would also be needed. No API key, no signing scheme, no webhook.

## 6. PayBox reachability

**no.** (H for reasons) An EVM/Solana wallet reached through PayBox (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...) cannot deposit to, hold a position on, or trade here: there is no on-chain contract, no signed-order endpoint, and funding is by card/bank transfer in the customer's own name after KYC. Withdrawals go back to the same fiat rails. There is nothing for a transaction proposal or signed order to target.

## 7. Fees

- **Spread bets:** no per-trade commission is quoted; the cost is the buy-sell spread itself, plus "charges ... on the basis of our charging policy at the time" deducted from the Trading Ledger (H, Customer Agreement r.15; the policy itself NOT FOUND). Interest 1% per month on negative balances (EAR 12.7%) (H, r.16(4)-(5)). Possible currency conversion charges (H, r.43 / r.17 summary).
- **Fixed odds:** margin embedded in the odds ("overround"), not disclosed. No exchange commission. (M)
- **Tax:** the Customer Agreement states UK residents currently pay no CGT on betting winnings and spread betting is not subject to CGT or stamp duty (H, r.16(3); not tax advice).
- Who pays: the customer, via the spread / odds; Spreadex keeps the edge as the book.

## 8. Resolution mechanism and dispute risk

- **Resolver is Spreadex itself.** "The official result will be reasonably determined by ourselves by reference to the publicly available evidence" (H, Spread Betting Rulebook SSBR r.5). Provisional settlement can be "retrospectively adjusted"; final settlement within three days for one-day markets, "as soon as is practicable" for longer ones (H, SSBR r.5).
- **Unusual markets:** "our decision as to where parallels may most fairly be drawn shall be final" (H, SSBR r.8). Political events are explicitly covered by this clause.
- **US elections:** each state/district's winner takes all Electoral College Votes (faithless electors ignored); "The source of settlement for all US Election markets is the Associated Press"; if AP has not called a state, the state's official certification is used; if AP has not called the presidency by inauguration day, settlement is by who is inaugurated (H, SSBR "Politics" and Fixed Odds Rules r.18). This is a clean, comparable resolution source for aggregator linking to Polymarket/Kalshi US markets, but the instrument is a spread, not a binary.
- **Errors:** Spreadex may void or amend bets affected by an "Error" (pricing, acceptance, settlement); a fixed-odds pricing error exists if profit differs by more than 50% from the correct price (H, Customer Agreement r.5). Arbitrage against a bookmaker carries this void risk.
- **Complaints:** separate procedures for spread betting and fixed odds exist (https://www.spreadex.com/sports/terms-agreements/complaints-handling/ and `/complaints-handling-gc/`); not read. External ADR route NOT FOUND (not read).
- Dispute risk: **medium-high for an outside arbitrageur** (counterparty is also referee, retroactive adjustment allowed, account closure allowed on Event of Default), low for standard sports results.

## 9. Geo / ToS / automation

- **Eligibility:** 18+, must not be in a restricted territory, one account only without consent, not self-excluded (H, Customer Agreement r.2). **Fixed odds only if located in Great Britain** (H, r.2(3); "placed any Fixed Odds Bets from outside Great Britain" is an Event of Default, r.7(l)). The Restricted Territories page says fixed odds is licensed in "the UK, Ireland and Denmark" (M, WebFetch summary), which is more permissive than the PDF; treat the stricter reading as binding. Spread betting territory limits are not listed on that page (NOT FOUND); the site has Danish and English locales (H, bootstrap data).
- **Automation:** see section 5. Written consent required for automated mass data entry; robot use for fixed odds is an Event of Default. Scraping is not named in the Customer Agreement (NOT FOUND) but would run into the same terms and the Error/abuse rules. Do not scrape.
- **Arbitrage/abuse:** the Customer Agreement lists cheating, manipulating promotions and multiple accounts as Events of Default (H, r.7(f)-(g)); max-payout limits apply across "a group of customers acting together" and multiple accounts (H, Fixed Odds Rules r.15(2)). Spreadex can limit or close accounts of profitable customers; no promise of acceptance of bets. (M, general bookmaker practice; the contract says it "may refuse any application" and may suspend/close on Event of Default, H)

## 10. Liquidity

- **No volume, open-interest or TVL figure is published.** NOT FOUND (searched: homepage, politics/specials pages, sitemap, Customer Agreement, Companies House summary; web search unavailable). It is a book, so "liquidity" = what Spreadex will quote.
- **Only hard size signal:** fixed-odds maximum payout for "Non sport, specials and novelty bets" is **GBP 10,000 per event/customer group** (H, Fixed Odds Rules r.15(7)); politics are defined as Specials (r.17(1)), so this applies to politics fixed odds. Sports caps run GBP 25,000 to 300,000 (e.g. American football 300,000, cricket/golf/rugby 250,000, darts/snooker/tennis/motor sports/boxing/baseball/basketball/ice hockey 100,000, other 25,000) (H, same rule). Spread-bet stake limits NOT FOUND.
- Company scale: not read from the accounts (NOT FOUND; latest accounts to 2025-05-31 exist per Companies House).

## 11. Event categories that overlap other venues

Where a price comparison could in principle exist (all H for what Spreadex lists, M for overlap judgement):
- **Politics:** US presidential election (Electoral College Votes, States Won, state winners), UK general election (seats, turnout), UK/EU/US politics generally. Overlaps Polymarket/Kalshi/Betfair/Smarkets on winner and state outcomes. Format mismatch: Spreadex quotes seat/vote totals as spreads, so it is a second-hand signal, not an arbitrage leg.
- **Sports:** football, tennis, cricket, golf, motor racing, rugby, boxing/UFC, US sports, racing. Overlaps sportsbooks and exchanges (Betfair, Smarkets, Matchbook) far better than the crypto venues, and Spreadex's sports are quoted as indices/spreads or fixed odds.
- **Specials:** TV and entertainment results; low overlap with crypto prediction markets.
- **Crypto price / macro:** Spreadex financials (spread bets, CFDs, options on shares, indices, FX, commodities) are separate regulated products (financials.spreadex.com / `/financials/`), not event contracts. Not a prediction-market overlap.

## 12. Shared liquidity

- **Sporting Index (sportingindex.com)** uses the same front-end codebase with a brand switch (`isSportingIndex()` theme class in Spreadex's bundle); common ownership/operator NOT VERIFIED (the Sporting Index page text I fetched carried no footer/legal entity). Treat as a possibly shared book; if aggregating, mark `liquidity_shared_with: sportingindex` as unverified.
- Spreadex does not source liquidity from an exchange, so it is independent of Polymarket/Kalshi/Betfair (H for "self-quoted book", M for independence of prices: bookmakers normally hedge on exchanges, so prices will track them).

## 13. Adapter notes (if ever revived)

- Today: **no adapter**. A data-only path would need a licensed feed from Spreadex (contact route: the public Sports Room/Info mailboxes on the site; not used).
- Candidate usage without integration: manual reference of AP-called US election outcomes (Spreadex uses AP) is not worth an adapter; Polymarket/Kalshi already document their own resolution sources.
- If a feed ever exists, model as `kind: bookmaker_spread`, `market_model: continuous_spread (buy/sell) | fixed_odds`, with a normaliser from spread to implied probability only for 0/100-style index markets.

## 14. Adapter priority: skip

Dead for integration purposes: no API, automation prohibited, fiat/KYC/UK-only, spread-bet format not comparable to binary outcomes, no published liquidity, and the counterparty is also the resolver. The only reason to record it is to prevent re-research and to note Sporting Index as a possible sibling.

## 15. NOT FOUND

- Public/official API, developer docs, rate limits, websocket spec (searched: `/api`, `/developers`, sitemap 576 URLs, GitHub, site footer).
- Volume, OI, handle, customer funds, turnover (searched: site, rulebooks, Customer Agreement; Companies House summary only gives filing dates).
- Spread-bet stake/loss limits; the spread-betting "charging policy" referenced in r.15.
- Crypto/stablecoin deposit support (none in Customer Agreement; banking pages not read).
- Live political prices (SPA; not probed).
- Operator/ownership of Sporting Index.
- Independent 2026 press about Spreadex (web search budget exhausted).

## 16. Open questions

1. Does a logged-out visitor see live Politics buy/sell quotes in the SPA, and is there any terms-compliant way to read them? Needs browser inspection, forbidden here.
2. Is Sporting Index the same operator/book as Spreadex?
3. Does Spreadex license price data to third parties (a "data feed" product)?
4. Complaint/ADR route for spread bets (FCA firm: Financial Ombudsman?) and fixed odds (Gambling Commission ADR). Not read.

---

## Sources

- https://www.spreadex.com/ (H, 200, regulation text, products)
- https://www.spreadex.com/sports/en-GB/spread-betting/politics (H, page copy and embedded bootstrap model; fetched 2026-10-19)
- https://www.spreadex.com/sports/en-GB/spread-betting/specials (H)
- https://www.spreadex.com/sports/get-started/sports-spread-betting/ and https://www.spreadex.com/sports/get-started/politics-spread-betting/ (M, WebFetch summaries; politics guide lastmod 2025-09-19)
- https://www.spreadex.com/sitemap and https://www.spreadex.com/robots.txt (H)
- https://spxstatic.com/docs/sports/SpreadBettingRulebook.pdf (H, effective 2026-08-28, 32 pages, rules 5, 8, Politics section)
- https://spxstatic.com/docs/sports/FixedOddsRules.pdf (H, effective 2026-08-28, 30 pages, rules 15 Maximum Payouts, 17 Specials, 18 Politics)
- https://spxstatic.com/docs/sports/SportsSpreadBettingFixedOddsCustomerAgreementRiskWarning2026.pdf (H, 34 pages: rules 2, 5, 7, 15, 16, 17, 43)
- https://www.spreadex.com/sports/terms-agreements/customer-agreements/ (H, Mobile Trading Terms (8))
- https://www.spreadex.com/sports/terms-agreements/restricted-territories/ (M, WebFetch summary)
- https://www.spreadex.com/sports/terms-agreements/ (M, index of documents)
- https://goodmoneyguide.com/trading/uk-prediction-markets/ (lead article, byline 16 Oct 2026; M)
- https://itunes.apple.com/lookup?id=865351439&country=gb (H)
- https://find-and-update.company-information.service.gov.uk/company/03720378 (M, WebFetch summary)
- GitHub repository search "spreadex" via `gh api search/repositories` (H, negative result)
- https://www.sportingindex.com/ (H for existence and shared front-end brand switch; operator not established)

## Fixtures (all <= 50 KB)

`docs/research/fixtures/spreadex/`
- `politics_page_prerender_pruned_2026-10-19.json` - site bootstrap config URLs and the menu/event-type model (pruned of HTML bodies)
- `robots_txt_2026-10-19.txt`
- `sitemap_excerpt_2026-10-19.xml` - 5 of 576 entries
- `itunes_gb_spreadex_app_2026-10-19.json`

No market or price fixture exists because no public API was found.
