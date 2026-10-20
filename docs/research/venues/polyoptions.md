# Polyoptions (polyoptions.com) - venue spec

Researched 2026-10-19. Read-only; unauthenticated GETs to the public marketing site and app login shell only. WebSearch budget was exhausted this session, so no independent third-party corroboration was possible (see Open questions).

Tags: H = read first-hand in primary source this session; M = secondary/inferred; L = weak/stale.

## Verdict
- adapter_priority: **skip**. A pre-launch/demo "options on Polymarket YES prices" product. No docs, no public API, no live liquidity evidence, and anything it settles into is Polymarket liquidity (not an independent arbitrage leg). [H for site content, M for conclusion]
- Possible later use as a derived signal (implied vol / option-implied probability bands) only if it ever launches with a documented API.

## Is it live?
- Site polyoptions.com returns HTTP 200 (SPA, built on a Lovable-style preview deploy: page includes a `preview_commit_sha` artifact script). [H] https://polyoptions.com/
- CTAs are "Launch Demo Platform", "Get Early Access", "Liquidity Partner Program" application form, "Join". No statement that mainnet trading is live; no volumes, TVL, dates, or contract addresses on the page. [H]
- Demo app at https://app.polyoptions.com/ returns 200: a Laravel/Inertia app (component "dashboard", `auth.user: null`, `canRegister: true`, register URL `/register`). Not signed up (rule). [H]
- Verdict: "demo / pre-launch, no evidence of live trading". [M] Galaxy (2026-01-19) lists it under "Next Generation" new platforms as "Options on Polymarket shares", no numbers. [H] https://www.galaxy.com/insights/research/prediction-markets-leverage-ai-agents-defi
- Hint about Polymarket builder "polyoptionz" (#147, $1.2M): NOT FOUND (searched: Galaxy page does not mention "Polyoptionz"; web search unavailable). Treat as [L] unverified; may be a different or the same project. The landing page does say orders route "through our CLOB with Builder Attribution headers", consistent with being a Polymarket builder. [H for the phrase, L for identity]

## Kind and market model
- Kind: derivative layer on Polymarket (options on Polymarket YES price). [H]
- Products: calls, puts, straddles/strangles, spreads, calendars, barriers (touch triggers), lookbacks, baskets. [H]
- Series defined by strike K, expiry T, contract size N. Holder posts K x N USDC; writer's escrow contributes (1-K) x N; on exercise/expiry the Gnosis CTF mints/splits complete sets, YES to call holder, NO to writer. Call pays (Polymarket price - strike); put pays max(strike - price, 0). Writers post max loss upfront, so no liquidations. [H, landing copy] 
- Matching: the page refers to "our CLOB"; whether options trade on an order book or RFQ is not documented. NOT FOUND (searched: landing page JS bundle, app shell).
- Settlement: "settle directly into Polymarket's event contracts (or cash equivalent)"; optional auto-exercise for deep ITM and "exercise-and-sell" with minimum price; otherwise UMA resolution auto-redeems residual YES/NO to USDC. [H]

## Chains and collateral
- Collateral USDC; underlying is Polymarket Conditional Tokens Framework (Polygon in Polymarket's case). Chain for Polyoptions' own contracts is not stated. NOT FOUND (searched: landing page text and JS bundle; no 0x contract addresses present). [H for USDC/CTF, L for Polygon inference]

## Read API
- exists: **none** (documented). [H]
- No docs URL, no OpenAPI. app.polyoptions.com `/api/markets`, `/api/v1/markets`, `/api/series`, `/api/health` all return 404 HTML. [H]
- Marketing copy for the Liquidity Partner Program: "Early API access to new market structures 48 hours before public docs are released"; "Liquidity Partner API keys get 500 requests/second. Public gets 50 req/s." This implies a future API with keys, but nothing public exists. [H copy, no endpoint]
- Landing bundle references a Supabase project with edge functions `functions/v1/proxy-clob` and `functions/v1/proxy-gamma` (likely thin proxies to Polymarket CLOB/Gamma for the demo UI). Not an official API; not probed. [M]
- No fixtures saved (nothing to sample).

## Trade path
- none documented. Demo requires an account (registration); no wallet-signed order scheme documented. For PayBox: not reachable - nothing to sign or propose. If it launches, writing/holding would presumably be Polygon CTF/USDC transactions or Polymarket-style signed orders with builder attribution; unknown. [L]
- paybox_reachable: no.

## Fees
NOT FOUND (searched: landing page, JS strings). Page says nothing on fees. Mentions a liquidity rewards program "modeled after Polymarket/dYdX's". [H]

## Resolution and dispute risk
- Inherits Polymarket/UMA resolution (UMA optimistic oracle). Application form asks MMs how they price "Outcome Resolution risk (e.g. UMA disputes)". Option expiry can precede Polymarket resolution ("Expiry/exercise pre-Polymarket resolution"), so settlement price would be Polymarket's market price at that time; mechanism for that price reference NOT FOUND. [H/M]

## Geo / ToS / automation
NOT FOUND (no ToS page located; searched landing and app shell). Page carries a generic risk disclaimer: "Trading options carries substantial risk...". Partner page https://polyoptions.com/partner is an application form (tech stack, Polymarket CLOB/CTF experience, optional EVM address). Do not submit. [H]

## Liquidity
No volume/OI/TVL published (as of 2026-10-19). Treat as zero verified. Galaxy list gives no numbers. [H]
Hint of a $1.2M Polymarket builder volume for "polyoptionz": unverified [L].

## Event overlap and independence
- Underlying = Polymarket markets, so it overlaps whatever Polymarket lists (politics, sports, crypto, macro). 
- Not an independent leg: option payoffs reference Polymarket prices and settle into Polymarket CTF tokens. Cross-venue value would be volatility/convexity pricing, not price arbitrage. liquidity_shared_with: Polymarket.

## Open questions
- Is there a live mainnet launch, and which chain/contracts? (No evidence.)
- Is "polyoptionz" the same entity? 
- Any public API docs after partner program launch?
- Independent confirmation via X (@polyoptions, referenced in site meta) not checked (no browser/search).

## Other findings
- GitHub: org/user "PolyOptions" has repo PolyOptions/PolyOptions last pushed 2022-05-03 (no description) - [L], appears unrelated/stale. Repo JiggityMaggotKetamynes/PolyOptionsArb (pushed 2026-02-12) is an unrelated hobby arbitrage idea between Polymarket and traditional options; not this venue. [H]
- Suspicious content: none aimed at AI agents found.
- Privacy: requests used only User-Agent insurance-markets-research/0.1.

## Sources
- https://www.galaxy.com/insights/research/prediction-markets-leverage-ai-agents-defi (2026-01-19, one-line mention) [H]
- https://polyoptions.com/ (HTML and JS bundle /assets/index-C4pY8szl.js, fetched 2026-10-19) [H]
- https://polyoptions.com/partner (HTTP 200 only) [H]
- https://app.polyoptions.com/ (Inertia page props, probed /api paths 404) [H]
- GitHub API repo metadata: PolyOptions/PolyOptions, JiggityMaggotKetamynes/PolyOptionsArb [H]
