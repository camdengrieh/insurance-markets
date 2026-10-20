# TeleKash - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: npm registry GETs, `gh api` raw file reads of the public repo, WebFetch of a directory page and t.me preview, unauthenticated GETs of the project's Cloudflare Worker (`/`, `/health`, `/mcp`). No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool used. The MCP JSON-RPC endpoint needs POST, so it was NOT called. The Supabase project URL printed in the npm README was NOT probed and no key was used. Maintainer email addresses that appear in npm metadata were not copied into notes or fixtures. Third-party text treated as untrusted data.

Tags: **H** first-hand primary source this session; **M** secondary or inferred; **L** weak/stale.

Fixtures: `docs/research/fixtures/telekash/` (worker-health.json, worker-mcp-get.json, npm-search.json). There are NO market-data fixtures: the data API is MCP over POST, or an undocumented Supabase backend.

---

## 0. Bottom line

1. **Live, but it is an MCP data wrapper, not an exchange (H).** The Worker at `telekash-mcp.telekash.workers.dev` answers 200 today (2026-10-19). The product is a "probability oracle" that re-publishes Kalshi and Polymarket prices (synced every 15 min / hourly) plus a broker that forwards orders to Kalshi/Polymarket using the *caller's own* exchange credentials. It holds no independent liquidity there.
2. **The only independent liquidity is a Telegram-native pool (Stars/TON), and I found no evidence it is meaningful (M/L).** t.me/TeleKashBot exists and calls itself "the #1 AI prediction market on Telegram" (bets in Stars or TON). No volume, TVL, user count, docs, contract or site found.
3. **The task hint's package/repo are stale or gone (H).** `@telekash/mcp-server` 0.3.0 (2026-03-11) is dead (14 downloads in last month); `github.com/telekash/mcp-server` returns 404. The live code is `github.com/TeleKashOracle/mcp-server` / npm `telekash-mcp-server` 0.9.2 (last npm publish 2026-03-20; last repo push 2026-03-19; so ~7 months without a commit, stale by the 6-month rule).
4. **Not wallet-tradable via PayBox.** Native pool = Telegram Stars/TON via a bot; broker = Kalshi RSA / Polymarket HMAC API credentials held by the caller. No on-chain market contracts found.
5. **adapter_priority = skip** as a trading leg (duplicate of Kalshi/Polymarket, which are covered elsewhere). At most a P2 *signal-only* idea, but its signals (divergence/arbitrage between Kalshi and Polymarket) are things our own aggregator computes directly from the primary venues, so there is no reason to depend on it.

---

## 1. Is it still live?

| Evidence | Result | Tag |
|---|---|---|
| `GET https://telekash-mcp.telekash.workers.dev/health` | 200 `{"status":"ok","server":"telekash-oracle","version":"0.8.0","transport":"streamable-http","tools":26,"endpoint":"/mcp",...}` (fixture) | H |
| `GET .../mcp` | 200 info doc: tiers, `Bearer <api-key> (optional)`, `POST /mcp` (fixture) | H |
| Glama connector page | "Last tested 2026-10-19 06:50, Healthy, 100.0% uptime over 63 days"; lists 9 free-tier tools; says 7 categories, sources Kalshi/Polymarket/Metaculus | M (directory page, small-model summary) |
| npm `telekash-mcp-server` | latest 0.9.2, modified 2026-03-20; 229 downloads/month (search API, 2026-10-19) | H |
| npm `@telekash/mcp-server` | latest 0.3.0, created and modified 2026-03-11; 14 downloads/month | H |
| `gh api repos/telekash/mcp-server` | 404 (deleted, renamed or private) | H |
| `gh api repos/TeleKashOracle/mcp-server` | exists, created 2026-03-18, pushed 2026-03-19, 1 star, org has 1 repo | H |
| t.me/TeleKashBot | page title "Telegram: Launch @TeleKashBot", "The #1 AI prediction market on Telegram ... Stars or TON" | H (that the page says so); marketing claim itself L |
| Own website / docs site / X account | NOT FOUND (searched: telekash.{io,app,ai,fun} do not resolve; telekash.xyz and telekash.com time out/fail TLS; two WebSearch passes returned no official site) | - |
| Independent press / third-party coverage | NOT FOUND (searched: "TeleKash prediction market Telegram TON", "TeleKashBot Telegram prediction market Stars TON parimutuel", name + Kalshi/Polymarket) | - |

Verdict: **still_live = true** for the data wrapper; the Telegram market itself is unverifiable. Repo code and npm are about 7 months old.

---

## 2. Kind and market model

