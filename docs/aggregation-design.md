# Multi-venue aggregation and edge-finding: design

> **Status (2026-10-19): design only, no code.** Companion to `docs/plan.md`. It designs how the XO Market PayBox plugin can also read, compare and (where physically possible) trade across Polymarket, Kalshi, Limitless, Trueo and the next-best venues, with Quotient as a signal source. Every venue and PayBox claim below is cited to a research note; nothing here is a primary-source read by this document's author. This is not legal advice.

How to read citations: `[NN §x]` is section x of `docs/research/NN-*.md`. `[NN V-x]` is an item in that note's appended "Verification (2026-10-19)" section, which overrides the body where they disagree (for example `[10 V3]`, `[08 V-A4]`, `[16 V-K1]`). Confidence tags: **H** read first-hand in a primary source by a researcher or verifier, **M** secondary or inferred, **L** weak or stale, **D** a design default chosen here (not a research finding; to be calibrated).

---

## 0. Summary

### 0.1 Headline conclusions

1. **The realistic product is an "edge finder and reference-price layer", not an arbitrage engine.** Measured on 2026-10-18 snapshots: within-venue structure is almost never violated net of fees (Polymarket neg-risk sets: 8 of 492 complete sets had a gross top-of-book gap and 4 stayed positive after taker fees; of the sets then depth-checked with an LP, none stayed positive once an 8% APY lock charge was added [15 §6.3, §6.4]; Kalshi: 0 crossed ladder pairs of 7,274 [15 §6.3]); cross-venue XO-vs-Kalshi football showed a median mid gap of 0.1 cent and zero gross edge in either direction (53 outcomes) [16 §0.7]; no taker-side lead-lag edge survived frictions in 41 relationships at any horizon, with signals 10 to 100 times smaller than the round-trip cost of two venues [18 §0, §2.9]. Value comes from (a) fair-value references for XO markets, (b) structural checks inside XO's own sets and ladders, (c) Quotient-style model views, (d) creation lint for v0.3, not from P&L.
2. **At the author's caps the P&L is negligible by construction.** A capped $10 XO leg is about 31 shares; in worked Example 1 (a generous 6-cent gross cross-venue gap) the net is about $0.72 per capped pair (section 5.1). Any fixed friction above a few tens of cents (gas, bridge, rebalancing) removes it (section 5.5). Aggregation is therefore information tooling that must not delay the XO release.
3. **Architecture: a pure, venue-agnostic core library plus read-only venue adapters, bundled into the single Open Plugin as a thin tool surface.** PayBox allows one project per participant [06 §2] and a stateless 10-second sandbox with 16 exact hosts [06 §2, 04 §6], so the aggregator ships as a `pm_*` tool family inside the same plugin as the `xo_*` tools, built from separate workspace packages so signing code never enters read-only builds (section 1).
4. **Only Trueo fits PayBox's proposal model cleanly.** Every Trueo action is a plain EVM call on Base with no off-chain signature and no credentials [11 §1, §11]. XO, Polymarket, Limitless, Predict.fun and Opinion need off-chain EIP-712 signatures plus venue credentials, so they follow the agent-orchestrated prepare, `request_wallet_sign`, submit pattern, which no reference plugin has demonstrated end to end [04 §10, 05 §0]. **Kalshi, Polymarket US, MagicMarkets and PredictIt cannot be traded from PayBox at all** (custodial, fiat or KYC accounts with API-key request signing); the plugin can only show them as manual legs [08 §9, 09 §2.8, §2.11].
5. **Cross-venue matching must be human-approved and hash-pinned.** No venue publishes a general cross-venue key; the only native hooks are Limitless `externalSlug`/`rulesHash`, Predict.fun ids and Probable's Polymarket route [16 §0.1]. The best measured automatic precision is in-sample and did not replicate on a fresh XO subset (gated Jaccard: 23/23 in-sample, 5/8 strict out-of-sample with one clear entity-swap false link) [16 §7.9, 16 V-K2]. Resolution divergence is the dominant risk (Khamenei: $1.00 on Polymarket vs $0.02 on Kalshi) [15 §8.1].
6. **Fee models are data, not code constants, and unknown fails closed.** All three core venues charge `rate x p x (1-p)` taker curves [10 §6.1]. XO's live rate has two disagreeing sources (`/fee-rate` returns 0, Data API `effectiveFeeConfig.takerFeeBps` is 400 on most sports/crypto markets) so the edge module uses the maximum and refuses an `executable` label until a real fill reconciles it [10 V3].
7. **Quotient is optional, small, per-user and paid by the agent.** It covers Polymarket, Polymarket US, Kalshi and HL Outcomes, not XO or Trueo; its edge is not distinguishable from zero outside the final day once same-day forecasts are excluded; its terms bar shared access and redistribution [12 §0, 12 V-Corrected 4, 5; 12 §8]. Use it as a prior on matched twins and as a candidate ranker, with a shrinkage factor learned from the user's own logs.
8. **Biggest external dependencies are unresolved XO and PayBox gates, not the aggregation math:** per-user XO credentials, whether a PayBox wallet can own an XO Kernel account, whether PayBox accepts chain 3223 or the Kernel typed data, autonomous-grant behaviour, XO funding, and whether a non-entrant can upload a plugin after Chapter 1 closed on 2026-10-17 [01 gates, 06 §2, 06 V]. Aggregation reads need none of these.

### 0.2 Evidence base and its limits

- Notes 01 to 14 and 16 each carry an appended verification pass, which this document treats as authoritative over the body. **Notes 15 (taxonomy/literature/LP) and 18 (correlation and lead-lag) have no verification section**, so their numbers are researcher-level (H as measured by the researcher, unaudited). Note 15 §10.6 also repeats the refuted "XO has about 9 active markets" figure; the corrected figure is in section 3.
- **There is no note 17.** `docs/research/fixtures/linking/` contains outputs of a linking/census study (for example `final_summary.json`, `analysis_summary.json`, `census_true_links.csv`, and `code/`) with no accompanying notes file and no verification. They were read only to confirm they exist; **none of their numbers is used here**.
- All venue snapshots are from 2026-10-18 (about 17:30 to 18:50 UTC); today is 2026-10-19. Items older than six months are flagged: Kalshi Developer Agreement v1.1 (2023), Predict.fun ToS (2025-11-18) and Opinion ToS (2025-10-19) [08 §4.9, 09 §4].
- Sample sizes are small and single-snapshot throughout. Where a number carries a caveat in the note, the caveat is kept.

### 0.3 Author decisions that bound this design (from `docs/plan.md`, unchanged)

Own Open Plugin; self-trading allowed; release needs read + trade + create + funding; caps $10 per order, $50 per day, 2 markets created per day; the plugin must handle funding; no browser automation and no "draft + link" substitute for creation. Consequences here: aggregation is additive and ships behind feature flags; the caps apply to plugin-prepared XO orders (section 6.4); the "self-trading allowed" decision conflicts with XO's wash-trading and insider clauses (section 10, recorded not decided).

### 0.4 Decisions this document proposes (for the author to accept or change)

| # | Proposal | Why |
|---|---|---|
| D1 | One plugin, two tool families (`xo_*`, `pm_*`), built from separate workspace packages | One project per participant; keeps signing code out of read-only builds |
| D2 | No `executable_arbitrage` label until a 200-link gold set and two reconciled real fills exist | False link = fake arbitrage; XO fee sources disagree |
| D3 | Link registry is bundled, human-approved, hash-pinned (Option A), moving to a signed static dataset (Option B) later | Plugin cannot host embeddings or an LLM judge [16 §10.2] |
| D4 | Kalshi and Quotient adapters ship behind per-feature build flags, enabled for public release only after written permission or a clean legal read | Kalshi Developer Agreement s3.1/3.2; Quotient Terms s6 [08 §4.9, 12 §8] |
| D5 | Non-XO legs are never executed by plugin code; Trueo is the only candidate for plugin-built proposals (P2, after MVP) | Section 6 |
| D6 | Quotient is paid by the agent from a dedicated data credential, never from plugin code | Plugin cannot cap an agent's own payments [12 §10.6] |
| D7 | No statistical/lead-lag features in the MVP; log data offline instead | No tradeable edge; Polymarket keeps 1-minute history only about 7 days [18 §4] |

---

## 1. Recommended architecture

### 1.1 Constraint set from the PayBox Open Plugin model

| Constraint (source) | Consequence for aggregation |
|---|---|
| Single-file ESM bundle `plugin.mjs`, at most 10 MiB, Node 24, byte-reproducible build [06 §2] | No runtime dependencies; no embedding models; registry data is JSON embedded at build time; adapters tree-shaken per build flag |
| 10 s per operation including startup (reference plugins budget 8 s overall, 3 to 4 s per fetch) [06 §2, 04 §6.3] | Bounded fan-out per call; no multi-market sweeps in one call; paging with a cursor |
| Fresh sandbox every call, no storage, no per-user state, no user identity (wallet is "not sent to plugin code") [06 §2, §8] | Aggregation reads must be stateless; per-user data (positions, caps, logs) must be passed in by the agent or held by an owner backend; EVM sender is agent-supplied and unverified [04 §5.3] |
| At most 16 exact HTTPS hosts, no wildcards or redirect chains; GET and POST are the only confirmed methods; WebSocket not confirmed [06 §2] | Host budget (section 1.5); polling only; JSON-RPC reads for Trueo are POST to an allowlisted RPC host (a pattern the reference plugins use [04 §6.3]) |
| Env vars are plain, owner-level and "non-sensitive"; brokered secrets are owner-level header injection only [04 §6.1] | No per-user secrets in the plugin; a shared Quotient or venue API key would be shared by all installers (conflicts with Quotient Terms s6) |
| Write results are exactly one `io.paybox/transactionProposal` of kind `evm`, `solana` or `x402`; one call per proposal, at most 5 minutes to expiry; no batches, no signature kind, no description field [04 §5, 06 §3] | Proposals only for on-chain EVM calls from the user's own EOA; every multi-step flow is a "next missing step" tool (arcanum pattern) |
| No off-chain-signature continuation inside a plugin; plugins cannot call PayBox tools or other plugins [04 §10, 05 §0] | Sign-then-submit is agent-orchestrated: plugin prepares, agent calls `request_wallet_sign`, plugin submits; cross-plugin data (for example `world`) must be passed in as tool inputs [05 pattern P20] |
| Plugin caps cannot bind an agent that calls `request_wallet_sign`, `request_transfer` or `request_swap` directly under an autonomous grant [06 §10] | Caps in `pm_plan_legs` are advisory for non-plugin legs; the real boundary is the PayBox grant mode |
| 1 start per second and 1,000 starts per rolling 24 h per user (whether this binds end-user runs is unclear) [06 §2, 04 §6.3] | Few, fat tool calls; avoid chatty designs |
| Every published version needs MoonPay manual approval; Chapter 1 uploads closed 2026-10-17 and no non-entrant path is documented; marketplace not public [06 §2] | Schedule risk independent of this design; keep the bundle small and reviewable; ship aggregation flags off by default |
| Local conformance starts the bundle with no config and runs one sample call; hosted preflight never calls a tool, and discovery must not touch the network [04 §6.1, §6.3, 04 V] | The sample call should be offline (`pm_list_venues` reads the bundled registry); the arcanum sample did a network `getCode` call, which forces hosts to be configured before checks pass [04 §4.2] |
| A "remote" plugin class exists in PayBox but third-party registration is undocumented [06 §7, 04 V] | Not designed against; revisit if PayBox offers it (it would solve per-user state and the 10 s limit) |

### 1.2 Design principles

