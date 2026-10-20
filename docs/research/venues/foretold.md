# Foretold (foretold.io) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock ~03:25-03:45 UTC). READ-ONLY: `gh api` file reads, unauthenticated GET requests (GraphQL queries sent as HTTP GET only, never POST), no account, wallet, key, signature or PayBox tool. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed. WebSearch was unavailable (session budget used up), so no press or third-party coverage was read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each well under 50 KB): `docs/research/fixtures/foretold/` (listed in section 12).

---

## 0. Bottom line

1. **Not a market and not money.** Foretold is an open-source judgmental-forecasting registry ("prediction registry"): users post probabilities or full probability distributions on questions and are scored later. There is no order book, AMM, token, collateral, fee or payout. (H, repo README)
2. **Server is technically up, product is dead.** `www.foretold.io` returns 200 (a static SPA shell last modified 2021-03-30) and `api.foretold.io/graphql` still answers, but the newest public question was created **2022-01-06**, the newest public prediction is **2022-03-14**, and the repo's last push is **2022-12-22**. No new content for about 4.5 years. (H, API + `gh api`)
3. **Public GraphQL read API exists and is keyless**, with open introspection. Useful only as a frozen archive of 2019-2022 EA/rationalist forecasting questions. (H)
4. **No trade path, and PayBox cannot reach it** (nothing on-chain, nothing to sign). (H)
5. **adapter_priority = skip.** Dead data, no money, no overlapping live events. The one reusable idea is the data model (question + valueType + dated aggregate series), which Metaforecast already borrowed and which is itself now shut down (see 4). (H/M)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.foretold.io/` | HTTP 200, Heroku/Express, `last-modified: Tue, 30 Mar 2021 15:39:00 GMT`; 1,030-byte SPA shell, only title "Foretold.io", empty `<div id="app">`; no notice, no shutdown banner (fixture `homepage_shell_2026-10-19.html`) | H |
| Client config (`/env.*.js`) | points the SPA at `https://prediction-backend.herokuapp.com/graphql` with Auth0 login (value not copied here) | H |
| `https://api.foretold.io/graphql` and `https://prediction-backend.herokuapp.com/graphql` | both answer `{__typename}` -> `{"data":{"__typename":"Query"}}`, HTTP 200, 2026-10-19 | H |
| Newest public question | `max(createdAt)` over all 7,579 public questions = **2022-01-06T21:27:05Z**; `max(updatedAt)` = 2022-01-14T18:32:10Z (fixture `DERIVED_staleness_summary_2026-10-19.json`) | H |
| Newest public prediction | default-ordered `measurements(first:4)` -> latest `createdAt` **2022-03-14T22:35:00Z** (an AGGREGATION bot row; latest human COMPETITIVE row 2022-03-14T22:34:03Z) | H |
| Repo | `foretold-app/foretold`, MIT, not archived, 45 stars, 191 open issues, `pushed_at` **2022-12-22T11:06:32Z**; last commit on master 2021-03-30 ("Downgraded parcel-bundler to 1.12.3 for deployment issues"). The API's `updated_at` of 2026-06-24 is repo metadata (stars/watchers), not code | H |
| Sibling repos | `ken-data` pushed 2023-05-06, `widedomain` 2023-01-06, `foretold-documentation` 2019-09-13 | H |
| Metaforecast | `foretold.ts` fetcher exists (POSTs to `https://api.foretold.io/graphql`, 5 hard-coded "high quality" community ids). Metaforecast itself: README says "discontinued on July 9, 2026 ... website and the public GraphQL API are no longer available" | H |
| Announcement of closure | NOT FOUND (searched: homepage shell, README, repo tree top level, GitHub org repo list; web search unavailable) | - |

Verdict: **still_live = false in any useful sense** (hosting is up, content frozen since early 2022). Everything on the platform is older than 6 months, so treat all of it as stale.

---

## 2. Kind and market model

- **Kind (H):** forecasting-nonmoney. Free judgmental-forecasting registry with communities (channels), notebooks, bots and scoring. README: "Foretold is free & open to use of all (legal) kinds." Funding was a $90,000 Long-Term Future Fund grant (README).
- **Question ("measurable") types (H, GraphQL introspection + data):** `valueType` is `PERCENTAGE` (binary event, probability 0-100) or `FLOAT` (continuous variable, full CDF). Public counts: 6,529 FLOAT, 1,050 PERCENTAGE. There is no categorical/multi-outcome type.
- **Predictions ("measurements") (H):** `value` is one of `percentage`, `binary`, `floatPoint`, `floatCdf {xs, ys}`, `unresolvableResolution`, `comment`. `competitorType` is `COMPETITIVE` (scored human/bot forecast), `AGGREGATION` (bot-computed aggregate, can be backdated, not scored), `OBJECTIVE` (the resolution), `UNRESOLVED`, `COMMENT`.
- **No prices.** The closest analogue is the most recent `AGGREGATION` measurement (`Measurable.previousAggregate` / `recentMeasurement`). It is an opinion aggregate with no money behind it, so it is a signal, not a tradeable price.
- **Question states:** `OPEN`, `JUDGEMENT_PENDING`, `JUDGED`, `CLOSED_AS_UNRESOLVED`. Public counts: 5,145 JUDGEMENT_PENDING, 1,711 OPEN, 501 JUDGED, 222 CLOSED_AS_UNRESOLVED. 5,432 of 7,579 public questions (72%) have zero predictions. (H, derived)
- **Tokenisation:** none.

