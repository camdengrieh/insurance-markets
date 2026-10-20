# Hyperliquid HIP-4 front end: TrueNorth - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public GETs only (truenorth.xyz, partner API docs, keyless tool catalog, DefiLlama JSON API). No account, key, wallet, signature, POST, payment or PayBox tool. Third-party text treated as untrusted data; no embedded instructions seen. The WebSearch budget was exhausted in this session (zero searches possible) and defillama.com HTML returned 403 to WebFetch, so DefiLlama figures were re-read via the JSON API. This note re-verifies key facts live and otherwise builds on the fuller sibling note `docs/research/venues/truenorth.md` (same venue, researched earlier today, including client JS excerpts and Terms quotes).

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary, inferred, or carried from the sibling note without re-reading; L = weak/stale. "NOT FOUND (searched: ...)" = not documented where looked.

Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-truenorth/` (earlier-today captures copied from `fixtures/truenorth/`, plus two live re-captures dated 2026-10-19).

## 0. Bottom line

1. TrueNorth is not a prediction-market venue. It is an AI "agentic brokerage" / trading-intelligence product that routes self-directed orders to other venues (H: https://truenorth.xyz/, fetched 2026-10-19; homepage names Hyperliquid, Lighter, Binance, Bybit, Bitget, Variational and does not mention HIP-4 or outcome markets).
2. Its HIP-4 link is a Hyperliquid builder code, listed on DefiLlama as "TrueNorth Outcome" (category Interface, chain Hyperliquid L1, parent TrueNorth, `doublecounted: true`) (H: https://api.llama.fi/summary/dexs/truenorth-outcome?dataType=dailyVolume, fetched 2026-10-19). The shipped client has an order path that classes asset ids >= 1e8 as "HIP4" and attaches a per-market builder fee (M, carried: fixture `tn_client_bundle_hip4_builder_and_order_excerpt.txt`). UI exposure is login-gated and unconfirmed.
3. Liquidity is 100% shared with Hyperliquid HIP-4. DefiLlama itself marks it double-counted (H). NOT an independent arbitrage leg.
4. Its own flow is negligible: all-time $796 (2026-08-29 $382, 2026-08-30 $414), $0 every day since through 2026-10-18; all-time builder fees $0 (H, DefiLlama JSON, 2026-10-19). Hyperliquid HIP-4 overall: $3.13M 24h, $17.9M 7d, $47.0M 30d, $261.1M all-time (H, https://api.llama.fi/summary/dexs/hyperliquid-outcomes?dataType=dailyVolume, 2026-10-19).
5. No outcome API. TrueNorth's API is authenticated, data/AI oriented, 58 tools, none for HIP-4 (H: keyless catalog https://tn-api.truenorth.xyz/api/agent-tools, 58 tools; grep of catalog, openapi.json and llms.md finds only Polymarket-odds references, no "HIP-4"). No public order API.
6. adapter_priority = skip. Build the Hyperliquid HIP-4 adapter (`hyperliquid-hip-4-outcomes-native.md`) and record TrueNorth only as a `front_ends[]` / builder-code entry.

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| https://truenorth.xyz/ HTTP 200, `date: Mon, 19 Oct 2026 05:19:38 GMT`, assets build `v37.17-202610191218` (built 2026-10-19), footer "(c) 2026 TrueNorth" | H |
| Claims "12,000+ traders", "25,000+ agents", "$300M+ trading volume" (marketing, unreconciled; perps volume dimension is paywalled on DefiLlama) | H that claimed, L as truth |
| Partner OpenAPI version `2026-08-19-fa1f30e455a5` fetched from https://storage.googleapis.com/truenorth-partner-api-docs/openapi.json (HTTP 200) | H |
| `GET https://tn-api.truenorth.xyz/api/agent-tools` HTTP 200, `totalCount` 58 | H |
| DefiLlama TrueNorth Outcome: 51 daily points, final 2026-10-18 = 0; only two non-zero days | H |

Verdict: still_live = true as an AI trading product; marginal for HIP-4 (two tiny days then silence).

