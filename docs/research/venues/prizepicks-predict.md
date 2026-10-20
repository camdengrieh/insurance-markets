# PrizePicks Predict - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public page reads and unauthenticated GETs of prizepicks.com HTML/PDFs (UA `insurance-markets-research/0.1`), one GET of Kalshi's public docs index, GitHub search for third-party clients. No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. The WebSearch quota was already exhausted for this session, so there is no third-party news corroboration; every key claim below rests on PrizePicks' own pages and legal documents. The Legal Sports Report comparison article in the discovery hint returned HTTP 403, so it was not read.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference from first-hand data; **L** = weak/stale. "NOT FOUND (searched: ...)" where nothing was found.

Fixtures (small official-text extracts, not API responses; there is no API): `docs/research/fixtures/prizepicks-predict/` (section 13).

---

## 0. Bottom line

1. **Live, but it is a front end, not a venue.** "PrizePicks Predict" is the brand of **Performance Predictions II, LLC**, an NFA-registered FCM (a subsidiary of SidePrize LLC, which runs the PrizePicks DFS app). It sells "Team Picks" and "Culture Picks" inside the PrizePicks app. (H)
2. **All liquidity is Kalshi's.** The FCM's own CFTC 1.55 disclosure (dated 2026-06-16) says trades are "transmitted to the Firm for execution on a Kalshi exchange" and that the contracts "are executed on KalshiEx, cleared through Kalshi Klear"; the launch release says "All event contracts listed on PrizePicks are Kalshi markets". **Not an independent arbitrage leg.** (H)
3. **The Polymarket integration is announced but not evidenced as live.** A 2025-11-11 release announced a multi-year Polymarket partnership for the "soon-to-launch" offering. The June 2026 FCM disclosure names only KalshiEx / Kalshi Klear, and the October 2026 help pages say nothing about Polymarket. Even if it launches it would route into Polymarket's own book, so still not independent. (H for the announcement and the disclosure text; absence of a live Polymarket route is M)
4. **No API of any kind for customers.** No developer docs, no public market data, no order API. The customer agreement bars using software to access or automate the Platform. (H)
5. **PayBox cannot reach it.** US-resident, KYC'd, USD, card/bank funded, geofenced. No chain, no token, no signing. (H)
6. **Small.** Public FCM filings show customer collateral required to be segregated of about $1.3M on 2026-10-15 (range $0.48M to $4.88M over 100 reporting days since 2026-05-29). (H for the numbers, M for reading them as a size proxy)
7. **adapter_priority = skip.** Treat it in the registry as `kind: broker_frontend`, `routes_to: [kalshi]`, so the Kalshi adapter is not double counted. Revisit only if the Polymarket route goes live and is documented (still would be an alias, not a leg).

---

## 1. Is it still live? (2026-10-19)

| Evidence | Date | Tag |
|---|---|---|
| Help page "Team and Culture Picks" says "Last updated: October 16, 2026"; "Where can I play?" also "Last updated: October 16, 2026" and lists Team/Culture state availability "Powered by PrizePicks Predict" | 2026-10-16 | H |
| `predict-regulatory` page publishes a daily "Cleared Swaps Customer Collateral Report" with the latest row dated 2026-10-15 and monthly net-capital reports through August 2026 | 2026-10-15 | H |
| FCM Disclosure Document (CFTC 1.55) dated June 16, 2026; fee schedule "as of 10/27/2025" | 2026-06-16 | H |
| Newsroom: "PrizePicks Launches New Product Slate For Football Season" (2026-09-24) describes PrizePicks Predict as "a registered FCM offering Team Picks and Culture Picks as event contracts" | 2026-09-24 | H |
| Newsroom: "PrizePicks Sets Record for Prediction Markets Engagement on Big Game Sunday" | 2026-02-10 | H |
| Launch release "PrizePicks Launches Prediction Markets Offering with Kalshi", 2025-11-14 (38 states + DC at launch) | 2025-11-14 | H |
| Sitemap `https://www.prizepicks.com/sitemap.xml` homepage lastmod 2026-10-16 | 2026-10-16 | H |

Verdict: **still_live = true.** The discovery hint (launched Nov 2025, Kalshi backend, Polymarket integration planned) is confirmed by primary sources: the Kalshi launch release is 2025-11-14, the Polymarket partnership release 2025-11-11.

---

## 2. Kind and market model

