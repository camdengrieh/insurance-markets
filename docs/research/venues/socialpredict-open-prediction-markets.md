# SocialPredict (Open Prediction Markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:50-04:00 UTC). READ-ONLY: `gh api` file reads, WebSearch/WebFetch, unauthenticated GETs to the two public instances named in the project README. No account, login, signup, wallet, key, POST or PayBox tool was used. Third-party pages and API responses were treated as untrusted data; nothing in them was followed (no embedded instructions found).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/socialpredict-open-prediction-markets/` (listed in section 12).

---

## 0. Bottom line

1. **This is self-hostable play-money software, not a venue.** SocialPredict is a Go + Postgres + React web app that anyone can deploy with Docker. Balances are an internal credits ledger in the instance's own database ("wallet", "credits", "points"; a per-user debt allowance of 500 credits is the default). There is no chain, no token, no collateral, no wallet connection. (H: `backend/docs/openapi.yaml`, `README/README-CONFIG.md`, `README/MATH/README-MATH.md`; a repo-wide code search for `ethereum`, `USDC`, `cryptocurrency`, `stripe` returned no hits, M for the search method.)
2. **The only two public instances are empty.** `kconfs.com` (staging, redeployed on every merge to `main`) and `brierfoxforecast.com` ("model office", tracks releases) are up (`/health` = `live`, `/readyz` = `ready`) but `GET /api/v0/markets?status=all` returns `{"markets":[],"total":0}` on both, and `/api/v0/system/metrics` reports `numUsers = 1` (H, 2026-10-19; the README itself says staging "may be reset, load tested, or temporarily unavailable").
3. **No public signup, no wallet auth.** Users are created only by an admin (`POST /v0/admin/createuser`); login is username/password returning a JWT. There is no EVM/Solana path and nothing for PayBox to sign. (H: `backend/server/server.go` route table, `README/LOCAL_SETUP.md`.)
4. **Even a populated private instance could not be an arbitrage leg**: the currency is not redeemable for anything, the instance operator is also the resolver, and prices come from a thin parimutuel-like formula (WPAM), not a book or AMM.
5. **adapter_priority = skip.** A generic read-only adapter for a self-hosted instance would be cheap (about 5 GET endpoints, section 4), so keep it as a "bring-your-own-instance" idea only if a user ever runs SocialPredict for a private forecasting group. Nothing to integrate today.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Repo | `openpredictionmarkets/socialpredict`: MIT, not archived, 229 stars, 120 open issues, created 2023-11-10, `pushed_at` 2026-09-28T14:34Z (`gh api repos/...`). Latest default-branch commit seen 2026-08-19 (dependency bumps plus a DBPM docs clarification). 17 contributors | H |
| Releases | v3.8.1 published 2026-08-07; v3.8.0 2026-07-29; v3.7.1 2026-07-16 (`gh api repos/.../releases`). Active release cadence | H |
| Public instance 1 | `https://kconfs.com` staging: `/health` 200 `live`; `/ops/status` `{"live":true,"ready":true,...}`; markets empty; frontend `last-modified` 2026-08-07 (matches v3.8.1) | H |
| Public instance 2 | `https://brierfoxforecast.com` "model office / production-style": same results, markets empty | H |
| Another listed host | `openprediction.xyz` (a "staging instance" per a Manifund page): DNS does not resolve (curl exit 6, 2026-10-19) | H (DNS), M (Manifund page, undated 2024-25) |
| Real usage | README "Used By": Kenyon College course PSCI 303. EA Forum post dated 2025-09-26 also names St. Lawrence University (2024 class) and says comments are off and position calculations have problems that can leave the last bettor at a loss | H (README), M (EA Forum via WebFetch summary) |

Verdict: **the software is alive and maintained; the "venue" has no trading activity.** `still_live = true` for the project, false in the sense of an operating market.

---

## 2. Kind and market model

