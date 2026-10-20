# SendAI ("SendAI Outcome") - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (DefiLlama API, sendai.fun pages and JS bundles, Hyperliquid's public builder-fills archive), `gh api` file reads, page fetches. No account, wallet, key, signature, POST/PUT/DELETE, payment, or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, another project note, or my own inference/computation; **L** = weak or stale.

Method limits: WebSearch budget was exhausted before I started (no news search possible); `defillama.com` and `flowscan.xyz` pages returned HTTP 403 to WebFetch (I used the DefiLlama JSON API instead); `x.com/sendaifun` returned HTTP 402 to WebFetch (nothing read, nothing paid).

---

## 0. Bottom line

1. **SendAI is not an outcome-market venue.** sendai.fun is a marketing page for an "applied AI lab" (Solana Agent Kit, hackathons, "Cursor for Trading"). It never mentions Hyperliquid, outcome markets, prediction markets, or an API (H, page + all 13 JS bundles + kit.sendai.fun checked).
2. **The only "SendAI outcome" artefact is a DefiLlama listing** (`sendai-outcome`, category "Interface", tag "Hyperliquid HIP4 Builder", listed 2026-10-08). It is the **builder-code footprint of one Hyperliquid address**, attributed to SendAI **by name only** (the DefiLlama adapter comment says "matched by name only to SendAI"; label from flowscan.xyz, which I could not read). I found no SendAI-owned frontend, repo, or doc that uses that address (H for the DefiLlama comment, M for the conclusion).
3. **Volume is effectively zero: $60 all-time** across two buy fills (2026-05-02 and 2026-06-17), builder fee collected $0, nothing in the last 30 days (H, DefiLlama API + raw Hyperliquid builder fills, fixtures).
4. **It routes into Hyperliquid HIP-4's books, so it has no independent liquidity.** If the aggregator integrates Hyperliquid HIP-4 directly (see `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`), SendAI adds nothing.
5. **adapter_priority = skip.**

---

## 1. Still live? (2026)

