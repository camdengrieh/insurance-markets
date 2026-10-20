# Simmer (simmer.markets) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. WebSearch budget was exhausted for the session, so everything below comes from Simmer's own site, docs, OpenAPI file, GitHub repo, npm metadata and unauthenticated GETs.

## Verdict

**adapter_priority: skip.** Simmer is a broker and agent-account layer in front of Polymarket (CLOB, Polygon) and Kalshi (via DFlow, Solana), plus a virtual $SIM LMSR sandbox. It has no liquidity of its own that is real money, so it is not an independent arbitrage leg. Its Polymarket order flow is tiny (builder-attributed volume of about $27k in the last 30 days). The aggregator already needs Polymarket and Kalshi adapters; Simmer adds nothing to them except weak "other agents' behaviour" signals. A signal-only P2 adapter could be justified later only if you want its leaderboard or divergence fields, and I would not spend time on it.

## 1. Is it live? (H)

- Yes. `https://api.simmer.markets/` returned `{"status":"ok","message":"Simmer API v3.1","version":"0.1.0","environment":"production"}` and `/api/sdk/health` returned `{"status":"ok","timestamp":"2026-10-19T03:54:50Z","version":"1.10.0"}` on 2026-10-19 (fixtures/simmer/health.json).
- New markets were being auto-imported minutes before the fetch (a `created_at` of 2026-10-19T03:55Z in the public catalogue).
- Docs changelog latest entry 2026-09-10 (`simmer-sdk` 0.25.5); GitHub `SpartanLabsXyz/simmer-sdk` MIT, 52 stars, last push 2026-10-16; npm `simmer-mcp` 3.5.9 modified 2026-09-30. All inside 6 months.
- Site title "Simmer - Prediction Markets for the Agent Economy"; meta description "Connect your AI agent to prediction markets. Autonomous trading on Polymarket and Kalshi with installable trading skills." (H, simmer.markets).

## 2. Kind and market model

- **Kind: broker / agent-account layer** ("The agent layer for prediction markets: persistent identity, self-custody wallet, cross-venue track record across Polymarket and Kalshi", H docs.simmer.markets/index.md). Also a skills marketplace (ClawHub), MCP server, Python SDK, leaderboard.
- Venues (H, docs.simmer.markets/venues.md):

| Venue | Status | Pricing | Currency / wallet |
| --- | --- | --- | --- |
| `sim` ($SIM) | tradeable, virtual | Simmer's own LMSR AMM, prices "reflect real external market prices", 30% price-impact cap, no fees | virtual $SIM, 10,000 start, no wallet |
| `polymarket` | tradeable, real | Polymarket CLOB (orders relayed) | pUSD (V2 collateral) in a Polymarket Deposit Wallet on Polygon |
| `kalshi` | tradeable, real | Kalshi via DFlow on Solana | USDC on Solana, SOL for fees, DFlow Proof KYC for buys |
| Hyperliquid HIP-4 | read-only catalog | n/a | docs say trading "not supported yet" |

- Outcome model: every market is **binary** (YES/NO). Multi-outcome events are sibling binary markets grouped by `event_id` / `event_name` / `event_ref`, option named in `outcome_name` (H, get-market.md). Polymarket neg-risk markets have independent YES and NO CLOB tokens (H, OpenAPI description of `executable-price`).
- Identifiers: Simmer UUID `id`, plus the mirrored venue's `polymarket_id` (the on-chain `conditionId` 0x...) or `kalshi_ticker` (H, public catalogue sample). Polymarket's numeric Gamma id is NOT accepted (H, venues.md warning).
- Mirror quality: Hyperliquid rows in the public catalogue have unrendered template questions such as `template:binaryPrice` (H, `GET /api/markets?tags=hyperliquid`, 100 rows, 2026-10-19). Treat as junk.
- Kalshi markets must be explicitly imported before trading (10/day free, 100 Pro, 250 Elite) (H). The public catalogue already lists 232 active Kalshi-sourced rows (H).

## 3. Chains and collateral (H unless noted)

