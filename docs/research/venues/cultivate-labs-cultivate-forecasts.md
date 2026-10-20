# Cultivate Labs / Cultivate Forecasts - venue spec

Researched 2026-10-19. Verdict: **skip** as a trading venue (not a market). At most a P2/skip "signal-only" feed, and only per-tenant with the tenant's permission.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## Summary
- Cultivate Labs (Chicago) sells enterprise crowd-forecasting software (Cultivate Forecasts) and an AI product line (Hinsley, Hinsley AI Forecaster). Company is live in 2026: blog posts dated Jan 12, Jan 16, Jan 22, Feb 27 and Sep 25 2026 [H, https://www.cultivatelabs.com/blog]. GitHub repo CultivateLabs/raif pushed 2026-10-15 [H, gh api].
- **It is not a prediction market.** Its own support article states: "Please note that the Cultivate Forecasts platform no longer supports prediction markets." (article undated) [H, https://www.cultivatelabs.com/support/forecasts/crowdsourced-forecasting/the-ultimate-guide-to-prediction-markets]. The older features page still advertises "trade in prediction markets" [H, https://www.cultivatelabs.com/forecasts_features_hosting] and the cultivateforecasts.com landing page title still says "Prediction Markets & Crowdsourced Forecasting" [H, curl]; both are stale marketing relative to the support article. The newer /forecasts page never mentions markets or trading [H].
- Forecasts are probability submissions scored (Brier-style) against resolution, aggregated into a consensus. No money, no order book, no AMM, no tokens [M/H as above].
- Multi-tenant SaaS: each client has a private site `<tenant>.cultivateforecasts.com` (e.g. ohio.cultivateforecasts.com, "Ohio University Predictions", sign-up/sign-in, exists 2026-10-19) [H, curl]. The vendor page says questions are private by design: "Your questions, your forecasters, your data - never visible to a public community" [H, https://www.cultivatelabs.com/forecasts].

## Market model
- Kinds: yes/no (Forecast::Binary::Question), multiple-answer, open-ended; each question has `answers[]` with a consensus `probability` string [H, API docs source in GitHub CultivateLabs/forecasts-api-docs, `_questions.md`; features page].
- Individual forecasts are "prediction sets" (one probability per answer). Consensus computed by mean, weighted mean, median, weighted median, voting, weighted voting, logit, l2e [H, `_aggregate_predictions.md`].
- No tokenisation, no collateral, no chain. Older API docs have `/positions` that only record the user's latest forecast per answer, not a holding [H, `_positions.md`].

## Read API
- Exists, authenticated per-tenant. OAuth2 password grant: `POST https://<tenant>.cultivateforecasts.com/oauth/token` with grant_type=password, email, password; Bearer token, `expires_in` 7200 [H, forecasts-api-docs `source/index.html.md`]. Requires a real user account on that tenant (which I did not create).
- Docs: https://github.com/CultivateLabs/forecasts-api-docs (Slate source; last commit 2023-09-26 "Add comment creation API docs" - docs may be stale vs 2026 product) [H gh api; M for currency]. Features page confirms "REST API or open-standard (.csv) reports" [H]; /forecasts page lists "REST API and webhook events" [H]. No hosted public docs site found (docs.cultivatelabs.com does not resolve; /api 404) [H].
- Endpoints (all under `/api/v1/` unless noted; page param 0-based pagination): `questions` (filters ids, tags, challenges, ...), `prediction_sets` (filters question_id, membership_id, created/updated before/after), `positions` (own only), `scores`, `comments`, `memberships`, `users`, `badges`, `stars`, `surveys`, `votes`, `clarifications`, plus `/aggregation/api/v1/questions` for consensus under 8 methods [H].
- Push: webhook POSTs for question create/update/resolve/clarification; set up by contacting vendor tech support [H, `_push_apis.md`].
- Rate limits: NOT FOUND (searched: forecasts-api-docs README/_errors.md (generic Slate template text), site pages).
- Websocket: NOT FOUND.
- Unauthenticated confirmation: `GET https://ohio.cultivateforecasts.com/api/v1/questions` returns HTTP 401 with `www-authenticate: Bearer realm="Doorkeeper"` [H]. Fixture: `docs/research/fixtures/cultivate-labs-cultivate-forecasts/ohio-api-v1-questions-unauth-401-headers.txt`. No live 200 response shape was obtainable without an account; shapes below are from doc excerpts (illustrative sample data dated 2015): `forecasts-api-docs-questions-excerpt.md`, `forecasts-api-docs-aggregate-excerpt.md`.

## Trade path
None. The API allows submitting prediction sets (POST) but that is a forecast, not a trade; nothing settles in money. PayBox/EVM wallet reachability: **no** - no chain, no contracts, no payments.

## Fees, collateral, chains
None. Revenue is enterprise SaaS licensing (pricing not published; "Schedule a Demo") [H]. Hosting: shared/dedicated on AWS via Heroku or on-prem Docker; SAML2 SSO [H, features page, M for currency].

## Resolution
Question admins resolve/void questions; API exposes `resolved_at`, `voided_at`, `resolution_notes`, `clarifications` [H]. Centralised, per-tenant; no dispute process documented (NOT FOUND, searched: support article, features page, API docs).

## Geo / ToS / automation
NOT FOUND for public ToS on automation (searched: cultivatelabs.com, cultivateforecasts.com landing; did not read legal pages). Access requires tenant-issued accounts; scraping tenant sites without authorisation should be treated as out of bounds.

## Liquidity
No money liquidity; N/A. Participation counts are per tenant and not published. Some tenants run prize-based tournaments (Ohio University: weekly prizes per a secondary search result [M/L, undated]).

## Event categories / overlap
Tenant-specific: corporate, government/IC, university questions (INFER, Firesight are described as client programs [H, blog index summary via WebFetch]). Some tenants carry sports/entertainment/economics questions (Ohio, M/L). Overlap with money venues is incidental and unreliable; there is no price to arbitrage against - only a crowd probability.

## Shares liquidity?
N/A (no liquidity). Not an independent arbitrage leg.

## Adapter priority
**skip** (as a venue). If the aggregator wants a "non-price signal" interface, a generic `ConsensusFeed` adapter could ingest `/aggregation/api/v1/questions` for a tenant whose operator grants credentials; this is a bespoke B2B integration, not a market adapter.

## Open questions
- Whether any Cultivate tenant is publicly readable without login (the INFER/other public sites were not checked).
- Current API version/parity with the 2023 docs; rate limits.

## Sources
- https://www.cultivatelabs.com (H)
- https://www.cultivatelabs.com/forecasts (H)
- https://www.cultivatelabs.com/forecasts_features_hosting (H)
- https://www.cultivatelabs.com/support/forecasts/crowdsourced-forecasting/the-ultimate-guide-to-prediction-markets (H)
- https://www.cultivatelabs.com/blog (H, index via WebFetch summary)
- https://github.com/CultivateLabs/forecasts-api-docs (H; last commit 2023-09-26)
- https://github.com/CultivateLabs (H, org repo list)
- https://www.cultivateforecasts.com, https://ohio.cultivateforecasts.com (H, curl)
- Web search results incl. App Store listing (iOS v1.7.3, 2025-06-18) and aggregator pages (M/L)

## Suspicious content
None observed.
