# WagerUp Pilot (wagerup.com/pilot) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch of public wagerup.com pages, unauthenticated GETs to wagerup.com/api/v1, data-api.polymarket.com and api.llama.fi with User-Agent `insurance-markets-research/0.1`. No account, Telegram interaction, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Third-party text is untrusted data; nothing in it was followed.
Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred or carried from the earlier sibling note; L = weak/stale.
Deeper sibling notes from an earlier pass (same venue, discovered under another name): `docs/research/venues/wagerup.md` and `docs/research/venues/wagerup-predictions.md`. This file re-verifies the key facts and fixes the verdict for the "Pilot" entry. Claims below tagged M(sibling) were not re-fetched today.

## 0. Verdict

- **adapter_priority: skip.** WagerUp Pilot is a Telegram trading bot and research site that routes every order into **Polymarket's CLOB on Polygon**. It is a builder-code front end, not a venue. Same markets, tokens, prices, resolution as Polymarket, so it is 100% duplicate liquidity and not an independent arbitrage leg.
- Live but near-dormant: Polymarket reports 2 active users on 2026-10-19 (H). It was rank 14 all-time by builder volume (H) but that is historical: volume peaked in April 2026 and has decayed to a few hundred to low thousands of share-notional per day.
- No usable market-data API (market endpoints are key-gated, no key application path found) and no programmatic trade path (orders only inside the Telegram bot, server-held key).

## 1. Still live? (2026)

| Evidence | Value | Tag |
|---|---|---|
| https://wagerup.com/pilot | fetched 2026-10-19; "Automated Sports Trading Bot", "Copy Top Traders"; fee text below | H |
| https://wagerup.com/api/v1 | HTTP 200 on 2026-10-19: `{"name":"WagerUp Public API","version":"1.0.0","status":"beta","dataAccess":"restricted",...}` | H |
| https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL | row `rank 14, builder WagerUpPilot, volume 107,480,116.9, activeUsers 138, verified true` (volume is share notional, see 5) | H |
| https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90 | WagerUpPilot present on all 90 daily buckets; 2026-10-19: rank 81, volume 462.3, 2 active users; 10-18: 1,629.6 / 2; 10-16: 15,175.9 / 4 | H |
| DefiLlama `wagerup-predictions` | category Interface, chain Polygon, 24h $682, 7d $11,353, 30d $61,331 | H |
| Telegram bot itself | not opened; liveness inferred from builder rows | M |

still_live = true, as a small front end.

## 2. Kind and market model

- Kind: **broker-or-frontend** (Telegram bot "Pilot" + research site + separate "TerminalUp" product). H, https://wagerup.com/pilot and /methodology: markets, order books and price history come from "Polymarket market and CLOB data".
- Model: inherited from Polymarket: binary YES/NO outcome shares ($1/$0), CLOB, negative-risk multi-outcome events (M(sibling); see `docs/research/08-venues-polymarket-kalshi.md`). No WagerUp token, AMM or parimutuel. Outcome tokens are Polymarket's ERC-1155 conditional tokens on Polygon.
- Features: manual trading, copy trading of top wallets, "Auto Pilot" rules, portfolio (pilot page and sibling note). Sharp-wallet/whale labels are "research signals" computed from public wallet data (H, /methodology).

## 3. Chains and collateral

- Settlement chain: Polygon (137), via Polymarket (M(sibling), H per DefiLlama chain field). Collateral: USDC-family on Polygon per Polymarket.
- Wallet: Pilot generates a Polygon wallet per Telegram user; key stored encrypted server-side so the bot can sign; `/export` and `/import` exist (M(sibling), site docs chunk). Funding copy conflicts (Polygon USDC only vs "ETH, USDC, USDT, SOL, BNB, POL supported"); unresolved.
- TVL: none (no custody product of its own as an Interface in DefiLlama).

## 4. Read API

