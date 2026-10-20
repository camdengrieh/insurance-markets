# WaterX Predict - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.
Note: WebSearch was unavailable (session search budget used up), so discovery relied on first-party site, docs, GitHub org and public GETs only.

## Verdict

- **adapter_priority: skip.** WaterX Predict is a Sui-side **broker over Polymarket**, not an independent venue. Its catalog, volume figures and prices are Polymarket's, quoted with a wider spread. As an arbitrage leg it is strictly dominated by Polymarket itself. It adds no independent signal. Do not build an adapter; if the aggregator ever wants a "WaterX" row, map it as an alias of Polymarket liquidity.
- Still live on 2026-10-19 (H), labelled **Beta** in the app.
- The official Agent trading API exists in an SDK repo but is **switched off on production** (H, observed today).

## 1. Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| Operator | Water Labs Ltd. (Cayman Islands) per Terms of Service, last updated 2026-06-15 | H |
| Product | AI-native trading platform on Sui: perps (crypto + xStock), WLP liquidity pool, and "Predict" (swipe-feed prediction markets, Beta) | H |
| Launch | Decrypt/Chainwire sponsored release: Predict live on Sui, dateline 2026-07-10, body says 2026-07-14; World Cup tie-in; zkLogin (Google sign-in), Gift Links | H (press release only, sponsored) |
| Backing | Sui Foundation Moonshots, Mysten Labs (press release claim) | M |
| Live check | `GET https://api.waterx.app/predict/browse` returned 400+ live markets on 2026-10-19; Fed October 2026 meeting markets, sport fixtures dated 2026-10-19..25 | H |
| Repo activity | `WaterXProtocol/waterx-predict-agent` pushed 2026-10-08, `waterx-config` pushed 2026-10-13, `waterx-sdk` 2026-10-08 | H |
| Predict Festival | Daily-chest campaign ran until 2026-08-07 (ended); "up to 10% of festival prediction volume as rewards" | H |

## 2. What it actually is: a Polymarket broker (key finding)

Evidence, strongest first:

1. **Volume match to the cent.** WaterX `volumeUsd` for `fed-2026-10-no-change` is `13610379.748157` and for `fed-2026-10-25-bps-increase` is `10346387.428465`; Polymarket gamma `volumeNum` for the corresponding October 2026 FOMC markets is identical to all 6 decimals (H, both fetched 2026-10-19; see `fixtures/waterx-predict/polymarket-crosscheck.json`). So the `volumeUsd` shown on WaterX is **Polymarket's lifetime volume, not WaterX volume**. Do not use it as WaterX liquidity.
2. **Catalog is Polymarket's.** Market descriptions are Polymarket's rules text verbatim, event images are hosted on `polymarket-upload.s3.us-east-2.amazonaws.com`, sport slugs follow Polymarket's pattern (`sport-ucl-psg-fcb-2026-10-20`) (H).
3. **Contract docs say so.** The generated Move bindings for the audited `waterx_prediction` package (in `WaterXProtocol/waterx-sdk`) document: "Filled positions with active Polymarket exposure", "Keeper reports the Polymarket fill back to chain", "Keeper-initiated cancel. Used when Polymarket couldn't fill at all", "Keeper reports the Polymarket sell back to chain", "Active YES-side exposure still open in broker custody" (H).
4. **Price relationship.** Same minute on 2026-10-19: Polymarket CLOB top of book for "no change" YES was 0.87 bid / 0.88 ask; WaterX showed 86.4 / 88.5 cents. For "+25 bps" YES Polymarket was 0.12 / 0.13, WaterX 11.5 / 13.6. WaterX ask is about 0.5 to 0.6 cents above Polymarket's ask and its bid about 0.5 to 0.6 cents below (H, observed; one snapshot, Polymarket tick is 0.01 so precision is limited). WaterX's own docs for the Agent API say the fee is "embedded in the price" (H).

Consequences for the aggregator:
- **Not an independent leg.** `liquidity_shared_with: Polymarket (global)`. The order is placed on Sui, a centralized keeper executes it on Polymarket's book and reports the fill back. Depth is Polymarket's depth; price is Polymarket's price plus a broker markup.
- Counterparty risk is **WaterX keeper + WaterX settlement pool** (`MarketRegistry<T>` holds one shared settlement balance per coin type; admin can `admin_withdraw` above a `min_reserve` floor "to realise spread/profit"), on top of Polymarket's own risk (H for the Move doc comments).
- WaterX also exposes **price-settled** crypto markets (`set_price_settlement` + `resolve_with_oracle`, threshold/comparison pre-committed, resolved from an on-chain oracle snapshot). Whether these are mirrored Polymarket threshold markets or WaterX-originated is NOT FOUND; the slugs (`btc-dip-45000-y-2026`) and volumes suggest mirrored (M).

