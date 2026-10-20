# PrizePicks Predict and Sleeper Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public page reads, public PDFs, unauthenticated GETs (generic User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, browser automation or PayBox tool was used. No personal identifier was sent in any request.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference from first-hand data; **L** = weak/stale. "NOT FOUND (searched: ...)" where nothing was found. Two earlier single-venue notes exist (`prizepicks-predict.md`, `sleeper-markets.md` in this directory); I re-read the primary sources rather than copy them, and the conclusions agree.

Scope: the two entities are treated as one note because they are the same kind of thing: US fantasy-app brands that each own an NFA-registered FCM which intermediates retail orders into Kalshi.

---

## 0. Bottom line

1. **Both live (2026-10-19), both are front ends, not venues.** PrizePicks Predict = Performance Predictions II, LLC (FCM, subsidiary of SidePrize LLC, which runs the PrizePicks DFS app). Sleeper Markets = Sleeper Markets LLC (FCM, NFA ID 0570580, Blitz Studios brand). (H)
2. **All liquidity is Kalshi's.** PrizePicks' CFTC 1.55 disclosure (dated 2026-06-16): trades are "transmitted to the Firm for execution on a Kalshi exchange"; its launch release: "All event contracts listed on PrizePicks are Kalshi markets". Sleeper's fee disclosure: "trading on the Kalshi Exchange through Sleeper Markets LLC"; terms 7.5: "authorized by Kalshi to intermediate customer orders on their platform". **Neither is an independent arbitrage leg.** (H)
3. **No market-data API and no trade API exists for either** (customer-facing). Sleeper's public API is fantasy-football data only. (H)
4. **PayBox cannot reach either.** USD, US-resident KYC (SSN), card/bank funding, geofenced, app-only order entry, ToS bans automation. (H)
5. **Small next to Kalshi.** Customer collateral required to be segregated on 2026-10-15: PrizePicks about $1.31M, Sleeper about $1.53M (H, regulatory pages). Kalshi did roughly $73B of contracts in the 30 days to 2026-10-11 per a tracker snippet (M).
6. **adapter_priority = skip.** In the registry model them as `kind: broker_frontend`, `routes_to: [kalshi]`, no own adapter, so the Kalshi adapter is not double-counted. The only conceivable value is a retail-flow-into-Kalshi signal, and neither firm publishes anything that gives it.

---

## 1. Is it still live? (2026-10-19)

| Evidence | Date | Tag |
|---|---|---|
| PrizePicks `predict-regulatory` page shows daily Cleared Swaps Customer Collateral rows through 2026-10-15 and monthly net-capital through August 2026 | 2026-10-15 | H |
| PrizePicks help-center "Where can I play?" page header "Last updated: October 16, 2026" (its embedded state table says "Last updated: May 19, 2026"); Team and Culture rows labelled "Powered by PrizePicks Predict" | 2026-10-16 | H |
| PrizePicks newsroom lists 2026-09-24 and 2026-10-06 releases; launch release "PrizePicks Launches Prediction Markets Offering with Kalshi" dated 2025-11-14 | 2026-10 | H |
| PrizePicks FCM Disclosure Document (CFTC Reg. 1.55) dated June 16, 2026; fee schedule "as of 10/27/2025" | 2026-06-16 | H |
| Sleeper `picks/regulatory` page shows daily collateral rows 2026-01-14 to 2026-10-15 and monthly net capital Jan to Aug 2026 | 2026-10-15 | H |
| Sleeper General Terms of Use "Last Updated: October 6, 2026"; Fee Disclosure "Last Updated on: August 4, 2026"; Team Picks help articles dated August 28, 2026 | 2026-08 to 10 | H |
| Sleeper launched Kalshi-powered markets 2026-02-06 (Business Wire via Morningstar/NatLawReview; SBC Americas); NFA approval January 2026 | 2026-02-06 | M |
| Dimers comparison page (page "last updated October 16, 2026") lists PrizePicks Predict as a "CFTC FCM Routing Interface" (no exchange named) and Sleeper Markets as "CFTC Routing Interface (via Kalshi)" | 2026-10-16 | H (that it says so), M (as evidence) |

`still_live = true` for both. The discovery hint (fantasy-app front ends routing to Kalshi) is confirmed by the firms' own legal documents, not just by Dimers.

