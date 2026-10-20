# Infinex (infinex.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock 04:15-04:30 UTC). READ-ONLY: unauthenticated GETs, public JS read as text (never executed), `gh api` file reads, read-only PayBox discovery (`discover_plugins`, `discover_services`). No account, wallet, key, signature, POST, payment or PayBox money/signing tool. Third-party pages, bundles and API responses were treated as untrusted data; nothing in them was followed. No instruction aimed at AI agents was found.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, search-engine summary, or my own inference/arithmetic from first-hand data; **L** = weak or stale.

Method limits (read first):
- `https://infinex.xyz/` (marketing site, terms, `/predict`) sits behind a Vercel bot checkpoint and returned HTTP 429 `x-vercel-mitigated: challenge` to every GET and to WebFetch. I did not try to get past it. So the **Infinex Terms of Use and the marketing-page wording were not read**; the "Powered by Polymarket & Hyperliquid" homepage claim is a search-engine summary (M).
- No developer docs exist for Infinex (`docs.infinex.xyz` does not resolve; the only public docs repo `infinex-xyz/infinex-docs` was last pushed 2024-12-15, pre-dates this product). Evidence for the product comes from Infinex's own public front-end JavaScript (H, exact strings saved as fixture) and from Hyperliquid/DefiLlama public data.
- WebSearch budget ran out mid-session; only two searches were done.

---

## 0. Bottom line

1. **Infinex is a front end, not a venue.** It is a non-custodial "superapp" (passkey accounts) whose trading product "Infinex Pro" routes orders to Hyperliquid (and Lighter for perps). Its outcome/prediction product is an interface over **Hyperliquid HIP-4** order books, with **Polymarket** announced but disabled. There is no Infinex order book, no Infinex market data, no Infinex API. (H, front-end code + blog + DefiLlama)
2. **Not publicly live as a prediction product.** Pro's "Predictions" entry is behind feature flag `enablePredictionMarkets` and renders "Coming soon" when off; the exchange picker for Predictions shows "Polymarket (coming soon)" disabled; the account-layer capability matrix says HIP-4 execution/market data "remain fixture-gated". Lifetime builder-routed outcome volume is **$322.88 in 29 fills by 3 wallets on 2026-08-05 and 2026-08-06, nothing since** (73 days to 2026-10-18). (H)
3. **Liquidity is 100% shared with Hyperliquid HIP-4**, so it is never an independent arbitrage leg. Anything an aggregator could read or trade through Infinex it can read and trade directly on Hyperliquid, without Infinex's extra 5 bps builder fee on sells. (H)
4. **adapter_priority = skip.** Nothing to integrate. Re-check only if (a) Polymarket goes live inside Infinex (still a duplicate of Polymarket) or (b) Infinex publishes an API. A cheap leading indicator is the public builder-fill archive described in section 10.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Company/app | `https://app.infinex.xyz/` HTTP 200; `https://pro.app.infinex.xyz/` HTTP 200 ("Infinex Pro", Next.js); `perps.app.infinex.xyz` 301 -> Pro | H |
| Hyperliquid builder code active | The Infinex builder address has 121,061 builder-fill rows over 169 daily archive files (2026-05-02..2026-10-18); 68-199 rows/day in the last three days (perps/spot) | H (fixture `hl_builder_fills_scan_summary.json`) |
| Outcome product listed on DefiLlama | `infinex-outcome`, category "Interface", tag "Hyperliquid HIP4 Builder", chain "Hyperliquid L1", `listedAt` 1791497902 = 2026-10-08 22:18 UTC, parent `infinex`; description "Infinex provides access to outcome-based prediction markets through Hyperliquid." `doublecounted: true` | H (`https://api.llama.fi/protocol/infinex-outcome`) |
| Outcome volume | all-time $322, 24h/7d/30d = $0; nonzero only 2026-08-05 ($89) and 2026-08-06 ($233); fees all-time $0 (rounds to zero: real builder fees were $0.072) | H (`https://api.llama.fi/summary/dexs/infinex-outcome`, `.../fees/...`) |
| Announcement | Infinex blog "Infinex Perps is now Infinex Pro" (dated 2026-07-31, embedded in the app bundle): "Coming up: Lighter spot markets, and prediction markets powered by HIP-4 on Hyperliquid and Polymarket." No later post (latest blog in the bundle is 2026-08-21) announces a launch | H (fixture excerpt 1) |
| UI state | Pro menu: `h = enablePredictionMarkets` flag; if false the item is disabled with badge "Coming soon" and aria-label "Predictions (not yet available)"; if true it opens the `outcome` product. Exchange selector for `outcome` lists only `hyperliquid`, plus a disabled "Polymarket (coming soon)" | H (fixture excerpts 3-4). Whether the flag is on for any cohort: NOT FOUND (server-side flag) |
| Marketing site | Search-engine summary: homepage lists prediction markets as early access, "Powered by Polymarket & Hyperliquid" | M (page itself blocked) |