- Exists: **official-authenticated** (beta) for market data; unauthenticated only for product documents.
- Docs: https://wagerup.com/developers (H, WebFetch). Base URL `https://wagerup.com/api/v1` (H).
- Key endpoints (H for paths listed on /developers and the 401 probe; response field lists M(sibling) from the OpenAPI):
  - `GET /api/v1` and `/status`, `/products`, `/search`, `/documents/{id}`: no key; marketing/product documents only.
  - `GET /api/v1/markets` and `GET /api/v1/traders`: **Bearer key required**, 401 `api_key_required` confirmed today. Sibling note: sports-only snapshot, max 50 rows, fields bid/ask/mid probability, volume, liquidity; "not an exhaustive exchange feed"; no depth, no token/condition ids documented.
  - `POST /api/v1/mcp` (Streamable HTTP MCP; not called, POST).
  - `GET /api/v1/openapi.json`.
- Auth: "approved, scoped API key"; no self-serve application path found. NOT FOUND (searched: /developers, /api/v1 root links, sibling notes' OpenAPI/llms.txt/support review).
- Rate limits: 30 req/min anonymous, 120/min per key, "beta limits, not billing quotas" (H, /api/v1 root `limits` and `ratelimit-limit: 30` header).
- Licence: "Public access does not grant redistribution rights to third-party market data" (M(sibling) quote of developers page).
- Websocket, trades, resolution endpoints: NOT FOUND (searched: /developers page text, /api/v1 root, sibling OpenAPI review).
- Aggregator value: none beyond Polymarket. Use Polymarket's own Gamma/CLOB/WS APIs instead.

## 5. Public Polymarket endpoints that expose its footprint (monitoring only)

- `GET https://data-api.polymarket.com/v2/builders/volume?interval=day&limit=90` returns `{"data":[{"date","rank","builder_name":"WagerUpPilot","builder_code","verified","volume","active_users"}...]}` (H, fixture `polymarket_builders_volume_v2_wagerupilot_last14.json`). Note: Data API v1 is announced as retired 2026-10-24 (M(sibling), docs.polymarket.com migration page); the leaderboard URL in the task is v1 and may disappear.
- Units gotcha (M(sibling)): builder `volume` is share notional, not dollars; USD is lower by about 1/price. The leaderboard's 107.5M "all-time" is therefore not dollars.

## 6. Trade path

- Programmatic placement through WagerUp: **none**. API is read-only (H, /developers: read-only). Orders happen inside the Telegram bot, which signs with its server-held key (M(sibling)).
- Equivalent direct path: Polymarket CLOB with EIP-712 signed orders from the user's own wallet; `builderCode` is just an attribution field (M(sibling)).

## 7. PayBox reachability

**no** for Pilot itself. No API accepts a signed order or transaction proposal; the only surface is a Telegram chat bound to a Telegram identity, using a key WagerUp's server holds. Sending PayBox funds to a Pilot deposit address would hand custody to a hosted-key bot for no extra liquidity. The same liquidity is reachable via Polymarket directly (see `docs/research/08-venues-polymarket-kalshi.md`).

## 8. Fees

- WagerUp/Pilot: **0%** on manual and copy trades, win or lose; "Third-party venue and blockchain network fees may still apply" (H, https://wagerup.com/pilot, WebFetch 2026-10-19). Methodology page repeats "0% WagerUp and 0% Pilot fee policy" (H).
- Older claim in a search summary: 1.9% on winning copy trades, 0.9% on other winning trades, 0 on losses (L: search-engine summary of the FAQ, not reproduced by the current page; may be historical). Treat 0% as current but changeable (ToS reserves right to modify without notice, M(sibling)).
- Polymarket taker/venue fee applies underneath (M(sibling): fit `fee = rate x shares x p x (1-p)`, rate 0.03-0.05 on sampled sports trades; see Polymarket spec). Gas sponsored by Pilot for standard trades (M(sibling)).

## 9. Resolution and dispute risk

Entirely Polymarket's (UMA optimistic oracle path, dispute tail risk; see `08-venues-polymarket-kalshi.md`). WagerUp disclaims being a counterparty or controlling resolution (M(sibling), ToS). Extra risk: a hosted-key bot and stale cache in its own API.

## 10. Geo, ToS, automation

- Geo: users must not be in or accessing from a prohibited jurisdiction; no list given, so Polymarket's restrictions apply (M(sibling)). The pilot page itself states no geo rules (H).
- Automation/scraping: ToS prohibits scraping or interfering with the Service; the official API is the permitted read route, key-gated (M(sibling)). The pilot page has no ToS link in the WebFetch summary (H, absent); ToS dated June 13, 2026 per sibling note (M).
- Not a sportsbook, broker-dealer, exchange, money transmitter or custodian per its own ToS (M(sibling)).

## 11. Liquidity

| Metric | Value | Source, date | Tag |
|---|---|---|---|
| TVL | none | DefiLlama, 2026-10-19 | H |
| Cash volume 24h / 7d / 30d | $682 / $11,353 / $61,331 | api.llama.fi/summary/dexs/wagerup-predictions, 2026-10-19 | H |
| DefiLlama all-time | $1,283,433 (understated: series begins mid-2026) | same | H/M |
| Builder volume (share notional) all-time | 107.48M, 138 active users, rank 14 | data-api.polymarket.com v1 leaderboard, 2026-10-19 | H |
| Recent builder volume (share notional) | 462 (10-19), 1,630 (10-18), 15,176 (10-16); 2-5 users/day | data-api v2, 2026-10-19 | H |
| Depth | none of its own; equals Polymarket's | | H |

## 12. Category overlap and shared liquidity

- Categories: sports focus (NBA, NFL, MLB, NHL, soccer leagues, UFC, F1, tennis, esports), plus some crypto price and politics (M(sibling)). Site also uses ESPN feeds and CoinGecko for context (H, /methodology).
- **liquidity_shared_with: Polymarket (100%).** Every overlap with Kalshi, Limitless, Predict.fun etc. is Polymarket's overlap. Not independent.

## 13. Adapter recommendation

skip. Optional signal use: derive sharp-wallet signals straight from Polymarket's public data API rather than from WagerUp. Monitoring-only: track `builder_name=WagerUpPilot` in Polymarket's builders API if you care whether it revives. Lead only: TerminalUp (terminalup.com), invite-only multi-venue sports execution product with no API seen (M(sibling)); worth its own spec only as prior art.

## 14. NOT FOUND / open questions

- NOT FOUND (searched: /developers, /api/v1 root, sibling OpenAPI/support review): API-key application process or pricing.
- NOT FOUND: websocket, order book, trades or resolution endpoint on WagerUp's API.
- NOT FOUND: any WagerUp-owned smart contract, GitHub org or audit (M(sibling)).
- Not re-verified today: ToS wording, FAQ fee history, funding-chain conflict, TerminalUp details (carried from the sibling note).
- Unverified third-party claim: a tweet says Pilot was "#3 app on Polymarket" at launch (L, WebSearch snippet only; x.com not fetched). Current leaderboard rank 14 all-time.

## 15. Fixtures (`docs/research/fixtures/wagerup-pilot/`)

- `root.json`: `GET /api/v1` (H)
- `products.json`: `GET /api/v1/products` (H)
- `markets_401_body.json`: unauthenticated `/api/v1/markets` 401 body (H)
- `polymarket_builders_volume_v2_wagerupilot_last14.json`: 14 WagerUpPilot daily rows (H)
- `defillama_dexs_summary_trimmed.json`: DefiLlama volume summary, trimmed to 14 days (H)

## 16. Sources

- https://wagerup.com/pilot (WebFetch 2026-10-19) - H
- https://wagerup.com/developers (WebFetch 2026-10-19) - H
- https://wagerup.com/methodology (WebFetch 2026-10-19) - H
- https://wagerup.com/faq (WebFetch 2026-10-19; little Pilot detail returned) - H (limited)
- https://wagerup.com/api/v1, /api/v1/products, /api/v1/markets (401) - H
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 and /v2/builders/volume?interval=day&limit=90 - H
- https://api.llama.fi/summary/dexs/wagerup-predictions - H
- WebSearch (extended) "WagerUp Pilot Polymarket sports trading bot copy trading": medium.com review (affiliate link, not fetched), x.com post (not fetched), polytradingbot.com/polymart.app directories (one describing "aggregated liquidity and smart order routing", contradicting the official pages) - L
- Sibling notes: `docs/research/venues/wagerup.md`, `docs/research/venues/wagerup-predictions.md`, `docs/research/08-venues-polymarket-kalshi.md` - M
- Suspicious content: none that targeted AI agents. Search results include GitHub "copy bot" repos asking for Polymarket credentials or offering executables; not opened, flagged as a credential-theft risk.
