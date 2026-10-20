# NinjaTrader Connect - venue spec (researched 2026-10-19)

Verdict: skip. NinjaTrader Connect is a B2B2C brokerage/FCM infrastructure product, not a market venue. Its prediction-market access is a pass-through to Kalshi (and Bitnomial) via a third-party DCO, so it is a duplicate of liquidity already covered under Kalshi. Its API is partner-only (sandbox credentials from the Connect team), with no public base URLs, auth or rate limits.

## Liveness
- Live. Connect launched 2026-03-03 (H, Finance Magnates). The site is up and its sitemap lastmod is 2026-09-30 (H, fetched sitemap-0.xml). Only 3 pages are in the sitemap: home, /futures-trading-api/, /solutions/prop-and-evaluation-firms/.
- Owner: NinjaTrader, a Kraken/Payward unit (H, homepage footer and FM article).

## Kind and market model
- Kind: broker-infrastructure (B2B2C FCM-as-a-service, white-label front end). Not a venue, no order book of its own (H).
- Contracts are CFTC-regulated event contracts. The disclosure says NinjaTrader Clearing LLC (NTC) "as an FCM member of a third-party CFTC-registered derivatives clearing organization ('DCO')... may provide customers access to event contracts and clear such contracts" (H, homepage). NTC NFA ID 0309379 (H). NinjaTrader says it is not affiliated with the DCO.
- Market model (binary / categorical / scalar, tokenisation) is inherited from the underlying exchanges (Kalshi binary Yes/No contracts, Bitnomial). It is not defined by Connect. NOT FOUND in Connect's own docs (searched: connect.ninjatrader.com home, /futures-trading-api/, developer.ninjatrader.com).
- No tokenisation or on-chain component (M: regulated FCM/DCO flow; no mention of any chain).