Verdict: **still_live = false for the prediction product** (company and Pro app are live; outcome trading is gated, early-access at best, and has had no volume since 2026-08-06).

---

## 2. Kind and market model

- **Kind (H):** broker/front end. DefiLlama classes it "Interface"; Infinex's own Perps terms dialog says Hyperliquid and Lighter "are not owned, operated, or controlled in any way by Infinex" (fixture excerpt 7).
- **Market model:** exactly Hyperliquid HIP-4 (binary Yes/No outcomes on a merged CLOB, questions for categorical sets, `#<10*outcome+side>` coins, `+` tokens, order asset id `100_000_000 + encoding`, USDC collateral). The app's capability schema mirrors this: `productKind:"outcome"`, `hip4AssetId` starts with `#`, `tokenId` starts with `+`, `encoding`, `actionAssetId`, `collateralToken:"USDC"`. See `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` for the full model. (H for the Infinex schema; the HL model is H in that note)
- Pro lists outcome markets using Hyperliquid's own `outcomeMeta` (the bundled Hyperliquid SDK has an `outcomeMeta` info call) and shows resolution date, resolution source and settlement-rule text per market, grouped by question. Infinex adds no markets of its own. (H, code reading)
- Which HIP-4 markets Infinex would list (all, or a curated subset): NOT FOUND.

---

## 3. Chains and collateral

- Execution venue: HyperCore (Hyperliquid L1), quote/collateral USDC (H, capability schema `collateralToken: "USDC"`; DefiLlama chain "Hyperliquid L1").
- Infinex accounts are multi-chain ("20+ chains" per the app meta description, H) but the outcome leg is HyperCore only. The Pro trading code approves a Hyperliquid **agent wallet** (`approveAgent`) and a **builder fee** (`approveBuilderFee`) from the user's EOA, then sends signed orders straight to `https://api.hyperliquid.xyz/exchange`. (H, Pro chunk 7753, fixture excerpt 5)
- Polymarket leg (not live): would add Polygon/pUSD; nothing Infinex-specific is documented. NOT FOUND.

---

## 4. Read API