## 3. Market model

- Binary YES/NO legs per on-chain market id (`0x` + 64 hex). The browse catalog types seen: `prediction-binary` (296 of the first 400), `crypto-threshold` (72), `prediction-numeric` (20), `sport-match` (8, 2- or 3-way: `teamA/teamB/draw`), `crypto-updown` (3), `politics-binary` (1) (H, 2026-10-19). Multi-outcome and numeric boards appear to be decomposed into one binary market per bracket/side (M).
- **Not an order book and not an AMM on WaterX's side.** The user places a price-capped market order on-chain (`max_spend`, `min_shares`, `price_cap` in bps of $1, `expiry_ts`). It sits as a pending order until a keeper fills it on Polymarket and calls `fill_order`, or cancels and refunds (H, Move bindings + Agent API docs: "two-stage broker model, a keeper fills asynchronously").
- **Outcome tokenisation:** none in the ERC-1155 sense. A filled order becomes a `Position` record inside the registry, owned by a WaterX account (Sui object). Positions can be split or transferred between WaterX accounts (also how "Gift Links" work). Shares are IOUs on the broker, not transferable outcome tokens (H for functions, M for the interpretation).
- Order sizing: BUY from 1 wxUSD accepted, but the keeper does not fill below its minimum, 2 wxUSD by default, so smaller orders are placed then cancelled (H, AGENT_INSTRUCTIONS.md).
- Limit orders: none server-side. The SDK offers a client-side `waitForPriceAndExecute` synthetic limit (H).
- Quotes are top-of-book only, `availableSize` null, liquidity tier `C`, ~3 s lifetime; a large order may fail to fill and arrive later as CANCELLED (H).

## 4. Chains and collateral

- Execution/settlement chain: **Sui mainnet** (Move package `waterx_prediction`, published_at `0x024195702f3f4ea69d93dc3fadd60394b7d9de2247b539e8aee82266ca878ae8`, version 8, per `waterx-config/mainnet.json`) (H). Also `waterx_prediction_gift` for Gift Links.
- Collateral: unified **WaterX USD ("wxUSD")**, a Sui coin minted 1:1 on deposit and burned 1:1 on withdrawal through a Peg Stability Module. Docs list "Prediction Market settlement" as one use of this balance. Registries exist for USD, SUI, DEEP and WAL settlement coin types (H).
- Deposits: Sui USDC/USDsui (live); Ethereum and Arbitrum USDC/USDT (live, via Wormhole Core Bridge messaging and a per-chain `deposit_vault`); Base, BSC, Polygon, Optimism "coming soon"; Solana/TRON planned (docs). `waterx-config/mainnet.json` already lists vaults for Ethereum, Arbitrum, Polygon and BSC, so docs and config disagree on Polygon/BSC (H, flagged).
- Withdrawals: **to Sui only** (USDC/USDsui), 0.1% withdraw fee, $10 minimum, rolling 24h caps with "protocol review" above the cap; cross-chain withdrawal "coming soon" (H).
- Deposit minimum $10, deposit fee $0 (H). Gas sponsored by WaterX (Enoki) on Sui (H).
- Scale: DefiLlama lists WaterX (id 7993, category Derivatives, chain Sui) with TVL **$464,442 on 2026-10-19**, peak $674,410 on 2026-07-25, first reading $637,248 on 2026-06-25. This is the custody-vault reserve for the whole protocol (perps + WLP + predict), not Predict alone (H, `api.llama.fi/protocol/waterx`). DefiLlama's derivatives volume summary returned HTTP 402 ("Upgrade to the paid API plan"); not pursued.

## 5. Read API

Two surfaces, one official and gated, one public-but-undocumented.

### 5a. Public web-app routes (no auth, works today)

