# WagerUp Predictions (WagerUp Pilot) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public wagerup.com pages, unauthenticated GETs of documented public hosts (wagerup.com/api/v1, api.llama.fi, data-api.polymarket.com builders endpoint), `gh api` read of one DefiLlama adapter file. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party content treated as untrusted data. WebSearch budget was exhausted for the session, so no independent news search was possible (see Open questions). DefiLlama's website returned HTTP 403 to WebFetch; its public API was used instead.

Tags: **H** read first-hand in a primary source this session; **M** secondary/inferred or small-model page summary; **L** weak/stale.

## 0. Bottom line

- **Not a venue. It is a Polymarket front-end / Telegram bot (builder-code frontend) (H).** Its own methodology page says market prices, order books and history come from "Polymarket market and CLOB data" and that it describes no independent price source. DefiLlama classifies it as category "Interface", chain Polygon, tag "Polymarket Builder", description "powered by Polymarket" (H, api.llama.fi). So it shares 100% of its liquidity with Polymarket and is NOT an independent arbitrage leg.
- **Live, but nearly dormant (H).** wagerup.com, /pilot and /api/v1 return HTTP 200 on 2026-10-19. Polymarket's own builder-volume dataset shows WagerUpPilot at 2-6 active users per day and roughly $0.4k-15k daily notional in October 2026, down from tens of millions per month in April-May 2026.
- **No trading API (H).** The only API is a read-only beta; market/trader endpoints need an approved Bearer key (401 without). Trading happens inside the Telegram bot.
- **Adapter priority: skip.** If anything is wanted from this, it is Polymarket directly (already covered elsewhere), optionally the Polymarket `builderCode` for attribution.

## 1. Kind and market model

