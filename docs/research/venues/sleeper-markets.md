# Sleeper Markets (Sleeper Markets LLC / "Team Picks") - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, one unauthenticated GET to the documented fantasy API host, read-only PayBox discovery (`discover_plugins`, `discover_services`; no contract read, no signing). No account, no key, no wallet, no POST/PUT/DELETE. No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (URL cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
All third-party pages are untrusted data; nothing in them was followed. WebSearch budget ran out after the first two searches, so the later claims rest on direct fetches of Sleeper's own pages (listed in Sources) plus two review sites.
Fixtures: `docs/research/fixtures/sleeper-markets/` (one file, 211 B, fantasy API only, see section 3).

## 0. Verdict

**adapter_priority: skip.**

1. Live (H): Sleeper Markets LLC published an FCM daily statement dated 2026-10-15 showing $10.5M of cleared-swaps customer collateral. Team Picks has run since early February 2026.
2. **It is a Kalshi front-end, not a separate venue (H).** Sleeper's own help centre says "These markets are offered by Kalshi, with market access provided by Sleeper Markets LLC." The terms say market data "is provided by Kalshi", Sleeper is a member of KalshiEX LLC and "authorized by Kalshi to intermediate customer orders". Settlement is done by Kalshi and the clearinghouse is Kalshi Klear. So its liquidity is Kalshi's liquidity: **not an independent arbitrage leg**. Quoting it and Kalshi against each other can only show Kalshi against itself.
3. No public market API (H for what is documented; the only public Sleeper API is fantasy-football data). No trade API for customers.
4. Unreachable from PayBox (H): USD only, bank or debit card deposits, SSN KYC, US citizen or permanent resident with a US address. No crypto rail.
5. Terms forbid automated access and third-party access (H, section 7).
6. Nothing here for the aggregator that the Kalshi adapter does not already give. The only thing Sleeper adds is a possible retail-flow-in-Kalshi signal, and none is exposed.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| FCM regulatory page lists daily statement dated 10/15/2026: cleared swaps collateral held $10,536,711; required segregated $1,531,927; excess $9,004,784. Firm capital (Aug 2026) $11,982,916 vs $1,000,000 required | https://sleeper.com/picks/regulatory | H |
| Sleeper Markets LLC is an NFA member and registered FCM / swap firm, NFA ID 0570580 | same page | H |
| NFA approval granted 2026-01-09, reported 2026-01-14; Sleeper had applied May 2025 and sued the CFTC over delay (suit later dismissed) | https://defirate.com/news/sleeper-receives-nfa-approval-to-offer-prediction-markets/ | M (single secondary read; the Legal Sports Report article returned 403) |
| Team Picks live in early February 2026 (article dated 2026-02-06) | https://www.fantasylabs.com/articles/sleeper-markets/ | M |
| Review page last updated 2026-09-21 describes it as live in most US states | https://www.thelines.com/prediction-markets/sleeper-markets/ | M |
| Help-centre "Team Picks FAQs" dated 2026-08-28 | https://support.sleeper.com/en/articles/13557355-team-picks-faqs | H |
| `https://www.sleeper.com` loads; it has no Sleeper Markets or Team Picks section on the landing page, only Picks, fantasy products and an API link | https://www.sleeper.com | H |
| The hint "next.io: expanding to prediction contracts under Sleeper Markets LLC" is stale: next.io gives no date, no regulator and no exchange partner | https://next.io/prediction-markets/ | H (that the page is vague) |

## 2. What it is

