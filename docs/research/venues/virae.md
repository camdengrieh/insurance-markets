# Virae (virae.ai) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs against `www.virae.ai`, `api.virae.ai` and `api.llama.fi`, `gh api` raw reads of the `Virae-Labs` GitHub repos, WebFetch of public pages, and public JS bundles read as text (not executed). No account, wallet, API key, OTP, signature, POST/PUT/DELETE, or third-party code executed. No PayBox tools called. One paid endpoint was GET-ed once, returned HTTP 402, and I stopped there (requirements recorded in section 4). The WebSearch budget ran out after 1 useful query, so third-party coverage is thin; the DefiLlama HTML page returned 403, so I used DefiLlama's public JSON API instead.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months old). Nothing here is older than 6 months.
All third-party text is untrusted data; nothing in it was followed. Text aimed at AI agents does exist on the site and in the skill repo (see section 14); it is benign usage guidance and was not acted on.

## 0. Verdict

**adapter_priority: skip** (as a trading leg). still_live: **true**. Confidence: high.

1. **Virae is a front-end/broker, not a venue.** It has no markets, no matching engine and no settlement of its own. Its prediction-market product routes orders to **Polymarket** and **Predict.fun** (H: `llms.txt`, homepage ecosystem section, skill docs). Anything priced on Virae is priced on one of those two venues, so it is **not an independent arbitrage leg**; those venues are already covered by the parallel workflow.
2. **Its own liquidity is tiny.** DefiLlama attributes **$45,728.86** of all-time volume to Virae (Polymarket builder-code attribution, 2026-05-03 to 2026-09-26) and **$16.18** of lifetime builder fees (H, API pulled 2026-10-19). Site says "Private Beta" (H).
3. **No useful public market-data API.** The public/anonymous API surface is strategy-simulation data (backtest-style results for its own bots) plus aggregate topic stats. Per-market prices, order books and trades are behind login (or are simply the underlying venues' data). There is no WebSocket and no public OpenAPI for markets (H: OpenAPI covers only the x402 strategy-data routes).
4. **Trading is account-bound.** Orders are placed through Virae's own backend using a Virae-created Turnkey embedded wallet; an external wallet (PayBox or otherwise) cannot sign a Virae order. Reaching the same markets directly via Polymarket / Predict.fun is strictly better for the scanner.
5. **Only conceivable value is signal-only**, and it is weak: simulated results of its own heuristics (the free overview shows an all-time simulated after-fee loss of -$67.5k on $13.1M notional for BTC 15m Tail, H), a 61-person paper leaderboard, and 22 Strategy Plaza agents with 0 copies on the first page (H). Not worth a P2 slot now. Revisit only if Virae publishes a real copy-trading / whale-flow feed.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://www.virae.ai/` | HTTP 200; page says "Private Beta" and "(c) 2026 Virae Terminal" | H |
| `GET https://api.virae.ai/api/x402/v1/catalog` | HTTP 200, `generatedAt: 2026-10-19T04:01:53Z`, 18 strategy keys, `paymentEnabled: true` | H |
| Simulation overview `status.latestSampleAt` | 2026-10-19T03:20:34Z (data recorder is running); coverage `startedAt` 2026-07-11 | H |
| `GET /api/markets/homepage-topics` | `snapshot.refreshedAt: 2026-10-19T04:02:22Z`, `stale:false`, per-source timings for `polymarketMs` and `predictfunMs` | H |
| GitHub `Virae-Labs/virae_ai_skill` | created 2026-04-16, last push 2026-09-10, releases v0.0.1/v0.0.2 on 2026-07-30, MIT | H |
| GitHub `Virae-Labs/virae-strategy-core` | created 2026-08-16, last push 2026-10-01, license "NOASSERTION" on the API but CPAL-1.0 in the README | H |
| Terms of Service | effective date 2026-05-09; the page calls itself an "operational draft" to be reviewed by counsel (per WebFetch summary) | M |
| `https://docs.virae.ai/` (the homepage "technical documentation" link, also the target of `www.virae.ai/docs` 308 redirect) | **DNS NXDOMAIN**. The documented docs host is dead. The real documentation is the GitHub skill repo plus `llms.txt` and the OpenAPI file | H |
| `sitemap.xml` | 54 URLs, 51 of them 2024 NBA pages (e.g. `nba-dailies-2024-04-20`) plus `/news` and `/partners`: stale SEO content, not evidence of 2026 coverage | H, stale |
| Former name | skill repo description reads "Claude Code skill for trading on Polymarket via **Predictdog**"; sim metadata has `feeModel: predictdog_trade_fee_1pct`; API ALB hostname begins `polybot-` | H (strings), M (rebrand inference) |

Conclusion: live as a private-beta product, actively developed through at least 2026-10-01. The DefiLlama hint is correct ("AI-powered prediction-market trading interface ... copy trading, whale insights") (H: `api.llama.fi/protocol/virae`, category "Interface", tag "Polymarket Builder", chain Polygon).

## 2. Kind and market model

- **Kind:** broker / front-end / terminal over third-party venues (web app, Telegram bots `virae_polymarket_bot` and `virae_crypto_bot`, a Claude-Code/Codex/OpenClaw "skill" CLI, a hosted "Agents" auto-trader and a memecoin terminal). (H: homepage, skill README.) The memecoin terminal (Solana, Robinhood Chain) is out of scope for prediction-market arbitrage.
- **Supported prediction venues:** Polymarket (primary) and Predict.fun (secondary, API routes `/api/predict/*`). The homepage FAQ line "PolyMarket + PredictFarm" appears to be a typo for Predict.fun. (H)
- **Market model:** inherited, not Virae's. Orders reference an exact venue outcome `tokenId` (Polymarket CLOB token), price is a decimal in (0,1) shown as cents, `side` BUY/SELL, `orderType` LIMIT/MARKET, `amountKind` NOTIONAL (USDC) or SHARES (H: skill `markets-and-trading.md`). Predict.fun has its own order book endpoint (`/api/predict/markets/:marketId/orderbook`, authenticated). Binary and categorical (multi-market events) as on the underlying venues; recurring crypto Up/Down rounds (5m/15m/1h) are a focus.
- **Virae-specific objects** (not tradeable markets): Strategy "Agents" (Live and Paper), Strategy Plaza (shareable agent configs), Paper leaderboard, copy-trading tasks, Points and cashback tiers.

## 3. Chains and collateral

From the Virae wallet-asset routes (H: skill `other-products.md`): `polygon-pusd`, `bnb-bnb`, `bnb-usdt`, `solana-sol`, `solana-usdc`, `robinhood-eth`, `robinhood-usdg`.

| Chain | Used for | Collateral per Virae docs | Tag |
|---|---|---|---|
| Polygon | Polymarket trading | `pUSD` (Virae's asset key is `polygon-pusd`; DefiLlama says "Polymarket v2") | H (asset key), M (what pUSD is; defer to the Polymarket note) |
| BNB Chain | Predict.fun trading | `bnb-usdt` (and BNB for gas) | M (inferred from asset keys; Predict.fun is covered by another workflow) |
| Solana, Robinhood Chain | memecoin terminal / funding | SOL, USDC, ETH, USDG | H (keys), out of scope |

Wallet model: Virae generates a **Turnkey** embedded wallet per account in the browser ("non-custodial, no extension") (H: homepage FAQ). Polymarket readiness errors reference a "deposit wallet" / "Safe" (`POLYMARKET_DEPOSIT_WALLET_NOT_READY`, `POLYMARKET_SAFE_NOT_READY`), so there is a per-user Polymarket proxy wallet owned through that Turnkey key (M, inferred from error codes). Terms do not say whether Virae is custodial and do not mention Turnkey (M, WebFetch summary), so the "non-custodial" claim is marketing copy only (L).

## 4. Read API

Classification: **official-authenticated** for anything about markets and accounts. The anonymous part is strategy-simulation data.

- **Base URL:** `https://api.virae.ai` (Express behind an AWS ALB) (H).
- **Docs:** no standalone docs site (`docs.virae.ai` is NXDOMAIN). Canonical sources: `https://www.virae.ai/llms.txt`, `https://api.virae.ai/openapi.json` (OpenAPI 3.1, x402 strategy-data routes only), GitHub `Virae-Labs/virae_ai_skill` (`SKILL.md`, `references/*.md`) (H).
- **Rate limit:** response headers `ratelimit: "1200-in-1min"; r=1199; t=60` on every response (H, observed). Terms section 6 also forbids abusive scraping "at unreasonable scale" (M).
- **WebSocket / streaming:** NOT FOUND (searched: llms.txt, OpenAPI, skill README/SKILL.md/references, route strings in the public JS bundles). The org's public repo list includes a `polymarket-websocket-client` repo (last push 2026-01-06), which suggests Virae consumes Polymarket's own socket rather than offering one (M).

### Anonymous endpoints confirmed with real GETs (2026-10-19)

| Endpoint | Returns | Useful to the scanner? | Fixture |
|---|---|---|---|
| `GET /api/markets/homepage-topics?source=&feed=&limit=` | `{ok, topics:[{key,label,href,source,rank,stats:{eventCount,volume24h,volumeTotal}}], sourceWarnings, snapshot:{source,feed,refreshedAt,stale,sourceTimings:{polymarketMs,predictfunMs}}}`. Example topic "trump": 35 events, 24h volume 3,746,354, total 411,010,279 (merged Polymarket + Predict.fun numbers, not Virae's own) | Only as a topic-level volume cross-check. No market ids, prices or outcomes | `markets_homepage-topics_limit3_2026-10-19.json` |
| `GET /api/markets/taxonomy?source=&category=` | `{ok, availableTags:[{key,label}...]}` (about 19KB): Trump, midterms, Senate, Fed, fed-rates, crypto-prices, hit-price, 5-min, 15-min, soccer, AI, Iran, Ukraine, oil, etc. | Tag vocabulary only | (not saved, 19KB) |
| `GET /api/events/aggregated` | `[]` for every param set tried (documented as a browse surface and "not a reliable outcome-token resolver") | No | `unauthenticated_responses_2026-10-19.txt` |
| `GET /api/auto-trade/strategies` | 18 strategy descriptors (`key`, `core.package`, `manifest`, `capabilities`) | No | `x402_catalog_2026-10-19.json` is the same data plus URLs |
| `GET /api/auto-trade/strategy-plaza` | `{ok, items[], total:22, page, pageSize:18}`; each item has title, strategyKey, sizing, schedule, `stats.{winRate,orderCount,afterFeePnlUsd,...}`, `copyCount`, `authorLabel` (masked handle) | Weak signal at best (self-run bots; first-page `copyCount` sums to 0) | `auto-trade_strategy-plaza_trimmed_2026-10-19.json` (handles redacted) |
| `GET /api/auto-trade/paper/leaderboard` | `{ok, rankingMetric:"TRIAL_EQUITY", items[], total:61, competition:{status:"FINAL", snapshotDate:"2026-09-07"}}`. Items carry a masked email (third-party data; redacted in my fixture) | No. Trial money, finished campaign | `auto-trade_paper_leaderboard_trimmed_2026-10-19.json` |
| `GET /api/x402/v1/catalog` | list of 18 strategies with resource URLs and `paidResources` ids and prices | Discovery only | `x402_catalog_2026-10-19.json` |
| `GET /api/x402/v1/simulations/{strategyKey}/overview` | free compact simulation summary (`windows.{7d,30d,90d,all}` with `enteredCount, winRate, strategyPnlUsd, simulatedFeesUsd, afterFeePnlUsd, investedUsd`, plus `topMatrix`, `pnlCurves`, `dataQuality`, `limitations`). 102KB untrimmed | Not a market signal. Backtest of Virae's own heuristic | `x402_simulation_overview_btc-15m-tail_trimmed_2026-10-19.json` |
| `GET /api/x402/v1/hit-price-snipe/system-matrix` | free "integrity matrix" (documented in OpenAPI; not fetched) | No | n/a |

### Paid (x402) endpoints: HTTP 402 recorded, not paid

`GET /api/x402/v1/simulations/{strategyKey}/matrix` returned **402** with a base64 `PAYMENT-REQUIRED` header (decoded in `x402_402_payment_required_decoded_2026-10-19.json`): scheme `exact`, network `eip155:8453` (Base), asset USDC on Base (`0x833589fC...2913`), amount `10000` (= $0.01), `maxTimeoutSeconds: 60`, `payTo` = Virae's published address (same address as `x-discovery.ownershipProofs` in the OpenAPI file). Prices from the OpenAPI/catalog: `matrix` $0.01, `configs/{id}/results` $0.01, `POST /simulations/compare` $0.03. The data is simulation matrices for Virae's own strategies, so there is no reason to pay for it. (H)

### Authenticated endpoints (documented in the skill repo, NOT called)

Auth: either (a) **agent session** - email OTP via Turnkey, scoped, 15-minute access token as `Authorization: Bearer`, rotating refresh token, or (b) **API key** created in the browser (Settings > API Keys) and sent as `x-api-key` (key prefix shown in docs as `pd_pat_...`, another "predictdog" artefact) (H: `auth-and-scopes.md`). Scopes include `account:read`, `wallet:read`, `wallet:deposit:read`, `wallet:deposit:monitor`, `market:resolve`, `portfolio:read`, `trade:polymarket`, `trade:predict`, `trade:memecoin`, `auto_trade:read|manage|activate`, `favorites:manage`, `handoff:create`, `settings:manage`, `notifications:manage`.

| Area | Routes (all H as documented, none called) |
|---|---|
| Market resolution | `POST /api/markets/resolve` (scope `market:resolve`) returns `exact`/`ambiguous`/`not_found` with `selection.outcome.tokenId` |
| Public browse (documented anonymous) | `GET /api/events/page-model/:slug` (I did not have a slug to test), `/api/markets/taxonomy`, `/api/markets/homepage-topics` |
| Predict.fun reads | `GET /api/predict/markets`, `/predict/markets/:id`, `/predict/markets/:id/orderbook` (returned **401** unauthenticated, H), `/predict/positions`, `/predict/orders`, `/predict/activity`, `/predict/readiness` |
| Account | `GET /api/auth/me`, `/api/trade/open-positions`, `/trade/open-orders`, `/trade/claimable-positions`, `/api/activity` (open-positions returned **401** unauthenticated, H) |
| Copy trading | `GET /api/copy-trading/tasks|executions|summary` |
| Wallet | `GET /api/wallet/assets`, `/api/wallet/deposit-targets[/:asset]`, `/api/wallet/deposit-status/:asset` |

No endpoint for Polymarket order books, trade tape or per-market resolution status was found (NOT FOUND, searched: all skill references, OpenAPI, bundles). A scanner needs those from Polymarket directly.

## 5. Trade path

Programmatic placement exists but only inside a Virae account, not as signed orders from an external wallet (H, skill docs):

1. `POST /api/trade/readiness` with `{venue:"POLYMARKET", trade:{tokenId, side, orderType, amount, amountKind, limitPrice}}`.
2. `POST /api/trade/order` with the same fields plus `eventSlug`, `marketId`, `outcomeLabel` (MARKET orders accept `referencePrice` and `slippageBps`).
3. Cancel/claim: `POST /api/trade/order/cancel`, `/trade/claim`, `/trade/claim-batch`, `/trade/fee/quote`, `/trade/exit-plan`.
4. Predict.fun: `POST /api/predict/orders` and `/predict/orders/remove` (scope `trade:predict`).

Signing: not by the caller. The API call carries only a Bearer token / API key; the order is built and submitted server-side from the account's Turnkey-held key (M: inferred from error codes `TURNKEY_UNAVAILABLE`, `CLOB_UNAVAILABLE`, `CLOUDFLARE_BLOCKED`, `TX_SUBMISSION_TIMEOUT`, and from the statement that agent credentials "do not replace wallet ownership"). Browser-session-only actions: wallet setup, approvals, swaps, withdrawals, API-key management, Predict activation (H). Mutations need an `Idempotency-Key` for Live Agent/Plaza routes (H).

## 6. Reachability from a PayBox EVM wallet

**paybox_reachable: no** (for trading); funding-only is technically possible but pointless.

- There is no mechanism for an external EVM wallet to place or sign a Virae order: no EIP-712 order flow exposed, no transaction-proposal flow, no "bring your own wallet" trading path documented. Orders are signed by Virae-managed Turnkey keys (M).
- A PayBox wallet could transfer pUSD (Polygon) or USDT (BNB) to the address returned by `GET /api/wallet/deposit-targets/:asset` (needs an authenticated Virae account), after which Virae trades with it. That moves funds into a third-party-controlled account and adds a fee layer, with no access to any market that Polymarket/Predict.fun do not already expose. Not recommended.
- Direct access to the same markets (a PayBox Polygon/BNB wallet signing Polymarket / Predict.fun orders itself) is the right route and belongs to those venues' adapters.

## 7. Fees

| Fee | Value | Tag |
|---|---|---|
| Virae platform fee | **Not published.** Terms section 7 only says "fees, spreads, rebates, rewards ... may change at any time"; homepage, skills page and open-strategy-core page list no fee schedule. | H (absence) |
| Evidence of a ~1% trade fee | Simulation config metadata in the free overview: `feeBps: 100` and `feeModel: "predictdog_trade_fee_1pct"`; simulated "commission" fees equal exactly 1.00% of notional in the top config (189 on 18,900). Looks like the fee Virae charges (or intends to charge) in its own execution, but nothing states it as the live fee. | M |
| Polymarket builder fee | DefiLlama: "Builder fees received by Virae.ai from trades on Polymarket v2": **$16.18 lifetime**, last non-zero day 2026-08-18, zero since. Against $45.7k attributed volume that is about 0.04%, far below 1%, so either the 1% is collected another way (e.g. a separate fee ledger/"fee debt") or builder fees were switched off or are not fully attributed. | H (data), M (interpretation) |
| Fee debt | A browser-only "fee-debt recovery" flow exists, so Virae can accrue unpaid fees on an account (H: `auth-and-scopes.md`). | H |
| Fee quote | `POST /api/trade/fee/quote` exists (authenticated, not called). | H |
| Rewards | "Tiered cashback" of fees: Tracker 8% (active), Hunter 14% (top 15% vol), Wolf 20% (top 5%), Alpha 30% (top 1%); Points; one-level referral rebate. | H (homepage) |
| Underlying venue fees (Polymarket, Predict.fun) | Not Virae's; see their notes. | - |

Who pays: the trader, on top of venue fees. For a cross-venue scanner, any edge must clear venue fees plus an unquantified Virae fee of possibly ~1% - another reason not to route through Virae.

## 8. Resolution and dispute risk

Virae does not resolve anything. Outcomes settle on Polymarket / Predict.fun under their own oracle processes and `claim` routes (`/api/trade/claim`) only redeem winnings (H). Dispute risk is therefore the underlying venue's, plus intermediary risks: Virae backend or Turnkey outage during a claim window (`TURNKEY_UNAVAILABLE`, `TX_SUBMISSION_TIMEOUT` errors are documented, H), and its terms cap liability at "the greater of $100 or the amount you paid in the prior twelve months" and exclude "digital asset loss" (M, WebFetch summary of section 11). Its own strategies "fail closed" on ambiguous resolution and warn the host to "prove resolution-source equivalence" for hit-price markets (H, strategy-core README) - a useful reminder for the linking layer.

## 9. Geo, ToS and automation

- **Terms** (https://www.virae.ai/terms, effective 2026-05-09, draft): no jurisdiction list; users must be "permitted to access the relevant features in your jurisdiction"; section 6 bars abusing rate limits, scraping at "unreasonable scale", abusive automated traffic and reverse engineering; third-party venues can "change, delay, restrict, or suspend access independently of Virae"; user is responsible for venue-specific restrictions (M, via WebFetch summary; I did not re-read the 111KB page in full).
- **Geo:** live activation of agents requires "geographic eligibility and current service availability"; on rejection "leave the Agent paused and do not bypass it" (H: skill docs). The web header shows an unexplained "Geo: PM OFF" indicator (M). Underlying Polymarket / Predict.fun geoblocks apply (see those notes).
- **Automation:** explicitly supported for logged-in accounts through the official skill (agent session or API key), with human confirmation steps recommended by Virae's own docs. `robots.txt` allows all crawlers including AI crawlers (H). New accounts must "explicitly accept Virae's current terms" before an agent signs up (H: SKILL.md) - this is a ToS click a read-only research run must not perform, which is why no account was created.
- **Licence:** `virae-strategy-core` is CPAL-1.0 with a "Powered by Virae Strategy Core" attribution requirement for graphical executables and source-availability on network deployment (H: README); `virae_ai_skill` is MIT (H). Relevant only if the project ever reuses their strategy code; the scanner does not need it.

## 10. Liquidity (Virae-attributed only)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| All-time attributed volume | $45,728.86 (142 daily points, 2026-05-03 to 2026-09-26) | `api.llama.fi/summary/dexs/virae`, pulled 2026-10-19 | H |
| Last 7 reported days | $2,226 (peak day $1,885 on 2026-06-23; last reported day 2026-09-26: $184) | same | H |
| Lifetime builder fees | $16.18 (first 2026-07-13, last non-zero 2026-08-18) | `api.llama.fi/summary/fees/virae`, 2026-10-19 | H |
| TVL / OI | none (DefiLlama TVL arrays empty) | `api.llama.fi/protocol/virae` | H |
| Paper leaderboard | 61 entries, 62 campaign participants, FINAL snapshot 2026-09-07 | `/api/auto-trade/paper/leaderboard` | H |
| Strategy Plaza | 22 listed agents; first-page `copyCount` all 0; max 257 orders | `/api/auto-trade/strategy-plaza`, 2026-10-19 | H |
| Social/traction | GitHub stars 0 on both repos; DefiLlama flags the entry `doublecounted: true` | GitHub API, DefiLlama | H |

DefiLlama only sees flow tagged with Virae's Polymarket builder code, so Predict.fun volume through Virae is not included; there is no public figure for it (NOT FOUND, searched: DefiLlama, site, skill docs). The topic volumes in `homepage-topics` (e.g. 411M total for "Trump") are the underlying venues' market volumes, not Virae's.

## 11. Event-category overlap

Everything overlaps Polymarket / Predict.fun, because that is the whole catalogue. Taxonomy tags (H, `/api/markets/taxonomy`): politics (Trump, midterms, Senate/Governor races, global elections, Putin), geopolitics (Iran, Ukraine, Israel, Venezuela, Strait of Hormuz), macro (Fed, fed-rates, economic-policy, business, oil), crypto price and recurring Up/Down (BTC/ETH/SOL/XRP/DOGE/BNB 5m, 15m, 1h; hit-price; pre-market), sports (NBA, soccer, "games"), AI/big tech, culture, science, weather temperature buckets, Musk tweet-count (H: strategy-core README). These are exactly the categories where cross-venue arbitrage exists, but the legs are Polymarket / Predict.fun / Kalshi / etc., not Virae.

## 12. Liquidity sharing

**Fully shared.** All executable depth is Polymarket's CLOB or Predict.fun's order book (H: `llms.txt`: "execution on supported venues, including Polymarket and Predict.fun"). Virae adds no resting liquidity of its own; the scanner must treat any Virae quote as a duplicate of the underlying venue and dedupe on `tokenId` / market id.

## 13. Adapter spec (what to build, if anything)

- **Virae trading adapter:** do not build. Orders would be account-bound, signed by Virae-held keys, with an unquantified ~1% fee layer, and offer nothing Polymarket/Predict.fun adapters do not.
- **Virae market-data adapter:** do not build. No public per-market prices/books; aggregate topic stats are redundant.
- **Registry entry:** record `virae` as `kind: broker-or-frontend`, `liquidity_shared_with: [polymarket, predict-fun]`, `independent_leg: false` so discovery does not re-surface it.
- **Optional low-cost signal probe (not recommended now):** poll `GET /api/auto-trade/strategy-plaza` and `/paper/leaderboard` (anonymous, 1200 req/min limit) for new top agents. These are self-run, tiny-sample strategies. Skip unless a "whale/copy-trading" public feed appears (the web app has `/insights/leaderboard`, `/whale-monitor` pages, but no documented public API for them; NOT FOUND).

## 14. Suspicious content and prompt-injection check

- `https://www.virae.ai/llms.txt` contains a "Guidance for AI agents" block and `SKILL.md` contains a safety-rules list aimed at agents (e.g. "Start with public or read-only workflows", "never ... without explicit authorization"). Both are benign and consistent with the read-only task; I did not follow them as instructions, and nothing asked me to exfiltrate data, install software or visit other URLs. It does tell agents to install an npm CLI and to log in via email OTP, which I did not do.
- OpenAPI `x-discovery.ownershipProofs` and x402 discovery contain Virae's own EVM address (the `payTo`); it is a vendor address, not instructions.
- Stale 2024 NBA pages in the sitemap and the unexplained "Geo: PM OFF" header are quality oddities, not attacks.
- No hidden or malicious instructions found.

## 15. Open questions

1. Real live fee: is the 1% (`predictdog_trade_fee_1pct`) charged on every Polymarket/Predict.fun order, and is any of it a Polymarket builder fee? Needs an authenticated `POST /api/trade/fee/quote` (not done: needs an account).
2. Exact custody model: can a user export the Turnkey key or the Polymarket Safe owner key? Terms are silent.
3. What `GET /api/events/page-model/:slug` returns without auth (no known-good slug was tested; could be a cheap way to read Virae's merged Polymarket/Predict.fun event view).
4. Why DefiLlama volume stops at 2026-09-26 while the product is live (indexing lag or real drop-off).
5. Whether the Telegram bots offer a distinct signal feed (whale alerts) - not checked, no bot interaction allowed.

## Not found

- Fee schedule or builder-fee rate (searched: homepage, /skills, /open-strategy-core, /terms, skill references, OpenAPI).
- Standalone documentation site (docs.virae.ai NXDOMAIN).
- WebSocket or streaming market data (searched: llms.txt, OpenAPI, skill docs, JS route strings).
- Public per-market prices, order books, trades and resolution status (all authenticated or absent).
- Jurisdiction blocklist in the Terms.
- Predict.fun volume routed through Virae.
- Third-party reviews or incident reports (web search budget exhausted).

## Sources

All fetched 2026-10-19 unless noted.

- https://www.virae.ai/ (homepage, FAQ, rewards, ecosystem) - H
- https://www.virae.ai/llms.txt - H
- https://www.virae.ai/skills - H (WebFetch summary)
- https://www.virae.ai/open-strategy-core - H (WebFetch summary)
- https://www.virae.ai/terms (effective 2026-05-09) - H (WebFetch summary, not read in full)
- https://www.virae.ai/robots.txt, https://www.virae.ai/sitemap.xml - H
- https://api.virae.ai/openapi.json, https://api.virae.ai/.well-known/x402, https://api.virae.ai/api/x402/v1/catalog - H
- https://api.virae.ai/api/markets/homepage-topics, /api/markets/taxonomy, /api/events/aggregated, /api/auto-trade/strategies, /api/auto-trade/strategy-plaza, /api/auto-trade/paper/leaderboard, /api/x402/v1/simulations/btc-15m-tail/overview, /api/x402/v1/simulations/btc-15m-tail/matrix (402) - H
- https://github.com/Virae-Labs/virae_ai_skill (`README.md`, `SKILL.md`, `references/auth-and-scopes.md`, `markets-and-trading.md`, `other-products.md`, `api.md`, `examples.md`) - H
- https://github.com/Virae-Labs/virae-strategy-core (`README.md`, `docs/strategy/btc15m-value-snipe.md`) - H
- https://api.llama.fi/protocol/virae, https://api.llama.fi/summary/dexs/virae, https://api.llama.fi/summary/fees/virae (DefiLlama page https://defillama.com/protocol/virae itself returned HTTP 403) - H
- WebSearch result list for "Virae prediction market AI trading copy trading Polymarket" (polymart.app, polbots.com listings; self-reported by Virae or listings, treated as L)
- Fixtures: `docs/research/fixtures/virae/` (10 files, about 44KB total; third-party masked emails and handles redacted)

Privacy: requests used the generic User-Agent `insurance-markets-research/0.1`; no personal identifiers were sent anywhere. My fixture-building script contained a home-directory path in two lines; I replaced them with command-line arguments and confirmed the script and all fixtures contain no personal identifiers.
