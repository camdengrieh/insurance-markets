# ModelX (Prediction Exchange for LLMs) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. ModelX is a fake-money LLM trading benchmark by a single developer, not a venue with real collateral. Its only known host (Railway) now returns "Application not found", so it appears to be taken down. There is no real-money trade path and no independent liquidity.

## Is it live?

- No. `GET https://model-x.up.railway.app/` returns HTTP 404 with body `{"status":"error","code":404,"message":"Application not found",...}` and header `x-railway-fallback: true`, on 2026-10-19. This is Railway's response for a deleted or never-deployed app, not an app-level 404. H - fixture `site-root-404.txt`
- `GET /api/markets` on the same host also returns 404 (same cause, so this does not show that the path is absent). H
- The only primary source is the Show HN post by user "Entropnt", 2026-04-22, 4 points, 0 comments. H - https://news.ycombinator.com/item?id=47859244 (fixture `hn-item-47859244.json`, from https://hn.algolia.com/api/v1/items/47859244)
- The author said they had run "a single market with free models for the past day or two" and would settle it manually. H (same source)
- No GitHub repo, docs site, token or contract was found. NOT FOUND (searched: HN Algolia search for "ModelX Prediction Exchange"; WebSearch budget was exhausted this session, so no general web or GitHub search was possible, which lowers confidence that no repo exists). I did not run any gh code search.

## Kind and market model

- kind: forecasting-nonmoney (an LLM evaluation harness, not a prediction market for people). H - HN post: "LLMs trade derivative contracts that settle to real-world numbers using fake money".
- Contracts settle to a real-world number (scalar-style derivative), not binary YES/NO. H
- Matching: batched 30-minute sealed-auction cycles. Market Makers post sealed two-sided quotes, "Hedge Funds" send market orders against the residual order book, and everyone is matched simultaneously. Not an AMM and not parimutuel. H
- Outcomes are not tokenised. Positions are rows in a private engine. M

## Chains and collateral

- None. Fake money, no chain, no tokens. H

## Read API

- exists: **none** (nothing documented, and the host is down). NOT FOUND (searched: root URL, `/api/markets`, HN thread). No docs, no auth or rate-limit info, no websocket.

## Trade path

- None. Only LLM agents controlled by the operator trade. There is no signing or wallet scheme. A PayBox EVM or Solana wallet cannot trade it, and there would be nothing to settle in anyway. H/M

## Fees

- NOT FOUND (fake money; probably none).

## Resolution

- Manual settlement by the operator ("until I manually settle the market"). H. Single-operator trust, which is irrelevant for fake money.

## Geo / ToS / automation

- NOT FOUND. No ToS page was reachable.

## Liquidity

- None real. Single market, free-model participants, a day or two of operation in April 2026 (stale, over 6 months). H/L

## Event overlap and shared liquidity

- No overlap with real venues that can be used for arbitrage. The traded numbers were chosen by the operator, and the post names none. It shares no liquidity with any other venue, but it has no real liquidity either.
- Possible use is as a benchmark of model trading behaviour only, not as a signal source. Not recommended.

## Suspicious content

- None found. The site returned no page content, and the HN post contained no instructions aimed at AI agents.

## Sources

- https://model-x.up.railway.app/ (404, 2026-10-19) H
- https://news.ycombinator.com/item?id=47859244 (Show HN, 2026-04-22) H
- https://hn.algolia.com/api/v1/items/47859244 (the same post via the HN API, fetched 2026-10-19) H
- Fixtures: docs/research/fixtures/modelx-prediction-exchange-for-llms/

## Open questions

- Whether the project moved to a new domain or repo. Not searchable this session. It is irrelevant to the priority because the project is fake-money either way.
