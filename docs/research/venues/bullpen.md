# Bullpen (bullpen.fi) - adapter spec

Researched 2026-10-19. READ-ONLY: official docs/pages, public `gh api` file reads, unauthenticated GETs to documented or published public hosts (docs.bullpen.fi, usergate.bullpen.fi, api.llama.fi, data-api.polymarket.com, registry.npmjs.org). No account, no CLI install, no wallet, no key, nothing signed, no POST/PUT/DELETE. `app.bullpen.fi` answered 429 to a plain GET and was not retried. WebSearch budget ran out after one query, so third-party coverage is thin.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred/derived; **L** = weak or stale (>6 months).
All third-party text (docs, CLI bundle, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/bullpen/` (6 files, each < 10 KB).

## 0. Verdict

**adapter_priority: skip** (as a venue/arbitrage leg). Optional later: P2 as a smart-money signal source, see section 9.

1. Live (H, section 1), but it is **not a venue**. It is a non-custodial front end that routes every prediction-market order into **Polymarket's CLOB** (H). Same markets, same tokens, same prices, same resolution. Quoting Bullpen as an arbitrage leg would double-count Polymarket.
2. Its Polymarket flow is small and shrinking: builder-attributed volume peaked at about $17.9M in Apr 2026 and was about $0.97M in Sep 2026 and $0.61M for 2026-10-01..10-18 (M, section 10). Rank 55 among ~329 Polymarket builders.
3. No public market-data API. The only public Bullpen-hosted endpoint is a Solana wallet-membership lookup. A gRPC data-service proto is published but no hosted endpoint is documented (H, section 4).
4. Trading is only through Bullpen's own login session or CLI (Turnkey-held embedded wallet). A PayBox wallet cannot sign Bullpen orders, and linking an external wallet "does not enable trading from that wallet" (H). To trade this liquidity, go to Polymarket directly.
5. ToS forbid scraping, reverse engineering and reselling the Functionality (H, section 8), so the smart-money layer is not freely re-usable.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Terms of Service | "Last Revised: October 9, 2026", operator Bullpen Labs, Inc. (https://bullpen.fi/terms) | H |
| CLI docs bundle | `Generated: 2026-10-07` (https://cli.bullpen.fi/llm.txt, 3.3 MB); changelog says latest published release v0.1.118, v0.1.119 unreleased | H |
| npm `@bullpenfi/cli` | `latest` = 0.1.118, published 2026-10-07 (registry.npmjs.org) | H |
| GitHub `BullpenFi/bullpen-cli-releases` | created 2026-02-18, latest release v0.1.118 tagged 2026-09-10 | H |
| Polymarket builder API | Bullpen row present for every day through 2026-10-18 (27 active users, $19.3K that day) | H |
| DefiLlama | `bullpen-prediction-markets` (id 7854), category `Interface`, tag `Polymarket Builder`, volume chart to 2026-10-17, fees chart to 2026-10-18; no dead/deprecated flag | H |
| Site `https://bullpen.fi` | 200, "Trade Now" -> app.bullpen.fi | H |
| `https://app.bullpen.fi` | 429 to curl (Cloudflare-style rate limit/bot gate); app itself not inspected | H |

Trend: usage is decaying (section 10), but the product is actively maintained.

## 2. What it is

- **Kind**: broker/front end (aggregated terminal). Prediction markets = Polymarket only. Perps = Hyperliquid. Spot = Hyperliquid spot (via "UNIT") and Jupiter Ultra (Solana). Co-founded by Ansem; built by a team with Hyperliquid/Galaxy/Deribit/Paxos/Kraken experience (https://docs.bullpen.fi/about-bullpen/what-is-bullpen.md) (H).
- **Polymarket builder identity**: builder name `Bullpen`, builderCode `0x2a80e1ef1d7842f27f2e6be0972bb708b9a135c38860dbe73c27c3486c34f4de` (DefiLlama adapter `factory/polymarket.ts`; same code appears in Polymarket's own `/v1/builders/volume`) (H).
- **Extras**: smart-money discovery, convergence signals, whale/trade feeds, wallet tracking, copy trading with auto-execution, alerts, leaderboards, bracket contests, CLI with Claude Code/Codex "skills" (H, docs).
- **Docs say nothing about Kalshi or any other prediction venue**: 0 hits for "kalshi" in the 3.3 MB CLI bundle and none in docs/homepage. No Hyperliquid HIP-4 outcome markets either (0 hits for HIP-4). NOT FOUND (searched: homepage, docs llms.txt, CLI bundle; the web search that would have caught a recent announcement was unavailable).
- No token directly involved in prediction trading. `$BULL` points program and a campaign token ($ANSEM) exist for rewards only (H, docs).

## 3. Market model, chains, collateral

Everything below is Polymarket's model, as documented by Bullpen (H: https://docs.bullpen.fi/prediction-markets/polymarket-integration.md, .../positions-and-settlement.md, .../order-types.md).

- Binary Yes/No; each outcome is an ERC-1155 token on the Gnosis Conditional Token Framework; Yes+No = $1.
- Multi-outcome = set of binaries via the NegRiskAdapter (one winner).
- Hybrid-decentralized CLOB (off-chain matching, on-chain settlement on Polygon), price-time priority, prices 0.01-0.99, order types GTC/GTD/FOK (CLI also `fak`, `--post-only`). Market orders are marketable limit orders.
- Sports: resting orders are cancelled at game start (H, same page).
- Market identifiers: Polymarket slugs and full Polymarket URLs are accepted by the CLI (H, markets-and-trading.md), so ID mapping to the Polymarket adapter is identity (conditionId/tokenId unchanged; M, inferred from "execute through Polymarket's CLOB" - not shown as a field in any response I could read).
- **Chain**: Polygon for prediction markets. Account structure: separate Polymarket / HL Perps / HL Spot / Solana Spot balances (H, account-types.md).
- **Collateral: docs disagree.** Web docs (`wallets-and-collateral.md`, `funding-your-wallet.md`) say USDC.e `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`. CLI docs generated 2026-10-07 say Polymarket V2 markets settle in **pUSD** (USDC-backed wrapper) with `wrap`/`unwrap` commands and "Deposit Wallet" accounts alongside legacy Safe/Proxy accounts (H, CLI bundle). Treat the web docs as stale (M). The CLI changelog also says "Polymarket Protocol V2 was announced on October 5, 2026 ... new markets are expected to move to it around early November" and that v0.1.118/0.1.119 do not support trading on it (H, CLI bundle changelog). Relevant to the Polymarket adapter, not a Bullpen-specific item.
- Funding: crypto transfers from Ethereum/Arbitrum/Base etc., card/Apple Pay/ACH via fun.xyz (docs) or Unifold (ToS, Oct 2026) (H).

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public market-data REST/WebSocket | **NOT FOUND** (searched: docs.bullpen.fi llms.txt incl. all 60+ pages listed, CLI llm bundle for hostnames, GitHub org BullpenFi). Docs "Developers" section contains only the Wallet Status API. | H |
| `GET https://usergate.bullpen.fi/api/wallet/bullpen-status?address=<solana addr>` | Public, no auth; returns `{isBullpenWallet, holdsAnsem, holdsAnsemStatus}`; Solana addresses only (0x -> 400); ~10 req/s/IP burst 20, shared with other public endpoints, no per-partner key (docs). Confirmed 200 JSON on 2026-10-19. Useless for markets/prices. Fixture `usergate_wallet_status_sample.json` | H |
| Bullpen Data gRPC services | Proto + generated TS/Python/Go clients published at `github.com/BullpenFi/bullpen-data-proto` (last push 2026-04-08): `PolymarketExploreService` (QueryMarkets, GetMarketStrength, `GetSmartMoneySignals`, `GetWalletTaxonomy`, `GetPnlLeaderboard`, `StreamMarketPrices`...), `PolymarketTradeInfoService` (orderbooks, `StreamOrderbook`, spreads, holders), `PolymarketAccountService` (incl. `CreateApiKey`, JWT required), `PolymarketTradeService` (PlaceOrder/CancelOrder; "All RPCs require authentication (JWT or API key)"). README examples use `localhost:50051`; **no public hostname, no docs, no rate limits documented**. Fixture `bullpen_data_proto_rpc_list.txt` | H (proto), NOT FOUND (endpoint) |
| Bullpen CLI (`bullpen polymarket discover/price/trades/holders/price-history`, `data smart-money`, `feed trades`; `--output json` on every read command) | Official, closed-source binary (Homebrew, npm `@bullpenfi/cli`, curl installer; source repo `BullpenFi/bullpen-cli` returns 404 via the GitHub API, i.e. not public). Needs a Bullpen login (device-code flow). Whether read-only commands work logged-out: NOT FOUND (not installed, per rules). Marked Alpha/Beta (changelog says Alpha, overview says Beta). | H |
| Web app browse ("Trending markets ... no login required to browse") | Roadmap statement only; the web app's own private API was not probed (ToS: no reverse engineering/scraping). | H/M |
| Polymarket data under it | Everything Bullpen shows for prediction markets is Polymarket data. Read it from Polymarket directly. Polymarket's public builder endpoints expose Bullpen-attributed volume: `https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY|WEEK|MONTH|ALL` (unauthenticated GET 200 on 2026-10-19; **Data API v1 retires 2026-10-24**, successor `/v2/builders/volume`, rows in shares) and `https://clob.polymarket.com/builder/trades?builder_code=<code>` (used by DefiLlama; not called by me). Fixture `polymarket_builders_volume_bullpen_extract.json` | H |

Websocket: none public for Bullpen itself (gRPC streams exist in proto only). Rate limits: only the Wallet Status figure above; all else NOT FOUND.

## 5. Trade path

- **Only supported programmatic path = Bullpen CLI** (`bullpen polymarket buy|sell|limit-buy|limit-sell|orders --cancel|redeem|approve`, `--preview`, `--yes`, `--non-interactive`, `--output json`, `--wallet 0x...` to pin a wallet) and AI-agent skills (`bullpen skill install`) (H, https://docs.bullpen.fi/bullpen-cli/markets-and-trading.md, .../ai-agent-skills.md).
- **Auth/signing**: browser device-code login (RFC 8628); credentials stored encrypted under `~/.bullpen`; the embedded wallet key lives in **Turnkey** and "Polymarket buy/sell/limit commands submit through Bullpen with your authenticated session"; no separate trading API keys for ordinary orders (H, CLI bundle `authentication.md`). Order JSON includes `signature_requested`, `exchange_request_submitted`, `order_id`, `status`, `transaction_hashes`.
- **Headless**: bots must copy the encrypted credential set from a workstation; "A scoped service-account/headless auth surface is still planned" (H, CLI bundle `headless-bot-setup.md`). A hosted API key exists only as a proto RPC (`CreateApiKey`), not in user docs.
- Order flow to Polymarket: EIP-712 order signed by the Bullpen-managed wallet, sent to Polymarket's CLOB operator (H, order-types.md). Wallet kinds: Safe/Proxy (legacy; CLI changelog says money-moving writes on legacy Proxy wallets now refuse before signing) and Deposit Wallet (H).
- Bullpen is a thin layer: there is no benefit for an aggregator in routing via Bullpen vs. posting signed orders to Polymarket directly, except attribution/fees to Bullpen.

## 6. PayBox reachability

**paybox_reachable: no** (for trading). Reasons (H):
- Orders are signed by a Turnkey wallet under Bullpen's session policy; PayBox cannot supply signatures to Bullpen. Linked external wallets (Phantom, MetaMask, Coinbase, WalletConnect/Reown) are for recovery/login only: "Linking a wallet does not enable trading from that wallet" (https://docs.bullpen.fi/getting-started/wallet-management.md).
- Importing a PayBox wallet requires a private key or seed phrase, which PayBox does not expose (non-custodial) (M).
- A PayBox EVM wallet could only **fund** a Bullpen wallet by sending tokens to its deposit address (Ethereum/Arbitrum/Base/Polygon, etc.), after which Bullpen, not the agent, holds signing control through its session. Not a sensible architecture.
- The same Polygon liquidity is reachable directly via Polymarket (covered by the parallel Polymarket workflow). Use that.

## 7. Fees

| Item | Value | Tag |
|---|---|---|
| Polymarket protocol fee, taker only: `fee = C x feeRate x p x (1-p)`; makers pay 0 | Crypto 0.072, Sports 0.03, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0. Copied onto Bullpen's doc page; defer to Polymarket's own docs for the current table | H (Bullpen page), M (currency) |
| Bullpen builder fee on Polymarket orders | Rate **NOT FOUND** in docs (FAQ "Polymarket Pro fees" just links to the Polymarket fee page). CLI order preview lists "protocol fee, builder fee, network fee" separately, so one exists. DefiLlama books "Polymarket Builder Fees" for Bullpen (V2 `builderFee` per trade from CLOB). Derived effective rate: DefiLlama daily PM fees divided by Polymarket-reported Bullpen volume = 0.28%-0.49% per day, **about 0.35% of notional over 2026-09-19..10-18** ($3.3K fees / $0.94M volume) | M (derived, rate not documented) |
| Gas / redemption | Gasless relayed trades and redemptions; no Bullpen or Polymarket fee to redeem; Polymarket does not charge deposit/withdrawal fees but bridge/Ethereum deposits incur gas | H |
| Hyperliquid (not relevant to PM arb) | Bullpen perps fee on top of HL fees: tier 0 maker 3.5 bps / taker 4.5 bps; HL spot sells 10 bps, no builder fee on buys | H (FAQ) |
| Marketing claim | "without extractive platform fees" (homepage), which conflicts with the builder fee above | H |

Arbitrage impact: any leg executed through Bullpen pays Polymarket taker fee plus an undisclosed builder fee (~0.3-0.5% of notional, M) versus Polymarket direct. Strictly worse.

## 8. Resolution, geo, ToS, automation

- **Resolution** = Polymarket's: UMA optimistic oracle, per Bullpen's page a $750 USDC.e proposal bond, 2 h challenge, disputes to UMA DVM (4-5 days or longer) (H as a quote of Bullpen's docs; M for correctness, because it is second-hand and the Polymarket workflow should confirm). Bullpen adds no resolution logic, but adds **operational risk**: Bullpen holds the signing session/Turnkey policy, can have relayer/wallet-routing problems (the CLI docs devote a whole page to recovery and `TURNKEY_POLICY_DENIAL`), and the legacy Proxy-wallet refusal in v0.1.119 shows migration risk (H).
- **Geo/eligibility**: ToS (Last Revised 2026-10-09): "Trading, perpetual futures and funding methods may be restricted by your location, applicable law or provider rules. Do not bypass geographic or eligibility restrictions." and "Do not use a VPN, proxy or other mechanism to circumvent geographic, sanctions or eligibility controls." Sanctions screening applies. Polymarket's own jurisdiction rules ("provider rules") apply on top. Country list NOT FOUND (searched: terms, FAQ, docs). (H, https://bullpen.fi/terms)
- **Automation**: Official, encouraged path = the CLI with `--output json`, `--preview`, `--non-interactive`, `--read-only`, plus AI-agent skills (H). The ToS, however, forbid to "(iv) use scraping techniques to mine or otherwise scrape data", to "(v) resell or sublicense the Functionality ... or use the Functionality to provide software as a service", and to reverse engineer the App or Site (H, terms). So: no scraping of app.bullpen.fi or its private API, and caution about wrapping Bullpen smart-money output into a redistributed product.
- Terms arbitration clause for US/Canada users; operator Bullpen Labs, Inc. (H).

## 9. Signal value (why it is not simply "skip forever")

Bullpen's differentiator is analytics on Polymarket wallets: smart-money convergence ("Heating Up" = 2-4 smart wallets on one market), whale trade feed, wallet taxonomy, PnL leaderboards, copy-trade flows (H, docs). The proto shows the shape: `SmartMoneyMarket{condition_id, slug, event_slug, category, current_price, smart_buy_volume, smart_sell_volume, smart_net_flow, smart_trader_count, smart_avg_entry_price, signal_strength 0-1, signal_direction bullish|bearish}` (H, proto). That fits the project's idea of a "signal source", but:
- no public endpoint; access = Bullpen account + closed CLI (`bullpen polymarket data smart-money`), which this run may not set up;
- ToS limits (section 8);
- the underlying data is public Polymarket data, so own scoring from Polymarket's Data API is possible and independent of Bullpen's licence.
Recommendation: do not build a Bullpen adapter. If wallet-flow signals are wanted, build them from Polymarket's public trades/positions feeds; optionally treat Bullpen as a benchmark. Revisit only if Bullpen ships a documented public data API.

## 10. Liquidity and volume (all USD, with dates)

| Metric | Value | Source | Tag |
|---|---|---|---|
| DefiLlama "Bullpen Prediction Markets" volume | 24h $12,871 (2026-10-17), 7d $113,722, 30d $329,809, all-time $3,877,361 (chart starts 2026-07-05, 105 daily points, last 2026-10-17); peak day $304,185 on 2026-07-09 | https://api.llama.fi/summary/dexs/bullpen-prediction-markets (fixture `defillama_dexs_summary_bullpen_trimmed.json`) | H |
| Polymarket builder API (v1) Bullpen monthly volume | Apr 2026 $17.95M (877 users, rank 11), May $6.65M, Jun $9.78M, Jul $5.48M, Aug $1.70M, Sep $0.97M (601 users, rank 55), Oct 1-18 $0.61M (162 users). Last 7 days (Oct 12-18) about $0.31M. Sep share of builder-attributed volume = 0.14% of $683.5M | https://data-api.polymarket.com/v1/builders/volume (fixture `polymarket_builders_volume_bullpen_extract.json`, derived sums) | H (rows), M (sums; unit = USD assumed, v2 reports shares) |
| Disagreement | DefiLlama 30d $0.33M vs Polymarket 30d (Sep 19-Oct 18) $0.94M; windows and definitions differ; unresolved | both above | open |
| TVL | none (DefiLlama TVL empty; non-custodial, funds sit in users' Polymarket wallets) | https://api.llama.fi/protocol/bullpen-prediction-markets | H |
| Open interest / orderbook depth | NOT FOUND (depth = Polymarket's book) | - | - |
| Whole-product DefiLlama parent "Bullpen" (perps+spot+PM) volume | $13,171 on the last chart day (2026-10-17) | https://api.llama.fi/summary/dexs/bullpen | H |

## 11. Event-category overlap

All Polymarket categories: crypto, politics, sports, finance (Fed, earnings), culture (H, overview.md). Overlap with Kalshi, Limitless, Predict.fun, Opinion, Myriad etc. is exactly Polymarket's overlap. Bullpen has no venue-specific markets. Roadmap mentions an "odds comparison" feature against traditional sportsbooks (H, roadmap.md) and nothing on cross-prediction-venue arbitrage.

## 12. Shared liquidity

**100% shared with Polymarket** for prediction markets (H). Hyperliquid perps/spot are a different product line and share liquidity with Hyperliquid, not with any event contract. Therefore **not an independent arbitrage leg**.

## 13. Open questions

- Does the CLI's read-only market data work without login, and is there a free tier of `data smart-money`? (needs an account; not allowed this run)
- Actual Bullpen builder fee bps on Polymarket V2 orders (preview output would show it; not run).
- Why DefiLlama and Polymarket builder volumes differ ~3x.
- Whether Bullpen will add Kalshi/other venues (no sign in docs as of 2026-10-19; web search unavailable).
- Whether `data-api.polymarket.com/v1/builders/*` keep working after 2026-10-24 (use v2).

## 14. Suspicious / embedded-instruction content

- `https://docs.bullpen.fi/llms.txt` and every `.md` page end with a GitBook-generated "Agent Instructions" block telling agents to query `GET https://docs.bullpen.fi/index.md?ask=<question>&goal=<user_goal>` and to share the user's goal. Generic platform boilerplate, **not followed** (the `goal` parameter would send task context to a third party). The fixture `docs_llms_txt_page_index.md` omits that block.
- Docs and CLI bundle contain long agent-targeted operating instructions for the Bullpen CLI (e.g. "Run `bullpen login` only when..."). Read as documentation only, not executed. No attempts to redirect this research were seen.

## 15. Sources

- https://bullpen.fi (homepage, H); https://bullpen.fi/terms (Last Revised Oct 9, 2026, H)
- https://docs.bullpen.fi/llms.txt (page index) and pages: about-bullpen/what-is-bullpen, about-bullpen/platform-architecture, about-bullpen/what-is-bullpen/roadmap, prediction-markets/{overview, polymarket-integration, order-types, positions-and-settlement, wallets-and-collateral}, getting-started/{wallet-management, funding-your-wallet, account-types}, execution/trade-routing, smart-money/{overview, copy-trading, convergence-signals}, bullpen-cli/{overview, ai-agent-skills, markets-and-trading}, developers/wallet-status-api, support/faqs (all H; the prediction-market pages are partly stale vs the CLI docs)
- https://cli.bullpen.fi/llm.txt (CLI docs bundle generated 2026-10-07: changelog, authentication, headless-bot-setup, polymarket command reference; H)
- https://github.com/BullpenFi (org, 7 public repos), `BullpenFi/bullpen-cli-releases`, `BullpenFi/bullpen-data-proto` (README and `proto/bullpen/v1/*.proto`), `BullpenFi/bullpen-dashboard` (README: internal Streamlit smart-money dashboard) (H)
- https://registry.npmjs.org/@bullpenfi%2Fcli (H)
- https://api.llama.fi/protocol/bullpen-prediction-markets, https://api.llama.fi/summary/dexs/bullpen-prediction-markets, https://api.llama.fi/summary/fees/bullpen (H)
- https://github.com/DefiLlama/dimension-adapters (`factory/polymarket.ts`, `helpers/polymarket.ts`) (H)
- https://data-api.polymarket.com/v1/builders/volume (H)
- https://usergate.bullpen.fi/api/wallet/bullpen-status (H)
- WebSearch 2026-10-19 "Bullpen bullpen.fi Polymarket trading terminal 2026": third-party listicles and a Bullpen blog claim of "12,000+ wallets indexed" (L, unverified). Not relied on.
