# Metaculus venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

- Kind: reputation-based forecasting aggregator, NOT a market. No money, no order book, no AMM, no token, no chain. (H: FAQ and AI Products Terms say so.)
- Live: yes, active in October 2026. (H)
- Adapter priority: P2 (signal-only), and effectively blocked. The API requires a token, returns the Community Prediction (CP) as `null` for ordinary accounts, and forbids commercial use without a separate written agreement. Do not build an adapter before a written data agreement with Metaculus.
- Arbitrage leg: impossible. There is nothing to buy or sell and no PayBox/wallet path. Only possible role is a probability signal (like Quotient) once data access is granted.

## 1. Still live (2026)?

- H: `https://www.metaculus.com/questions/` returned HTTP 200 on 2026-10-19 (title "Question Feed | Metaculus"). The page lists topics and tournaments "Metaculus Cup Summer 2026", "US Midterms 2026" and a "2026 Iran War" topic, and its server-rendered payload contains question timestamps dated 2026-10-12 and 2026-10-19.
- H: GitHub `Metaculus/metaculus` (BSD-2-Clause, not archived) had commits on 2026-10-16 and 2026-10-17, for example "Document API gateway filtering in OpenAPI spec (#5261)".
- H: Terms of Use source in that repo is marked "Last Modified: September 21, 2026".
- M: NEXTPredict lists it as a crowdsourced forecasting platform, "not a prediction market", where forecasters "never stake any of their own money" (https://nextpredict.io/platforms/metaculus/). Founded 2015, public benefit corporation (M, same page; the repo About page also says "Public Benefit Corporation", H).

## 2. Kind and market model

- No trading. Users submit probabilities; Metaculus aggregates them into a "Community Prediction", a recency-weighted median (H: FAQ source `front_end/src/app/(main)/faq/page.tsx`). The `Question` schema in OpenAPI also names `recency_weighted` and `unweighted` aggregations.
- Question types (H, OpenAPI `Question.type`): `binary`, `multiple_choice`, `numeric`, `discrete`, `date`. Post-level types also include `conditional`, `group_of_questions`, `notebook`.
- Outcome encoding (H, OpenAPI forecast schemas): binary uses `probability_yes`; multiple choice uses a probability per option; continuous types use a 201-point CDF. There are no tokens or shares.
- Multiple-choice and group sub-question CPs are NOT forced to sum to 100% (H: FAQ "Why don't question group outcome probabilities sum to 100%?"). Normalise before comparing with market prices.
- Scoring uses peer, baseline, spot_peer and spot_baseline scores (H, OpenAPI enum). Leaderboards and medals, plus sponsor-funded prize pools in some tournaments (H: FAQ; M: NEXTPredict says up to $50,000).
- Metaculus's own terms: it "does not operate a prediction market, and does not accept or facilitate wagers" (H: `ai-products-terms/page.tsx`, section 8.2, effective 2026-09-21).

## 3. Chains and collateral

- None. No chain, no collateral, no token. (H: by design, see above.) NOT FOUND (searched: repo tree for contracts/solidity/web3, ToS, FAQ, OpenAPI) any on-chain component.

## 4. Read API

- Exists: official, but authenticated and gated (not public).
- Docs: `https://www.metaculus.com/api/` (Swagger UI; the spec file at `/static/openapi.*.yml` sat behind a Cloudflare challenge for scripted GET). Spec source (H): `docs/openapi.yml` in `https://github.com/Metaculus/metaculus`, read with `gh api -H "Accept: application/vnd.github.raw"`.
- Base URL: `https://www.metaculus.com` (paths under `/api/...`). A closed-source "filtering API gateway" sits in front of the open-source backend on metaculus.com (H, OpenAPI description).
- Auth (H): header `Authorization: Token <token>`. Token generated on the account settings page, "API Access" section. Unauthenticated requests get 403.
- Confirmed by unauthenticated GET on 2026-10-19 (H): `GET /api/posts/?limit=1` returned `403` with body "Permission Error: The API is only available to authenticated users. Please create an account and use your API token to access the API." Saved in `docs/research/fixtures/metaculus/api_posts_unauthenticated_403.txt`.
- Documented endpoints (H, all of the spec's paths):
  - `GET /api/posts/` feed. Filters: `tournaments`, `statuses` (upcoming/closed/resolved/open), `forecast_type`, `categories`, `forecaster_id`, `with_cp`, `include_cp_history`, `include_descriptions`, `open_time__gt`, `published_at__gt`, `scheduled_resolve_time__gt`, `limit`, `offset`, `for_main_feed`, `order_by` (published_at, open_time, forecasts_count, scheduled_close_time, scheduled_resolve_time, weekly_movement, divergence, hotness, ...).
  - `GET /api/posts/{postId}/` post details.
  - `GET /api/data/download/`, `POST /api/data/email/` bulk CSV exports (only for projects the account has been granted).
  - `POST /api/questions/forecast/`, `POST /api/questions/withdraw/`, `POST /api/questions/bulk-forecast-comment/`, `GET/POST` bulk-forecast-read, `POST /api/comments/create/`, `GET /api/comments/`.
- Field gating for Restricted accounts, the default tier (H, OpenAPI description):
  - Aggregation data (CP and everything else) is `null` on all questions except about 50 in a bot-testing project (id 32977) and any project the account has been granted.
  - Question text is returned only while a question is open, or if you forecast on it. `resolution` is returned only for questions you forecast on, or in accessible projects.
  - Aggregation history and `possibilities`: only for the Unrestricted tier, which Metaculus grants on request.
  - A Bot Benchmarking tier adds CP and resolutions for about 250 open and 250 resolved questions (project 32979).
  - Comments require `author=<own id>` or `author_is_staff=true`.
- Rate limits: the spec says "request throttling apply", but NOT FOUND numeric limits (searched: OpenAPI, ToS, AI Products Terms). Treat as unknown.
- Websocket / streaming: NOT FOUND (searched: OpenAPI, repo tree grep, FAQ).
- Fixture limits: no authenticated call was made (no account or API key was created). So no real 200 response shape was captured. A 24KB excerpt of the OpenAPI Question and Forecast schemas is in `docs/research/fixtures/metaculus/openapi_excerpt.yml`.
- Other surfaces mentioned in the ToS: a "Radiant API and MCP server" (Radiant is a forecasting and modelling service; H, `ai-products-terms`). It is not a market-data feed. NOT FOUND any docs for it in the repo tree.

## 5. Trade path

- None. `POST /api/questions/forecast/` submits a probability forecast (reputation-scored), not an order. No signing scheme beyond the API token. No money moves. (H)
- Reachable through PayBox? No. There is no wallet, chain, escrow or payment surface, so no transaction proposal or signed order exists. Submitting forecasts would not use PayBox at all.

## 6. Fees

- None for users. Free to forecast (M: NEXTPredict). Prize pools, where present, are sponsor-funded (M). The Radiant product uses non-monetary "Credits" (H: `ai-products-terms`, "Credits are not money").
- Commercial API/data access is a negotiated written agreement. Price NOT FOUND.

## 7. Resolution and dispute risk

- Resolved by Metaculus staff/admins against each question's written resolution criteria (H: FAQ). Anyone can tag @admins to flag a late or wrong resolution.
- Outcomes can be Yes/No, a value, `Ambiguous` or `Annulled` (H: FAQ). Questions can be re-resolved if Metaculus decides the original resolution was in error (H: FAQ "Can questions be re-resolved?"). Admins may also clarify or edit criteria on open questions.
- Implication for a signal feed: question wording is free-form and long, so each Metaculus question needs a human or model-checked match to a market contract. Resolution rules can differ subtly from a market's rules (for example, initial-report vs final-result). No bonded dispute process exists, because nothing is staked.

## 8. Geo, ToS and automation (primary source: repo source of the live Terms of Use; the live page itself returned 403 to scripted GET)

- Service available to individuals age 16 and over (H: ToS "Age and Residence Requirements").
- Content licence is "limited, personal, non-exclusive, non-commercial" (H). Scraping is prohibited, quoting: you agree not to "copy, or procure content or information from the Service by automated means (such as scripts, bots, spiders, crawlers, or scrapers)" except through "an API provided by Metaculus ... or unless formally authorized by Metaculus under separate written agreement" (H: ToS, licence section).
- AI/ML: using the Service or Content "to train or otherwise create or develop any artificial intelligence or machine learning model or algorithm without Metaculus's prior written permission" is prohibited (H: ToS and OpenAPI description). Matters if signals feed a learned model.
- OpenAPI description (H): "any commercial use whatsoever requires a separate written agreement". Commercial and non-commercial requests go through the "Metaculus Data Needs Form"; contact `api-requests@metaculus.com` (Metaculus's published address).
- AI Products Terms 5.3 (H): no systematic extraction of Metaculus Data and no building a competing product via Radiant; no reselling or white-labelling.
- Consequence for this project: an aggregation/arbitrage product that republishes or trades on CP is almost certainly "commercial use". Scraping the public website for CP (the web UI does show CP to anonymous viewers, M: server-rendered payload contains `recency_weighted` history) is a ToS violation. Do not do it.

## 9. Liquidity

- No liquidity (no money). Activity proxies only, taken from one GET of the public feed page on 2026-10-19 (M, parsed from the server-rendered payload, 24 questions on the first page): per-question `nr_forecasters` up to 1,781 and `forecasts_count` up to 30,145.
- Total platform volume or user counts: NOT FOUND (searched: About page source, FAQ source, feed page; WebSearch budget for the session was exhausted, so no 2026 third-party figures were gathered).

## 10. Event-category overlap (where signal could map to markets)

- Site topics seen 2026-10-19 (H, WebFetch of the feed page): Economy & Business, Politics, Geopolitics, Artificial Intelligence, Technology, Health & Pandemics, Elections, Environment & Climate, Natural Sciences, Sports & Entertainment, Law, Space, Social Sciences, Nuclear, Cryptocurrencies.
- Overlap with market venues: US midterms 2026 (dedicated tournament and `midterms-2026` pages, H), Fed/macro and economy questions, crypto prices, geopolitics and conflicts. Sports is a topic but is thin relative to market venues (M, inferred from the topic list only).
- Matching is semantic, not by shared IDs. Many Metaculus questions are long-dated, science or AI related, or conditional/numeric, and have no market equivalent.

## 11. Shared liquidity

- None. Independent, and also not tradable. (H)

## 12. Adapter notes (if access is ever granted)

1. Get an Unrestricted or project-granted account via the data form; confirm commercial terms in writing before any code.
2. Poll `GET /api/posts/?statuses=open&with_cp=true&forecast_type=binary&order_by=-forecasts_count&limit=...`. Tolerate `null` in every field (the gateway nulls instead of omitting).
3. Normalise: binary CP to a probability in [0,1]; multiple choice needs renormalising; skip numeric/date types unless mapped to a market ladder via the CDF.
4. Treat as signal-only: store CP, `nr_forecasters`/`forecasters_count`, and close/resolve times; never emit order intents.

## Sources

- https://www.metaculus.com/api/ (H, Swagger shell loaded 200; the spec `.yml` hit a Cloudflare challenge, so the repo copy was used)
- https://github.com/Metaculus/metaculus (H: `docs/openapi.yml`, `front_end/src/app/(main)/terms-of-use/page.tsx`, `front_end/src/app/(main)/ai-products-terms/page.tsx`, `front_end/src/app/(main)/faq/page.tsx`, recent commits via `gh api repos/Metaculus/metaculus/commits`). These files are repo source, which is the likely source of the live pages but is not the live page itself.
- https://www.metaculus.com/questions/ (H for liveness, M for activity counts)
- https://nextpredict.io/platforms/metaculus/ (M)
- https://nextpredict.io/platforms/ (M: lists Metaculus in a menu only; the page itself gives no details)
- Fixtures: `docs/research/fixtures/metaculus/api_posts_unauthenticated_403.txt`, `docs/research/fixtures/metaculus/openapi_excerpt.yml`

## NOT FOUND (searched)

- Live Terms of Use page, FAQ page and static OpenAPI file: HTTP 403 / Cloudflare challenge for scripted GET (not bypassed). Repo source used instead.
- Numeric API rate limits, websocket/streaming API (OpenAPI, ToS, AI Products Terms, FAQ).
- Any authenticated 200 response sample (no account or token created, by rule).
- Total platform volume, user counts and 2026 prize totals (About page source, FAQ, feed page; WebSearch budget exhausted).
- Commercial data-licence price or terms (only the request form is referenced).

## Suspicious content

- None found. The repo's `Claude.md` file contained ordinary developer instructions for that project (build/lint commands); it was not followed and has no bearing here.