---

## 2. Kind and market model

- **Kind (H):** broker / front end. PrizePicks FCM "provides execution, clearing, and settlement services for event contracts" and "does not provide services with respect to daily fantasy sports" (those are SidePrize LLC). It is "a clearing member of Kalshi Klear and a member of KalshiEx LLC" (Disclosure s.4). Sleeper Markets LLC is "a member of KalshiEX LLC" and clears as a member of Kalshi Klear (terms 7.5, 7.13; risk disclosure). Sleeper's regulatory page: customers "contract directly with Sleeper Markets LLC, not Blitz Studios, Inc."
- **Market model (H):** inherited from Kalshi. Binary Yes/No event contracts, price $0.01 to $0.99, $1.00 settlement, fully collateralised, no margin; order book is Kalshi's CLOB. Sleeper terms 6.2-6.4; PrizePicks Risk Disclosure ("Event contracts cannot be sold or transferred to another DCM"; exit only by selling or holding the offsetting Yes/No). Whole contracts only, at least one per transaction (Sleeper "Entering Sleeper Team Picks"; PrizePicks help). Sleeper notes non-$1 settlement cases (event cancelled -> last fair market value; ties -> adjusted payout), i.e. Kalshi's rules apply.
- **Categorical / scalar:** none documented at either firm. Categorical Kalshi events appear as sets of binary contracts. (M)
- **Tokenisation (H):** none. A position is a ledger row in an FCM sub-account at Kalshi Klear. No transfer, no token.
- **Order-entry UX:** both are "pick side, enter dollar amount, confirm". The app converts dollars into whole contracts. Tickers/ids are not exposed in anything I could read (apps need login). The natural key is the Kalshi ticker; mapping must be built from the Kalshi side. (M)
- **Combo products are not extra venues.** PrizePicks "Team & Player Lineups" / "Combination Trades": the Risk Disclosure (s.3.6) says a Combination Trade is "both an event contract transaction in your Event Contract Account and a DFS position in your DFS account", where winning event-contract proceeds fund the DFS leg. So the hedgeable leg is still a single Kalshi contract; the DFS leg is a separate, non-hedgeable product. (H) Sleeper: "Team Picks must currently be submitted as one pick per entry" (FAQ 2026-08-28). (H)

---

## 3. Chains and collateral

- **No blockchain, USD only (H).** PrizePicks: the Event Contract Account is funded only from the PrizePicks Account; deposits for Team/Culture Picks by debit card, instant bank transfer, Apple Pay (help-center/deposits). Sleeper: customer funds sit in a Cleared Swaps Customer Account under CFTC Reg. 22.2 / CEA s.4d(f) segregation at US banks (terms 6.12; regulatory page).
- **Crypto adjacency (H, Sleeper only):** Sleeper's terms s.4 describe a Zero Hash (licensed MSB) fiat-to-crypto and crypto-to-fiat service. Digital assets converted via Zero Hash become USD "held by Zero Hash and then transferred to your Sleeper Wallet"; Sleeper "does not control, hold, or custody any digital assets". This is a KYC'd individual's off-ramp into a USD wallet, not an on-chain rail into the Markets account and not usable by an agent wallet. PrizePicks: crypto NOT FOUND (searched: deposits and withdrawals help pages, customer agreement, risk disclosure for "crypto", "digital asset", "stablecoin").

---

## 4. Read API

**Verdict: `exists = none`** for market data at both firms.

| Surface | PrizePicks Predict | Sleeper Markets |
|---|---|---|
| Official docs | NOT FOUND (searched: prizepicks.com sitemap and nav, `/predict-regulatory` pages, help center; no developer portal) | `https://docs.sleeper.com/` covers only User, Avatars, Leagues, Drafts, Players, Errors: fantasy data. Zero mention of markets, contracts, prices or trading. (H) |
| Public host | `https://api.prizepicks.com/` returns HTTP 403 `{"error": "PrizePicks is currently unavailable in your location."}` to an unauthenticated GET from this machine (H). Third-party scrapers use that host for DFS Player Picks projections, not Team/Culture event contracts (L, not read) | `https://api.sleeper.app/v1` is public and read-only; "stay under 1000 API calls per minute"; free for non-commercial use, commercial use needs licensing (H, docs.sleeper.com). Fixture `sleeper_fantasy_api_state_nfl_NOT_MARKET_DATA.json` proves it is fantasy state only. |
| Prices / books / trades / resolution | NOT FOUND | NOT FOUND (searched: docs.sleeper.com, support.sleeper.com Team Picks articles and FAQs, terms, regulatory page) |
| WebSocket | NOT FOUND | NOT FOUND |
| Rate limits (markets) | n/a | n/a |