- **Kind (H):** self-hosted, closed-membership, play-money prediction market engine (classrooms, companies, internal use). Manifund page: aimed at "walled-off settings such as educational or internal corporate settings" (M). Each deployment is an isolated database; instances do not federate.
- **Binary markets (H):** `outcomeType` string on create, `yesLabel` / `noLabel` custom labels (max 20 chars), resolution `YES | NO | N/A`. Create body: `questionTitle` (<=160), `description` (<=2000), `resolutionDateTime`, `tagSlugs` (<=5).
- **Multi-answer = bundle of independent binaries (H):** "market groups" (`groupType: MULTIPLE_CHOICE_BINARY`, `probabilityPolicy: INDEPENDENT_BINARY`), 2-50 answers, each a normal binary child market. Child probabilities are independent and need not sum to 1; resolution policy `INDEPENDENT_CHILDREN` or `EXCLUSIVE_HELPER` (pick one winner, rest NO). Answers can be added after trading starts via a moderator-reviewed flow.
- **No scalar markets** found (NOT FOUND, searched OpenAPI and `server.go` routes).
- **Pricing (H, `README/MATH`):** WPAM (Weighted Probability Adjustment Model): `P_new = (P_init * I_init + A_YES) / (I_init + A_YES + A_NO)`, where `I_init` is the creator subsidy (10 credits by default), `A_YES`/`A_NO` are cumulative amounts bet on each side. This is a cumulative-stake ratio, not an order book and not an AMM with a curve (M: my reading of the documented formula; I did not read the Go implementation of sells).
- **Payout (H):** DBPM (Divergence-Based Payout Model): after resolution the pool is split into YES/NO pools by the resolution probability, then each bet is weighted by its deviation from the final probability. "Shares" are whole integers; sales round down to whole shares and retain "dust" (capped by `maxDustPerSale`, default 1). The math README for DBPM steps is partly incomplete (the "Market Outcome Update Formulae" heading is empty in `README-MATH.md`; the full text is in `README-MATH-PROB-AND-PAYOUT.md`).
- **Tokenisation:** none. Positions are rows in Postgres (`bets` as signed amounts, sells stored as negative share counts); there is no share token. (H: `README-MATH-MARKET-FLOWS.md`.)
- **Roadmap items (M):** the repo has `README/PROJECT_MANAGEMENT/ORDER_BOOK.md` (planning document, not read); variable economics and automated market makers are described as lower priority than backend work (Manifund page, M).

---

## 3. Chains and collateral

- **Chain:** none. **Collateral:** none; internal credits. Defaults from `README/README-CONFIG.md` (H, but see note): `initialAccountBalance: 0`, `maximumDebtAllowed: 500`, `minimumBet: 1`, `createMarketCost: 1`, `traderBonus: 2`, `betFee: 0`, `sellSharesFee: 0`.
- Live values on both public instances (`GET /api/v0/stats` -> `setupConfiguration`, H, 2026-10-19) differ from the README defaults: `createMarketCost 10`, `traderBonus 1`, `initialBetFee 1`, `buySharesFee 0`, `sellSharesFee 0`, `minimumBet 1`, `maxDustPerSale 1`, `maximumDebtAllowed 500`, `initialMarketSubsidization 10`, `groupAddAnswerCost 2`. Economics are set per instance at install and are "meant to be set up permanently for the entirety of the run" (README-CONFIG, H).

---

## 4. Read API

Official, documented, **public (unauthenticated) for market data**. Not a venue-wide API; each deployment has its own base URL.

- **Docs (H):** `backend/docs/README.md` and `backend/docs/openapi.yaml` (OpenAPI 3.0.3, about 8.4k lines, "version 0.1.0", generated from the Go handlers). Each instance serves `GET /openapi.yaml` and Swagger UI at `/swagger/`. Source-of-truth order stated in the docs: `server.go`, handlers, `openapi.yaml`, README. API is "in a staged migration from older raw/partial responses toward more consistent JSON envelopes", so some market routes return raw DTOs and others `{ok, result}` envelopes.
- **Base URL:** the backend listens on `:8080` and serves `/v0/...`; the shipped nginx templates expose it at `https://<host>/api/v0/...` (H: `data/nginx/vhosts/*/default.conf.template` has `location /api/`; live `env-config.js` says `API_URL: "https://kconfs.com/api"`). Infra routes `/health`, `/readyz`, `/ops/status`, `/openapi.yaml`, `/swagger/` are served at the host root.
- **Key unauthenticated GETs (H from OpenAPI + `server.go`; live-confirmed only where marked):**
  - `GET /v0/markets?status=active|closed|resolved|all&limit<=100&offset=&tagSlug=&created_by=` -> `{markets:[{market:{id,questionTitle,description,outcomeType,resolutionDateTime,creatorUsername,stewardUsername,yesLabel,noLabel,status,lifecycleStatus,isResolved,resolutionResult,createdAt,updatedAt,tags}, creator, lastProbability, numUsers, totalVolume, marketDust, descriptionAmendments}], total}` (live: returns the empty envelope, so the populated shape is spec-only)
  - `GET /v0/markets/{id}` (details incl. `probabilityChanges[]`, `numUsers`, `totalVolume`, `marketDust`), `GET /v0/markets/search`, `GET /v0/markets/status/{status}`, `GET /v0/read/markets/{id}/summary`, `GET /v0/read/market-discovery/{slug}`
  - Price history/trades: `GET /v0/markets/bets/{marketId}` (`username, amount, outcome, probability, placedAt`; usernames are public), `GET /v0/markets/positions/{marketId}`, `GET /v0/markets/{id}/leaderboard`
  - Hypothetical buy: `GET /v0/markets/{id}/projection?amount=&outcome=YES|NO` and `GET /v0/marketprojection/{marketId}/{amount}/{outcome}` -> projected probability
  - Groups: `GET /v0/market-groups/{id}`, `/bets`, `/positions`, `/leaderboard`
  - Platform: `GET /v0/stats` (H live), `/v0/system/metrics` (H live), `/v0/global/leaderboard` (H live, empty), `/v0/market-tags` (H live, empty). Some reporting routes can be gated by an admin "reporting visibility" setting.