- Base: `https://api.waterx.app`. No official docs. The routes are transcribed in the official `waterx-predict-agent` repo as "the public WaterX routes direct mode speaks", with the caveat "the backend publishes no contract file for these routes; they are the web app's" (H). Treat shapes as unstable.
- `GET /predict/browse?limit<=50&q=<text>&cursor=<opaque>`: envelope `{success, data:{items[], nextCursor}}`. Item kinds: `market` (with `market{id,slug,type,category,subCategory,display{question,description,...},eventId,eventImageUrl}` and `nextRound{id,marketId,startsAt,endsAt,phase,volumeUsd,sides[{key,trade:{marketId(0x..),selection}}]}`) and `hub` (event grouping, follow with `GET /predict/events/:slug`). Price fields in `sides` were null in browse; prices come from `/quotes`. Observed 400+ markets over 8 pages of 50 (H, `fixtures/waterx-predict/browse-sample.json`). The response is CDN-cached: `cache-control: public, s-maxage=1200` (up to 20 min stale) (H).
- `GET /predict/quotes?rounds=<roundId,...>` (ask), `/predict/quotes/bid`, `/predict/quotes/no`: `{success, data:{<roundId>:{<sideKey>:cents|null}}}`, cents to one decimal, up to 100 round ids per call. `cf-cache-status: DYNAMIC` (H, `fixtures/waterx-predict/quotes-sample.json`). Side keys are `up/down` for binary, `teamA/teamB/draw` for sport.
- Per-account history: `GET /predict/bets/me`, `/predict/bets/me/activity` (the SDK says `address` is the owner wallet). Not exercised (M).
- Rate limits: response headers `x-ratelimit-limit-short/medium/long` = 10 per 1 s / 120 per 60 s / 1000 per 3600 s on `/predict/browse`, and 30 / 600 / 10000 on `/predict/quotes` (H, observed). Access-control-allow-origin is `*`.
- WebSocket: none on the public routes (NOT FOUND).
- Resolution/outcome read: no dedicated public endpoint found. Round `phase` values seen: `open`, `live`, `scheduled`; the contract adds `CLOSED`, `RESOLVED` statuses. On-chain, `is_market_resolved`/`market_outcome` views exist (H).

### 5b. Official Predict Agent Trading API (authenticated, off on mainnet)

- Docs: README and AGENT_INSTRUCTIONS in `https://github.com/WaterXProtocol/waterx-predict-agent` (MIT, created 2026-08-21, pushed 2026-10-08), SDK `@waterx/predict-agent-sdk` v0.1.0 "pre-release", wire contract vendored at `packages/sdk/src/contract.ts` (H). Not on docs.waterx.app: the GitBook has no Predict section (NOT FOUND).
- Base URLs: production `https://api.waterx.app`, testnet `https://api-testnet.waterx.app`; routes under `/agent-api/v1/predict/`: `markets`, `markets/:id`, `quotes`, `executions` (+ `/:id/submit`, `/:id`), `accounts`, `accounts/:id/{allowance,effective-limits,positions,fills,performance,executions}` (H).
- Auth: sign a personal message `Sign in to Bucket Agent\nWallet: <addr>\nTimestamp: <ms>` with a Sui key (5 min validity) to obtain a bearer token. An owner must grant the agent wallet an on-chain delegation and a risk profile in one signature at the web console (H).
- Streams: Socket.IO on private namespace `/agent-api/v1/predict` for quotes (snapshot plus change-only updates, ~2 s upstream polling, 60 subscribe messages per minute) and executions (H).
- **Production state, observed 2026-10-19:** `GET https://api.waterx.app/agent-api/v1/predict/markets?limit=1` with no auth returned HTTP 500 `{"error":{"code":"RECONCILIATION_REQUIRED","message":"The Predict Agent API is not configured on this deployment","retryable":false}}` (H, `fixtures/waterx-predict/agent-api-unconfigured.json`). The repo's own backlog (item 3.12) records the same on 2026-09-16: deployed but switched off. The SDK README also says the API is "gated off by default on the server side". So no usable authenticated read API on mainnet today.
- Docs staleness: README says "nothing has been published" (no npm release) as of the 2026-10-08 push (H).

## 6. Trade path

- Official: Agent API create quote -> create execution (server builds a sponsored Sui PTB) -> agent signs bytes (Ed25519 Sui key) -> submit -> keeper fills -> terminal status. Idempotency key required. "Direct mode" in the same SDK uses the public routes `predict/bets/place`, `predict/bets/sell`, `sponsor/execute`, with an agent wallet as on-chain delegate of the owner account (H).
- Alternative: build the Move call `waterx_prediction::place_order` directly with the `@waterx/sdk` (H, source read, not run).
- Everything needs a **Sui keypair** and a WaterX trading account (a Sui object owned by a Sui address or zkLogin identity). No EVM-signed order path exists (H by absence in docs and SDK).
- Resolved positions must be claimed in the web app; the Agent API cannot claim (H, instruction rule `A_RESOLVED_POSITION_IS_NOT_YOURS_TO_COLLECT`).

