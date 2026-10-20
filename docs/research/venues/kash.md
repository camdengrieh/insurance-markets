# Kash (kash.bot) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public GETs, official docs, GitHub raw reads. Nothing signed, no account, no key, no POST.
Tags: **H** = read first-hand in a primary source this session; **M** = secondary or my own inference/derivation; **L** = weak or stale.
Fixtures: `docs/research/fixtures/kash/` (third-party creator fields redacted).

## Verdict

- **adapter_priority: P2 (signal-only / thin).** Live, real API, independent liquidity, but tiny and structurally not a fixed-payoff leg.
- Reasons: (1) cumulative volume on the 46 currently active markets is only about $24.7k, and per-market AMM reserves are about $20-$140 (M); (2) outcome tokens do not pay $1, winners redeem **pro-rata against a shared reserve**, so a hedge against a fixed-$1 venue cannot lock a payoff; (3) the oracle is a team-run multisig with an admin-decided, final off-chain dispute step; (4) new markets are **Solana only**, so an EVM-only PayBox wallet cannot trade it.
- Still worth a read-only adapter as a **social/long-tail signal source** (cheap: one public GET, no key).

## 1. Is it live? (H)

- `GET https://api.kash.bot/v1/health` -> `{"status":"ok","uptime_seconds":132762,...}`, `/v1/ready` -> postgres, redis healthy, 2026-10-19 [H, fixtures `api_health.json`, `api_ready.json`].
- Newest market created 2026-10-19 02:19 UTC; 46 ACTIVE markets; 40,090 cumulative trades in the list data [H, `aggregate_stats_2026-10-19.json`].
- npm/GitHub releases 2026-10-02 (`@kashdao/protocol-sdk` 0.3.2, `@kashdao/sdk` 0.2.1) [H, CHANGELOGs].
- The home page tagline "Kash is live" in the discovery hint is consistent. Funding: $2M pre-seed reported by BeInCrypto [M, via search result, not opened].

## 2. Chain: the docs are stale, the venue moved to Solana on 2026-10-01 (H)

| Source | Says |
|---|---|
| docs.kash.bot (all product pages; docs repo last commit 2026-08-05) | "prediction marketplace on Base", USDC, ERC-4337 smart accounts, ERC-1155 outcome tokens [H] |
| `KashDAO/sdk-typescript` README + CHANGELOG 0.2.0 (2026-10-01) | "Solana has been Kash's canonical chain since 2026-10-01; every new market is created there." Base markets created earlier "keep trading and resolving on Base" [H] |
| `KashDAO/protocol-sdk-typescript` README | "New markets launch on Solana mainnet-beta ... Base mainnet (8453) ... stay fully supported ... until they resolve." [H] |
| app.kash.bot `og:description` | "AI-powered decentralized prediction markets protocol on Solana" [H] |
| Live data (`GET app.kash.bot/api/markets?status=all`, 1,413 markets) | 1,182 markets `chainId 8453` created 2026-06-10 .. 2026-10-01 (1 still ACTIVE, stuck, see 7); 231 markets `chainId 9000001` (internal Solana pseudo-id, base58 `contractAddress`, `registryAddress`=program id) created 2026-10-02 .. 2026-10-19 [H] |

Treat docs.kash.bot "Base" statements as pre-cutover. Anything chain-specific below is taken from the SDK repos and live data, not the docs site.

- Solana mainnet-beta program: `Jr8Bd8efPfNYHW65vZrVzeLbYkzy1oo3QB3i8cYdDcy`; collateral = Circle USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 dp) [H, protocol-sdk README "Supported chains"; the same program id appears as `registryAddress` in the live API]. Devnet program `J3tSy...kuN5` (stand-in USDC).
- Base (legacy): chain 8453, USDC, market = one contract per market, outcomes ERC-1155 [H, docs + SDK README]. Base mainnet factory/addresses live in the SDK's `addresses.ts` (not copied).
- Collateral is USDC only. `$KASH` token: docs say "Kash has not launched a token ... there is no contract address" [H, tokenomics page]. The kash.bot home claim of "USDC and KASH payouts" is therefore marketing for something not live [H conflict].

## 3. Market model (H unless noted)