- **Kind (H):** broker / front end. Performance Predictions II, LLC is "a registered FCM that provides execution, clearing, and settlement services for event contracts, which are regulated as cleared swaps" and "does not provide services with respect to daily fantasy sports" (those are SidePrize LLC d/b/a PrizePicks). It "is a clearing member of Kalshi Klear and a member of KalshiEx LLC". (FCM Disclosure s.4)
- **Market model (H):** inherited from Kalshi. Binary Yes/No event contracts, $1.00 payout or $0, price between $0.01 and $0.99, fully collateralised, CLOB at the exchange (Risk Disclosure, "Event Contract Overview"; help page: "Team picks ... offer you a choice between two outcomes", contract price "between $0.00 and $1.00"). Yes and No are "two separate and unique event contracts". Exit only by selling or by holding the offsetting position.
- **Product names:** Team Picks (game winner, spread, totals, futures such as NFL champion; NFL, NBA, UFC, boxing "and more") and Culture Picks (awards, music, movies, politics, economics, pop culture). Team Picks are described as picks on "winners, spreads, over/unders, and futures". (H, where-can-i-play page)
- **Not clearly event contracts: "combo picks".** The 2026-09-24 release says players can combine game winners, spreads and totals with DFS stat picks in one lineup and "pick multiple game outcomes all in one entry". Whether those combos are Kalshi contracts or PrizePicks' own fixed-multiplier DFS-style entries is NOT FOUND (searched: release, help center, fee schedule, FCM disclosure). Treat as non-contract, non-hedgeable product until shown otherwise. (M)
- **Whole contracts only.** "You cannot purchase partial contracts" (help page); orders are placed by entry fee, and the contract count is derived after fees. (H)
- **Outcome tokenisation:** none. Positions are rows in an FCM sub-account at Kalshi Klear. No transfer ("Event contracts cannot be sold or transferred to another DCM"). (H)
- **Tickers/ids:** NOT FOUND in any PrizePicks surface I could read (the app is not readable without login). The disclosure says contracts are Kalshi's, so the Kalshi ticker is the natural key. Mapping from PrizePicks titles to Kalshi tickers would have to be built from the Kalshi side. (M)

---

## 3. Chains and collateral

- **No blockchain (H).** USD only. The Event Contract Account "can only be funded from your PrizePicks Account", and the cash "must be cash deposited into or earned in the PrizePicks Account"; no credit-card purchases (Customer Agreement s.4). A linked PrizePicks DFS account (SidePrize LLC) is a precondition for opening an Event Contract Account.
- **Deposit rails for Team/Culture Picks (H, help-center/deposits, updated 2026-06-12):** Visa debit, Mastercard debit (eligible states), Instant Bank Transfer, Apple Pay (debit only). Venmo, PayPal and credit cards work only for Player Picks and "cannot be used to make Team or Culture Picks". Minimum deposit $10; card or bank account name must match the account name. Payments partner Aeropay (help-center/protecting-your-funds).
- **Withdrawals (H, help-center/withdrawals, 2026-06-17):** to the verified bank account (or previously used debit/Apple Pay etc.), $10 minimum, one successful withdrawal per 24 hours, 72-hour hold after a bank-transfer deposit.
- Customer funds sit in a Cleared Swaps Customer Account, i.e. CEA s.4d(f) segregation, at US banks (FCM Disclosure s.5, s.9). Crypto: NOT FOUND (searched: deposits, withdrawals, customer agreement, risk disclosure for "crypto", "digital asset", "stablecoin"; no hits).

---

## 4. Read API

**Verdict: `exists = none`** (nothing official; no public or authenticated data API for event contracts).