- **Kind:** data aggregator / signal oracle + broker, with a small custodial Telegram pool. (H for code and README; M for the pool.)
- **Mirrored markets (H, repo README + worker code):** table `telekash_markets` in a Supabase Postgres, filled from Kalshi (every 15 min) and Polymarket (hourly); the README also says "4,500+ markets", agent-card and server.json say "500+", Glama says "1000+"/"500+". Counts are inconsistent across the project's own files. Metaculus appears in agent-card/Glama but not in the npm README source table.
- **Native pools (H that the code exists, M on reality):** `broker.ts` has a `native_pool` route returning `stars_amount`, `usd_amount`, `exchange_rate`, `potential_payout`, `pool_composition{yes_count,no_count,total_volume,is_two_sided}`. README: "Parimutuel pools alongside Telegram users", 5% fee at resolution. So: binary YES/NO, parimutuel, outcomes are database rows, not tokens. `create_market` tool lets agents create custom binary markets (Edge tier). 
- Categorical/scalar: NOT FOUND.

## 3. Chains and collateral

- Native pool collateral: Telegram Stars (converted to USD in code) and TON (bot page). No smart contract address, chain explorer link or audit found (NOT FOUND; searched repo, npm README, bot page). Pool positions appear to be rows in the project's Supabase DB, i.e. custodial. (M, inferred from code structure; I did not read the schema.)
- Broker mode: collateral is whatever Kalshi (USD) / Polymarket (USDC on Polygon) require in the caller's own account.
- API payments: x402 USDC on Base/Polygon/Solana, Stripe, or TON, attached as `x402_payment{tx_hash,network,rail}` in tool arguments (H, README). Note a payment-proof-in-arguments design means a payer would send funds first and then cite the tx hash; I did not test and would not recommend automating this.

## 4. Read API