## 3. Chains and collateral

None. No blockchain, no token, no wallet. Auth is Auth0 (users) or bot tokens. (H: README "Node.js and Express.js with Apollo ... PostgreSQL ... Heroku"; client env uses Auth0)

---

## 4. Read API

**Exists: official, public, unauthenticated GraphQL** (public channels only; private communities need auth). (H)

- **Base URLs:** `https://api.foretold.io/graphql` (used by Metaforecast), `https://prediction-backend.herokuapp.com/graphql` (used by the web client). Both live. GET with `?query=` works and returns `access-control-allow-origin: *`; POST is the normal client path (I did not use it).
- **Docs:** no hosted API reference found. Sources: GraphQL introspection (open), the `foretold-documentation` GitBook repo (terminology, question-writing guide, CDF format), and README's pointer to an Observable notebook "bot-tips" (not fetched). NOT FOUND: Swagger/REST, SDK, changelog (searched: repo root, `docs/`, documentation repo).
- **Root `Query` fields (H, fixture `graphql_introspection_query_fields_2026-10-19.json`):** `measurables`, `measurable(id)`, `measurements`, `measurement(id)`, `agentMeasurables`, `agentChannels`, `channels`, `channel(id)`, `agents`, `agent(id)`, `bots`, `notebooks`, `feedItems`, `series`, `seriesCollection`, `stats`, `globalSetting`, `users`, `user`, `votes`, `permissions`, `authentication`, `authenticated`.
- **Key endpoints for an adapter:**
  - markets: `measurables(first:<=500, after:"<9-digit>", states:[OPEN], channelId, order:[{field:refreshedAt|stateOrder, direction}])` -> `total`, `pageInfo{hasNextPage,endCursor}`, `edges{node{id name valueType min max state expectedResolutionDate resolutionEndpoint measurementCount measurerCount channelId createdAt updatedAt recentMeasurement previousAggregate outcome}}`.
  - prices-equivalent: `previousAggregate` / `recentMeasurement` on each measurable; history via `measurements(measurableId, competitorType:[AGGREGATION], findInDateRange{startDate,endDate,spacedLimit})`.
  - trades: not applicable. Predictions: `measurements(...)`.
  - resolution: `Measurable.state`, `Measurable.outcome` (an `OBJECTIVE` measurement), `resolutionEndpoint`, `resolutionEndpointResponse`.
  - stats: `stats{agentCount userCount botCount measurementCount measurableCount}`.
- **Gotchas (H):** `Cursor` scalar must be a **9-digit zero-padded string** (`after:"000000499"`; an integer or plain `"499"` is rejected - source `scalars/cursor.js`, pattern `^[0-9]{9}$`; confirmed live); `first`/`last` are `Int500`; `measurements` default order is newest first and `last:N` returned the same newest rows as `first:N`; enum `states` is `[OPEN|JUDGED|JUDGEMENT_PENDING|CLOSED_AS_UNRESOLVED]`.
- **Auth for writes (H, source):** `Authorization: Bearer <token>` or `?token=`. Users exchange an Auth0 JWT (`authentication(auth0jwt, auth0accessToken)`); bots exchange a long-lived bot `authToken` for a JWT (`exchangeAuthToken`). Read of public channels needs no auth. Bot creation requires a logged-in user, which I did not do.
- **Rate limits (H source, M behaviour):** `graphql-rate-limit` rule keyed by client IP, `max: 50, window: '1s'` (code comment: "Here we need to make empiric tests"); not tested live. README asks API users to "let me know beforehand" for "serious use".
- **Websocket:** none. `subscriptionType` is `null` (H).
- **Scale (H, `stats`, 2026-10-19):** 892 agents, 819 users, 68 bots, 19,411 measurements and 9,820 measurables lifetime (public + private). Public API sees 7,579 measurables and 13,688 measurements.

## 5. Trade path

**None.** There is no money to place. The only write surface is forecasting: GraphQL mutations `measurementCreate`, `measurableCreate`, `measurableUpdate`, `channelCreate`, `botCreate`, etc. (introspected, H), authenticated with a user or bot JWT. Writes score reputation only. I did not call any mutation.

- **PayBox reachable: no.** No EVM or Solana transaction, no order signing, no contracts. Reason: not a financial venue.

## 6. Fees

None (free to use). No trading, deposit or withdrawal. (H, README "free & open"; no fee text found anywhere: NOT FOUND, searched README, documentation repo, schema.)

## 7. Resolution mechanism and dispute risk

