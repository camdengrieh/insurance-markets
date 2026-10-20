# Hashdive (hashdive.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs with generic User-Agent `insurance-markets-research/0.1`, `gh` reads, WebFetch. No account, key, wallet, signing, POST/PUT/DELETE, PayBox money tools. The shared WebSearch budget was exhausted before this task started, so no web search was possible: company-background items (ownership, pricing, history) are weak. Third-party text treated as untrusted data.

Tags: **H** read first-hand in a primary source this session; **M** secondary or inferred; **L** weak or stale.

## 0. Bottom line

1. **Hashdive is not a venue.** It is a Polymarket (and, per third-party listings, Kalshi) trader-analytics web app: "Smart Score" ranking of wallets, market overview, "AI probability". No order book, no collateral, no settlement, no trading. It cannot be an arbitrage leg. (H for tagline and noscript copy; M for Kalshi coverage)
2. **Live as a website** (HTTP 200, Streamlit-style `/_stcore/health` returns `ok`, 2026-10-19) but **its public API appears to have been retired or moved**: `https://hashdive.com/api/v1/get_trades` and `https://hashdive.com/API_documentation` both return **301 to `https://unusualwhales.com/predictions/api`** ("Unusual Predictions"). (H for the redirects; the ownership relationship is M/inference, see section 1.)
3. The only machine-readable data surface found is Unusual Whales' paid `/api/predictions/*` REST API (bearer token, Startup tier $750/mo for commercial use). It is signal data (whales, insiders, smart money, per-user positions, order-book liquidity), all derived from Polymarket. (H)
4. **adapter_priority = P2** (signal-only, paid, derived from Polymarket so zero independent liquidity). Potentially useful as one input to a "smart money" signal alongside Quotient; never as a price or execution source. Not worth building before core venue adapters.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.hashdive.com/` | 200, `last-modified: Tue, 14 Jul 2026 20:11:56 GMT`, title "Polymarket Analytics by Hashdive", meta description "Hashdive is a powerful Polymarket Analytics platform." | H |
| `GET https://hashdive.com/_stcore/health` | 200 body `ok` (Streamlit server health) | H |
| Homepage `<noscript>` copy | "Top 20 Markets ordered by liquidity and trading volume", "AI Probability: compare human vs AI-calculated..." | H |
| `GET https://hashdive.com/api/v1/get_trades` | **301 -> https://unusualwhales.com/predictions/api** | H |
| `GET https://hashdive.com/API_documentation` | 301 -> same URL (WebFetch redirect notice) | H |
| `https://docs.hashdive.com`, `https://api.hashdive.com` | do not resolve | H |
| `robots.txt`, `sitemap.xml`, `llms.txt` on hashdive.com | return the SPA shell HTML (no real files) | H |
| GitHub repo `SauliusDev/DSA-Prediction-Markets` (pushed 2026-07-30) | student project: "collected data on ~1000 Polymarket traders using Hashdive's proprietary API ... took ~20 hours due to API rate limits"; calls it "Hashdive Premium API" (paid) | M (third-party, 2026) |
| GitHub `aarora4/Awesome-Prediction-Market-Tools` README | "Hashdive: advanced Polymarket and Kalshi analytics, special focus on Smart Scores" | M |