- Official docs: NOT FOUND (searched: `developers.prizepicks.com`, `developer.prizepicks.com`, `docs.prizepicks.com` do not resolve; `www.prizepicks.com/api` is 404; sitemap of 5,630 URLs has no developer/API page; GitHub org `prizepicks` returns 404; `/.well-known/security.txt` 404). (H)
- `https://api.prizepicks.com/` answers HTTP 403 to an unauthenticated GET (H). It is the host that third-party scrapers use for **Player Picks DFS projection lines** (GitHub search shows several unofficial scrapers, for example `mada949/PrizePicks-API`, `auroradan/PrizePicks-Prop-Finder`; L, not read). That is the DFS product, not the Team/Culture event contracts, it is undocumented, and the Customer Agreement (s.27) bars automated access. I did not probe it further.
- Public data that does exist is regulatory, not market data: the `predict-regulatory` page (HTML) publishes daily customer-collateral figures and monthly net capital (section 8, fixture `fcm-customer-collateral-and-net-capital.json`). No bid/ask, depth, volume or trades. (H)
- No websocket. No rate-limit documentation.
- **Where the data actually is:** because every contract is a Kalshi market, price, depth, trades and resolution should be read from Kalshi's own API (see the Kalshi venue note). The Kalshi docs index shows a set of "FCM member" endpoints (`List FCM Subtraders`, `Create FCM Subtrader`, `Get FCM Orders/Fills/Positions`, daily premium cap, blocked categories) which is the documented mechanism for an FCM to run retail sub-accounts at Kalshi; the FCM's retail customers cannot use these (H for the endpoints at https://docs.kalshi.com/llms.txt; that PrizePicks uses them is M, inferred from its disclosure).

---

## 5. Trade path

**None for an agent.** Orders are entered "on a personal mobile device or computer" in the PrizePicks app (FCM Disclosure s.4). Constraints that matter for any automation (all H, Customer Agreement):

- s.14 "all Event Contract orders placed through the Firm must be limit orders. The price on such orders cannot exceed 5% over (or under) the current market price. If orders cannot be filled when placed, the orders will expire unfilled shortly thereafter. Partial fills of an order are not permitted." Exit orders may need to match the lot sizes in which the position was bought.
- s.20 execution method is "in the sole discretion of the Firm"; the Firm may decline any order and some orders may be reviewed, delaying fills.
- Auth/signing scheme: NOT FOUND (no public API, so no scheme to document).

---

## 6. PayBox reachability

**paybox_reachable = no.** No chain, no ERC-20/ERC-1155/SPL token, no transaction proposal or EIP-712 order exists. Funding is a US debit card or bank link in the name of a KYC'd US resident, with geolocation checks; an agent wallet could neither fund nor sign. Automating a person's account would also breach the Customer Agreement (s.27). A PayBox plugin could at most read the regulatory page. (H)

---

## 7. Fees (H, https://www.prizepicks.com/predict-regulatory/fee-schedule, "as of 10/27/2025", and help page)

- **Commission:** $0.005 to $0.02 per contract, per side ("opening or closing a position"); total rounded up to the nearest cent. Table: 1c = $0.005, 2c = $0.010, 3c = $0.015, 4c = $0.020, and **$0.020 for every price from 4c to 99c** (flat 2c/contract, i.e. 4 bps of notional at 50c). Paid by the customer: added to the entry fee on a buy, subtracted from proceeds on a sell. Holding to settlement incurs no fee on the payout. The $1 minimum purchase applies.
- **Third-party fees:** the Customer Agreement says the account is also charged "all fees ... imposed by any third party, including ... any applicable DCO". Whether Kalshi's own trading fee (a price-dependent formula on Kalshi's schedule) is on top of the PrizePicks commission, absorbed into it, or rebated, is NOT FOUND (searched: fee schedule, help center, customer agreement, risk disclosure). Do not model PrizePicks all-in cost without a first-hand order-ticket screenshot.
- The Firm "reserves the right to vary its rates and fees among customers" and can change fees without notice.
- **Conflict:** an affiliate, Performance Predictions III LLC, is a market maker on the DCMs "in the same contracts and the same markets" and may take "the opposite side of customer orders" with "preferential terms" (reduced or rebated exchange fees, enhanced data and connectivity). (Disclosure s.4; Customer Agreement s.12(q), cited as "Section 11(q)" in the disclosure documents.) Expect adverse selection against retail flow.

---

## 8. Resolution mechanism and dispute risk

- Outcome is "determined and reported by the entity designated to determine the outcome of the event (i.e., the reporting party)" in each contract's terms, then settled at $1.00 / $0 by Kalshi Klear (Risk Disclosure). The rulebook and per-contract rules are Kalshi's ("view full rules" in the app); PrizePicks does not resolve. So resolution risk equals the Kalshi note's, including its category-specific source agencies. (H for the structure, rules themselves not re-read here)
- Added PrizePicks-specific risks (H, FCM Disclosure s.6 and Customer Agreement): (a) sports contracts "may not be available in a particular state ... or may cease to be available" and a held position "may be liquidated in the Firm's sole discretion"; (b) trading halts are Kalshi's call; (c) the FCM may liquidate or limit positions at its discretion; (d) disputes with the FCM go to arbitration (Customer Agreement and a separate Arbitration Agreement, New York law).
- Dispute/void behaviour on unusual outcomes: NOT FOUND beyond the Kalshi rules.

---

## 9. Geo, ToS, automation