- Kind: broker-or-frontend (confirmed). Products: wagerup.com (research site, sports/crypto/current-event market browser, trader analytics), WagerUp Pilot (Telegram trading and copy-trading bot, t.me/WagerUpPilotBot), TerminalUp (separate pro sports terminal at terminalup.com) (H, https://wagerup.com/llms.txt).
- Market model: inherited from Polymarket: binary YES/NO outcome tokens (ERC-1155 conditional tokens) on a central limit order book (CLOB) with off-chain matching and on-chain settlement; negRisk categoricals exist on Polymarket (M, from Polymarket docs covered by the parallel workflow; not re-verified here). WagerUp's own parlay tools are calculators only, not executable products: "buying separate prediction-market positions does not reproduce the hypothetical payout" (H, llms.txt).
- Price convention in WagerUp's tooling: YES = best ask, NO = 1 - YES best bid, 0-1 units (H, llms.txt).

## 2. Chains and collateral

- Polygon, USDC collateral (as Polymarket). H for chain = Polygon (DefiLlama `chain: Polygon`); M for collateral (OpenAPI says "volume and liquidity are USDC"; H). Wagerup's own docs pages did not state chain/collateral in the text I could retrieve (pages are mostly navigation to the summarizer).
- Custody model of the Pilot bot: NOT FOUND (searched: /pilot, /docs, /faq, /risk, /polymarket-copy-trading, /fees, /about). One page says users keep "full control of your funds" (M, marketing text). Whether wallets are bot-generated, exportable, or Safe/proxy-based is unknown.

## 3. Read API

- Official, but gated and read-only. Docs: https://wagerup.com/developers (H). Spec: https://wagerup.com/api/v1/openapi.json (OpenAPI 3.1, H). Base URL: `https://wagerup.com/api/v1`.
- Endpoints (H, openapi.json): `GET /` and `/status` (version/links; /status is availability, "not an upstream data health check"), `GET /products`, `GET /search`, `GET /documents/{id}` (product marketing docs, no key), `GET /markets` (tracked sports market snapshot, scope `markets:read`, max 50 per page, offset up to 1000, optional `sport`; sorted by 24h volume; probabilities 0-1, volume/liquidity USDC; `asOf` is WagerUp cache time not exchange quote time; "Not an exhaustive exchange feed"), `GET /traders` (all-time sports trader leaderboard snapshot), `POST /mcp` (Streamable HTTP MCP; public tools search/fetch product docs; market and trader tools need key).
- Auth: Bearer `wu_<64 hex>`; keys are "approved", scoped, per-key expiry; "Data licensing and client approval are separate from API authentication." How to apply: NOT FOUND (searched /developers, openapi description, llms.txt). Confirmed live: `/markets`, `/traders` return 401 `api_key_required` with `WWW-Authenticate: Bearer realm="WagerUp Public API"` (H, fixture).
- Rate limits: 30 req/min anonymous, 120/key, 180/IP, 600 global, per serving instance; no SLA (H). RateLimit-* headers are returned and CORS is `*` (H).
- Websocket: NOT FOUND (none in OpenAPI).
- Value to an aggregator: none beyond Polymarket's own API. The data is a cached subset (sports only) of Polymarket Gamma/CLOB data. Use Polymarket directly.
- robots.txt allows `/api/v1/` and disallows `/api/` otherwise (H).

## 4. Trade path

- No programmatic trade path from WagerUp: no order endpoints, MCP exposes read only (H). The trading surface is the Telegram bot (manual trades, copy trades, "Auto Pilot" strategies by name only; details NOT FOUND).
- PayBox / EVM wallet reachability: An EVM wallet on Polygon could trade the same markets by placing signed Polymarket CLOB orders directly (EIP-712 orders / API credentials on Polymarket), which is the Polymarket adapter's job. Routing through WagerUp adds nothing except a builder-code attribution and it has no external order API. PayBox reachability for WagerUp specifically: **no**; for the underlying liquidity: see the Polymarket spec (not re-verified here).

## 5. Fees

- WagerUp and Pilot bot fees "0% ($0) on manual and copy trades, win or lose"; third-party venue and blockchain network fees "may still apply" (H, https://wagerup.com/fees and /pilot meta). "Current" wording implies it can change.
- Revenue is presumably Polymarket builder-fee sharing (the tag in DefiLlama is "Polymarket Builder"), but WagerUp's builder fee, if any, is NOT FOUND. DefiLlama has no fees series for it ("Fees for wagerup-predictions not found") (H).
- Underlying Polymarket taker/maker fee schedule: see Polymarket spec.

## 6. Resolution

- Inherited from the underlying venue (Polymarket, UMA optimistic oracle). The risk page says outcomes stay pending/market-implied "until the underlying venue or a confirmed result source reports settlement" and warns about void, disputed, delayed outcomes (H, /risk, via summarizer; M for UMA detail, outside scope here). WagerUp adds no independent resolution.

## 7. Geo / ToS / automation

- Terms & Conditions page: NOT FOUND (/terms, /tos 404; sitemap has /privacy, /risk, /methodology, /faq). Restricted jurisdictions: NOT FOUND (searched /faq, /risk, /pilot, /about). Presumably Polymarket's geo restrictions apply via the underlying venue (M, inference).
- API: "Data licensing and client approval are separate from API authentication" (H), so commercial/aggregator use of WagerUp data needs approval. Moot given the data is Polymarket's.

## 8. Liquidity (all of it is Polymarket's)

- DefiLlama (api.llama.fi/summary/dexs/wagerup-predictions, fetched 2026-10-19, last data point 2026-10-18): 24h $682, 7d $11,353, 30d $61,331, all-time $1.283M; chart starts 2026-07-05 (H). Flagged `doublecounted: true`; methodology: DefiLlama polymarket builder adapter (H).
- Polymarket data-api `GET /v1/builders/volume` (fetched 2026-10-19, builder `WagerUpPilot`, verified true, start 2026-04-07 per adapter): sum of daily rows = about $107.5M since 2026-04-07; by month: Apr $67.5M, May $27.1M, Jun $9.3M, Jul $2.8M, Aug $0.48M, Sep $0.19M; last 30 daily rows about $122k, last 7 about $28k; active users 2-6 per day in October (H). The peak day was 2026-04-28 at $7.7M. The two sources disagree on history (DefiLlama all-time $1.28M vs $107M builder volume; DefiLlama chart begins July). Likely DefiLlama's adapter counts differently or started later; treat the Polymarket figures as authoritative for attribution and DefiLlama as consistent only for the last weeks (M). April-May volume with only about 50-75 daily users looks like a few large accounts (possibly bots or wash-style activity), so do not read it as organic demand (L, inference).
- TVL: none (interface). OI: not reported.

## 9. Event category overlap

All of Polymarket: sports (WagerUp's focus: NBA, MLB, NFL, NCAA, EPL, MLS, UFC, World Cup), crypto price, current events (H, sitemap/llms.txt). Arbitrage overlap with other venues is the same as Polymarket's; WagerUp contributes no unique quotes.

## 10. Shared liquidity

Shares 100% with Polymarket (CLOB passthrough with builder code). Not independent. Any "cross-venue" spread between WagerUp and Polymarket is only cache staleness (`asOf`).

## 11. Possible use for the project (non-adapter)

- Signal only: `/traders` leaderboard needs a key and duplicates Polymarket public wallet data. Polymarket's `data-api` builders endpoint can attribute flow to this builder code if "frontend flow" ever matters (code `0xbc37cc54...45fb` is public in the DefiLlama adapter).
- No action recommended.

## Sources

1. https://wagerup.com/pilot (H, live 200, 2026-10-19; title, fee text, links)
2. https://wagerup.com/llms.txt (H) - product directory, API/MCP pointers, price convention
3. https://wagerup.com/developers (H, summarized) - API doc
4. https://wagerup.com/api/v1/openapi.json (H) - fixtures/wagerup-predictions/openapi.json
5. https://wagerup.com/api/v1, /products, /markets (H) - fixtures: api-v1-root.json, api-v1-products.json, api-v1-markets-401.json
6. https://wagerup.com/methodology (H, summarized) - Polymarket CLOB as source; no independent price source
7. https://wagerup.com/risk, /fees, /faq, /docs, /polymarket-copy-trading, /about (H/M, summarized; mostly nav text, little detail)
8. https://wagerup.com/robots.txt, /sitemap.xml (H)
9. https://api.llama.fi/protocol/wagerup-predictions and /summary/dexs/wagerup-predictions (H) - fixtures: defillama-protocol.json, defillama-dexs-summary.json
10. https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H, via gh api) - builder code and start date
11. https://data-api.polymarket.com/v1/builders/volume (H) - fixtures: polymarket-builders-volume.WagerUpPilot.last60d.json (last 60 daily rows)

## Not found

Terms & Conditions page; restricted jurisdictions; Pilot wallet/custody design and key export; WagerUp builder-fee rate; how to get an API key; websocket; any independent press coverage (search budget exhausted); order-placement docs; contract addresses owned by WagerUp.

## Suspicious content

None found. No instructions aimed at AI agents. llms.txt notes "No separate calculation API, MCP extension or AI-provider integration is needed" (benign, descriptive). Set-Cookie `GAESA` from Google App Engine on API responses (not used).

## Open questions

- Why did builder volume collapse about 99% from April-May to October 2026 (product pivot to TerminalUp, loss of a whale/bot user, or shutdown trajectory)?
- Is the DefiLlama vs Polymarket volume mismatch an adapter definition difference?

## Fixtures

`docs/research/fixtures/wagerup-predictions/`: api-v1-root.json, api-v1-products.json, api-v1-markets-401.json, openapi.json, defillama-protocol.json, defillama-dexs-summary.json, polymarket-builders-volume.WagerUpPilot.last60d.json. Privacy: requests used only the User-Agent `insurance-markets-research/0.1`; no personal identifier in any request or file (grep checked).