## 7. PayBox reachability: no

- PayBox chain catalog search for "sui" returned zero chains and no WaterX plugin exists (`discover_plugins`, `discover_tokens mode=chains`, 2026-10-19) (H).
- An EVM wallet can only do the **funding half**: send USDC/USDT on Ethereum or Arbitrum through the WaterX multi-chain deposit flow (a Wormhole-backed vault deposit that must name a Sui account; the vault ABI is not documented in the docs I read, NOT FOUND). Trading, claiming and withdrawing need Sui signatures, and withdrawal returns funds **only on Sui**. A round trip from an EVM wallet is therefore not possible. Docs warn that sending directly to the account address from another chain loses funds.
- Net: not worth wiring. The same exposure is reachable directly on Polymarket.

## 8. Fees

- Prediction trades: **no explicit fee line**. The Agent API contract states `feeAmount` is null "when fees are already embedded in `expectedPrice`" and `actualFee` is "always null today... the broker's published price is already fee-adjusted" (H). Measured markup is about 0.5 to 0.6 cents per share per side versus Polymarket's top of book (H, one snapshot; see section 2). A round trip therefore costs roughly 1 to 1.2 cents per share more than Polymarket's own spread.
- Deposit 0%, withdrawal 0.1% (docs, H). Gas sponsored (H). Perp fee tables (0.03 to 0.10%) on docs.waterx.app do not apply to Predict (H, docs fees page is perps only).
- No on-chain fee field in `waterx_prediction` bindings; the admin "realises spread/profit" from the registry (H).

## 9. Resolution and dispute risk

- Predict outcomes: a **keeper** calls `resolve_market(market_id, outcome)` ("Keeper records the market outcome") (H). The upstream truth is presumably Polymarket's UMA-based resolution, mirrored by the keeper (M; no doc states it). Payout via `claim` (owner) or `force_claim` (keeper batch, gas-sponsored). Admin can `pause_market` for new opens.
- Price-settled markets: admin pre-commits ticker, timestamp, threshold and comparison; keeper triggers `resolve_with_oracle` from an on-chain oracle snapshot (Pyth Lazer / Supra / WaterX rule), and "cannot influence the result beyond triggering it" (H for the doc comment).
- Dispute risk is layered: Polymarket/UMA dispute risk, plus keeper discretion and mirroring lag, plus admin pause. No on-chain dispute path for WaterX users was found (NOT FOUND). Settlement pool solvency is WaterX's.
- Audits: Adevar Labs (report 2026-06-03, scope includes `waterx_prediction`), MoveBit (2026-04-19, scope `waterx-contract`, `waterx-sdk-contract`) per docs.waterx.app/risk-and-security/security (H, PDFs not read). Contract design stated as based on "Typus Perps v2".

## 10. Geo, ToS, automation

- Terms (2026-06-15): services "not available to individuals or entities residing in, citizens of, incorporated in, or having a registered office in the United States of America or any Restricted Territory"; VPN use to get around it is prohibited (H, quoted sparingly).
- Automation: the Terms prohibit accessing or searching the Services "using any automated tool, including spiders, robots, crawlers, or data mining tools" (H). That conflicts with scraping the web app routes, yet WaterX itself ships an agent SDK/CLI, so the position on authenticated agent trading is ambiguous (M). No written automation policy for the public routes (NOT FOUND). `robots.txt` on waterx.app disallows `/api/` for the Next.js app; `api.waterx.app` serves no robots.txt (404) (H).
- Oddity worth knowing: the Terms text describes a perpetuals protocol and still contains template clauses about "Box Options", USDM and RedStone (Panama arbitration, Cayman operator). It never mentions prediction markets or Polymarket (H, text search). Legal coverage of Predict is unclear.

## 11. Liquidity

- Native WaterX liquidity: protocol TVL $464k (DefiLlama, 2026-10-19, whole protocol). No Predict-specific volume, OI or user count found (NOT FOUND). Press release gives none.
- Catalog depth shown is Polymarket's: 400+ markets; the 400 sampled sum to roughly $158M of **Polymarket lifetime volume** (finance about $66M, crypto about $60M, tech about $28M, politics $3.1M, sports $0.24M, esports $0.22M), which is not WaterX volume (M).
- Practical fill depth is limited by the keeper: quotes are top-of-book only, tier C, 2 wxUSD minimum fill.