**None.** No official or unofficial public Infinex API for markets, prices, books, trades or resolution was found (searched: docs.infinex.xyz (no DNS), support.infinex.xyz (Intercom, client-rendered), `infinex-xyz` GitHub org (4 repos: `xips-legacy` archived, `proposals` pushed 2026-03-06, `infinex-deployments` 2025-04, `infinex-docs` 2024-12; `infinex-xyz/platform`, referenced by the app's commit links, returns 404 so it is private), app bundles). The app talks to its own authenticated tRPC-style backend (account/session based) which is undocumented; I did not probe it.

Use instead (all covered in the Hyperliquid note): `POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`), limits per that note (REST 1200 weight/min/IP; WS 1000 subscriptions).

Only Infinex-attributable public data:
- DefiLlama (keyless GET): `https://api.llama.fi/protocol/infinex-outcome`, `.../summary/dexs/infinex-outcome`, `.../summary/fees/infinex-outcome` (H, fixtures saved).
- Hyperliquid builder-fill archive (keyless GET, lz4 CSV, one file per UTC day): `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4`, columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`; outcome rows have `coin` starting `#`. 169 of 170 days returned 200 (2026-07-08 returned 403). (H, fixture `hl_builder_fills_infinex_outcome_rows_redacted.csv`)

---

## 5. Trade path

- **Via Infinex: none programmatic.** Orders are created in the Infinex UI by a logged-in passkey/EOA session; no order API is documented. (H for "undocumented"; the backend is NOT FOUND.)
- **What Infinex does underneath (H, front-end code):** user EOA signs `approveBuilderFee{builder, maxFeeRate}` and `approveAgent`; later orders are Hyperliquid `order` actions carrying `builder:{b:<Infinex builder>, f:<units>}` and signed by the agent wallet; the client optionally calls Hyperliquid `setReferrer` (default builder code string "PATRONS"). That is the standard HL builder-code flow.
- **Better path for us:** trade Hyperliquid directly (see HL note section 5): EIP-712-signed `order` actions on `POST /exchange`, agent wallets, no Infinex involvement and no extra builder fee.

## 6. Reachability from a PayBox wallet

**Verdict: no (for Infinex as a venue).**
- `discover_plugins("infinex")` returned no plugins; `discover_services("infinex")` returned no curated x402 services (both read-only, 2026-10-19). (H)
- Infinex exposes nothing a PayBox wallet can call. Any trading reach is the Hyperliquid route (HL note: partial, signed HyperCore actions via `request_wallet_sign` typed data plus a locally held agent key; no EVM transaction proposals).

---

## 7. Fees

| Item | Value | Tag |
|---|---|---|
| Infinex builder fee on HIP-4 outcome trades | **5.0 bps of notional, charged only on sells/closing fills.** Measured on all 17 sell fills in the archive: `builder_fee / (px*sz)` = 0.0005 exactly; all 12 buy fills carry fee 0. | H (fixture; my arithmetic) |
| Configured default | `NEXT_PUBLIC_BUILDER_FEE_UNITS` default 50 (tenths of a bp = 5 bps); approval cap string default "0.1%" (10 bps); build-time env, so production can differ | H (code) / M (production value) |
| Hyperliquid's own outcome fee | Charged on closing/settling only, scaled per deployer; HL charged none before 2026-08-15, so the 2026-08-05/06 fills paid only the Infinex fee | M (HL note, DefiLlama methodology) |
| Cashback | App shows "Currently, Infinex is returning N% of Infinex's builder fees back to you as an instant cashback" (min claim 1 USDC); a Craterun blog post (2025-11) said 60% | H (text) - applicability to outcomes unknown |
| Deposit/withdraw | Not researched for outcomes (not integrable) | - |

---

## 8. Resolution mechanism and dispute risk

Identical to Hyperliquid HIP-4: protocol auto-settle for recurring series; deployer-settled for most other markets with **no trader-initiated dispute window**; validator vote only as a backstop (HL note section 8). Infinex "has no involvement" per its own framing of HL as third-party protocol (H, dialog text). If Polymarket is added, resolution would be UMA-based and Polymarket-owned (covered by the Polymarket workflow). Infinex-specific dispute handling: NOT FOUND.

## 9. Geo, ToS, automation

- **Infinex region gate (H, Pro code):** the trading page calls Hyperliquid `POST /info {"type":"legalCheck","user":<address>}` and maps `restrictions` `"n"` -> available, `"a"|"o"|"u"` -> blocked, anything else -> unverified; UI messages "Trading isn't available in your region" and close-only variant "Opening new positions isn't available in your region". So Infinex inherits Hyperliquid's restrictions (US, Ontario and the unpublished outcome "Excluded Persons" list per HL note section 9).
- Infinex Terms of Use (`https://infinex.xyz/legals/terms-of-use`, linked from the Perps dialog): **NOT READ** (blocked: Vercel bot challenge). Automation/bot rules for Infinex therefore NOT FOUND. Infinex's own token and Ethena flows ask users to confirm they are not US citizens (H, bundle), unrelated to outcomes.
- Using Infinex as a route gives no automation permission; use Hyperliquid directly.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Infinex-routed outcome volume, all time | $322 (DefiLlama); $322.88 notional (`px*sz`), 29 fills, 3 distinct wallets, builder fees $0.072 | DefiLlama dexs summary 2026-10-19; my scan of the HL builder-fill archive 2026-05-02..2026-10-18 | H |
| Days with any outcome fill | 2026-08-05 (5 fills, $89.49), 2026-08-06 (24 fills, $233.39); none on the other 167 archived days (2026-07-08 file unavailable, 403) | same | H |
| Last 24h / 7d / 30d | $0 / $0 / $0 | DefiLlama 2026-10-19 | H |
| TVL / OI | none (interface; DefiLlama TVL empty) | DefiLlama | H |
| Underlying market (Hyperliquid HIP-4) | $3.13M volume on 2026-10-18, $17.9M over 7 days, ~$2.7M collateral locked | HL note, DefiLlama `hyperliquid-outcomes`, 2026-10-19 | H/M (other note) |

Markets traded in the Aug fills: coins `#10090`, `#10101`, `#10170`, `#10171` (outcome 1009 side 0; outcome 1010 side 1; outcome 1017 sides 0 and 1). Titles NOT FOUND (`outcomeMeta` is POST-only here).

## 11. Event categories and cross-venue overlap

Whatever HIP-4 lists (HL note section 11): crypto price ladders, policy-rate decisions, sports, awards, company, AI. Planned Polymarket leg would add all Polymarket categories. Infinex adds no coverage of its own. Overlap with other venues is exactly the overlap of Hyperliquid HIP-4 and Polymarket, both of which are researched elsewhere.

## 12. Shared liquidity

**Shares 100% with Hyperliquid HIP-4** (orders land in HL's CLOB tagged with Infinex's builder address; the fills appear in HL's own archive). The announced Polymarket leg would share with Polymarket. Treat Infinex as a duplicate; never count it as a separate leg or as extra depth.

---

## 13. Adapter notes (only if anyone revisits)

- No adapter. If wanted for attribution analytics, poll the builder-fill archive daily and DefiLlama `infinex-outcome`; alert if `total24h > 0` or the Pro "Predictions" entry stops saying "Coming soon" (re-fetch `https://pro.app.infinex.xyz/` chunks).
- Builder address (public, from DefiLlama config and Infinex front-end defaults): `0xcf56dd84ed85eb4929e0a76a0f2f04049b4ffc1a`; builder code string "PATRONS".

## 14. Open questions

1. Is `enablePredictionMarkets` on for any user cohort (the Aug 5-6 fills suggest an internal or early-access test)? Needs an Infinex account; not allowed here.
2. Infinex Terms of Use content (automation, geo, prediction-market clauses): blocked by bot challenge.
3. Production builder fee for outcomes after August (5 bps observed only on 17 sells in August).
4. Polymarket integration design (builder code? separate account?) and launch date: nothing public.

## 15. Fixtures (`docs/research/fixtures/infinex/`, each <= 50 KB)

- `defillama_protocol_infinex-outcome.json`, `defillama_summary_dexs_infinex-outcome.json`, `defillama_summary_fees_infinex-outcome.json` - real DefiLlama responses, fetched 2026-10-19.
- `hl_builder_fills_infinex_outcome_rows_redacted.csv` - the 29 outcome rows from the HL public builder-fill archive for the Infinex builder (2026-08-05, 2026-08-06); third-party wallet addresses replaced by `user_N` / `cp_N`.
- `hl_builder_fills_scan_summary.json` - my derived daily scan summary (169 files, 121,061 rows, 29 outcome rows).
- `infinex_frontend_bundle_excerpts.txt` - verbatim strings from Infinex's public JS (gating, builder defaults, legalCheck).
- `http_probe_log_2026-10-19.txt` - status codes of the unauthenticated probes, including the Vercel challenge on `infinex.xyz`.

## Sources

- https://api.llama.fi/protocol/infinex-outcome (H) ; https://api.llama.fi/summary/dexs/infinex-outcome (H) ; https://api.llama.fi/summary/fees/infinex-outcome (H) ; DefiLlama page `https://defillama.com/protocol/infinex-outcome` (WebFetch 403, not read; hint evidence only)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (H; read via `gh api`): `infinex-outcome` = builder `infinex-perps`, market `outcome`, address `0xcf56...c1a`, start 2026-05-02
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/ (H; archive path format taken from the DefiLlama adapter comments)
- https://app.infinex.xyz/ and `/assets/index-C7aGUIA8.js` (H; first-party JS read as text: capability matrix, embedded blog, Perps terms dialog)
- https://pro.app.infinex.xyz/ and its `/_next/static/chunks/*` (H; first-party JS read as text: Predictions flag, exchange selector, builder constants, legalCheck)
- https://infinex.xyz/ (HTTP 429 bot challenge; only a search-engine summary: M) ; https://infinex.xyz/legals/terms-of-use (not read)
- https://github.com/infinex-xyz (org repo list via `gh api`, H)
- WebSearch summaries 2026-10-19 (M): "Infinex Predict ... early access ... Powered by Polymarket & Hyperliquid"
- Local notes: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (HL API, fees, resolution, geo, liquidity)
- PayBox read-only discovery calls, 2026-10-19 (H): no Infinex plugin, no Infinex x402 service