What is public is regulatory, not market, data: both firms publish daily customer-collateral and monthly net-capital figures (see fixtures). No bid/ask, depth, volume, OI or trades.

**Where the data actually is:** every contract is a Kalshi market, so prices, depth, trades and resolution come from Kalshi's own API. From the Kalshi docs (H): REST `https://external-api.kalshi.com/trade-api/v2` (alias `https://api.elections.kalshi.com/trade-api/v2`), WebSocket `wss://external-api-ws.kalshi.com/trade-api/ws/v2`; docs index https://docs.kalshi.com/llms.txt lists FCM-member endpoints (`List/Create FCM Subtraders`, `Get FCM Orders/Fills/Positions`, `Create FCM Position Transfer`, `Create Subtrader-Bound API Key`, daily event-contract cap, blocked categories). Those are for the FCM operating retail sub-accounts at Kalshi; the FCMs' retail customers do not get them, and which of them PrizePicks or Sleeper uses is M (inferred from the disclosures, not stated). See the Kalshi venue note for the market-data adapter.

---

## 5. Trade path

**None for an agent.** Orders are "entered by the client on a personal mobile device or computer" in the app (PrizePicks Disclosure s.4). Auth/signing scheme: NOT FOUND (no public API, so no scheme to document). Constraints that matter if anyone tried to automate (all H):

- PrizePicks Customer Agreement s.14: "all Event Contract orders placed through the Firm must be limit orders. The price on such orders cannot exceed 5% over (or under) the current market price... If orders cannot be filled when placed, the orders will expire unfilled shortly thereafter. Partial fills of an order are not permitted." s.20: execution method "in the sole discretion of the Firm"; orders may be reviewed and delayed or declined.
- Sleeper: limit vs market orders NOT FOUND (searched: Entering Team Picks, FAQs, terms s.6). Help text says an order may not fill and cash-out may be unavailable if there are no buyers.
- Both bar automation (section 9).

---

## 6. PayBox reachability

