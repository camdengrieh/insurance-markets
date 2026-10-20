# Traderline Predictions (traderline.com) - venue spec

Researched 2026-10-19. Read-only: public web pages, Polymarket public docs and public unauthenticated GETs, DefiLlama public API, `gh api` for public GitHub metadata. No account, no wallet, no POST, no signing, no payments, no browser automation, nothing downloaded or installed. Generic User-Agent only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- **adapter_priority: skip.** Traderline is **not a venue**. It is a free desktop trading client (ladder UI) for Polymarket and the Betfair Exchange, run by Mythical Technologies, Lda (Portugal). Every Polymarket market, price and fill it shows is Polymarket's own. It earns a Polymarket **builder fee** by attaching its builder code to orders its users sign locally (H, Traderline Polymarket terms s.3; DefiLlama methodology). It therefore has **no independent liquidity** and can never be an independent arbitrage leg (H).
- It has **no API, SDK or developer docs** and no hosted order-entry endpoint (H: no API links on home/about/download/polymarket pages; `api.` and `docs.` subdomains do not resolve; llms.txt lists none). The product is closed-source binaries (H, GitHub release repo has only installers and updater metadata).
- Real and busy, though: **#2 Polymarket builder by volume over the last 30 days** (H, computed from Polymarket's builder volume feed), about $34.8M USD / 30d on DefiLlama (H). That flow is ~99% sports in a 26-minute sample (H sample, M extrapolation). The aggregator should read this volume through the Polymarket adapter, not through a Traderline adapter.
- Residual value: (a) the Polymarket builder-attribution feed gives a free, labelled slice of retail in-play sports flow (signal-only, M); (b) Traderline's other exchange, **Betfair Exchange**, is a sports-odds venue that overlaps Polymarket sports and is not in the covered list (lead, see Open questions).

## Liveness (still live in 2026?)

Yes, live and actively shipped.

- `https://traderline.com/` returns 200; sitemap `lastmod` 2026-10-15; Terms last updated 2026-08-17 (Polymarket and General) and 2026-08-11 (Betfair). The home page says the Polymarket version "is live and free since May 21, 2026" (H, WebFetch summary of home page).
- Desktop release repo `thebouta/traderline-polymarket-releases`: latest tag 2.0.39 published 2026-10-14; earlier 2.0.35 (2026-09-27), 2.0.34 (2026-09-26). `latest.json` updater asset has 53K downloads (H, `gh api`). A second repo `nabaisu/traderline-desktop-releases` (tags 0.4.51 on 2026-10-15) is the Betfair line (M, inferred from naming; README empty). Neither repo's ownership was confirmed by Traderline itself (L).
- Polymarket's own builder feed shows Traderline fills as recent as 2026-10-19T00:45Z (H, `clob.polymarket.com/builder/trades`).
- DefiLlama: id 8000, "Traderline Predictions", category **Interface**, tag "Polymarket Builder", chain Polygon, no TVL, twitter `TraderlineApp`; description "a prediction platform powered by Polymarket" (H, `api.llama.fi/protocol/traderline-predictions`). That description over-states it: the vendor itself says "Traderline is a software interface, not an exchange or a gambling operator" (H, /about).
- Company history: site says founded 2011 (Betfair tooling), codebase rebuilt 2025, Polymarket version launched 2025 (H, /about; the home page date of 2026-05-21 and the DefiLlama adapter start of 2025-12-01 disagree on when Polymarket flow began, L on exact launch date).

## Kind and market model

- kind: **broker-or-frontend** (desktop trading client). Not an exchange, not a market maker, not a counterparty (H, Terms: "Traderline holds no funds and is not a counterparty to your trade").
- Market model: inherited from Polymarket - binary and negative-risk multi-outcome **CLOB**, outcomes are ERC-1155 conditional-token positions priced 0-1 and redeemable for $1 per winning share (H, Polymarket docs: "winning tokens ... redeem them for $1 each"). Exact tokenisation details belong to the Polymarket spec; not re-researched here.
- Product scope seen: vertical price ladder, one-click orders, charts, scalping/tick trading, auto stop-loss, "NET" button, practice mode, a "Sonar" web app that shows top holders, "smart money" wallet filters, live trade feed and wallet profiles from public on-chain data (H, /sonar; M that it is on-chain-derived, vendor claim), a monthly volume leaderboard ($2,500/month pool, top 15 by matched volume; H, /leaderboard) and an optional "My Predicts" leaderboard feature keyed to wallet signature (H, Privacy Policy s.1.5; no further detail found).
- Market coverage: Polymarket-wide. The sample below was ~99% sports by USD but included at least one politics market (Brazilian election), so coverage is not restricted to sports (M; the vendor pages do not say).