- **Resolution is by the question creator (owner)**: README/documentation: "Questions have creators who are responsible for resolving (answering) them." When `expectedResolutionDate` passes, an `OPEN` question moves to `JUDGEMENT_PENDING` until the owner posts an `OBJECTIVE` measurement (-> `JUDGED`), cancels it (`CLOSED_AS_UNRESOLVED`), or edits the date (back to `OPEN`). Optional `resolutionEndpoint` URL is fetched at the expected date. Owners can overwrite a wrong resolution. (H)
- **No dispute process, no oracle, no stake.** Dispute risk is the owner's discretion. Empirically most questions never resolve: 5,145 of 7,579 public questions (68%) are stuck in JUDGEMENT_PENDING. (H, derived)

## 8. Geo / ToS / automation

- No geo restriction, ToS or privacy page found (the SPA serves the same shell for every path; README has no ToS). NOT FOUND (searched: README, documentation repo, homepage shell).
- Automation is explicitly supported: "Users can create bots that get scored individually. They can use the same GraphQL API that the Foretold.io client uses." Requested courtesy: "if you intend to make serious use of the API, please let me know beforehand." Code is MIT. (H, README)
- No legal-risk angle: no money, no securities/gambling issue.

## 9. Liquidity

Not applicable (no money). Activity proxy (H, 2026-10-19): latest public prediction 2022-03-14; 56 `OPEN` questions have an expected resolution date after today (max 17 predictions each, mean ~3.6; one is literally "Test Question" dated 2120); lifetime public prediction volume 13,688. There is no TVL/OI/volume in USD.

## 10. Event overlap with other venues

None that matters. Title keyword counts over 7,579 public questions (M, regex on titles, fixture `DERIVED_title_keyword_and_future_open_2026-10-19.json`): politics ~179 (mostly 2019-2024 US/Brexit items such as "Biden approval rating greater than 50%"), COVID ~58, crypto ~34 (e.g. "Bitcoin above 100K" in a 2019-2020 list), macro ~7, sports ~2. The 56 still-"open" future-dated questions are long-horizon EA/AI-safety/science items (e.g. poverty rate in 2030), with no counterpart on a live money venue. No arbitrage surface.

## 11. Shared liquidity

None; independent but empty. It does not share liquidity with any venue. Its former value was as a Metaforecast source, which is also shut down.

## 12. Fixtures saved (`docs/research/fixtures/foretold/`)

| File | Content |
|---|---|
| `homepage_shell_2026-10-19.html`, `homepage_response_headers_2026-10-19.txt` | the 1 KB SPA shell and status/last-modified/server headers |
| `graphql_stats_2026-10-19.json` | `stats` counts |
| `graphql_introspection_query_fields_2026-10-19.json` | root `Query` fields and args |
| `graphql_measurables_open_first3_2026-10-19.json` | first 3 OPEN questions |
| `graphql_measurables_judged_first3_2026-10-19.json` | first 3 JUDGED questions with `outcome` |
| `graphql_measurements_percentage_sample_2026-10-19.json` | 4 predictions on one PERCENTAGE question incl. an `OBJECTIVE` resolution and an `AGGREGATION` |
| `graphql_latest_measurements_first4_2026-10-19.json` | newest 4 public predictions (2022-03-14) |
| `graphql_channels_first12_2026-10-19.json` | first 12 public channels |
| `DERIVED_staleness_summary_2026-10-19.json` | my aggregation over all 7,579 public questions |
| `DERIVED_title_keyword_and_future_open_2026-10-19.json` | keyword counts and future-dated open questions |

The Auth0 client id and Intercom id in the SPA's `env.*.js` were deliberately not saved.

## 13. Adapter priority: **skip**

Dead content (no activity since March 2022), no money, no trade path, no live-event overlap, MIT code and an open API that only expose a frozen archive. If an aggregator wants a "signal-only" historical-forecasts corpus, it could import the 7,579 public questions once, but this has no value for edge or arbitrage. Revisit only if someone relaunches the product with new activity (monitor `stats.measurementCount` > 19,411 or `max(createdAt)` > 2022-03-14).

## 14. Open questions

- Whether any private communities remain active (stats lifetime 19,411 measurements vs 13,688 public, so ~5.7k private predictions exist, but nothing in 2022+ is observable without a login).
- Whether `www.foretold.io` login (Auth0) still works. Not tested (no account creation).
- Observable "bot-tips" notebook content not read.

## Sources

- https://www.foretold.io/ (H; shell fetched with curl, headers recorded)
- https://api.foretold.io/graphql and https://prediction-backend.herokuapp.com/graphql (H; GET queries, introspection, data pages, 2026-10-19)
- https://github.com/foretold-app/foretold (H; README, DEVELOPMENT.md, `packages/server/src/graphql/{authentication.js,authorizers/rate-limit.js,types/measurables.js,types/scalars/cursor.js,middlewares/context.js}`, `lib/authentication/authentication-primary.js`; repo metadata via `gh api`)
- https://github.com/foretold-app/foretold-documentation (H; README, best-practices-writing-questions.md)
- https://github.com/quantified-uncertainty/squiggle/tree/main/apps/metaforecast (H; README shutdown notice, `src/backend/platforms/foretold.ts`)
- docs/research/14-platform-of-platforms.md in this repo (M; earlier Metaforecast notes, consistent with the above)