- **Auth:** none for the reads above; `POST /v0/login {username,password}` returns a JWT `{ok,result:{token,username,usertype,moderatorStatus,mustChangePassword}}` used as `Authorization: Bearer` (H, OpenAPI). First-login users must change their password before private actions work.
- **Rate limits (H, `backend/security/ratelimit.go`):** in-process, per client IP. Defaults: general 1 request/s with burst 10; login 1 attempt per 10 s with burst 3. Over limit -> HTTP 429 `{ok:false, reason:"RATE_LIMITED"|"LOGIN_RATE_LIMITED"}`. Operators can change this; per-process, not distributed.
- **Websocket / SSE / webhooks:** NOT FOUND (searched: OpenAPI, `server.go` routes). Poll only. Read models are cached with a stated target freshness of 900 s for some widgets (live leaderboard fixture: `targetFreshnessSeconds: 900`).
- **Reads for the aggregator's purposes:** `lastProbability` plus `totalVolume` per market would be enough for a signal adapter on a private instance.

---

## 5. Trade path

- **Programmatic trading exists but is account-based, not signature-based (H, OpenAPI):** `POST /v0/bet {marketId, amount (integer credits), outcome: "YES"|"NO"}` -> 201; `POST /v0/sell/quote` then `POST /v0/sell` (sell by credit amount, whole shares, dust retained). Bearer JWT from `POST /v0/login`. Market creation `POST /v0/markets` needs an approved moderator/admin in "moderator mode".
- **No signed orders, no on-chain tx, no EVM/Solana address anywhere.** A PayBox wallet has nothing to sign; "reachable through PayBox" = **no**. (I did not call any trade, login or signup route.)
- Operational caveat: the repo's dev docs ship a default `admin`/`password` login for local installs; irrelevant for aggregation but a reminder that private instances can be weakly secured. Manifund page (M): "deploying versions past v0.0.3 to production on the web leaves the backend and database exposed" was an earlier warning, and v0.0.4+ notes say security was tightened; the project still describes "plenty of edge cases where the software could fail".

---

## 6. Fees

- Per-instance configuration (live staging values, H): buy fee 0, sell fee 0, **first-bet participation fee `initialBetFee` = 1 credit per user per market** (paid to the market steward on non-N/A resolution), market creation cost 10 credits (refunded on rejected proposals), trader bonus 1, sale dust up to 1 credit retained by the market, minimum bet 1.
- Steward "work profit" = number of unique participants x `initialBetFee` (H, `market_resolution.go`), net of creation cost for reporting. Users can go into debt up to `maximumDebtAllowed`.

---

## 7. Resolution mechanism and dispute risk

- **Manual, by the market steward.** `POST /v0/markets/{id}/resolve {resolution: YES|NO|N/A}` by the creator/current steward (an admin can reassign stewardship). Groups: modes `exclusive_yes`, `manual`, `na`. (H: OpenAPI, `market_resolution.go`.)
- **No oracle, no dispute window, no bond.** Titles are immutable; descriptions can be amended additively through a moderator/admin review queue (H, README). In moderator mode, admins approve markets before they trade.
- Dispute risk for an aggregator: **maximal** (a single steward, appointed or reassigned by the instance admin, resolves and earns the participation fees, on a play-money ledger).

---

## 8. Geo / ToS / automation

- No ToS, geo-restriction or automation policy found on the repo or the two public instances (NOT FOUND, searched: README, `SECURITY.md`, `CONTRIBUTING.md` names, `STAGE_SETUP.md`, instance root pages). The only rules are the code's rate limiter and the MIT license. `SECURITY.md`: "we will only support the master branch", report issues via GitHub issues. Each private instance's operator sets their own rules.

---

## 9. Liquidity

- Public instances: **0 markets, 1 user, 0 volume** (`/api/v0/stats` and `/api/v0/system/metrics` on both hosts, 2026-10-19, H). `activeBetVolume 0`, `totalMoneyInCirculation 0`.
- Aggregate private deployments: unknown and unobservable (no registry). Clone counts in the README badge (about 15k clones / 219 unique cloners in 14 days) are not usage (M, CI and bots inflate clones).
- Even where traffic exists, it is play-money credits, so no dollar value exists to compare.