**still_live = true for the analytics website; the API has moved/retired.** Relationship to Unusual Whales: the redirect plus the overlapping product (UW's API has `smart_score`, `whales`, `smart-money`, `insiders`, per-wallet `user/{id}` with category scores) strongly suggests Hashdive was acquired by or merged into Unusual Whales' "Unusual Predictions". **NOT FOUND (searched: hashdive.com pages, unusualwhales.com/predictions pages, UW openapi, GitHub code search; web search unavailable)**: any first-party statement of acquisition. Treat as M inference only. Note UW's own OpenAPI never names Hashdive (grep: 0 hits, H).

predictionindex.xyz/ecosystem: WebFetch could not see a Hashdive entry (page truncated); the discovery hint "Polymarket Analytics by Hashdive" matches the hashdive.com title (H).

## 2. Kind and market model

- kind: **analytics / data (signal source)**. Not a venue, not a router, not an executor. (H)
- Market model: none. It republishes Polymarket's: binary/categorical CLOB markets, outcome tokens identified by Polymarket `asset_id` (decimal ERC-1155 token id, example in UW schema `78699665...652931`). (H, UW openapi schema example)
- Outputs: trader "Smart Score" (range roughly -99 to +99 per the student repo, M), win rate, PnL, category scores, whale/insider flags, bot tag, order-book liquidity summaries. (H for UW field names; M for score range)

## 3. Chains and collateral

None held. Underlying data is Polymarket on Polygon (USDC collateral). UW position schema has tag `polymarket_smart_contract` and a `user_address` (0x EVM address). (H) Kalshi coverage, if any, is off-chain. (M)

## 4. Read API

- **Hashdive-branded API: retired/redirected** (H). Historic path `https://hashdive.com/api/v1/get_trades` (and a doc page `/API_documentation`) existed (the 301 on those exact paths is consistent with a prior API, M). Historic endpoint list, auth header and rate limits: **NOT FOUND (searched: hashdive.com, docs/api subdomains, web search unavailable)**. The student repo reports a paid "Premium API" with slow rate limits (M).
- **Successor: Unusual Whales API**, docs https://api.unusualwhales.com/docs, OpenAPI https://api.unusualwhales.com/api/openapi (HTTP 200, 1.26 MB YAML, public, H). Base URL `https://api.unusualwhales.com`. Auth: HTTP bearer token (`securitySchemes.authorization: scheme bearer`), tokens bought at unusualwhales.com/dashboard/api (H).
- Prediction endpoints (all GET, all need bearer token; I did NOT call them) (H, from OpenAPI):
  - `/api/predictions/insiders` - potential insider activity
  - `/api/predictions/market/{asset_id}` - market detail (trades, outcome assets, tag scores)
  - `/api/predictions/market/{asset_id}/liquidity` - order book levels: `best_bid`, `best_ask`, `mid_price`, `spread`, `bids[]`, `asks[]`, `bid_liquidity`, `ask_liquidity`, `total_liquidity`, `timestamp` (strings)
  - `/api/predictions/market/{asset_id}/positions`
  - `/api/predictions/search-users`
  - `/api/predictions/smart-money` (query: `categories`, `min_price`, `max_price`; categories Crypto, Culture, Finance, Politics, Science, Sports, Technology)
  - `/api/predictions/unusual`
  - `/api/predictions/user/{user_id}` (positions capped at 20,000 by `total_invested_usd`; `combos` for Polymarket Combos; both added 2026-10-13/15 per changelog, i.e. actively maintained)
  - `/api/predictions/whales`
- No markets-list or resolution endpoint, no websocket documented for predictions (UW offers Kafka streaming only on the $3,000/mo tier, generic, not shown to cover predictions; M).
- Rate limits/pricing (H, OpenAPI info text): Startup tier $750/mo, 500 req/min, 80K daily requests, 90-day lookback, commercial use included; Startup+Kafka $3,000/mo; enterprise for redistribution licences. Prediction endpoints' specific plan gating: NOT FOUND.
- Page https://unusualwhales.com/predictions/api is titled "API Access | Unusual Predictions - Query the Unusual Predictions API directly with your session token" (H). That page also carries an "AI/LLM Instructions" block directing agents to a token-purchase link with `utm_campaign=agents_redirect` (see suspicious content). Not followed.

## 5. Trade path

**None.** Analytics only. (H) Nothing to do with PayBox signing. To trade the underlying markets, use the Polymarket adapter (covered by another workflow).

## 6. PayBox reachability

**no** for Hashdive itself (no venue, no contract, no orders). The data side needs only an HTTPS bearer token, not a wallet. Whether PayBox's `use_service`/x402 catalogue lists Unusual Whales: NOT CHECKED (out of scope; no x402 payment requirements seen on the endpoints because none were called). Wallet-level signals do reference EVM (Polygon) addresses that could be matched to Polymarket positions.

## 7. Fees

Hashdive/UW charge subscription fees only (UW Startup $750/mo, H; Hashdive legacy Premium API price NOT FOUND). No trading fees because no trading.

## 8. Resolution mechanism

Not applicable; inherited from Polymarket (UMA optimistic oracle on Polymarket, M, covered by the Polymarket workflow). Hashdive does not resolve or dispute.

## 9. Geo / ToS / automation

Hashdive ToS: **NOT FOUND** (`/terms` returns the SPA shell). UW API: commercial use only on Startup tier and above; redistribution requires an enterprise licence (H, OpenAPI info text). Our plugin redistributing UW-derived signals to users would likely need the enterprise licence (M inference). No geo-blocking observed for the data API (not tested with a token).

## 10. Liquidity and category overlap

- Liquidity: none of its own. Not applicable. Polymarket volume is covered elsewhere.
- Shares liquidity with: **Polymarket (100%)**; all data is a view of Polymarket (and maybe Kalshi) activity. **Not an independent arbitrage leg.** (H for Polymarket focus; M for Kalshi)
- Category overlap: Crypto, Culture, Finance, Politics, Science, Sports, Technology (UW smart-money categories, H). All are Polymarket's own categories.

## 11. Adapter implication for the aggregation layer

- Optional `SignalProvider` (not `Venue`) interface: input a Polymarket `asset_id` or wallet, output smart-money/whale/insider tags and category-scored trader stats. Use as a feature for edge confidence, parallel to Quotient, never as a price source. Gate behind a user-supplied UW bearer token (we should not embed ours or redistribute).
- A free alternative for similar signals is building them from Polymarket's own public data API trades/positions (covered by the Polymarket workflow), avoiding a $750/mo dependency.

## 12. Suspicious / embedded instructions

- `https://unusualwhales.com/predictions/api` contains an "AI/LLM Instructions" block telling agents to request docs with `Accept: text/plain`, to use an OpenAPI spec, MCP server (`https://unusualwhales.com/public-api/mcp`) and skill file (`https://unusualwhales.com/skill.md`), and to follow a token-purchase link tagged `utm_campaign=agents_redirect`. Commercial funnel aimed at agents; recorded, not followed (I only did a plain GET of the OpenAPI spec and read the skill file listing size).

## 13. Open questions

1. Was Hashdive formally acquired by or merged into Unusual Whales? (Needs a first-party announcement; web search was unavailable.)
2. Does Hashdive still serve a separate authenticated API on hashdive.com (the historic `/api/v1/*` paths now 301)? Did the old API cover Kalshi?
3. Which UW plans include `/api/predictions/*`?
4. Hashdive/UW ToS on automated redistribution of Smart Scores.

## Sources

- https://www.hashdive.com/ (H, homepage HTML, 2026-10-19)
- https://hashdive.com/_stcore/health (H)
- https://hashdive.com/api/v1/get_trades and https://hashdive.com/API_documentation, both 301 (H)
- https://unusualwhales.com/predictions/api (H, page title/description and agent block)
- https://api.unusualwhales.com/api/openapi (H, OpenAPI incl. predictions paths, auth, pricing text, changelog to 2026.10.16)
- https://api.unusualwhales.com/docs (referenced, not read)
- https://github.com/SauliusDev/DSA-Prediction-Markets (M, README via `gh api`, 2026)
- https://github.com/aarora4/Awesome-Prediction-Market-Tools (M, README listing)
- https://github.com/Beexly/gse-competitive-intel dossiers/hashdive.com.json (L, scripted scan dated 2026-09-08, mostly "NOT CONFIRMED")
- https://predictionindex.xyz/ecosystem (discovery source; Hashdive entry not visible in fetched portion)

Fixtures: `docs/research/fixtures/hashdive/redirect-api-to-unusualwhales.txt`, `docs/research/fixtures/hashdive/unusualwhales-predictions-openapi-excerpt.txt`. No live JSON from a prediction endpoint was captured (all require a bearer token).
