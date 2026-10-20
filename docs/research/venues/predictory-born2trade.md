# Predictory (Born2trade) - venue spec

Researched 2026-10-19, read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Skip as a trading leg. Predictory is a broker-run (CFD broker Born2trade) retail frontend on Match-Trader's white-label prediction-market module. Its public catalogue is a mirror of Kalshi event tickers, it has no public market-data or trading API, the counterparty and liquidity source are undisclosed, KYC and a non-US geo gate apply, and PayBox/EVM wallets cannot trade it. At most a P2 "signal" curiosity (the card feed shows Kalshi-derived prices), and even that is redundant with Kalshi itself.

adapter_priority: skip.

## Is it live?

- Marketing site https://predictory.com/ returns HTTP 200 on 2026-10-19; Webflow page last published 2026-09-21 (HTML comment). (H)
- Born2trade launched the Match-Trader prediction-markets module: Finance Magnates dated 2026-07-21. (H) The earlier 2026-05-08 article says Born2trade acquired the predictory.com domain and targeted H1 2026 (missed). (H)
- Trading app URL referenced by the site: https://trader-lc.born2trade.com/app/pred/list/markets returns 403 to an anonymous curl (login wall / bot protection). (H) Registration is at https://client-lc.born2trade.com/register/.
- Whether any real money is actually being traded, and at what volume: NOT FOUND.

## Kind and market model

- Kind: broker front-end (retail CFD broker adds a prediction-market module). (H)
- Contracts: Yes/No priced $0-$1, winner pays $1. (H, predictory.com and help center)
- The card feed contains both binary cards (a `chance` integer) and categorical/multi-outcome cards (`outcomes: [[name, pct], ...]`, including bucketed scalar-style ranges such as BTC price at end of 2026). Each outcome is a Yes/No sub-market. (H, fixture)
- Order book vs AMM vs parimutuel: NOT STATED. Match-Trade says prices update "in real time as positions accumulate" and that it runs on the same engine as FX/CFD execution, with "one-click, instant fills" and early exit at current market price. This reads like broker-quoted pricing, not a public order book. (M) Help center says only that prices move on information and order-flow imbalance. (H)
- Tokenisation: none. Positions are database rows in a Match-Trader account, not tokens.

## Chains and collateral

