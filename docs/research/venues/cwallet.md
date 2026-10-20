# Cwallet (cwallet.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip**. Cwallet is a custodial/non-custodial crypto super-app whose "Predict" tab is a front-end (Polymarket builder-code frontend). It has no public API, no own order book, and no independent liquidity. Anything tradable there is a Polymarket market; the Polymarket adapter already covers it. [M: inferred from builder leaderboard + terms]
- Useful only as an attribution datapoint: Polymarket builder "Cwallet" (verified) with $1.82M lifetime attributed volume and 1 active user. [H]

## Is it live (2026)?

- Cwallet the company/product is live: site claims 68.5M users, iOS/Android apps; products Wallet, Swap, Futures, Cozy Card, etc. Operating entity shown as WEBSEA GLOBAL HOLDING LIMITED (Ontario) on the site; docs name Amarium s.r.o. (Slovakia) in AML/legal docs. [H: https://cwallet.com/ , https://docs.cwallet.com/llms.txt]. The 68.5M user figure is self-reported marketing; treat as L.
- "Predict" prediction-market feature: announced 2026-05-15 blog as launched [H: https://cwallet.com/blog/world-cup-elections-and-market-trends-why-everyone-is-talking-about-prediction-markets/] (an earlier 2026-04-27 learn article says "will soon launch" [H: https://cwallet.com/learn/prediction-markets-explained-trading-on-the-wisdom-of-the-crowd]); press release dated 2026-05-26 on GlobeNewswire [M: seen only in search snippet, page returned 403]. Prediction Market Terms of Use exist in the docs [H].
- Not verified: whether Predict UI is currently usable (no browser/account allowed). Polymarket builder data shows activity in the last month (see Liquidity), so likely still wired up. [M]

## Kind and market model

- Kind: broker-or-frontend (UI over third-party protocols). [H] Terms 1.2: "Predict is a software user interface that enables users to interact with decentralized prediction protocols and third-party execution layers"; company "does not operate the underlying order books, liquidity pools, or matching engines." [H: https://docs.cwallet.com/normative-documents/prediction-market-terms-of-use.md]
- Market model per terms: binary-style "Event Contracts", shares priced 0.00-1.00 asset units [H]. Tokenisation = whatever the underlying protocol uses (Polymarket: ERC-1155 conditional tokens on Polygon, USDC.e-style collateral) [M: Polymarket covered in separate workflow].
- Which protocol: Cwallet docs never name Polymarket in the terms [H]. The link to Polymarket rests on (a) a verified Polymarket builder profile named "Cwallet" with a builder code [H: data-api leaderboard], (b) pm.wiki stating Predict runs through Polymarket [L: auto-generated directory, self-flagged inconsistent]. Cwallet's "deposit USDC, browse, choose outcome" flow in the May blog matches a Polymarket frontend [M].

## Chains and collateral

- NOT FOUND for Predict specifically (searched: cwallet.com, docs.cwallet.com llms.txt + terms, blog posts). Blog says "Deposit USDC into your Cwallet account" [H]. If Polymarket-backed, orders settle on Polygon in USDC-family collateral [M].

## Read API

- exists: **none** (no official Cwallet API for Predict). NOT FOUND (searched: cwallet.com/api, /developers, /docs -> 404 or redirect to docs.cwallet.com; docs llms.txt index of ~330 pages: "No pages on the API", only Payment Button/Request/Bulk Payment/Giveaway callback tools unrelated to markets). [H]
- Market data for anything Cwallet shows must be read from the underlying venue (Polymarket Gamma/CLOB/Data APIs), not Cwallet.
- The only machine-readable Cwallet-related datapoint is Polymarket's public builder leaderboard (unauthenticated GET):
  - `https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100` ; params seen: timePeriod (ALL, MONTH, WEEK, DAY), limit (capped at 50), offset. [H, confirmed 2026-10-19]
  - Row shape: `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}`; MONTH rows also carry `dt`. Fixture: docs/research/fixtures/cwallet/polymarket-builders-leaderboard-ALL-cwallet.json.
  - Cwallet row (ALL): rank 125, volume 1,822,523.45, activeUsers 1, verified true. MONTH: rank 94, volume 101,555.07, activeUsers 1. Not in DAY/WEEK top 100. [H]
  - Builder code and builder leaderboard are Polymarket concepts; code is serialized in the signed order and volume is credited per matched trade [H: https://docs.polymarket.com/developers/builders/builder-intro].

## Trade path

- **none** for an aggregator via Cwallet. No documented API, and terms 4.3 prohibit bots/scrapers interacting with the interface in a disruptive way [H]. An agent wanting this liquidity should trade Polymarket directly (CLOB signed orders; separate spec).
- PayBox reachability: **no** for Cwallet itself (no programmatic surface). The underlying liquidity is reachable via the Polymarket adapter, not through Cwallet. [M]

## Fees

- Terms 6.3: "the Company does not charge service fees for the Predict interface" [H]. pm.wiki says standard swap/gas fees [L]. Polymarket-side fees (and any builder fee) not documented by Cwallet. NOT FOUND (searched: terms, docs index, blog posts). Whether Cwallet takes a builder fee is unknown.

## Resolution mechanism

- Delegated to underlying protocol oracle ("decentralized optimistic oracles" e.g.); Cwallet has no authority to modify, reverse or appeal [H: terms 3.3]. For Polymarket that is UMA optimistic oracle with dispute risk (covered elsewhere). [M]

## Geo / ToS / automation

- Prohibited: Mainland China, United States, United Kingdom, France, Hungary, Portugal, North Korea, Iran, plus sanctioned jurisdictions; VPN circumvention prohibited, permanent ban risk; KYC/AML may be required (Slovak AML). [H: terms 2.2, 2.3]
- Governing law Slovak Republic, arbitration in Slovak Chamber of Commerce. 18+. [H]
- Automation: "may not use automated scripts, bots, or scrapers ... in a manner that disrupts the service." [H]
- Fixture copy of terms: docs/research/fixtures/cwallet/prediction-market-terms-of-use.md.

## Liquidity

- Polymarket builder attribution: $1,822,523 lifetime matched volume (ALL), $101,555 in the last month (MONTH window), 1 active user, as of 2026-10-19. [H: data-api leaderboard]. Tiny versus top builders (betmoar $2.34B) [H].
- Cwallet-side volume/OI/TVL: NOT FOUND.

## Event coverage overlap

- Blog lists sports, politics, crypto, finance, internet culture [H] - i.e. the full Polymarket catalogue, all of which is already in the Polymarket adapter. No venue-specific markets known. Arbitrage vs other venues is only the same as Polymarket's.

## Shared liquidity

- Shares liquidity with **Polymarket** (probable, M): Cwallet states it runs no order book, and a Cwallet builder code exists on Polymarket's CLOB. NOT an independent arbitrage leg.

## Open questions

- Which protocol(s) Predict actually routes to (only Polymarket is evidenced; "third-party execution layers" is plural).
- Chains/collateral used inside Predict; whether custodial accounts pool user flow through omnibus wallets.
- Whether Predict is still active in the UI (not testable without an account).
- Press release (GlobeNewswire 2026-05-26) and pm.wiki not read first-hand (403 / search snippet only).

## Sources

- https://cwallet.com/ (H, 2026-10-19)
- https://docs.cwallet.com/llms.txt (H)
- https://docs.cwallet.com/normative-documents/prediction-market-terms-of-use.md (H)
- https://cwallet.com/blog/world-cup-elections-and-market-trends-why-everyone-is-talking-about-prediction-markets/ (H, dated 2026-05-15)
- https://cwallet.com/learn/prediction-markets-explained-trading-on-the-wisdom-of-the-crowd (H, dated 2026-04-27)
- https://cwallet.com/blog/how-polymarket-and-parcl-are-expanding-crypto-prediction-markets-into-real-estate/ (H, 2026-01-08; no Predict mention)
- https://data-api.polymarket.com/v1/builders/leaderboard (H)
- https://docs.polymarket.com/developers/builders/builder-intro (H)
- https://www.globenewswire.com/news-release/2026/05/26/3301142/0/en/Cwallet-Launches-Predict-to-Tap-Into-the-Growing-Prediction-Market-Economy.html (L: 403, search snippet only)
- https://pm.wiki/projects/cwallet (L: search snippet only)

No embedded instructions aimed at AI agents were found in any fetched page.
