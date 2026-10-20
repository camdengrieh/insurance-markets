# Floatout - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web fetches, `gh api` file reads, unauthenticated GETs of public pages and the public DefiLlama API, static download of the public JS of the demo tenant (read as text, never executed). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own inference/computation; **L** = weak or stale.

Method limits: WebSearch budget ran out after one query, so there is no independent press coverage of Floatout (NOT FOUND, searched: one "Floatout outcome markets Hyperliquid HIP-4" query, which returned zero Floatout hits). Everything below is from Floatout's own pages and docs, DefiLlama, GitHub and Hyperliquid docs. `https://defillama.com/protocol/floatout-outcome` returns HTTP 403 to WebFetch; I used the public DefiLlama API instead.

---

## 0. Bottom line

1. **Floatout is not a prediction market. It is a white-label front-end SaaS for Hyperliquid** (perps + HIP-4 outcome markets). "Floatout is a platform for launching a white-label decentralized exchange (DEX) on top of Hyperliquid"; "Your DEX uses the same order book and liquidity as other Hyperliquid frontends" (H, https://floatout.xyz/ , https://floatout.xyz/hyperliquid-prediction-markets).
2. **Shares liquidity 100% with Hyperliquid HIP-4. It is NOT an independent arbitrage leg.** Fills land on Hyperliquid's HyperCore book and are attributed to Floatout via a builder code (H).
3. **Outcome flow through Floatout is effectively zero.** DefiLlama "Floatout Outcome": $10 all-time volume (one day, 2026-09-11), $0 for the last 24h/7d/30d, $0 fees (H, API fetched 2026-10-19). Caveat: DefiLlama tracks only Floatout's *house* builder code (used by free "Starter" DEXes); activated DEXes use their own builder codes, so total Floatout-hosted flow is unmeasured (M).
4. **No public Floatout API.** Neither docs nor marketing pages describe one (H, NOT FOUND, searched: docs.floatout.xyz index + llms-full.txt, /architecture, /prediction-markets, /pricing, /terms, comparison page). The integrable surface is Hyperliquid's own API.
5. **Routing via Floatout is strictly worse than going direct to Hyperliquid:** it adds a builder fee (demo tenant config: 1.00% on outcomes) and a browser-only wallet flow, for the same book.
6. **adapter_priority = skip.** Build the Hyperliquid HIP-4 adapter instead (see `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, P1). At most, record Floatout as a builder-code attribution label, never as a venue.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| Marketing site, pricing, terms, docs.floatout.xyz and demo.floatout.trade all return HTTP 200 on 2026-10-19 (curl) | H |
| Demo tenant config: `"status":"live","network":"mainnet"`, `flags.outcomes: true` (fixture `demo_tenant_config.json`, from https://demo.floatout.trade/) | H |
| DefiLlama protocol `floatout-outcome` (id 8982, category "Interface", chain "Hyperliquid L1", tag "Hyperliquid HIP4 Builder", parent "Floatout"), `listedAt` 1791497882 = 2026-10-08T22:18Z (fixture `defillama_floatout-outcome_protocol.json`) | H |
| Sitemap lastmod dates 2026-09-23..2026-10-13; Launch-plan setup-fee waiver "ends October 30, 2026" (https://floatout.xyz/pricing) | H |
| GitHub org `Floatout` created 2026-10-01 (6 repos; 5 are forks of unrelated MCP/llms.txt lists, 1 own repo `Floatout/hl-builder-fees`, MIT, 2026-10-13); user `floatouthq` created 2026-10-06 | H (gh api) |
| DefiLlama adapter start date for Floatout house code: 2026-05-05 (`gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts`) | H |

Verdict: **still_live = true as a front-end SaaS** (young: public footprint dates from roughly May-October 2026). Live as an independent *venue*: no.

---

## 2. Kind and market model

- **Kind (H):** broker-or-frontend / white-label DEX builder on Hyperliquid. Operators "name your DEX... it goes live on a Floatout subdomain" (e.g. `name.floatout.trade`), customise branding, and earn builder fees. Traders trade Hyperliquid perps and "Hyperliquid's existing prediction-market catalog" (https://floatout.xyz/). "Operators ... cannot create questions, act as oracles, or gain settlement rights" (https://floatout.xyz/hyperliquid-prediction-markets).
- **Market model:** inherited from HIP-4 (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets): binary Yes/No outcomes, categorical "questions" (exactly one outcome settles Yes), on-chain CLOB on HyperCore with a merged Yes/No book, fully collateralised.
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** `encoding = 10*outcome + side`; coin `#<encoding>`, token `+<encoding>`, order asset id `100_000_000 + encoding`. Floatout adds no tokens of its own.
- Floatout page text lists no categories ("sports matches, company logos, and macro decisions" only as examples, M via page summary).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | HyperCore (Hyperliquid L1), not EVM | H |
| Collateral / quote token | Floatout names only "the quote token". Hyperliquid's live outcome spec carries `quoteToken:"USDC"` (per `hyperliquid-hip-4-outcomes-native.md`, M here) | M |
| Trader funds | Held in the trader's own Hyperliquid account; "Floatout does not hold traders' deposits"; funds "leave only through merkle-proven claims" refers to *builder fee* money, not trader funds (https://floatout.xyz/trader-funds , /architecture) | H |
| Floatout's own contract | `BuilderLedger` (per-DEX, owner = builder) holds accrued builder fees; allocations published as a merkle root by a Floatout-run operator, 48 h upgrade timelock. **EVM chain and contract addresses: NOT FOUND** (searched: /architecture, /terms, docs llms-full.txt, GitHub org) | H / NOT FOUND |
| Floatout house builder address | `0x8e31dfb0fb06b92a4b623c17e139fc9119484fc8` (public protocol address; in the demo tenant config and in DefiLlama's adapter comment "used by every free Floatout DEX. 100% of its fees go to Floatout") | H |

---

## 4. Read API

- **Official Floatout API: none documented.** Docs home says it does not cover API/developer docs; /architecture: "Public API: None is described"; /prediction-markets does not state any. (H/NOT FOUND, searched: https://docs.floatout.xyz/ , https://docs.floatout.xyz/llms-full.txt , https://floatout.xyz/architecture , /prediction-markets , /prediction-market-platform-comparison , /pricing.)
- The tenant app is a client-side SvelteKit SPA (`ssr=false`) that preconnects to `https://api.hyperliquid.xyz` (H, demo page head). The marketing site references a Supabase project host as a backend (H: appears in the home page HTML); not documented, requires keys, and I did not probe it. Docs mention an HTTP 451 geo-block "on every path, including the API" (H, docs.floatout.xyz/llms-full.txt) so a tenant-level HTTP API exists but is undocumented (do not rely on it).
- **Use Hyperliquid directly for all reads** (documented, keyless): REST `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `settledOutcome`), WebSocket `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `allMids`, `activeAssetCtx`, `outcomeMetaUpdates`). Rate limits (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits): REST 1200 weight/min/IP; `l2Book`/`allMids` weight 2, other info types 20; WS max 10 connections, 30 new connections/min, 1000 subscriptions, 2000 msgs/min. Full field-level spec lives in the native Hyperliquid note.
- **Fixtures (public GETs, all H):** `docs/research/fixtures/floatout/`
  - `defillama_floatout-outcome_protocol.json` (GET https://api.llama.fi/protocol/floatout-outcome)
  - `defillama_floatout-outcome_dexs_summary.json` (GET https://api.llama.fi/summary/dexs/floatout-outcome): `total24h 0, total7d 0, total30d 0, totalAllTime 10`, one non-zero day 2026-09-11 = 10
  - `defillama_floatout-outcome_fees_summary.json` (GET https://api.llama.fi/summary/fees/floatout-outcome): all zero; methodology "Builder-code fees paid by users on Hyperliquid HIP-4 outcome trades placed through the builder code"
  - `demo_tenant_config.json`: the `window.__TENANT__` object embedded in https://demo.floatout.trade/ (builder address, flags, fee config). Not an API; a page-embedded config.
  - I did **not** POST to Hyperliquid (ground rules). `GET /info` is POST-only; shapes for `outcomeMeta` are in the native note and third-party docs (https://docs.chainstack.com/reference/hyperliquid-info-outcomemeta, M).

---

## 5. Trade path

- **Via Floatout:** none programmatic. "Orders are signed in your browser" and sent to Hyperliquid (H, https://floatout.xyz/architecture); sign-in by email or wallet (H, home). Trader first signs `approveBuilderFee` with the **main wallet** (not an agent wallet) naming a max fee for the tenant's builder code; "Approvals are staged": perps max at onboarding, outcome max on the first outcome trade (H, docs llms-full.txt; HL rule confirmed at https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). `hlAgentName` in the tenant config indicates an approved Hyperliquid agent wallet is used for browser signing (M, inference from field name).
- **Direct (recommended, same book):** signed JSON actions to `POST https://api.hyperliquid.xyz/exchange`; outcome orders use the normal `order` action with `a = 100_000_000 + 10*outcome + side`; optional `builder:{b,f}`. Agent wallets via `approveAgent`. Details in `hyperliquid-hip-4-outcomes-native.md` section 5.
- **Builder code on API orders:** an aggregator could pass Floatout's house code, but that only pays Floatout a fee. There is no reason to.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial, identical to Hyperliquid, with nothing added by Floatout.**

1. Outcome trading is signed HyperCore actions, not EVM transaction proposals (H: Hyperliquid asset-ids/exchange docs). A PayBox EVM wallet cannot "propose a transaction" that trades outcomes.
2. A PayBox wallet *could* sign the one-time `approveAgent` / `approveBuilderFee` typed-data and funding transfer (USDC on Arbitrum, per native note M) via `request_wallet_sign`, then a local agent key places orders. This is the Hyperliquid route, not a Floatout route (M, see native note section 6).
3. Floatout's web front-end needs a browser wallet or email login (H); no WalletConnect/agent/automation path is documented (NOT FOUND, searched: docs, /trader-funds). Not usable by an agent.
4. Geo gate required (section 9).

---

## 7. Fees

| Layer | Detail | Tag |
|---|---|---|
| Hyperliquid protocol fee on outcomes | Charged on close/settle, not on open; no rebates; numeric rate not in the official docs (see native note section 7) | M (cross-ref) |
| **Floatout builder fee (outcomes)** | Per-DEX, set by operator, paid by the trader on top of Hyperliquid fees. Hyperliquid caps spot-style (incl. outcome) builder fees at **1%** per fill (Floatout docs: "1% on spot-style markets, which includes outcome markets"; HL builder-codes page states the spot cap but does not mention outcomes, so the outcome cap is inferred). The demo tenant's `fees.outcomes = {feeTenthsBp:1000, ceilingTenthsBp:1000}` = **1.00%**, and `fees.perps = {100, 100}` = 0.10% (units are tenths of a bp per HL / `Floatout/hl-builder-fees` README) | H (config value) / M (unit reading, outcome cap) |
| Which fills are charged | Floatout: "eligible sell" orders only; buys and settlement proceeds are not counted (https://floatout.xyz/prediction-market-fees). Hyperliquid's deployer-actions page (testnet-only banner) says builder codes "can also be applied to buy orders for outcome orders" and are charged "on a best-effort basis". Sources disagree; model the worst case (both sides) | H (conflict) |
| Starter (free) DEXes | Fees "fixed at the platform defaults and you cannot edit them"; 100% of builder fees go to Floatout. Launch: $2,500 one-time (waived to 2026-10-30), Floatout keeps 15%; Pro: $7,500, 10% (https://floatout.xyz/pricing, docs llms-full.txt) | H |
| Who pays | The trader, in the quote token | H |

Arbitrage implication: a Floatout tenant at 1% on sells is a ~100 bp round-trip drag versus direct Hyperliquid, large relative to typical cross-venue edges. Never route through Floatout.

---

## 8. Resolution mechanism and dispute risk

Entirely Hyperliquid's. "Markets settle through Hyperliquid's process under published rules. Community members do not vote on outcomes" and Floatout "does not ... decide which outcome wins" (H, /prediction-markets and /hyperliquid-prediction-markets). Protocol recurring markets auto-settle from HyperCore mark price; most other markets are deployer-settled with no trader dispute window (see native note section 8, M cross-ref). Floatout itself lists "disputed settlement" as a relevant risk (H, /trader-funds). Additional Floatout-specific risk: builder-fee allocations rely on a trusted off-chain publisher (H, /pricing, /trader-funds); this affects operators/referrers, not trader positions.

---

## 9. Geo, ToS, automation

- Floatout Terms (https://floatout.xyz/terms, H via page summary): no geo list, no automation/bot/API clause, no dispute clause; states the system is non-custodial ("No party, including Floatout, can move user funds"). Floatout "does not provide a license to operate" and says operator and trader eligibility "depend on jurisdiction and activity" (home page).
- Operators can block countries (ISO codes, plus `T1` Tor exits and `XX` unknown) returning HTTP 451 on every path (H, docs llms-full.txt). So access varies per tenant.
- **Underlying Hyperliquid Terms of Use, "Last updated on June 15, 2026" (H, re-read this session from https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js):** Restricted Persons include residents of "the United States of America or Ontario, Canada"; outcome markets are additionally unavailable to "Excluded Persons" (unpublished list). That applies to any Hyperliquid front-end including Floatout.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Floatout Outcome volume via house builder code | $0 / 24h, $0 / 7d, $0 / 30d, **$10 all-time** (single day 2026-09-11) | https://api.llama.fi/summary/dexs/floatout-outcome, fetched 2026-10-19 | H |
| Floatout parent (`floatout`) volume | $0 / 24h-30d, $10 all-time | https://api.llama.fi/summary/dexs/floatout, fetched 2026-10-19 | H |
| Floatout fees | $0 | https://api.llama.fi/summary/fees/floatout-outcome | H |
| Underlying Hyperliquid outcomes (the real liquidity) | $3.13M on 2026-10-18; $17.9M over 7d; $47.0M over 30d; $261.1M all-time | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| OI / TVL for Floatout | none (Interface category, no TVL) | DefiLlama protocol JSON | H |

Floatout's own pages publish no volume, user or OI figures (H, NOT FOUND, searched: /pricing, /prediction-markets, /hyperliquid-prediction-markets).

---

## 11. Event categories and overlap

Same catalogue as Hyperliquid HIP-4: crypto price ladders, sports, central-bank decisions, awards etc. Overlap with Polymarket/Kalshi/Limitless is a property of Hyperliquid, not Floatout (see native note section 11). Floatout cannot list anything Hyperliquid does not.

---

## 12. Shared liquidity

**Yes, 100% shared with Hyperliquid HIP-4 outcomes** (and with every other Hyperliquid front-end: Outcome.xyz, Phantom, etc.). DefiLlama's builder-code "Interface" lines are attribution of the same fills, not additional volume: never add Floatout volume to Hyperliquid's (M; DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code", H).

---

## 13. Adapter spec

- **Do not build a Floatout adapter.** Treat `floatout` only as an optional `builder` label when decoding Hyperliquid fills (builder address `0x8e31...4fc8`), if attribution ever matters.
- The venue-adapter work is entirely the Hyperliquid HIP-4 adapter (WS `l2Book` on side-0 coins, `outcomeMetaUpdates`, `settledOutcome`; asset id `100_000_000 + 10*outcome + side`; no builder code on our own orders to avoid the extra fee).
- If a user insists on trading via a Floatout tenant: not automatable; browser-wallet flow; expect up to 1% builder fee on eligible sells.

---

## 14. Priority

**adapter_priority = skip.** Duplicate liquidity (Hyperliquid), no public API, zero measured volume through it, extra fee layer, and a very young operator (org created 2026-10-01). Useful only as a data point that Hyperliquid HIP-4 has a long tail of front-ends.

---

## 15. NOT FOUND / open questions

- Any Floatout public/trader API (searched: docs index, llms-full.txt, architecture, pricing, comparison pages, GitHub org).
- EVM chain and addresses of `BuilderLedger` (searched: /architecture, /terms, docs, GitHub org).
- Total volume across activated Floatout DEXes (DefiLlama covers only the house code; activated DEX builder codes unpublished).
- Actual default fee on Starter DEXes beyond the demo tenant's 1.00% outcomes / 0.10% perps config (docs say only "platform defaults").
- Whether outcome builder fees apply to buys as well as sells (Floatout says sells; Hyperliquid's testnet-bannered deployer page says buys possible, best-effort).
- Independent press/third-party coverage (WebSearch budget exhausted; one query returned no Floatout hits).
- Official HL statement of the outcome builder-fee cap (inferred from spot).

---

## 16. Suspicious content

None addressed to AI agents. Notes: `floatout.xyz/robots.txt` carries `Content-Signal: search=yes, ai-input=yes, ai-train=yes` and an explicit AI-crawler allow list (a crawler policy, not an instruction to agents); docs expose `llms.txt`/`llms-full.txt` (benign indexes; I read `llms-full.txt` as data). The `Floatout` GitHub org is mostly forks of popular MCP/llms.txt lists (looks SEO/visibility-oriented); I read only the README of its one original repo, `hl-builder-fees`, as data and ran nothing.

---

## 17. Sources

Primary (H):
- https://floatout.xyz/ , /pricing , /terms , /architecture , /trader-funds , /prediction-markets , /hyperliquid-prediction-markets , /prediction-market-fees , /prediction-market-platform-comparison , /robots.txt , /sitemap.xml
- https://docs.floatout.xyz/ and https://docs.floatout.xyz/llms-full.txt (operator docs, fee rules, geo-block, Starter terms); https://docs.floatout.trade (trader docs, 2 pages, nothing on outcomes)
- https://demo.floatout.trade/ (embedded tenant config, saved as fixture)
- https://api.llama.fi/protocol/floatout-outcome ; /summary/dexs/floatout-outcome ; /summary/fees/floatout-outcome ; /summary/dexs/floatout ; /summary/dexs/hyperliquid-outcomes
- DefiLlama adapter: `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (entries `floatout`, `floatout-outcome`)
- GitHub: https://github.com/Floatout (org), https://github.com/Floatout/hl-builder-fees (README, fee-cap table; Floatout-authored, M for its inferences)
- Hyperliquid: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; .../for-developers/api/asset-ids ; .../for-developers/api/rate-limits-and-user-limits ; .../for-developers/api/hip-4-deployer-actions (testnet-only banner) ; .../trading/builder-codes ; Terms JS https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (last updated 2026-06-15)

Secondary (M/L):
- https://docs.chainstack.com/reference/hyperliquid-info-outcomemeta (outcomeMeta example, M)
- `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (parallel-workflow note on the underlying venue; collateral USDC, fees, resolution, PayBox reach, M)
- WebSearch 2026-10-19 "Floatout outcome markets Hyperliquid HIP-4" (no Floatout hits; general HIP-4 context only, M)