- **US residents only, 18+** (Team list: 19+ AL, 21+ IA and VA; Culture list: 19+ AL and CO, 21+ IL, IA, LA, MA, VA). "All event contract customers must be U.S. residents and 18+." (H)
- **State availability (H, where-can-i-play, page "Last updated: October 16, 2026"; its embedded table says May 19, 2026):** the page's headline counts disagree with its own lists (Team Picks "34 states + D.C." in one place and "33 states" in another, while the explicit list names **31 states** and no D.C.; Culture Picks "46 states + D.C." and "47 states + D.C.", while the explicit list names **45 states + D.C.**). The lists are the data. Per the explicit lists, Team Picks is absent from AZ, CO, CT, DE, IL, KY, LA, MD, MA, MI, MO, NV, NJ, NM, NY, OH, PA, TN, WA; Culture Picks is absent from AZ, FL, NV, NY, WA (the page body nonetheless names FL and NY as Culture states, another inconsistency). At launch (2025-11-14) it was 38 states + D.C.
- **VPN/geolocation:** prohibited; accounts "blocked from depositing, withdrawing, and submitting lineups" (help-center/vpn, 2026-05-16). (H)
- **Automation (H, Customer Agreement s.27, "Information Made Available Through Services"):** "with the exception of a web browser and other applications specifically approved by the Firm in writing, you will not use (or allow another person to use) any software, program, application, or other device, directly or indirectly, to access or obtain information through the Platform or to automate the process of accessing or obtaining such information." Also personal use only, and the information may not be republished. So scraping the app or driving it with a bot is a ToS breach.
- KYC/CIP at account opening; Event Contract Account is tied to a PrizePicks Account; fiduciary/advice disclaimers; responsible-gaming limits apply.

---

## 10. Liquidity (all dated)

| Metric | Value | Date | Tag |
|---|---|---|---|
| Cleared swaps customer collateral **required to be segregated** | $1,309,207 | 2026-10-15 | H |
| ... **held in segregation** (includes firm residual interest) | $14,424,648 | 2026-10-15 | H |
| Required-to-be-segregated, min / median / max over 100 reporting days | $0.48M (2026-07-23) / $1.28M / $4.88M (2026-06-30) | 2026-05-29 to 2026-10-15 | H (computed from fixture) |
| FCM net capital | $21.4M (Aug 2026); $28.8M (Jun); $29.6M (Nov 2025) | monthly | H |
| Big Game Sunday 2026: prediction-market trading volume | "a 45% increase in trading volume" (release also says engagement "more than doubled" the previous high); no absolute number published | release dated 2026-02-10 (event date 2026-02-08, inferred) | H (relative only) |
| Open interest, contract volume, trades | NOT FOUND (searched: predict-regulatory, newsroom, help center; no public report) | | |

Reading: "required to be segregated" approximates what customers hold in the event-contract account (cash plus position cost). It is a size proxy, not OI. On these numbers PrizePicks Predict is a small account base next to the exchange behind it; I did not pull Kalshi's volume or OI here, so no ratio is claimed. (M)

---

## 11. Event overlap and shared liquidity

- **Categories that overlap other venues (H as to what is sold, since all are Kalshi markets):** pro and college sports (game winner, spread, total, futures; NFL, NBA, UFC, boxing), plus Culture: awards (Oscars, Album of the Year), halftime-show and entertainment props, elections and politics, economics, crypto price ("Bitcoin's price" appears in a small-model summary of the homepage, M).
- **Shared liquidity: yes, with Kalshi (H).** Every price on PrizePicks Predict is a Kalshi order book price; PrizePicks adds a commission and a 5% limit-price collar, and possibly internalisation by an affiliate market maker (permitted by Customer Agreement s.12(q)). That makes it a **duplicate** of Kalshi for edge-finding: a spread between PrizePicks Predict and Kalshi is not an arbitrage, only a stale-quote or fee artefact.
- **Possible future Polymarket route (M):** announced 2025-11-11; if live, it would route into Polymarket US liquidity. Check the disclosure document and the app for a second exchange name before changing the classification.
- The only potentially independent PrizePicks prices are the DFS "Player Picks" lines and fixed-multiplier combo entries. Those are not event contracts, are not tradable by us, and have no API; useful at most as a soft-line signal for player props. (L)

---

## 12. Adapter recommendation

- **adapter_priority = skip.** Reasons: duplicate Kalshi liquidity; no API; ToS prohibits automation; fiat/KYC only; small size.
- Registry entry to add: `slug prizepicks-predict`, `kind: broker_frontend`, `routes_to: [kalshi]`, `status: live`, `geo: US residents, per-state lists`, `data: {public_api: false, live_orderbook: false}`, `shared_liquidity: [{target: kalshi, relation: broker_for, evidence_url: https://www.prizepicks.com/predict-regulatory/regulatory-disclosure, confidence: H}]`.
- Do not build a scraper. If someone wants PrizePicks-specific pricing, the compliant route is manual observation in the app or a partnership.

