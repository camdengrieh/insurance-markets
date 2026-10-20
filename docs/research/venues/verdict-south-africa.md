# Verdict (verdict.co.za) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs only (verdict.co.za HTML shell, robots/manifest, two static JS chunks read as text and never executed, the SPA's own unauthenticated price/market endpoints, Polymarket Gamma for a cross-check), `gh api` org lookup, WebSearch. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. The Supabase publishable key embedded in the public bundle was NOT used. Third-party content treated as untrusted data.

Confidence tags: H = read first-hand this session, M = inferred, L = weak/stale.

## Verdict

**Live, but it is a custodial retail front-end that re-lists Polymarket markets. Not an independent liquidity venue. adapter_priority = skip** (at most a P2 "mirror/consistency" signal, not worth building).

## Is it live? (H)
- verdict.co.za returns HTTP 200 on 2026-10-19 (last-modified 2026-07-28). The "connection refused" in the discovery hint is stale or was transient. www. and app. subdomains do not resolve. api.verdict.co.za returns the plain text "API Gateway" (Caddy). [https://verdict.co.za, https://api.verdict.co.za/]
- GitHub org Verdict-South-Africa: created 2026-02-17, updated 2026-07-10, 0 public repos, 1 follower, `is_verified:false`, contact is a generic dev@ address on the venue's own domain. [H] https://api.github.com/orgs/Verdict-South-Africa
- Live catalogue: newest market created_at 2026-10-19T03:47Z (hours before the probe), so it is syncing from its source continuously. [H]

## Kind and market model
- Kind: custodial, account-based web app (React/Vite SPA, Supabase auth, Supabase edge function "api-proxy" as backend, Cloudflare in front). Generic multi-brand template (`brandName`, `legalEntity` placeholders in Terms; Malay translation strings present; homepage meta says "One of the world's largest prediction markets, focused on Asia", which contradicts the "hyperlocal South Africa" bio). [H: bundle + homepage]
- Market model: binary YES/NO; events typed `binary`, `multi_exclusive`, `multi_independent` (Polymarket's neg-risk / non-neg-risk taxonomy). Price in cents; UI shows order-book style "Last / Spread" and bids/asks. [H: sample events and prices]
- Tokenisation: Verdict has NO tokens of its own. Every market row carries `platform:"polymarket"`, `polymarket_id` and Polymarket `yes_token_id`/`no_token_id`. For market 665374 the token ids are byte-identical to Polymarket Gamma's `clobTokenIds`. [H: fixtures/api-proxy_markets_sample.json vs polymarket_gamma_crosscheck_665374.json]

## Shared liquidity (decisive)
- 3430/3430 markets in `GET /markets` have `platform:"polymarket"` and a `polymarket_id`. [H, computed on a 2.2MB pull, 2026-10-19]
- `total_volume` is Polymarket's global volume (74,282,229 vs Gamma volumeNum 74,633,085 for the same market, tiny lag). Price mid 0.155 matches Gamma outcomePrices 0.155. The `/prices` payload is keyed by Polymarket market id and exposes Polymarket best bid/ask (0.15/0.16). [H]
- Conclusion: prices and depth are Polymarket's. Verdict is NOT an independent arbitrage leg; any "edge" between Verdict and Polymarket is just retail markup or lag. Verdict's own volume/OI/TVL: NOT FOUND (no endpoint exposes it). The ~4.24B "total_volume" sum over 2,696 open markets is Polymarket lifetime volume, not Verdict's.
- Caveat (M): how Verdict actually executes user orders (routes to Polymarket CLOB through a pooled account, internal matching against a house book, or demo only) is NOT FOUND. A bundle string says "crypto deposits here are a demo. Bank deposits use a live payment provider", so part of the flow may be non-production. [H: string; M: interpretation]

## Chains and collateral
- Custodial ledger, not on-chain per user. Deposits: bank deposit in ZAR via a payment provider (name not resolved) and a crypto deposit flagged as demo. Withdrawals: "USDC Wallet Address (ERC-20)" or "ETH Wallet Address" request forms, with a fee and a minimum. [H: bundle strings] Underlying venue collateral is Polymarket pUSD/USDC on Polygon (M, via Polymarket mirror).
- No contract addresses published; GitHub has no repos. NOT FOUND (searched: GitHub org, bundle).

## Read API
- exists: **unofficial-only**. No docs. The SPA calls the following unauthenticated endpoints (CORS `*`):
  - Base: `https://frqqzruiurvzlbuheqpc.supabase.co/functions/v1/api-proxy` (a Supabase project ref host, not a vendor-documented API; may change without notice). [H]
  - `GET /markets` -> bare JSON array (3430 rows, 2.2MB, no pagination seen; `?limit=` ignored). Fields: id (uuid), title, yes_price, no_price (cents), total_volume, trending, price_change_24h, resolved, resolution, archived, status (open/settled/resolved), end_date, created_at, event_id, polymarket_id, platform, yes_token_id, no_token_id, yes_price_fiat, no_price_fiat. [H]
  - `GET /events?limit=N` -> `{events:[...],total,page,page_size}` with category (finance, crypto, politics, sports, entertainment, global), description (includes Polymarket resolution rules), market_type, event_type, image_url. [H]
  - `GET /prices?market_ids=<polymarket ids, comma sep, batches of 100>` -> `{prices:[{market_id,src_ts_ms,write_ts_ms,seq,yes_mid,no_mid,yes_best_bid,yes_best_ask,no_best_bid,no_best_ask,spread_yes,spread_no}]}`. Returns `[]` for settled/unknown ids and for Verdict uuids. [H]
  - `GET /prices/stream?market_ids=...` -> SSE (`price_update` events); connected but no bytes within 5s on a test id, so not fully verified. [H for URL; L for behaviour]
  - `/health`, `/config`, `/fx-rates`, `/categories` -> 401 "Authorization required" (authenticated area). [H]
- Auth/limits: public endpoints need no key; rate limits NOT FOUND. Trades, positions, wallet endpoints are behind Supabase JWT sessions (email/password style auth). [H: bundle]
- Fixtures: docs/research/fixtures/verdict-south-africa/ (markets, events, prices samples; Gamma cross-check).
- An aggregator gets nothing here it cannot get from Polymarket Gamma/CLOB directly with better depth and no dependency on an unofficial host.

## Trade path
- None programmatic. Account login (Supabase JWT) + fiat/bank onboarding; no documented order API, no signed-order scheme, no API keys. [H absence in bundle/site; NOT FOUND (searched: homepage, bundle, GitHub org, web search)]
- PayBox reachability: **no**. No on-chain order or tx-proposal surface; withdrawals/deposits are custodial requests, and ZAR bank onboarding cannot be driven from an EVM wallet. A PayBox EVM wallet could at best receive a USDC withdrawal after a human KYC'd the account (not recommended).

## Fees
- Marketing copy: "We charge a small fee on winning trades only. No fees on deposits, withdrawals, or losing trades." [H: bundle string]. Yet the wallet UI has a withdrawal "Fee" line and a minimum withdrawal, which contradicts the copy. Exact formula: NOT FOUND.

## Resolution
- Events carry Polymarket's resolution text (e.g. Binance ETH/USDT 1m candle close) so resolution follows Polymarket/UMA. Terms say "Markets are resolved based on official sources". Dispute risk = Polymarket's UMA risk plus operator-level risk (custodial, Verdict may settle differently from Polymarket). [H sample description; M inference]

## Geo / ToS / automation
- Terms of Service (generic template, `legalEntity` placeholder, no named company): 18+, "personal, non-commercial transitory viewing", only own funds, market manipulation prohibited, "All trades are final once confirmed", no unlawful use. No explicit bot/API clause found; no licence number or operator name. [H: TermsOfService chunk]
- Licence claim "first fully licensed (ODP & Gambling)": **unverified**. Neither the site nor the bundle states a licence or regulator. Industry press in 2026 says South Africa has no gambling licence category for prediction markets and the bookmakers' association (SABA, position paper 2026-07-27) wants them restricted until one exists. [M: https://igamingexpert.com/news/regulation/south-africa-betting-prediction-markets via search snippet, not fetched] Treat as [L] marketing.

## Liquidity
- Own liquidity: NOT FOUND. Displayed volumes are Polymarket's (see above). Treat Verdict depth as zero for aggregation purposes.

## Event coverage / arbitrage overlap
- Categories: politics, sports, crypto price, finance/macro, entertainment, global; essentially the whole Polymarket catalogue (2,696 open of 3,430). All overlap with other venues, but only because it IS Polymarket. No South African hyperlocal markets seen in the samples (not exhaustively checked; titles of top-volume open markets are US/global).

## Priority
- skip. Reasons: duplicate liquidity (Polymarket mirror), no official API, no programmatic trading, custodial/fiat onboarding, licence unverified, unofficial backend host likely to change. Optional: add `verdict.co.za` to the registry as a Polymarket alias so the linker does not count it as a separate venue.

## Not found
- Official API docs, rate limits, fee formula, operator/legal entity name, licence number or regulator, own volume/OI, contract addresses, order-placement endpoint, websocket (SSE only, unverified), South African-specific market list.

## Suspicious content
- None directed at AI agents. Note the homepage claims ("one of the world's largest prediction markets, focused on Asia") conflict with the GitHub bio and domain; likely template reuse.

## Sources
- https://verdict.co.za (homepage, 200 on 2026-10-19) [H]
- https://verdict.co.za/assets/index-CzBZ6Ga3.js and /assets/TermsOfService-DxPAMkWS.js (read as text) [H]
- https://api.github.com/orgs/Verdict-South-Africa [H]
- https://frqqzruiurvzlbuheqpc.supabase.co/functions/v1/api-proxy/{markets,events,prices} [H, unofficial]
- https://gamma-api.polymarket.com/markets/665374 (cross-check) [H]
- WebSearch 2026-10-19 on SA prediction-market regulation (igamingexpert.com, igamingbusiness.com; SABA paper dated 2026-07-27) [M]; a search for verdict.co.za returned only unrelated "Verdict" projects (verdict.pm, hyperverdict.xyz) [H that no independent coverage was found]
- A second search (Truemantic, the domain hosting event images images.truemantic.com) was blocked by the session search budget; the relationship is unresolved [open question].