**paybox_reachable = no.** There is no chain, token, transaction proposal or EIP-712 order at either firm, so an EVM or Solana wallet reachable through PayBox (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) has nothing to sign or send. Funding is a US debit card or bank link in a KYC'd US resident's name (SSN, geolocation); Sleeper's Zero Hash route (section 3) is a human-KYC'd off-ramp into USD, not a path for an agent wallet to place orders. An agent wallet could trade the same contracts only by going to Kalshi directly (see the Kalshi note for that route's own constraints), never through these two. (H)

---

## 7. Fees (H)

| | PrizePicks Predict | Sleeper Markets |
|---|---|---|
| Source | `/predict-regulatory/fee-schedule` (PDF "as of 10/27/2025") | support.sleeper.com Fee Disclosure, "Last Updated on: August 4, 2026" |
| Firm fee | $0.005 per contract at 1c, $0.010 at 2c, $0.015 at 3c, $0.020 for every price 4c to 99c; per contract, per side (opening or closing); total rounded **up** to the nearest cent | $0.01 per executed contract |
| Exchange fee | Not stated whether Kalshi's fee is inside the commission or extra. The schedule says the account is also charged "all fees ... imposed by any third party, including ... any applicable DCO". NOT FOUND (searched: fee schedule, customer agreement, risk disclosure, help center) | $0.01 per executed contract, charged by Kalshi, "passed through without markup" |
| Total | commission only is known: flat 2c/contract from 4c up (about 4 bps of notional at 50c) | $0.02 per executed contract, per side; promotional schedule A: fee = 0.02P + 0.02004P(1-P) per contract, never above $0.02 |
| Paid by | customer; added to cost on a buy, subtracted on a sell; no fee on settlement payout | customer, per side, executed trades only; no platform, inactivity or margin fees |
| Other | $1 minimum purchase; firm may vary rates by customer and change without notice | 15 days' notice before any increase |

Conflict of interest (H, PrizePicks Disclosure s.4 and Customer Agreement s.12): an affiliate, Performance Predictions III LLC, is a market maker on the DCMs "including in the same contracts and the same markets", may "take the opposite side of customer orders", and may get preferential terms (reduced or rebated exchange fees). Expect adverse selection against retail flow. Sleeper: terms 7.5 says it will not engage in proprietary trading for its own account (H).

Implication for the aggregator: any PrizePicks or Sleeper price is a Kalshi price plus about 2c per contract per side, plus the 5% limit collar at PrizePicks. A gap between "their" price and Kalshi's is a fee artefact, not edge.

---

## 8. Resolution mechanism and dispute risk

- **Resolution is Kalshi's (H).** PrizePicks Risk Disclosure: the outcome "will be determined and reported by the entity designated to determine the outcome of the event (i.e., the reporting party)", then Kalshi Klear settles at $1.00 or $0. Sleeper Risk Disclosure: outcomes depend on events "reported by third party Source Agencies". Per-contract rules are Kalshi's; neither firm resolves. Resolution risk therefore equals the Kalshi note's, including source-agency and ambiguity risk.
- **Firm-level extra risks (H):** (a) PrizePicks Disclosure s.6: sports contracts "may not be available in a particular state or jurisdiction or may cease to be available" and an open position "may be liquidated in the Firm's sole discretion"; (b) FCM failure, hardware or software failure, bids not accepted (Sleeper risk disclosure); (c) trading halts are Kalshi's call; (d) PrizePicks: disputes go to arbitration (separate Arbitration Agreement); Sleeper: arbitration and a 180-day claim limitation period in the terms. The CFTC has not approved the listing of sports contracts (Disclosure s.6: "has not... taken any official action to approve").
- Void / dispute behaviour beyond Kalshi's rules: NOT FOUND.

---

## 9. Geo, ToS, automation

- **US only (H).** PrizePicks: "All event contract customers must be U.S. residents and 18+" (higher in some states). Sleeper Markets "operates only in the United States" (terms 7.2); Team Picks 18+ ("For all Team Picks states, you must be 18+").
- **State availability is not reliable (M).** PrizePicks: launch 2025-11-14 in 38 states + DC (H, release); a trade report says 48 states with sports contracts in 30 + DC (M, Gambling Insider via search snippet, undated); the live where-can-i-play page carries two different "last updated" dates and its headline counts conflicted with its own lists in an earlier read (not re-verified here). Sleeper: no official state list; "available in most US states" (H, sleeper.com/picks); reviews claim all 50 (L). Check the app per state before relying on any list.
- **Automation is prohibited (H).**
  - PrizePicks Customer Agreement s.27: "with the exception of a web browser and other applications specifically approved by the Firm in writing, you will not use (or allow another person to use) any software, program, application, or other device, directly or indirectly, to access or obtain information through the Platform or to automate the process of accessing or obtaining such information."
  - Sleeper terms s.11: no crawling or scraping, no "automated means, bot, script"; 11.3: "No third-party is authorized to access... through any account, credential, or authentication mechanism belonging to a user" without a separate written agreement. Handing credentials to a third party is explicitly not authorisation.
- VPN/geolocation evasion is a violation (PrizePicks help-center/vpn; not re-read this session, L).
- Marketing/ToS reading: do not scrape either app or drive it with a bot. The compliant way to see these contracts is Kalshi's public data.

---

## 10. Liquidity (dated)

| Metric | PrizePicks Predict | Sleeper Markets | Tag |
|---|---|---|---|
| Collateral **required to be segregated** (best size proxy) | $1,309,207 on 2026-10-15; 100 reporting days from 2026-05-29: min $0.48M, median $1.28M, max $4.88M (2026-06-30) | $1,531,927 on 2026-10-15; 195 reporting days from 2026-01-14: median $0.98M, max $1.57M (2026-06-24) | H |
| Collateral **held in segregation** (includes firm money) | $14,424,648 on 2026-10-15 | $10,536,711 on 2026-10-15 | H |
| Firm net capital | $21.4M (Aug 2026), $28.8M (Jun), $29.6M (Nov 2025) | $11.98M (Aug 2026), $12.2M (Jul), $5.7M (Jan 2026) | H |
| Volume, OI, trade counts | NOT FOUND (searched: regulatory page, newsroom, help center, news). Release 2026-02-10: Big Game Sunday brought "a 45% increase in trading volume", relative only | NOT FOUND (searched: regulatory page, support center, news) | H |
| Network context | Kalshi about $73B contracts traded 2026-09-12 to 2026-10-11 (defirate tracker snippet) | same | M |

Reading: "required to be segregated" approximates customers' funded event-contract balances (cash plus position cost); it is a size proxy, not open interest. Both are roughly $1M to $2M, a rounding error against the exchange behind them. Sleeper's series shows the launch: required collateral went from $66K on 2026-02-06 to $651K on 2026-02-09 (H, fixture). Dune/other trackers' "Predict" figures cannot be attributed to PrizePicks (L).

---

## 11. Event overlap and shared liquidity

- **Shared liquidity: yes, 100% with Kalshi (H).** Every PrizePicks Predict and Sleeper Team Picks price is a Kalshi order-book price (plus fees, plus PrizePicks' 5% collar and possible affiliate internalisation). That makes both **duplicates of Kalshi** for edge-finding.
- **Categories (all Kalshi's):** PrizePicks Team Picks = game winners, spreads, totals, futures (NFL, NBA, UFC, boxing and more); Culture Picks = awards, music charts, entertainment, politics, economics (H, release and help pages). Sleeper Team Picks = sports only (game winner, spreads, totals) per its pages and reviews; Sleeper's own pages do not say non-sports is unavailable, but "more real-world markets to come" had not materialised in third-party reviews (M). These overlap sports/politics venues, but the overlap is via Kalshi, not independent of it.
- **PrizePicks + Polymarket (M):** a multi-year partnership was announced 2025-11-11 (PRNewswire release read via fetch: "soon-to-launch", tied to Polymarket's "anticipated re-entry into the U.S. market", no date, no exchange named). No 2026 source I found shows it live; the 2026-06-16 FCM disclosure and the Oct 2026 help pages name only Kalshi, and no page I read mentions Polymarket (H for absence on the pages read). If it launches it would route to Polymarket US liquidity and still be an alias of that venue, not a leg of its own. Re-check the Disclosure Document for a second exchange name before changing the classification.
- **Only independent PrizePicks prices** would be the DFS "Player Picks" projections and fixed-multiplier lineups. Not event contracts, not tradable by us, no API; at most a soft signal for player props (L).

---

## 12. Adapter recommendation

- **adapter_priority: skip.** No API, no independent liquidity, no reachable trade path, small size.
- Registry entry: `kind: broker_frontend`, `routes_to: kalshi`, `independent_liquidity: false`, `tradable_via_paybox: false`, `read_api: none`.
- Scanner behaviour: never emit a PrizePicks-vs-Kalshi or Sleeper-vs-Kalshi spread as an arbitrage; they are the same book.
- If a future signal is wanted: the only public number is the daily required-to-be-segregated collateral on each firm's regulatory page (scrapable HTML/embedded JSON, daily cadence, small). It correlates with retail activity but not with any specific contract. I do not recommend building on it; the page terms and ToS above still apply to the firm's app, not to its public regulatory page, but treat it as P2-or-lower.

---

## 13. Fixtures (`docs/research/fixtures/prizepicks-predict-and-sleeper-markets/`)

There is no market-data API response to capture. Saved instead (all public, all small):

- `prizepicks_fcm_collateral_and_net_capital.json`: 100 daily rows and 14 monthly net-capital rows parsed from `https://www.prizepicks.com/predict-regulatory` (2026-10-19). Regulatory data, not market data.
- `sleeper_fcm_collateral_and_net_capital.json`: 195 daily rows (2026-01-14 to 2026-10-15) parsed from the JSON embedded in `https://sleeper.com/picks/regulatory`, plus monthly net capital.
- `fee_schedules_extract.json`: both firms' fee terms as read.
- `sleeper_fantasy_api_state_nfl_NOT_MARKET_DATA.json`: `GET https://api.sleeper.app/v1/state/nfl` (HTTP 200, 211 bytes), shows the one public Sleeper API is fantasy-football state.

---

## 14. Not found

- Any official or public market-data API, WebSocket, order API, SDK or developer docs for PrizePicks Predict or Sleeper Markets (searched: prizepicks.com sitemap/nav/help center, docs.sleeper.com, support.sleeper.com, both regulatory pages, Dimers, web search).
- Contract tickers/ids exposed by either app (apps need login; not tried).
- Open interest, volume, trade counts, fill statistics for either firm.
- Whether PrizePicks' commission includes Kalshi's exchange fee.
- Limit vs market order types at Sleeper.
- Evidence that PrizePicks' Polymarket route is live in 2026.
- Official Sleeper state list; a reliable current PrizePicks state list.
- Any crypto deposit rail for PrizePicks.

## Provenance note

PrizePicks' legal documents (fee schedule, customer agreement, risk disclosure, regulatory disclosure) are embedded in the regulatory pages as PDFs served from an anonymously named third-party host (`dainty-kleicha-6ab032.netlify.app`) via an iframe PDF viewer. I read the PDFs only as text data; no instructions or AI-directed text were found in any page or PDF. The odd hosting is worth knowing if you ever cite those URLs, since they could change without PrizePicks' website changing.

## Sources

PrizePicks (all H unless noted):
- https://www.prizepicks.com/press-news/prizepicks-launches-prediction-markets-offering-with-kalshi (2025-11-14)
- https://www.prizepicks.com/predict-regulatory (collateral and net capital, through 2026-10-15)
- https://www.prizepicks.com/predict-regulatory/fee-schedule (PDF at https://dainty-kleicha-6ab032.netlify.app/pdfs/fee-schedule.pdf)
- https://www.prizepicks.com/predict-regulatory/customer-agreement (PDF /pdfs/customer-agreement.pdf: s.12, s.14, s.20, s.27)
- https://www.prizepicks.com/predict-regulatory/risk-disclosure (PDF /pdfs/risk-disclosure.pdf)
- https://www.prizepicks.com/predict-regulatory/regulatory-disclosure (PDF /pdfs/disclosure.pdf, CFTC Reg. 1.55, June 16, 2026)
- https://www.prizepicks.com/help-center/where-can-i-play , /help-center/deposits , /help-center/withdrawals , https://www.prizepicks.com/ways-to-pick (redirect target of /teamandculturepicks)
- https://api.prizepicks.com/ (HTTP 403 geo message)

Sleeper (all H unless noted):
- https://sleeper.com/picks/regulatory (collateral JSON, net capital, NFA ID, FCM status)
- https://sleeper.com/terms (Last Updated October 6, 2026: s.3.7, 4, 6, 7.2, 7.5, 11)
- https://support.sleeper.com/en/articles/11802148-fee-disclosure-sleeper-markets-llc (Aug 4, 2026)
- https://support.sleeper.com/en/articles/11842741-risk-disclosure-for-cleared-swaps-customers
- https://support.sleeper.com/en/articles/13557355-team-picks-faqs , https://support.sleeper.com/en/articles/13557313-entering-sleeper-team-picks (Aug 28, 2026)
- https://sleeper.com/picks (via fetch summary, M for exact wording)
- https://docs.sleeper.com/ and https://api.sleeper.app/v1/state/nfl

Kalshi (pointer only, covered by another note):
- https://docs.kalshi.com/llms.txt , https://docs.kalshi.com/getting_started/api_environments

Secondary (M/L):
- https://www.dimers.com/prediction-markets (fetch summary; page updated 2026-10-16)
- https://www.prnewswire.com/news-releases/prizepicks-partners-with-polymarket-for-prediction-markets-expansion-302611083.html (2025-11-11, fetch summary)
- Search snippets: https://www.gamblinginsider.com/news/105098/prizepicks-prediction-markets-now-available-in-48-states , https://sbcamericas.com/2026/02/06/sleeper-prediction-markets-kalshi/ , https://www.morningstar.com/news/business-wire/20260206715876/sleeper-launches-prediction-markets-powered-by-kalshi , https://defirate.com/prediction-markets/volume/kalshi/ , https://next.io/prediction-markets/sleeper-markets/