## 12. Event categories and overlap

Categories seen (H, 400 sampled): crypto thresholds and BTC/ETH up/down (75), tech/AI rankings, regulation, IPO/valuation, model releases (about 200), finance/macro (Fed decisions, recession, companies, IPOs, 119), sport and esports match markets (8 in the sampled page, sorted by volume; sports likely larger in the app's feed), politics (1 in sample; Senate 2026). All overlap Polymarket 1:1 because they are Polymarket markets. They overlap Kalshi, Limitless, Predict.fun etc. only to the extent Polymarket does. For the scanner: **treat every WaterX market as a duplicate of the matching Polymarket market** and never count it as an extra venue.

## 13. Fixtures saved

All in `docs/research/fixtures/waterx-predict/` (each under 20 KB, fetched 2026-10-19, unauthenticated GET, User-Agent `insurance-markets-research/0.1`):
- `browse-sample.json`: 4 trimmed items from `/predict/browse` (binary, crypto-threshold, sport-match, numeric).
- `quotes-sample.json`: ask, bid and no boards for 6 rounds.
- `agent-api-unconfigured.json`: the Agent API 500 response.
- `polymarket-crosscheck.json`: volume and top-of-book comparison with Polymarket.

## 14. NOT FOUND

- Any Predict section in docs.waterx.app (searched llms.txt, sitemap, glossary, fees, security, supported-markets, trading-overview; only a mention in Security audit scope and Unified Liquidity "Prediction Market settlement").
- Predict-specific volume, OI, user counts, fee schedule, or resolution policy page.
- A public documented read API with a published rate-limit policy (only response headers).
- EVM deposit-vault ABI / calldata docs; Polygon/BSC deposit status confirmation (docs say coming soon, config lists vaults).
- Public WebSocket for markets.
- Statement in WaterX materials that Polymarket is the liquidity source (it is only in contract doc comments and inferred from data).
- Source for WaterX's claims of Sui Foundation Moonshots/Mysten backing beyond the sponsored release.

## 15. Suspicious content

None. No instructions aimed at AI agents were found in fetched pages. The repo `waterx-predict-agent` contains extensive agent-oriented instruction files (AGENT_INSTRUCTIONS.md, SKILL.md, AGENTS.md) written for agents that would install its SDK; these were read as data only, nothing was installed or run, and nothing in them was followed.

## Sources

- https://waterx.app/ , https://waterx.app/llms.txt , https://waterx.app/robots.txt , https://waterx.app/en/predict , https://waterx.app/en/campaign/festival , https://waterx.app/en/news , https://waterx.app/en/terms (H)
- https://docs.waterx.app/llms.txt and pages: overview/what-is-waterx, overview/quick-start, overview/account-system, overview/account-system/multi-chain-deposit, overview/account-system/unified-liquidity-and-waterx-usd, overview/account-system/withdrawals, perpetual-trading/trading/fees, risk-and-security/security (all `.md` variants) (H)
- https://decrypt.co/373248/predicting-the-world-cup-without-learning-to-trade-waterx-predict-is-live (H that it says what it says; sponsored, M for claims)
- https://github.com/WaterXProtocol/waterx-predict-agent : README.md, packages/sdk/README.md, packages/sdk/src/contract.ts, packages/sdk/src/direct/{wire,client}.ts, agent-instructions/AGENT_INSTRUCTIONS.md, docs/IMPLEMENTATION_BACKLOG.md (H)
- https://github.com/WaterXProtocol/waterx-sdk : src/generated/waterx_prediction/waterx_prediction.ts, test/prediction/helpers/*.ts (H)
- https://github.com/WaterXProtocol/waterx-config : mainnet.json (H)
- https://api.waterx.app/predict/browse , /predict/quotes , /predict/quotes/bid , /predict/quotes/no , /agent-api/v1/predict/markets (H, 2026-10-19)
- https://api.llama.fi/protocol/waterx (H, 2026-10-19); https://api.llama.fi/summary/derivatives/waterx returned HTTP 402 and was not pursued
- https://gamma-api.polymarket.com/public-search and https://clob.polymarket.com/book (public GETs, used only for the cross-check, 2026-10-19)
- PayBox `discover_plugins` / `discover_tokens` read-only catalog checks (2026-10-19)