### Open questions
1. Is the Polymarket route live in 2026? (Disclosure of 2026-06-16 says Kalshi only.)
2. Is Kalshi's trading fee passed through on top of the PrizePicks commission?
3. Are "combo picks" Kalshi contracts or PrizePicks-priced entries?
4. Does the affiliate market maker's flow or any internal crossing change PrizePicks prices relative to the Kalshi book?
5. Exact PrizePicks Predict contract volume and open interest (not published).

---

## 13. Fixtures (`docs/research/fixtures/prizepicks-predict/`)

| File | What | Source |
|---|---|---|
| `fee-schedule-2025-10-27.txt` | Verbatim text of the official fee-schedule PDF (commission table) | predict-regulatory/fee-schedule |
| `fcm-disclosure-2026-06-16-sections-4-5.txt` | Sections 4-5 of the CFTC 1.55 disclosure: Kalshi routing, affiliated market maker | predict-regulatory/regulatory-disclosure |
| `fcm-customer-collateral-and-net-capital.json` | 100 daily customer-collateral rows (2026-05-29 to 2026-10-15) and 12 monthly net-capital rows parsed from the page | predict-regulatory |
| `help-team-and-culture-picks-excerpt.txt` | How picks are priced, fees, whole contracts | help-center/team-and-culture-picks |
| `where-can-i-play-team-culture-states-excerpt.txt` | State lists and age limits for Team and Culture Picks | help-center/where-can-i-play |

No API response fixtures exist because there is no public read API. The company support email address in the source documents is not copied into the fixtures (they contain none).

---

## Sources

- https://www.prizepicks.com (home; WebFetch summary: FCM, Team Picks and Culture Picks, no exchange named on the page) [M, small-model summary]
- https://www.prizepicks.com/predict-regulatory (index, daily collateral report, net capital) [H]
- https://www.prizepicks.com/predict-regulatory/regulatory-disclosure (embeds PDF `/pdfs/disclosure.pdf`, dated 2026-06-16) [H]
- https://www.prizepicks.com/predict-regulatory/customer-agreement (PDF `/pdfs/customer-agreement.pdf`) [H]
- https://www.prizepicks.com/predict-regulatory/risk-disclosure (PDF `/pdfs/risk-disclosure.pdf`) [H]
- https://www.prizepicks.com/predict-regulatory/fee-schedule (PDF `/pdfs/fee-schedule.pdf`, as of 2025-10-27) [H]
- https://www.prizepicks.com/predict-regulatory/arbitration-agreement [H, skimmed]
- Note on provenance: the site embeds these PDFs from a third-party-hosted viewer domain (`dainty-kleicha-6ab032.netlify.app`, path `/pdfs/*.pdf`), not from a prizepicks.com host. Their content is consistent with the first-party help-center footers (Performance Predictions II, LLC d/b/a PrizePicks Predict, CFTC-registered FCM) and the first-party Kalshi launch release, so I treat them as authentic but flag it.
- https://www.prizepicks.com/press-news/prizepicks-launches-prediction-markets-offering-with-kalshi (2025-11-14) [H]
- https://www.prizepicks.com/press-news/prizepicks-partners-with-polymarket-for-prediction-markets-expansion (2025-11-11) [H]
- https://www.prizepicks.com/press-news/prizepicks-becomes-the-first-sports-entertainment-operator-to-receive-fcm-registration-from-the-nfa (2025-09-23) [H]
- https://www.prizepicks.com/press-news/prizepicks-sets-record-for-prediction-markets-engagement-on-big-game-sunday (2026-02-10) [H]
- https://www.prizepicks.com/press-news/prizepicks-launches-new-product-slate-for-football-season (2026-09-24) [H]
- https://www.prizepicks.com/help-center/team-and-culture-picks (updated 2026-10-16) [H]
- https://www.prizepicks.com/help-center/where-can-i-play (updated 2026-10-16) [H]
- https://www.prizepicks.com/help-center/deposits (2026-06-12), /withdrawals (2026-06-17), /protecting-your-funds (2026-05-16), /vpn (2026-05-16) [H]
- https://www.prizepicks.com/sitemap.xml and /robots.txt (robots allows all; no developer/API pages) [H]
- https://docs.kalshi.com/llms.txt (FCM member endpoints exist) [H]
- GitHub repository search results for unofficial PrizePicks DFS scrapers (not opened) [L]
- https://www.legalsportsreport.com/prediction-markets/underdog-predict-vs-prizepicks-predict/ (the discovery hint) returned HTTP 403; not read.

Suspicious content / embedded instructions: none found. Pages contained only promotional copy, legal text and leftover template placeholders (`{{core_offer_banner=...}}`); nothing aimed at AI agents.