---

## 10. Event-category overlap and shared liquidity

- Overlap: none standing. Categories are whatever each operator creates (the repo's example seed SQL includes a political question, "Trump nominated for 2028", used as sample data; H file listing, M inference). Admin-managed tags exist; the live tag list is empty.
- Shared liquidity: **no** - isolated instances, no federation, no external backing. Not an independent arbitrage leg: the price is not tradable against real money at all.
- Signal value (Quotient-style signal use): negligible. Prices come from a small closed group's credits and a stake-ratio formula.

---

## 11. Integration notes (only if someone self-hosts one)

If a user wants to track their own SocialPredict instance in the aggregator as a signal source:
1. Config: `baseUrl` (e.g. `https://host/api`), no credentials needed for reads.
2. Poll `GET /v0/markets?status=active&limit=100&offset=N` -> map `market.id`, `questionTitle`, `lastProbability` (YES price), `totalVolume`, `resolutionDateTime`, `isResolved`, `resolutionResult`. Group membership (`marketGroup`) appears only on `GET /v0/markets/{id}` details, not in the list shape. Use `/v0/markets/bets/{id}` for trades. Treat as `play_money = true`, `tradable = false`.
3. Respect the default 1 request/s limit per IP (burst 10) and 429 handling.
4. Identify the market by `(instanceBaseUrl, marketId)`; there is no global ID.

---

## 12. Fixtures saved

All taken with `User-Agent: insurance-markets-research/0.1`, GET only, on 2026-10-19.

| File | Source | Note |
|---|---|---|
| `kconfs_markets_all_2026-10-19.json` | `GET https://kconfs.com/api/v0/markets?status=all&limit=2` | `{"markets":[],"total":0}` |
| `brierfox_markets_all_2026-10-19.json` | same on `brierfoxforecast.com` | empty |
| `kconfs_stats_2026-10-19.json` | `/api/v0/stats` | envelope plus live economics config |
| `brierfox_stats_2026-10-19.json` | same | identical config |
| `kconfs_system_metrics_2026-10-19.json` | `/api/v0/system/metrics` | `numUsers 1`, volume 0 |
| `kconfs_ops_status_2026-10-19.json` | `/ops/status` | liveness/readiness JSON |
| `kconfs_global_leaderboard_2026-10-19.json`, `kconfs_market_tags_2026-10-19.json`, `kconfs_home_2026-10-19.json` | respective routes | empty read models |

No populated market response could be captured (no public data exists), so the market list/detail/bet shapes in section 4 are **spec-derived (H for the OpenAPI text, not live-verified)**.

---

## 13. Not found / open questions

- NOT FOUND: any public instance with markets; any hosted multi-tenant SocialPredict service; any scalar or order-book market in shipped code; websocket/SSE; ToS or geo policy; a registry of deployments.
- Unverified: allowed `outcomeType` values (spec says free string); whether other schools or companies run public read-only instances (search found none; the only third-party mention is a Manifold market about a plan, M).
- A SoftwareSeni article returned by search claimed self-hosting needs "smart contract deployment and oracle integration"; that contradicts the repo (Go/Postgres/Docker, no contracts) and was disregarded (L).

---

## Sources

- https://github.com/openpredictionmarkets/socialpredict (repo metadata, releases, commits, contributors via `gh api`) - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/README.md - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/backend/docs/README.md and `.../backend/docs/openapi.yaml` - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/backend/server/server.go (route table) - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/backend/security/ratelimit.go - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/backend/internal/domain/markets/market_resolution.go - H
- https://github.com/openpredictionmarkets/socialpredict/blob/main/README/README-CONFIG.md, `README/LOCAL_SETUP.md`, `README/MATH/README-MATH.md`, `README/MATH/README-MATH-PROB-AND-PAYOUT.md`, `README/MATH/README-MATH-MARKET-FLOWS.md`, `SECURITY.md` - H
- https://kconfs.com and https://brierfoxforecast.com (`/health`, `/ops/status`, `/env-config.js`, `/api/v0/*` unauthenticated GETs, 2026-10-19) - H
- https://forum.effectivealtruism.org/posts/kEwzcExWgqFfXX6LA/open-source-prediction-market-socialpredict-production-grade (2025-09-26, WebFetch summary) - M, possibly stale (more than 6 months old)
- https://manifund.org/projects/future-proofing-forecasting-easy-open-source-solution (2024-25, WebFetch summary) - M/L, stale
- WebSearch (extended) "SocialPredict open source prediction market platform openpredictionmarkets deployment instance" - M