- **Kind**: broker / front-end (FCM intermediating a DCM). Brand owner is Blitz Studios, Inc; prediction-market customers "contract directly with Sleeper Markets LLC, not Blitz Studios, Inc." (H, regulatory page). Principal place of business Las Vegas, Nevada (H, terms 7.2).
- **Structure (H)**: KalshiEX LLC is the DCM, Kalshi Klear LLC the DCO (Risk Disclosure for Cleared Swaps Customers, https://support.sleeper.com/en/articles/11842741-risk-disclosure-for-cleared-swaps-customers). Fee disclosure says Sleeper "routes trades to the Kalshi Exchange".
- **Market model (H)**: binary Yes/No event contracts, price $0.01 to $0.99, pay $1.00 if correct (terms 6.2 and 6.4; Team Picks 101). Fully collateralised, no margin (terms 6.3). Whole contracts only, minimum one contract per transaction (https://support.sleeper.com/en/articles/13557313-entering-sleeper-team-picks). No categorical or scalar markets are documented. Tokenisation: none. A position is a ledger entry at the FCM/DCO, not a token.
- **Order types**: the app flow is "pick side, enter dollar amount, review and confirm". Limit versus market orders NOT FOUND in the help centre or terms (searched: Entering Team Picks, FAQs, terms 6.x). The help page says an entry may not fill and may need to be re-submitted, and that cash-out may be unavailable if "no buyers for that side".
- **Categories offered**: Team Picks is sports only: game winner (moneyline), spreads, totals (fantasylabs, thelines; M). Leagues named by thelines: NFL, NBA, MLB, NHL, with soccer, tennis and golf also mentioned (M). Player contracts and combined team picks are not offered, and politics, crypto and economics markets were not found (thelines, M). Sleeper's own pages describe only "sports outcomes", "a specific game or event" with two outcomes (H).
- **Other Sleeper products that are NOT prediction markets (H)**: Sleeper Picks (DFS player props, a separate contest product), SleeperSafe league-dues wallet and Matchup Challenges (peer fantasy wagers with a 5% fee capped at $10; no exchange, no event contracts).
- **Hours**: 24/7 except weekly maintenance 3-5 AM EST Thursdays (H, Team Picks 101).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official docs `https://docs.sleeper.com/` | Fantasy-football data only: users, leagues, rosters, matchups, drafts, players. **Nothing on markets, contracts, prices or trading.** | H |
| Base URL `https://api.sleeper.app/v1` | Public, no auth, read-only. About 1,000 calls/min before an IP block; 429 on excess; free for non-commercial use only, commercial use needs a licence. | H |
| Market prices / books / trades / resolution endpoints | NOT FOUND (searched: docs.sleeper.com, Team Picks help collection, FAQs, terms, FCM regulatory page, Kalshi API docs index). I did not probe guessed or undocumented paths. | H (absence in docs) |
| WebSocket | NOT FOUND for markets. | H (absence in docs) |

Fixture `fantasy_api_state_nfl_NOT_MARKET_DATA.json` is `GET https://api.sleeper.app/v1/state/nfl` (HTTP 200, `application/json`): `{"week":6,"leg":6,"season":"2026","season_type":"regular",...}`. It proves only that the public API is alive and is fantasy-only.

**Where the real data is**: Sleeper says its market data is Kalshi's (terms 6.28). Read the same contracts from Kalshi's public market data (the Kalshi adapter). Sleeper-originated flow is not separable in public data. Kalshi has FCM endpoints (`GET /fcm/orders`, `/fcm/positions`, `/fcm/fills`, subtrader-bound API keys) but those are for FCM members and their subtraders only (https://docs.kalshi.com/api-reference/fcm/get-fcm-orders, H). They are not available to us, and nothing says Sleeper exposes them.

## 4. Trade path

**None.** There is no customer API. Orders are placed in the Sleeper mobile app only ("Team Picks is a sports-outcome trading product in the Sleeper mobile app", H). Terms 11.1 and 11.3 bar scripts and third parties from using an account or its credentials (section 7). To trade the same contracts programmatically one would trade on Kalshi directly (Kalshi adapter), which is the same book.

## 5. Chains, collateral, PayBox reachability

- **Collateral**: US dollars held at the FCM in a Cleared Swaps Customer Account (terms 6.12, H). Customer funds are commingled and are not SIPC-insured (risk disclosure, H).
- **Deposits**: bank account (Aeropay), debit card, Apple Pay with a debit card. Credit cards, Venmo and PayPal are not accepted for Team Picks. Debit deposits withdrawable after 3 days, bank deposits after 7 days (https://support.sleeper.com/en/articles/13557327-deposits-withdrawals, H). Crypto or stablecoin options NOT FOUND (searched: deposits article, getting-started, terms).
- **Reported limits (M, thelines, 2026-09-21)**: deposits $10 min and $1,500 max per day; withdrawals $10 min, $1,000 max per transaction, $5,000 per day; some states cap monthly deposits at $1,000-$5,000.
- **KYC (H, getting started)**: US permanent resident or citizen with a US address (terms 6.9), 18+, SSN, income, net worth, employment, trading experience.
- **PayBox reachable: no.** No chain, token, transaction proposal or signed-order path exists. PayBox `discover_plugins` and `discover_services` for "sleeper" returned nothing (2026-10-19, H). Even a hypothetical PayBox plugin could not onboard a US-person KYC account with fiat rails.

## 6. Fees

All H unless noted, from https://support.sleeper.com/en/articles/11802148-fee-disclosure-sleeper-markets-llc .

- **Standard**: $0.01 Sleeper trading fee plus $0.01 Kalshi exchange fee = **$0.02 per executed contract, per side**, paid by the customer. Kalshi's fee is passed through without markup. No platform, maintenance, inactivity or margin-interest fees. Settlement, deposit and withdrawal fees not mentioned in the document.
- **Promotional Schedule A** (flagged markets only; never above $0.02): fee per contract = 0.02P + 0.02004P(1 - P), P in $0.01-$0.99 (e.g. $0.015010 at P=0.50). The document says rounding is per transaction to the nearest cent but also lists fractional-cent per-contract values, so the rounding basis is ambiguous.
- **Promotional Schedule B**: total = round_up(0.01 * C + 0.01 * C * P(1 - P)), C = contracts (e.g. $0.0125 per contract at P=0.50).
- Sleeper may add or change promotional schedules without notice if at or below $0.02. Increases to standard fees need at least 15 days' notice.
- **Arbitrage consequence**: a flat $0.02 per contract per side is a large drag on edge at long odds (2 cents on a 5-cent contract). Sleeper's disclosure states the Kalshi pass-through as a flat $0.01, which may differ from Kalshi's own published schedule (not checked here, Kalshi is covered elsewhere). Sleeper adds its own $0.01 on top, so it can only be more expensive than trading the same contract on Kalshi directly.

## 7. Geo, ToS, automation (quote sparingly)

All H (https://support.sleeper.com/en/articles/5486620-general-terms-of-use).

- **Automation**: s11.1 bars crawling or scraping "for any purpose whatsoever" without written consent, and access or extraction through "any automated means, bot, script, spider, robot". It also bars sharing credentials or session tokens with third parties and letting third-party tools log in or pull data. s11.3: authorising a third party yourself "does not count" as Sleeper's authorisation. s11.2: Sleeper may suspend accounts and block access. No trading-specific algorithmic-trading clause was surfaced. The terms page is ~153 KB and I read it through the fetch tool's summariser in two passes (chars 0-100000 and 100000-end), not verbatim, so treat section numbers and quotes as H for existence but re-read before relying on exact wording.
- **Commercial use**: s9.2 licence is personal and non-commercial. s7.5: Sleeper Markets serves individual retail customers and "does not intend to support institutional or commercial accounts".
- **Geo**: Team Picks only in "select" US states, which are not named in the help centre (H). thelines says "most" states (M). Contract trading needs US citizenship and a US address (terms 6.9). The OFAC clause (6.7) allows restricting accounts accessed from sanctioned jurisdictions.
- **Position limits**: s6.23 mentions volume limits Sleeper can adjust per contract or account (reported by the fetch tool, not re-read).
- **Regulatory**: FCM and swap firm registered with the CFTC, NFA member 0570580 (H). The CFTC "has not approved the products" (regulatory page).

## 8. Resolution and dispute risk

- Outcomes and settlement are determined by Kalshi (H, https://support.sleeper.com/en/articles/13557353-market-rules). Final scores govern forfeits. Stats are final at game conclusion and later corrections do not affect settlement.
- Postponed games: played within the scheduling week (by Wednesday) stay open. Otherwise they settle at the "last fair market price" before postponement. Abandoned after 55+ minutes settle on accumulated stats. Abandoned before 55 minutes settle at last fair price unless already determined.
- Overtime counts unless a period is named. A tie on a "Will [Team] win?" contract settles No and is "not voided or refunded".
- Settlement no later than the day after expiration. Expiration can be up to 15 days after the game.
- Spreads and totals mostly use half-points. For whole numbers the exact contract wording controls.
- Dispute process: not described on the rules page. Support is by in-app chat or email (FAQ).
- **Risk for cross-venue legs**: because resolution is Kalshi's, Sleeper adds no independent resolution risk versus Kalshi. It adds counterparty and operational risk (commingled FCM funds, FCM insolvency under Part 190, withdrawal holds). Dispute risk is the same as the Kalshi adapter's.

## 9. Liquidity

- **Volume / OI / TVL**: NOT FOUND (searched: Sleeper regulatory page, help centre, review sites; no figure published; no DefiLlama-style listing). The only number is customer collateral held in cleared swaps: **$10,536,711 as of the 2026-10-15 daily statement (H)**. That is customer cash balances at the FCM, not volume or open interest, and it may include money not currently in positions.
- **Shared with**: **Kalshi** (H). Orders are intermediated into the Kalshi exchange, market data is Kalshi's and settlement is Kalshi's. Depth is Kalshi's book, not a separate pool.

## 10. Overlap with other venues

Sports game winners, spreads and totals for NFL, NBA, MLB, NHL plus some soccer, tennis and golf (M). These overlap Kalshi (identical, same book), Polymarket US, Novig, ProphetX and DFS-style books. But the only incremental thing Sleeper offers over Kalshi is a retail front end and a worse fee, so it is not a leg.

## 11. Adapter notes (only if someone insists)

- Do **not** build a Sleeper adapter. Map `venue=sleeper-markets` to `venue=kalshi` with `routed_via=sleeper` in the platform registry, so the arbitrage scanner never treats the two as independent.
- If the aggregator ever shows "where can a US retail user trade this", Sleeper can be listed as an access point to Kalshi contracts with a $0.02/contract all-in fee (standard schedule), US-person only, app-only, no API.
- Revisit only if Sleeper announces its own DCM or exchange, a non-Kalshi contract set, or a customer API. Signals to watch: `https://sleeper.com/picks/regulatory` (entities and partners), `https://docs.sleeper.com/` (any market endpoints), and the Team Picks help collection.

## 12. Open questions

- Does Sleeper offer limit orders, or only marketable orders at the displayed price? (Not documented.)
- Which states are live? (Help centre says "select"; reviews say "most".)
- Are all Team Picks tickers a subset of Kalshi's sports series, or does Sleeper get any bespoke contracts? Terms say market data is Kalshi's. I did not map Sleeper tickers to Kalshi tickers because the app is not accessible without an account.
- Terms were read via summariser only; re-read §6.23 (position limits) and §11 verbatim before relying on them.

## Sources

- https://sleeper.com/picks/regulatory (H; entity, NFA ID, no named DCM on that page, customer funds, 10/15/2026 statement)
- https://support.sleeper.com/en/articles/13557247-general-team-picks-101 (H; "offered by Kalshi", 24/7 hours)
- https://support.sleeper.com/en/articles/11802148-fee-disclosure-sleeper-markets-llc (H; fees, routes to Kalshi Exchange)
- https://support.sleeper.com/en/articles/11842741-risk-disclosure-for-cleared-swaps-customers (H; KalshiEX LLC DCM, Kalshi Klear LLC DCO)
- https://support.sleeper.com/en/articles/13557353-market-rules (H; Kalshi determines settlement)
- https://support.sleeper.com/en/articles/13557313-entering-sleeper-team-picks (H)
- https://support.sleeper.com/en/articles/13557327-deposits-withdrawals (H)
- https://support.sleeper.com/en/articles/13557289-getting-started (H; eligibility and KYC)
- https://support.sleeper.com/en/articles/13557355-team-picks-faqs (H; dated 2026-08-28)
- https://support.sleeper.com/en/articles/13557341-documents-and-taxes (H)
- https://support.sleeper.com/en/articles/5486620-general-terms-of-use (H; ss 3.7, 6.x, 7.5, 9.2, 11.1-11.3)
- https://support.sleeper.com/en/articles/15364522-sleepersafe-rules and https://support.sleeper.com/en/articles/17006462-sleeper-matchup-challenges (H; not prediction markets)
- Help collections: https://support.sleeper.com/en/collections/18187125-sleeper-team-picks , .../19654889-sleeper-safe , .../3087538-legal (H)
- https://www.sleeper.com and https://docs.sleeper.com/ (H; API is fantasy-only)
- `GET https://api.sleeper.app/v1/state/nfl` (H; fixture)
- https://docs.kalshi.com/llms.txt and https://docs.kalshi.com/api-reference/fcm/get-fcm-orders (H; FCM-member endpoints exist, restricted)
- https://defirate.com/news/sleeper-receives-nfa-approval-to-offer-prediction-markets/ (M)
- https://www.fantasylabs.com/articles/sleeper-markets/ (M)
- https://www.thelines.com/prediction-markets/sleeper-markets/ (M; contract types, limits, last updated 2026-09-21)
- https://next.io/prediction-markets/ (H that it is vague; the original hint)
- PayBox `discover_plugins` and `discover_services` with query "sleeper" on 2026-10-19: no results (H)
- Not reachable: https://www.legalsportsreport.com/242815/sleeper-sues-cftc-in-pursuit-of-approval-to-offer-predictions/ (HTTP 403). Searches beyond the first two were blocked by the shared WebSearch budget.
