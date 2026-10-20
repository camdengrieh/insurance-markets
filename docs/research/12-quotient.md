# 12. Quotient as a prediction-market signal source

Researched 2026-10-18 (UTC) / 2026-10-19 (local). Read-only: no paid call was made, no key or account was created, no money-moving PayBox tool was called. Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale. Everything under "Sources" was actually fetched or read.

## 0. Bottom line

1. **Quotient is real, and the Render gateway is its official production API.** Operator: Quotient Solutions, Inc. (Delaware C corp). The OpenAPI served by Quotient's own developer domain (`dev.quotient.social`) is byte-identical (same SHA-256) to the one on `quotient-api-gateway.onrender.com`, and both name the gateway as the production server. [H]
2. **It is a forecast and signal publisher, not an arbitrage tool and not an execution venue.** Core objects are (a) "Q" forecasts (a calibrated YES probability on every covered market), (b) a separately published, gated "signal" (side + entry rules, at most one per market) and (c) a "mispriced" scan (Q probability vs a live venue quote). Quotient's own docs say a cross-source gap is not arbitrage. [H]
3. **The task's endpoint list is partly stale.** `GET /api/v1/markets/{slug}/signals` is *article evidence*, not trade signals. `GET /api/v1/signals/perps` is a deprecated alias for `/api/v1/price-outlooks`. The `limitless` venue was removed in API 17.0.0 and replaced by `hl_outcomes`. Current spec version is 20.5.0 (2026-10-15). [H]
4. **Access is x402 pay-per-call (USDC on Base) or API key with prepaid credits. No free tier for the useful endpoints.** Signals $0.01, mispriced $0.02, lookup $0.005, forecast $0.01 per call. A 402 challenge was captured and decoded; nothing was paid. [H]
5. **Venue coverage: Polymarket International, Polymarket US, Kalshi, HL Outcomes. XO and Trueo are not covered.** Only Polymarket International and Kalshi get verified live quotes, so the mispriced feed is effectively those two venues. [H for the venue list and live-quote rule; M for "effectively two venues"]
6. **The edge claim is real but small, and sports are not established.** Recomputed from Quotient's own public CSV: Q beats Polymarket's price on 60.1% of markets in the last 60 days, with a mean Brier advantage of 0.0029 (bootstrap 95% CI 0.0003 to 0.0053). All-time (since Feb 2026) the free performance snapshot shows Q slightly *worse* than the market on geopolitics and flat overall. No independent audit exists. [H for the computation, with caveats in section 7]
7. **Terms are the real blocker for a plugin.** Licence is "personal or internal business purposes"; redistribution, resale, sharing access and building a competing signals product are prohibited "except as expressly permitted". A design where each end user pays for and receives their own calls is plausible; a shared cache or a plugin operator re-serving outputs is not, without written permission. Not legal advice; ask Quotient (jordan@quotient.social). [H for the text, M for the interpretation]
8. **Payment must stay on the agent side** (`discover_services` then `use_service`, or manual 402 then `pay_x402`), with a pinned payment tuple and a per-day data budget. Plugin code should only describe requests and validate/parse results. An Open Plugin *can* emit a `kind: "x402"` proposal (EchoMarkets does), but that puts payment initiation in plugin code, which the task rules out. [H for the pattern existing, M for gating behaviour]
9. **`ivanmolto/echomarkets` is not a Quotient integration and does not overlap in data.** It is a PayBox plugin selling heuristic Polymarket briefs over Solana x402; it never references Quotient. It is a useful reference for x402 proposals and sandbox rules. [H]

## 1. What Quotient is, who runs it, whether the gateway is official

