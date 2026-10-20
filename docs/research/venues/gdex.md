# GDEX (gdex.pro) Outcomes - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page reads, `gh api` file reads, public unauthenticated GETs with User-Agent `insurance-markets-research/0.1`, and static grep of the public JS bundles served by gdex.pro (read as text, never executed). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. `WebSearch` was unavailable this session (shared budget exhausted), so there is no search-engine corroboration; everything below comes from first-hand fetches.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference/computation from first-hand data; **L** = weak, single-source or stale.

---

## 0. Bottom line

1. **GDEX is a front-end (Hyperliquid "builder code" interface) for Hyperliquid HIP-4 outcome markets. It is not a separate venue and not an independent arbitrage leg.** DefiLlama files it under category "Interface", tag "Hyperliquid HIP4 Builder", with the methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H). Its UI reads and trades the same `#<outcomeId><side>` coins on HyperCore books (H, bundle). Whatever book exists on GDEX is the Hyperliquid book.
2. **Live as a product, near-dead as an outcome venue.** gdex.pro is up and its perps flow is real (DefiLlama "GDEX Perps": $442K 7d, $819K 30d, $9.0M all-time at 2026-10-19, H). The Outcomes tab, by contrast, has **$3,507 of volume all-time**, on 22 non-zero days out of 167, **zero in the last 30 days; last non-zero day 2026-07-11** (H, DefiLlama `gdex-outcome`, data to 2026-10-18).
3. **API is a proprietary custodial proxy, gated against scripts.** `trade-api.gemach.io/v1` returns `403 {"error":"Access denied: Invalid client"}` to a plain-UA GET (H). Their own SDK says the User-Agent "must match browser UA to pass Cloudflare / backend validation" (H). Writes go through "server-side managed wallets" with an AES-encrypted `computedData` payload, not through raw Hyperliquid signatures.
4. **Do not build a GDEX adapter.** Read from Hyperliquid directly (existing note: `docs/research/venues/hyperliquid-outcomes-hip-4.md`), trade directly on Hyperliquid, and avoid the extra ~50 bps builder fee and the managed-wallet custody layer. If anything, record GDEX only as an attribution label (builder address) on Hyperliquid fills.
5. **adapter_priority = skip.** Duplicate liquidity of Hyperliquid HIP-4, negligible volume, no public documented API, custodial intermediary.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://gdex.pro/` | HTTP 200; Next.js app; landing page lists perps, copy trading, sniper, analytics; **no mention of outcomes/prediction markets** on the landing page | H |
| Outcomes UI route exists in the live bundle: nav entry `{label:"Outcomes", path:"/outcomes", network:"arb", isNew:true}` and `href:"/arb/outcomes"`; `https://gdex.pro/arb/outcomes` renders only the title "Gdex Trading" server-side (client-rendered) | https://gdex.pro/_next/static/chunks/app/layout-3ac57e39113f0ea4.js | H |
| Official docs page "Outcomes": "Outcomes on GDEX Pro are Hyperliquid prediction markets - browse crypto and event markets, then open one to trade." (2 sentences, undated) | https://docs.gemach.io/gemach-dao/products/gdex-pro/features/outcomes.md | H |
| Official docs "Trading Agents": Outcome agent status **Live**; "Scans prediction markets and sides, then matches market text, side text, or specific outcome IDs before placing outcome orders" | https://docs.gemach.io/gemach-dao/products/gdex-pro/features/trading-agents.md | H |
| Official SDK repo `GemachDAO/gdex-skill` (MIT) pushed 2026-10-15, release v4.11.4; has outcome tools | `gh api repos/GemachDAO/gdex-skill` | H |
| DefiLlama listing "GDEX Outcome" (id 8985), `listedAt` 1791497885 = 2026-10-08 | https://api.llama.fi/protocol/gdex-outcome | H |
| DefiLlama volume series starts 2026-05-05 (same day the builder address was first funded); non-zero on 22 days; last non-zero 2026-07-11; `total24h`/`total7d`/`total30d` = 0 at 2026-10-18 | https://api.llama.fi/summary/dexs/gdex-outcome | H |