1. **Pure core, impure edges.** All money maths, fee models, book normalisation, depth-walks and gates are pure functions over injected data. Adapters take an injected `fetch` with deadline, retry and host allowlist. This is the testing model the reference plugins use (stub `globalThis.fetch`, failing-case test per guardrail) [04 §7.4, §9].
2. **Decimal everywhere.** No floats on the value path. Boundary values are decimal strings; internal arithmetic is `bigint` fixed-point (the author's `own-repo-F/packages/sources/src/aggregate.ts` is the local reference for bigint, ABSTAIN-on-dispersion discipline [13 §3.12]).
3. **Missing means null, never 0.5.** The author's existing normalisers default absent probabilities to 0.5; that is a defect for edge work [13 §3.1].
4. **Fail closed.** Unknown fee model, stale book, synthetic book, rule-hash mismatch, unknown enum value, disagreeing fee sources: reject with a machine-readable reason (gate list in section 5.1).
5. **Capability-honest adapters.** An adapter returns `NOT_SUPPORTED` instead of invented data (ccxt `has` map and Predictefy/Synpath practice [14 §4.1, §5]).
6. **Market text is attacker-controlled data.** Titles, rules, theses and evidence are wrapped as `Untrusted<string>`, length-capped and control-char stripped (paylink-guard `untrusted()` [04 §9.1]); never returned as instructions [12 §10.8, 16 §7.4].
7. **Registry before code for platform facts.** Fees, geo, oracle, void policy and reachability are records with a source URL, `last_verified` and `ttl_days`; past TTL reads as `unknown` and fails closed [14 §9].

### 1.3 Layers and package layout

```
repo (pnpm workspace; starter toolchain: Node 24, esbuild, zod v4, node:test)  [04 §7]
  packages/
    pm-core/            PURE, no I/O. Types, Decimal/bigint math, book normalisers (4 sort conventions),
                        FeeSpec + fee models, depth-walk, edge gates + tiers, set/ladder/implication checks,
                        tiny exact LP (<=30 vars) + dual certificate, rule hashing, caps arithmetic,
                        Untrusted<T>, error taxonomy
    pm-venues/
      xo/               READ adapter (Data API + orderbook). Shared with xo_* v0.1 read tools
      polymarket/       Gamma + CLOB + Data API v2 (never v1; retired 2026-10-24) [08 §2.1]
      kalshi/           REST only; no WS (needs key) [08 §4.7]
      limitless/        public REST; mirror hooks
      trueo/            on-chain reader; injected ethCall; chain-parameterised manifest [11 §11.4]
      (p2) polymarket-us/ predictfun/ opinion/ hyperliquid/ manifold/
      each: fetch.ts (I/O) | parse.ts (pure) | fixtures/ (recorded responses) | golden tests
    pm-registry/        platforms.json + links.json + JSON Schemas + verifier + Ed25519 verify (Option B)
    pm-signals/         quotient: describe_request / parse_result / tuple pin / budget math (no network)
    xo-trade/           WRITE path only: ClobAuth, L2 HMAC, Kernel-wrapped digest, ecrecover check (plan v0.2)
  apps/
    plugin/             thin MCP surface: zod strict schemas, tool descriptions, env config, caps,
                        feature flags, esbuild -> dist/plugin.mjs.  Imports pm-core, pm-venues, pm-registry,
                        pm-signals always; xo-trade only in trading builds
    indexer/            OFFLINE, never bundled: blocking, embeddings, LLM judge, review queue (PR/issue),
                        fixture refresh, schema-drift alarms, history snapshotter, DefiLlama liveness watch
  data/
    registry/           platforms.json, links.json (human-approved, hash-pinned)
    fixtures/           recorded venue responses (start from docs/research/fixtures/)
```

Dependency rules: `pm-core` imports nothing; `pm-venues/*` import `pm-core`; `apps/plugin` imports everything; `xo-trade` is imported by `apps/plugin` only and never by `pm-*` (so the aggregator cannot sign). Build flags select adapters (`VENUES=xo,polymarket,kalshi`) and feature groups (`PM_TOOLS`, `QUOTIENT`, `XO_TRADE`). This supersedes the single-package layout in `docs/plan.md` only in file organisation; XO code stays XO code.

### 1.4 Where each piece runs

| Piece | Plugin (stateless, 10 s) | Agent (orchestrator) | Offline indexer / owner backend |
|---|---|---|---|
| Venue reads, book normalisation, fee-adjusted depth-walk, set/ladder checks, small LP | yes | | |
| Rule-hash and status verification of a pinned link | yes | | |
| Blocking, embeddings, LLM judge, reviewer queue, re-judge on drift | no (10 s, no model, attacker text) [16 §10.2] | | yes |
| Dataset signing and signature verification | verifies | | signs |
| Payment for Quotient or any x402 data | no | `discover_services`, `use_service`, `pay_x402` [12 §10.6] | |
| Cross-plugin data (`world_*` outputs) | takes as input | calls `use_plugin` and passes results | |
| Leg sequencing, approvals, polling `get_request`, unwinds | no (sandbox ends before approval) [06 §3] | yes | |
| Per-user state (daily counters, logs, calibration) | none available | agent memory | owner backend keyed by signed challenge [06 §8] |
| Price history persistence | no | | yes (Polymarket 1-minute data only about 7 days; Kalshi 3.4 days per candle call) [18 §4] |

### 1.5 Host budget (16 slots)

| Group | Hosts | Count |
|---|---|---|
| XO reads (P0) | `orderbooks.xo.market`, `api-mainnet.xo.market` | 2 |
| Polymarket (P0) | `gamma-api.polymarket.com`, `clob.polymarket.com`; optional `data-api.polymarket.com` for v2 history/trades | 2 to 3 |
| Kalshi (P0, flagged) | `external-api.kalshi.com` (dedicated; the shared `api.elections.kalshi.com` also works, pick one) [08 §4.1] | 1 |
| Limitless (P1) | `api.limitless.exchange` | 1 |
| Trueo (P1) | one or two Base RPC hosts (public RPCs rate-limit shared sandbox IPs [04 §6.3]) | 1 to 2 |
| Link dataset (Option B) | one static host | 1 |
| Quotient free routes (optional) | gateway host (pin the exact host; `*.onrender.com` is a shared namespace) [12 §1.2] | 1 |
| XO trading (plan v0.2) | `mainnet-bundler.xo.market`, relay host | 2 |
| Subtotal | | 11 to 13 |

That leaves three to five slots, which is why P2 venues with keyed or POST-only reads (Predict.fun, Opinion, Hyperliquid, Polymarket US) are deferred.

### 1.6 Reference-plugin patterns adopted and rejected

| Pattern (source) | Verdict |
|---|---|
| `second-opinion-paybox`: curated pair map plus fuzzy match, fee-adjusted comparison, `CHECK_RULES` when two venues disagree by more than 3 cents [05 §6] | Adopt the method; build our own matcher with rule-text comparison [05 P22] |
| `hedge`: agent supplies data from other plugins; refuses weak hedges [05 §6] | Adopt (tools accept venue data as inputs); refusal-by-default |
| `echomarkets`: free preview plus paid brief; `kind: "x402"` proposals; heuristic signal [12 §9] | Reference only; we do not sell signals |
| arcanum: "next missing step" tool, state re-derived from chain each call, policy in a contract, no bypass flag [04 §5.5, §9.2] | Adopt for any multi-step proposal flow (Trueo, XO funding); do not copy its `propose_even_if_denied` |
| paylink-guard: intent binding (agent passes `max_amount`), fail closed, `untrusted()` sanitiser, stateless confirm code [04 §9.1] | Adopt intent binding and sanitiser; do not copy the fail-open default confirm key |
| Ghost Mode style thin plugin plus owned relay for creds (pattern P8) [05 §5] | Option for XO only (plan v0.2); out of scope for read aggregation |
| `kreopoly-lens` `place_bet` with placeholder calldata [05 §0] | Anti-pattern |

### 1.7 Alternatives considered

- **Separate aggregator plugin:** rejected, one project per participant [06 §2]. Could be revisited under a second account.
- **Hosted aggregation service called by the plugin:** more power (embeddings, history, shared cache) but adds a trust hop, ops, and legal surface (redistribution of Kalshi/Quotient data). Reserve for Option C only if user feedback loops justify it [16 §10.3].
- **No plugin at all for non-XO reads:** reading Polymarket/Kalshi/Quotient through `use_service` x402 wrappers works today without any plugin [06 §10.6]. Kept as a fallback if MoonPay rejects the multi-host bundle.
- **Depend on pmxt, Predictefy, Oddpool or Kairos at runtime:** rejected (section 12).

---

## 2. Normalised schema and adapter interface

### 2.1 Core types (TypeScript sketch; the shipping types live in `pm-core`)

```ts
type VenueId = "xo" | "polymarket" | "polymarket_us" | "kalshi" | "limitless" | "trueo" | "world"
             | "predictfun" | "opinion" | "hyperliquid" | "manifold";
type Dec = string;                              // decimal string at boundaries; bigint fixed-point inside
type Untrusted<T> = { readonly untrusted: true; readonly value: T };   // market text, theses: data, never instructions

interface MarketRef {
  venue: VenueId;
  marketId: string;                             // XO/Polymarket: conditionId; Kalshi: ticker; Limitless: slug;
                                                // Trueo: `${chainId}:${marketAddress}`
  native: Record<string, string>;               // eventId/slug/series/rootEventSlug/negRiskMarketID/marketKey...
}

interface Outcome {                             // ORDER MATTERS; never match on title text
  index: number;                                // XO: index 0 is the "Yes" token even for team-named markets [02 §0.5]
  role: "yes" | "no" | "label";
  label: Untrusted<string>;
  tokenId: string;                              // XO outcomeTokenId; Poly clobTokenIds[i] if version==="v1" else positionIds[i]
}

interface Rules {
  text: Untrusted<string>; sha256: string;      // sha256 of NFKC-normalised, whitespace-collapsed text
  sources: string[];                            // named resolution authorities / URLs
  mechanism: "uma_oo" | "chainlink" | "exchange" | "xo_manual_modra" | "pyth" | "external_parity"
           | "optimistic_council" | "protocol_mark" | "unknown";
  resolver?: string;                            // XO resolverAddress is creator-specified [10 V12]
  cutoffUtc?: string; windowStartUtc?: string;  // XO cutoffs are UTC, Polymarket's ET: ~5 h offset [16 §7.9c]
  void: VoidPolicy;                             // fifty_fifty | refund | last_traded_price | scalar | invalid_reverse_trades | unknown
  canCloseEarly?: boolean;
}

type Status = "pending" | "active" | "paused" | "closed" | "determined" | "disputed" | "resolved" | "voided" | "unknown";

interface Market {
  ref: MarketRef; title: Untrusted<string>; outcomes: Outcome[]; rules: Rules; status: Status;
  tradable: { ok: boolean; reasons: string[] };
  timesUtc: { opensAt?: string; closesAt?: string; expectedResolutionAt?: string; latestResolutionAt?: string };
  tick: Dec | TickRanges; minSize?: Dec;        // XO 0.001 global; Poly per-market; Kalshi price_ranges[] [08 §4.5]
  collateral: { symbol: string; chain: string /*CAIP-2*/; decimals: number; custody: "self"|"smart_account"|"venue"|"broker" };
  group?: { key: string; kind: "neg_risk"|"mutually_exclusive"|"event"|"series"; exhaustive: "proven"|"by_rule"|"no"|"unknown" };
  fee: FeeSpec;
  prov: { fetchedAtMs: number; source: string; adapterVersion: string; schemaHash: string };
}

interface Level { price: Dec; size: Dec }       // size in SHARES; XO sizes have up to 6 dp [02 V]
interface Book {
  token: { venue: VenueId; tokenId: string }; bids: Level[]; asks: Level[];   // sorted bids desc, asks asc, always explicitly
  asOfMs: number; venueTsMs?: number; hash?: string;
  derived: "native" | "complement";             // synthetic books are never executable
}

interface FeeSpec {
  modelId: "curve_pq" | "curve_min" | "ad_valorem_bps" | "profit_pct" | "amm_stack" | "unknown";
  taker?: FeeParams; maker?: FeeParams; rounding?: string;
  payer: "buyer_adds_seller_withholds" | "outcome_tokens" | "in_pool";
  paramsSource: { url: string; field: string; granularity: "market"|"series"|"event"|"token"|"category" };
  verifiedAt: string; ttlSec: number;           // past ttl or modelId "unknown" => FailClosed
}
```

### 2.2 Book conventions the normaliser must absorb

| Venue | Book shape | Best level | Notes |
|---|---|---|---|
| XO | `bids[]`, `asks[]`, one book per token (Yes and No), human-share sizes with up to 6 dp | **first** | tick 0.001; `min_order_size` often `"0"`; `last_trade_price` unreliable [02 §2.1, 02 V, 08 §7] |
| Polymarket | per token; `bids`/`asks` | **last** | `/price?side=BUY` returned the best bid live while a docs page says the opposite; derive from the sorted book [08 V-A1] |
| Kalshi | one book; bids only: `yes_dollars`, `no_dollars` | **last** | YES ask = 1 - best NO bid; `*_dollars` strings, `*_fp` counts [08 §4.4] |
| Polymarket US | `bids[]`, `offers[]`, one instrument (the YES side) | first | price objects `{value, currency}` [08 §3] |
| Limitless | YES-side only; NO folded in | n/a | sizes raw 1e6 per share [09 §2.3] |
| Predict.fun | YES-side only | n/a | `updateTimestampMs` [09 §2.1] |
| Opinion | per token, mirrored | n/a | envelope `{errno, errmsg, result}`; `result.list` vs `result.data` [09 V-B1] |
| Trueo | no order book: Uniswap v4 pools (YES/TYD, NO/TYD) | n/a | price from `StateView.getSlot0` plus `V4Quoter` quotes at intended sizes [11 §7.2] |

Rules: always sort explicitly; derive the other side by complement and mark `derived: "complement"` (never double-count a mirrored NO book as extra liquidity) [15 §2]; never use `outcomePrices`, `lastTradePrice`, Kalshi `last_price_dollars`, the book's embedded `last_trade_price`, or any Data API `currentPrice` as a price [08 §10.3, 08 V-A9]. XO detail routes return a constant `currentPrice` of `"500000"`, and list rows carry a display price, so neither is usable [02 V].

### 2.3 Unit hazards (each is a 10^k error if mixed)

| Where | Unit |
|---|---|
| XO orderbook | prices decimal strings 0.001 tick; book sizes human shares |
| XO Data API | prices **micro-units** (`"670000"` = 0.67); positions/claimable in **micro-shares**; collateral USDC.e 6 decimals [02 §3] |
| Polymarket | decimal strings; pUSD 6 decimals; Data API v2 numbers are JSON numbers |
| Kalshi | `*_dollars` 4-dp strings; `*_fp` counts with fractional contracts |
| Limitless | price 0 to 1; size raw 1e6 = 1 share; USDC 6 decimals |
| Opinion / Predict.fun / Probable | USDT 18 decimals; Predict.fun order fields in wei |
| Myriad | prices integers in [1, 1e18]; amounts 1e18 = 1 share |
| Trueo | TYD 6 decimals; YES/NO 18 decimals; `mint(x)` takes payment-token decimals, `burn/redeem(a)` take outcome-token decimals; TYD is not USD (`convertToAssets`) [11 §12] |
| Quotient | `entry_q`, `entry_pm` on 0 to 100; `latest_q`, `market_odds` on 0 to 1; `*_cents` on the signal's own side [12 §5.1] |

### 2.4 Adapter interface

```ts
interface VenueReadAdapter {
  readonly id: VenueId;
  readonly caps: {                              // ccxt-style `has` map; false means NOT_SUPPORTED, never a guess [14 §4.1]
    listMarkets: boolean; search: boolean; getMarket: boolean; getBook: boolean; getBooksBatch: boolean;
    getFeeSpec: boolean; getResolution: boolean; getPositionsByAddress: boolean; stream: false;
  };
  listMarkets(q: { statuses?: Status[]; cursor?: string; limit?: number; text?: string }): Promise<Page<MarketSummary>>;
  getMarket(ref: MarketRef): Promise<Market>;                         // full rules, sources, fee params, group keys
  getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>>;
  getFeeSpec(m: Market): Promise<FeeSpec>;                            // reads live params; unknown => modelId "unknown"
  health(): Promise<{ ok: boolean; notes: string[] }>;                // XO: GET /trading-state; Limitless: /maintenance/status
}
type AdapterError = "RATE_LIMITED" | "STALE" | "NOT_SUPPORTED" | "SCHEMA_DRIFT" | "VENUE_PAUSED" | "NOT_FOUND" | "TIMEOUT" | "EMPTY_BOOK";
```

Venue-specific traps the adapters must encode (each is tested with a recorded fixture):

- **XO:** discover with `marketType=2,4&statuses=ACTIVE&take=50` and page on `meta.hasNextPage` only (rows can be hidden after `itemCount`); default `marketScope` silently returns only the 9-row AMM slice; `take` max is 50; send an explicit `User-Agent` (Python-urllib gets 403); Data API 429 body is `{statusCode:429, message:"Rate limit exceeded", ...}` [02 §0, 02 V, 10 V1, 10 V11].
- **Polymarket:** choose `clobTokenIds` vs `positionIds` by the market's `version`; outcomes are not always Yes/No (48 of 100 sampled); GET batch endpoints returned 400 live, the documented POST variants (max 500) are untested; use Data API v2 only [08 §2.3, 08 V-A3, V-B1].
- **Kalshi:** batch order books use **repeated** `tickers=` params (comma-joined returns HTTP 200 with a bogus empty book); `GET /series` ignores `limit` and returns more than 3.5 MB; no free-text search endpoint [08 V-A2, V-A9].
- **Limitless:** `limit` above 25 returns 400; group markets need the child slug for `/orderbook`; first page is priority-sorted, not volume-sorted [09 §2.3, 09 V-E4].
- **Trueo:** `getCurrentStatus()` is derived (the stored status and indexer status lag); verify `isActiveMarket`, `paymentToken == TYD`, hook allowlist, `poolPaused` false before pricing [11 §5.3, §11.2].

### 2.5 Registry records

Two registries, both versioned JSON with JSON Schemas, both checked in CI.

**Platform registry** (one record per venue; schema and five validated seed records already exist in `docs/research/fixtures/linking/pop_platform_registry.schema.json` and `.seed.json` [14 §9]): identity and external ids (`defillama_slug` as join key), kind and execution model, chains (CAIP-2), collateral, **fees** (`model`, `formula`, `params_source`, `verified_on`), **regulation/geo** (including bot policy and wash-trading clause), **api** (`has` map, auth, rate limit, depth), **our reachability** (`paybox_chain`, `needs_offchain_typed_data_sign`, `human_onboarding_steps`), liquidity tier with downgrade rule, resolution oracle and `void_policy`, shared-liquidity and mirror links, and `last_verified`/`ttl_days` (7 for liquidity, 30 for fees/geo/API) with per-field provenance. Operating rules: expired fields read as `unknown` and fail closed; liquidity refreshed from DefiLlama, fee parameters from each venue's own endpoint with PolyKal as a cross-check, geo/ToS hand-verified with source and date; aggregator coverage is a claim until an order or pull succeeded; never key on a third-party id [14 §9].

**Link registry** (one record per approved relationship; proposal from [16 §11]):

```ts
interface Link {
  linkId: string; relation: "identity"|"complement"|"subset"|"superset"|"overlap"|"disjoint"   // pmxt enum [16 §5.1]
        | "partition"|"ladder_threshold"|"ladder_date"|"implication"|"exclusive"|"joint";      // taxonomy R1..R10 [15 §3]
  legs: Array<{ ref: MarketRef; rulesSha256: string; closeUtc: string; source: string; void: VoidPolicy; outcomeMap: number[] }>;
  basis: { class: "identical"|"settlement_window"|"settlement_source"; axes: Array<"timing"|"source"|"condition_scope">;
           cutoffDeltaH: number };              // Oddpool taxonomy [10 §4.1, 16 §5.1]
  evidence: { methods: string[]; quotedFragments: string[] };
  state: "discovered"|"candidate"|"verified"|"suspended"|"rejected";
  reviewer?: string; reviewedAt?: string; validUntil: string;   // earlier of the two closes
  schemaVersion: number;
}
```

### 2.6 Categories

One fixed taxonomy for every venue, so the Markets surface can be browsed by category and the linker can block candidate pairs by it (section 4.3, L2 "blocking by category"): `politics`, `crypto`, `sports`, `economics`, `science_tech`, `culture`, `world`, `weather`, `other`. It lives in the shared `sdk/category.ts` (pure, no imports), which `pm/core/category.ts` and `app/src/core/category.ts` re-export, so the linker and the page run the same code. `Market.category` is optional; a consumer reads an absent verdict as `other` with confidence `none`.

`categorise({ venue, native, title })` returns `{ category, confidence, matched }`. Matching is deterministic and case- and diacritic-insensitive (NFKD, marks dropped, lower case, every non-alphanumeric run collapsed to one space), in a fixed order with the first hit deciding:

1. each venue-native string (XO `categoryPath` names and slugs, root first; Limitless `categories` then `tags`; Polymarket series slugs and tickers, the event ticker and slug, then the market slug) is looked up exactly in the venue's own table, then in the common table (confidence `native`);
2. the words of each native string are looked up in the keyword table (still `native`: the evidence is the venue's own taxonomy);
3. the words of the title are looked up in the keyword table (confidence `keyword`);
4. otherwise `other`, `none`.

The tables are the documented list in the module: the common names (politics, crypto, sports, finance, tech, culture, …), XO's `PULSE` family and its up/down children (crypto), Limitless's minute-window categories and its "Lumy" tag (its automated crypto price markets), and a conservative keyword list of one-to-four-word phrases per category. The venue strings are untrusted text: they are never rendered raw (the UI shows the fixed label; the inspector shows the venue's own words only through `UntrustedText`), never fed to a model, and never echoed (`matched` names table entries only). No category is ever LLM-assigned, in the plugin or in the app. Hyperliquid outcome specs carry no category field, so their verdict is at most `keyword`; venues without a reader-side source carry no verdict. A market that names nothing in the tables (a person, an office, a company) is `other`; that is a reported gap, not a guess.

---

## 3. Per-venue capability matrix

### 3.1 Priority assignment

Priority is for **read adapters in the plugin**; execution reachability is separate (section 6). P0 = needed for the XO edge finder and benchmark liquidity. P1 = high value or explicitly requested, small build. P2 = defer until hosts, keys or evidence allow. Skip = not worth a slot. The ranking in [09 §5] (Predict.fun first) is **provisional**: it rests on DefiLlama volume and judgement, and the only depth sample of a comparable venue (Opinion) showed best-bid depth of $0 to $123 per book against $276M/30d [09 V-D]. It is overridden here by relevance to XO's catalogue (football, FOMC, crypto thresholds, politics) and by key/host constraints.

Liquidity tier uses [14 §9]: A at least $1B/30d, B $100M to $1B, C $10M to $100M, D $0.1M to $10M, X below or dead; downgrade one tier when displayed depth or volume integrity contradicts the headline. Volumes are DefiLlama adapter figures (methodology differs per venue) [14 §2.1, 09 §1].

### 3.2 Read side

| Venue | Pri | Liquidity (30d) | Read hosts, auth, limits | Identity and gotchas | Cites |
|---|---|---|---|---|---|
| **XO** | P0 | C ($50.2M; fees only $10.4K) | `orderbooks.xo.market` (no auth, public 5 req/s), `api-mainnet.xo.market/api` (no auth, 100 req/10 s documented; 429 seen after about 35 requests in 20 s). Explicit User-Agent required | 248 ACTIVE long-form CLOB (type 2) plus 4 CLOB Pulse; undocumented type 4 "Conviction" (about 166 ACTIVE, user-created, thin: 1 of 8 probed books two-sided); 421 ACTIVE across types 0 to 4. 57 of 60 sampled type-2 books two-sided, median spread 2.0c, median ask notional within 5c about $198. `neg_risk` always false; `rootEventSlug` only on slug detail; rules, sources, `resolverAddress`, `effectiveFeeConfig` only on detail routes; no public trade tape; `prices-history` is trade ticks, not a time series | [02 §0-§3, 02 V, 10 V1, V2, V9, V12, 16 V-K1, 18 §2.10] |
| **Polymarket (global)** | P0 | A ($2.21B; plus Polymarket US $3.06B) | `gamma-api.polymarket.com`, `clob.polymarket.com`, `data-api.polymarket.com/v2`; no auth; CLOB `/book` 1,500/10 s, `/books` 500/10 s, Gamma `/markets` 300/10 s, `/events` 500/10 s, `/public-search` 350/10 s | `conditionId`; token by `version`; neg-risk flags and augmented "Other" (trade named outcomes only); `umaResolutionStatus`; "closed=false and acceptingOrders" does not mean unresolved; `min_order_size` is shares | [08 §2, 08 V-A1, V-A3, V-A5, V-B1] |
| **Kalshi** | P0 (flagged) | A ($14.92B; 70.5% of the 51-venue 30d total) | `external-api.kalshi.com/trade-api/v2`; REST market data needs no key; WS requires a key even for public channels; anonymous rate limit NOT FOUND | ticker; single YES/NO contract per market; `mutually_exclusive` is not exhaustive; ladders via `strike_type`/`floor_strike`; milestones link sports fixtures; no search; `price_ranges[]` ticks | [08 §4, 16 §3.2, 14 §2.1] |
| **Limitless** | P1 | D ($3.33M) but X by depth (best-bid depth at most $90 on top-volume books) | `api.limitless.exchange`; public reads; numeric limit NOT FOUND; CDN `max-age=30` | native mirror hooks: `metadata.externalSlug` (90/100 sampled), `externalProvider:"polymarket"` (46/100), `isPolyArbitrage`, `externalRulesWatch.rulesHash` (the one native drift hook); YES-side books | [09 §2.3, 16 §0.1, §3.4, 16 V] |
| **Trueo** | P1 | X ($17.1K; TVL $1.06M; listed markets about $134K TVL, median TYD market about $1.6K) | No API. JSON-RPC `eth_call` (POST) on Base to an allowlisted RPC; undocumented home-page JSON and `api.trueo.com` exist but must not be used for automation | v2 markets on Uniswap v4 behind a hook; Base only (Ethereum migration announced 2026-09-21, no deployment); cancellation pays 0.5 TYD per token; resolution can sit unresolved for months | [11 §1, §5-§8, §11.2, 11 V-B] |
| **World** (PayBox official) | P1 (agent-supplied) | C ($13.1M; Solana) | Reads only through `use_plugin(world_*)`; catalogue not publicly queryable; our tools take its output as input | 11 tool names seen via third-party `get_contract` capture; `world_buy_outcome` is a PayBox-approved money tool | [14 §8.1, 05 V, 06 §9, 09 §1] |
| **Polymarket US** | P2 | A ($3.06B) | `gateway.polymarket.us` public REST (25 req/s); WS on the authenticated host | separate adapter: slug ids, one YES instrument per market, best-first books, no public tape on the retail gateway | [08 §3] |
| **Predict.fun** | P2 | B ($345.8M) downgraded to C (points farming; mainnet depth never sampled) | mainnet requires `x-api-key` on every read (240 rpm); testnet open | `polymarketConditionIds`, `kalshiMarketTicker` cross-refs (mostly Polymarket mirrors) | [09 §2.1, 16 §3.6] |
| **Opinion** | P2 | B ($276M) downgraded to C | keyless reads, 5 rps live (docs say 15 with key) | mirrored YES/NO books; thin depth; headline volume concentrated in two parent markets | [09 §2.2, 09 V-E2] |
| **Hyperliquid HIP-4** | P2 | C ($45.1M; attribution-dependent) | reads are `POST /info`; live shapes unverified | crypto up/down binaries only; terms exclude persons in an open-ended jurisdiction list | [09 §2.6, 09 V-C1, 14 V-A2] |
| **Manifold** | P2, signal only | play money | keyless, 500 req/min/IP | slow prior; duplicate-question lint for creation; terms permit bots | [09 §2.10] |
| SX Bet | skip | C ($38.9M) | books need `x-sx-api-key`; chain 4162 | sports only; weakest PayBox fit | [09 §2.7] |
| MagicMarkets | skip | C ($62.8M) | offers need a key and a 10 USDT deposit | custodial sports exchange | [09 §2.8] |
| Myriad, Probable, Rain | skip | X (Myriad real-money volume about hundreds of dollars per day; Probable $2.2K; Rain $0 since mid-September) | keyless reads | Probable `/markets/polymarket/{id}` is a cross-ref hook only | [09 §2.4, §2.5, §2.9, 09 V-C3] |
| PredictIt | skip | n/a | Cloudflare 403 | fiat, US-only | [09 §2.11] |

### 3.3 Fees (verified formulas; fee parameters are read per market at quote time)

| Venue | Taker formula | Parameter source | Confidence and notes | Cites |
|---|---|---|---|---|
| XO | `fee = C x (feeBps/10000) x p x (1-p)` per filled leg, added to a buy's cost and withheld from a sell's proceeds; maker 0 on rewards-eligible markets; maker rebate 35% of the taker fee | **Two disagreeing sources:** `GET /fee-rate` returns `base_fee: 0` for every token tried (including a nonexistent id and Pulse tokens where docs say 6%); Data API detail `effectiveFeeConfig.takerFeeBps` is 400 (16 of 25 random active, Sports/Football and Crypto), 800 (Esports), 0 (8 of 25); Pulse 600 | Formula **H**. Edge module uses `max(both)` and refuses `executable` until one real fill reconciles it | [10 §6.1, 10 V3, 02 V, 03 V] |
| Polymarket | `C x rate x p x (1-p)`, taker only, 5-dp rounding, minimum 0.00001 | Gamma `feesEnabled` plus `feeSchedule {rate, exponent, takerOnly, rebateRate}` and `feeType`; `/fee-rate` is not the fee | **H**. Docs say Sports 0.05 but live `sports_fees_nfl_cfb_oct26` and `sports_fees_v2` carry 0.03; categories: crypto 0.07, politics/finance/tech/mentions 0.04, others 0.05, geopolitics 0; all exponents observed were 1 (fail closed if not) | [08 §2.7, 08 V-A4, 10 V7] |
| Kalshi | `ceil_6dp(0.07 x M x C x p x (1-p))` plus a rounding fee to the cent grid (non-direct members) minus accumulator rebate | series `fee_type` and `fee_multiplier`, **plus event-level overrides and scheduled changes** (`/events/fee_changes`, `/series/fee_changes`) | Taker 0.07 is derivable from Kalshi's own worked example (0.07 x 0.055 x 0.945 = 0.00363825) and matches PolyKal's independent feed (**H-derived**); maker 0.0175 and the combo 0.5 multiplier **M** (consistent with the OpenAPI's 0.25 standard maker multiplier and with PolyKal, but no official fee schedule was readable); maker fees are per series (`quadratic_with_maker_fees`); PolyKal notes `KXMLBGAME` listed at multiplier 1 while the API returned 0.5 | [08 §4.10, 08 V-A7, 10 V6, 14 §2.6] |
| Polymarket US | `theta x C x p x (1-p)` | live fee schedule | docs read 2026-10-18 say 0.0695 (0.10 table tennis); a CFTC rule filing dated 2026-07-07 raised theta from 0.05 to 0.06 effective 2026-07-01 (the two are not reconciled); maker rebate tiers change 2026-10-19. Read live; **M** | [08 §3, 10 V5] |
| Limitless | buy 0.40% to 3.00% (paid in outcome tokens), sell 0.42% to 1.50% (USDC); takers only; new venue fee module since 2026-10-14 (signed `feeRateBps` is 0) | market `venue.feeModuleType` | **H** | [09 §2.3] |
| Trueo | stack: Uniswap LP fee (pool key `fee`: 0.80% on 14 of 20 listed markets, 1 pip on 6) + hook fee `feeNumerator/10000` (admin-settable, live value NOT FOUND) + price impact from `V4Quoter` + launchpad 5% on graduation and Live-phase withdrawals; Base gas about $0.03 per swap | pool key and hook reads | **H** structure, live hook value unknown | [11 §6] |
| Predict.fun | `base x min(p,1-p) x shares`, 0.018% to 2%, makers 0 | per-market `feeRateBps` (signed into the order) | **H** | [09 §2.1] |
| Opinion | taker 0% to 1%, minimum fee $0.25 on a $5 minimum order (a 5% effective rate) | docs | **H** | [09 §2.2, 09 V-E3] |
| Probable / Myriad / SX / HL | 0.01% to 1.75% / about 1.76% curve / 1% of winning profit / "currently zero" (third parties say charged on close or settlement) | docs and rows | Hyperliquid zero is unreliable | [09 §2, 09 V-E6] |
| World | NOT FOUND (Second Opinion models it as "all-in") | | | [05 §6] |

### 3.4 Resolution, void and eligibility (drives `basis_class`)

| Venue | Mechanism and void behaviour | Key numbers | Geo / bots | Cites |
|---|---|---|---|---|
| XO | MANUAL resolution (all active rows), creator-written rules and creator-specified `resolverAddress`; MODRA AI panel per ToS; `VOIDED` with refund path in each market's rules ("trades reversed or funds returned"); `CLOSED` means settled with a winner (2,390 of 2,390 sampled); no disputed status | non-Pulse close median about 16 min after resolve (n=70) | US, UK, France, Singapore, Ontario restricted, enforced by IP at login/transaction; bots allowed if compliant; wash trading, influence over outcome, multiple accounts, geo-masking prohibited | [02 §0.7, 03 V, 10 §4.2, 10 V10] |
| Polymarket | UMA OO (2 h challenge, dispute then DVM vote) or Chainlink; "Unknown/50-50" pays 0.50 per token; terms can change after bets (WSJ via Wikipedia, M) | 7.6% of top-1,000 closed 2026 markets had at least one UMA dispute (16.2% of volume; 27% in geopolitics-keyword markets, 1.2% sports-style); undisputed close median +3.6 h, disputed +100 h (p90 +439 h); 0.41% of protocol payouts were 50-50 | US close-only (frontend and API), geoblock by request IP; explicit bot clause NOT FOUND; co-location not for third-party apps executing for end users | [08 §2.10-§2.11, 15 §7, §8] |
| Kalshi | Exchange determination; lifecycle `determined -> disputed -> amended -> finalized`; scalar and last-price settlement exist; `can_close_early`; `settlement_sources` can change | determination-to-endpoint mean 322 s (max 7,133 s) | Developer Agreement v1.1 (2023): own trading only, no caching/aggregating/sharing, no facilitating other members; restricted list unverifiable | [08 §4.9, §4.12, 15 §7] |
| Limitless | Pyth/Chainlink/sports feeds, "external venue parity" for mirrors (settle within minutes of the source), manual for admin events | | US, "Republic of China", Ontario, Alberta excluded; bots explicitly allowed with rules (ToS 2026-09-15) | [09 §2.3] |
| Trueo | optimistic: 12 h windows, 5-member council (no timeout), operator-relayed escalation; CANCELED pays 0.5 TYD per token | markets can sit in `OpenForResolution` for months | Samoa operator; US Persons and a long territory list excluded; VPN circumvention banned; no bot policy | [11 §5.3, §9, §13] |
| World | NOT FOUND | | | |
| Predict.fun / Opinion / HL | UMA since 2026-03 / "Opinion AI" / protocol mark price | | Predict.fun and Opinion exclude US, UK, France, Ontario, Singapore and others and bar scraping but offer official keys; HL outcome markets use an open-ended "Excluded Persons" list | [09 §2, 09 V-C1] |

### 3.5 Trade path and PayBox reachability (summary; detail in section 6)

| Venue | Trade path | Class | Reachable via PayBox | Blockers |
|---|---|---|---|---|
| XO | EIP-712 order, owner signs a Kernel-wrapped digest (86-byte signature: `0x01`, then the validator address, then the ECDSA signature), HTTP POST with L2 HMAC credentials; account actions are ERC-4337 UserOps through XO's bundler | sign-and-submit | **partial** | per-user credential custody; PayBox wallet as Kernel owner (accounts are created in the beta.xo.market UI; no programmatic path documented); chain 3223 and typed-data acceptance in PayBox untested; autonomous-grant behaviour unresolved; funding is in-app only [01, 03, 06 §10] |
| Trueo | plain EVM calls on Base (USDC approve, Permit2 approve, `adapter.execute`; mint/burn/redeem); `Launchpad.deposit` needs a Permit2 signature | proposal | **yes** (mechanism); 2 to 4M gas simulation and 5-minute multi-step flows untested | none structural [11 §11] |
| Polymarket global | typed-data order plus L2 HMAC POST; approvals are Polygon txs | sign-and-submit | **partial** | Polygon at tool level unverified; human-created credentials; geoblock by request IP (server-side relay for restricted users = circumvention) [08 §9, §2.11] |
| Limitless | Base EOA, typed-data orders, HMAC token (UI or Privy headless route) | sign-and-submit | **partial** | credential creation [09 V-B3] |
| Predict.fun / Opinion | BNB EOA typed-data, API key from console | sign-and-submit | **partial** | keys; geo; thin depth |
| Hyperliquid | L1-action ("phantom agent") signing | sign-and-submit | **unknown** | official PayBox `hyperliquid` plugin is spot-only; outcome reachability unchecked [09 V-E5] |
| World | PayBox official plugin `world_buy_outcome` | other plugin | **yes** (Solana, separate custody island) | catalogue only via the plugin |
| Kalshi, Polymarket US, MagicMarkets, PredictIt | custodial/fiat/KYC accounts, API-key request signing | manual | **no** | a PayBox wallet can at most fund them through the venue's own deposit flow [08 §9] |

### 3.6 Data sources that are not venues

| Source | Role | Notes |
|---|---|---|
| Quotient | forecasts and gated signals | section 7 |
| DefiLlama (`api.llama.fi`, keyless) | liveness, 30d volume, `defillama_slug` join key; includes XO (id 8020) and Trueo (id 5251) | no data licence stated; read-time lookups only [14 §2.1] |
| PolyKal `fees.json` | independent dated fee feed for Kalshi and Polymarket | CC-BY-4.0, attribution; cross-check only [14 §2.6] |
| Prediction Almanac | registry schema and CC0 seed data (21 platforms; no XO, no Trueo) | borrow schema; consider upstreaming XO/Trueo [14 §2.4] |
| Kairos catalog, Illinois monitor, Prediction Hunt, pdata.world | benchmarks for link quality | no XO coverage; terms unclear; cross-check only [16 §5] |

---

## 4. Cross-venue matching

### 4.1 What the evidence says

- **No general cross-venue key exists.** Mirror hooks: Limitless (above), Predict.fun `polymarketConditionIds`/`kalshiMarketTicker`, Probable's Polymarket route. Polymarket, Kalshi, XO and Trueo expose none. Sports share third-party fixture ids (Kalshi milestones carry Sportradar ids on 826 of 4,000 sampled; Polymarket `opticOddsFixtureId`) that are join keys only if both venues use the same provider [16 §0.1].
- **Native grouping says "belongs together", not "how".** Neither Polymarket nor Kalshi encodes relation type, direction or exhaustiveness. Polymarket `groupItemThreshold` is an ordinal display index, not a strike. Kalshi `mutually_exclusive` means at most one resolves yes (not exhaustive). XO has `rootEventSlug` (detail only) and prose [16 §0.2, §0.3, §3, 16 V].
- **Third-party matchers cover Polymarket/Kalshi, not XO or Trueo.** Only Predictefy lists XO (closed beta; "nothing has ever been submitted to XO"; commercial use needs Enterprise) [16 §5.1, 16 V-K5, 14 §5]. pmxt is personal-use only on every plan [16 V-K6]. The sole independent audit (Prediction@Illinois of Kairos pairs, mostly sports, fixture-matched) found 99.1% to 99.5% aligned and 99.88% settling the same way over 7 days; sports are the easy case [16 §5.2].
- **Measured automatic matching for XO:**

| Experiment | Result | Caveat |
|---|---|---|
| XO Champions League vs Kalshi `KXUCLGAME` (18 matches, 54 markets): team-name token match plus date | 18/18 correct as top-1 (Wilson 0.82 to 1.00); 14 of 18 at similarity 1.0, the rest need aliases (Munich/München) | title and date level; sources and void rules still differ (Napoli vs Bodo/Glimt: XO voids on abandonment beyond 14 days) [16 §7.9a] |
| XO non-sports (98) vs Polymarket top-3 search results | 32 of 98 have a title-level identical counterpart; plain Jaccard at least 0.5: precision 0.78 (25/32); with number/direction/expiry gates: 23/23 | in-sample, single labeller, title-level [16 §7.9b] |
| Same gate code on a fresh 83 type-4 XO markets | 8 pairs: 5 identical, 2 ambiguous, 1 clear entity-swap false link (precision 0.625 strict, Wilson 0.31 to 0.86) | n=8 [16 V-K2] |
| Rule-level read of six title-identical pairs | no semantic mismatch, but every pair carries a cutoff offset (XO 23:59 UTC vs Polymarket 23:59 ET, about 5 hours), some differ in window start or measure ("price as displayed on Binance" vs "1-minute candle High") | Oddpool `identical` with a `timing` axis [16 §7.9c] |

### 4.2 Relationship types the engine represents (one payoff-matrix formalism)

Model each link as payoff vectors over a finite state set that includes void and alternative-resolution states; a price vector is arbitrage-free iff it lies in the convex hull of the payoff vectors [15 §0, §2]. Risk class decides the label:

| Type [15 §3.0] | Constraint on YES prices | Risk class | MVP |
|---|---|---|---|
| (b1) YES+NO in one market | `a_yes + a_no >= 1` (mirrored books cannot cross) | riskless in payoff space; "gaps" are stale prints | check only |
| (b2) partition / neg-risk set, exhaustive by rule | `sum a >= 1 >= sum b` | riskless if exhaustive and one resolver; void/dispute tail remains | yes (Polymarket, XO decision sets) |
| (b3) exclusive, not exhaustive | `sum b <= 1` only | short basket only | flag, never long basket |
| (c) threshold, date, bucket ladders | monotone in strike or date; bucket = difference | riskless inside one source and clock | yes (XO crypto ladders; check both axes: touch markets form a lattice, "ETH 2,900 by Oct 31" vs "3,000 by Dec 31" are incomparable) |
| (a) identical event across venues | `p_i = p_j` | **not riskless**: hedge with reserve unless approved link with no divergence axes | yes, labelled |
| (d) implication, (f) exclusive across events | `p_A <= p_B`; `p_A + p_B <= 1` | only if proven from rule text | candidates only |
| (e) joint/conditional | Frechet bounds | same facts and time | deferred |
| (g) correlated factor, (h) cross-asset | none | signal, never arbitrage | no |

### 4.3 Pipeline (hybrid, mostly offline) [16 §11]

| Layer | What | Runs |
|---|---|---|
| L0 native keys | Limitless `externalSlug`/`rulesHash`; Predict.fun/Probable refs; Kalshi milestones; Polymarket `gameId`/`opticOddsFixtureId`; XO `eventSlug` from the public liquidity-rewards earning-pools (14 of 15 rows) | candidates with provenance, not verified links [16 V-K4] |
| L1 deterministic templates | XO's templated catalogue: football `X to win / Draw / Y to win` triples (match by competition, date, canonical team plus alias table), FOMC/ECB/BoE decision sets, "Hit $K by date" ladders (equal strike, operator, cutoff within tolerance). Match whole sets at once | plugin-capable; also offline |
| L2 retrieval plus judge | blocking by category, date window, entity; embeddings for top-k (k=20 recovers over 99.9% of verified relations in the one published pipeline); judge contract below; Polymarket `public-search` as cross-search blocker (0.3 to 0.5 s per call) | offline only |
| L3 human approval | every link that can print a non-indicative label is approved once and pinned (rule hashes, close times, outcome map, reviewer, date) | PR or issue per link |
| L4 runtime verifier | every plugin call re-reads both legs and compares `rules.sha256`, status, close time, tick, fee model; any change sets the link `suspended` with no LLM involved | plugin |

**Judge contract (offline)** [16 §7.4]: output `{relation, basis_class, divergence_axes[], outcome_map, cutoff_delta_hours, void_policy_a/b, source_a/b, quoted_rule_fragments[], verdict: link | no_link | abstain}`; three independent samples or two models, unanimity required for `link`; any disagreement or non-allow-listed axis becomes `abstain`; market text in delimiters, no tools attached; precision reported with a Wilson lower bound from the gold set, never the model's verbalised confidence. Cost per 1,000 markets at k=5 single pass: about $0.85 (Haiku 5.5) to $17 (Sonnet 5.5) as lower bounds, since thinking tokens bill as output; embeddings $0.006 to $0.04; the Haiku-titles-then-Sonnet cascade is about $11 ($5.5 batch) [16 §10.3, 16 V-K9]. Only new or hash-changed markets are re-judged.

### 4.4 Failure modes and handling

| Failure mode | Evidence | Handling |
|---|---|---|
| Exception clauses (death, cancellation) | Khamenei "out": Polymarket $1.00 (UMA) vs Kalshi $0.02 scalar at last traded price (death carve-out) [15 §8.1 R1] | `condition_scope` axis; extract exception clauses into the link record; embeddings miss them |
| State vs event semantics | "Shutdown on Feb 14" paid YES on Kalshi, "new shutdown by Feb 14" paid NO on Polymarket [15 R2] | `outcome_kind`; reject unless equal |
| Clock and announcement vs occurrence | OPM-announcement ladders; Kalshi snapshot 10-11 AM ET vs 11:59 PM ET [15 R3, R4] | require equal cutoff or price the `timing` axis |
| Cutoff offset UTC vs ET | all six XO-Polymarket pairs read at rule level [16 §7.9c] | hedged tier with `cutoffDeltaH` reserve |
| Different named source or station | NYC temperature: Kalshi Central Park vs Polymarket LaGuardia [15 R5] | compare named sources; re-read `settlement_sources` every refresh |
| Subset by resolution trigger | 2024 election: media call vs inauguration [15 R6] | type (d), one direction only |
| Oracle design | UMA vote vs exchange determination vs XO MANUAL | XO pairs are `settlement_source` by default [10 §4.2] |
| Entity or direction swap | Mamdani vs Hansen (Person of the Year); ECB hike vs "decrease"; Digger vs The Odyssey [16 §7.9b, V-K2] | numeric/direction gates are necessary, not sufficient; human approval |
| Intra-XO duplicates across types and creators | Zcash $2000 and Arsenal Premier League each exist as a type-2 and a type-4 market [16 V-K3] | within-venue identity links; a cross-venue link to one is not a link to the other |
| Mirrors differ in structure | Polymarket "What price will Ethereum hit" 20 markets vs 14 on Limitless [16 §3.4] | map sets, not just pairs |
| Augmented neg-risk and placeholders | "Only trade on named outcomes" [08 §2.4] | named outcomes only; short-basket direction only |
| Stale or edited rules | Kalshi can edit `rules_secondary`; Polymarket can clarify; `can_close_early` | L4 hash check; auto-suspend |
| Sports orientation | Quotient rows are for `sports.yes_side`; a Quotient bug (fixed in 17.11.0) priced second-listed-team markets against the wrong side [12 §10.3, 12 V] | map outcome to token ids before any edge |
| Prompt injection | market titles and rules are creator-written | `Untrusted<>` wrapper |

### 4.5 Evaluation and promotion rule

No public rule-level labelled corpus exists [16 §8]. Build a gold set: sample the pairs the system would actually surface (stratified by score band and relation claim, not random pairs), double-label on the Oddpool axes (second labeller on 20%), add silver labels from mirror hooks and post-settlement disagreement, and re-label on any hash change. About 203 labelled links are needed for 0.95 plus or minus 0.03, 381 for 0.99 plus or minus 0.01. **Promotion rule (D2):** the `executable_arbitrage` label stays disabled until (a) 200 or more gold links give a Wilson lower bound of at least 0.97 per class used, and (b) two real XO fills have reconciled the modelled fee to the charged fee.

---

## 5. Edge methods

### 5.0 Notation and the friction stack

- Leg on venue `v`: buy YES at ask `a`: cost per share `a + phi_v(a)`. Sell at bid `b`: proceeds `b - phi_v(b)`. NO ask on a mirrored book is `1 - bid_YES`.
- `phi_v` from the venue's `FeeSpec` (section 3.3). For curve venues `phi = theta p (1-p)`; fee depends on price level, not quantity, so the LP stays linear [15 §4.3].
- `lambda = rho x T / 365` is the capital-lock charge per $1 deployed, `T` the **latest plausible** resolution among the legs including the dispute tail; `delta` the resolution-risk haircut per $1 payoff; `eps` a legging reserve; `g` fixed costs (gas, bridge) per order.
- Per-share net edge of a cross-venue complement pair: `e_net = 1 - a - b - phi_A(a) - phi_B(b) - lambda (a + b + phi_A + phi_B) - delta - eps - g/q`.
- Marginal stopping rule: walk both ladders together, take `min(size_A, size_B)` at each step, stop when the marginal `e_net` at the next level is at most the threshold `tau` (D: 0.5 cent per share). The best-priced level is not the size to trade [10 §6.2].
- Break-even gross spread at mid prices is `(theta_A + theta_B)/4`: 2.75 cents for XO at 400 bps plus Kalshi at 0.07; 2.0 / 2.5 / 3.5 cents within one Polymarket venue at rates 0.04 / 0.05 / 0.07 [15 §4.3, 10 §6.3].

### 5.1 Method A: fee-adjusted cross-venue spread with depth-walked VWAP

**Gates (all must hold for a non-indicative label)** [10 §5, extended]: approved `verified` link with unchanged hashes; both markets tradable, not near close, no UMA proposal/dispute flag; live non-synthetic ladders with leg timestamp skew within limit (D: 5 s `executable`, 60 s `hedged`, else `indicative`); verified fee model on each leg (XO: `max` of the two sources and refused until reconciled); net marginal edge above `tau`; per-venue funding present and eligibility check passed (at the user's client, section 10); leg ordering and unwind plan (section 6.3); caps respected.

**Example 1 (synthetic numbers, formulas verified; all arithmetic with Decimal).** Buy YES on an XO football market, buy NO on the Kalshi twin. XO `takerFeeBps` 400 (the max of `/fee-rate` = 0 and Data API = 400); Kalshi 0.07, multiplier 1. Hold 7 days, hurdle 8% APY, basis plus legging reserve 1.0 cent (D), `tau` 0.5 cent. Ladders: XO YES asks 0.320 x 200, 0.326 x 300, 0.334 x 500; Kalshi NO asks 0.620 x 150, 0.626 x 400, 0.632 x 600.

| Step | XO YES | Kalshi NO | Qty | Gross/sh | Fee XO | Fee K | Lock | Reserve | Net/sh | Take |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0.320 | 0.620 | 150 | 0.0600 | 0.008704 | 0.016492 | 0.001442 | 0.0100 | +0.023362 | yes |
| 2 | 0.320 | 0.626 | 50 | 0.0540 | 0.008704 | 0.016389 | 0.001451 | 0.0100 | +0.017456 | yes |
| 3 | 0.326 | 0.626 | 300 | 0.0480 | 0.008789 | 0.016389 | 0.001461 | 0.0100 | +0.011362 | yes |
| 4 | 0.334 | 0.626 | 50 | 0.0400 | 0.008898 | 0.016389 | 0.001473 | 0.0100 | +0.003241 | stop (below tau) |

Totals for steps 1 to 3: 500 shares, capital $473.90, gross $26.10, fees $12.587 (a top-of-book scanner sees 6.0c gross, and fees alone take 2.52c or 42% of it), net of fees $13.51, lock $0.73, reserve $5.00, **net $7.79 (1.64% of capital in 7 days)**. With the author's $10 cap on the XO leg: 31 shares, **net about $0.72**. XO fee sensitivity at step 1: 0 bps gives +0.0321, 400 bps +0.0234, 800 bps +0.0147 per share, which is why the XO fee conflict blocks the `executable` label. Kalshi's order-level rounding (to the cent grid) adds cost on a 31-share order; the module re-prices the chosen integer lot with the exact rule after the smooth-formula walk [15 §4.3, §4.4].

### 5.2 Method B: within-venue complement and negRisk / partition sets

Long set: `E_long = 1 - sum a_i - sum phi(a_i)`. Short set (buy every NO): `E_short = sum b_i - 1 - sum phi(b_i)`. Only for sets that are exhaustive **by rule** (Polymarket non-augmented neg-risk with the default rule read from `description`; XO decision sets whose rules say exactly one resolves yes). Kalshi `mutually_exclusive` sets and augmented neg-risk sets allow the short basket only [15 §3.2 b3]. XO has no neg-risk conversion (`neg_risk` is always false), so there is no capital-recycling variant on XO [16 §3.3]. General case: exact LP over states with level columns (ask and bid ladders), fee-adjusted prices, a budget row, optional void rows; `t* > 0` iff arbitrage; the dual is a probability vector over states and doubles as a no-arbitrage certificate for logs [15 §4.1-§4.4]. A tested stdlib reference solver and vectors are in [15 App. A]; port to TypeScript with exact rationals.

**Example 2 (Polymarket, politics rate 0.04, three named outcomes, exhaustive by default rule; 100 sets):** asks 0.30 / 0.34 / 0.33, sum 0.97. Gross $3.00; fees `100 x 0.04 x (0.21 + 0.2244 + 0.2211)` = $2.622; net of fees **$0.378**; capital $99.62; 60-day lock at 8% = $1.31, **net -$0.93**. A dispute tail adds little (lock $1.311 / $1.317 / $1.334 at P(dispute) 1.2% / 7.6% / 27% with a 4-day delay) but the set is already negative on lock alone. Same-venue complement check (YES 0.47 + NO 0.51, 100 shares, politics 0.04): gross $2.00, fees $1.996, net **$0.004** [10 §6.3]. Live depth-aware LPs on three real sets showed the same shape: taker fees removed 76% to 99.8% of gross, and an 8% APY hurdle over 65 to 439 days removed the rest [15 §6.4].

### 5.3 Method C: ladder, bucket and implication checks

Constraints in [15 §3.3, §3.4]: `p(G_k1) >= p(G_k2)`; cumulative date contracts increase with date; bucket = difference of ladder rungs; implication `A => B` gives `p_A <= p_B` with edge `b_A - a_B - fees`. Detect ladder type before applying constraints (equal strike plus date discriminator is a date ladder; a scan that sorted by strike alone produced two false flags on Kalshi) [16 §4]. Base rates are tiny: Polymarket 3 violating adjacent pairs of 3,651, cross-event implication 2 of 271, Kalshi 0 of 7,274 [15 §6.3]. The one net-positive family seen in the correlation study was an intra-Kalshi identity (rate above 4.00% vs hike 25 + hike more than 25): 42 of 8,640 five-minute bins (0.49%), up to 5.5 cents, from wide parent quotes with depth unknown [18 §0.9]. Ship these as **alerts with a mid-vs-executable label**, a creation burn-in, a settlement-point filter and a status filter [18 §4].

### 5.4 Method D: forecast-vs-price edge from Quotient

`EV_yes = q_eff - (a + phi(a))`, `q_eff = m + lambda_q (q - m)` where `m` is the venue mid, `q` Quotient's probability for the same side (oriented to the venue's outcome), and `lambda_q in [0,1]` a shrinkage factor to be **estimated from the user's own logged forecasts and resolutions** (Quotient's history cannot be audited and its edge is small, section 7). Quotient's own `spread` is built on a *selected* quote (midpoint, bid, ask, last or graph snapshot), not an executable ask; always recompute from the venue book [12 §10.4].

**Example 3 (Polymarket YES, politics 0.04, non-sports, `q_coverage == forecasting`):** ask 0.54, mid 0.535, `q` = 0.62. Fee per share `0.04 x 0.54 x 0.46` = 0.009936. Unshrunk EV/share = 0.62 - 0.54 - 0.009936 = **0.0701** (about $1.30 on a $10 order of 18.5 shares) and Quotient's spread reads 0.085. With `lambda_q` = 0.5: q_eff 0.5775, EV 0.0276 ($0.51). With 0.25: q_eff 0.55625, EV **0.0063 ($0.12)**. With 0.1: -0.0064. The $0.02 `mispriced` scan is shared across many candidates, so cost is not the constraint; shrinkage and fees are. Anchors: pooled Brier advantage 0.0029 (CI 0.0003 to 0.0053) falls to +0.0009 (CI -0.0018 to +0.0036) excluding forecasts dated on the scheduled end date, about 0 at lead of 2 or more days; a "follow the spread >= 0.08" paper test returned +10.4% with no slippage and +6.0% (CI 1.8 to 10.5) with 2-cent slippage on non-sports, -4.8% on sports, with stored prices, no fees and no depth [12 V-Corrected 4-5, 12 §7.3]. Default `lambda_q` = 0.25 until at least 200 resolved logged forecasts exist (D).

### 5.5 Method E: capital lock, settlement and withdrawal friction

`T = T0 + P(dispute) x Delta` using the latest resolution among legs; Polymarket evidence: P(dispute) 7.6% overall (27% geopolitics-keyword, 7.0% other, 1.2% sports-style; rises with volume rank), Delta about 4 days at the median and 18 days at p90 (disputed close +100.1 h vs undisputed +3.6 h) [15 §7]. XO and Trueo have their own tails (Trueo council has no timeout). Venue **custody islands**: no atomic cross-venue transfer; XO funding and withdrawal are in-app provider flows with no documented limits (inbound and outbound transfers all run via Base) [03 §3, 03 V]; Kalshi crypto deposits take up to about 30 minutes and withdrawals require a prior crypto deposit [08 §4.11]; Polymarket bridge minimum about $2 [08 §2.8]; XO's engine also cancels resting orders LIFO when the indexer sees an on-chain balance drop, which matters when funds are moved between venues [01 V]. Amortised rebalancing cost per trade: `(C_in + C_out) / N`; where a fee is unknown the tool returns `friction_unknown` and downgrades the tier (fail closed).

**Example 4 (same pair as Example 1, step 1, a 45-day political-style horizon, 27% dispute tail of 4 days):** cost per share 0.965196; `T` = 46.08 days; lock per share 0.009748; net edge before lock 0.034804, after lock **0.025056**. With a placeholder $2.00 fixed rebalancing cost (illustrative; the real XO bridge cost is NOT FOUND): amortised $2.00 / $0.40 / $0.10 per trade at 1 / 5 / 20 trades per rebalance; keeping rebalancing under 25% of profit needs about 319 shares (about $308 of capital), roughly 30 times the author's $10 per-order cap. At the caps, any fixed friction of more than a few tens of cents consumes the trade.

### 5.6 Method F: resolution-risk haircut

For a hedged pair with unit payoff in the agreeing states, cost `C` per share and probability `delta` of an adverse divergence that pays 0: `EV = (1-delta)(1-C) - delta C = 1 - C - delta`. So the haircut per share is exactly `delta`, and **a pair breaks even when the adverse-divergence probability equals its net edge** `e = 1 - C`. The robust version adds explicit void and alternative-resolution rows to the LP and maximises the worst case; for any unhedged cross-venue pair the worst row is negative, so a robust LP prints no riskless pair, and the label becomes `hedged_discrepancy` sized by a loss budget (max loss = notional, capped by the per-order cap) [15 §4.5, §4.7 case D].

Anchors: Illinois monitor, sports pairs 14,480 of 14,498 settled the same way (0.12% differ; fixture-matched, the easy case); Polymarket 50-50 payouts 0.41% of protocol records; UMA disputes 7.6% [16 §5.2, 15 §7]; two of the verified cross-venue incident pairs diverged in payout (R1 and R2; selected incidents, not a rate). **D defaults for `delta` (to be calibrated, not findings):** identical basis with no axes and fixture-matched sports 0.25% to 0.5%; `timing` axis only 1% to 2%; `settlement_source` (XO MANUAL vs UMA or exchange) 5%; `condition_scope` or any unresolved axis: never labelled arbitrage.

**Example 5 (Example 1 step-1 pair, cost 0.965196, e = 0.034804):** EV per share at `delta` 0.12% / 0.5% / 2% / 5% = +0.0336 / +0.0298 / +0.0148 / -0.0152. Three-state check (97% agree; 2% adverse divergence paying 0; 1% Kalshi voids and refunds at last price 0.62 while XO resolves NO): EV +0.0110, worst case -0.9652 per share.

### 5.7 Stack, tiers and labels

Full stack for the step-1 pair (45-day horizon, `delta` 2% for a timing axis, `eps` 0.2 cent): gross 0.0600; fees -0.0252; lock -0.0097; haircut -0.0200; legging -0.0020; **net +0.0031 per share, 5% of gross** (below `tau`, so the label is `indicative_discrepancy`, not `hedged`). In the correlation panel, spread and taker fees together remove about 90% of the apparent mid-gap before any lock-up charge (mean share of the gap that survives: after spread 50.6%, after fees 9.3%, after a 5% hurdle 3.0%, after a 20% hurdle 0%) [18 §2.6, §4].

| Tier | Meaning |
|---|---|
| `structural_violation` | within one venue and clock, payoff-space riskless after fees and lock (rare; alerts) |
| `executable_arbitrage` | cross-venue, approved link, basis identical, no axes, every gate passes (**disabled until D2**) |
| `hedged_discrepancy` | positive net with an explicit reserve (timing axis, MANUAL vs exchange) |
| `indicative_discrepancy` | candidate link or any failed gate; machine-readable reasons |
| `model_edge` | Quotient/consensus fair value vs ask; directional; always shrunk |
| `relative_value_signal` | factor/cross-asset; no constraint |

### 5.8 What the evidence says about frequency

Literature headlines exist (Saguillo et al.: $39.6M across 2024-25, 73% from neg-risk partitions, zero fees then; Gebele and Matthes: 2 to 4% execution-adjusted cross-venue deviations; Zhai and Shi: 2.2% of committed capital) but they aggregate over many actors and months, are partly pre-fee or unreplicated, and per-episode 2026 profits are small (NBA: about $0.5 to $30 per capped episode; median negRisk episode 16 s) [15 §5.2, §6.1, §7]. Our own snapshots found almost none. Hence the tooling stance: scan partitions first, ladders second, cross-venue pairs third; surface rare hits; present everything else as reference prices and risk.

### 5.9 Deliberately out of MVP

Lead-lag and mean-reversion features: in 273 directed rule variants (n at least 30) only 2 were net positive, both artefacts of a post-resolution book and a fee-free category; the best statistically significant case earned +0.17 cent gross and -3.54 cents net; same-event Fed-pair spreads mean-revert (half-life 6 to 8.5 h) but cost 3.9 to 8.5 cents round trip [18 §2.9, §4]. The only horizon with strong structure is one day or longer (daily rho 0.5 to 0.97; out-of-sample hedge variance reduction 34% to 97%), where the benefit is variance, not profit. Polling hourly is enough for signals; keep your own history because Polymarket serves 1-minute data for about 7 days and XO has no usable history [18 §4, §2.10].

---

## 6. Read-only analysis vs execution through PayBox

### 6.1 Executability classes

| Class | Meaning | Who executes | Approvals |
|---|---|---|---|
| **E1 proposal** | plugin returns one `io.paybox/transactionProposal` (EVM call from the user's own EOA, at most 5 minutes) | PayBox simulates, user or grant approves, vault signs | per proposal; EOA pays native gas |
| **E2 sign-and-submit** | plugin `prepare` computes the digest and a human-readable quote; agent calls `request_wallet_sign` (`typedData` or `raw`); plugin `submit` recomputes the digest, `ecrecover`s the owner and POSTs | agent orchestrates; credentials held by the user's own environment or an owner relay | whether autonomous grants auto-sign is unresolved (docs conflict) [04 §10.2, 05 V, 06 §6] |
| **E3 other PayBox surface** | `use_plugin(world_*)`, `use_service`, `pay_x402` | agent | PayBox money-tool approval |
| **E4 manual** | custodial/fiat/KYC venue; the plugin emits instructions only | the human | n/a |
| **E5 unsupported** | | | |

### 6.2 Per-venue execution map (explicit about what PayBox cannot do)

- **XO (E2, plus UserOp-style account actions).** Orders are EIP-712 (`XO Market CLOB`, v1, chain 3223, exchange contract pinned in code), `signatureType` 3 only; the owner EOA signs a Kernel-wrapped digest (standard EIP-712 `Kernel(bytes32 hash)` under the account's own domain), wire format `0x01 || validator || ecdsa` (86 bytes); the plugin can recompute the digest and check the returned signature before submitting [01 gates 2-3, 07 §0]. Approvals, redeem and split/merge are **ERC-4337 UserOps through XO's bundler**, not EOA transactions on chain 3223, so the plan's assumption that `xo_enable_trading` and `xo_redeem` are proposals is likely wrong; the proposal path applies to source-chain funding only [06 §10 (M)]. Unresolved gates: per-user credential custody (derive-returns-secret is genuinely unresolved, plan for storage and key-slot lockout [01 V]); PayBox wallet as Kernel owner; chain 3223 and Kernel typed data in PayBox; XO funding. **Signed XO orders are bearer instruments**: the signature has no timestamp and `expiration` 0 means never, so every plugin-prepared order must carry a short non-zero GTD expiration inside the signed hash [01 V-missed].
- **Trueo (E1).** First buy is 2 to 3 proposals (USDC approve to Permit2, `Permit2.approve`, `adapter.execute`), each its own request with a fresh quote, because a plain EOA cannot batch (a multicall's `msg.sender` would be the multicall contract). The swap strategy accepts only the user (or the adapter, which forwards) as `TAKE` recipient and reverts otherwise. `Launchpad.deposit` needs an EIP-712 Permit2 `PermitTransferFrom` signature embedded in calldata (E2 for that one step). Funding a Trueo market's launch (about 200 TYD observed) collides with the caps unless others fund it [11 §11.3, 11 V-B].
- **Polymarket global (E2, not planned).** Typed-data orders on Polygon plus L2 credentials; PayBox's Polygon support is vendor-announced, not tool-verified. Orders must not be relayed from a server for users in restricted jurisdictions: Polymarket geoblocks by request IP and its attestation prohibits circumvention [08 §2.11, §9].
- **Limitless, Predict.fun, Opinion (E2, not planned).** EOA signing but human-created credentials and geo limits; Limitless has a documented headless Privy token route whose feasibility for an agent wallet is open [09 V-B3].
- **World (E3).** The agent calls `world_*` tools directly; PayBox pauses money tools for approval; Solana custody is a separate island from XO's EVM chain.
- **Kalshi, Polymarket US, MagicMarkets, PredictIt (E4).** Not tradable from PayBox: USD accounts with API-key (RSA-PSS or Ed25519 over `timestamp+method+path`) request signing, KYC, and for Kalshi a Developer Agreement barring facilitation of other members' trading. A PayBox wallet can only fund them through the venue's own deposit flow. The plugin must render these legs as instructions ("place this on Kalshi manually") and never attempt to sign requests [08 §9, §4.9].
- **Lead, not verified:** MoonPay's separate CLI skills (`moonpay-prediction-market`, `myriad-prediction-markets`) can trade some of these venues outside PayBox [06 §9, 06 V]. Agents may use them; they are out of this plugin's scope and unverified here.

### 6.3 How the agent orchestrates legs and unwinds

The agent is the orchestrator because a plugin cannot call tools or other plugins [05 P20]. The plugin's contribution is a deterministic, verifiable plan.

1. `pm_find_edge` returns a candidate with `edge_id`, tier, per-leg quotes and `valid_until` (D: 60 s).
2. `pm_plan_legs` **re-quotes** both legs within the call and returns the Leg Plan: ordered legs, each with executability class, size (the minimum of the cap, displayed depth at `tau` and the smaller leg's fillable depth), limit price, GTD expiry, required preconditions (funding on each venue, trading enabled, XO `/trading-state` active, rule hashes unchanged, eligibility attested by the user), estimated **unwind cost** per leg (spread plus two taker fees, using the live book), and abort conditions. Least liquid or riskiest leg first; size to what the second leg can fill [10 §5.7].
3. For each leg the agent runs its class flow. XO leg: `xo_prepare_order` -> `request_wallet_sign` -> poll `get_request` on the same `request_id` -> `xo_submit_order` -> reconcile by order hash. Never re-issue the original write; never auto-retry after an ambiguous failure (a "duplicate order" 400 only proves the first submit landed and is resting; absence of it after a lost response does not make a blind retry safe) [04 §5.5, 07 V].
4. Between legs, re-run the remaining-edge check against fresh books: human approvals and signing windows take seconds to minutes, while documented mispricing episodes last a median 3.6 to 16 seconds. If remaining net edge is below `tau`, or leg 1 filled less than the plan's minimum, choose: (a) unwind leg 1 at the current bid (cost known from the plan), (b) hold as a disclosed directional position within the per-order cap, or (c) complete leg 2 only if still above break-even. Maximum unhedged exposure never exceeds the per-order cap.
5. Cross-venue legs are never atomic. The plan states this and prices the legging reserve `eps`.
6. After fills, positions and claimables are readable publicly by address on XO (`/positions`, `/claimable`); redemption later follows each venue's own path.

### 6.4 Caps and guardrails interplay

| Guardrail (author) | Interplay |
|---|---|
| $10 per order | Enforced by the plugin on every plugin-prepared XO order and Trueo proposal, from owner env, not from agent input (no bypass parameter). Non-plugin legs (Kalshi manual, World) are advisory |
| $50 per day | A two-leg pair consumes two orders; two maximum-size pairs exhaust the day. The plugin is stateless, so the counter must be read-derived, on-chain, or held by an owner backend [04 §9.3]. Whether funding and withdrawal count toward the cap is still an open author decision |
| 2 markets created per day | Not touched by aggregation; v0.3 creation lint may call `pm_*` tools |
| Boundary | Plugin caps do not bind an autonomous agent calling PayBox tools directly; real spend control belongs in the PayBox grant (`always_approve` or `iframe` for the XO wallet) [06 §10] |
| Data spend | Separate: dedicated "data" credential, suggested at most $0.05 per call and $2 per day, outside the trading caps [12 §10.6] |
| Kill switch | env flag plus XO `GET /trading-state`; `pm_*` read tools keep working when execution is off |
| Self-trading | allowed by decision, marked in outputs; see section 10 for the clause conflict |

---

## 7. Quotient integration

**Role.** Quotient Solutions, Inc. runs a forecast and signal API (OpenAPI 20.5.0, 27 operations; the Render gateway is its official production host, byte-identical to the spec served from `dev.quotient.social`) [12 §0-§1]. It publishes (a) "Q" calibrated YES probabilities, (b) separately gated "signals" (at most one per market, 7 to 14 day horizon), (c) a "mispriced" scan of Q vs a live venue quote. Its own text says it is research, not advice or execution. It never prices XO or Trueo.

**Coverage.** `polymarket`, `polymarket_us`, `kalshi`, `hl_outcomes`; only Polymarket International and Kalshi get verified live quotes, so `mispriced` is effectively those two venues; Limitless was removed in 17.0.0. The task-list endpoints are partly stale: `/markets/{slug}/signals` is article evidence, `/signals/perps` is deprecated [12 §0, §6].

**Minimal, cost-aware endpoint plan** [12 §10.2]:

| Purpose | Call | Price | Use |
|---|---|---|---|
| Track record | `GET /api/public/performance` | free, cached 30 min | show favourable 60-day and all-time rows together |
| Candidates | `GET /api/v1/markets/mispriced?min_spread=0.08&max_forecast_age=24&sort=quality&venue=<polymarket or kalshi>` | $0.02 | watchlist of model-vs-quote gaps, not "Quotient says buy" |
| Published ideas | `GET /api/v1/signals?status=active&min_conviction=2&exclude_drawdown_risk=true&min_capacity_usd=<10x size>&sort=quality` | $0.01 | only `entry_eligible: true` counts |
| Enrichment | `GET /api/v1/markets/lookup` (up to 10 keys) | $0.005 | thesis and key factors for a shortlist |
| Why / what changed | `GET /api/v1/markets/{marketKey}/forecast?history=3` | $0.01 | on user request |
| Never | `/portfolio` (leaks the wallet), X endpoints ($1), `forecast-availability` (about 30 s latency) | | |

**How it feeds the XO edge finder.** XO markets are not covered, so Quotient reaches XO only through an **approved link** to a covered twin:
`XO market -> link -> Polymarket/Kalshi twin (marketKey) -> Q probability -> q_eff -> compare with the XO ask`.
Use Quotient's own `match` block only when `match_level == same_outcome` and `settlement_match == exact` (it appears on signals only, capped at 50, and "a same-outcome link can have different rules"); otherwise label the output "related, not equivalent" [12 §5.4, §10.3]. The join key is `marketKey` (`polymarket:<id>`, `kalshi:<ticker>`, `polymarket_us:<id>`, `hl_outcomes:#<id>`), never question text. Orientation: sports rows are probabilities for `sports.yes_side`; non-sports use the venue YES; map to token ids before any edge.

**Defaults and filters.**
- Default `q_coverage == forecasting`; show `experimental` (all sports) only behind an explicit opt-in with a visible label (60-day paper test: no sports edge). Note the spec text for `experimental` is stale about price markets, so a `forecasting` filter admits price markets whose record is not isolated [12 V-Missed].
- Reject or demote on: stale or `graph_snapshot` quote, `inDispute`, `entry_eligible == false` or `in_play`, `forecast_status.state` in (`warning`, `caution`), `drawdown_risk_elevated != false` (null means unknown, not safe), capacity below size, `q_coverage == under_review`, forecast older than the configured window (D: 24 h).
- Treat Q as a **prior and ranker**: shrink (`lambda_q`, section 5.4), and prefer agreement of Q, consensus mid and the XO ask over any single source. No demonstrated edge beyond about the last two days to the scheduled end date once same-day forecasts are excluded; the pooled negative at 7 or more days is not statistically distinguishable from zero [12 V-Corrected 4-5].
- Log your own snapshots at fetch time (`forecast.id`, `created_at`, probability, quote, your own book mid) and score against resolutions; Quotient's `as_of` reads and CSV cannot prove no back-fill [12 §7.4].

**Payment (agent side only).** `discover_services("quotient")` -> free unpaid GET to the exact URL (the 402 is free) -> pin the tuple (scheme `exact`, network `eip155:8453`, USDC on Base, constant `payTo`, `maxTimeoutSeconds` <= 300, amount at most 2x the table price; host equals the pinned gateway) -> `use_service` from the dedicated data credential, or `pay_x402` manually; poll `get_request` on the same `request_id`; use the `payment-identifier` extension on retries [12 §10.6]. The plugin provides pure tools: `pm_signal_request` returns the canonical URL, expected tuple, price ceiling and purpose; `pm_signal_parse` validates a paid body against a pinned schema (ignore unknown fields, **fail closed on unknown `entry_status` or `venue`**), normalises units (0-100 vs 0-1, side-relative cents) and returns rows joined to registry links. Plugin-initiated `kind: "x402"` proposals (EchoMarkets style) are possible for GET routes but put payment initiation in plugin code and cannot send the API-key header; not used. Brokered headers would let a plugin send `x-quotient-api-key`, but the key would be owner-level and shared by every installer, which collides with Terms s6 ("share or resell access") [12 V-Missed].

**Caching.** Per user and per run only, in the agent; never a shared server-side cache or a bundled dataset of Quotient output (Terms s6: no copying, republishing or redistribution; no competing signals product). Immutable `forecast.id` can be remembered indefinitely by the agent; mispriced and signals lists 5 to 15 minutes; never use a cached spread for execution [12 §10.7].

**Terms and disclosure.** Licence is "personal or internal business purposes"; no commercial or redistribution licence is published; request written permission before any shared cache, public aggregation or listing (contact is in `docs/research/12-quotient.md` §8). Disclose with every Q number: forecast timestamp and age, `q_coverage`, `quality` tier with basis and sample size, quote source and age, that figures are hypothetical paper results excluding fees and slippage, that the signals record mixes historical replays with live signals, and that the pooled edge is small [12 §10.9]. API churn is high (seven breaking majors; 20.0.0 on 2026-10-07 to 20.5.0 on 2026-10-15) and there is no SLA, so Quotient must stay optional and the aggregator must work on venue prices alone [12 §6, 12 V].

**Other signal sources.** Polymarket/Kalshi consensus mid on matched twins (free, executable-price based); Manifold as a slow play-money prior and duplicate-question lint for creation [09 §2.10]. Cross-venue disagreement x402 feeds ($0.05, undocumented methods) are cross-checks at most [14 V-A5].

---

## 8. Caching, rate limits and staleness

### 8.1 Where caching can exist

The plugin has no cross-call memory. Allowed: (1) **in-invocation memoisation** of repeated fetches; (2) **bundled static data** (registry, fee tables, venue metadata); (3) **agent-held data** passed back in as tool inputs (for example a prior `pm_get_quote` result's `quote_id` and book hashes for change detection, never as trust); (4) upstream HTTP caches (Limitless CDN `max-age=30`; Quotient `max-age=300` OpenAPI); (5) an optional owner backend (Option B dataset, history snapshotter). Anything that needs shared or persistent state is offline.

### 8.2 Rate-limit budget

Limits are **per source IP, and PayBox sandboxes share egress IPs** (public RPCs rate-limit shared sandbox IPs [04 §6.3]); how many IPs serve the sandbox is unmeasured, so treat published limits as shared pools.

| Venue | Binding limit | Cheapest bulk read | Per-call plan |
|---|---|---|---|
| XO | orderbook public 5 req/s; Data API 100 req/10 s documented, 429 after about 35 requests in 20 s observed; 3 public WS connections (unused) | one `GET /book` per token; `GET /last-trades-prices` accepts a JSON body on GET; `POST /books` documented, untested | at most about 8 XO book fetches per call; discovery via Data API pages of 50 |
| Polymarket | Gamma 300 to 900 req/10 s; `/book` 1,500/10 s; `/books` 500/10 s; Data v2 800/10 s | `POST /books` (max 500) after a live test; Gamma keyset 100 per page | batch where tested, else per-token GET |
| Kalshi | authenticated token buckets (Basic: 200 read tokens/s, 10 per request); anonymous limit NOT FOUND | `GET /markets/orderbooks?tickers=A&tickers=B` (max 100 per call, repeated params) | one batch call per link family |
| Limitless | no numeric limit found; honour `Retry-After` | per-slug `/orderbook` | one per leg |
| Opinion | 5 rps unauthenticated | | P2 |
| Polymarket US | 25 req/s per IP | | P2 |
| Quotient | 20 rps / 600 rpm / 20,000 per day per payer | | agent-side |
| PayBox | 1 start per second, 1,000 per rolling 24 h per user (applicability to end users unclear) | | few, fat calls |

A page-evaluating `pm_find_edge` (section 9) should resolve three to five links per call (about 3 requests per link) and return a cursor; the agent decides how often to sweep. Continuous scanning is an off-plugin watcher, not a plugin feature.

### 8.3 Staleness handling

| Item | Rule |
|---|---|
| Book age | use venue timestamps where they exist (Polymarket/XO `timestamp` ms and `hash`; Predict.fun `updateTimestampMs`; Opinion `timestamp`); Kalshi books carry none, so use fetch time with RTT; Limitless guarantees no freshness bound |
| Leg skew | non-atomic multi-leg reads: sequential books are about 0.3 s apart and event timestamps across four sets spanned about 4.5 minutes in one study [15 §4.4]; require skew within limit (D: 5 s `executable`, 60 s `hedged`) |
| Quote validity | `valid_until` 60 s (D); `pm_plan_legs` always re-quotes |
| Market state | reject when UMA proposal/dispute flag, Kalshi `disputed`/`amended`, XO `PAUSED` or `/trading-state` paused, Trueo derived status not trading, Limitless maintenance (`425`), within a configurable window of close; XO Pulse rows can be ACTIVE past `expiresAt`; "closed=false and acceptingOrders" on Polymarket is not proof of unresolved |
| Rules | recompute `rules.sha256`, close time, status per leg every call; mismatch suspends the link |
| Registry | per-field `ttl_days` (7 liquidity, 30 fees/geo/API); expired reads `unknown`; unknown fee model fails closed |
| Schema drift | pinned schemas; unknown enum values fail closed; Kalshi ships changes weekly (358 to 362 changelog entries), Quotient has seven breaking majors, Polymarket v1 retires 2026-10-24; offline CI refreshes fixtures and alarms on drift [08 §10.8] |
| Quotient | forecast age at most 24 h (D); `entry_eligible`/`forecast_status` re-checked at action time |
| Dead dependencies | DefiLlama liveness feed deprioritises dead venues; aggregators and directories die often (Dome, Metaforecast, Parsec, Verso, Fireplace, Converge) and some directories still list them live [14 §8.3] |

---

## 9. Proposed plugin tools

Conventions from the reference plugins: lowercase `<family>_<verb>`, zod `.strict()` input and output schemas, string amounts, agent-facing descriptions that state the safety contract, titles and descriptions treated as untrusted by PayBox [04 §4.2]. All `pm_*` tools are read-only (`readOnlyHint: true`), never emit `io.paybox/transactionProposal`, and sanitise market text.

### 9.1 Aggregation tools (all READ)

| Tool | Class | Hosts | Purpose and key I/O | Phase |
|---|---|---|---|---|
| `pm_list_venues` | read, offline | none | registry view: capabilities, fee-model ids, geo and bot flags, tier, reachability class, `last_verified`/ttl. Doubles as the conformance sample call | AGG-0 |
| `pm_get_quote` | read | per venue | normalised top-of-book and depth-walk for `(venue, market, outcome, side, size)`: VWAP, fee, net cost, `derived`, staleness flags, `quote_id` hash | AGG-1 |
| `pm_lookup_links` | read, offline | none | approved links and candidates for a market, with state, basis, axes, rule hashes, reviewer date; candidates labelled `indicative` | AGG-1 |
| `pm_verify_link` | read | the link's legs | recompute rules hash, status, close time, tick, fee model for both legs; returns `ok` or `suspended` with reasons | AGG-1 |
| `pm_compare_market` | read | XO plus twin venues | for an XO market (id or slug): fetch both legs, verify link, return relation, basis, divergence axes, both books, indicative discrepancy and fair-value reference | AGG-1 |
| `pm_check_structure` | read | XO (and Polymarket/Kalshi) | within-venue partition, complement and ladder checks for a group (XO `rootEventSlug`; Polymarket neg-risk event; Kalshi event): fee-adjusted, exhaustiveness-aware, alert-style output | AGG-1 |
| `pm_signal_request` | read, offline | none | Quotient request description: canonical URL, pinned payment tuple, price ceiling, purpose (agent pays) | AGG-1 (flag) |
| `pm_signal_parse` | read, offline | none | validate and normalise a paid Quotient body; join to links by `marketKey`; units, orientation, quality; fail closed on unknown enums | AGG-1 (flag) |
| `pm_find_edge` | read | up to about 8 | evaluate a bounded page of approved links (or supplied `link_ids`, at most 5): tier, net edge per share, depth-limited size, capital, lock-adjusted return, reasons for rejection; returns `cursor` | AGG-2 |
| `pm_plan_legs` | read | the legs' venues | re-quote and emit the Leg Plan (section 6.3): ordered legs with executability class, sizes within caps, limit and GTD expiry, preconditions, unwind cost, abort conditions, `valid_until` | AGG-2 |
| `pm_trueo_*` market and quote reads | read | Base RPC | folded into `pm_get_quote`/`pm_compare_market` with `venue: "trueo"`; batched JSON-RPC | AGG-2 |

Arguments are limited in practice (sample args are capped at 64 KiB; the live limit is undocumented), so `pm_signal_parse` accepts only the selected rows, not a whole feed. Outputs stay under 256 KiB.

### 9.2 Execution-related tools (owned by the XO plan or later phases)

| Tool | Class | Note |
|---|---|---|
| `xo_prepare_order` | **read** | EIP-712 payload, Kernel-wrapped digest, human-readable quote, `quote_id`; mandatory short GTD expiry |
| `xo_submit_order`, `xo_cancel_order` | **write** (HTTP side effect, not a proposal) | `submit` recomputes the digest, `ecrecover`s the owner, then POSTs; requires L2 credentials (relay) |
| `xo_enable_trading`, `xo_redeem` | **write** (likely sign-and-submit UserOps, not EVM proposals) | gate-dependent [06 §10] |
| `xo_fund_account` | **write** (source-chain proposals, one call each) | gate 6 |
| `xo_create_market` | **write** | gate 5; always approval-gated |
| `trueo_prepare_swap` (P2) | **write** (proposal, "next missing step") | approve USDC to Permit2 -> `Permit2.approve` -> `adapter.execute`; recipient pinned to the user; constants pinned per chain |
| Kalshi / Polymarket US / others | none | E4 manual; never a tool that signs |

---

## 10. Legal, ToS and geo flags

Not legal advice. Items marked "decision" are for the operator. Confidence tags per [08], [09], [03].

| Area | Flag | Design consequence |
|---|---|---|
| **XO ToS** [03 §5, 10 V10] | Bots allowed if they comply and do not overwhelm; scraping "for unauthorized purposes" barred; wash trading ("trades with yourself or colluding with others") prohibited; no trading with "direct or indirect influence over the outcome" (every sampled market is MANUAL with a creator-specified resolver); multiple accounts and VPN geo-masking prohibited; restricted: US, UK, France, Singapore, Ontario, enforced by IP at login and transaction time; ToS undated, privacy policy stale | Rate-limit politely; record the self-trading decision against **both** clauses (wash trading and influence); relay egress IP matters for XO |
| **XO creation** [03 §2.3] | Annex A requires Catalyst Badge, one market per calendar week, admin approval; 132 creators exceed that on-chain (unenforced); plan's 2 per day exceeds written limits | v0.3 needs XO's written permission; aggregation only supplies lint |
| **Polymarket global** [08 §2.11, §8] | US close-only on frontend and API; attestation "not a U.S. person"; geoblock keyed on the request IP; server-side order submission for restricted users is circumvention; co-location not for third-party apps executing for end users; explicit bot clause NOT FOUND (ToS is client-rendered); integrity page bans wash trading, spoofing, self-dealing, front-running | Read-only for the plugin; any order path must run from the user's own client; client-side geoblock check; no server relay |
| **Polymarket US** [08 §3, 15 §9.2] | SSN-KYC US venue; Rulebook 2026.09.30: automated systems need pre-trade risk controls (throttles, price collars, kill switches), wash-trade and common-control matching rules, discretionary final settlement and power to modify settlement date and payout condition | Treat as a separate venue with its own rules; discretionary settlement raises basis risk |
| **Kalshi** [08 §4.9, 08 V-E1] | Developer Agreement v1.1 (last modified 2023-11, possibly superseded): API use limited to the member's own trading; s3.1 no collecting, caching, aggregating or storing data except for own trading and no sharing; s3.2 no facilitating other members' trading; s3.7 no sublicensing; s6.4 prior written approval for public statements or marketing about Kalshi or its API; s4.4 audit rights; whether anonymous public GETs count as "API use" is unresolved; restricted-jurisdiction list unverifiable (UK, France, Singapore, Australia, Ontario appear in a search snippet only); API keys have a location attestation (since 2026-08-16) | Per-user, on-demand, short-TTL reads only; no bundled dataset of Kalshi data beyond ids and hashes; seek written authorisation before a public listing; Kalshi adapter behind a build flag (D4) |
| **Quotient** [12 §8] | licence for personal or internal business purposes; no resale, shared access, redistribution of outputs, or competing signals product; no commercial or enterprise terms published; age 18+; may be unlawful in the user's jurisdiction | per-user pass-through; request a licence before any shared cache or public aggregation; disclosures in section 7 |
| **Limitless** [09 §2.3] | bots explicitly allowed (no wash trading, spoofing, multi-account evasion; an on-chain cancel can get the maker blocked: "cancel through the API"); US, Republic of China, Ontario, Alberta excluded | read-only; follow rules if ever extended |
| **Trueo** [11 §13] | Samoa operator; US Persons and a long territory list excluded; VPN circumvention banned; no bot or agent policy; arbitration under Samoa law; terms revisable at sole discretion; do not use the undocumented `api.trueo.com` or app JSON for automation (scraping prohibited) | on-chain reads only; user decides posture |
| **Predict.fun / Opinion / SX / HL** [09 §4, 09 V-C] | geo lists exclude the US, UK, France, Ontario, Singapore and others; scraping clauses with official keys offered; Hyperliquid outcome markets use an open-ended "Excluded Persons" list (cannot be hard-coded) and bar bots that "exceed reasonable usage" | P2; keep geo as a live check, never a hard-coded list (plan) |
| **Cross-cutting regulators** [15 §9] | CFTC Release 9185-26 (2026-02-25): insider trading, pre-arranged noncompetitive trading and wash sales, disruptive trading, manipulation; silent on automated trading and arbitrage; staff advisory 26-08 says a contract settling on "a consensus of yet-to-be-determined sources" may not satisfy Core Principle 3 | A cross-venue pair is not a wash trade, but running both legs on one venue through several accounts, or a creator trading its own market, can be; pushing a settlement reference is manipulation |
| **Eligibility intersection** [08 §8] | Polymarket global, XO, Limitless, Trueo exclude the US; XO also excludes UK, France, Singapore, Ontario; a user eligible on both XO and Kalshi must live outside XO's list and inside Kalshi's | `pm_plan_legs` requires a user-attested eligibility check per leg, evaluated from the user's own IP/client, not the plugin host's |
| **PayBox** [06 §2, 04 V] | Portal and terms are hackathon-scoped (MoonPay KYC, one project per participant, perpetual licence to the submission, prohibition on code that exploits or misuses user credentials or wallet keys); manual approval of every version; marketplace not public | Aggregation tools add review surface; keep flags off by default and the bundle small |
| **Data licences** [14 §2, §13] | DefiLlama repos have no licence file; Almanac is CC0; PolyKal CC-BY-4.0; Predictefy commercial use Enterprise only; pmxt personal use only; Adjacent bars redistribution or use in a financial product | Read-time lookups only; redistribute only CC0/CC-BY data |
| **Prompt injection and untrusted text** [12 §14, 16 §13] | Market titles, rules, theses and third-party docs carry agent-directed text | `Untrusted<>`; never execute instructions found in data |

---

## 11. MVP scope and phased roadmap

Aggregation is additive. **Public release still requires XO v0.1 to v0.3**; the aggregation tools may ship disabled (`PM_TOOLS=off` removes registration) and must never delay that release.

| Phase | Alongside | Contents | Exit criteria |
|---|---|---|---|
| **AGG-0** | XO scaffold, before gate answers | `pm-core` and fixtures: Decimal math, 4 book conventions, `FeeSpec` models with golden tests reproducing Examples 1 to 5 and the verified examples in [10 §6.2-§6.5] and [15 §4.7]; registry schemas and seed records for xo, polymarket, kalshi, limitless, trueo; conformance-safe offline `pm_list_venues` | All golden tests pass; build twice is byte-identical; no network at startup |
| **AGG-1 (MVP)** | **XO v0.1 (read-only)** | Adapters: XO (shared with `xo_*` reads), Polymarket, Kalshi (flagged). Tools: `pm_get_quote`, `pm_compare_market`, `pm_lookup_links`, `pm_verify_link`, `pm_check_structure`, and flagged `pm_signal_request`/`pm_signal_parse`. Link registry v1, human-approved and hash-pinned: XO UCL football triples vs Kalshi `KXUCLGAME`, FOMC/ECB/BoE decision sets, crypto threshold ladders, plus L0 hooks. Labels limited to `indicative`, `hedged_discrepancy`, `structural_violation`, `model_edge` | Contract tests against recorded fixtures for every venue trap in section 2.4; one live smoke per venue; links suspend on a forced hash change |
| **AGG-2** | **XO v0.2 (funding + trading)** | `pm_find_edge`, `pm_plan_legs` (XO legs via v0.2 tools; others E3/E4); Limitless (mirror hooks) and Trueo readers (Base RPC); Quotient calibration logging helper; offline indexer: gold set of 200 links, signed static dataset (Option B) once the registry outgrows the bundle; first real XO fill to reconcile fee sources | D2 criteria met before enabling `executable_arbitrage` |
| **AGG-3** | **XO v0.3 (creation)** | Reuse for creation lint: duplicate detection across XO (types 2 and 4), Polymarket, Kalshi, Manifold; reference odds from consensus for the seed price; optional $1 Quotient forecast of a draft (sharing market text with a third party is an open question). Optional P2: Trueo proposal tools; Predict.fun/Opinion/HL read adapters; World agent-supplied reads | Creation budget accounts for a non-refundable $1 per attempt and about 41% first-review UPDATE_REQUIRED [03 V] |

**MVP definition:** AGG-0 plus AGG-1: a read-only, fee-adjusted, rule-aware comparison of XO markets against Polymarket and Kalshi, within-XO structural checks, bundled approved links, and the offline Quotient request/parse helpers. No continuous scanning, no execution beyond the XO plan, no statistical features.

Build-flag matrix for the first public upload: `VENUES=xo,polymarket` always; `kalshi` and `QUOTIENT` only after the legal reads in D4; `XO_TRADE` per the XO plan.

---

## 12. Build vs buy vs borrow

| Component | Decision | Why and what to borrow |
|---|---|---|
| Cross-venue link registry (pairs, relation, basis) | **BUILD** | nobody covers XO or Trueo; borrow Oddpool `basis_class`/`divergence_axes`/`fungible`, pmxt relation enum, Predictefy's executable-label gate list [10 §0, 16 §5] |
| Fee model, depth-walk, edge gates, set/ladder checks | **BUILD** (small pure functions, Decimal, golden tests) | borrow structure from oracle3 (Apache-2.0); fix its gaps (no void rows, no lock cost, no depth LP) [15 §10.1] |
| Exact LP / dual certificate | **BUILD** (port the tested reference solver in [15 App. A]) | closed forms first; general simplex for at most 30 variables |
| XO adapter | **BUILD** | public unauthenticated reads; no vendor does it well; XO's public community code (a doc-faithful market-maker bot and a TUI) is reference material and golden vectors, not a library [07 §0, §7] |
| Polymarket, Kalshi, Limitless adapters | **BUILD thin**, copy-adapt the author's `own-repo-B/apps/webapp/lib/markets/*` | own code; fix `resolved` flag, 0.5 fallbacks, add bid/ask/depth, extract from React hooks, re-verify 2026-04 wire shapes [13 §4 row 1] |
| Cross-venue consensus / fair value | **BUILD**, copy-adapt `own-repo-F/packages/sources/src/aggregate.ts` (time-weighted mid, spread cap, median, outlier drop, ABSTAIN, bigint) | executable prices only, not Gamma `outcomePrices` [13 §4 row 2] |
| Platform registry | **BUILD thin**; **BORROW** DefiLlama as join key and liveness feed, Prediction Almanac schema and CC0 seed, PolyKal fees as cross-check, ccxt `has` map vocabulary | no one publishes fees + geo + oracle + reachability + links with a TTL [14 §11] |
| Unified client libraries (ccxt prediction module, pmxt, Synpath, dr-manhattan, AGG) | **DO NOT DEPEND**; watch | ccxt: MIT, 9 prediction exchanges, none is XO or Trueo, too large for a single-file bundle; pmxt: hosted router read-only, personal-use only on all plans, no release since 2026-07-18; Synpath: 3 weeks old, Python/Rust, keys on the caller's machine, no XO; AGG: MIT SDK and white-label aggregator with 11 venues and a per-venue geo-policy endpoint, no XO or Trueo [14 §4, V-A4] |
| Hosted matching / arbitrage feeds (Predictefy, Oddpool, Prediction Hunt, Kairos, pdata.world) | **BUY only for benchmarking**, never at runtime | none cover XO except Predictefy (closed beta, never exercised, commercial use Enterprise only); Oddpool Premium $100/mo, Predictefy Pro $149/mo are benchmark spends [10 §0, 16 V-K5] |
| Tick history | **BUY only if needed** (Predexon, BlockRun pass-through at $0.0085 per call) | or build the offline snapshotter [14 §5] |
| Quotient signals | **BUY optionally**, per user, agent-paid | $0.005 to $0.02 per call; licence request first [12 §0] |
| Embeddings and LLM judge | **BUILD offline** | local MiniLM or `text-embedding-3-small`/`-large` for recall only; cascade judge; human approval [16 §6, §10] |
| ERC-1271 verification pattern, EIP-712 parity vectors | **COPY-ADAPT patterns** from `own-repo-G/.../ops-auth.ts` and `own-repo-F/apps/signer/src/eip712.ts` | vectors from the exchange contract, not docs [13 §4 rows 5-6] |
| Rate-limit and 429 handling | **COPY-ADAPT** `own-repo-P/apps/keeper/src/blockscout.ts` (header-driven gate) | only local code with Retry-After handling [13 V] |
| Dead dependencies | **AVOID** | Dome (EOL 2026-04-28), Metaforecast (discontinued 2026-07-09), Parsec, Verso, Fireplace, Converge [14 §8.3] |
| Local Polymarket write path | **DO NOT REUSE** | wrong Safe-proxy salt, invalid eager nonce, stripped HMAC padding, V1 struct [13 §5] |

---

## 13. Open questions, risks and what is not known

**Decisions for the author**
1. Accept D1 to D7 (section 0.4)? In particular: one plugin with flags (D1) and the Kalshi/Quotient legal gate before public listing (D4).
2. Do funding and withdrawals count toward the $50/day cap? (Still open in the plan; changes `pm_plan_legs` cap arithmetic.)
3. Who accepts responsibility for agents trading and creating, and what eligibility posture for Kalshi, Quotient and Trueo? (Self-trading vs XO's wash-trading and influence clauses is still unreconciled.)
4. Is sending XO draft text to Quotient ($1 forecast, needs an API key) acceptable for creation lint?
5. Is a dedicated Base-USDC data credential (about $2/day) acceptable alongside XO funding on a different chain?

**Evidence gaps (NOT FOUND or unverifiable)**
- XO: live fee truth (`/fee-rate` vs `effectiveFeeConfig`); real minimum order size and rounding rules; funding provider, limits and fees; whether PayBox accepts chain 3223 or the Kernel typed data; whether a PayBox wallet can own a Kernel account; `POST /order` L2 requirement; whether a non-entrant can upload a plugin after Chapter 1 [01, 03, 06].
- Matching: no public gold corpus; automatic precision is in-sample; reviewer time per link, daily new-market rate and CDN latency unmeasured [16 §8, §13].
- Quotient: odds-band bounds, credit-pack pricing, commercial licence, audit; whether x402-only payers can use the $1 forecast route; real paid-body shapes (spec only) [12 §12].
- Kalshi: anonymous rate limit, official fee PDF, Member Agreement, whether the Developer Agreement was superseded [08 V-C].
- Venues: Hyperliquid HIP-4 live shapes (POST-only); Predict.fun mainnet depth (key-gated); World fees, resolution and backing liquidity; Trueo live hook fee, minimum deposit, owner and role holders (need `eth_call`) [09 V-D, 11 §15].
- Executability: per-chain PayBox signing coverage for Polygon, BNB, Base multi-step flows at 2 to 4M gas; autonomous-grant behaviour for Open Plugin proposals and `request_wallet_sign` (PayBox docs contradict each other) [05 V, 06 §6].
- Notes 15 and 18 lack verification; note 17 is absent (section 0.2).

**Risks**
- A false link is a fake arbitrage; the registry is only as good as human review.
- Stale or edited rules, resolution divergence, oracle governance (UMA, MANUAL, Trueo council with no timeout).
- Non-atomic legs and human-approval latency far exceed observed mispricing durations.
- Shared egress IP rate limits and the 1,000-starts-per-day quota constrain polling.
- Third-party perishability (nine dead or dark aggregator items in 2026); pin and verify, own the registry.
- Signed XO orders with no expiry are bearer instruments; enforce short GTD.
- Schedule: portal access after Chapter 1 and manual approval of every version are outside this design's control.

---

## Appendix A. Contradictions between research streams and how they were resolved

| Topic | Streams in conflict | Resolution (primary evidence) |
|---|---|---|
| XO market count and liquidity | [10 §0, §7] and [15 §10.6]: "9 ACTIVE vs 1,322 CLOSED, capacity tiny" vs [02 §0], [10 V1], [16 V-K1]: 248 ACTIVE type 2 + 4 CLOB Pulse + about 166 type 4 (421 across types 0 to 4) | The 9 rows are the legacy AMM slice returned by the default `marketScope`; query `marketType=2,4`. Books are mostly two-sided with a 2-cent median spread [10 V2]. Type 4 books are thin [16 V-K1]. The edge-finder conclusion survives for semantic reasons (MANUAL resolution), not market count |
| XO fee | `/fee-rate` = 0 [02, 10 V3, 16] vs `effectiveFeeConfig.takerFeeBps` 400/800 [10 V3, 18]; `/fee-rate` also returns 0 for a nonexistent token [03 V] | Use `max`, fail closed, reconcile with a real fill |
| Kalshi taker coefficient | [08 §4.10, 10 §6.1] M vs [10 V6, 14 §2.6] derivable first-hand and matched by PolyKal | 0.07 taker is H-derived at multiplier 1; maker 0.0175 stays M; apply event overrides and scheduled changes |
| Polymarket sports fee | docs table 0.05 vs live 0.03 on `feeType` NFL/CFB and v2 | read `feeSchedule` per market [08 V-A4, 10 V7] |
| Polymarket US fee | docs 0.0695 [08 §3] vs CFTC filing theta 0.06 effective 2026-07-01 [10 V5] | read live; P2 |
| Polymarket `/price` | prose docs vs OpenAPI vs live | derive from the sorted book [08 V-A1] |
| Cross-venue edge existence | literature 2 to 4% execution-adjusted [15 §5.2] vs our snapshots (none net of fees) [15 §6, 16 §4, 18] | literature is aggregate, partly pre-fee or unreplicated; design for rarity and reference prices |
| Quotient edge | "real, CI excludes zero" [12 §0] vs [12 V-Corrected 4-5]: not robust once same-day forecasts are excluded | small, shrink, log own results |
| Quotient webhooks | "none" [12 §3] vs enterprise feed webhook delivery [12 V] | irrelevant to MVP (set-up undocumented) |
| Trueo vs "True Markets" | [11 §2] "no separate venue" vs [11 V-C] truemarkets.co is a separate trading-API company | "Trueo" = trueo.com; never reuse the other company's SDK; look-alike risk |
| Hyperliquid and SX terms | "NOT FOUND" [09 §4] vs found [09 V-C1, V-C2] | Hyperliquid terms exist (open-ended outcome-market exclusion; bots that exceed reasonable usage); SX scraper clause exists, automated trading not addressed |
| Unified-library coverage | "pmxt is the ccxt for prediction markets" [10, 09] vs ccxt now has 9 prediction exchanges [14 §4.1] | neither lists XO or Trueo |
| River Markets | "no cross-venue equivalence" [14 §0] vs `generic_asset_id` groups equivalent listings [14 V-A1] | River and AGG and Synpath do link listings; none covers XO or Trueo |
| Autonomous grants and plugin money | "always pause" [04 §10, 06 §6] vs `pending_signature` [05 V, 06 §6] | sentence is scoped to first-party plugins; unresolved for Open Plugins; design for both outcomes |
| XO account actions as proposals | plan: proposals vs [06 §10]: UserOps via the bundler | UserOps (M); proposals only for source-chain funding |
| Derive-on-demand for XO credentials | [01 summary] default vs [01 V-corrected] OpenAPI says secret "never returned again" | unresolved; assume storage and key-slot lockout (relevant to the XO plan, not to read aggregation) |
| Predict.fun first in ingest order | [09 §0, §5] vs [09 V-D] ranking provisional, depth never sampled | not P0; key-gated and depth unknown |
| Gate 9 / explorer | [02, 10] answered-go vs [07 V] partial (no explorer URL documented) | XO's public APIs are the read model; Blockscout unverified (and [13 V] shows local Blockscout clients exist as patterns) |

## Appendix B. Research notes cited

| Note | Topic |
|---|---|
| 01 | XO auth, signing, smart accounts |
| 02 | XO read API |
| 03 | XO creation, funding, chain, ToS |
| 04 | PayBox reference plugins A (starter, paylink-guard, arcanum) |
| 05 | PayBox reference plugins B (survey, patterns P1 to P28) |
| 06 | PayBox platform (authoring spec, proposals, signing, secrets) |
| 07 | XO community bot reference and golden vectors |
| 08 | Polymarket (global and US) and Kalshi read specs, fees, terms |
| 09 | Other venues (Predict.fun, Opinion, Limitless, Myriad, Probable, Hyperliquid, SX, MagicMarkets, Rain, Manifold) |
| 10 | Aggregation landscape, fee formulas, executable-edge gates, worked examples |
| 11 | Trueo |
| 12 | Quotient |
| 13 | Local implementations |
| 14 | Platform-of-platforms (registries, libraries, aggregators, schema) |
| 15 | Relationship taxonomy, LP formulation, literature (no verification section) |
| 16 | Linking methods and services (measured XO matching) |
| 18 | Correlation and lead-lag study (no verification section) |