### 1.1 Identity (this Quotient = prediction-market forecasting product)
- Operator: "Quotient Solutions, Inc., a Delaware C corporation" per the Terms of Use, last updated August 7, 2026. [H] (`https://quotient.social/terms`)
- Product family: "Q" (AI forecaster), "Quotient Signals" (`signal.quotient.social`, members terminal), "Thesis API and console" (`dev.quotient.social`), CLI `npm quotient-forecasting`, optional MCP, skill in Bankr's skill library. [H]
- Official channels linked from the site footer: X `@QuotientHQ`, Substack `quotient.substack.com`, a `$QUOTIENT` token page at `quotient.social/token` (page is client-rendered, content not read; the token is an unexamined conflict-of-interest/promotion flag), support email `jordan@quotient.social`. [H for links, not investigated for the token]
- npm package `quotient-forecasting@0.8.35`, MIT, maintainer `ruminations_j <jordan@quotient.social>`, modified 2026-10-08, homepage `thesis.quotient.social/connect`, repository field `github.com/division-sign-labs/quotient-api-gateway` (directory `cli`). That repo returns 404 anonymously (private). The org `division-sign-labs` has 4 public repos, one of which (`strats`, Apache-2.0) is described as a "Non-custodial runner for TokenStrats: trades a Quotient target from your own Hyperliquid wallet". [H for metadata; M that the org is Quotient's]
- CEO named Jordan Olmstead and founded in the Farcaster ecosystem, per a web-search summary of DailyCoin and X results; DailyCoin returned HTTP 403 to my fetch, so not read first-hand. [M]
- Other things called Quotient (NOT this): Quotient Technology (NYSE: QUOT, coupons ad-tech, Wikipedia result). Not the product of interest. [M]
- Partners listed on the homepage: PM Wisdom, Bankr, MacroStrategy by The Firm, Mandate Markets, ZEIT. [H]

### 1.2 Is `quotient-api-gateway.onrender.com` official? Yes. Evidence (all H):
1. `https://dev.quotient.social/api/v1/openapi.json` (Quotient's own developer-console domain) is **byte-identical** to the gateway's `/openapi.json` (SHA-256 `a42b65c8...511366e`, 371,531 bytes, version 20.5.0). Its `servers[0].url` is the Render gateway, described as "Production".
2. The developer docs page `dev.quotient.social/docs` embeds the gateway URL as the API server.
3. OpenAPI `info.contact` is `{name: Quotient, url: https://quotient.social}`; `info` links `/llms.txt`, `/skill/*`, the changelog.
4. The npm package's maintainer email is on `quotient.social` and its repo name is `quotient-api-gateway`.
5. The Bankr skill (committed on 2026-08-03 to `BankrBot/skills` by GitHub user `jordan-chan-olm`, apparently a Quotient team member, M) pins the same gateway origin and the same x402 `payTo` as the live 402 challenge I decoded.
6. DNS: `q-api.quotient.social` is a CNAME to `quotient-api-gateway.onrender.com`; `dev.quotient.social` CNAMEs to `quotient-api-prod.onrender.com`. `q-api.quotient.social` fails the TLS handshake from my client (both LibreSSL curl and Python ssl), so the `q-api` base URL in the OpenSkillIndex page is **not usable**; use the gateway host. [H]

Caveat: `*.onrender.com` is a shared hostname space. The trust anchor is that Quotient's first-party domains declare this host. A plugin must **pin the exact host** and the exact payment tuple (section 6.6) so a lookalike cannot be substituted.

### 1.3 Third-party sources that were wrong or stale
- OpenSkillIndex page (`openskillindex.com/skills/bankrbot-skills-quotient-api`): an undated republish of the Bankr skill. It names `q-api.quotient.social` as API base (broken TLS), omits venue list and prices, and says new accounts get free credits (NOT FOUND in the spec or terms). [H that it says this; L as a source]
- Bankr skill `quotient/SKILL.md` (Aug 2026, pushed 2026-10-17 repo-wide): price table is stale (mispriced $0.05, signals $0.02, intelligence $0.025; live 402 is $0.02, $0.01, $0.01), documents a deleted `status` enum (`actionable/unconfirmed/paused/done/retired`, removed in API 14.0.0) and a deleted `/signals/oil` route (removed in 13.0.0). Do not build against it. [H]
- The WebSearch/Bazaar snippet that Quotient covers Limitless is stale (removed in 17.0.0). [H]

## 2. Product semantics (get these right or the aggregator will mislead users)

| Concept | What it is | Where | Notes |
|---|---|---|---|
| **Forecast** | Q's calibrated YES probability for a covered market, with thesis, key factors, up to 5 cited sources, uncertainty, history | `/markets/{marketKey}/forecast`, `/markets/lookup`, `/markets/search`, `/markets` | Exists for "every covered market". Revised over time (`delta_from_prior`, `refresh_reason`). Immutable per `forecast.id`. |
| **Published signal** | A separate publication with its own `side`, entry price, lifecycle, `is_active`/`retired_reason`. At most one per market, held to settlement | `/signals`, `/signals/featured` | Most covered markets carry none. Do not infer publication from legacy `signal_count`; use `has_published_signal`. |
| **Mispriced row** | Q probability vs a *verified live* venue quote, spread >= `min_spread` | `/markets/mispriced` | A scan over *forecasts*, not publications. Candidate generator only. |
| **Price outlook** | Calibrated asset-price distributions (BTC, oil, nat gas) by settlement-source basis group | `/price-outlooks` (and deprecated `/signals/perps`) | Experimental. Most under review (Quotient neutral). Out of scope for a prediction-market aggregator. |
| **Article evidence** | Articles/X posts linked to a market | `/markets/{slug}/signals`, `/sources` | The task's "`/markets/{slug}/signals`" is this, **not** trade signals. |

Verbatim: "A forecast is Q's calibrated YES probability for every covered market; a signal is a separate Quotient publication with its own side and status." [H] (OpenAPI `info.x-guidance`)
Verbatim: "These are article correlations. Published trade signals are at `/api/v1/signals`." [H] (description of `/markets/{slug}/signals`)

**Signal publication rule** (frozen at publish, per `x-coverage-notes` and `llms.txt`) [H]: Quotient publishes when the market resolves within 7 days (up to 14 days for non-sports event favorites priced 50c to under 70c with a 10 to under 30 point gap); the side Q favors must cost under 70c; the Q-to-price gap must fall inside a per-category range (site says 5 to 10 points for events, 15 for commodities); sports games and commodity price markets carry signals; crypto and equity price markets do not. The default feed re-checks category, price, edge, deadline and adverse move (`entry_eligible`, `entry_status`).

**`q_coverage` states** on every market [H]: `forecasting` (evidence of an edge), `experimental` ("Q's probability and supporting research with no established forecasting edge; live, but not yet proven"; this covers *all covered sports markets*), `under_review` (forecasting paused; most price outlooks), `research_only` (reserved). Name the state to the user.

## 3. Full API surface (OpenAPI 20.5.0, 27 operations, fetched 2026-10-18 17:31 UTC)

Saved: `<scratch>/quotient-openapi.json` (371,531 bytes). Server: `https://quotient-api-gateway.onrender.com`. Credits: 1,000 credits = $1 (`/api/public/pricing`: e.g. creditCost 10 = $0.01). Prices below are `x-payment-info.price`, confirmed against live 402 headers for signals ($0.01 = amount `10000`) and mispriced ($0.02 = `20000`). [H]

| Method and path | Price | Params (`*` required) | Returns / role |
|---|---|---|---|
| GET `/api/public/performance` | free, cached 30 min | none | Forecast performance snapshot (Brier, accuracy, calibration, hypothetical returns). 104 KB |
| GET `/api/public/forecast-availability` | free | exactly one of `market_key`, `market_id` (+`venue`), `slug` | Does a stored forecast exist; coverage preflight. **Observed latency ~30 s** (two tries) |
| GET `/api/public/forecast-targets` | free | `ref*` (venue URL, Kalshi ticker, `kalshi:`/`polymarket:` key) | Resolves venue refs to exact binary child markets |
| GET `/api/v1/markets` | $0.005 | `topic`, `league`, `venue`, `max_forecast_age`(48h), `changed_within`(<=168h), `sort`(updated_desc, volume_desc, signal_count_desc, quality) | Full covered catalog in one response (pagination removed in 9.0.0) |
| GET `/api/v1/markets/search` | $0.01 | `q`, `tag[]`, `category[]`, `venue`, `as_of`, `max_forecast_age`(168h, max 720), `limit`(10, max 20), `group_by` | Hybrid search with Q probability + thesis; point-in-time via `as_of` |
| **GET `/api/v1/markets/mispriced`** | **$0.02** | `venue`, `topic`, `min_spread`(0.05), `max_forecast_age`(48h), `sort`(spread_desc, spread_asc, updated_desc, volume_desc, quality) | Candidate generator (section 5) |
| GET `/api/v1/markets/lookup` | $0.005 | one of `market_keys`, `slugs`, `condition_ids` (<=10), `venue` | Batch intelligence + key factors + <=5 sources per market |
| GET `/api/v1/markets/{slug}/intelligence` | $0.01 | `slug*`, `venue` | Full briefing for one market (slug-keyed; cannot address HL Outcomes) |
| GET `/api/v1/markets/{slug}/forecast` | $0.01 | `slug*` (marketKey accepted), `venue`, `as_of`, `history`(0 to 10) | Forecast, thesis, drivers, uncertainty, history |
| GET `/api/v1/markets/{slug}/signals` | $0.01 | `slug*`, `venue` | **Article evidence**, not trade signals. 404 is free |
| **GET `/api/v1/signals`** | **$0.01** | `window`(<=168h, filters forecast update time), `status`(active, ineligible, in_play, retired), `side`, `market`, `topic`, `venue`, `min_conviction`(1 to 3), `min_capacity_usd`, `exclude_drawdown_risk`, `sort`(quality) | Published trade signals |
| GET `/api/v1/signals/featured` | $0.005 | `window` | One highlighted signal or null |
| GET `/api/v1/sources` | $0.005 | `markets` or `market_keys` (<=10), `venue`, `window`(48h, <=168), `types` | Evidence layer |
| GET `/api/v1/latest` | $0.02 | `hours`(3, max 6), `types` | Chronological feed of new forecasts/evidence |
| GET `/api/v1/assets`, `/assets/search`, `/assets/stance` | $0.005 / $0.01 / $0.01 | see spec | Underlying-asset directory; stance is experimental |
| GET `/api/v1/price-outlooks`; `/signals/perps` (deprecated alias) | $0.01 | `asset`, `anchor`, `asset_class` | asset-price/1 outlooks (BTC, oil, nat gas) |
| GET `/api/v1/portfolio` | $0.005 | `wallet`, `venues`, wallets per venue, `size_threshold`, `include_perps` | Wallet positions joined to Q (Polymarket, Polymarket perps, Hyperliquid only) |
| GET `/api/v1/wallets/link` | $0.01 | `token*` | x402 wallet-to-account link |
| POST `/api/auth/forecast-requests` (+ GET `/{jobId}`) | **$1.00** | header `Idempotency-Key*`; body = `VenueMarketForecastRequest` or `QuestionForecastRequest{question, resolution_rules, category, start_date?, end_date}` | Generate a forecast for a supported market **or your own free-text question**; async (202 + jobId). 10/day. Requires `forecastApiKey` per spec |
| POST `/api/v1/x/search`, `/x/profile` | $1.00 | body | Grok-powered X research / profile |
| GET `/api/v1/feeds/{id}`, `/feeds/{id}/events` | enterprise key | `limit`, `cursor`/`after` | "Enterprise feeds": per-client snapshot, refreshed every minute |

Not present: any webhook, websocket, SSE or push mechanism (searched the spec; the only "webhook" string is unrelated). All data is poll-only; the enterprise feed is the nearest thing to a stream.

## 4. Auth, payment, pricing, rate limits

- **Auth schemes** [H]: `gatewayApiKey` (header `x-quotient-api-key`, `qt_` keys, prepaid credits); otherwise x402. "If you do not provide a key, the gateway can require x402 payment via PAYMENT-REQUIRED." `forecastApiKey` for forecast requests; `EnterpriseFeedKey` (`qef_`) for feeds. Key creation is through the console (`quotient.social/console`, email or Google sign-in per the third-party skill doc); not done.
- **x402 challenge captured (unpaid GET, HTTP 402)** [H]. Both `/signals` and `/markets/mispriced` returned: `x402Version: 2`, `accepts[0]` = `{scheme: "exact", network: "eip155:8453", amount: "10000" (signals) | "20000" (mispriced), asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC on Base), payTo: 0xC3d01FD2F79d4c57aD106AB8ecc12a5dE24F97cB, maxTimeoutSeconds: 300, extra: {name: "USD Coin", version: "2"}}`. Extensions: `bazaar` (discoverable) and `payment-identifier` (optional `id`, 16 to 128 chars, `^[a-zA-Z0-9_-]+$`). Body: `{"error":"payment_required",...,"route":{"route_id":"listTradeSignals","required_credits":10}}`. `/api/public/pricing` lists only `eip155:8453` USDC `exact`. (The Bankr skill mentions USDG on Robinhood Chain 4663 "when enabled"; it was not in the challenges I saw.)
- **Facilitator**: NOT FOUND in the 402 payload (x402 v2 challenges do not name one). Changelog 8.2.0 mentions "CDP x402 Bazaar discovery metadata" and "the facilitator's minimum settleable amount"; Coinbase CDP is the likely facilitator (M).
- **Headers**: client sends `PAYMENT-SIGNATURE` after a 402; success carries `PAYMENT-RESPONSE`; CORS also allows `X-Payment` and `Payment-Identifier`. [H] "An exact retry with the same settled payment identifier and payment proof returns the cached original response; changing the proof or request returns `409 payment_replay_mismatch`." [H] (gateway error-handling doc)
- **No charge** on 404, 422, 429, 5xx or missing-forecast 404 ("x402 settlement is skipped for the same errors"). [H]
- **Terms on price**: "For an x402 request, the payment challenge presented for that request is authoritative." [H] Prices may change prospectively; they already did (Bankr table vs now).
- **Rate limits** [H, `x-rate-limit-policies`]: `standard` 20 rps / 600 rpm / 20,000 per day / 10 concurrent, shared across all non-X payable routes "for one API customer or verified x402 payer"; `ip_abuse_guard` 50 rps / 1,200 rpm / 50,000 per day; `forecast_requests` 1 rps / 10 rpm / 10 per day / 1 concurrent; `x_research` 5 / 60 / 500; `wallet_link` 1 / 5 / 20. Response headers `RateLimit-Policy`, `RateLimit`, `Retry-After`, `X-Quotient-Max-Concurrent`. 429 is not billed.
- **Unit economics** (my arithmetic from the table): mispriced every 30 min = 48 x $0.02 = $0.96/day; signals hourly = 24 x $0.01 = $0.24/day; lookup of <=10 markets per call at $0.005. A diligent user spends roughly $1 to $2/day; a 15-minute poll of both is about $2.9/day (~$86/month). Prices are small but non-zero, so the budget cap matters when both wallets are `autonomous`.

## 5. Object shapes the aggregator must map

### 5.1 Trade signal (`TradeSignalItem`, non-sports) [H, spec schema]
- Identity/lifecycle: `id`, `published_at` (=`created_at`), `forecast_updated_at`, `is_new_today`, `is_fresh` (forecast <=1 h for sports/commodities, <=12 h for events; metadata only), `is_active`, `retired_reason` (`resolved|flipped|fading_q|expired|under_review`), `rule_version` (e.g. `one-signal/1`), `sleeve`/`sleeve_group`, `pick_type` (favourite/underdog), `resolves_at`, `in_play`.
- Direction: `side` (YES/NO, "sign of (Q - market price) at publish"), `q_side` (side Q favors *now*; can differ from `side` after a flip), `pick_label` (sports).
- Probabilities and **mixed units (hazard)**: `entry_q` and `entry_pm` are 0 to 100; `latest_q`, `market_odds`, `venue_quote.selected_probability` are 0 to 1; `*_cents` fields are on the signal's own side ("Q-side cents"); `entry_side_price` is 0 to 1; `entry_edge_pp` and `entry_spread_pp` are percentage points.
- Convergence: `q_value_cents`, `entry_cost_cents`, `current_cost_cents`, `distance_to_convergence_cents`, `converge_upside_pct`, `max_roi_pct`; null once `in_play`.
- Status: `forecast_status{state: warning|caution|converged|converging|sideways|diverging, cents, adverse_move_pct, basis, price_source: live|graph}`; `entry_eligible` + `entry_status` (eligible, in_play, retired, legacy, deadline_passed, no_forecast, no_quote, no_entry_price, price_extreme, price_too_high, gap_too_small, gap_too_wide, deadline_too_far, moved_against, flip_hold, live_catalysts, unmapped, closed).
- Pricing provenance: `live_priced` ("True only when current pricing came from a verified live Polymarket International or Kalshi venue quote"), `priced_at`, `venue_quote{venue, market_id, yes_bid, yes_ask, yes_last, selected_probability, quote_method (midpoint|bid|ask|fresh last|graph_snapshot), venue_timestamp, observed_at, freshness}`.
- Confidence/calibration fields: `conviction_tier` (1 to 3), `conviction` (high/medium/low), `has_band`, `conviction_calibration{status, snapshotId, cohort, events, statedYes, empiricalYes, calibratedYes, lowYes, highYes}`, `similar_trades{level, n, wins, losses, voids, win_rate_pct, avg_return_pct, units_won, n_replay, n_live, computed_at}`, `quality{status: rated|insufficient|unavailable|stale|unsupported, tier: strong|mixed|caution, basis, assessment_source: live|historical, cohort, live{n, event_n, win_rate_pct, ...}, historical{...}}`, `return_record{source, status, entry_price, exit_price, return_pct, entry_at, exit_at}`.
- Risk/liquidity: `drawdown_risk_elevated` (>=15% chance of losing most of the side's value within ~72 h; null = unknown, not safe), `capacity_usd_at_2c`, `capacity_basis` (depth-2c | volume-fallback), `capacity_as_of` (~12 h refresh).
- Evidence: `thesis`, `key_factors[]{summary, direction, impact, evidence, source_url}`, `recent_evidence[]{url, title, source, published_at, fact}`.
- Routing: `market{venue, nativeMarketId, nativeEventId, seriesTicker, marketKey, quotientMarketId, slug, marketUrl, sourceUrl, condition_id, question, end_date, market_odds, volume_24h, q_coverage, broker_channels, robinhood_url, relationships}`.
- **Sports signals** (`kind: "sports_game"`, breaking change 20.0.0 on 2026-10-07): no top-level market/side/latest_q/price; instead `pick{probability,...}`, `sports{yes_side,...}`, and `markets[]` (every graph-linked listing, each with its own `signal_side`, `signal_outcome`, token id, `yes_outcome`, price, `signal_available`, `entry_eligible`, `entry_status`). "No venue is primary or preferred"; choose the listing on the user's venue, never `markets[0]`.

### 5.2 Mispriced row (`MispricedMarketItem`) [H]
`venue, nativeMarketId, nativeEventId, seriesTicker, marketKey, quotientMarketId, slug, marketUrl, q_coverage, question, end_date, quotient_odds (0-1), market_odds (0-1, = venue_quote.selected_probability), venue_quote{...}, inDispute, clarifications, bluf, forecast{CompactForecast: probability, created_at, thesis, resolution_pathway, delta_from_prior, quality, return_record}, spread (absolute, 0-1), spread_direction (q_higher|q_lower), forecast_status, volume_24h (nullable, venue-specific units), last_updated, signal_count (legacy), sports (yes_side), relationships`. Response `{markets[], count}`. An undocumented "odds band" filter is applied server-side (the description says rows are filtered by "live quote, odds-band, and spread"); its bounds are NOT FOUND in the spec.

### 5.3 Forecast read (`ForecastRead`) [H]
`id, probability (0-1), created_at, market_odds_at_forecast, headline, bluf, thesis, crux, resolution_pathway, delta_from_prior, delta_reasoning, prior_forecast_id, refresh_reason (e.g. price_move), question_type, conviction_*, draw_std_log_odds, draw_count, band25, band75, drawdown_risk_72h, key_factors, recent_evidence, quality, return_record, relationships`. With `as_of` the Q probability and `market_odds_at_forecast` form the historical pair; `market_odds` is response-time.

### 5.4 Cross-venue links
Signals carry stored `MATCHES_MARKET` relationships from a scheduled pipeline ("API requests perform no matching search or model calls"). `match.match_level` is `possible|same_event|same_outcome`; `match.settlement_match` is separately `exact|different|unknown` with differences and evidence; nullable `source_yes_outcome`/`signal_outcome` give outcome alignment. "A same-outcome link can have different rules." [H] This exists only on signals, is capped at 50 refs, and is not a general cross-venue matcher.

## 6. Coverage, cadence, latency, reliability

- **Venues** [H]: `polymarket` (Polymarket International), `polymarket_us`, `kalshi`, `hl_outcomes` (Hyperliquid outcome markets, covered sports game-winners only). `limitless` removed in 17.0.0. NOT covered: XO, Trueo, Opinion, Manifold etc. (searched the spec for these names: zero hits). A sibling research note records that PayBox `discover_services` curated queries for `trueo` and `xo market` returned nothing (M).
- **Live quotes** [H]: only Polymarket International and Kalshi get verified live quotes ("fail closed to null"); Polymarket US and HL Outcomes return `graph_snapshot` quotes labelled stale; the mispriced feed "excludes every missing, stale, or unsupported live quote", so it excludes HL Outcomes explicitly (17.0.0) and, by that rule, Polymarket US (M).
- **Catalog**: "Catalog and search return Quotient-covered listings, not every contract on each venue." Examples of exclusions: sports props/spreads/totals, mention markets, 15-minute and hourly crypto up/down, ITF/Challenger tennis. [H]
- **Scale and cadence** (self-reported + checked): "500 markets forecast daily", "6,000+ sources", "1,000+ experts" (`x-data-coverage.operatingScale`); the public CSV has a median of 509 forecast rows per day over the last 45 days for *resolved Polymarket markets alone*, and a median of 4 forecasts per market (mean 9.1), so ~500/day is plausible. [H for CSV stats; M for the totals]
- **Freshness knobs** [H]: `/markets` and `/mispriced` default `max_forecast_age` 48 h; `is_fresh` thresholds 1 h (sports, commodities) and 12 h (events); sports forecasts start up to 7 days pre-kickoff and stop at kickoff; capacity refreshed ~12 h; quality records older than 3 h are stale; conviction calibration snapshots weekly; performance snapshot `refreshTtlHours: 0.5`; OpenAPI `cache-control: public, max-age=300`; enterprise feed snapshots every minute; `/latest` default 3 h window (max 6).
- **Latency** [H, my measurements]: 402 challenges 0.43 s; `llms.txt` ~0.28 s; `forecast-availability` **30.2 s** and one 30 s timeout. Paid-endpoint latency is unmeasured (no paid calls). PayBox Open Plugin sandbox rules seen in EchoMarkets (no network at startup, fetch bounded to 4 s, tools well under 10 s, no state between calls) mean a plugin must not synchronously call slow Quotient routes.
- **API churn** [H]: 20.0.0 (2026-10-07, breaking sports-signal shape) through 20.5.0 (2026-10-15) in eight days; breaking majors at 17.0.0 (venue enum), 18.0.0 (UFC dropped), 20.0.0; status enum deleted at 14.0.0; pagination removed at 9.0.0; prices changed. Expect further breaks.
- **Uptime evidence**: a third-party directory (x402-list.com, auto-imported from the Bazaar, "not submitted by the operator") self-reports "99.9% p95 303ms", "14/14 x402 checks pass", payment-ready until 2026-10-25, uptime since 10-08. Unverified. [L]

## 7. Calibration and track record: claims vs what can be verified

### 7.1 Claims (all Quotient-published)
- Homepage (updated Sept 9): "Q beats Polymarket on 57.2% of markets" (375 of 656 resolved Polymarket markets, last 60 days). `quotient.social/how-it-works` (updated Oct 17): **60.5%** (1,901 of 3,142), Q Brier 0.1640 vs Polymarket 0.1671; geopolitics/elections 61.9% (219 of 354); everything else 60.3%. The headline moves by ~3 points in five weeks. A web-search summary also attributes "8.2%" and "7.2%" more-accurate claims to different Quotient pages (M, unverified).
- Signals track record page (`signal.quotient.social/performance`): "249 closed - 94 open", "Average return per signal +8.6%", "Win rate 67%", "+299.32u" at 1/4 Kelly. States "Replays were not published at the time" (historical replays are mixed into the record) and "94 open signals are members-only". Hypothetical paper results only. [H]

### 7.2 Free performance snapshot (`/api/public/performance`, generated 2026-10-18T17:30Z) [H]
First forecast in the sample: 2026-02-13 (about 8 months of history). Brier advantage = market Brier minus Q Brier (positive = Q better):

| Scope | Period | Markets | Q Brier | Market Brier | Advantage | Q acc | Mkt acc |
|---|---|---|---|---|---|---|---|
| all markets | all time | 4,413 | 0.1733 | 0.1722 | **-0.0011** | 76.1% | 75.8% |
| all markets | last 60 d | 3,432 | 0.1804 | 0.1834 | +0.0030 | 75.1% | 73.7% |
| geopolitics/elections | all time | 1,032 | 0.1400 | 0.1311 | **-0.0089** | 82.8% | 83.9% |
| geopolitics/elections ("primary") | last 60 d | 367 | 0.1581 | 0.1623 | +0.0041 | 79.8% | 77.9% |

So the site's "primary" cohort is the last-60-day geopolitics window, the best-looking cut; over the full history Q is slightly *behind* the market on geopolitics. The snapshot's own caveats: directional accuracy "is flattered by lopsided markets", recent cohorts are incomplete, percentage returns are skewed for cheap shares. Its hypothetical returns carry "no fees, spread crossing, slippage, sizing, or overlapping-position constraints".

### 7.3 My independent recomputation (first-hand, from Quotient's public CSV)
Source: `https://quotient.social/api/resolved-markets` (linked as "Download forecast data", file `quotient-resolved-markets-60d-2026-10-18.csv`, 5.4 MB, 29,486 forecast rows, 3,252 resolved Polymarket markets, forecast dates 2026-08-19 to 2026-10-18; columns `market_question, venue, forecast_date, resolution_date, q_probability, polymarket_probability, market_volume_usd, resolved_outcome, q_correct, market_id, market_url`). Method as Quotient states it: mean Brier within each market, each market counted once. Saved at `.../scratchpad/q/resolved.body`.
- Q 0.1647 vs Polymarket 0.1676; Q beats the market on **1,955 of 3,252 = 60.1%** (1 tie). Mean Brier advantage **0.00285**, bootstrap 95% CI **[0.00028, 0.00525]** (2,000 resamples). This reproduces Quotient's 60.5% / 0.1640 / 0.1671 approximately (their set is a day or two newer).
- Edge is concentrated at short lead time (resolution date minus forecast date): <2 days, 1,717 markets, Q 0.1549 vs 0.1595 (Q wins 62.9%); 2 to 6 days, Q 0.1773 vs 0.1777 (60.4%); 7 to 29 days, Q 0.1770 vs **0.1760** (Q worse in Brier); 30+ days, Q 0.2050 vs **0.1977** (Q worse). 17% of rows (5,054) are dated on the resolution day. Roughly half of rows are sports-like (URL heuristic).
- **Indicative paper test of "follow the spread"** (first forecast per market with |Q - price| >= threshold and price in 0.05 to 0.95; buy the underpriced side at the stored Polymarket price; hold to resolution; bootstrap CI; stored prices, not executable asks): at threshold 0.08 the mean return is +10.4% (n=1,869, CI 5.7 to 14.8) with zero slippage and **+6.0% (CI 1.6 to 10.2) with a 2-cent entry slippage**; non-sports +15.0% / +10.5%; **sports -0.6% / -4.8% (CI spans zero)**, consistent with sports being `experimental`. Treat as an upper-bound sanity check: one 60-day window, recorded prices are Quotient's own, no fees, no order-book depth, skewed by cheap contracts. It shows the candidate generator is not obviously noise on non-sports in this window and that execution cost eats most of the margin (so thin books such as XO's would likely erase it).
- What this does **not** show: that forecasts were timestamped before outcomes (the CSV has only dates and no attestation), that prices are what was executable, or that any of it persists.

### 7.4 Can it be verified going forward?
- Best method: **log your own snapshots at fetch time** (`forecast.id`, `created_at`, `probability`, `venue_quote.selected_probability`, `observed_at`, your own order-book mid) and score against the venue's resolution yourself. `as_of` reads and the CSV are Quotient-served and cannot prove no back-fill.
- NOT FOUND: any independent audit, on-chain attestation or signed forecast log (searched: web search for audits/critiques of Quotient's Brier claims; Quotient site; OpenAPI). A DailyCoin interview piece (via search snippet, M) reports that the CEO argues cited probabilities need an audit trail and concedes Q does not beat the market in every category; on a Sept 24 snapshot Polymarket was ahead in geopolitics (0.1289 vs 0.1338).

## 8. Terms of use (can a plugin redistribute or resell?)

From `https://quotient.social/terms` (Last updated August 7, 2026; mirrored at `signal.quotient.social/terms`) [H]:
- Licence: "a limited, revocable, nonexclusive, nontransferable right to use the Services for your personal or internal business purposes."
- Prohibited: "You may not share or resell access", "copy, republish, redistribute, sublicense, or sell the Services or their outputs except as expressly permitted", "use the Services to build a competing data or signals product", "bypass access, billing, or security controls", "misrepresent Quotient content", "manipulate a market". Bulk extraction is allowed only "within a designated API".
- Agents: "If you connect the Services to an agent, bot, execution service, or other automated system, you remain responsible for its instructions, safeguards, spending, actions, and legal compliance."
- No advice, no execution: "Quotient is a publisher of research and information" and is not registered with the SEC, CFTC, FINRA, NFA; outputs "may be incorrect, incomplete, misleading, delayed, or out of sequence"; performance figures "are hypothetical or paper-traded". No SLA; "We do not promise backward compatibility or any minimum number or frequency of Signals." Liability capped at 12 months of fees; user indemnifies for automated systems.
- Additional terms "displayed for a product, purchase, API endpoint" also apply; none were seen in the spec (searched for redistribut/resell/commercial/licen[cs]e/attribution: only unrelated attribution wording in price-outlook provenance).
- A commercial path exists in principle: the homepage lists "Venues & trading interfaces: serve trusted analysis to your users" as a customer segment and the API has "Enterprise feeds" (`qef_` keys). Terms and pricing for that tier: NOT FOUND (searched site, docs, spec). Contact: `jordan@quotient.social`.

**Interpretation for our design (M, not legal advice):**
- Allowed shape: each end user's own wallet or own Quotient key pays for the call; the user's agent receives the output and uses it for that user's own decisions. The plugin is a client.
- Risky or likely prohibited without written permission: the plugin operator paying centrally and serving many users; a shared server-side cache or database of Quotient outputs; publishing "top mispriced markets" publicly; blending Quotient into a multi-source signal feed that could be seen as a competing signals product; exposing raw Quotient payloads over the plugin's own API.
- Action: send Quotient a short licence request before any public release (release-blocking for the "aggregate signals" feature, not for the rest of the XO plugin).

## 9. PayBox listing, echomarkets overlap, and the x402 proposal route

- **Quotient is listed as PayBox x402 services.** `discover_services` for "quotient" returned (two pages) 14 Quotient routes, all with `network eip155:8453`, the same USDC asset, the same `payTo` as the live 402 (matches), amounts matching the OpenAPI prices (e.g. signals 10000, mispriced 20000, lookup 5000, x/search 1000000). Routes listed: signals, signals/featured, markets, markets/search, markets/lookup, markets/mispriced, latest, sources, assets, assets/search, price-outlooks, portfolio, x/search, x/profile. Not listed: forecast, intelligence, assets/stance, signals/perps, `/markets/{slug}/signals` (`x-bazaar: discoverable false`), wallets/link, forecast-requests. No `contract_uri` was present on these rows, so the exact URL/params must come from the OpenAPI, not `get_contract`. A query for "mispriced" returned the Quotient route plus two unrelated services (an x402 preflight checker; a Hyperliquid mispriced-market scanner); "prediction market signals" returned other vendors' Polymarket/Hyperliquid data services. [H]
- A sibling note (`docs/research/06-paybox-platform.md`) records that PayBox's default listing needs recent usage and "at least 10 unique payers in the last 30 days"; if that holds, Quotient has real PayBox usage (M, inference).
- **`ivanmolto/echomarkets`** [H, files read]: created 2026-10-16, MIT, 0 stars, "a Paybox plugin ... sold a few cents at a time over x402". Plugin tools: free `search_markets`, `brief_preview`, `list_templates` (Polymarket Gamma/CLOB reads); paid `buy_brief` ($0.02) and `buy_template` ($0.10) which return an `io.paybox/transactionProposal` of `kind: "x402"` on Solana. Its "signal" is "a transparent heuristic, not a model" (spread, liquidity, price band, bid/ask balance) with "A public hit-rate page ... on the roadmap". No occurrence of "quotient" in any file I read. **Overlap = same market category and payment rail idea, not data.** It is Polymarket-only and Solana-USDC, so it neither feeds from nor competes on calibrated forecasts. Useful as a pattern reference and as a sign that the hackathon cohort will include "sell signals via x402" plugins.
- **x402 proposal shape** (from EchoMarkets' copy of PayBox's starter `plugin/src/paybox.ts`, M because it is a third-party repo copy; corroborated by sibling note 06) [H that the file says it]: key `io.paybox/transactionProposal`; `{version:"1", kind:"x402", chain: "eip155:8453" | "solana:mainnet", expiresAt (whole-second UTC, <=5 min), request:{url (HTTPS:443, no credentials/fragment), method: GET|POST, body? <=64 KiB}, payment:{asset, maxAmount (atomic uint64)}}`. For Base the asset is USDC `0x8335...2913`, identical to Quotient's. The sibling note adds "no custom headers" and "host must be a configured network host". Consequence: via a plugin proposal the Quotient API-key header cannot be sent (x402 only), and `dev`/`gateway` host must be allowlisted in the developer portal. Whether `autonomous` grants auto-sign such proposals remains unresolved (gate 8).
- Sandbox rules from that plugin's header comment: "no network at startup/discovery, every fetch bounded to 4 s, no state between calls, stdout = MCP only".

## 10. Integration spec: a venue-agnostic aggregator consuming Quotient

### 10.1 Role and boundaries
Quotient = one *model view* (Q probability, thesis, evidence) and one *publisher* of gated trade ideas. It is never an oracle, never a price source for execution and never a venue. The aggregator's own venue adapters (Polymarket CLOB, Kalshi, XO orderbook, others) own prices, depth, tradability and resolution rules. XO and Trueo have no Quotient coverage; for those, Quotient can only serve as an external prior on a *separately matched* real-world event.

### 10.2 Endpoint plan (minimal, cost-aware)
1. **Health/track record (free)**: `GET /api/public/performance`, refresh <= every 30 min; display `reporting.primary` plus the all-time row; never display only the favourable window.
2. **Candidate generation**: `GET /api/v1/markets/mispriced?min_spread=0.08&max_forecast_age=24&sort=quality` (add `venue=polymarket` or `kalshi` since only those have live quotes; `topic=` for focus). $0.02. Treat results as a *watchlist of model-vs-quote gaps*, not as "Quotient signals".
3. **Published ideas**: `GET /api/v1/signals?status=active&min_conviction=2&exclude_drawdown_risk=true&min_capacity_usd=<size x 10>&sort=quality`. $0.01. One call returns all.
4. **Enrichment** only for shortlisted markets: `GET /api/v1/markets/lookup?market_keys=k1,k2,...` (<=10 per call, $0.005) for thesis/key factors/evidence; `GET /api/v1/markets/{marketKey}/forecast?venue=<v>&history=3` ($0.01) when the user asks "why/what changed". `sources` only on request.
5. **Never use**: `/markets/{slug}/signals` as a signal source; `/signals/perps` (deprecated); X endpoints ($1); `/portfolio` (wallet-addressed, Polymarket/Hyperliquid only, would leak the user's wallet to a third party: privacy decision for the author).
6. **Free-text forecast of an XO-native market** (`POST /api/auth/forecast-requests`, $1, async, 10/day): possible for "your own question" (`question`, `resolution_rules`, `category`, `end_date`), but the spec requires a Quotient API key (`forecastApiKey`, 401/403 text); whether x402 alone suffices is NOT FOUND. Treat as an opt-in premium feature gated on the author obtaining a key and sharing XO market text with a third party.

### 10.3 Identity mapping (join keys)
- **Primary key: `marketKey`** ("prefer marketKey over slug or condition ID"). Observed forms: `polymarket:<numeric Gamma market id>` (confirmed live: `polymarket:4329882`), `kalshi:<TICKER>`, `polymarket_us:<id>`, `hl_outcomes:#<outcomeId>` (percent-encode `#` as `%23`). [H]
- Store per listing `(venue, nativeMarketId, nativeEventId, seriesTicker, marketKey, condition_id?, slug?)`. `slug` is nullable and, for sports, can be an *event* slug shared by several markets (live example slug `nfl-hou-jax-2026-10-18`); HL Outcomes rows have no slug. `condition_id` is Polymarket-only. Join to our venue adapters by `(venue, nativeMarketId)`; fall back to `condition_id` for Polymarket. Never match on question text.
- **Orientation**: for sports, "every probability on that row ... is for its `sports.yes_side` team or player" and the title/outcome order do not identify it. For binary non-sports, YES is the venue's YES; check `yes_outcome`/`outcomes`. Our adapters must map Q's YES to the venue's outcome token ids before computing edge.
- **Cross-venue**: use Quotient's `match` block only when `match_level == same_outcome` and `settlement_match == exact`; otherwise label "related, not equivalent" and never present as an arbitrage leg. For XO/Trueo, matching is the aggregator's own job and must compare resolution source, deadline and wording; an LLM match is a suggestion only.

### 10.4 Joining with live prices, and what "edge" means
- Quotient's `market_odds`/`venue_quote.selected_probability` is a *selected* quote (midpoint, bid, ask, last or graph snapshot) at `observed_at`, not an executable price, and `spread` is built on it. The aggregator must fetch the venue's own book at decision time and compute **executable edge** = Q probability for the side - ask for that side (or 1 - bid for NO) - fees - modelled slippage for the intended size. Show Quotient's number and ours side by side.
- Reject or demote when: `venue_quote.freshness` not fresh or `quote_method == graph_snapshot`; quote older than a configured age; `inDispute`; `entry_eligible == false` or `in_play`; `forecast_status.state` in (`warning`,`caution`); `drawdown_risk_elevated != false` (null = unknown); capacity below size; our book depth thin (XO: "market orders can partially fill or not fill"); `q_coverage` is `under_review`; or Q's probability is older than the freshness window we choose (`forecast.created_at`).
- Default to `q_coverage == forecasting`; show `experimental` (all sports) only behind an explicit opt-in with a visible label. My paper test shows no sports edge in the last 60 days.
- Prefer lead times under about 7 days; the CSV shows no Brier edge at 7+ days.
- Units: normalise everything to probability in [0,1] and cents on the *stated side* at ingestion; `entry_q`/`entry_pm` arrive on a 0 to 100 scale.

### 10.5 Candidate generator vs signal vs forecast (correct handling)
- **Mispriced** = recompute-on-request scan of *forecast vs live quote* across all covered live-quote markets; no publication, no entry rules, no horizon limit beyond the forecast-age window. Use as a candidate generator and as a cross-check of a signal.
- **Signal** = Quotient's gated publication; `side`/`entry_*` are frozen at publish; `latest_q`, `current_cost_cents`, `forecast_status` move. Always show both "at publish" and "now". A signal can be `ineligible` or `in_play` while still `is_active`; only `entry_eligible: true` is an entry. `retired_reason: flipped|fading_q|under_review` means close/ignore, not "bet the other way".
- **Forecast** = latest Q probability; may be revised; cite `forecast.id` and `created_at`. Do not infer a trade side from a forecast alone.
- Do not describe mispriced rows as "Quotient says buy". Do not use the phrase "price target" for Q's value (use "Q's estimate").

### 10.6 How to pay (agent side only)
Preferred flow, all by the user's agent through the PayBox MCP, plugin code never holds keys or pays:
1. `discover_services` (query "quotient") to confirm the route is listed and the price hint.
2. **Pre-flight the tuple** with a free unpaid `GET` to the exact URL (the 402 is free): require `scheme == exact`, `network == eip155:8453`, `asset == 0x8335...2913`, `payTo == 0xC3d0...97cB`, `maxTimeoutSeconds <= 300`, `amount <= 2 x` the table price (the Bankr skill uses the same pin-and-ceiling idea). Any mismatch = hard stop (the attack signal). Host must equal the pinned gateway origin.
3. Pay with `use_service` (fetch + pay + re-fetch, `credential_id` of a dedicated "data" credential) or manually: `pay_x402` (pass `accepts` exactly, `x402_version=2`, the `resource` block) then retry with the proof. Poll `get_request` on the same `request_id`; never re-call to finish; quote `plan.x402.amount_usd`, not the atomic amount.
4. Use the optional `payment-identifier` extension on retries so a repeated request cannot double-charge.
5. **Budget**: a separate data budget (suggest <= $0.05 per call, <= $2 per day) enforced on the PayBox credential/grant (`value_cents` policy), because a plugin cannot cap an agent's own payments and both known wallets are `autonomous`. Keep it out of the $10/order, $50/day trading caps. USDC on **Base** is needed; this is a different chain from XO (3223), so it is a second funding path.
6. Alternative: prepaid credits with an API key (hard-capped by balance). Needs a secret in PayBox's `request_secret` flow and a way to inject the `x-quotient-api-key` header; whether `use_service` `headers` is acceptable for that is NOT FOUND/untested. Not recommended until tested.
7. Plugin-initiated `kind: "x402"` proposals (EchoMarkets-style) are technically possible for GET routes but violate the "never from plugin code" rule and cannot send the API-key header; do not use without an explicit author decision.

The plugin's own role: pure functions and read-only tools, e.g. `quotient_describe_request` (returns canonical URL, expected tuple and ceiling for a purpose) and `quotient_parse_result` (validates the paid body against a pinned schema and normalises units). Any free Quotient call from plugin code (performance snapshot) needs the gateway host on the network allowlist and must finish within the 4 s sandbox bound (do not call `forecast-availability`, ~30 s).

### 10.7 Caching (per user only; see terms)
| Data | Key | TTL (design recommendation) | Notes |
|---|---|---|---|
| Committed forecast (`ForecastRead`) | `forecast.id` | indefinite (immutable) | The "latest forecast for market" pointer: 15 to 60 min |
| Mispriced list | query string | 5 to 15 min | Spread depends on the live quote; never use a cached spread for execution |
| Signals list | query string | 5 to 10 min | `entry_eligible`/`forecast_status` move; re-check at action time |
| Lookup/intelligence | `marketKey` + forecast id | until a new forecast id appears | Check cheaply via `changed_within` or `/latest` |
| Performance snapshot | none | 30 to 60 min | Free; matches server cache |
| OpenAPI | `info.version` | 5 min (server max-age) | Pin the version; on change run contract tests before use |
Cache scope: **per user/credential, in the user's agent/session, not shared across users and not persisted server-side by the plugin** (terms section 8). Memoise within a run (the Bankr scripts pay a URL at most once per run, warn if the same URL was paid in the last 10 min). Do not cache across a 402/payment boundary except by `payment-identifier` replay.

### 10.8 Failure modes and handling
| Failure | Signal | Handling |
|---|---|---|
| Payment required | 402 with `PAYMENT-REQUIRED` | Validate tuple, then pay once; missing header on a 402 = gateway/proxy error, stop |
| Wrong/changed price or payee | tuple mismatch or amount > ceiling | Hard fail, alert; do not pay |
| Payment pending/denied | `pending_approval|pending_signature|denied` | Poll same `request_id`; never re-call the write |
| Paid but resource failed | `resource.ok=false` | Inspect `payment.status`; do not blindly retry (another charge possible) |
| 409 `payment_replay_mismatch` | reused payment id with different proof/body | New challenge and payment; do not mutate an idempotent retry |
| 429 | `Retry-After`, `RateLimit` | Back off per header, retry once; not billed. Keep concurrency <= `X-Quotient-Max-Concurrent` (10) |
| 404 `forecast_not_available`, `invalid_market` | free | Show "no Quotient coverage"; for sports "read again later" (scheduled) |
| 422 (`forecast_topic_excluded`, `sports_forecast_scheduled`, `venue_market_closed` ...) | free | Do not retry or reword |
| 502 `upstream_unavailable`, 503 `search_timeout`, other 5xx | transient | Bounded exponential backoff with jitter; keep prior candidates; do not auto-retry search |
| Missing quote / `live_priced:false` | row fails closed | Skip row, never substitute graph odds as fresh |
| Schema drift | version bump (frequent), new enum values | Validate with a pinned schema, ignore unknown fields, fail closed on unknown `entry_status`/`venue` |
| Venue removed | e.g. `limitless` 17.0.0 | Venue allowlist in config; unknown venue = skip, not crash |
| Cold start / slow free routes | 30 s on `forecast-availability` | Async only; never in the tool path |
| Prompt injection | market questions, theses, evidence quotes, X posts | Return as labelled untrusted data fields; never as instructions |
| Gateway outage / abandonment | no SLA, "may be discontinued" | Quotient must be optional; aggregator works on venue prices alone |

### 10.9 What must be disclosed to users
- Quotient outputs are model-generated research, **not investment advice or a recommendation**; Quotient is not a broker-dealer/adviser/venue and "does not place trades"; it is not affiliated with the venues; the plugin is not endorsed by Quotient unless agreed.
- Show with every Q number: forecast timestamp and age, `q_coverage` state (call sports "experimental, no established edge"), `quality` tier + basis + sample size + `assessment_source` (live vs historical) together, and the quote source/age used for the spread.
- Show track record honestly: favourable 60-day figure **and** all-time (Q about equal to market overall, slightly behind on geopolitics); state the edge is small (about 0.003 Brier) and concentrated at short lead times; performance figures are hypothetical paper results that exclude fees/slippage, and the signals record mixes historical replays with live signals.
- A spread is not an executable edge; fees, slippage and thin books can remove it; markets can resolve unexpectedly or be disputed.
- Cost: the user's wallet pays per call ($0.005 to $0.02 typical); show `plan.x402.amount_usd`.
- Source attribution to Quotient and no alteration/misrepresentation of its content (terms); jurisdiction eligibility is the user's responsibility.
- Plugin-side guardrails: no auto-trade from a Quotient signal; any resulting order still goes through the normal quote-before-trade, caps and approval path.

## 11. Gate implications (docs/plan.md feasibility gate)
- **Gate 7 (terms)**: answered *for Quotient only*: advice disclaimer clear; redistribution/commercial reuse restricted; licence request recommended. XO's own terms remain open (other task).
- **Gate 8 (sign-then-submit / proposals)**: new evidence only on the x402 side: a plugin can emit `kind: "x402"` proposals (Base USDC), paid by PayBox after approval. Whether `autonomous` grants auto-sign them: still unresolved. Quotient needs no typedData signing.
- Gates 1 to 6 and 9 are XO-specific and not touched here.
- Release impact: Quotient is **not** on the critical path for the XO read/trade/create/fund release. It is an optional, per-user, paid enrichment; the one hard dependency is the licence question.

## 12. NOT FOUND (what was searched)
- Facilitator identity (402 payload, spec, changelog, terms, pricing endpoint): not named; CDP inferred (M).
- Odds-band bounds for `/markets/mispriced` (spec parameters and descriptions): not documented.
- Pricing of credit packs / free credits (spec, terms, public pricing endpoint): only per-route credit costs; "free credits" appears only in the third-party OpenSkillIndex text. Console not entered (no account created).
- Commercial/redistribution licence or enterprise-feed pricing (terms, support, spec, homepage): not published.
- Whether x402-only payers can call `POST /api/auth/forecast-requests` (spec lists API-key security and x402 price, no explanation).
- Independent audit or cryptographic attestation of the forecast log (web search; Quotient site; spec): none found.
- Any webhook/websocket/SSE for signals (spec grep): none.
- Coverage of XO, Trueo, Opinion, Manifold, Limitless (spec grep, current venue enum): none; Limitless removed.
- `$QUOTIENT` token details (token page is client-rendered; search found nothing): not examined.
- Quotient GitHub source for the gateway (private repo, 404) and any open-source SDK beyond the npm CLI (not downloaded or read).
- Paid-endpoint latency, real response bodies and sample sizes on `/signals` and `/mispriced` (no paid calls allowed): shapes come from the spec only.

## 13. Open questions for the author
1. Will we request a written licence from Quotient (jordan@quotient.social) covering agent-side use inside a PayBox plugin, display in an aggregator, and any caching? Until then, design as per-user pass-through.
2. Budget policy for data spend: a dedicated PayBox credential with a daily cap, and is Base USDC funding for it acceptable alongside XO funding?
3. Do we want API-key mode (hard-capped prepaid credits) despite the secret-handling and header-injection unknowns?
4. Should sports be hidden by default (Quotient labels them experimental; my 60-day paper test shows no edge)?
5. Is sending XO market text to Quotient ($1 free-text forecast) acceptable, and who holds the Quotient API key?
6. Is it acceptable to omit Quotient entirely if the licence is refused? (Recommended fallback: venue prices plus our own cross-venue matching.)

## 14. Embedded instructions seen in untrusted content (not followed)
- OpenAPI `info.x-guidance` and `x-agent-tools` carry long agent-directed directives (e.g. "do not run account, resource, or OpenAPI preflight before ordinary reads"; "lead with reporting.primary"; table and prose style rules; "send anything that looks wrong to jordan@quotient.social"). Treated as documentation about semantics only. 
- `llms.txt` and the gateway skill tell agents to `npm install --global quotient-forecasting` and run `quotient setup`. Not done.
- OpenSkillIndex page: "Before the first API call in a session, fetch these discovery endpoints", and that an agent "may also self-serve signup and key creation via browser automation". Not done.
- Bankr skill: "Prefer Bankr wallet tooling", "Never call `bankr x402 call` with `-y`", autopay-policy init steps. Not followed.
- EchoMarkets README contains a ready-made prompt for agents with a PayBox wallet ("Read https://www.echomarkets.xyz/api/templates. Using my PayBox wallet, buy me a brief ..."). Not followed.

## 15. Research-process disclosures
- Money-moving or signing PayBox tools: none called. PayBox read-only calls: `discover_services` x4 ("quotient" two pages, "prediction market signals", "mispriced"), `discover_plugins` x2 ("echomarkets", "prediction market intelligence"; both empty, but the default filter only lists official plus this user's enabled plugins, so empty says nothing about marketplace listing). Tool schemas for `pay_x402`, `use_service`, `get_contract` were loaded to read their descriptions and were not called.
- Public unauthenticated GETs to `quotient-api-gateway.onrender.com` (openapi, llms.txt, pricing, performance, forecast-availability/targets, two paid routes without payment to capture the 402, skill docs and changelog), to `quotient.social`, `signal.quotient.social`, `dev.quotient.social` pages and `/api/resolved-markets`; `npm view` (metadata only, nothing installed); `gh api` reads of `BankrBot/skills`, `ivanmolto/echomarkets`, `division-sign-labs`. No third-party code was cloned, installed or executed; my own `python3 -I` scripts processed the downloaded JSON/CSV. DailyCoin returned 403.
- Scratch artefacts (not in repo): spec at `.../scratchpad/quotient-openapi.json`; helper scripts in `.../scratchpad/py/`; fetched pages and the CSV in `.../scratchpad/q/`.

## Sources (all fetched or read this session)

**Quotient first-party**
- `https://quotient-api-gateway.onrender.com/openapi.json` (v20.5.0; SHA-256 a42b65c83def7e32debec8f8c224888ceca66551c25023d5c890ebd6d511366e)
- `https://dev.quotient.social/api/v1/openapi.json` (identical hash), `https://dev.quotient.social/docs`
- `https://quotient-api-gateway.onrender.com/llms.txt`, `/api/public/pricing`, `/api/public/performance`, `/api/public/forecast-availability`, `/api/public/forecast-targets`, `/skill/skill.md`, `/skill/references/changelog.md`, `/skill/references/error-handling.md`, `/skill/references/payments-policy.md`
- Live 402 challenges: `GET /api/v1/signals`, `GET /api/v1/markets/mispriced` (unpaid)
- `https://quotient.social/` , `/how-it-works`, `/terms`, `/support`, `/docs`, `/console`, `/api/resolved-markets` (CSV); `https://signal.quotient.social/`, `/performance`, `/terms`
- npm registry metadata for `quotient-forecasting` (`npm view`)
- GitHub: `BankrBot/skills` `quotient/SKILL.md`, `quotient/references/payments-policy.md`, `quotient/catalog.json`, commit history; `division-sign-labs` org and repo list

**Third-party**
- `https://openskillindex.com/skills/bankrbot-skills-quotient-api` (WebFetch summary)
- `https://x402-list.com/services/quotient` (WebFetch summary, first 100k chars)
- WebSearch (extended) summaries: Bazaar/OpenSea listing of Quotient; DailyCoin `quotient-ceo-jordan-olmstead-prediction-market-odds-ai-forecasting` (403 on direct fetch); Bankr spotlight tweet; independent-audit search (none found)
- PayBox MCP `discover_services` / `discover_plugins` results; tool descriptions of `pay_x402`, `use_service`, `get_contract`
- GitHub `ivanmolto/echomarkets`: `README.md`, `plugin/src/plugin.ts`, `plugin/src/paybox.ts`, `web/lib/signal.ts`, tree listing
- Repo files: `docs/plan.md`, `docs/research-notes.md`, `docs/research/06-paybox-platform.md` (sibling, for corroboration only)

**Short verbatim quotes used**
- "You may not share or resell access" / "copy, republish, redistribute, sublicense, or sell the Services or their outputs except as expressly permitted" / "use the Services to build a competing data or signals product" (quotient.social/terms, section 6)
- "a limited, revocable, nonexclusive, nontransferable right to use the Services for your personal or internal business purposes" (section 6)
- "Quotient is a publisher of research and information." (section 3)
- "For an x402 request, the payment challenge presented for that request is authoritative." (section 8)
- "BREAKING — removes the limitless venue and adds hl_outcomes" (changelog 17.0.0)
- "These are article correlations. Published trade signals are at `/api/v1/signals`." (OpenAPI, `/markets/{slug}/signals`)
- "Find markets where Q's forecast differs from a verified live YES quote by at least `min_spread`." (OpenAPI, mispriced)
- "Q's probability and supporting research with no established forecasting edge; live, but not yet proven" (OpenAPI `q_coverage`, experimental)
- "A same-outcome link can have different rules." (gateway skill.md)
- "a transparent heuristic, not a model" (echomarkets README)

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: re-fetched the OpenAPI from both hosts, the live 402 challenges (unpaid GETs only, nothing paid, no POST), the gateway skill/changelog/error-handling docs, the Terms, homepage, how-it-works and signals track-record pages, the free performance snapshot and the public CSV, then re-ran the analysis with fresh scripts (`python3 -I`, scratch dir `.../scratchpad/v12/`). No PayBox tools were called (this verification task did not authorise them), so PayBox `discover_services` claims were not re-checked. The original text above is left unchanged; where it is corrected here, the correction below governs.

### Confirmed first-hand (no change needed)
- Gateway is official: `dev.quotient.social/api/v1/openapi.json` and the gateway `/openapi.json` are both 371,531 bytes with SHA-256 `a42b65c83def7e32debec8f8c224888ceca66551c25023d5c890ebd6d511366e`, version 20.5.0, `servers[0]` = the Render gateway "Production". [H]
- 27 operations; per-route `x-payment-info.price` values match the table in section 3 (signals 0.01, mispriced 0.02, lookup 0.005, markets 0.005, search 0.01, sources 0.005, latest 0.02, X search/profile 1.00, forecast-requests 1.00). Security schemes `gatewayApiKey`, `forecastApiKey` (header `x-quotient-api-key`) and `EnterpriseFeedKey`. [H]
- Live unpaid 402s (GET `/signals`, `/markets/mispriced`, `/markets/lookup`, `/markets/search`): `x402Version` 2, scheme `exact`, network `eip155:8453`, amounts 10000 / 20000 / 5000 / 10000, USDC on Base, one constant `payTo`, `maxTimeoutSeconds` 300, `extra` {USD Coin, 2}; extensions exactly `bazaar` and `payment-identifier` (optional, id 16-128 chars `^[a-zA-Z0-9_-]+$`); challenge present in the `PAYMENT-REQUIRED` header and body; ~0.4-0.7 s. `/api/public/pricing` lists only `eip155:8453` USDC `exact`. [H]
- Rate-limit policies (standard 20 rps / 600 rpm / 20,000 per day / 10 concurrent, shared per customer or verified payer; forecast_requests 1/10/10/1; x_research 5/60/500; wallet_link 1/5/20; ip_abuse_guard 50/1,200/50,000). [H]
- Stale-endpoint claims: `/markets/{slug}/signals` = article evidence ("These are article correlations. Published trade signals are at `/api/v1/signals`."), `/signals/perps` deprecated alias of `/price-outlooks` (15.3.0), `limitless` removed and `hl_outcomes` added in 17.0.0, venue enum polymarket / polymarket_us / kalshi / hl_outcomes. No mention of XO, Trueo, Opinion, Manifold or Limitless anywhere in the spec, llms.txt or skill.md (searched for `xo` as a whole word, `trueo`, `opinion`, `manifold`, `metaculus`, `myriad`, `predict.fun`, `probable`). [H]
- Mixed units (`entry_q`, `entry_pm` 0-100; `latest_q`, `market_odds`, `venue_quote.selected_probability` 0-1; `*_cents` on the signal's side; `entry_side_price` 0-1). Additional detail: `entry_pm` is marked `deprecated: true` in the schema ("Legacy wire name"). [H]
- Free performance snapshot (generatedAt 2026-10-18T17:30:30Z, still the live snapshot): all markets all-time Q 0.17333 vs market 0.17225 (advantage -0.00108, 4,413 markets); last 60 d +0.0030 (3,432); geopolitics all-time -0.0089 (1,032), last 60 d +0.0041 (367); first forecast 2026-02-13. [H]
- Public CSV recomputation reproduces exactly: 29,486 rows, 3,252 markets, Q 0.16474 vs Polymarket 0.16759, Q wins 1,955 (60.1%), 1 tie, mean advantage 0.002851, bootstrap 95% CI [0.00028, 0.00524]; median 4 forecasts per market, mean 9.07; median 509 rows/day over the last 45 days; 5,054 same-day rows; ~50% of rows sports-like by URL. [H]
- Indicative paper test reproduced (follow spread >= 0.08, first qualifying forecast, hold to resolution): n=1,869, +10.4% (CI 5.9 to 15.1) with no slippage, +6.0% (1.8 to 10.5) with 2c; non-sports +15.0% / +10.5%; sports -0.6% / -4.8% with CI spanning zero. Robust to dropping same-day forecasts: n=1,547, +9.9% / +5.4% (non-sports +12.7% / +8.3%; sports +1.4% / -3.4%, CI spans zero). Stays M (stored prices, no fees, one window). [H for arithmetic]
- Homepage "57.2% (375 of 656), Updated September 9, 2026" and how-it-works "60.5% (1,901 of 3,142), Updated October 17, 2026" are both live at the same time. Signals track record page: +299.32u, 249 closed, 94 open, +8.6% average return, 67% win rate, "Replays were not published at the time", "94 open signals are members-only". [H]
- Terms (last updated August 7, 2026): licence "personal or internal business purposes"; "share or resell access"; "copy, republish, redistribute, sublicense, or sell the Services or their outputs except as expressly permitted"; "build a competing data or signals product"; "Quotient is a publisher of research and information"; "the payment challenge presented for that request is authoritative"; "We do not promise backward compatibility"; 12-month liability cap; contact jordan@quotient.social. Section numbers: 3 info only, 5 data/forecasts/performance, 6 use of the Services, 8 prices/payments. [H]
- Operator/identity: Quotient Solutions, Inc. (Delaware C corporation); footer links to `x.com/QuotientHQ` and `quotient.substack.com`; npm `quotient-forecasting` latest 0.8.35, MIT, maintainer email on `quotient.social`, repo field `division-sign-labs/quotient-api-gateway` (404 anonymously); org has 4 public repos incl. `strats` (Apache-2.0, "trades a Quotient target from your own Hyperliquid wallet"); `q-api.quotient.social` CNAMEs to the gateway but TLS handshake fails with both LibreSSL curl and Python/OpenSSL 3.5.9 while the gateway handshakes fine. [H]
- Latency: free `forecast-availability` took 34.1 s and 31.5 s in two tries; `forecast-targets` 0.47 s. [H]
- echomarkets: repo created 2026-10-16, MIT, 0 stars; none of the 80 text files fetched contains "quotient"; `plugin/src/paybox.ts` defines `kind: "x402"` with chain `eip155:8453` or `solana:mainnet`, GET/POST, 64 KiB body cap, expiry <= 5 min, uint64 `maxAmount`, no header field. [H]
- Bankr skill price table is stale as stated (mispriced 0.05, signals 0.02, intelligence 0.025, portfolio 0.0025) and documents the deleted `status` enum and `/signals/oil`. [H]
- Gateway docs: no charge on 404/422/429/5xx; 409 `payment_replay_mismatch`; exact retry with same payment identifier returns the cached response. [H]
- Unit-economics arithmetic ($0.96/day, $0.24/day, ~$2.9/day, ~$86/month) is correct. [H]

### Corrected
1. **"Quotient's own docs say a cross-source gap is not arbitrage" (section 0 item 2, summary) is out of context.** The only occurrence is changelog 13.5.0, "Cross-source gaps are basis observations, not arbitrage", and the spec's `x-integrations`/price-outlook wording "a cross-source gap describes the difference between source observations". Both concern asset-price outlooks and settlement-source basis groups (Hyperliquid mark vs prediction-market YES vs settlement reference), not Q-vs-venue spreads or cross-venue prediction-market gaps. The word "arbitrage" appears 0 times in the spec, skill.md, llms.txt, error-handling and payments-policy docs. The directly relevant Quotient guidance is: "A same-outcome link can have different rules" (skill.md) and "A claim of mutual exclusivity requires the contracts' resolution rules to establish that relationship" (`x-guidance`). The conclusion (a spread is not an executable edge or an arbitrage) is still right; the attribution is not.
2. **"Quotient has no webhook/websocket, only polling and an enterprise feed" and "the only 'webhook' string is unrelated" (sections 3, 12, summary) is wrong on webhooks.** `GET /api/v1/feeds/{id}/events` says: "Events are immutable and retained for 30 days. Resume from next_cursor. Webhooks use these same event bodies with at-least-once delivery; deduplicate by event_id and reconcile by sequence. Delivery order is not guaranteed." The event `type` enum includes `feed.item.entered`, `feed.item.updated`, `feed.item.exited` and `feed.test`. So enterprise feeds do have webhook delivery; there is no self-serve subscription or registration endpoint in the spec and the set-up/pricing is undocumented (still NOT FOUND). Websocket/SSE: still 0 hits. Corrected text: "No public push; enterprise feed clients get snapshot + event polling and webhook delivery (set-up undocumented)."
3. **"Breaking majors at 14, 17, 18, 20" understates churn.** The changelog marks BREAKING at 12.0.0, 13.0.0, 14.0.0, 15.0.0, 17.0.0, 18.0.0 and 20.0.0 (seven). Conclusions about churn are unchanged, just stronger.
4. **Lead-time finding ("Q worse than market at 7+ day lead times", sections 7.3, 10.4, design implication "lead times under about 7 days") is overstated and rests on a misread column.** `resolution_date` in the CSV is a scheduled/end date, not the actual resolution date: 233 of the 3,252 "resolved" markets carry a `resolution_date` after the file date (2026-10-18), and the second CSV row is a tennis qualifier forecast on 10-18 with `resolution_date` 10-25 that is already resolved. So "lead time" is a proxy for end-date distance. Splitting by a URL sports heuristic: non-sports 7-29 d advantage +0.0015 (n=610, 95% CI -0.0054 to +0.0086, Q ahead on 63.6%); sports-like 7-29 d -0.0035 (n=602, CI -0.0077 to +0.0009); non-sports 30+ d -0.0073 (n=147, CI -0.0227 to +0.0063). The only lead-time cell whose interval excludes zero is non-sports under 2 days (+0.0056, n=1,216, CI +0.0007 to +0.0107). Correct statement: "no demonstrated edge beyond about 2 days; the pooled negative at 7+ days is driven by sports-like markets and is not statistically distinguishable from zero".
5. **"The edge claim is real" / "mean Brier advantage 0.0029 (CI 0.0003 to 0.0053)" is not robust to the same-day rows.** Dropping forecasts dated on `resolution_date` (2,937 markets): advantage +0.00089, CI [-0.0018, +0.0036], Q wins 58.6%. Requiring at least 2 days (2,574 markets): advantage about 0.00000, CI [-0.0028, +0.0027], Q wins 58.4%. So the headline interval excludes zero only because of forecasts made on the scheduled end date (17% of rows, where the price may already embed the outcome; the CSV has no timestamps or attestations to rule that out). The research note flagged the timestamp caveat but still called the edge "real"; the safer reading is "not distinguishable from zero outside the final day". (The follow-the-spread paper test is separately robust to dropping same-day rows, see above, but it is not a Brier statement and has no fees.)
6. **Citation fix:** section 10.7 cites "terms section 8" for the per-user cache scope; the redistribution/sharing clause is **section 6** (section 8 is prices and payments).
7. **Headline-moves inference (section 7.1) needs a caveat.** The two official pages are simultaneously live with different numbers because the homepage is still showing the September 9 snapshot while how-it-works is at October 17; the sample also changed from 656 to 3,142 resolved markets (so the 60-day window composition changed, not only a drift in the same population). It is a legitimate red flag about unsynchronised self-reporting, less so about a "moving" claim.

### Unverifiable in this pass (default to unverifiable)
- PayBox `discover_services` facts (14 Quotient routes, same payTo, no `contract_uri`, "at least 10 unique payers") were not re-queried. Consistency checks only: the spec marks 15 routes `x-bazaar discoverable: true` (assets, assets/search, markets, markets/search, markets/mispriced, markets/lookup, signals, signals/featured, price-outlooks, assets/stance, portfolio, sources, x/search, x/profile, latest) and x402-list says "15 endpoints", so the claim that PayBox lists 14 (without `assets/stance`) is plausible but unconfirmed.
- CEO name / DailyCoin content (direct fetch returns HTTP 403 again; the search snippet only says Q was 8.44% lower Brier over 60 days to Aug 19 on 965 forecasts / 172 markets and that the CEO says Q does not win every category). The "0.1289 vs 0.1338 geopolitics on Sept 24" detail and the "8.2% / 7.2%" figures cannot be confirmed.
- "Facilitator is probably Coinbase CDP": only changelog 8.2.0 ("publishes CDP x402 Bazaar discovery metadata ... the facilitator's minimum settleable amount") supports it; remains M.
- Whether x402 alone can call `POST /api/auth/forecast-requests` stays NOT FOUND. New evidence leans to API key required: changelog 11.4.1 "forecast requests take x-quotient-api-key only", 11.6.0 "submission debits credits like every other paid route"; but the operation also carries `x-payment-info {protocols: [x402], price 1.00}`, a 402 response with `PAYMENT-REQUIRED`, `x-bazaar discoverable: false`, and `/api/public/pricing` lists `x402AmountUsd: 1` for it. No POST was attempted (not permitted).
- Odds-band bounds for `/markets/mispriced`: NOT FOUND again (searched spec, llms.txt, skill.md, error-handling, payments-policy, full changelog for "odds band", "band", "0.05"/"0.95").
- Credit-pack pricing, free credits, commercial/redistribution licence, enterprise feed terms, independent audit: NOT FOUND again (new queries: "audit/attestation/independent evaluation Brier Quotient", "enterprise feed webhook licence pricing"; homepage only lists "Venues & trading interfaces: serve trusted analysis to your users" as an audience; support page is only the email).

### Missed or under-weighted findings
- Enterprise feed webhooks exist (item 2 above).
- Bankr history: `BankrBot/skills` removed the Quotient skill on 2026-07-29 ("The Quotient integration is no longer maintained or required") and a Quotient-side user re-added it on 2026-08-03. Treat the Bankr skill as vendor-promoted, not as independent endorsement.
- Real paid traction looks small: x402-list (auto-imported, unverified but measured) reports "Traction $9.56 30d, 27 buyers, top buyer 33%" and calls it "a conservative undercount". This tempers the inference in section 9 that Quotient has "real PayBox usage".
- Changelog 17.11.0 fixed a Quotient bug where, on Polymarket game-winner markets whose YES is the second-listed team, `market_odds`/`venue_quote` carried the first-listed team's price; spreads, `spread_direction` and `forecast_status` followed. Historical sports spreads (and possibly the sports rows of the public CSV and the signals record) may have been computed against the wrong side before the fix; this further weakens any sports track-record inference.
- Spec text inconsistency: the `q_coverage` description for `experimental` still says it covers "every price market, which no read lists or serves", while changelog 17.10.0 says price markets now read `forecasting`. A default filter of `q_coverage == forecasting` therefore admits price markets, whose track record is not isolated in the performance snapshot (scopes are only all markets and geopolitics/elections).
- Plugin brokered headers (sibling note 06: owner-level headers injected by PayBox for ordinary sandbox requests to an allowlisted host) mean a plugin could send `x-quotient-api-key` on an ordinary request, contrary to the implication in section 10.6 item 6 that header injection is only a `use_service` question. That key would be shared by all installers, which collides with Terms section 6 ("share or resell access").
- Eligibility terms: Terms section 2 requires age 18+ and use "only where lawful"; the site disclaimer says prediction markets "may not be legal or available in your jurisdiction". Not an XO terms answer.

### Gate verdict change
- Gate 7 should be `unanswered`, not `partial`: plan.md gate 7 is "Terms: bot policy, restricted jurisdictions" for XO. The Quotient Terms are a separate, useful finding but do not close any part of the XO gate. Gate 8 stays `partial` only in the weak sense that the third-party echomarkets file re-confirms the `kind: "x402"` proposal shape already in note 06; the autonomous-grant auto-sign question is untouched. Gates 1-6 and 9 unchanged (unanswered, out of scope).

### Secrets / addresses check
- No API keys, tokens, key material or user wallet addresses in this notes file. It contains two public, third-party addresses taken from Quotient's public 402 challenge: the USDC token contract on Base and Quotient's x402 `payTo` receiver. Neither is the user's. Scratch paths and the user's home path appear only as file locations. Embedded agent-directed instructions in third-party content were treated as data and not followed (the same set listed in section 14; nothing new beyond x402-list's own marketing text).