- Polymarket leg: Polygon (chain 137). V2 collateral is pUSD in a Deposit Wallet (smart-contract proxy owned by the agent EOA). Funding wizard accepts USDC, USDT or USDC.e from Ethereum, Polygon, Base, Arbitrum, Solana. Legacy path needs USDC.e on Polygon plus POL gas. V2 trades are gasless (wallets.md).
- Kalshi leg: Solana mainnet USDC via DFlow tokenised positions; needs about 0.01 SOL for fees; KYC at dflow.net/proof for buys only (wallets.md, venues.md).
- Premium API overflow payments (x402) are USDC on Base, self-custody wallet only (api/overview.md).
- Withdrawals are dashboard-only, not via API (faq.md).

## 4. Read API

- **Official docs:** https://docs.simmer.markets (Mintlify). Agent-readable: `/llms.txt`, `/llms-full.txt` (390 KB), per-page `.md`, OpenAPI at `https://docs.simmer.markets/openapi.json` (89 method+path pairs, title "Simmer API" v1.0.0; saved as fixtures/simmer/openapi_paths.json). Onboarding file `https://simmer.markets/skill.md`.
- **Base URL:** `https://api.simmer.markets`. Docs OpenAPI says `security: []` but runtime requires a Bearer key on `/api/sdk/*` (see 401 fixture).
- **Auth:** `Authorization: Bearer sk_live_...`, key obtained by `POST /api/sdk/agents/register` (no auth). I did NOT register. Real-money use additionally needs a human to open the `claim_url` and link a wallet in the dashboard (H, skill.md, agents docs).
- **Authenticated market data (H, OpenAPI + docs):**
  - `GET /api/sdk/markets` filters `status, venue/import_source, q, ids (<=50), tags, sort (volume|recent), limit (<=500), offset, max_hours_to_resolution, include, tradeable_only`. Discovery window is capped at 1,000 markets; response carries `truncated`/`capped_at_limit`.
  - `GET /api/sdk/markets/{id}` (fields: `current_probability`, `external_price_yes`, `divergence`, `opportunity_score`, `volume_24h` of the underlying venue, `resolves_at`, `resolved_at`, `outcome`, `resolution_criteria`, `event_*`, `outcome_name`).
  - `GET /api/sdk/markets/{id}/history?hours<=168&interval>=5` price history.
  - `GET /api/sdk/markets/{id}/executable-price?side&action` live best ask/bid of the Polymarket CLOB token.
  - `GET /api/sdk/markets/opportunities`, `/fast-markets`, `/context/{id}`, `/briefing`, `/trades`, `/positions`, `/portfolio`, `/wallet/{addr}/positions`.
  - No order-book depth endpoint found in the OpenAPI (only best executable price). Depth would have to come from Polymarket's own CLOB.
- **Unauthenticated (H, tested 2026-10-19):**
  - `GET /api/markets?limit&status&tags&q&min_volume&offset` returns `{markets[], count, limit_applied, offset, truncated, hint}`. Not in the official OpenAPI, but used by the official `simmer-mcp` ("keyless reads", `mcp/src/public-api.ts`). Row fields: `id, question, context, resolution_criteria, status, probability, resolves_at, resolved_at, outcome, import_source, polymarket_id, kalshi_ticker, external_price_yes, divergence, tags, volume_24h, event_*, outcome_name, price_change_24h, url`. Gotcha: `limit=5` returned 50 rows (limit_applied says 5), so do not trust `limit` here. Response times 0.5 to 1 s today (MCP source says 4 to 11 s on 2026-08-15). Sample: fixtures/simmer/public_markets_sample.json.
  - `GET /api/leaderboard/all` returns `sdk_agents`, `native_agents`, `polymarket`, `kalshi` sections of 20 rows each (agent PnL, trade counts; the polymarket and kalshi sections carry public trader wallet addresses). Shape only, redacted: fixtures/simmer/leaderboard_all_shape.json.
  - `GET /api/sdk/skills` (1.5 MB, public) lists skills; `GET /api/sdk/health`, `/api/sdk/version-check`.
  - `GET /api/sdk/markets?limit=3` with no key: HTTP 401 `Missing or invalid Authorization header` (fixtures/simmer/sdk_markets_401.json).
