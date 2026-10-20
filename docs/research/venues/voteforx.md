# VoteForX (voteforx.com) - adapter spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = inferred, L = weak/stale.

## Verdict
SKIP. The marketing site is up, but the backend API host (api.voteforx.com) returns "Service Suspended" (HTTP 503, header `x-render-routing: suspend`) on every path tried, so no market data is retrievable. [H]
The product looks like a centralized, white-label prediction-market web app, not an on-chain venue. [H/M]
The npm "LMSR calculator" lead is a small helper package with about 50 downloads/month. It is not a venue. [H]

## Identity and liveness
- Site https://www.voteforx.com serves HTTP 200 (Nuxt SPA, title "VoteForX - Prediction Market Trading Platform - PredictMarket"). [H]
- API base from the page's runtime config: `https://api.voteforx.com`. All of `/`, `/api/events`, `/api/markets`, `/api/events/open`, `/api/markets/1/orderbook` returned 503 "This service has been suspended." Other paths (`/events`, `/markets`, `/docs`, `/api/health`) hit a Cloudflare "Just a moment" challenge. The SSR payload of the homepage itself embeds the 503 from `/events/open`, so the homepage shows no markets. [H]
- Marketing copy is generic. The docs page mentions credit/debit cards, bank transfers and PayPal. The footer says "Copyright 2024". The terms page body is empty (title only) and has no usable text. The blog post is dated 2025-01-01. [H]
- Roadmap says Phase 1 (centralized web platform) completed 2024-Q4. Phase 3 (smart contracts, wallet connectivity, on-chain data, planned 2025-Q4) is not done: no contract addresses or chain config appear in the site bundles. API access for institutional traders is listed as a Phase 4 (2026-Q2) plan. [H]
- The site's own bundle text advertises a white-label kit: "Market maker bots with LMSR algorithm", "Unlike AMM-based clones, provides better liquidity", "ONLY COMPLETE SOLUTION", "NOWPAYMENTS INTEGRATED - Accept 300+ cryptocurrencies", 4 languages (EN/ZH/ZH-HK/KO). The OG image points to predictmarket.com. [H] That suggests VoteForX is a demo or template of a sellable script (M).
- Discovery lead: npm package `@binyyds/lmsr-calculator`, created 2025-09-22, last modified 2025-09-29, latest 1.0.9, repo `voteforx/voteforx_maker` (packages/lmsr-calculator). Downloads 2026-09-17 to 2026-10-16: 50. [H] https://registry.npmjs.org/@binyyds%2Flmsr-calculator, https://api.npmjs.org/downloads/point/last-month/@binyyds/lmsr-calculator
  - The repo returns 404 via the GitHub API (private, deleted or renamed). A GitHub search for "voteforx" found only an unrelated repo. [H]
  - The package README (Chinese) is a pure math library (LMSR prices and purchase cost, liquidity parameter B), with no network code. [H]
  - The npm metadata includes a maintainer contact; deliberately not reproduced here.
- Linked social: https://x.com/voteforx (HTTP 200 to a bare fetch; content not inspected). [H for URL only]
- vote4x.com is a GoDaddy parking page (unrelated). [H]

## Market model
- Centralized limit order book with per-outcome YES and NO books (frontend calls `/markets/{id}/orderbook` and reads `data.orderbooks.yes.bids` / `no.bids`), plus LMSR "market maker bots" providing quotes. Binary markets are shown. Categorical/scalar are not evidenced. [M, inferred from client bundle code and marketing copy]
- Outcome tokenisation: none on-chain (off-chain positions via `/users/me/dashboard`). Shares pay $1.00 per winning share (docs page). [H for the docs claim, M for off-chain]
- Frontend routes reference Politics, Sports and other categories. [H]

## Chains and collateral
NOT FOUND (searched: site docs, Nuxt bundles for contract addresses/chain IDs, terms page, GitHub). No on-chain component evidenced. Funding is described as card, bank, PayPal and crypto via NOWPayments (custodial, deposit-address style). [H for copy, M for architecture]

## Read API
- Exists: none public. The backend is suspended. The frontend's internal API is `https://api.voteforx.com/api/...` with `Authorization: Bearer <token>` and 401 redirects to `/login`. [H, from bundle]
- Endpoints seen in the client (unverified, host suspended): `/events/open`, `/markets/{id}/orderbook`, `/users/me/dashboard`, `/api/users/me`. [H that the client calls them, no response shapes confirmable]
- Docs URL: none for an API (https://www.voteforx.com/docs is a generic "Getting Started" page). No WebSocket evidence. Rate limits: NOT FOUND.
- Fixtures: `docs/research/fixtures/voteforx/api-events-open-503-2026-10-19.txt` (the suspension response) and `docs/research/fixtures/voteforx/npm-lmsr-calculator-meta.json`.

## Trade path
None. Account/login-gated centralized app; no documented API trading, no signed orders, no transaction proposals. A PayBox EVM/Solana wallet cannot trade it (only a custodial deposit via NOWPayments is described, and that is not reachable now). paybox_reachable: no.

## Fees
Docs page claims "Competitive trading fees starting at just 1%". The client shows a `fee_rate` field per market. Formula and payer: NOT FOUND. [L]

## Resolution
Docs claim a "transparent, verifiable resolution process". Mechanism and disputes: NOT FOUND. Roadmap lists a "decentralized market resolution system" as a planned item (not done). Centralized operator resolution, so high counterparty risk. [M]

## Geo / ToS / automation
Terms page renders only its title, so no content to quote. KYC integration was listed in the Phase 1 roadmap. Automation rules: NOT FOUND.

## Liquidity
No volume/OI/TVL data obtainable (API suspended; homepage shows no events). Effectively zero for the purposes of an aggregator. [H that data is unavailable]

## Overlap and shared liquidity
Claimed categories (politics, sports, economics, crypto) overlap other venues in principle, but with no live feed there is nothing to compare. Liquidity appears to be its own LMSR bots, not shared with another venue. [M]

## Adapter priority: skip
Reasons: backend suspended, no public API, no on-chain settlement, centralized and custodial, likely a demo/white-label template, thin npm lead.
Revisit only if api.voteforx.com resumes and publishes docs. A cheap re-check is `GET https://api.voteforx.com/api/events/open`.

## Sources
- https://www.voteforx.com (and /docs, /roadmap, /blog/voteforx-story, /term), Nuxt bundle `/_nuxt/BieXXFKJ.js` and chunks [H]
- https://api.voteforx.com (503 suspended, 2026-10-19) [H]
- https://registry.npmjs.org/@binyyds%2Flmsr-calculator and https://api.npmjs.org/downloads/point/last-month/@binyyds/lmsr-calculator [H]
- GitHub API lookups of voteforx/voteforx_maker (404) and search "voteforx" [H]
- Web search: not available (session search budget exhausted), so no third-party coverage was checked.

## Suspicious content
None found aimed at AI agents. Note: the Cloudflare challenge pages were returned for some API paths (not followed).