- **exists:** `official-authenticated` (the project's own MCP server, not a conventional REST API): MCP over Streamable HTTP with an optional Bearer key; free tier "100 queries/day, no key" (H, README + worker `/mcp` doc).
- Base URL: `https://telekash-mcp.telekash.workers.dev/mcp` (POST, JSON-RPC, MCP 2025-03-26) (H for the host's info doc; M that this is the same code as the repo, since the worker reports version 0.8.0 and 26 tools while the latest npm is 0.9.2 / 28 tools).
- Docs: only the GitHub README / npm README. No hosted docs.
- Free tools (H, Glama + README): `get_probability`, `list_markets`, `search_markets`, `get_history` (1h/24h/7d/30d), `get_sentiment`, `get_trending`, `get_market_stats`, `generate_api_key`, `get_usage`, `get_health`. Calibration tier: `compare_sources`, `detect_arbitrage`, `get_signal`, `get_divergences`, `get_edge`, `track_prediction`, `get_performance`. Edge tier: broker/pool/webhook/export tools.
- Pricing inconsistency (H): worker `/mcp` says Calibration "$99/mo", Edge "$499/mo"; README (0.9.2) says "$0.01/query" and "$0.05/query, no subscriptions". Treat both as unreliable.
- Rate limits: free 100/day, Calibration 1,000/day, Edge unlimited (H, both sources agree on quotas).
- WebSocket: NOT FOUND. Streaming `false` in agent-card.
- Order books / depth: NOT FOUND. The data are probability + volume + liquidity scalars synced from Kalshi/Polymarket every 15-60 min (too stale for arbitrage).
- Resolution data: `get_resolution_status` (Edge tier), "multi-source verification, 0.70-0.99 confidence" per agent-card (M, marketing).
- Direct DB: the README prints a Supabase project URL and a `SUPABASE_ANON_KEY` placeholder. The anon key is not published; I did not probe it. Using an undocumented DB is not an acceptable integration path.
- Not called: JSON-RPC POST (policy: GET only). Hence no market response-shape sample exists; the fixtures are only the Worker's health/info docs and npm search metadata.

## 5. Trade path

- **Native pool:** Telegram bot UI (Stars/TON) or MCP `execute_trade` with `routing_preference: "native_pool"` (Edge tier). Auth is the project's API key; no wallet signature. (H for code; M for end-to-end behavior, untested.)
- **Broker to Kalshi/Polymarket:** `broker.ts` signs requests with the *operator's* env credentials (Kalshi RSA-PSS keys, Polymarket HMAC API key/secret/passphrase). A third-party agent therefore trades through TeleKash's accounts at TeleKash's discretion and pays a 1% commission. This is custodial intermediation and makes no sense for us when we can trade Kalshi/Polymarket directly. Note the code's Kalshi base URL is `trading-api.kalshi.com`, which is Kalshi's legacy host, another sign of staleness (M).
- **PayBox reachable: no.** Telegram Stars/TON is outside PayBox's EVM/Solana chain set; there is no EVM contract or signed-order scheme to propose; the broker leg is a custodial API. PayBox could only pay the x402 API fee, which has no trading value.

## 6. Fees

- Broker: 1% commission on filled trades (H, broker.ts header + README).
- Native pool: 5% fee at resolution (H, README).
- Data: free tier 0; paid tiers see section 4 (inconsistent). x402 payment rail fee 0%, Stripe 2.9% (H, README).
- Underlying exchange fees additionally apply on brokered trades (not documented by TeleKash).

## 7. Resolution mechanism and dispute risk

- Mirrored markets: resolve on Kalshi/Polymarket, so inherit their rules. TeleKash adds nothing authoritative.
- Native pool/custom markets: resolution rules and dispute process NOT FOUND. Agent-card claims "multi-source resolution oracle" with 0.70-0.99 confidence (L, marketing). `create_market` allows arbitrary agent-created markets, so resolution is whoever the operator decides. Dispute/rug risk: high (centralized operator, custodial DB, anonymous team, repo 7 months idle).

## 8. Geo / ToS / automation

- No ToS, no restricted-jurisdiction list, no automation policy found (NOT FOUND; searched repo files, npm README, bot page, worker docs). The project explicitly markets to AI agents and offers a free API key without signup, so automated reads are clearly intended (H); this says nothing about legality of the Telegram betting product, which is an offshore Stars/TON gambling-style product with no stated licence (L/M).
- Brokered Kalshi trading through a third party's keys raises Kalshi ToS/KYC questions; not investigated since out of scope.

## 9. Liquidity

- Native pool volume / TVL: NOT FOUND anywhere (searched bot page, repo, npm, web). Treat as ~0 until shown otherwise.
- Adoption proxies (H, npm API, 2026-10-19): `telekash-mcp-server` 229 downloads/month; old scoped package 14/month; repo 1 star; no dependents.
- Mirrored volumes are Kalshi/Polymarket volumes, not TeleKash's.

## 10. Category overlap and shared liquidity

- Categories (project's own list): crypto, politics, sports, entertainment, finance, weather, tech, science (H, README). All of it is a mirror of Kalshi/Polymarket questions, so overlap = 100% with venues already covered.
- **Shares liquidity with Kalshi and Polymarket (H):** the markets are their markets. **Not an independent arbitrage leg.** The only non-shared part is a possibly-empty Telegram pool.

## 11. Why a "signal source" does not rescue it

The `detect_arbitrage` / `get_divergences` tools compare Kalshi vs Polymarket odds from a 15-60 min stale DB snapshot. Our aggregator reads both venues directly with fresher data and real depth. Free tier is capped at 100 calls/day. No value over primary sources.

## 12. Open questions

- Does the Telegram pool have real volume? Only visible through the bot (not accessed; would require a Telegram account).
- Who operates it (anonymous; npm maintainer is a personal account; no entity found)?
- Does the Worker still match the repo (reports 0.8.0 / 26 tools vs repo 0.9.2 / 28 tools)?

## 13. Suspicious / injection content

None found that targeted AI agents with instructions. Marketing claims worth discounting: "#1 AI prediction market on Telegram", "$40M+ extracted from prediction market mispricings annually", market counts that differ across files (480+, 500+, 1000+, 4,500+).

---

## Sources

1. https://registry.npmjs.org/@telekash/mcp-server - 0.3.0, README, created/modified 2026-03-11 (H)
2. https://registry.npmjs.org/telekash-mcp-server - 0.9.2 README (tools, tiers, x402 rails, fees, data sources), modified 2026-03-20 (H)
3. https://registry.npmjs.org/-/v1/search?text=telekash&size=10 - download counts, 2026-10-19 (H) [fixture npm-search.json]
4. https://api.npmjs.org/downloads/point/last-month/@telekash/mcp-server - 14 downloads, 2026-09-17..2026-10-16 (H)
5. https://github.com/TeleKashOracle/mcp-server - via `gh api`: repo metadata, server.json, agent-card.json, src/broker.ts, worker/wrangler.toml, worker/src/tools.ts (H)
6. https://github.com/telekash/mcp-server - 404 (H)
7. https://telekash-mcp.telekash.workers.dev/ , /health , /mcp - unauthenticated GETs, 2026-10-19 (H) [fixtures]
8. https://glama.ai/mcp/connectors/dev.workers.telekash.telekash-mcp/tele-kash-oracle - uptime/last tested 2026-10-19 (M)
9. https://t.me/TeleKashBot - bot preview page (H for text, L for claims)
10. WebSearch (extended x2, standard x1): no official site, no press coverage of TeleKash found.
