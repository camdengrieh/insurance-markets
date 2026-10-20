# PerpFlow (perpflow.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 04:20-04:45 UTC). READ-ONLY: GETs to DefiLlama's public API, Hyperliquid docs and static stats archive, GitHub reads via `gh api`, one WebFetch of the site (failed). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data. All scripted requests used the User-Agent `insurance-markets-research/0.1`.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my own computation/inference; **L** = weak or stale.

---

## 0. Bottom line

1. **PerpFlow is not an independent prediction-market venue.** Its only evidence as an outcome-market "venue" is a DefiLlama listing "PerpFlow Outcome" (category Interface, tag "Hyperliquid HIP4 Builder") that automatically attributes Hyperliquid HIP-4 outcome fills carrying PerpFlow's builder code. The parent project is described by DefiLlama as automating "delta-neutral trading strategies on Hyperliquid to generate funding-rate yield" (H, DefiLlama). The outcome listing is one of 35 `market: "outcome"` builder entries in DefiLlama's `factory/hyperliquid.ts` (H count), i.e. a generic attribution template, not evidence of a dedicated product; the DefiLlama description "outcome-based prediction markets through Hyperliquid" is that template's wording (M).
2. **Not demonstrably live.** `perpflow.xyz` returns Cloudflare 522 and `app.perpflow.xyz` 521 (origin down) on 2026-10-19; `docs.` and `api.` subdomains do not exist (NXDOMAIN) (H, `fixtures/perpflow/perpflow_site_probe.txt`). The builder address has no fills on any market after 2026-05-06 although the archive is current to ~2026-10-17 (H, fixture `hl_builder_fills_day_scan.txt`).
3. **Effectively zero volume.** Lifetime outcome volume routed via PerpFlow is **$232** over three days (2026-05-04..06), fees **$0.28** (H, DefiLlama). 16 fills, 3 distinct users in the public builder-fill archive (H, redacted fixture).
4. **100% shared liquidity.** Every PerpFlow outcome trade executes on Hyperliquid's HIP-4 order books. It can never be a separate arbitrage leg. All real work belongs in the Hyperliquid HIP-4 adapter: see `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (sibling note, independently written; I re-verified only the facts tagged H below).
5. **adapter_priority = skip.** At most, track the builder address in the Hyperliquid adapter as a (dead) attribution tag.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `GET https://perpflow.xyz/` -> HTTP 522 (twice, 04:21Z and 04:27Z) and a 15 s timeout; `https://app.perpflow.xyz/` -> 521; WebFetch of the site -> 522. Cloudflare is the nameserver, A records resolve (172.67.223.57, 104.21.17.71) so the DNS is alive but the origin is not answering. Fixture `perpflow_site_probe.txt` | H |
| `docs.perpflow.xyz`, `api.perpflow.xyz` -> NXDOMAIN | H |
| DefiLlama still lists the protocol (id 9032, listed 2026-10-08 22:18Z, twitter `perpflow`, url `https://perpflow.xyz/`), https://api.llama.fi/protocol/perpflow-outcome. A listing is not proof of a working product | H |
| DefiLlama outcome volume: 24h 0, 7d 0, 30d 0, lifetime $232 (2026-05-04 $163, 05-05 $24, 05-06 $45); fees lifetime $0.28 (https://api.llama.fi/summary/dexs/perpflow-outcome, `/summary/fees/perpflow-outcome`) | H |
| Public builder-fill archive for PerpFlow's builder address: files exist for 23 days in 2025-07-20..2026-10-18 (20 days 2025-07-20..2026-01-08, then 2026-05-04, 05-05, 05-06) and none since. Control: a different active builder had files through 2026-10-17 (https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4, documented at https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes) | H |
| Hyperliquid HIP-4 itself is very live: $3.13M volume 2026-10-18, $17.9M 7d (https://api.llama.fi/summary/dexs/hyperliquid-outcomes) | H |
| Searches: one WebSearch (extended) on "PerpFlow Hyperliquid outcome markets HIP-4 builder" found nothing about PerpFlow; the WebSearch budget was then exhausted, so no further press/social check was possible | M |

Verdict: **still_live = false** (no working outcome product found; only a dormant builder-code attribution entry). Confidence that the *website* is down at this moment: high. Confidence that it never had an outcome UI: medium (the site could not be read).

---

## 2. Kind and market model

- **Kind:** broker/front-end via Hyperliquid builder codes (H: DefiLlama methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code"). No PerpFlow-owned markets, matching engine, token or contract was found. GitHub org `Perpflow` exists (created 2025-08-13) with 0 public repos (H, `gh api orgs/Perpflow`).
- **Market model:** whatever Hyperliquid HIP-4 offers. Fully collateralised outcome contracts on HyperCore's merged Yes/No central limit order book; `settleFraction` in [0,1] so binary, question (exactly-one-wins categorical) and scalar-capable; sides tokenised as `#<10*outcome+side>` (coin), `+<enc>` (token), `100000000+enc` (asset id) (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets and .../for-developers/api/asset-ids).
- Observed builder fills used coins `#20, #21, #30, #31, #40` (outcome books) plus one `@230` spot fill (H, fixture). The fills are dated May 2026, so those books are presumably long settled (M; I did not look up the outcome ids).
- Name collisions (unrelated projects, do not conflate): a Solana devnet vAMM perp demo (`vijayabhaskar78/perpflow`), a Solana Phoenix/pump.fun bot (`dexterrbuilds/perpflow`), and several empty stubs (M, GitHub search).

## 3. Chains and collateral

- Hyperliquid L1 / HyperCore only (DefiLlama chain "Hyperliquid L1") (H). Outcome collateral is the "quote token"; the official HIP-4 page does not name it (H absence); the sibling note states USDC (M).
- Funding path into HyperCore (Arbitrum USDC bridge) is Hyperliquid's, not PerpFlow's: see sibling note (M).

## 4. Read API

- **PerpFlow's own API: none found.** NOT FOUND (searched: perpflow.xyz root, docs./api. subdomains, GitHub org and repo search, DefiLlama metadata).
- The usable read path is the **underlying Hyperliquid API** (documented once, in the Hyperliquid adapter):
  - REST `POST https://api.hyperliquid.xyz/info` with `{"type":"outcomeMeta"}` (also `outcomeTemplates`, `l2Book`, `allMids`, `recentTrades`); live `GET /info` -> HTTP 405 (H). I did not POST, so **no live Hyperliquid response shape was captured by me**; docs page: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot (H docs).
  - WebSocket `wss://api.hyperliquid.xyz/ws` with `allMids`, `l2Book`, `trades` subscriptions (H docs, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions).
  - Limits (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits): 1200 REST weight/min/IP (`l2Book`/`allMids` weight 2, other info 20); max 10 WS connections, 30 new/min, 1000 subscriptions; no key required.
  - Builder-specific public data: `maxBuilderFee` and `referral` info requests, plus the static daily archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase builder}/{YYYYMMDD}.csv.lz4` (H docs). **Real shape confirmed by unauthenticated GET** (3 files, 16 rows): CSV columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee` (H, fixture `hl_builder_fills_perpflow_20260504-06_redacted.csv`; user and counterparty addresses redacted by me).
- Builder address attributed to PerpFlow (public, from DefiLlama's adapter config; ownership is DefiLlama's claim only): `0x113f059d7a863fbca1ff60df5b1954dbec9f91dd` (H for "DefiLlama says so", M for real-world ownership).

## 5. Trade path and PayBox reachability

- **Via PerpFlow: none** (no API, site down).
- **Via Hyperliquid directly:** EIP-712-signed actions to `POST https://api.hyperliquid.xyz/exchange`; `order` actions take an optional `"builder": {"b": address, "f": tenths-of-bp}`; users must first sign `approveBuilderFee` from their main wallet (not an agent wallet) (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint and .../trading/builder-codes). Outcome-specific actions: `userOutcome` with `splitOutcome`, `mergeOutcome`, `mergeQuestion`, `negateOutcome` (H).
- **PayBox:** `paybox_reachable = no` for PerpFlow as a venue. For the underlying Hyperliquid path the answer is "partial" (signed L1 actions, not EVM transaction proposals; PayBox's own Hyperliquid plugin is read-only spot per prior project notes, M: `docs/research/06-paybox-platform.md`). I made no PayBox calls.

## 6. Fees

- **Hyperliquid outcome fees (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees):** charged only when closing or settling, not when opening; no maker rebates for outcomes (makers who would get a rebate pay zero). Numeric outcome rate: **NOT FOUND in the official docs** (the fee-formula snippet has no outcome case; the HIP-4 page's "Fees are currently zero for outcome markets for initial testing" is stale). DefiLlama's methodology says "Hyperliquid charged no outcome fee of its own before 15 Aug 2026" and that after that outcome fees exist, with 99% going to the Assistance Fund (H, https://api.llama.fi/summary/dexs/hyperliquid-outcomes).
- **Builder fee (H):** builders earn on *sell* orders that carry their code (HIP-4 page); cap 0.1% on perps, 1% on spot (builder-codes page; outcome "work the same as normal spot trading"). User pays it on top of the exchange fee.
- **PerpFlow's own outcome builder rate:** no published schedule (NOT FOUND). From the 16 public fills, computed builder_fee / notional was **0.1% on 4 sell fills and 1.0% on 1 sell fill**, 0 on buys (M, my computation, fixture). Rates appear to have changed between orders or were tested; do not rely on it.

## 7. Resolution and dispute risk

Entirely Hyperliquid's; PerpFlow has no role (H).
- Protocol "recurring" outcomes (BTC price binaries/buckets) are "automatically deployed and settled by the protocol", settling on interpolated HyperCore mark price (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications).
- Template-based deployer markets are settled by the deployer; validators vote on templates and can slash markets that contradict a template's `semanticRestriction` (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions, page carries a "Testnet-only" banner). No trader dispute window found (NOT FOUND in the pages read; sibling note agrees, M).
- For arbitrage: same-title markets elsewhere (UMA, Chainlink, venue-team resolution) can differ in rules; compare descriptions.

## 8. Geo / ToS / automation

- **PerpFlow terms: NOT FOUND** (site down; no docs).
- Hyperliquid Terms of Use "Last updated on June 15, 2026" (H, https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js, bundle linked from `index-BJ4rfo0a.js`): Restricted Persons include residents/entities of "the United States of America or Ontario, Canada" and sanctioned territories; s1.7 "outcome markets accessible via the Interface are not available to 'Excluded Persons'" (jurisdictions designated from time to time); s3.1.8 prohibits "Automated or High-Frequency Abuses" - bots/scripts that "exceed reasonable usage, bypass rate limits, cause denial-of-service". Documented API use within limits is not prohibited by that text (M, my reading, not legal advice).

## 9. Liquidity

| Measure | Value | Date | Source | Tag |
|---|---|---|---|---|
| PerpFlow-routed outcome volume, lifetime | $232 (3 days) | 2026-10-19 | https://api.llama.fi/summary/dexs/perpflow-outcome | H |
| PerpFlow-routed outcome fees, lifetime | $0.28 | 2026-10-19 | https://api.llama.fi/summary/fees/perpflow-outcome | H |
| DefiLlama parent "PerpFlow" dexs summary (appears to equal spot $354 + outcome $232, M) | $586 lifetime (5 nonzero days) | 2026-10-19 | https://api.llama.fi/summary/dexs/perpflow | H |
| TVL / OI | none (no TVL module; "dummy.js") | 2026-10-19 | https://api.llama.fi/protocol/perpflow-outcome | H |
| Underlying pool: Hyperliquid HIP-4 volume | $3.13M 24h (2026-10-18), $17.9M 7d, $47.0M 30d, $261M lifetime | 2026-10-18 | https://api.llama.fi/summary/dexs/hyperliquid-outcomes | H |

PerpFlow's share of the pool is about 0.0001% of lifetime volume.

## 10. Event coverage / arbitrage overlap

Only what Hyperliquid lists (see sibling note for the live catalogue). Docs confirm recurring BTC price binaries and price buckets (crypto price; overlaps Polymarket/Kalshi/Limitless crypto-price markets) and validator-approved templates for other categories (H, hip-4 pages); breadth beyond that is not re-verified here. Because PerpFlow is a pass-through, **it adds no leg**; treat any PerpFlow price as the Hyperliquid price.

---

## Suspicious / untrusted content encountered

- `https://hyperliquid.gitbook.io/.../for-developers/api/deployer-actions.md` (404 page) and every GitBook page carry text aimed at AI agents (use `?ask=`/`goal=` queries, `llms.txt`, `llms-full.txt`). I did not use the `ask` feature; I fetched `llms.txt` only as a page index to search titles. Not an instruction I followed.
- `https://x.com/perpflow` via WebFetch returned HTTP 402 Payment Required with no body; no payment requirements were retrievable, I stopped.
- Phishing-list entries for lookalike domains `perpflow.com`, `perpflow.org`, `perpflow.live`, `perpflow.app`, `perpflow.net` (GitHub repos `phishdestroy/*`, `scamsniffer/scam-database`, `0xDanielLopez/TweetFeed`, M). `perpflow.com` and `perpflow.io` currently answer HTTP 200 but I did not read their content; they are not the DefiLlama-listed domain (`perpflow.xyz`). Do not treat them as official.

## NOT FOUND

PerpFlow website content; docs; API; terms of service; fee schedule; contracts; GitHub repos owned by the project; any press or social post about a PerpFlow outcome product (searched: WebFetch/curl of perpflow.xyz and subdomains, DefiLlama protocol + dimension adapters, `gh search repos/code perpflow`, GitHub org Perpflow, one extended WebSearch; the search budget was then exhausted; x.com returned 402).

## Open questions

1. Is perpflow.xyz permanently down or temporarily (522 may be transient)? Re-probe before closing the question.
2. Did PerpFlow ever ship an outcome UI, or was the builder code only used in internal tests (16 fills, 3 users, small odd-lot sizes of ~$10-23)?
3. Whether DefiLlama's builder-address attribution is correct (no first-party confirmation).

## Sources

- https://defillama.com/protocol/perpflow-outcome (the discovery link; WebFetch got HTTP 403, so used the API below)
- https://api.llama.fi/protocol/perpflow-outcome, https://api.llama.fi/summary/dexs/perpflow-outcome, https://api.llama.fi/summary/fees/perpflow-outcome, https://api.llama.fi/summary/dexs/perpflow, https://api.llama.fi/summary/dexs/perpflow-spot, https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H, fetched 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters (`factory/hyperliquid.ts`, `helpers/hyperliquid-v2.ts`), read with `gh api` (H)
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4 (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/ : hyperliquid-improvement-proposals-hips/hip-4-outcome-markets, trading/builder-codes, trading/fees, trading/contract-specifications, for-developers/api/{asset-ids, exchange-endpoint, rate-limits-and-user-limits, hip-4-deployer-actions, info-endpoint/spot, websocket/subscriptions} (H, undated pages; some carry "Testnet-only" banners)
- https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (Terms last updated 2026-06-15) (H)
- Local: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md` (M, prior project notes)
- Fixtures: `docs/research/fixtures/perpflow/` (defillama_protocol_perpflow-outcome.json, defillama_dexs_perpflow-outcome_trimmed.json, defillama_fees_perpflow-outcome_trimmed.json, defillama_dexs_hyperliquid-outcomes_shared-pool_trimmed.json, hl_builder_fills_perpflow_20260504-06_redacted.csv, hl_builder_fills_day_scan.txt, perpflow_site_probe.txt)