## Chains and collateral

- Polygon (DefiLlama `chains: ["Polygon"]`, H). Collateral **pUSD** (Polymarket USD, an ERC-20 wrapper backed by USDC) in a Polymarket **proxy wallet**; the app displays "Logged in as Polymarket Proxy, pUSD available" (H, /polymarket page; Polymarket docs /concepts/pusd).
- Funds never move to Traderline; "Traderline is the cockpit, not the vault" (H, /polymarket). Betfair is custodial at Betfair (H, home page).

## Read API

- **exists: none** (Traderline has no public, official or unofficial API that I could find).
- Docs URL: NOT FOUND (searched: traderline.com home/about/download/polymarket/how-traderline-works, llms.txt, robots.txt, sitemap.xml - 140 URLs in total, about 75 non-translated, none is docs or API; `api.traderline.com` and `docs.traderline.com` do not resolve (curl exit 6); GitHub repo search for "traderline" returns only the two release-binary repos).
- `robots.txt` allows all except `/subscribe`; `llms.txt` is marketing/FAQ (fixture `traderline_com_llms.txt`). Neither mentions an API.
- Web socket: NOT FOUND for Traderline. (The app presumably uses Polymarket's own market websocket; not verified.)
- Rate limits: NOT FOUND for Traderline.
- **What is available instead is Polymarket's public attribution data about Traderline** (both H, unauthenticated GET 200 on 2026-10-19):
  - `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` - per-builder daily series, newest first, `limit` max 90 buckets, not paginated. Row: `{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}`. **`volume` is in SHARES, not USDC** (Polymarket OpenAPI). `active_users` = distinct makers. Traderline row: `builder_name "traderline"`, `verified: true`, `builder_code 0x6b0e773fada0a2ec67c956b25a737d353a534ea33db56c717ba7854346c67984`. The v1 route is **retired on 2026-10-24** (comment in DefiLlama's helper pointing at Polymarket's migration page, H); build on v2 only. Also `GET /v2/builders/leaderboard?time_period=day|week|month|all` (H, OpenAPI).
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<bytes32>` - per-fill feed of orders carrying that builder code; page of 300, cursor `next_cursor` (base64 offset, ends at `LTE=` per DefiLlama's helper). Row keys: `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market (conditionId), assetId (token id), side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime (unix s), bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. No auth header was needed. Rate limit headers: none returned on either call; Polymarket's builder tiers doc says "Standard" API limits for Unverified/Verified builders (H, docs/programs/builders/tiers). This route is not in the OpenAPI index I fetched (`docs.polymarket.com` llms.txt), so treat it as undocumented-but-used (DefiLlama depends on it; M for stability).
- Fixtures: `docs/research/fixtures/traderline-predictions/` (DefiLlama protocol and overview rows, 30 days of builder volume, 3 redacted builder-trade rows, llms.txt, README).

## Trade path

- **Traderline: none for an agent.** It is a Windows/macOS desktop GUI (Betfair also iOS). For Polymarket the user creates a Polymarket email account (Magic wallet), **exports the Magic signer private key and pastes it into the app**; the app stores it "locally on your device, encrypted" and signs orders itself (H, /polymarket, /download, Terms Polymarket s.3-4). No headless mode, CLI, local server or remote order endpoint was found (NOT FOUND, searched: all pages above). Traderline Terms s.2.8 forbids bots/scrapers accessing or collecting Traderline data without written consent (H).
- Order mechanics, from Traderline's terms: "you sign each order yourself with your own keys (an EIP-712 signed message), Polymarket matches and settles it on-chain, and the protocol attributes the fee to Traderline's builder profile" (H, Terms Polymarket s.3). This matches Polymarket's documented design: the signed order struct carries a `builder` bytes32 field (H, docs/programs/builders/fees).
- **Reaching the same book from PayBox:** Traderline itself is not reachable. The underlying Polymarket CLOB is (EIP-712 signed orders on Polygon via a PayBox wallet's typed-data signing; analysis lives in `docs/research/08-venues-polymarket-kalshi.md` and the Polymarket spec). That is the right adapter, and it makes Traderline irrelevant to execution.
- Do **not** reuse Traderline's builder code on PayBox-signed orders: it would misattribute flow, route a 5-10 bp fee to a third party, and Polymarket reserves the right to revoke builder fees for "non-bona fide" activity (H, builder fees doc). A PayBox plugin that wants attribution should register its own builder profile (needs a Polymarket account; not done here).

## Fees

- Traderline: no subscription, no premium/winnings charge (H). Polymarket orders carry a **per-order builder fee, a percentage of traded value, shown before each order** (H, Terms; rate "published on Traderline's Polymarket builder profile", 3 days' notice before changes).
- Measured actual rates (H, 300-fill sample 2026-10-19 00:19-00:45Z, `builderFee / sizeUsdc` on fills above $5): **taker 10 bps (0.10%), maker 5 bps (0.05%)** - 70 taker rows all at 10 bps and 121 maker rows all at 5 bps; rows under $5 round off. Formula: `builder_fee = notional * rate_bps / 10000`, paid by the Traderline user, additive to Polymarket's platform fee (`platform_fee = C * feeRate * p * (1 - p)`, taker-only) (H, Polymarket builder fees doc). Polymarket caps: 100 bps taker, 50 bps maker (H, same doc).
- Cross-check: DefiLlama 30d builder fees $26,992 on $34.8M volume = 0.078% blended (H arithmetic), consistent with a 5/10 bp maker/taker mix.
- Polymarket fees, deposits and withdrawals: see Polymarket spec. An arbitrage leg on Polymarket via Traderline would cost 5-10 bp more than direct; there is no reason to go through it.

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket: UMA Optimistic Oracle for event markets (proposal bond typically $750 pUSD, 2-hour challenge window, escalation to UMA DVM vote on a second dispute) and Chainlink TWAP for up/down markets (H, `docs.polymarket.com/concepts/resolution`). Traderline adds no resolution layer and no dispute process. Dispute risk is Polymarket's, and Traderline's liability is capped at EUR 50 (H, General Terms).

## Geo, ToS and automation

- Traderline blocks its own site/apps in **Portugal**; users must not be in Polymarket Restricted Jurisdictions and must not use "technical or other means to conceal ... location" (H, Terms Polymarket s.1). Polymarket itself is not available in the U.S. (H, /polymarket page; details in Polymarket spec).
- Automation: General Terms s.2.8: "You may not use bots, crawlers, scrapers or any other automated means to access, collect, extract, index or reuse any data ... made available through Traderline" without written consent; s.2.6 bans reverse engineering (H). So do not scrape traderline.com, Sonar, the leaderboard or the app. The Polymarket public APIs used above are Polymarket's, not Traderline's.
- Operator: Mythical Technologies, Lda, Coimbra, Portugal, VAT 513557849; governing law Portugal, courts of Coimbra (H, Terms). Listed in the Betfair Vendor Program/App Directory (H, /about).
- Leaderboard prize rules ban wash trading, self-matching, spoofing, multiple accounts; payment needs KYC (H, /leaderboard).

## Liquidity (source and date)

All dated 2026-10-19 unless noted.

- DefiLlama (USD, builder-attributed CLOB fills `sizeUsdc`): 24h **$2.13M**, 7d $8.40M, 30d **$34.81M**, 1y/all-time $185.76M (adapter start 2025-12-01); 30d change vs prior 30d **-25.95%**; flagged `doublecounted: true` (H, `api.llama.fi/overview/dexs`). Fees: 24h $1,616; 30d $26,992; all-time $205.9K (fees adapter start 2026-04-28, so all-time fees understate) (H, `/overview/fees`).
- Polymarket builder feed (SHARES, not USD): 2026-10-18 = 4.22M shares, rank #2, 291 active makers; last 7 days 21.4M shares; last 30 days 76.3M shares (computed from 30 daily rows; H). Share of builder-attributed volume over the same 30 days: 76.3M / 710.4M = **10.7%**, behind betmoar (121.1M), ahead of Gate (60.9M) (H, computed; shares not USD). Daily active makers range ~244-315 over 2026-10-05..10-18 (H).
- Context: against Polymarket International's DefiLlama 30d volume of about $2.21B (H in `docs/research/14-platform-of-platforms.md`, measured 2026-10-18; different adapters, so M), Traderline is roughly 1.6% of Polymarket flow. It is a segment of Polymarket volume, not additional volume.
- Traderline's own leaderboard: top-15 traders' October volume (to ~10-19) $11.38M (H, /leaderboard).
- OI / TVL: none (not a custodian; DefiLlama TVL empty, H).
- Vendor claim "150,000+ registered traders, 20+ countries" (L, marketing, /about).

## Event-category overlap (arbitrage relevance)

- Sample of the latest 300 Traderline-attributed fills (26 minutes, 22 markets, $23.5K): essentially all **sports** - NFL (Cowboys vs Packers moneyline), in-play football (Brazil Serie A, Colombia Primera A, Argentina, Bolivia, Peru) moneyline, over/under totals and BTTS; one election market ($239, 1.0%) (H sample; M as a general statement; fixture `polymarket_clob_builder_trades_sample.json`). Market metadata was read from Polymarket's public Gamma API (`/markets?condition_ids=`), 22 of 22 found.
- So the relevant overlap is **sports**: the same events trade on Betfair Exchange, Kalshi sports (where offered) and sportsbooks. Traderline's own Betfair side makes Polymarket-vs-Betfair football and tennis the natural cross-venue pair; its education pages on arbitrage/dutching confirm the user base thinks this way (H, sitemap titles; M interpretation).
- Politics, macro, crypto-price: present on Polymarket but not Traderline's focus.

## Shared liquidity

- **100% shared with Polymarket (international CLOB).** Traderline orders enter the same book; builder code only labels the fill (H, Polymarket docs + DefiLlama `doublecounted: true`). Not an independent leg. Do not add its volume to Polymarket's when sizing the opportunity set.

## Signal-only value

- The `builder/trades` feed is a free, timestamped, fill-level view of a retail "ladder trader" cohort (mostly small in-play football fills; taker/maker flag, price, size, token id). Possible uses: flow-segment tagging inside the Polymarket adapter (`builderCode` -> venue-of-origin), a retail-sentiment proxy for in-play sports. Value is unproven (L/M) and requires no Traderline-specific adapter, just one extra field on Polymarket trade ingestion.

## Open questions and leads

- Betfair Exchange (Traderline's other supported exchange; official API via vendor/app keys, sports odds, deep football liquidity) is not on the covered-venue list and was not researched here. It is the natural counter-leg to Polymarket sports. Worth its own venue-spec pass (lead only, L).
- Whether `clob.polymarket.com/builder/trades` is a stable, supported public route (not in the docs index I fetched) and what its rate limit is - NOT FOUND (searched: docs llms.txt, OpenAPI for data-api v2, response headers).
- The reconciliation of USD vs shares volume is inferred: DefiLlama's USD 30d ($34.8M) divided into the Data API's 30d shares (76.3M) implies a mean fill price near 0.46, which is plausible but not independently verified (M).
- The "My Predicts" feature is unexplained beyond a privacy-policy line (NOT FOUND, searched: terms, sitemap, llms.txt).
- "Text aimed at AI agents": none found on any Traderline page. `llms.txt` contains only marketing/FAQ plus the sentence "Traderline staff will never ask for your wallet private key." (benign).

## Sources

- https://traderline.com/ (home, WebFetch summary; H)
- https://traderline.com/about (company, products, history; H)
- https://traderline.com/polymarket (Polymarket product, key import flow; H)
- https://traderline.com/download (platforms, key storage; H)
- https://traderline.com/how-traderline-works (marketing only; H that it is non-technical)
- https://traderline.com/terms-and-conditions (General, Polymarket, Betfair terms and Privacy Policy; read as raw HTML text; H)
- https://traderline.com/leaderboard , https://traderline.com/sonar (H)
- https://traderline.com/llms.txt , /robots.txt , /sitemap.xml (H; llms.txt saved as fixture)
- https://api.llama.fi/protocol/traderline-predictions ; https://api.llama.fi/overview/dexs ; https://api.llama.fi/overview/fees (H)
- https://defillama.com/protocol/traderline-predictions (HTTP 403 to WebFetch; evidence page given in the task, not read directly; API used instead)
- https://github.com/DefiLlama/dimension-adapters (files `factory/polymarket.ts` and `helpers/polymarket.ts` read via `gh api`; builder code and methodology; H)
- https://data-api.polymarket.com/v2/builders/volume and https://data-api.polymarket.com/v2/openapi.json (H)
- https://clob.polymarket.com/builder/trades?builder_code=0x6b0e...7984 (H)
- https://gamma-api.polymarket.com/markets?condition_ids=... (market metadata for the sample; H)
- https://docs.polymarket.com/llms.txt ; /programs/builders/overview.md ; /programs/builders/fees.md ; /programs/builders/tiers.md ; /concepts/resolution.md ; /concepts/pusd.md (H)
- GitHub repos `thebouta/traderline-polymarket-releases` and `nabaisu/traderline-desktop-releases`, read with `gh api` (release metadata only, nothing downloaded; H for metadata, L for ownership)
- Web search results (M): punter2pro.com/traderline-review , botblog.co.uk/traderline-review , polymart.app/traderline - third-party reviews that repeat vendor claims; used only to corroborate the Magic-key paste step.
- Project context: `docs/research/14-platform-of-platforms.md`, `docs/research/09-venues-onchain-clob.md` (DefiLlama "Interface" rows; Traderline $35.9M noted), `docs/research/08-venues-polymarket-kalshi.md`.