- No chain. Funding is custodial: deposit USDT, USDC, BTC or ETH "from any wallet or exchange", minimum $10. (H, predictory.com) The Match-Trader offer page names Match2Pay (multi-crypto processor) for payments. (H, https://match-trader.com/prediction-markets-offer/)
- Withdrawals: NOT FOUND (help center silent).

## Read API

- Exists: none official for markets/prices/books/trades/resolution. Match-Trader's offer page advertises "Access to all APIs available" and back-office database access to white-label licensees only (sales-gated). (H) Match-Trader has a generic trader Platform API (REST, positions/balance, docs at https://docs.match-trade.com/docs/match-trader-api-documentation/ and a 2024 PDF) and a Brokers API; no prediction-market endpoints were found documented. (M; docs not read in depth, 2024 PDF is stale.) NOT FOUND (searched: predictory.com, help-center, match-trader.com offer and platform-api pages, web search for prediction-market API docs).
- Undocumented public feed that backs the website cards (not an official API, may change or vanish; M-grade stability):
  - GET https://b2t-edge-api.born2trade.workers.dev/api/prediction-cards?site=predictory (Cloudflare Worker, `access-control-allow-origin: *`, `cache-control: public, max-age=3600`). (H, seen in page source and fetched)
  - Response: `{generatedAt, config{link, filters[]}, cards[{icon, title, volume, closeDate, outcomes[[name,pct]] | chance, tags[], sites[]}]}`. 52 cards. (H)
  - `generatedAt` was 2026-09-10 on 2026-10-19, i.e. about 5.5 weeks stale, and still lists a Sep-2026 Fed card that closed on 2026-09-16. The site client-side hides cards past `closeDate`. (H) It is a marketing snapshot (integer percent, rounded volume strings like "$41M"), not tradable quotes.
  - Fixture saved: docs/research/fixtures/predictory-born2trade/prediction-cards.json (13.6 KB).
- Websocket: NOT FOUND.
- Auth/rate limits: none seen on the worker; limits NOT FOUND.

## Provenance of the catalogue (important for arbitrage)

- Every card's `icon` field is a Kalshi event/series ticker (KXFEDDECISION, KXBTCY, KXPRESNOMD, KXF1, ...), and the page code states "card.icon is a Kalshi ticker" and "the Worker proxies Kalshi icons". (H, page source) A live Kalshi GET (https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFEDDECISION&limit=3&status=open) returned real markets for that series. (H)
- Volumes shown ($41M Fed decision, $214M 2028 Dem nominee, $35M BTC end-2026) are very likely Kalshi volumes, not Predictory volumes (M; matching to Kalshi totals not performed). Do not treat them as Predictory liquidity.
- Inference (M): Predictory lists Kalshi-derived events and prices them in the broker's own book, possibly hedged to a "strategic partner" feed (Match-Trader: liquidity "offered by our strategic partners", unnamed). Counterparty is NOT STATED. Treat as NOT an independent arbitrage leg: it follows Kalshi, so price differences versus Kalshi would be lag/spread and unfillable at size.

## Trade path

- Programmatic order placement: none public. Only the web app (Match-Trader trader UI) behind login and KYC; possibly the generic Match-Trader Platform API for a funded account (not verified; account creation was out of scope). (M)
- Auth/signing: session/account login. No wallet signing.
- PayBox/EVM reachability: no. A PayBox wallet could at most send a crypto deposit to a custodial deposit address after KYC (a transfer, not a trade). No transaction proposals or signed orders exist for this venue. paybox_reachable: no.

## Fees

- $0.10 per contract commission shown in help-center examples; not stated whether on entry, exit or both; no other fee/spread disclosures; the broker admin can configure fee structures and risk parameters. (H, help center and Match-Trader offer page) Spread/markup versus the Kalshi reference price: NOT FOUND.

## Resolution

- Automatic 0/1 settlement ("system-driven outcome settlement with no manual steps"). Settlement source and dispute process: NOT FOUND; Born2trade says only "defined settlement rules". (H) Given the Kalshi-ticker catalogue, outcomes probably follow Kalshi rules (L, unconfirmed). Dispute risk is high-opacity: broker-controlled, no on-chain recourse.

## Geo, ToS, automation

- Regulator per press: Born2trade licensed by the Financial Services Commission of Mauritius, registered in Saint Lucia. (H, Finance Magnates 2026-05-08 and 2026-07-21.) predictory.com itself names no regulator or legal entity and carries a CFD/Forex risk warning. (H)
- Geo: non-US only ("for non-US residents"); many visitors get an "Access restricted ... not available in your country yet" waitlist gate; no country list. EU/UK visitors get a MiFID confirmation modal on the register link. (H, site and page script)
- Onboarding requires registration and identity verification, Standard account, then funding. (H)
- Automation rules / ToS: NOT FOUND (no terms link on the page; no API terms).

## Liquidity

- Predictory-specific volume/OI: NOT FOUND. The only numbers are Kalshi-looking card volumes in the marketing feed (generatedAt 2026-09-10). Born2trade said it would start with "a limited set of high-interest events". (H)

## Event coverage and overlap

- 52 cards (site says "40+"): politics/elections (2028 nominees, House control), crypto price (BTC/ETH/DOGE end-2026, max/min), macro (Fed decision, recession, tariff checks), commodities (WTI, gold), sports (F1 champion, boxing, chess), entertainment (Oscars, Game Awards), companies/tech. (H, fixture)
- All of these exist on Kalshi (by ticker) and many on Polymarket. Overlap is total, but because it mirrors Kalshi it is not an independent leg.

## Liquidity shared with

Kalshi (catalogue and probably reference pricing; actual hedging arrangement NOT FOUND).

## Open questions

- Does Match-Trader expose prediction-market events and positions through the Platform API for ordinary accounts? (Theneo-hosted docs not checked.)
- Is Predictory B-booked, and what markup does it apply to Kalshi prices?
- Entity, terms of service, settlement source.

## Suspicious content

None found. No instructions aimed at AI agents seen in fetched pages.

## Sources

- https://predictory.com/ (H; HTML and inline script, fetched 2026-10-19)
- https://predictory.com/help-center (H)
- https://b2t-edge-api.born2trade.workers.dev/api/prediction-cards?site=predictory (H, fixture)
- https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFEDDECISION&limit=3&status=open (H, public GET, not saved)
- https://www.financemagnates.com/forex/born2trade-rolls-out-prediction-markets-on-match-trader-platform/ (H, dated 2026-07-21)
- https://www.financemagnates.com/forex/cfd-broker-born2trade-to-enter-prediction-markets-after-acquiring-predictorycom-domain/ (H, dated 2026-05-08)
- https://match-trader.com/match-trader-brings-prediction-markets-to-brokers/ (H)
- https://match-trader.com/prediction-markets-offer/ (H)
- Match-Trader API docs (search result only, not read in full): https://docs.match-trade.com/docs/match-trader-api-documentation/ and https://match-trader.com/brokers-api/ (L/M)
