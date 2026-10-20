# Cultivate Labs (Cultivate Forecasts) - venue spec (-832)

Researched 2026-10-19. Verdict: **skip** as a market/arbitrage leg. Not a prediction market; no money, no prices, no public API.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale. A sibling note from a parallel pass exists at `cultivate-labs-cultivate-forecasts.md`; this pass re-verified its key points.

## Summary
- Cultivate Labs (Chicago) is live in 2026: vendor of enterprise crowd-forecasting SaaS (Cultivate Forecasts) and AI products (Hinsley, Hinsley AI Forecaster, Hinsley AirGap) [H, https://www.cultivatelabs.com]. GitHub org active: `raif` pushed 2026-10-15, `transatlantic-trade-outlook-index` pushed 2026-10-06 [H, gh api orgs/CultivateLabs/repos].
- **Not a prediction market.** Support article: "the Cultivate Forecasts platform no longer supports prediction markets" (undated) [H, https://www.cultivatelabs.com/support/forecasts/crowdsourced-forecasting/the-ultimate-guide-to-prediction-markets, re-fetched today]. The cultivateforecasts.com landing page `<title>` still says "Prediction Markets & Crowdsourced Forecasting" - stale marketing [H, curl].
- **INFER is dead**: infer-pub.com no longer resolves; www.infer-pub.com 301s to randforecastinginitiative.org, which states "The RAND Forecasting Initiative has concluded ... a permanent read-only archive. Accounts, forecasting, and comments are no longer available"; lineage Foretell (CSET) -> INFER (UMD ARLIS) -> RAND Forecasting Initiative, platform "built and operated by Cultivate Labs"; 3,433 forecasters, 200,901 forecasts, 409 questions [H, https://www.randforecastinginitiative.org/]. This supersedes the hint that INFER is a live lineage. rand.cultivateforecasts.com now 302s to the marketing landing page [H, curl].
- Inkling Markets (acquired) is not evidenced as live; not checked beyond hint [L].

## Market model
- Forecasters submit probabilities on binary, multi-choice, or numeric questions; consensus by mean/median/accuracy- or recency-weighted aggregation; Hinsley AI Forecaster can add AI estimates into the aggregate; Brier-style scoring, leaderboards [H, https://www.cultivatelabs.com/forecasts].
- No order book, AMM, parimutuel pool, tokens, or prices. Output is a crowd probability only.

## Chains and collateral
None. No chain, no contracts, no collateral, no money settlement [H as above]. Some tenants may run prizes (Ohio University, weekly prizes, secondary/undated) [L].

## Read API
- Exists: official-authenticated, per-tenant. `https://<tenant>.cultivateforecasts.com/api/v1/...` (OAuth2 Doorkeeper bearer). Unauth GET `https://ohio.cultivateforecasts.com/api/v1/questions` -> HTTP 401, `www-authenticate: Bearer realm="Doorkeeper"` [H, fixture `docs/research/fixtures/cultivate-labs-cultivate-forecasts-832/ohio-api-v1-questions-unauth-401-headers.txt`].
- Docs: no hosted site; Slate source in https://github.com/CultivateLabs/forecasts-api-docs, last pushed 2023-09-26 (possibly stale) [H for existence, M for currency]. Per sibling note (read from that repo): endpoints questions, prediction_sets, scores, memberships, `/aggregation/api/v1/questions`; password-grant OAuth `POST /oauth/token`, `expires_in` 7200 [M - not re-read this pass]. /forecasts page confirms "REST API, webhook events, CSV/JSON exports" [H].
- Rate limits: NOT FOUND (searched: cultivatelabs.com pages, forecasts-api-docs). Websocket: NOT FOUND. Webhooks exist, set up via vendor [M].
- No public unauthenticated data: tenant questions are private by design; the only public programs found (RAND/INFER) are closed archives. No 200 response shapes obtainable without an account (none created).

## Trade path
None. Submitting a prediction set is a forecast, not a trade. PayBox reachable: **no** (no chain, no payments).

## Fees
None for forecasters. Vendor revenue is enterprise licensing; pricing unpublished ("Schedule a Demo") [H].

## Resolution
Centralised: tenant question admins resolve/void; no dispute mechanism documented. NOT FOUND (searched: /forecasts, support article).

## Geo / ToS / automation
NOT FOUND for user ToS on automation (searched: cultivatelabs.com, /disclosure). /disclosure is a security vulnerability policy only: asks testing only of accounts you own or have permission for; prohibits DDoS/spam/social engineering [H, https://www.cultivatelabs.com/disclosure]. No geo restriction stated. Accessing tenant APIs requires tenant-issued accounts.

## Liquidity
N/A (no money). Participation figures unpublished except the closed RFI archive (200,901 forecasts total, historical) [H].

## Event categories / overlap
Corporate, government/IC, university and policy questions (customers listed: Shell, P&G, Ford, UBS, DARPA, DTRA, UK Cabinet Office, RAND, Ohio University) [H, /forecasts]. Geopolitics/tech/policy overlap with money venues is incidental. Cultivate also publishes a monthly "Transatlantic Trade Outlook Index" (static GitHub Pages site, Hinsley AI forecast) - a macro-ish signal at best [H, repo README].

## Shares liquidity?
N/A - no liquidity. Not an independent arbitrage leg. At most a non-price consensus signal (a generic ConsensusFeed adapter would need tenant-operator credentials - bespoke B2B).

## Adapter priority
**skip** - not a market, no public API, INFER/RFI closed.

## Open questions
- Whether any Cultivate tenant remains publicly readable (RAND/INFER closed; Bertelsmann public program not checked).
- Current API parity with 2023 docs; rate limits.
- Web search budget was exhausted this pass; no extended searches performed.

## Sources
- https://www.cultivatelabs.com (H)
- https://www.cultivatelabs.com/forecasts (H)
- https://www.cultivatelabs.com/disclosure (H)
- https://www.cultivatelabs.com/support/forecasts/crowdsourced-forecasting/the-ultimate-guide-to-prediction-markets (H)
- https://www.randforecastinginitiative.org/ (H; via 301 from www.infer-pub.com)
- https://ohio.cultivateforecasts.com/api/v1/questions (H, 401)
- https://www.cultivateforecasts.com, https://rand.cultivateforecasts.com (H, curl)
- https://github.com/CultivateLabs (H, gh api org repos), CultivateLabs/forecasts-api-docs, CultivateLabs/transatlantic-trade-outlook-index README (H)

## Suspicious content
None observed.