## Underlying venues
- Homepage: "Connect to CME, Kalshi, Bitnomial, Coinbase, ICE and Eurex through a single integration" (H). The FAQ and JSON-LD text lists only "CME Group, ICE, Eurex, and Kalshi" (H).
- Prediction-market venues named: Kalshi and Bitnomial. The homepage notes "Kalshi and Bitnomial are set in type until logo files arrive" (H, a page-source comment-like text).
- A third-party review page says customer accounts are carried by NTC and may clear event contracts through "Kalshi Klear LLC" (L: lilachbullock.com, third-party, not NinjaTrader's own material).
- Which Kalshi/Bitnomial markets Connect partners can actually offer: NOT FOUND (searched: homepage, FM Group, TradeInformer, Finance Magnates).

## Liquidity shared with
- Fully shared with Kalshi (and Bitnomial). Orders are routed to those exchanges' books, so Connect is NOT an independent arbitrage leg. Treat any Connect-brokered quote as the Kalshi/Bitnomial quote (M, inferred from the pass-through description; no routing docs found).

## Chains and collateral
- USD in a regulated FCM account (customer segregated funds), funded via partner/"instant funding" tools (H, homepage and FM article). No chain, no crypto collateral for event contracts. Kraken/Payward digital-asset language appears only in the risk disclaimer.

## Read API
- exists: official-authenticated (partner-only). Pages: "RESTful and WebSocket APIs, a self-serve sandbox environment, and self-service enablement guides" (H, homepage). TradeAPI page: "REST endpoints for transactional workflows" and "WebSocket streams for real-time quotes, order events, and account updates" (H, /futures-trading-api/).
- Swagger: the TradeAPI page links "REST API with Swagger definitions" at https://developer.ninjatrader.com/solutions/evaluation-services (H). That page (fetched) says only "The API is exposed as a REST API with Swagger definitions" and "Manage Market Data"; it does not describe event contracts as an API feature (H). It is the evaluation-services/prop product, not clearly the Connect API.
- Base URLs: NOT FOUND (searched: connect.ninjatrader.com, developer.ninjatrader.com, web search). api.ninjatrader.com does not resolve (H, curl).
- Auth: NOT FOUND publicly. Sandbox credentials are issued via the Connect team (M: web search summary).
- Rate limits: NOT FOUND.
- Market list, books, trades, resolution endpoints: NOT FOUND. The term "prediction markets" does not appear on the TradeAPI page (H); it says "event contracts" only in marketing context.
- No unauthenticated GET returned any API data, so no API response fixtures exist. Saved evidence excerpt: docs/research/fixtures/ninjatrader-connect/connect-homepage-evidence.txt (text excerpt, not an API sample).
- Practical read path for an aggregator: use the underlying venues directly (Kalshi public market data API; Bitnomial exchange API). Both are out of scope here (Kalshi is covered elsewhere; Bitnomial is not in this task's exclusion list and would be its own venue-spec).

## Trade path
- Programmatic: yes for approved partner brokers (account creation, order placement, balances, reporting via REST; order events via WebSocket) (H, TradeAPI page). Signing scheme: NOT FOUND.
- Requires a signed partner relationship, onboarding, compliance and ops readiness checks; partners "move through it in 6-12 weeks" (M, secondary summary). Availability is "subject to regulatory approval, onboarding review, and operational requirements" (H).
- An individual or agent cannot self-serve: end users must be KYC'd by a partner broker.

## PayBox reachability
- paybox_reachable: no. PayBox is a non-custodial EVM/Solana wallet; Connect is a USD FCM account system with KYC'd customer accounts. No on-chain tx proposals or signed-order flow exists (M, inferred from the model; no chain mentioned anywhere).

## Fees
- NOT FOUND. Article: "No fee structure, pricing, or revenue terms are disclosed" (H, Finance Magnates via fetch). Underlying exchange fees would be Kalshi's published schedule plus partner/FCM markups (M).

## Resolution mechanism and dispute risk
- Inherited from the underlying exchange/DCO (Kalshi, Bitnomial); Connect adds none. Underlying legal risk is real: courts disagree on state vs federal authority over sports event contracts (Third Circuit for Kalshi in April 2026; a New York federal court the other way in July 2026) (L: single secondary search summary, not verified first-hand).

## Geo / ToS / automation
- Regulated U.S. futures and event contracts only ("regulated U.S. futures and prediction markets", H). Jurisdiction availability varies. Automation is permitted only through the partner API. Retail scraping or an unofficial path: none identified. EU/UK rollout of futures mentioned (H, FM article) but not event contracts.

## Liquidity
- No Connect-specific volume, OI or TVL published. NOT FOUND (searched: homepage, press coverage). Context only: Kalshi-reported figures are in the Kalshi spec. Industry volume $44B in 2025 (H as quoted by Finance Magnates; not Connect-specific).

## Event categories overlapping other venues
- Whatever Kalshi/Bitnomial list (sports, politics, macro, crypto), but this is the same inventory as direct Kalshi/Bitnomial, so arbitrage against Connect adds nothing.

## Adapter recommendation
- Priority skip. Reason: duplicate liquidity (Kalshi/Bitnomial pass-through), partner-gated API with undisclosed endpoints, no fee or liquidity data, and no PayBox-compatible trade path. Revisit only if (a) Connect publishes a public market-data API or (b) the project becomes a licensed broker partner.
- Competing B2B white-label offerings noted in the coverage (Leverate, Match-Trader, Plaee/Crypto.com CDNA) are also infrastructure wrappers; a vendor like these is a distribution channel, not a venue (M).

## Suspicious content
- None found. The robots.txt explicitly allows AI crawlers; it contains no instructions aimed at agents beyond allow rules.

## Open questions
- Who is the clearing DCO behind Connect event contracts (Kalshi Klear is only L-confidence)? Does Connect carry Bitnomial event contracts or only futures?
- Is there a public Connect/TradeAPI Swagger with event-contract endpoints? Contact route only.
- Do Connect end-customers' orders route to the same Kalshi book (no separate liquidity pool)? Assumed yes, unconfirmed.

## Sources
- [H] https://connect.ninjatrader.com/ (fetched via WebFetch and curl 2026-10-19; text lines in fixtures)
- [H] https://connect.ninjatrader.com/futures-trading-api/ (WebFetch 2026-10-19)
- [H] https://connect.ninjatrader.com/sitemap-index.xml and sitemap-0.xml (curl 2026-10-19)
- [H] https://developer.ninjatrader.com/solutions/evaluation-services (WebFetch 2026-10-19)
- [H] https://www.financemagnates.com/forex/brokers/the-prediction-markets-frenzy-just-convinced-ninjatrader-to-go-b2b/ (launch 2026-03-03)
- [M] https://fxnewsgroup.com/forex-news/platforms/kraken-launches-ninjatrader-connect-platform-for-prediction-markets/ (no partners named)
- [M] https://tradeinformer.com/institutional-trading/ninjatrader-launches-b2b-futures-prediction-market-platform (no DCO named)
- [L] web search summary (6-12 week timeline, sandbox creds via Connect team); third-party Onyx Odds review page for Kalshi Klear mention
- Fixture: docs/research/fixtures/ninjatrader-connect/connect-homepage-evidence.txt