- **Rate limits (H, api/overview.md):** per API key, not per IP. Free / Pro (3x) / Elite (10x): `/markets` 60/180/600 per min; `/markets/importable` 6/18/60; `/context` 20/60/200; `/trade` 60/180/600; `/trades/batch` 2/6/20; `/positions` 12/36/120; `/portfolio` 6/18/60; `/briefing` 10/30/100; others 30/90/300. Pro $19/mo, Elite $49/mo (H, faq.md).
- **Websocket:** NOT FOUND (searched: llms-full.txt for websocket, wss://, SSE). Only webhooks (`POST /api/sdk/webhooks`, events `trade.executed`, `market.resolved`) and price alerts. Server-side risk monitoring uses an internal WS but no client feed is documented.
- **Resolution data:** `resolved_at != null` is the definitive "final" signal; `resolves_at` is only eligibility; `outcome` true=YES (H, faq.md).

## 5. Trade path

- REST `POST /api/sdk/trade` (`market_id, side yes|no, amount USD or shares, action buy|sell, venue sim|polymarket|kalshi, order_type FAK|FOK|GTC|GTD, price, dry_run, idempotency_key, signed_order, reasoning`), `POST /api/sdk/trades/batch`, cancel via `DELETE /api/sdk/orders/{id}` (H, OpenAPI). Defaults: buys FAK, sells GTC (skill.md).
- **Polymarket:** SDK builds and signs the order locally (EOA signs; for the V2 Deposit Wallet it is signature type 3, POLY_1271, an ERC-7739 TypedDataSign wrapping) and sends it as `signed_order` to Simmer, which relays to the CLOB (H, `simmer_sdk/signing.py`, `client.py` L3054-3077). Simmer's default builder code is attached unless overridden (H, changelog 2026-06-16). Docs variously say the relay uses "PolyNode" (cancels, positions) and the OpenAPI docstring says "via Dome API" (M, possibly stale).
- **Kalshi:** `POST /api/sdk/trade/kalshi/quote` returns an unsigned Solana transaction plus `quote_id, in_amount, out_amount, price`; client signs; `POST /api/sdk/trade/kalshi/submit` with `signed_transaction`; Simmer broadcasts to Solana RPC (H).
- **Managed wallet alternative:** Simmer holds a server signing key and trades with only the API key; funded by the human via dashboard. Custodial in practice (H, wallets.md).
- Safety rails server-side: default $100 per trade, $500 per day, 50 buys per day, auto stop-loss 50% on every buy (H, skill.md). Failed-trade cooldown 30 min per market+side.
- Kalshi `dry_run` is unsupported; older SDKs (< 0.25.2) could place a real order on `dry_run=True` (H, changelog 2026-09-07). Do not rely on it.
- Hyperliquid HIP-4 trading code exists in the SDK (`hyperliquid_venue.py`, agent host signs and posts directly to api.hyperliquid.xyz) but docs and changelog say preview only (H).

## 6. PayBox reachability: **partial**

- No transaction proposals needed for orders. An EVM MPC wallet could in principle act as the Polymarket owner EOA: wallet link challenge (message sign), CLOB L1 auth, and each order (typed data) via `request_wallet_sign` `typedData` (per earlier project research in docs/research/06-paybox-platform.md, which found no domain restriction). A plugin would have to reproduce the ERC-7739 wrapping and hash locally, then POST `signed_order` with a Simmer key. Not tested; the REST contract for `signed_order` has no documented schema (the OpenAPI field is typed null) so this is M at best.
- Kalshi: PayBox `solanaTransaction` signing of the DFlow transaction is plausible (M), but DFlow Proof KYC is a human step.
- Human gates that block autonomy: claim_url and wallet linking in the dashboard, the "Fund & activate trading" wizard (browser). Funding itself could go through PayBox transfers (USDC.e or other tokens to the agent EOA on Polygon) but only the managed path reads that without the wizard, and that is custodial.
- Net: everything Simmer offers is reachable more directly by integrating Polymarket's CLOB and Kalshi/DFlow straight from PayBox. Going through Simmer adds an API key, rate limits, trade caps, a relay that sees orders and a human claim step.

## 7. Fees (H, faq.md and changelog unless noted)

- Simmer charges zero: "No spread, commission, or markup from Simmer. This may change in the future." Its Polymarket builder profile carries 0% maker/taker fees.
- Polymarket taker fee passes through: `fee_usdc = shares x rate x p x (1 - p)`, category-dependent `rate` (Simmer FAQ gives crypto 0.07 as of 2026-09-06; M, second-hand, defer to the Polymarket spec). Maker fee 0. Realized fee is not exposed by the API (`fee_rate_bps` is always 0 on V2 and means "unknown").
- Kalshi: "Standard exchange fees apply" via DFlow; DFlow's own fee not documented on Simmer (NOT FOUND).
- Simmer-side costs: subscriptions (Pro $19/mo, Elite $49/mo), x402 overflow $0.005 per call on `/context`, `/briefing`, `/markets/import`; paid `POST /x402/forecast` $0.01 and `/x402/briefing` $0.05 (H, api/overview.md). I did not call these (HTTP 402 not triggered).
- Docs advise targeting 5%+ edge because real venues have 2 to 5% spreads.

## 8. Resolution and dispute risk

- Entirely inherited from the mirrored venue: Polymarket (UMA-style on-chain oracle, with settlement "minutes to hours") and Kalshi. Mirror rows say "Resolves based on Polymarket outcome for: <question>" (H, catalogue sample). Simmer has no resolution system of its own for real positions; `venue=sim` positions settle automatically to the mirrored result.
- Every market carries free-text `resolution_criteria` which Simmer tells agents to parse before trading (H, api/overview.md). The Hyperliquid template rows have none usable.
- Redemption: managed wallets auto-redeem; external wallets must call `auto_redeem()` (prepare, sign locally, submit to relayer) (H, redemption.md).
- Added risk vs going direct: Simmer is a single point of failure for order relay, redemption relay and PnL (PnL source is PolyNode on-chain aggregates). Per-agent wallets can break silently when Polymarket adds a spender (H, wallets.md warning).

## 9. Geo, ToS, automation

- Automation is the product: API keys, SDK, MCP, skills. No rule against bots found.
- ToS / jurisdiction text: NOT FOUND (searched: simmer.markets/terms is an SPA shell with no text for curl or WebFetch, the JS bundle, docs llms-full.txt, FAQ, support; WebSearch unavailable). Docs only say "Polymarket's own geo-restrictions apply to creating and funding accounts there" and that a Polymarket wallet-level restriction is Polymarket's, not Simmer's (H, faq.md, llms-full.txt).
- Flag: `POST /api/sdk/wallet/credentials/derive-via-proxy` is described as "Forward locally-signed Polymarket L1 auth headers from a non-blocked IP" (H), i.e. Simmer will proxy CLOB credential derivation from IPs not blocked by Polymarket. That is a compliance risk for anyone relying on it from a restricted jurisdiction. Kalshi buys need DFlow Proof KYC (H).
- Public trades show `reasoning` text; the platform "expects" it and displays it publicly (skill.md). An aggregator trading through Simmer would leak strategy text unless it omits `reasoning`.

## 10. Liquidity (H unless noted)

- No pool of its own for real money. Order flow lands on the Polymarket CLOB and Kalshi/DFlow, so depth is theirs.
- Simmer's own Polymarket footprint, from Polymarket's public builder leaderboard (`GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=...`, fetched 2026-10-19, builder "Simmer.Markets", verified: true; fixtures/simmer/polymarket_builder_leaderboard_simmer.json):

| Window | Builder-attributed volume | Active users | Rank |
| --- | --- | --- | --- |
| DAY | $183 | 6 | 79 |
| WEEK | $1,760 | 14 | 112 |
| MONTH | $27,246 | 25 | 128 |
| ALL | $8,596,584 | 1,478 | 70 |

  Top builder for MONTH shows about $78M for comparison. Caveat: only orders carrying Simmer's builder code count; external-wallet SDK installs older than 0.20.0 (2026-06-16) and users who set `ZERO_BYTES32` are not counted, and Simmer says external operators were "roughly half of all SDK volume" before that release (changelog, M). Pattern is a steep decline from peak.
- The `volume_24h` field in Simmer rows is the underlying venue's 24h volume, not Simmer's (OpenAPI: "24-hour trading volume on the underlying venue"). Example: "Cowboys vs. Packers" showed $3.31M, which is Polymarket's number (H, sample).
- Kalshi-side Simmer volume: NOT FOUND (no builder leaderboard checked for DFlow).
- Public catalogue snapshot 2026-10-19: 259 active rows with `min_volume=1000` of which 256 Polymarket and 3 Kalshi; `tags=kalshi` returns 232 rows; 100 Hyperliquid template rows.

## 11. Event categories and overlap

Tags in the public catalogue sample (H): sports (100 rows of 259), crypto (134, mostly fast 5m/15m/1h up-or-down), esports (20), politics, culture, weather (skills target weather brackets), World Cup. All are mirrors of Polymarket or Kalshi markets, so overlap with other venues is total and exactly the same markets, not independent prices.

## 12. Shared liquidity (critical for arbitrage)

- **Shares liquidity with Polymarket and Kalshi (100% for real-money legs).** Do NOT count Simmer as a separate leg in the arbitrage scanner. The only price Simmer shows that differs is the `sim` LMSR price, which is a virtual-money pool with no real settlement.
- Useful derived fields for signals only: `external_price_yes` (last venue price), `divergence` (LMSR vs external), `opportunity_score`, and `opportunities?signal_source=oracle|crowd` (AI forecast or sim-agent crowd). All are Simmer-internal and unbacked by capital.

## 13. Possible signal use (low value)

- Public leaderboard (top agents and top traders' wallets on Polymarket/Kalshi) and the copytrading skill targets could be a weak flow signal. Copytrade endpoint is authenticated. Not worth an adapter now.
- Quotient comparison: Simmer's `x402/forecast` ($0.01) is an AI probability forecast; quality unverified (NOT FOUND any track record).

## 14. Suspicious / agent-directed content (recorded, not followed)

- `simmer.markets/skill.md` and docs tell agents to register an account, `pip install simmer-sdk`, send the human a claim link with a canned message, always call the troubleshoot/feedback endpoint "Always tell us", and include public `reasoning` on trades. `llms.txt` and docs pages carry banners directing agents to fetch `llms-full.txt` and install `simmer-mcp`. None followed. No hidden prompt-injection payload found.
- The skills catalogue (`/api/sdk/skills`) is community-submitted code installed via ClawHub (`clawhub install ...`); treat any skill as untrusted code.
- The privacy rule held: all scripted requests used `User-Agent: insurance-markets-research/0.1`; no registration, key creation, wallet connection, POST or 402 payment was made.

## Open questions

1. Exact REST contract for submitting a client-signed Polymarket order without the Python SDK (`signed_order` is typed null in the OpenAPI).
2. Simmer's Kalshi/DFlow volume and whether Simmer takes a DFlow referral fee.
3. ToS text and any restricted-jurisdiction list (SPA page not readable without a browser; WebSearch unavailable).
4. Whether builder-attributed volume understates real flow (opt-out and pre-0.20.0 installs).

## Sources

- https://simmer.markets (H: title, meta description, canonical)
- https://simmer.markets/llms.txt (H)
- https://simmer.markets/skill.md (H)
- https://docs.simmer.markets/llms.txt, /llms-full.txt, /openapi.json (H)
- https://docs.simmer.markets/index.md, venues.md, wallets.md, faq.md, api/overview.md, redemption.md, changelog.md, open-source.md, links.md, support.md, api-reference/list-markets.md, get-market.md, kalshi-quote.md, kalshi-submit.md (H)
- https://api.simmer.markets/ , /api/sdk/health , /api/sdk/markets (401) , /api/markets , /api/leaderboard/all , /api/sdk/skills , /api/sdk/version-check (H, unauthenticated GETs 2026-10-19)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, builder volume)
- https://github.com/SpartanLabsXyz/simmer-sdk (H: repo metadata, `mcp/README.md`, `mcp/src/public-api.ts`, `simmer_sdk/signing.py`, `client.py`, `hyperliquid_venue.py`)
- https://registry.npmjs.org/simmer-mcp (H: version 3.5.9, MIT, modified 2026-09-30)
- docs/research/14-platform-of-platforms.md and docs/research/06-paybox-platform.md in this repo (M, prior project research)
- Fixtures: docs/research/fixtures/simmer/ (health.json, sdk_markets_401.json, public_markets_sample.json, leaderboard_all_shape.json, polymarket_builder_leaderboard_simmer.json, openapi_paths.json)