Verdict: **still_live = true** for the front-end, but outcome trading through it is effectively dormant (volume 0 for 100 days).

---

## 2. Kind and market model

- **Kind (H):** broker/front-end ("Interface") over Hyperliquid HIP-4 outcome markets. DefiLlama: parent "GDEX" (products GDEX, GDEX Spot, GDEX Perps, GDEX Outcome), chain "Hyperliquid L1", tag "Hyperliquid HIP4 Builder", description "GDEX provides access to outcome-based prediction markets through Hyperliquid." (https://api.llama.fi/protocol/gdex-outcome). Operator: Gemach DAO (`gemach_io` on X per DefiLlama).
- **Market model (H via bundle + SDK, M for exact semantics):** fully collateralised Yes/No outcome tokens on the Hyperliquid central limit order book. Coin ids are `#<outcomeId><sideIndex>`; SDK: "`#1010` = outcome 101 / side 0 (Yes), `#1011` = side 1 (No)"; price is a probability in (0,1), size is in contracts; HL enforces roughly $10-11 minimum order value (SDK SKILL.md). The bundle also handles multi-outcome "questions" (`namedOutcomes`, `fallbackOutcome`, "none of the listed outcomes"), and template classes (`priceBucket`, `sportsContestParticipant`, ...) fetched from Hyperliquid `outcomeTemplates`, so categorical/ladder markets are shown too. Not AMM, not parimutuel.
- **GDEX does not list its own markets.** It does not deploy or settle anything (NOT FOUND: any GDEX deployer address or template in docs/bundle; searched docs, bundle, SDK).
- **Doc inaccuracy to ignore:** the GDEX SKILL.md calls these "HyperLiquid HIP-3 outcome / event markets" on "permissioned perp DEXes". The product code uses `outcomeMeta`/`outcomeTemplates` and `#` coins, which are HIP-4 (DefiLlama also says HIP-4). Treat the SKILL.md wording as stale (M).

---

## 3. Chains and collateral

- **Venue chain:** Hyperliquid L1 / HyperCore (H, DefiLlama; docs "Perps / Outcomes: HyperLiquid (USDC collateral; deposit path on Arbitrum)" at https://docs.gemach.io/gemach-dao/products/gdex-pro/canonical-facts.md).
- **Funding path via GDEX:** USDC on Arbitrum to a GDEX-created *managed wallet*; min deposit 10 USDC; the managed wallet "must have the deposit amount + 1% fee buffer"; HL credits after ~10 min (H, SDK README). Withdrawals via `POST /v1/hl/withdraw` (backend-executed).
- **Collateral per market (conflict):** SDK SKILL.md says each market has a `quoteToken` of `USDC`, `USDH`, `USDE` or `USDT0` and the user must first `hlSwapCollateral` (HL spot swap, $10 minimum) into it (H as a statement of the SDK; accuracy for HIP-4 unverified). My Hyperliquid note records USDC as the HIP-4 collateral with USDH retired (M). Unresolved; read `quoteToken` live from `outcomeMeta` if ever relevant.
- GDEX's other chains (Solana, Base, Ethereum, Arbitrum, Optimism, BSC, Sonic, Sui, ...) are for spot/swap only and irrelevant to outcomes.

---

## 4. Read API

GDEX has a documented-by-SDK backend, but it is the wrong thing to integrate. The authoritative data is on Hyperliquid.

- **GDEX backend (official-authenticated, H):** base `https://trade-api.gemach.io/v1`.
  - `GET /v1/hl/outcomes` (optional `dex`, `status=open|resolved`): returns `data.meta` (outcomeMeta-shaped, with `outcomes[].sideSpecs`, `quoteToken`) and `data.mids` (the `#` mids map) per the SDK and the bundle (`i.data.meta`, `i.data.mids`).
  - `GET /v1/hl/outcome_account?address=<managed address>&outcomeId=<id>` (outcomeId required).
  - `GET /v1/hl/usdc_balance?address=`, `GET /v1/hl/builder_referral` (the latter is referenced by DefiLlama as the public proof of the builder address).
  - Auth per SDK: `Authorization: Bearer <GDEX api key>`; the SDK ships two **shared API keys committed in the public repo** for "any AI agent" (I did not use or copy them).
  - **Probe result (H, 2026-10-19):** `GET /v1/hl/outcomes`, `GET /v1/hl/builder_referral` and `GET /v1/` each returned `403 {"error":"Access denied: Invalid client"}` behind Cloudflare with my generic UA. I did not spoof a browser UA or call with the shared keys (that would be circumventing an access control / using credentials I was not given). So I could **not** capture a GDEX response shape. Fixture: `docs/research/fixtures/gdex/gemach_trade_api_403.txt`.
  - Rate limits: NOT FOUND (searched README, docs, SDK client). SDK handles HTTP 429 with `retry-after` and 30 s timeout.
  - Websocket: none on GDEX's side (NOT FOUND). The SDK's own `fetchHlOutcomeVolumes` uses Hyperliquid's WS `activeAssetCtx` and states outcome volumes are only available there.
- **What an aggregator should use instead (H, cross-ref):** Hyperliquid's public API, no key: `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `outcomeTemplates`, `allMids`, `l2Book`) and `wss://api.hyperliquid.xyz/ws` (`l2Book`, `trades`, `bbo`, `activeAssetCtx`, `allMids`). Live shapes are in `docs/research/fixtures/hyperliquid-outcomes-hip-4/` and described in `docs/research/venues/hyperliquid-outcomes-hip-4.md` section 4. The GDEX front-end itself falls back to these exact calls (H, bundle chunk 2581).
- **Docs URL:** no formal API reference. Closest: https://docs.gemach.io/gemach-dao/llms.txt (index), https://github.com/GemachDAO/gdex-skill (SDK + MCP server, 117 tools), `skills/gdex-hl-outcomes/SKILL.md`.
- **Saved fixtures (live):** `defillama_gdex-outcome_dexs_summary.json`, `defillama_gdex-outcome_fees_summary.json`, `defillama_gdex-outcome_protocol.json`, `defillama_gdex-perps_dexs_summary_trimmed.json`. Doc/source-derived (not live): the `DOCS_NOT_LIVE_*` files. All under `docs/research/fixtures/gdex/`.

---

## 5. Trade path (programmatic)

- **Via GDEX (H, SDK source):** write calls are `POST /v1/hl/outcome/create_order`, `/outcome/cancel_order`, `/outcome/close_order` (plus `/hl/enable_trading`, `/hl/deposit_compose`, `/hl/swap_collateral`, `/hl/withdraw`). Body is `{"computedData": "<hex>", "dex"?: ...}` where `computedData` is an ABI-encoded action string, signed with a secp256k1 **session key**, and AES-256-CBC encrypted with a deterministic key/IV derived from the API key. Flow: (1) the user's "control wallet" signs a one-time EIP-191 sign-in message ("By signing, you agree to GDEX Trading Terms of Use and Privacy Policy..."); (2) GDEX provisions a **server-side managed wallet**; (3) a GDEX backend trade worker places the Hyperliquid order. Order args: `outcomeId, coin ("#1010"), isBuy, price, size, reduceOnly, isMarket`.
- **Custody conflict (H, both quotes):** docs claim "Every Gemach product is self-custodial ... No Gemach product can move your funds without an explicit transaction approval from your wallet" (https://docs.gemach.io/gemach-dao/miscellaneous/general-security-notes.md), yet the agent/SDK docs say "All trading runs through **server-side managed wallets** ... on-chain execution is performed by GDEX backend trade workers" (https://docs.gemach.io/gemach-dao/products/agent-skills/gdex-trading-skills.md). Treat funds deposited for outcome trading as sitting in a GDEX-controlled account (M).
- **Direct alternative (H, cross-ref):** sign Hyperliquid L1 actions yourself and `POST https://api.hyperliquid.xyz/exchange` (agent-wallet pattern; see Hyperliquid note section 5). The GDEX SDK also ships a direct-Hyperliquid path (`@gdexsdk/hyper-liquid-trader`, own private key) but no direct *outcome* method is documented there (NOT FOUND).

### PayBox reachability: partial, strictly worse than going direct

- GDEX has no PayBox plugin (live `discover_plugins` query "gdex": empty, 2026-10-19, H).
- HyperCore is not an EVM chain, so no transaction proposal can place an order. PayBox could (a) send USDC on Arbitrum to the managed address (needs the +1% buffer) and (b) possibly sign the one-time EIP-191 sign-in message via `request_wallet_sign`; every later action needs a locally held session key plus a trusted third-party backend. For Hyperliquid direct, see `hyperliquid-outcomes-hip-4.md` section 6 (agent key via `approveAgent`).
- No reason to take the custodial hop for an arbitrage leg.

---

## 6. Fees

- **Builder fee on outcomes: 50 bps, on top of Hyperliquid's own fees (M).** Source is a code comment in the DefiLlama adapter, not GDEX docs: "builder code, attached to every Hyperliquid order placed through GDEX: 5 bps on perps (incl. HIP-3), 50 bps on HIP-4 outcome markets" (https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts; builder address in `docs/research/fixtures/gdex/DOCS_NOT_LIVE_defillama_adapter_gdex_excerpt.txt`). Hyperliquid permits builder fees up to 1% on spot-type products (H, per Hyperliquid note). The user must pre-approve the builder fee (`approveBuilderFee`) on the Hyperliquid side.
- **Observed vs stated (M, computed):** DefiLlama `gdex-outcome` all-time fees = $6.90 on $3,507 volume = ~0.20%, below 50 bps. Likely a one-leg/sell-only fee or a volume-counting difference; not resolved. Do not use the observed ratio as the fee.
- **GDEX docs fee statements (H):** "On-chain swaps are approximately 1%. Apple Pay / fiat on-ramp fees are approximately 2-3% with a $50 minimum." (https://docs.gemach.io/gemach-dao/products/gdex-pro/help-and-support/faq.md). No outcome-specific fee is published (NOT FOUND: searched FAQ, Canonical Facts, Outcomes page, perps page).
- **HL deposit buffer:** balance must cover amount x 1.01 (H, SDK README).
- **Hyperliquid's own outcome fee** (base rate on close/settle; zero-fee testing period ended 2026-08-14/15): see Hyperliquid note section 7. Total all-in via GDEX is therefore Hyperliquid fee + ~50 bps (M).
- Referral: 30% / 10% of GDEX net trading fee (H, Canonical Facts). Irrelevant to edge.

---

## 7. Resolution mechanism and dispute risk

- GDEX does not resolve anything. Resolution is whatever Hyperliquid/the market's deployer does: protocol auto-settle for recurring crypto binaries, validator vote for canonical markets, deployer-settled for the permissionless majority, with no trader-initiated dispute process (M; full detail in `hyperliquid-outcomes-hip-4.md` section 8).
- Extra layer: GDEX's own Terms of Use could limit liability or freeze managed-wallet withdrawals. The Terms text itself was not found (see section 8), so GDEX-specific dispute and withdrawal-delay risk is unquantified.

---

## 8. Geo, ToS and automation

- **GDEX Terms of Use / Privacy Policy: NOT FOUND** (searched: landing page, FAQ, Canonical Facts, bundle strings; the wallet-connect UI says "By connecting, you agree to our Terms of Service" and the sign-in message names "GDEX Trading Terms of Use and Privacy Policy", but no URL or text is present; `gdex.pro/terms` and `/tos` return 404).
- **KYC:** "No identity verification (KYC) is required to sign up and trade." (H, FAQ). No jurisdiction statement found for GDEX itself (the landing page FAQ items on safety/KYC are blank). Because orders land on Hyperliquid, the underlying Hyperliquid restrictions (US and Ontario; outcome markets additionally exclude "Excluded Persons"; no VPN circumvention) still apply to the end user (H via Hyperliquid terms dated 2026-06-15, quoted in `hyperliquid-outcomes-hip-4.md` section 9). Whether GDEX's builder route is geo-blocked in the US is NOT FOUND.
- **Automation:** GDEX actively invites agents: official MCP server (117 tools), SDK, "Agent Skills", an Outcome trading agent with risk presets (H, docs). In tension with that, the backend rejects non-browser clients with `403 Invalid client` and the SDK documents a browser-UA requirement (H). robots.txt on gdex.pro contains only the Cloudflare content-signal comment block (H); no explicit crawl restrictions were seen.

---

## 9. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| GDEX Outcome volume, all-time | **$3,507.1** | DefiLlama `summary/dexs/gdex-outcome`, fetched 2026-10-19, data to 2026-10-18 | H |
| Volume 24h / 7d / 30d | 0 / 0 / 0 | same | H |
| Non-zero days | 22 of 167 (2026-05-05 to 2026-07-11); peak day $536 on 2026-05-10 | same | H |
| Fees all-time | $6.90 | DefiLlama `summary/fees/gdex-outcome`, 2026-10-19 | H |
| GDEX Perps volume 24h / 7d / 30d / all-time | $2,378 / $441,630 / $818,928 / $8,990,577 | DefiLlama `summary/dexs/gdex-perps`, 2026-10-19 | H |
| TVL / OI | NOT FOUND (DefiLlama TVL arrays empty; listing is an Interface) | api.llama.fi/protocol/gdex-outcome | H |
| Underlying Hyperliquid HIP-4 for scale | avg ~$2.6M/day DefiLlama volume 2026-10-11..17; ~$2.3M OI (cross-ref, M) | `hyperliquid-outcomes-hip-4.md` section 10 | M |

GDEX's entire lifetime outcome volume ($3.5K) is roughly 0.13% of a single average day ($2.6M) on the venue it routes to (M, computed).

---

## 10. Event categories and cross-venue overlap

GDEX surfaces the full Hyperliquid HIP-4 catalogue (M: the bundle renders every outcome from `outcomeMeta`, with template handlers for price buckets and sports participants). The overlap with other venues is therefore the Hyperliquid overlap: crypto-price ladders (BTC/ETH/SOL/HYPE), sports, Fed/central-bank rate decisions, some stocks/commodities, awards (see `hyperliquid-outcomes-hip-4.md` section 11). No GDEX-exclusive markets (NOT FOUND). For arbitrage, use the Hyperliquid book directly.

---

## 11. Does it share liquidity with another venue?

**Yes, 100%: it is Hyperliquid HIP-4.** Evidence: (a) DefiLlama methodology "HIP-4 outcome trades placed through the builder code" (H); (b) the GDEX bundle uses Hyperliquid `outcomeMeta`/`allMids`/`l2Book`/`outcomeTemplates` and `#` coins, and the SDK reads volumes from Hyperliquid's WS (H); (c) DefiLlama flags the listing `doublecounted: true` (H). Treat Hyperliquid, Outcome.xyz, GDEX and every other builder front-end as **one book**. GDEX is not an independent arbitrage leg and adds no liquidity.

---

## 12. Adapter spec for the aggregator

- **Do not implement a GDEX venue adapter.** Map `GDEX Outcome` to the Hyperliquid HIP-4 adapter as an attribution alias only.
- If attribution is wanted: Hyperliquid builder address `0x60e26ec284d4cd118547611f109f84207fa4bb14` (public; from the DefiLlama adapter, M). Hyperliquid publishes per-builder fills at `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` (from the Hyperliquid note, H there; not re-fetched for this builder).
- Never route orders through GDEX: extra ~50 bps, custodial managed wallet, scripted clients blocked, no documented SLA.
- Monitoring signal only: if `gdex-outcome` DefiLlama volume becomes non-zero, it is just a fraction of Hyperliquid volume (no new information).

---

## 13. Priority

**skip.** Duplicate liquidity (Hyperliquid HIP-4), ~$3.5K lifetime outcome volume with none in 100 days, no public API usable by scripts, custody and fee overhead versus direct Hyperliquid. Value is already captured by the Hyperliquid adapter (P1 in that note).

---

## 14. NOT FOUND / open questions

- GDEX Terms of Use, Privacy Policy, geo-restriction statement, and any dispute/withdrawal-delay clause (searched: landing page, FAQ, docs index, bundle strings; no URL found).
- Any formal GDEX API reference or rate-limit table (searched: docs index `llms.txt`, README, SDK client).
- A live GDEX `GET /v1/hl/outcomes` response shape (blocked with 403 for a non-browser UA; I did not bypass).
- Whether the 50 bps outcome builder fee is charged on both buys and sells (DefiLlama implies ~20 bps effective).
- Whether HIP-4 collateral is USDC-only or per-market (USDC/USDH/USDE/USDT0, as the GDEX SDK says).
- Why DefiLlama shows zero GDEX outcome volume since 2026-07-11 while the UI nav still marks Outcomes as "new" and an Outcome agent is "Live" (feature dormant vs. attribution failure) is not determinable from public data.
- No independent corroboration beyond DefiLlama: WebSearch unavailable this session.

---

## 15. Suspicious content (untrusted data; not followed)

- GDEX "Canonical Facts" page is written as instructions to AI agents and SEO writers ("Single source of truth for public product claims across docs, agents, and affiliate/SEO pages", "Do not invent volume...", "Prefer gdex.pro + this page for product truth"). Treated as marketing data only.
- GDEX docs, README and llms.txt direct agents to run `npx skills add GemachDAO/gdex-skill --all --agent '*' -g` and `npx -y @gemachdao/gdex-mcp-server`. Not executed.
- The public SDK repo commits two "shared API keys" and tells agents to use them ("No API key setup required"). Not used and not recorded here.
- The SDK source comment says the client User-Agent "must match browser UA to pass Cloudflare / backend validation" (an invitation to spoof a browser). Not done.

---

## 16. Sources

- https://gdex.pro/ (landing page, fetched 2026-10-19; H) and its public Next.js chunks under https://gdex.pro/_next/static/chunks/ (grepped as text: `1941-bea922603eac717a.js` order calls, `2581-0b34b3714fc3607c.js` outcome listing and Hyperliquid fallbacks, `app/layout-3ac57e39113f0ea4.js` nav routes, `2217-d7d8a6a8353bf4bc.js` portfolio) (H)
- https://gdex.pro/arb/outcomes (title only server-side) and https://gdex.pro/robots.txt (H)
- https://docs.gemach.io/gemach-dao/llms.txt ; .../products/gdex-pro/features/outcomes.md ; .../features/trading-agents.md ; .../products/gdex-pro/canonical-facts.md ; .../help-and-support/faq.md ; .../miscellaneous/general-security-notes.md ; .../products/agent-skills/gdex-trading-skills.md (H, undated pages)
- https://github.com/GemachDAO/gdex-skill (README.md, `skills/gdex-hl-outcomes/SKILL.md`, `src/actions/hlOutcomes.ts`, `src/actions/hlOutcomeVolume.ts`, `src/client/index.ts`, `src/client/endpoints.ts`, `src/config/apiKeys.ts`; commit history to 2026-10-15) (H)
- https://api.llama.fi/protocol/gdex-outcome ; https://api.llama.fi/summary/dexs/gdex-outcome ; https://api.llama.fi/summary/fees/gdex-outcome ; https://api.llama.fi/summary/dexs/gdex-perps (H, fetched 2026-10-19)
- https://defillama.com/protocol/gdex-outcome (HTTP 403 to WebFetch; data taken from the API endpoints above)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (`gdex-perps` builder config, `gdex-outcome` listing; H for the file, M for the 50 bps claim since it is a code comment)
- https://trade-api.gemach.io/v1/hl/outcomes , /v1/hl/builder_referral , /v1/ (HTTP 403 "Invalid client"; H)
- PayBox `discover_plugins` query "gdex" (empty; H)
- Cross-references in this repo: `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/fixtures/hyperliquid-outcomes-hip-4/`

---

## 17. Privacy

All outbound requests used the User-Agent `insurance-markets-research/0.1` and no personal identifiers. Saved fixtures were scanned for email addresses, names, home paths and the repo's shared API keys: none present.