## 2. Kind and market model

- Kind: broker-or-frontend (AI terminal + non-custodial order-routing + optional agent execution). Terms (https://truenorth.xyz/legal/terms, HTTP 200 this session) describe the Services as data, analytics and AI scenarios incl. "Prediction markets: event-based market data, probability analytics, and order book data from third-party prediction market platforms" (H). Sibling note quotes Terms s.5.7(b)/5.6(c) saying TrueNorth operates no exchange and does not broker prediction-market positions (M, carried), which conflicts with the builder-code path; treat as boilerplate.
- Market model is Hyperliquid's: fully collateralised binary Yes/No outcome tokens on HyperCore CLOB, order asset id = 100,000,000 + 10*outcome + side, categorical via "questions", no leverage/funding (M, from sibling `hyperliquid-hip-4-outcomes-native.md`). TrueNorth has no markets, tokens or books of its own.
- Which HIP-4 markets the TrueNorth UI lists: NOT FOUND (searched: homepage, Terms, docs llms.txt grep for hip/outcome/predict, partner openapi/llms.md; app is login-gated and I did not log in).

## 3. Chains and collateral

- Execution/settlement on HyperCore (Hyperliquid L1), not EVM; DefiLlama chain tag "Hyperliquid L1" (H). Collateral USDC held in the Hyperliquid account (M, sibling).
- TrueNorth holds no custody (claim in Terms, M). Client signs with a locally held Hyperliquid API/agent wallet key (M, carried from client JS excerpt).

## 4. Read API

- Official-authenticated, read-only, general AI/market-data; nothing for outcome books/trades/resolution.
- Docs: https://storage.googleapis.com/truenorth-partner-api-docs/index.html (also `openapi.json` 836 KB, `llms.md` 104 KB) (H). Base: `https://tn-api.truenorth.xyz` (H). MCP at `mcp.truenorth.xyz` is token-gated (M).
- Key endpoints: `POST /api/agent-tools/call` {toolName, arguments}, `POST /api/agent-tools/batch`, `GET /api/agent-tools` (keyless catalog), plus signal GETs (fear-greed, etf-flow, etc.) (H, openapi paths). Relevant tools: `polymarket_insight` (Polymarket odds only), `hyperliquid_smart_money` (perps wallets), `venue_costs` (H, catalog names).
- Auth: Bearer `ak_...` or `X-API-Key`, keys created in the logged-in app; keyless access being switched off except the catalog (M, carried from openapi text). Rate limits: no numbers published (NOT FOUND, searched: openapi.json, llms.md). Websocket: NOT FOUND.
- Terms bar scraping the web app and programmatic access except via issued credentials (M, carried s.7/s.9).
- Response shape confirmed live: catalog `{"success","message","code","failed","data":{"tools":[{"name","description","inputSchema"}],"totalCount":58}}` (H). Fixture: `tn_api_agent_tools_catalog_trimmed.json`.
- Where to read HIP-4 instead: Hyperliquid directly (`/info` `outcomeMeta`, `l2Book`, `wss://api.hyperliquid.xyz/ws`; keyless) per the sibling Hyperliquid note. To observe TrueNorth-attributed flow only: DefiLlama `dexs/truenorth-outcome` (H) - fixtures `defillama_truenorth_outcome_dexs_dailyVolume.json` (earlier today), re-checked live matches ($796 all-time).

## 5. Trade path

- None public. Orders built and signed inside TrueNorth's client as Hyperliquid `order` actions with `builder:{b,f}`; builder settings via JWT-gated `GET /user/builder-config` (M, carried; not called). Builder address `0x30599f69164b854a2c10ada95e5cd219b72d5216` is TrueNorth's public builder address from DefiLlama's adapter source (M, fixture `defillama_dimension_adapter_truenorth_excerpt.ts.txt`).
- "Agent Execution Services" can submit orders autonomously within user permissions (M, Terms); pricing/permission detail NOT FOUND.
- For us: sign Hyperliquid actions directly (EIP-712 agent-wallet scheme, optional builder code) - the Hyperliquid adapter's job.

## 6. PayBox reachability

paybox_reachable = no (via TrueNorth). Sibling note: `discover_plugins("truenorth")` returned nothing on 2026-10-19 (M, carried; not re-run, PayBox tools not needed for this read-only spec). No public order API, so no signed-order or transaction-proposal route through TrueNorth. Via Hyperliquid itself: partial (HyperCore takes signed actions, not EVM tx proposals; deposits from Arbitrum USDC) per sibling note (M).

## 7. Fees

- Builder fee: DefiLlama all-time fees $0 (H); adapter comment says 0% builder fee (M). Client has per-market `fees_bps` incl. a `HIP4` tier; live value NOT FOUND (JWT-gated). Builder fee unit to Hyperliquid is tenths of a bp (M, carried).
- Platform: subscription + credits; no public pricing found (M). DefiLlama methodology: builder-code fees accrue on HIP-4 closing/settling (H); Hyperliquid charged no outcome fee before 2026-08-15 (H, DefiLlama methodology text), fees apply since.
- Hyperliquid base fee for HIP-4: see sibling note (estimates ~11-25 bps all-in; M).

## 8. Resolution and dispute risk

TrueNorth has none; inherits Hyperliquid HIP-4 deployer-settled resolution (no trader dispute window for most markets per sibling, M). TrueNorth disclaims liability for third-party resolution (M, Terms).

## 9. Geo / ToS / automation

- Operator ADVENT AI PTE. LTD. (Singapore) per sibling (M). Terms bar sanctioned jurisdictions and VPN circumvention; passes through each execution venue's eligibility, and Hyperliquid bars US residents for outcome markets (M).
- Automation: Terms prohibit bots/scrapers against the Services and programmatic access except via issued API credentials (M, carried). Do not scrape the app.

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TrueNorth Outcome volume | $796 all-time; 24h/7d/30d = $0 | api.llama.fi, 2026-10-19 | H |
| TrueNorth Outcome fees | $0 all-time | api.llama.fi, 2026-10-19 | H |
| Hyperliquid Outcomes (shared book) | 24h $3,128,093; 7d $17,900,930; 30d $47,014,618; all-time $261,084,367 | api.llama.fi, 2026-10-19 | H |
| TVL | none (off-chain software) | DefiLlama (carried) | M |

Shares liquidity with: Hyperliquid HIP-4 (100%). Not independent.

## 11. Category overlap

TrueNorth lists none itself; whatever it routes is the Hyperliquid HIP-4 catalogue (crypto-price binaries, some sports/macro) - overlap with Polymarket/Kalshi etc. is Hyperliquid's, not TrueNorth's (M). Its Polymarket odds tool reads a venue already covered.

## 12. Adapter recommendation

skip. Duplicate liquidity, front end only, ~zero outcome flow, no outcome data in its API, no public trade path. Optional: record builder address as a fee parameter on the Hyperliquid adapter. Re-check `truenorth-outcome` volume in a month; growth only means more flow into the same books.

## NOT FOUND

- Official statement that TrueNorth's UI lists/trades HIP-4 (searched: homepage, Terms, docs llms.txt, partner openapi/llms.md; no web search possible).
- Live HIP4 builder fee, rate limits, websocket, public order endpoint, pricing page, independent news check (search budget exhausted).

## Sources

- https://truenorth.xyz/ (H, 2026-10-19)
- https://truenorth.xyz/legal/terms (H partial, 2026-10-19)
- https://storage.googleapis.com/truenorth-partner-api-docs/openapi.json and llms.md (H)
- https://tn-api.truenorth.xyz/api/agent-tools (H)
- https://api.llama.fi/summary/dexs/truenorth-outcome, /summary/fees/truenorth-outcome, /summary/dexs/hyperliquid-outcomes (H)
- https://defillama.com/protocol/truenorth-outcome (403 to WebFetch; not read)
- `docs/research/venues/truenorth.md`, `hyperliquid-hip-4-outcomes-native.md`, `hyperliquid-hip-4-front-end-nansen.md` (M, internal earlier work)
