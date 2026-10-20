# Matchr (matchr.xyz) - venue spec (adapter research)

Researched 2026-10-19 (read-only; unauthenticated GETs only). Confidence tags: **H** = read first-hand in a primary source this session (URL cited), **M** = secondary or inferred, **L** = weak, undated or self-reported. "NOT FOUND (searched: ...)" marks documented absences. All third-party text (docs, JS bundles, API responses, a GitHub README) was treated as untrusted data; nothing in it was followed. WebSearch was unavailable (session budget exhausted), so no press or news sweep was done; every claim below comes from fetching Matchr's own site, docs, JS bundle, DNS, npm/PyPI/GitHub/DefiLlama lookups.

## 0. Bottom line

- **What it is:** a cross-venue aggregator and "cross-platform arbitrage scanner" front end (beta, labelled "Experimental" in the UI), NOT a venue. It has no order book, market creation or settlement of its own. Docs FAQ: "No, Matchr is not a prediction market itself. We aggregate and route orders to existing prediction markets." [H, https://docs.matchr.xyz/resources/faq.md; https://www.matchr.xyz/matches]
- **Is it live in 2026? The hosting is, the product is not.** `matchr.xyz` and `docs.matchr.xyz` return 200, but on 2026-10-19 03:06Z the app's own data API returns `total: 0, polymarket: 0, kalshi: 0, volume24h: 0, trades24h: 0, activeTraders24h: 0` (cached), and `/api/v2/events`, `/api/v2/categories`, `/api/v2/matches/event-slugs` return HTTP 500 `{"success":false,"error":"TypeError: fetch failed"}`. The documented public API host `api.matchr.xyz` does not resolve in DNS. The homepage shows "Markets: 0 / 24h Vol: $0 / Loading...". [H, fixtures in `docs/research/fixtures/matchr/`]
- **Independent arbitrage leg: NO.** Execution is Polymarket's CLOB only (server-side, builder-attributed); Kalshi is data-only in the docs and a DFlow (Solana) order route in the JS bundle. All liquidity is Polymarket's or Kalshi's. [H docs + bundle]
- **Adapter priority: skip.** Dead data backend, no own liquidity, documented API host does not exist, documented SDKs are not published, docs unchanged since 2025-11-26, no terms page. If we want Matchr-like output (matched Polymarket/Kalshi pairs) we build our own matching or use a maintained source (pmxt, Predictefy, Prediction Hunt; see docs 10 and 16).
- **PayBox:** not reachable and not needed (section 5).

## 1. Kind and market model

- Kind: `aggregator-or-data` confirmed, with a trading front end bolted on (Polymarket only). [H, https://docs.matchr.xyz/index.md, /resources/faq.md]
- Market model: inherits the source venue's. Docs example schema (Market object) carries `token_id` ("Polymarket only") and `ticker` ("Kalshi only"), `price` 0.00-1.00, `best_bid`, `best_ask`, `volume`, `liquidity`; one Market row per outcome token ("mkt_yes123" / "mkt_no123"), so binary markets are two rows, categorical events are sets of rows. [H docs, https://docs.matchr.xyz/api-reference/endpoint/get-markets.md; the example values are dated 2024 and were not observed from a live server, so treat shapes as unverified]
- Order book vs AMM: order book only, because it proxies Polymarket CLOB and Kalshi. Scalar markets: NOT FOUND (searched: all docs pages in llms.txt, bundle API routes).
- **Matching (the product's only own IP):** OpenAI `text-embedding-3-small` 1536-d embeddings of title + description, pgvector HNSW, cosine similarity > 0.70, then filters: end dates within 7 days, outcome mapping, entity match. Tiers: >=85% auto-confirmed ("goes live immediately"), 70-84% "flagged for human verification", <70% ignored. [H docs, https://docs.matchr.xyz/core-concepts/matched-markets.md] Claims "900+ matched pairs", "95% accuracy (high conf)", "<5% false positive rate", per-category counts (Politics 312, Sports 245, Crypto 178, Economics 134, Entertainment 87) are undated marketing numbers with no method or dataset [L]. The FAQ gives different confidence bands (90+/75-90/60-75) than the matching page (85/70) [H, internal inconsistency]. Resolution-criteria comparison is not part of the pipeline (only end-date proximity), which is the main arbitrage-safety risk: a 7-day tolerance and no rules text comparison will produce non-equivalent "matches" [H docs, M inference on risk].
- Docs describe `matched_with` (event id on the other platform) on events and `/matches`, `/matches/spreads` endpoints; none could be exercised (backend down).

## 2. Chains and collateral

- Polymarket path: Polygon (chain 137), USDC per Matchr docs. Each user wallet gets a **Safe** smart wallet deployed through Polymarket's relayer (`relayer-v2.polymarket.com`), USDC approvals, and Polymarket CLOB API credentials derived from a wallet signature and stored server-side ("encrypted at rest"). [H docs https://docs.matchr.xyz/features/gasless-trading.md, /features/multi-wallet.md; H bundle: `RelayClient("https://relayer-v2.polymarket.com/",137,...)`, `BuilderConfig({remoteBuilderConfig:{url: "<matchr-signing-server>/sign"}})`]
- Staleness flag: Polymarket's 2026 docs describe Protocol V2 with **pUSD** collateral and `bytes32` builder codes (https://docs.polymarket.com/concepts/pusd.md, /programs/builders/fees.md [H]). Matchr's docs and bundle still say USDC and a remote-signing builder config. Whether Matchr's order path works against V2 is UNKNOWN; its signing server (`matchr-signing-server.vercel.app`) returned `500 FUNCTION_INVOCATION_FAILED` on a root GET on 2026-10-19 [H, GET /], which proves nothing about `/sign` but is consistent with a dormant deployment.
- Funding: bridge USDC from Ethereum, Arbitrum, Base or Solana via "Socket", card on-ramp via Privy, or send Polygon USDC to the Safe. [H docs quickstart; bundle also references bridge.polymarket.com]
- Kalshi path: docs roadmap says "Kalshi Trading - In Progress (2026 Q1)", "Kalshi account linking". The JS bundle instead has a `POST /api/trading/dflow-order` route called with `{marketTicker, side, action, amount, userPublicKey, slippageBps}` and a "KalshiPriceSimulation" helper that skips when there is "No Solana wallet" - i.e. Kalshi exposure was being built via DFlow's tokenized Kalshi markets on Solana, not via a Kalshi account. [H bundle, `chunks/9384-*.js`, fetched from https://www.matchr.xyz/_next/static/chunks/; whether live: unknown, rewards page shows Kalshi "Not connected / Coming soon"]
- FAQ: "Matchr primarily operates on Polygon ... expanding to support Solana for future vault infrastructure." [H]

## 3. Read API

- **Documented ("official-authenticated" on paper): `https://api.matchr.xyz/v1`**, Bearer API key from Settings -> API Keys (Read-Only / Trading / Admin key types), Mintlify docs at https://docs.matchr.xyz/api-reference/introduction (beta, "Breaking changes may occur"). [H docs]
  - Endpoints listed: `GET /events`, `/events/{id}`, `/markets`, `/markets/{id}`, `/markets/{id}/orderbook`, `/prices` (`market_ids` max 50), `/prices/history` (1m..1w), `/matches`, `/matches/spreads`, `/positions`, `POST /orders`, `/orders/batch`, cancel, `POST /webhooks`, `POST /api-keys`. Webhook events include `market.matched`, `price.alert`, `order.filled`. WebSocket and "priority WebSocket connections" are mentioned (agent page, FAQ) with no URL or message schema. [H docs]
  - Rate limits: three contradictory tables. API intro: Free 60/min & 10,000/day, Pro 300/min, Enterprise unlimited. Security page: Public 100/min, Authenticated 1,000/min, Agent 10,000/min, Trading 100/min/market. FAQ: 1,000/min authenticated, 100/min public. [H, internal inconsistency]
  - **`api.matchr.xyz` does not resolve** (curl error 6 on `/`, `/health`, `/v1/events`, `/v1/markets`, `/v1/matches`, `/v1/prices`, 2026-10-19; `docs/research/fixtures/matchr/api_matchr_xyz_dns_2026-10-19.txt`). The documented API is therefore unreachable. [H]
  - **The OpenAPI file is Mintlify's placeholder**: `https://docs.matchr.xyz/api-reference/openapi.json` is "OpenAPI Plant Store" (paths `/plants`), not Matchr. `/openapi.json` is 404. [H]
  - **SDKs do not exist**: `@matchr/sdk`, `@matchr/agent-sdk` (npm) and `matchr-sdk`, `matchr-agent` (PyPI) all return 404 on 2026-10-19. The GitHub user `matchrxyz` has 0 public repos (created 2025-12-06). A third-party repo `hubseer/Matchr-A-universal-prediction-market-aggregator-on-Polymarket-and-Kalshi` is a 3-line promo README linking hubseer.com, 0 stars, unrelated to the team. [H]
  - Docs sitemap `lastmod` is 2025-11-26 for every page, and the changelog ends Nov 2025: docs are ~11 months stale. Many examples are dated 2024 and look template-generated. [H]
- **Undocumented frontend API on the app origin** (observed in the JS bundle; unauthenticated for reads): `GET https://www.matchr.xyz/api/v2/events?...`, `/api/v2/events/{id}`, `/api/v2/events/count`, `/api/v2/categories`, `/api/v2/matches/event-slugs`; authed user routes `/api/user/{orders,positions,trades,watchlist,primary-wallet,safe-wallet-status,polymarket-credentials}`; `POST /api/trading/dflow-order`. Live results 2026-10-19:
  - `/api/v2/events/count` -> 200, all zeros, `"source":"cache","cached":true` (saved: `fixtures/matchr/api_v2_events_count_2026-10-19.json`).
  - `/api/v2/events?limit=2&sort=volume&order=desc` -> 500 `{"success":false,"error":"TypeError: fetch failed","source":"error"}` (saved: `fixtures/matchr/api_v2_events_error_500_2026-10-19.json`). A Node `fetch failed` inside the route handler means its upstream is unreachable; inference (M): the backend host that the routes proxy to is gone, consistent with `api.matchr.xyz` being NXDOMAIN.
  - No real market payload could be sampled, so there is no market fixture. Response envelope in practice: `{success, data|error, source, cached, duration, timestamp}`.
- Homepage cache `age` header was 878,273 s (~10.2 days) with `x-vercel-cache: HIT`, i.e. no production redeploy since about 2026-10-08/09 (M, inference from headers). Domain `matchr.xyz`: created 2023-11-28 (Porkbun), registry expiry **2026-11-28** (H, whois), so renewal falls ~40 days out.
- Public pages: `/` (markets), `/matches` (arbitrage scanner, "Top Opportunities: Loading...", "Experimental" warning that AI matching may be inaccurate), `/rewards` ("$MATCHR Coming Soon", points programme), `/portfolio`. `/terms`, `/privacy`, `/robots.txt`, `/sitemap.xml` return 404. [H]

## 4. Trade path

- Documented: `POST https://api.matchr.xyz/v1/orders` with API-key Bearer auth, body `{market_id, side, type: market|limit, amount (USD), price 0.01..0.99, time_in_force GTC|IOC|FOK, wallet_id, platform (override)}`; cancel and positions endpoints; "Orders are routed to the optimal platform automatically" (but the routing page says: "Currently: We route information and recommendations. Direct execution is on Polymarket."). [H docs submit-order.md, cross-platform-routing.md] Not callable: host does not resolve and no API key can be created without creating an account (forbidden here).
- Actual app path: user signs in with Privy (social or embedded wallet) or an external wallet; Matchr's server places orders on Polymarket CLOB using the Safe's stored CLOB credentials and signs with its builder credentials; "Zero signatures" per trade. So there is no user-signed-order or transaction-proposal interface to integrate with; control sits in Matchr's server session. [H docs gasless-trading.md]
- Custody claim: "non-custodial ... cannot withdraw / transfer / change ownership", but Matchr's server holds live trading credentials for the Safe (so a server compromise can trade, not withdraw). [H docs security.md; M assessment]
- Cross-venue (atomic or split) execution is "Coming Soon / Planned 2026 Q4". [H docs roadmap, cross-platform-routing]

## 5. PayBox reachability

- **paybox_reachable: no.** There is no Matchr-specific chain interaction an EVM wallet could sign: orders are placed server-side by Matchr after an account/API key exists. A PayBox-controlled EVM wallet (Polygon) can reach the *underlying* venue directly (Polymarket CLOB signed orders / Safe transactions, covered by the Polymarket workflow), so Matchr adds nothing for execution and a custodial-credentials hop with a dead backend. Funding the Matchr Safe (Polygon USDC transfer) would be possible in principle, but I did not and should not recommend it. [M assessment; H facts above]

## 6. Fees

- Gas: Matchr pays (gasless via Safe + relayer). [H docs]
- Trading fee: "You pay the same fees as trading directly - we just absorb the gas" and "Your trading costs are identical to trading directly on Polymarket" (gasless page) versus "We only charge a small fee when you execute trades" and "Platform Fee: Small percentage on trades (varies by market)" (FAQ). These conflict; no number is given anywhere. Revenue is stated as Polymarket **builder fees** plus planned premium features. [H docs; NOT FOUND for a numeric Matchr fee]
- Polymarket-side formulas (2026 docs): platform fee `C x feeRate x p x (1 - p)` taker-only; builder fee `notional x bps / 10000`, taker max 100 bps, maker max 50 bps, additive to platform fee. So a Matchr-routed taker order pays Polymarket's fee plus Matchr's builder fee (rate unknown, <= 1% by Polymarket rule). [H, https://docs.polymarket.com/programs/builders/fees.md]
- Docs' fee comparison table (Polymarket "0% maker / 2% taker", Kalshi "$0.01 per contract", PredictIt "10% on profits") is generic and does not match the 2026 Polymarket formula. [L; H that the table says this]
- Rewards: points at 1 per $10 traded, convertible to a future $MATCHR token; referral 10% of referees' points for 90 days. Token "Coming Soon". [H https://www.matchr.xyz/rewards, docs referral-program.md]
- Vaults: planned Q1 2026 ("2% management, 20% performance above high-water mark"); no evidence they launched. [H docs; status unknown]

## 7. Resolution mechanism and dispute risk

- Matchr does not resolve anything. Redemption happens on the underlying venue (Polymarket via UMA/CTF, covered elsewhere). Docs concede "Different platforms may resolve markets at different times based on their resolution sources." [H docs cross-platform-routing.md]
- **Arbitrage-specific risk is in the matching, not the resolution:** end-date tolerance 7 days and no resolution-rule comparison (section 1), "Experimental" label on the scanner page, and a claimed 70-84% band that is only human-reviewed. A scanner that trusts Matchr's `matched_with` links would import non-equivalent pairs. [H docs, M assessment]

## 8. Geo, ToS, automation

- Terms of Service / Privacy: NOT FOUND (searched: /terms, /privacy, docs nav and llms.txt, bundle links; both 404). Docs say "We operate as a technology provider, not a financial institution". [H]
- Geo: inherits venue rules. FAQ: Polymarket "not available to US residents"; Kalshi "US only"; "Matchr shows you which markets are available based on your location." Cross-platform page: "US users may not be able to access Polymarket directly. We're working on compliant solutions." No KYC for basic Matchr features. [H docs faq.md]
- Automation: API and agents are encouraged in docs ("Agent Infrastructure", agent keys 10,000 req/min), but there is no ToS to check against and the API is unreachable. [H]
- Agent-facing text in the docs: only a standard Mintlify banner pointing to `llms.txt`; no instructions aimed at AI agents were found.

## 9. Liquidity

- Current (live, first-hand): total markets 0, 24h volume $0, 24h trades 0, active traders 0, from the app's own `/api/v2/events/count` at 2026-10-19T03:06:17Z (cached value). [H]
- Claimed (undated, docs): "10,000+ markets tracked", "900+ matched pairs", "avg spread 3-7%", "<1s execution", roadmap "Current Status: 2 platforms integrated". The changelog's last entries are Nov 2025 (multi-wallet, filters), the initial launch with Polymarket was Sep 2025. [L, vendor self-report, ~11 months old]
- On-chain TVL: Matchr does not appear by name, URL or slug in DefiLlama's `/protocols` list (8,758 entries, 2026-10-19). NOT FOUND (searched: api.llama.fi/protocols). No volume figures from any third-party source were found (no search budget). Because Matchr is not a venue, there is no OI/TVL of its own.
- Polymarket builder-attributed volume for Matchr: NOT FOUND (searched: docs.polymarket.com llms.txt builder pages; no builder leaderboard endpoint was documented there).

## 10. Event overlap and shared liquidity

- Coverage: Polymarket + Kalshi only (docs FAQ: "Currently, we support: Polymarket ... Kalshi"; `/api/v2/events/count` has only `polymarket` and `kalshi` fields). Docs examples also name PredictIt, and the roadmap lists PredictIt "(if possible)", Metaculus (display only), "international platforms", "sports betting venues" for 2026 Q3, none confirmed built. The task hint says Kairos describes Matchr as 5 venues with execution via Polymarket only; I could not re-find any Matchr mention on kairos.trade or kairos.trade/compare (M, unverified; docs read first-hand show 2). [H docs; M hint]
- Overlap categories claimed: politics, sports, crypto price, economics/macro, entertainment (the same overlap that exists between Polymarket and Kalshi). [L]
- **Shares liquidity with: Polymarket (execution and data) and Kalshi/DFlow (data, and a Solana route in the bundle).** It is a distribution channel, so it is never an independent arbitrage leg. [H]

## 11. What is usable for this project

- Nothing to integrate: no working API, no SDK, no data.
- Ideas worth borrowing (design only): the three-stage matching recipe (embedding recall -> temporal/outcome/entity filters -> confidence tiers with human review), the `MatchSignals` shape (`similarity_score, temporal_overlap, category_match, entity_match, volume_ratio, price_spread`), and the routing quote shape (best venue per side, fees and slippage included). Add what Matchr lacks: resolution-rule and source comparison, and an `identity|complement|subset|superset|overlap|disjoint` relation (as pmxt Router does).
- Revisit triggers: `api.matchr.xyz` resolving AND `/v1/events` returning real rows; `@matchr/sdk` published; a terms page; a 2026 changelog entry. Check the domain renewal date (2026-11-28) as a liveness signal.

## 12. Open questions

- Is the backend permanently gone or only mid-migration (the app still has a 2026-10-08/09-ish deploy)? Is `/api/v2/events` served from `api.matchr.xyz` or another host?
- Does Matchr's Polymarket order path still work after Polymarket's V2/pUSD migration (builder code bytes32 vs remote-signing config)?
- Did Kalshi-via-DFlow ever go live? What Matchr builder fee rate is set?
- X account `@matchrxyz` activity: `https://x.com/matchrxyz` returned HTTP 402 Payment Required to WebFetch (no payment details recorded; stopped).

## Fixtures

- `docs/research/fixtures/matchr/api_v2_events_count_2026-10-19.json` (221 B, 200, all zeros, cached)
- `docs/research/fixtures/matchr/api_v2_events_error_500_2026-10-19.json` (68 B, 500 `fetch failed`)
- `docs/research/fixtures/matchr/api_matchr_xyz_dns_2026-10-19.txt` (NXDOMAIN record of the documented API host)
- `docs/research/fixtures/matchr/docs_llms_2026-10-19.txt` (docs index, 3.7 KB) and `docs_sitemap_2026-10-19.xml` (lastmod 2025-11-26)

## Sources

All fetched 2026-10-19 with User-Agent `insurance-markets-research/0.1` unless marked WebFetch; GET only.

- https://www.matchr.xyz/ (homepage: "Cross-Platform Prediction Markets", Markets 0, 24h Vol $0) [H, WebFetch + curl]
- https://www.matchr.xyz/matches, /rewards, /portfolio (scanner beta, points programme; WebFetch); /terms, /privacy, /robots.txt, /sitemap.xml (404) [H]
- https://www.matchr.xyz/api/v2/events/count, /api/v2/events, /api/v2/categories, /api/v2/matches/event-slugs (live probes) [H]
- https://www.matchr.xyz/_next/static/chunks/*.js (public JS bundle read as text, never executed): API routes, relayer-v2 and builder signing config, `dflow-order` route [H]
- https://matchr-signing-server.vercel.app/ (GET / -> 500 FUNCTION_INVOCATION_FAILED) [H]
- https://docs.matchr.xyz/llms.txt, /llms-full.txt, /sitemap.xml and per-page `.md`: index, quickstart, why-matchr, core-concepts/{aggregation,matched-markets}, features/{gasless-trading,multi-wallet,cross-platform-routing,referral-program}, resources/{faq,security,roadmap}, api-reference/{introduction,authentication,webhooks,agent-infrastructure,endpoint/*}, vaults/* [H]
- https://docs.matchr.xyz/api-reference/openapi.json (Plant Store placeholder) [H]
- DNS: `api.matchr.xyz` unresolvable; `matchr.xyz`, `docs.matchr.xyz` resolve (Cloudflare); whois: created 2023-11-28, expires 2026-11-28 [H]
- https://registry.npmjs.org/@matchr%2fsdk, /@matchr%2fagent-sdk, /matchr-sdk, /matchr-agent (404); https://pypi.org/pypi/matchr-sdk/json, /matchr-agent/json (404) [H]
- GitHub API: user `matchrxyz` (0 repos, created 2025-12-06); repo search "matchr prediction market" -> `hubseer/Matchr-A-universal-prediction-market-aggregator-on-Polymarket-and-Kalshi` (promo stub) [H]
- https://kairos.trade and https://kairos.trade/compare (no Matchr mention found) [H absence]
- https://docs.polymarket.com/llms.txt, /programs/builders/fees.md (2026 builder fee formula, pUSD/V2 migration pages) [H]
- https://api.llama.fi/protocols (no Matchr entry) [H absence]
- https://x.com/matchrxyz (HTTP 402; not read)
- Prior in-repo notes: `docs/research/14-platform-of-platforms.md` (6.1, Matchr row: IGNORE), `docs/research/16-linking-methods-services.md` (5.1 Matchr row), `docs/research/10-aggregation-landscape.md` (1.7) [prior, L-M]
