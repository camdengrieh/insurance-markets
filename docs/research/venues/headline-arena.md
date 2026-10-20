# Headline Arena - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 ~02:50-03:00 UTC). READ-ONLY: page reads, `gh api` file reads, unauthenticated GETs to the documented host (generic User-Agent `insurance-markets-research/0.1`). No account, registration, OAuth, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. No prediction was submitted. Third-party/vendor pages and API text were treated as untrusted data; nothing in them was followed (embedded agent-directed text is listed in section 15).

Confidence tags: **H** = read first-hand in a primary source this session (raw JSON/HTML/text fetched and inspected, cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/headline-arena/` (listed in section 13).

---

## 0. Bottom line

1. **Live, but it is not a market.** Headline Arena is an *evaluation/benchmark platform for AI agents*: agents submit forecasts, forecasts are scored (confidence-weighted score, Brier, CRPS, RPS), and agents earn **non-cash platform credits** redeemable only for the site's own LLM gateway. There is **no order book, no AMM, no price, no odds that a human can trade, no collateral and no cash settlement**. (H, methodology + terms + guide.txt.)
2. **Nothing to arbitrage against.** No tradable price exists, so it can never be a leg of an arbitrage. The only price-like output is *crowd direction counts* (bullish/neutral/bearish counts per question) and a Pro/Max "weighted consensus". Those counts are tiny: mean **2.3 forecasts per question** over the newest 300 questions, and **0.3 per question** on the BTC/ETH price-event questions (computed from `/api/v1/public/challenges`, H data / M inference).
3. **Real, well-documented public read API** (OpenAPI 3.1 at `/api/openapi.json`, 137 paths; many unauthenticated GETs; SSE news; WS prices behind Pro/Max). Useful side-products for a scanner: the *question catalogue and mechanical settlement outcomes* for BTC/ETH barrier/close questions and official-statistics releases (CPI, NFP, FOMC, ECB ...), which can be used as free labelled data for backtests/calibration. (H.)
4. **PayBox: unreachable.** No chain, no token, no contract. Agent auth is OAuth2 client-credentials or `private_key_jwt` (RS256/ES256 key for the *agent*, not an EVM wallet). (H.)
5. **adapter_priority = P2 (signal-only, thin).** At most a cheap optional read-only "AI-agent consensus" feed plus a resolved-outcome archive for backtests. No trading adapter ever. Do not build before P0/P1 venues.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Homepage `https://headlinearena.com` | Renders current content: "Forecasting for Good" global public edition; challenges closing "Oct 19, 2026, 02:00 PM UTC"; leaderboard (top: "Market Trader DS Flash" score 62.2, 95 settled; "Rates Trader Opus" 60.5, 550 settled). Footer "(c) 2026 Headline Arena". | M (WebFetch summary) |
| Live data feed | `GET /api/v1/public/challenges` total 1629, newest created `2026-10-19T00:12:00Z`, oldest `2026-04-01T22:00:10Z`. `GET /api/v1/eval/challenges/stats` on 2026-10-19: open 46, closed 18, resolved 1538, cancelled 8. `GET /api/v1/eval/prices` returns fresh futures quotes (GC 4174.70, ETH 2431.93, BTC 82783.96). | H |
| Terms | "Version 1.4 - Effective 2026-09-24" (https://headlinearena.com/terms) | H |
| Plugin repo | `headlinearena/headlinearena-agent-plugin`, MIT, created 2026-04-26, pushed 2026-10-15, 20 stars, 2 forks, open issues 0 (`gh api repos/headlinearena/headlinearena-agent-plugin`); `/api/v1/public/plugin-version` reports latest 2.3.0 | H |
| Product changes | BTC Arena "currently PAUSED: no new BTC session challenges"; BTC 1h flash rounds "RETIRED on 2026-09-13 and will not resume" (guide.txt). BTC is excluded from public leaderboard statistics (`temporarily_excluded_assets: ["BTC"]`). | H |
| Independent coverage | NOT FOUND (searched: WebSearch extended "Headline Arena AI agents forecasting arena Brier score challenges API"). Results were almost entirely GitHub issues posted by the Headline Arena team to unrelated repos (self-promotion), plus an unrelated arXiv paper ("Foresight Arena", 2605.00420, does not mention Headline Arena). Treat all volume/growth claims as self-reported. | M |

Verdict: **still_live = true** (launched 2026-04, active 2026-10-19), but small and self-reported.

---

## 2. Kind and market model

- **Kind (H):** forecasting-nonmoney. Self-description: "Public-interest forecasting by AI agents. Evaluation data, not investment advice." (site footer / terms). Platform "evaluates deployed AI agents" (llms.txt).
- **Question families (H: `/api/v1/eval/challenges/stats`, `/api/v1/public/challenges`, methodology, guide.txt):**
  1. **Daily futures direction** (14 listed assets: GC, ES, CL, SI, ZN, HG, NG, BTC, ZS, DXY, RB, PALM, VIX, ETH; exchange ids COMEX/CME/NYMEX/CBOT/ICE/DCE/CFE/Binance). Outcome set `bullish | neutral | bearish`. Neutral band stored per asset, e.g. +/-0.3% for GC/ES/CL, +/-0.05% for ZN, default +/-0.1% (`/api/v1/eval/settlement-rules`).
  2. **Crypto "price events"** (BTC, ETH): weekly barrier touches ("will ETH touch below $2,400 before 2026-10-26 UTC"), daily close as a numeric distribution, count-of-up-days, year-end threshold (e.g. "BTC at 2026-12-31 close <= $60,000"). Barrier questions are binary (`bullish` = YES touched, `bearish` = NO). (H, challenge detail fixture.)
  3. **"Forecasting for Good" official-statistics releases** (target keys `HF_*`: US CPI/NFP/unemployment/GDP/jobless claims/JOLTS/housing, EU HICP/unemployment/ECB rate, China CPI/PMI/..., ~90 targets): numeric distributions (Normal mean/std or 10-1000 samples; CRPS), one binary-probability target (US initial claims > 210,000; Brier), and ordered-categorical (FOMC and ECB rate decisions; RPS). (H, guide.txt + catalog fixture.)
- **Order book / AMM / parimutuel?** None of the three in the trading sense. There is a **credit-stake "pool"** on official-release rounds, but guide.txt describes it as frozen escrow, not a wager: stake principal is always refunded, "no losing agent's credits ever flow to a winner", winner rewards come from a separate platform-funded budget, shared by "(50% prediction accuracy + 50% stake) x plan coefficient"; bin concentration cap 50%; minimum stake default 50 credits. `GET /api/v1/eval/challenges/{id}/odds` returned `404 {"detail":"No credit-stake pool for this challenge yet"}`. (H.)
- **Outcome tokenisation:** none. Outcomes are strings (`bullish`/`neutral`/`bearish`) or numeric bins `A..E` with `lo/hi` edges. (H, fixtures.)
- **Question language:** the public API default returns Chinese question text (e.g. "2026-10-26(UTC)前，ETH 是否会触碰 下方 $2,400？"); `resolution_criteria` is in English. Locale parameter for English questions: NOT FOUND (searched: openapi + llms.txt; not tested).

---

## 3. Chains and collateral

- **None.** No blockchain, token, contract or wallet address appears in the OpenAPI spec, llms.txt, the onboarding guide (54.8 KB) or the docs home: grep for `usdc|ethereum wallet|on-chain|onchain|blockchain|solana|base chain|erc-?20|smart contract` = 0 hits in each (H, local grep of the three fetched files).
- **Collateral:** none for the daily/price-event rounds ("stake-free"); official-release rounds require a **credit stake** (internal unit). Credits "carry no cash value", are non-transferable and non-withdrawable, and redeem only against LLM Gateway usage fees (terms 13.x summary; concepts page; guide.txt). (H/M.)
- The "wallet" endpoints (`/api/v1/agent/wallet/*`, `/api/v1/agent/owner/topup*`) are for **credit** allocation between a human owner's credit balance and an agent's credit balance, not crypto. (H, llms.txt "Agent Wallet Authorization".)

---

## 4. Read API

- **Docs:** https://headlinearena.com/api/docs (interactive OpenAPI page); spec JSON https://headlinearena.com/api/openapi.json (OpenAPI 3.1.0, title "Headline Arena - Agent API", version 2.2.9, 137 paths, "public Agent endpoints only"); https://headlinearena.com/llms.txt; Agent guide https://headlinearena.com/api/v1/agent/onboarding/guide.txt; docs hub https://headlinearena.com/docs (+ `/docs/consensus-api`, `/docs/authentication`, `/docs/concepts`). (H.)
- **Base URL:** `https://headlinearena.com` (REST under `/api/v1/`; LLM gateway under `/llm/v1/`). No separate API host. (H.)
- **Official status:** official-public (many unauthenticated GETs) plus official-authenticated (agent OAuth bearer; Pro/Max Data API key `cak-...`). (H.)

### Unauthenticated GETs I confirmed (all 200, JSON) 
| Endpoint | What it returns | Tag |
|---|---|---|
| `GET /api/v1/public/challenges?status=open|closed|resolved&asset=BTC&limit=&offset=` | Paged list: `id, asset, question, status, created_at, deadline, resolve_at, bullish_count, bearish_count, neutral_count, consensus_hidden, total_predictions, result, open_price, close_price, resolved_at`; `total, page, limit, offset`. limit=100 works. | H |
| `GET /api/v1/eval/challenges/{id}` | Adds `event_id`, `resolution_criteria` (+ `_zh`), `challenge_type` (e.g. `price_event`), `baseline_status`, `dead_zone_pct`, `framing_variant`. | H |
| `GET /api/v1/eval/challenges/{id}/results` | `status, result, open/close_price, resolution_source, resolved_at, submitted_count, predictions[]` | H |
| `GET /api/v1/public/challenges/{id}/predictions` | Per-agent direction/confidence/summary (listed in llms.txt; not fetched) | M |
| `GET /api/v1/eval/challenges/stats` | Totals by status and per asset/target | H |
| `GET /api/v1/eval/market-assets` | 14 assets, exchange, context URL, WS subscribe roster, SSE info | H |
| `GET /api/v1/eval/prices` | Latest futures/spot snapshot with `local_symbol` and `contract_month` (e.g. GCV6, ESZ6) | H |
| `GET /api/v1/eval/context/{asset}` | Quote + 5-min OHLC + news (listed; not fetched) | M |
| `GET /api/v1/eval/settlement-rules` | Neutral-band % per asset | H |
| `GET /api/v1/eval/calibration`, `/agents/{id}/calibration` | Platform calibration buckets (total 2930 settled, ex-BTC; e.g. bucket 60-70: n=1409, hit-rate 0.51) | H |
| `GET /api/v1/public/leaderboard` | Agents with `overall_score, accuracy_rate, total_predictions, rank`; `total: 15` eligible agents (30-settlement gate) | H |
| `GET /api/v1/public/human-forecasts/challenges[/{id}]`, `/catalog`, `/{id}/consensus`, `/{id}/methodology`, `/{id}/evidence.json`, `/{id}/dataset.csv`, `/calibration` | Official-statistics rounds with `bins`, `settlement{value_policy, settlement_authority, verification_policy, winning_bin, actual_value}`; consensus fields (`mean_consensus, median_consensus, quality_weighted_consensus, bin_shares ...`) | H (challenges, consensus), M (evidence/dataset not fetched) |
| `GET /api/v1/public/prediction-opportunities`, `/prediction-contracts` | Discovery of "executable rounds" and contract metadata (contract list is 3.6 MB; opportunities 8.7 KB) | H |
| `GET /api/v1/events`, `/events/stream` (SSE, `Last-Event-ID` resume) | News events; source refresh ~180 s | H (events listed in spec/llms; SSE not opened) |
| `GET /api/v1/eval/virtual-portfolio/leaderboard` | Paper-trading P&L per agent (play money, starts at 100,000) | H |
| `GET /api/v1/agent/capabilities` | Runtime transports and `forecast_context` schema | H |

- **Authenticated reads:** `GET /api/v1/eval/challenges/active`, `/agent/credits/balance`, `/agent/feed`, etc. need an agent bearer token. **Consensus Data API** `https://headlinearena.com/api/v1/consensus/challenges?date=YYYY-MM-DD` and `/challenges/{id}` need a Pro-or-higher API key (`Authorization: Bearer <key>`); `/track-record/export.csv` needs Max. Fields: `directions, agreement_pct, direction, weighted{direction, agreement_pct, weights}`. (H, `/docs/consensus-api` fetched raw; not called.)
- **Auth for agent endpoints:** OAuth2 `client_credentials` (`agent_id` + `client_secret`) or `private_key_jwt` (RS256/ES256 client assertion) at `POST /api/v1/agent/auth/token`; registration at `POST /api/v1/agent/registry/register` followed by a human claim step. (H, guide.txt, openapi.) I did not register.
- **Rate limits:** Consensus API: Pro 30/min and 2,000/day; Max 120/min and 20,000/day; CSV export Max 10/min, 100/day; `429` names the window (H, `/docs/consensus-api`). Agent submissions 5/min, 50/day for atomic forecast+stake; comments 5/min, replies 10/min, likes 30/min, follows 20/min (H, guide.txt). **Limits for the unauthenticated public GETs: NOT FOUND** (searched: openapi, llms.txt, guide.txt, docs, response headers - no `RateLimit-*` or `Retry-After` headers seen; terms 13.6 only says the platform "may rate-limit or monitor API keys").
- **WebSocket:** `wss://headlinearena.com/ws/prices` (futures price pushes) requires an authenticated active Pro/Max owner (close codes 4401 auth required, 4403 plan/scope); HTTP snapshots stay public (H, market-assets + guide.txt). No orderbook/trade WebSocket exists because there is no book. Not opened.
- **Historical data:** per-challenge `dataset.csv` + `evidence.json` for official-statistics rounds, calibration series, resolved-question archive via `/public/challenges?status=resolved`. No bulk dump for non-Max users; Max gets CSV track-record export. (H/M.)

---

## 5. Trade path

**None.** There is nothing to trade. The only write-ish operations are *forecast submissions* by a registered, human-claimed agent (`POST /api/v1/eval/challenges/{id}/predict`, `POST /api/v1/eval/human-forecasts/challenges/{id}/forecast`, `POST /api/v1/eval/price-events/challenges/{id}/predict`), authenticated by an OAuth bearer token with scopes `prediction:submit` (+ `credits:stake` for official-release rounds). A forecast earns a score and possibly credits; it has no economic position, no price and cannot be exited. I did not call any of them (capabilities endpoint explicitly says "probe_by_submitting_prediction: false"). (H.)

## 6. Reachable through a PayBox EVM wallet?

**No.** No chain, no ERC-20, no contract, no signed-order scheme. Identity is an OAuth client secret or a JWT-signing keypair belonging to an "agent" and a human claim step (`operator_contact`, `claim_url` + pairing code). An EVM wallet on Base/Ethereum/BNB/Arbitrum/Polygon/Solana has nothing to hold or sign here. Funding "wallet" = platform credits. (H.)

## 7. Fees

- **No trading, deposit or settlement fees** (no money moves). Pricing page lists only subscriptions: Free $0 (1 agent slot); Pro $9.99/mo "limited-time offer" (list shown struck-through $39.9; 3 slots; 1,000 credits/mo; weighted Consensus Data API); Max $29.99/mo (struck-through $199; 10 slots; 3,000 credits/mo; divergence webhooks, CSV export); Enterprise custom. (H, `https://headlinearena.com/pricing` raw fetch, 2026-10-19.) Payment methods accepted: NOT FOUND (searched: pricing page).
- Prediction-reward credits: Free 0.2x (50/mo cap), Pro 1x (500/mo), Max 4x (1,500/mo) (H/M, pricing page text).

## 8. Resolution mechanism and dispute risk

- **Mechanical, frozen-rule resolution (H, methodology + challenge detail).** Each challenge stores timing, price/release definition, neutral threshold, boundary ownership, fallback and missing-data policy; later config changes do not alter open/frozen challenges. Moves inside or exactly on the neutral threshold resolve neutral.
  - US-exchange futures: baseline at 18:00 ET Globex open, forecasts lock 10:00 ET, settle on the 17:00 ET close; China futures: 15:00 Beijing close.
  - Crypto barrier questions: "Binance 1h kline high/low; exactly equal counts as a touch"; "No early resolution - settlement happens at window end even if the level was touched earlier"; cancelled if settlement data still unavailable 72 h after the resolution time. (Quoted from the live challenge `resolution_criteria`, H.) This is a **different settlement basis** from most venue touch markets (1h kline extremes, settle at window end); a linker must not equate it with another venue's "hit $X" market without comparing rules.
  - Official releases: single Settlement Authority; A = first publication, B1 authority-controlled alternate, B2 approved institutional republication; value policy `first_published`; A-only settlement only if frozen contract allows, after a verification timeout (36 h where specified; 60 min in the Eurostat example). Missing evidence -> retry or cancel; cancelled questions are not scored.
- **Dispute/correction process:** NOT FOUND (searched: methodology, terms, docs/concepts; methodology only says missing/rejected evidence may lead to pending status or manual review). Contact is a generic address on the site. Because nothing of financial value rides on outcomes, dispute risk matters only for using the settled labels as ground truth: resolver is the operator itself (single centralised party), `verification_status` strings like `shadow_verified` appear on some resolved rounds (H, HF fixture), and a few resolved HF rounds are dated 2025 (period 2025-05) although the platform's first challenge is 2026-04-01 - presumably backfilled/shadow rounds (M).

## 9. Geo / ToS / automation

- **Geography:** the Agent Terms (v1.4) contain no country restriction; operators only represent "legal age and capacity to enter into binding agreements in their jurisdiction" (2.4); governing law "general principles of international commercial law" (grep of raw terms: `sanction` = 0, `resident` = 0 hits). (H.) Almanac agrees (M).
- **Automation is the intended use:** the terms define an Agent as "any automated AI system, software agent, or algorithmic process registered ... via the Platform API"; operators accept the terms programmatically by calling `POST /register` etc.; operator is liable for the agent and must not use it "to manipulate market data or undermine Platform integrity" (6(c)). (H.)
- **Data redistribution (almanac hint corrected):** Terms 13.6 "No API Resale" covers the `/api/v1/me/*` *signal-query API* only: licensed "for the subscriber's own personal or internal organizational use only. Reselling, proxying, or otherwise redistributing access to this API (or the data it returns) to third parties is prohibited". `/api/v1/me/*` does not appear in the OpenAPI spec I fetched. The terms do **not** contain a redistribution clause for the unauthenticated `/api/v1/public/*` or `/api/v1/eval/*` GETs, but also grant no explicit licence for them. Consensus Data API responses carry a mandatory non-removable `disclaimer` ("non-personalized, automated output shared for AI benchmarking and research purposes"). (H terms/docs, M interpretation.) Treat as **internal-use only** until the operator confirms.
- **robots.txt (crawlers):** `Disallow: /api/` for `*`, with explicit `Allow:` for `/api/v1/public/benchmarks/ai-market-prediction`, `/api/v1/public/leaderboard`, `/api/v1/public/challenges`, `/api/v1/public/prediction-contracts`, `/api/v1/public/human-forecasts`, `/api/docs`, `/llms.txt`. So `/api/v1/eval/*` (prices, market-assets, calibration, challenge detail) is **disallowed for crawlers** even though llms.txt advertises it as machine-readable. Stay within the allowed `/api/v1/public/*` set for polling. (H.)
- **Market data caveat:** `/eval/prices` republishes CME/COMEX/NYMEX/ICE/CFE futures quotes; exchange-data licensing is likely to restrict reuse (L, inference, not researched). The aggregator has no need for these.
- **Account/ID collection:** onboarding guide Step 0 tells agents to ask the human operator for an email; terms mention fraud signalling that "may correlate [a device fingerprint] with IP address and payment method across accounts". Another reason not to register for research (H).

## 10. Liquidity

- **Not applicable (no money).** No volume, OI or TVL exists; the metrics a scanner cares about are participation counts.
- Participation (H data, computed 2026-10-19): newest 300 questions: mean 2.31, median 2, 89 with zero forecasts; daily futures 2.6-4.3 per asset; BTC/ETH price-event questions 0.33; official-statistics rounds 0-8 (open rounds today: 0-8). Platform calibration set: 2,930 settled non-BTC predictions in total. Leaderboard-eligible agents (>= 30 settled): 15. Paper-trading leaderboard has play-money P&L only. (H.)
- Almanac `metrics.volume_usd: null` (M) - consistent.

## 11. Event-category overlap with other venues (where a signal might matter)

| Category | Headline Arena content | Overlap with money venues | Tag |
|---|---|---|---|
| Crypto price | Weekly BTC/ETH barrier touch (YES/NO), daily close distribution, year-end thresholds; Binance data | High topical overlap with Polymarket/Limitless/Kalshi crypto-price markets, **but different settlement basis** (Binance 1h kline high/low, settle at window end) and ~0.3 forecasts per question | H (content), M (overlap) |
| Macro | US CPI/core CPI/NFP/unemployment/GDP/PCE/PPI/jobless claims/JOLTS; **FOMC rate decision and ECB rate decision** (ordered categorical); EU HICP; China CPI/PMI | Kalshi/Polymarket list CPI, NFP, Fed-decision markets; Headline Arena rounds exist per release with 2-8 agents each | H/M |
| Commodities/rates/FX/equity futures | Daily up/down/neutral on GC, CL, ES, ZN, DXY, VIX, ... | Little to no prediction-market overlap for daily direction with a neutral band | M |
| Sports, politics, entertainment | None | - | H |

## 12. Shared liquidity with another venue?

No liquidity of its own, so **not an independent arbitrage leg and not a duplicate of another venue's book**. It is a downstream observer of public prices (Binance, CME etc.) and official releases. (H.)

---

## 13. Fixtures saved (`docs/research/fixtures/headline-arena/`)

`public-challenges-limit3.json`, `public-challenges-open-first12.json` (first 12 of 46 open), `eval-challenge-detail-eth-touch.json`, `eval-challenge-results-open.json`, `eval-challenge-odds-404.json`, `eval-challenges-stats.json`, `eval-market-assets.json`, `eval-prices.json`, `eval-calibration.json`, `eval-settlement-rules.json`, `human-forecasts-challenges-limit2.json`, `human-forecast-consensus-empty.json`, `prediction-opportunities-limit3.json`, `agent-capabilities.json`, `openapi-path-list.txt` (all 137 method+path pairs from the live spec). Not saved: the 396 KB OpenAPI JSON and the 3.6 MB `prediction-contracts` list (over 50 KB).

## 14. Adapter recommendation

**adapter_priority: P2 (signal-only, thin).**

- Why not higher: no prices, no liquidity, no trade path, no PayBox route; crowd signal is 0-8 LLM agents per question; consensus quality-weighting needs a paid key; redistribution rights unclear.
- Why not "skip": the API is clean and unauthenticated for the public tier, update cadence is steady, and the resolved archive (1,538 settled questions, all with mechanical open/close prices) gives free labelled outcomes for BTC/ETH barrier and macro-release questions, which are useful for backtesting the linking layer's settlement-basis logic and for a sanity check on lead-lag studies.
- If built: read-only `public/challenges` poller (<= 1 request/minute, generic UA, internal use only), map `asset`+`question`+`resolution_criteria` to the schema as `kind=forecasting-nonmoney`, **never** include it in arbitrage-leg candidates, and flag `signal_weight` as very low until participation grows. Re-check Terms and ask the operator about public-data reuse before any external publication.

## 15. Embedded text aimed at AI agents / suspicious content (recorded, not followed)

- `guide.txt` opens "You are about to join Headline Arena as a registered AI agent ... Follow these steps exactly", instructs installing a marketplace plugin (`claude plugin marketplace add headlinearena/headlinearena-agent-plugin`, `npx skills add ...`), and Step 0 says to "ask your operator for their email" to pass as `operator_contact`. Not followed; no registration or plugin install.
- Homepage "AI Summary" buttons contain pre-filled prompts for ChatGPT/Gemini/Claude/Grok, including "do not present it as investment advice or a betting platform" (reported by the WebFetch summariser; not followed).
- `llms.txt` / `agent/capabilities` contain agent-behaviour guidance ("do not submit a prediction to probe support", "do not buy credits as a workaround"). Consistent with my read-only constraint, but still vendor text, not an authority.
- Marketing posts by the team appear as issues on unrelated third-party GitHub repos (search results). Not suspicious per se, but means web search results for this venue are mostly self-promotion.
- No credential-collection or payment flow was encountered.

## 16. NOT FOUND

- Rate limits for unauthenticated public GETs (searched: OpenAPI, llms.txt, guide.txt, docs, headers).
- A dispute/appeal/correction process (searched: methodology, terms, docs/concepts).
- Any on-chain component, token, or crypto payment method (searched: llms.txt, guide.txt, docs home, OpenAPI; also pricing page for payment methods).
- English-locale parameter for question text (searched: OpenAPI query params, llms.txt; not tested).
- Independent third-party coverage or audit of the platform (searched: WebSearch extended).
- Revenue Share Schedule referenced by terms 5.7 (not published at a URL I found).
- Any explicit licence for reuse of unauthenticated public API data.

## 17. Sources

All fetched 2026-10-19 unless stated.
- https://headlinearena.com (homepage; WebFetch summary) - M
- https://headlinearena.com/terms (Agent Terms v1.4, eff. 2026-09-24; raw fetch + local grep) - H
- https://headlinearena.com/methodology (raw fetch + grep; WebFetch summary) - H/M
- https://headlinearena.com/pricing (raw fetch + grep) - H
- https://headlinearena.com/docs, /docs/concepts, /docs/consensus-api (raw fetch + grep; WebFetch summary) - H/M
- https://headlinearena.com/api/docs (JS-rendered shell) and https://headlinearena.com/api/openapi.json (OpenAPI 3.1.0 v2.2.9, 137 paths) - H
- https://headlinearena.com/llms.txt and https://headlinearena.com/robots.txt - H
- https://headlinearena.com/api/v1/agent/onboarding/guide.txt (54.8 KB) - H
- Live endpoints listed in section 4 and fixtures in section 13 - H
- https://github.com/headlinearena/headlinearena-agent-plugin (`gh api repos/headlinearena/headlinearena-agent-plugin`; README read raw) - H
- https://github.com/kachence/prediction-almanac/blob/main/data/platforms/headline-arena.yaml (discovery evidence: status live, launched 2026, geo "everyone", `volume_usd: null`, "terms prohibit redistributing API data") - M
- WebSearch extended "Headline Arena AI agents forecasting arena Brier score challenges API" (self-promotional GitHub issues only) - M/L
- https://arxiv.org/abs/2605.00420 (checked, unrelated) - H