- **Single-reserve multi-outcome AMM**, no order book. 2-8 outcomes per market in the product (contracts support up to 100); binary = the 2-outcome case. Live outcome counts over all 1,413 markets: 2 outcomes 1,088; 3 outcomes 288; 4 outcomes 22; 5-6 outcomes 7; 9, 16, 18, 19, 48 and 96 outcomes one to three each (the 48- and 96-outcome markets exceed the docs' "2 to 8"). Solana (231): 2 outcomes 183, 3 outcomes 35, 4 outcomes 9, plus single 9/16/18/19-outcome markets [H, my count].
- Curve: weighted **Pythagorean scoring rule**: `A = sum(a_i * s_i^2)`, `N = sqrt(A)`, reserve `R = c * N`; implied chance `q_i = a_i * s_i^2 / A` [H, docs "Custom AMM"].
- **Outcome tokens are not $1 shares.** Resolved payout = `R * tokens / total_winning_supply` (multi-winner markets share the reserve). Cancelled markets refund at a frozen per-outcome marginal price [H, docs "Market Mechanics"].
  - Base: ERC-1155 tokens (token id per outcome; live `outcomes[].tokenId` e.g. 2560/2561).
  - Solana: positions are `u128` WAD (18-dp) balances in a program-owned **Position account (one PDA per market/owner/outcome), not SPL tokens** [H, protocol-sdk README].
- No limit orders, leverage or margin: docs say "There are no limit orders, leverage, or margin products" [H, docs "Trading Options"]. The kash.bot marketing text (and the discovery hint) mention limit orders and leverage: **conflict, trust the docs** (the SDKs/API have only market buy/sell/redeem).
- Lifecycle: created -> active -> frozen (trading window ends) -> resolved or cancelled -> claim. Live statuses: `ACTIVE`, `RESOLVED` (list filter also accepts `cancelled`, `paused`, `refunded`); `frozen:true` / `tradable:false` flags on ACTIVE rows [H].
- Creation: AI drafts markets from posts; creation is review-gated and "currently limited to approved accounts"; creation fee 20 USDC becomes the seed reserve (`seedAmountAtomic` 20000000 on 297/300 sampled) [H].

### Price semantics (important for the adapter; verified arithmetic, M)

For market `1f8101dc...` the live row has `currentImpliedChance = 0.059692515` (= outcomes[0].probability) and `currentProbability = 0.2012499905`, `shareSupply` = 20.0 / 79.3789 tokens. I checked: `q_0 = 0.5*20^2 / (0.5*20^2 + 0.5*79.3789^2) = 0.0597` (matches `currentImpliedChance`), and `s_0 / sum(s) = 0.20125` (matches `currentProbability`, a normalised marginal-price-like quantity). So:

- Use **`outcomes[].probability` / `currentImpliedChance`** as Kash's break-even probability (docs: "equals the break-even probability for buying that outcome at the margin").
- Do **not** feed `currentProbability` or the top-level `yesPrice/noPrice` shown in the embed docs (those fields do not exist in the live payload) into a cross-venue comparison.
- Because payout depends on later flows into the reserve and on winning supply, even `impliedChance` is a snapshot, not a locked price. Prefer the quote endpoint's `estimate.payoutAtCurrentOddsUsdc` and `effectiveBreakEvenChance` for a given size.

## 4. Read API (official)

Two official surfaces (H, docs.kash.bot developer-docs):

### 4a. Public Embed API: anonymous reads (the one a scanner can use without a key)

- Base: `https://app.kash.bot/api` ; docs `https://docs.kash.bot/developer-docs/public-embed-api/overview`.
- Endpoints (all GET, confirmed live where marked *):
  - `/markets` * (`status=active|resolved|cancelled|paused|refunded|all`, `category`, `sortBy=created_at|total_volume|current_probability|title|end_time`, `sortOrder`, `limit<=100`, `offset`, `threadId`, `organizationId`, `resolvedAfter/Before`) -> `{markets[], pagination{offset,limit,total,hasMore}, _meta}`
  - `/markets/{id}` * -> `{market, aiInsight{summary,aiModel}, _meta}`
  - `/markets/{id}/quote?action=buy|sell&outcomeIndex=N&amount=<atomic>` * -> `{quote{amountIn,tokensOut,reserveAfter,pAfter[],qAfter[],effectivePrice,impliedProbability,protocolTradeFeeBps:100,estimate{youPayUsdc,protocolFeeUsdc,netIntoAmmUsdc,tokensReceived,estimatedWinningsUsdc,payoutAtCurrentOddsUsdc,effectiveBreakEvenChance,gasEstimateUsdc}}, market{...,outcomes[]}, units:{usdc:"atomic-6",token:"wad-18"}}`. Docs: quotes cached 10 s server-side.
  - `/markets/trending` *, `/markets/featured` *, `/threads`, `/threads/{id}/markets`, `/organizations/{id}/markets`.
- Units: USDC atomic-6, tokens WAD-18, as decimal strings in quotes. Market-list `totalVolume`, `minBet`, `maxBet` are atomic-6 USDC integers (minBet 1000000 = 1 USDC, maxBet 10000000000 = 10,000 USDC); the docs say "total trading volume in cents", which is **wrong** (M: a $16M volume with 73 trades is impossible vs. a 10k max bet and ~$60 reserves).
- Doc shape vs live shape: the docs' example (`question`, `yesPrice`, `noPrice`, `probability`) differs from the live payload (`title`+`question`, `currentProbability`, `currentImpliedChance`, `outcomes[]`, `chainId`, `contractAddress`, `onChainMarketId`, `resolutionCriteria`, `resolutionSources[]`, `disputeWindowSeconds`, `cancelGraceSeconds`, ...). Build against the live fixtures [H].
- Auth: none. Docs: IP rate limit 100 req/min (threads list 50), headers `X-RateLimit-*` with reset in epoch **ms**. Observed header on the quote call: `x-ratelimit-limit: 600` (docs say 100) [H, observed]. The market-list response carried no rate-limit headers [H, observed].
- **Caveats:** `app.kash.bot/robots.txt` has `Disallow: /api/` for all user agents, and docs frame this API as "for humans / UIs ... No trading" [H]. The docs also say it "requires no authentication", so use is invited, but a production scanner should poll politely (the full catalogue is only 15 pages of 100) and ask `dev@kash.bot` if usage is sustained.
- No websocket / streaming anywhere: SDK README "What's NOT in this SDK yet: Streaming / WebSocket ... the API doesn't expose a streaming endpoint yet" [H]. Poll, or subscribe to the Solana market accounts via RPC (M, not tested).

### 4b. Authenticated REST API (`api.kash.bot`)

- Base `https://api.kash.bot/v1` (staging `https://api-staging.kash.bot/v1`, Solana devnet); OpenAPI 3.1 at `/v1/openapi.json`, UI at `/v1/docs` (both unauthenticated, fetched; summary in `api_v1_openapi_paths_summary.json`) [H].
- Auth: `X-API-Key: kash_live_<32 base62>` on every data route; unauthenticated call returns RFC 7807 401 `API_KEY_MISSING` [H, `api_v1_markets_no_key_401.json`]. Keys come from a logged-in Kash account (Settings -> API Keys) -> **requires an account; not created here**.
- Scopes: `markets:read`, `markets:quote`, `portfolio:read`, `trades:read`, `trades:write`, `webhooks:manage`, `auth:manage`. Self-serve free/developer keys *default* to `markets:read`, `markets:quote`, `portfolio:read`; `trades:read/write` are default only on admin-issued `enterprise`/`mm` keys, and the docs say scopes can be overridden at issuance (so a self-serve trade key may be possible; not tested) [H, auth docs].
- Limits (per user, sliding window / token bucket): free 60 req/min, developer 300; spend caps free 1,000 USDC/day and 500 USDC/trade, developer 10,000/day and 2,500/trade, enterprise 100k/day, mm 1M/day [H, rate-limits page].
- Endpoints: `GET /v1/markets`, `/markets/{id}`, `/markets/{id}/predictions` (recent trades), `/markets/{id}/quote`, `/portfolio`, `/portfolio/positions`, `POST /v1/trades`, `/trades/{id}/confirm`, `POST /v1/redemptions`, `GET /v1/trades`, `/traces/{id}`, `POST /v1/markets/{id}/disputes`, competitions, webhooks (HMAC-SHA256 Stripe-style, trade lifecycle only) [H, OpenAPI paths].
- **Versioning trap:** default `X-Kash-Api-Version: 2026-04-29` is EVM-only and refuses Solana markets with `CHAIN_NOT_SUPPORTED`; Solana markets need `2026-08-19`. Every market/quote/trade then carries `chainRef` (`solana:mainnet-beta`, `evm:8453`) and **omits `chainId`**; `trade.txHash` is null on Solana [H, sdk-typescript README "API versioning" and "Chains"].
- Market-data-only use of 4b adds nothing over 4a except `/predictions` (trade tape) and a stable contract; not needed for a first adapter.

### 4c. On-chain

- Solana: market, config, collateral are PDAs of the program; the SDK decodes zero-copy accounts and computes exact quotes off-chain with a vendored integer curve ("the program has no view functions") [H, protocol-sdk source `quote.ts`]. Base: market contracts readable via any RPC.

## 5. Trade path

1. **Kash-orchestrated (REST `POST /v1/trades`)**: API key, optional `X-Kash-Signature` HMAC body signing (secret = the API key); trades execute from the user's **Privy-managed smart account via scoped delegation**, Kash builds the transaction and sponsors gas [H]. The signer is Privy MPC, **not a PayBox wallet**, so this route bypasses PayBox signing and guardrails. Requires a Kash account, a funded smart account, and a key carrying `trades:write` (not in the self-serve default scopes).
2. **Self-orchestrated (`@kashdao/protocol-sdk`, MIT, last push 2026-10-02)**: you build, sign and send. Solana entry `@kashdao/protocol-sdk/solana`: `kash.markets.quoteBuy`, `trades.buildBuy/Sell/Redeem` return `TransactionInstruction[]` with a **mandatory slippage bound** (`min_tokens_out_wad`) and `deadline`; the trader signs, an optional separate fee payer can sponsor; first buy auto-prepends `open_position` (position-account rent) [H]. Base entry: EOA (EIP-1559) or ERC-4337 v0.7 smart-account modes [H].
3. No signed off-chain orders and no order book: every trade is an on-chain transaction against the AMM.
4. X/Twitter "tweet trading" is opt-in via Kash's bot account and an authorised X login; not usable programmatically [H, docs]. Handle rotates (`@kash_bot_trades` per the site; docs say the handle cycles) [H].

### PayBox reachability: **partial**

- An **EVM PayBox wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot trade new Kash markets**: they are on Solana. The only Base markets left are legacy ones that resolve and redeem on Base; the one still ACTIVE on Base is frozen since 2026-06-24 (`tradable:false`) [H].
- A **Solana PayBox credential could** in principle: the buy/sell/redeem instructions have the trader as the only required signer (position-rent payer can equal the trader), and PayBox's documented Solana proposal accepts a legacy/v0 transaction up to 1,232 bytes, one signer who is also fee payer, no durable nonce (project note `docs/research/06-paybox-platform.md`). A plugin would hand-build the Anchor instructions (discriminators/IDL from the SDK vendor dir) and return a `kind: "solana"` proposal. **Not simulated, size and account count unverified (M).** The wallet needs SOL for fees and ~0.002 SOL-class rent for a position account (L, standard Solana rent).
- Funding the Kash Privy smart account from PayBox via a plain USDC transfer is possible but yields API-key trading outside PayBox policy (M).

## 6. Fees (H, docs "Market Mechanics" + live quote + SDK)

| Action | Fee | Who pays |
|---|---|---|
| Buy | 1% protocol fee (`protocolTradeFeeBps: 100`, "mainnet: 100"), skimmed from USDC input before it enters the curve | trader |
| Sell | 1% AMM sell fee (stays in reserve, per-market `sell_fee_bps` read from the market account on Solana) **plus** 1% protocol fee from payout | trader |
| Claim / refund | none; cancelled refunds are at frozen price, fees already paid are not refunded | - |
| Create market | 20 USDC (currently), becomes seed liquidity | creator |
| Gas | Kash-orchestrated: sponsored. Self-orchestrated Solana: trader (or chosen fee payer) pays SOL. Base claims "may net a small gas cost in USDC" | see left |

Live market rows show `tradingFee: 0.02` (round-trip sum) [H]. Per-market bet limits `minBet` 1 USDC, `maxBet` 10,000 USDC (all 300 sampled rows) [H]. Price impact is the dominant cost: a 5 USDC buy on a ~$60-reserve market moved the break-even from 5.97% to ~15.6% (`effectiveBreakEvenChance` 0.1557 from the quote) [H, `embed_quote_buy_5usdc.json`].

## 7. Resolution and dispute risk (H unless noted)

- Resolved by the **Kash oracle: a team-operated multisig**, "transitioning to a Gnosis Safe M-of-N" (docs, Base-era wording). An LLM-council resolver is "on the roadmap ... not live" [H].
- API exposes a **propose -> dispute window -> settle** flow: `POST /v1/markets/{id}/disputes` (reason 10-2000 chars) is allowed until `finalizableAt`; an open dispute blocks settlement "until an admin decides the outcome; that decision is final" [H, OpenAPI description]. Live markets carry `disputeWindowSeconds: 1800` (30 min) and `disputeWindowSource` `metadata`/`authored` [H].
- Per-market free-text `resolutionCriteria` plus `resolutionSources[]` (e.g. White House news page) written by the creator/AI, so wording differs from Polymarket/Kalshi equivalents -> basis risk [H].
- Contract-enforced exit: anyone can cancel after a grace period if the oracle is silent (`cancelGraceSeconds: 2592000` = 30 days on the Solana rows; `0` on the Base row) [H].
- Observed stalls: the Base "Cardi B vs Wendy's" market expired 2026-06-24 and is still `ACTIVE` but frozen/untradable 117 days later; 5 Solana markets are frozen and unresolved 0-6 days after expiry [H, my scan]. Median `updatedAt - expiresAt` for 186 resolved Solana markets about 10 h, p90 about 52 h (L, `updatedAt` is only a proxy).
- No independent audit report found: `KashDAO/security-audits` README is one line; the docs security FAQ names no auditor and is Base-only; no audit of the Solana program found (**NOT FOUND**, searched docs security FAQ, audits repo, SDK README). The program is new (mainnet cutover 2026-10-01).

## 8. Geo / ToS / automation

- Terms of Service: **NOT FOUND** (fetched `kash.bot/terms`, `app.kash.bot/terms` -> 404; `app.kash.bot/terms` via WebFetch -> 403; web search budget was exhausted so no further lookup). Docs defer to "the Terms of Service available in the app".
- Docs FAQ "Legal" [H]: "Access is blocked where law or policy requires - including sanctioned regions and other restricted jurisdictions"; OFAC-region geo-blocking, 18+, AML screening, no markets on harm/death/crime. Prohibited: "Market manipulation or fraudulent activity", "Multiple accounts to circumvent limits".
- Automation is explicitly welcomed on the authenticated API ("built for developers, automated agents, and market makers"), with a KYC/ToS ladder for higher tiers (enterprise/mm need KYB and ToS attestation) [H]. Kash's blog concedes it is not a US-regulated derivatives exchange (M, search result).
- `robots.txt` on app.kash.bot disallows `/api/` (see 4a).

## 9. Liquidity (all M: computed from public API, 2026-10-19)

- Cumulative `totalVolume` summed over all 1,413 markets: **$310.0k** (Base $239.0k over 1,182 markets 2026-06-10..2026-10-01; Solana $71.0k over 231 markets 2026-10-02..2026-10-19); 40,090 trades. Largest single-market cumulative volume $7.9k. `aggregate_stats_2026-10-19.json`.
- 46 ACTIVE rows (45 Solana + 1 stuck Base): $24.7k cumulative volume combined, of which $23.0k is on the 45 Solana rows; only 40 of the 46 are currently `tradable` (6 are frozen awaiting resolution). Top tradable market $1.61k cumulative; the top-10 Solana markets are $1.2-1.6k each with 50-250 trades. No TVL/OI number is published (**NOT FOUND**); the `liquidity` field is 0 on all rows.
- AMM reserve per market (derived from quote `reserveAfter` minus net-into-AMM for a $1 buy, top 12 Solana active markets by volume): about $21 to $138, median about $60. Seed is the 20 USDC creation fee; the "Earn" liquidity vault is "coming soon" [H, docs].
- Volume may double-count buys and sells (L). No volume figure comes from an independent source.

## 10. Overlap with other venues (arbitrage relevance)

Active-market mix (46): politics 15 (US 2026 midterm House/Senate control, Brazil election, UK GE, US-Iran/Israel-Iran, Supreme Court retirement), sports 6 (NFL, NBA, NHL, UFC props), crypto 4 (BTC above $86k on Binance at a timestamp, token-launch/airdrop questions), commodities 3 (WTI touch/close, Hyperliquid reference), finance 2 (mortgage rate, CPI food-at-home), stocks 1 ("Largest IPO of 2026", its rules cite a Polymarket page), plus long-tail social (X trends, follower counts, YouTube subscribers, AI-poker match) [H, live list].

- Plausible matches on Polymarket/Kalshi: US midterm control, Brazil election, UK GE, BTC/WTI price thresholds, NFL/NBA/NHL games, CPI/mortgage-rate, largest-IPO. Roughly 10-15 of 46 (M). Everything social/creator-driven is Kash-unique (signal, no hedge).
- Basis risk: bespoke resolution wording, timestamps and sources; pro-rata redemption; 1% buy plus ~2% sell fees; $20-140 reserves, so $5-$10 of size already moves the break-even by 10 points. Realistic use = "disagreement signal", not locked arbitrage.

## 11. Shared liquidity?

**Independent** (H design): each market has its own reserve seeded by the creator's 20 USDC and an own-curve AMM; no routing to other venues. App CSP lists `gamma-api.polymarket.com`, and some rules cite Polymarket pages as sources (H), which indicates Polymarket is used as a reference/inspiration, not liquidity; no mirroring or hedging found (L absence). Treat Kash as an independent but very thin leg.

## 12. Adapter notes

- Read adapter: page `GET /api/markets?status=active&limit=100&sortBy=total_volume&sortOrder=desc` (one page covers all active markets), quote per candidate via `/markets/{id}/quote` (cache 10 s). Key fields: `id`, `onChainMarketId`, `chainId` (9000001 = Solana pseudo-id, 8453 = Base), `contractAddress` (base58 or 0x), `status`, `tradable`, `frozen`, `expiresAt` (s), `freezeAt` (s), `endTime` (ms), `outcomes[].{outcomeIndex,label,probability,shareSupply}`, `category`, `resolutionCriteria`, `resolutionSources`, `disputeWindowSeconds`, `winningOutcomeIndex`, `evidenceHash`.
- Normalise outcomes positionally; labels are metadata. Filter `tradable && !frozen`; skip stale ACTIVE-but-expired rows.
- Mark every Kash price as `payoff: "pro-rata-reserve"` so downstream arbitrage logic never treats it as a $1 binary.
- Do not call `POST /v1/trades` or any write path from the scanner. Trading, if ever wanted, is a separate Solana-instruction plugin tool behind PayBox approval.

## Open questions

- Exact ToS wording on automation and restricted-jurisdiction list (page not found).
- Whether the Solana `kash_market` program has been audited, and whether the program upgrade authority is a multisig/timelock.
- Whether a Solana legacy/v0 buy transaction (with ATA create + open_position) fits PayBox's 1,232-byte single-signer proposal limit.
- Whether `app.kash.bot/api` is acceptable for sustained scanning given the robots `Disallow` (ask `dev@kash.bot`).
- Whether `totalVolume` includes sells.

## Sources

1. https://kash.bot/ (home; chain not stated; claims limit orders/leverage/USDC+KASH) [H]
2. https://app.kash.bot/ (`og:description` "...protocol on Solana") [H]
3. https://docs.kash.bot/llms.txt (page index) and pages: `/getting-started/features/{custom-amm,market-mechanics,trading-options,earn}.md`, `/getting-started/ecosystem/tokenomics.md`, `/getting-started/faqs/{legal,security}.md`, `/developer-docs/introduction.md`, `/developer-docs/rest-api/{overview,authentication,rate-limits,endpoint-reference}.md`, `/developer-docs/public-embed-api/{overview,endpoints/markets,endpoints/market-quote}.md`, `/developer-docs/protocol-sdk/overview.md` [H, but Base-era; stale on chain]
4. https://api.kash.bot/v1/health, `/v1/ready`, `/v1/openapi.json`, `/v1/markets` (401) [H]
5. https://app.kash.bot/api/markets (status=active and status=all, 15 pages), `/api/markets/{id}`, `/api/markets/{id}/quote`, `/api/markets/trending`, `/api/markets/featured`, https://app.kash.bot/robots.txt [H]
6. https://github.com/KashDAO/sdk-typescript README.md + CHANGELOG.md (read via `gh api`), https://github.com/KashDAO/protocol-sdk-typescript README.md, CHANGELOG.md, `src/solana/{clusters,instructions,quote,types}.ts`, https://github.com/KashDAO/security-audits README.md, https://github.com/KashDAO/docs commit list [H]
7. Web search results (titles only): BeInCrypto "Kash Raises $2M ..." and Kash's own blog posts [M/L, not opened]
8. Project context: `docs/research/06-paybox-platform.md` for PayBox Solana proposal limits [H within project notes]