| Question | Evidence | Tag |
|---|---|---|
| Is SendAI the company live? | sendai.fun serves (HTTP 200); footer "Twenty'26 SendAI Inc."; GitHub org `sendaifun` has repos pushed in 2026 (e.g. `solana-new` 2026-10-02, `skills` 2026-07-31, `solana-keychain` 2026-06-04) | H (https://www.sendai.fun/ ; `gh api orgs/sendaifun/repos`) |
| Does SendAI run an outcome-market product? | **NOT FOUND** (searched: sendai.fun home + bundles, /markets /predict /trade /perps /outcomes /app /docs /api all 404, app/trade/perps/hl/markets/outcomes subdomains do not resolve, kit.sendai.fun, sendai.fun/tnc, `gh search code` for "hyperliquid" in org `sendaifun`, which returns only unrelated skills e.g. a third-party smart-money data skill) | H (negative) |
| Is the DefiLlama "outcome" series active? | Non-zero on exactly two days: 2026-05-02 ($50) and 2026-06-17 ($10); zero every other day to 2026-10-18; 24h/7d/30d all $0 | H (https://api.llama.fi/summary/dexs/sendai-outcome, fetched 2026-10-19) |
| Is the underlying builder address alive at all? | Yes for perps, trivially: DefiLlama `sendai-perps` fees $1.57 24h, $41.53 7d, $45.89 all-time, 13 non-zero days since 2026-02-11 | H (https://api.llama.fi/summary/fees/sendai-perps) |

Verdict: **still_live = false as an outcome-market venue** (company site live; no evidence of a user-facing outcome product; last outcome fill 2026-06-17). Hyperliquid HIP-4 itself is live and is covered by its own note.

---

## 2. Kind and market model

- **Kind:** at most a *builder-code frontend/broker* on Hyperliquid HIP-4 (DefiLlama: "SendAI provides access to outcome-based prediction markets through Hyperliquid", category Interface). SendAI does not host markets, books, or settlement (H for the DefiLlama text; M for "at most").
- **Market model:** whatever HIP-4 offers (binary Yes/No share pairs on a merged on-chain CLOB, categorical "questions", scalar-capable standalone outcomes, collateralised USDC, outcome coin `#<10*outcome+side>`, order asset id `100_000_000 + enc`). Read the HIP-4 note; I re-checked only that the fixture fills use coins `#0` and `#1890` (H), consistent with that encoding (M).
- DefiLlama's own volume definition for the series: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H, fixture `defillama_dexs_summary_sendai-outcome.json`).

## 3. Chains and collateral

HyperCore (Hyperliquid L1); quote token USDC (see HIP-4 note). DefiLlama lists chain "Hyperliquid L1" only (H). SendAI itself is a Solana-ecosystem company (SEND token on Solana per DefiLlama parent record, H) but nothing links Solana to this builder footprint.

---

## 4. Read API

**None from SendAI.** `exists = none`.
- No docs, no REST/WS, no OpenAPI; sendai.fun has no `/api` route (404) and kit.sendai.fun documents the Solana Agent Kit, not markets (H).
- For data about these markets use the Hyperliquid API directly (`POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`, docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api): see the HIP-4 note.
- **Only attribution data is public:** Hyperliquid publishes every builder-code fill as daily LZ4 CSV at `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4` (columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`; H, builder-codes doc https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes and my GET of two files). Outcome fills are rows where `coin` starts with `#`. Useful only to measure a frontend's flow, not as a market feed. Fixture: `hl_builder_fills_outcome_rows_redacted.csv` (trader addresses redacted).

## 5. Trade path

None at SendAI level. No SendAI order API, SDK, or contract is documented (H negative, section 1). The only way to trade the underlying markets programmatically is Hyperliquid's signed `POST /exchange` (EIP-712 L1 actions, agent wallets); see the HIP-4 note. Builder-code mechanics (H, builder-codes doc): the user signs `ApproveBuilderFee` with the main wallet; each order may carry `{"b": address, "f": tenths of a basis point}`; builder must hold at least 100 USDC perps account value; max builder fee 0.1% perps, 1% spot; HIP-4 page: builders earn on sell orders (https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets).

**PayBox reachability: partial, and only via Hyperliquid, not SendAI.** A PayBox EVM wallet could sign Hyperliquid typed-data orders (analysis in the HIP-4 note, M); SendAI contributes no transaction-proposal surface. PayBox was not queried for this note.

## 6. Fees

- SendAI builder fee on outcomes: **not published anywhere I could read** (NOT FOUND: searched sendai.fun, /tnc, kit.sendai.fun). Observed: `builder_fee = 0` on all three outcome fills (all buys, consistent with "builder fees on sell orders", H). DefiLlama `sendai-outcome` fees all-time $0 (H).
- Hyperliquid's own outcome fees (charged on close/settle; numeric rate not in the official docs; empirical all-in band about 11-25 bps) are in the HIP-4 note (M here).
- Who pays: the trader pays Hyperliquid's fee plus any builder fee; the builder keeps its fee (DefiLlama methodology, H).

## 7. Resolution mechanism and dispute risk

SendAI has no role in resolution. Inherits HIP-4: protocol-settled recurring series vs deployer-settled templates, no documented trader dispute window (see HIP-4 note, M here). Additional risk for this label specifically: *attribution risk*, i.e. the builder address may not be operated by SendAI Inc. at all (name match only).

## 8. Geo, ToS, automation

- SendAI Terms (https://sendai.fun/tnc, read via page-summary, M): "SendAI does not interact with digital wallets located in, established in, or a resident of the United States" (also lists Singapore and sanctioned countries); VPN circumvention prohibited; non-custodial ("neither holds or controls your digital assets"); Panamanian law, LCIA arbitration in London. **Hyperliquid, outcome/prediction markets, fees, and bot/API use are not mentioned** (M).
- Hyperliquid's own gate (US and Ontario residents barred; unpublished outcome "Excluded Persons" list) is in the HIP-4 note (M here).

## 9. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| SendAI Outcome builder-routed volume, all-time | **$60** (two days: $50 on 2026-05-02, $10 on 2026-06-17) | https://api.llama.fi/summary/dexs/sendai-outcome, fetched 2026-10-19 (chart ends 2026-10-18) | H |
| Same, 24h / 7d / 30d | $0 / $0 / $0 | same | H |
| Raw check | 2026-05-02 20:28:33Z `#0` Bid 60 @ 0.63619 and 18 @ 0.6362 (about $49.6); 2026-06-17 20:10:58Z `#1890` Bid 51 @ 0.19805 (about $10.1); builder_fee 0 on all three | Hyperliquid builder-fills archive, builder address from DefiLlama factory (fixture) | H |
| Builder-code fees on outcomes | $0 all-time | https://api.llama.fi/summary/fees/sendai-outcome | H |
| TVL / OI | none (SendAI holds no collateral; DefiLlama TVL arrays empty) | https://api.llama.fi/protocol/sendai-outcome | H |
| Context: Hyperliquid HIP-4 total | $3.13M on 2026-10-18; $47.0M 30d; $261.1M all-time (SendAI share of all-time about 2e-7) | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19 | H data / M ratio |
| Sibling SendAI builder products on DefiLlama | `sendai-spot` all-time $121.74 volume (5 days, last 2026-06-17); `sendai-perps` fees $45.89 all-time | https://api.llama.fi/summary/dexs/sendai-spot ; .../fees/sendai-perps | H |

## 10. Event categories and overlap

None of its own. Whatever Hyperliquid lists (sports, crypto price ladders, central-bank decisions): see HIP-4 note section 11. The only observed SendAI-routed markets were two tiny buys on outcome `#0` (a day-one mainnet market) and `#1890` (M: probably early BTC/price templates; titles not resolved here because `outcomeMeta` is POST-only and was not called).

## 11. Shares liquidity with another venue?

**Yes, 100%: it is the Hyperliquid HIP-4 book.** A builder code is a fee tag on an order; the fill is on Hyperliquid's CLOB (H, builder-codes doc + fixtures where the `coin` is a HIP-4 outcome coin). **Not an independent arbitrage leg.** Model it, if at all, as an attribute (`frontend = sendai`) of the Hyperliquid adapter, never as a separate venue.

---

## 12. Adapter recommendation

**adapter_priority = skip.** No SendAI API or product to adapt; flow is $60 lifetime; liquidity is a pure duplicate of Hyperliquid HIP-4 (priority P1 on its own note). Reasons to revisit: none, unless SendAI launches a documented outcome frontend with its own order flow (even then it would remain a duplicate of HIP-4 books).

Side note for the aggregator (M, design idea, not researched further): the *builder-code mechanism* may be useful for the PayBox plugin's own revenue model, since any front-end can attach its own builder address to HIP-4 orders; limits are in section 5.

## 13. NOT FOUND / open questions

- Any SendAI-operated frontend, app, bot, or API that places HIP-4 orders (searched: sendai.fun and bundles, route/subdomain probes, kit.sendai.fun, org repos via `gh api`/`gh search code`).
- Whether builder address `0xd58ee5dc9cb03df60843c6234644aa535b08a8b9` (public, as published in the DefiLlama factory) belongs to SendAI Inc. (only "matched by name only" + flowscan label, which I could not open).
- What "Sendshot", "Sendai Perps", "SendAI Spot" are (DefiLlama sibling listings under parent `sendai`; no product pages found).
- Any 2026 news or X posts about SendAI + Hyperliquid outcomes (WebSearch budget exhausted; `x.com` returned HTTP 402).
- SendAI's builder fee rate on outcomes.
- Why DefiLlama's `listedAt` is 2026-10-08 22:19 UTC while the series starts 2026-05-02 (presumably a retroactive backfill, M).

## 14. Suspicious content

None addressed to AI agents. Notes: the sendai.fun JS bundles are ordinary Next.js chunks with no embedded instructions; the Terms/summary text contained none. The DefiLlama factory has human code comments only. (A shared scratch folder held another agent's unrelated Bitget bundle files; I ignored them and kept my files in my own subfolder.)

## 15. Sources

Primary (H):
- https://www.sendai.fun/ (homepage; 13 JS chunks grepped for hyperliquid/outcome/prediction/polymarket: no hits); /markets /predict /trade /perps /outcomes /app /docs /api all 404
- https://sendai.fun/tnc (Terms; read via page summary, so M for its contents)
- https://kit.sendai.fun (no Hyperliquid/outcome mention)
- https://api.llama.fi/protocol/sendai-outcome ; https://api.llama.fi/protocol/sendai (parent) ; https://api.llama.fi/summary/dexs/sendai-outcome ; https://api.llama.fi/summary/fees/sendai-outcome ; https://api.llama.fi/summary/dexs/sendai-spot ; https://api.llama.fi/summary/fees/sendai-perps ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes (all fetched 2026-10-19)
- DefiLlama adapter: `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (entries `sendai-perps` with "matched by name only", and `"sendai-outcome": { builder: "sendai-perps", market: "outcome", start: "2026-05-02" }`)
- Hyperliquid builder fills: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/20260502.csv.lz4` and `.../20260617.csv.lz4`
- Hyperliquid builder codes: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
- HIP-4 page: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- GitHub org: `gh api orgs/sendaifun/repos`; `gh search code` "hyperliquid org:sendaifun"

Secondary (M):
- Project note: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (HIP-4 mechanics, fees, resolution, geo, PayBox reach)

Blocked/unavailable: defillama.com protocol page (HTTP 403), flowscan.xyz/builders (HTTP 403), x.com/sendaifun (HTTP 402, nothing paid), WebSearch (session budget exhausted).

## 16. Fixtures (docs/research/fixtures/sendai/)

- `defillama_protocol_sendai-outcome.json` - protocol record (871 B)
- `defillama_dexs_summary_sendai-outcome.json` - volume summary, 170 daily points (13.9 KB)
- `defillama_fees_summary_sendai-perps.json` - sibling builder-fee summary (3.3 KB)
- `defillama_dexs_summary_hyperliquid-outcomes_trimmed.json` - HIP-4 aggregate for context (1.8 KB)
- `hl_builder_fills_outcome_rows_redacted.csv` - the three outcome fills, trader addresses redacted
