# Metascalp (metascalp.io) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page and docs reads, public unauthenticated GETs (DefiLlama API, Hyperliquid public stats archive, GitBook raw markdown), `gh api` file reads. No account, wallet, key, signature, POST, payment or PayBox tool was used. Third-party text was treated as untrusted data; no embedded instructions were found.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my own computation/inference; **L** = weak or stale. "NOT FOUND (searched: ...)" means searched and absent.

Method limits: WebSearch budget was exhausted before my first search (shared session cap), so no search-engine discovery was possible. Everything below comes from direct fetches of the official site, official GitBook docs, DefiLlama, and Hyperliquid's public data archive.

---

## 0. Bottom line

1. **Metascalp is not a prediction-market venue.** It is a **Windows-only desktop trading terminal** ("alpha testing") that connects to ~36 centralized and decentralized exchanges using the user's own API keys or seed phrase, and charges a 0.02% terminal fee through exchange referral and builder-code mechanisms (H, https://metascalp.io/ , https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/hyperliquid.md).
2. **The "outcome markets" in the hint are Hyperliquid HIP-4 markets** reached through Metascalp's **Hyperliquid builder code**. DefiLlama lists "Metascalp Outcome" as category **Interface**, tag "Hyperliquid HIP4 Builder", `doublecounted: true` (H, https://api.llama.fi/protocol/metascalp-outcome , https://api.llama.fi/summary/dexs/metascalp-outcome). Same order books as native Hyperliquid, so it is **not an independent liquidity leg**.
3. **Outcome volume through Metascalp is negligible**: $22,441 all-time, $88 on 2026-10-18 (H, DefiLlama). My own count from Hyperliquid's public builder-fills archive shows the same order of magnitude and that almost all of it is 1-3 wallets on 2026-10-15/16 (H, section 8).
4. **No public API.** The docs page titled "MetaScalp API" is an empty stub (H, section 4). Metascalp has no market data, no markets list, no resolution layer and no order endpoint of its own.
5. **Verdict: `adapter_priority = skip`.** Use the native Hyperliquid HIP-4 adapter (see `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`). Nothing to build for Metascalp itself.

Still live? **Yes as a product** (site 200 OK on 2026-10-19, footer "(c) MetaScalp - 2026", DefiLlama Spot volume $1.81M on 2026-10-18, Perps fees $4,028 on 2026-10-18; H). **Marginal as an outcome-market channel** (section 8).

---

## 1. Kind and market model

| Item | Finding | Tag |
|---|---|---|
| Kind | Desktop trading terminal / broker-style front end ("broker-or-frontend"); self-described: "MetaScalp is a trading terminal, not an exchange. It does not hold funds or execute trades on its own." | H (https://metascalp.gitbook.io/metascalp/otvetstvennaya-torgovlya.md) |
| Platform | Windows 10/11 x64 only; "alpha testing"; download requires agreeing to a waiver of claims | H (https://metascalp.io/) |
| Market model | None of its own. Outcome markets seen through it are Hyperliquid HIP-4: fully collateralised binary outcomes on HyperCore's central limit order book, Yes/No on a merged book, coin `#<10*outcome+side>` | H for HL (see native HIP-4 note); M that Metascalp's flow uses those coins (fills below show `#`-coins carrying its builder code) |
| Does Metascalp's own documentation mention outcome / prediction / HIP-4? | **No.** Homepage, docs index (llms.txt), the Hyperliquid connection page and release notes 1.0.140-1.0.170 contain none of "outcome", "prediction", "HIP-4". NOT FOUND (searched: metascalp.io text, docs llms.txt, hyperliquid.md, 27 release-note pages, API page) | H |
| Polymarket | The docs list a **Polymarket "Prediction/Futures" connection** (trading, not view-only; seed phrase + Relayer API keys; proxy supported). Polymarket is out of scope here (covered by a parallel workflow) and this is just another client of it, not a separate venue | H (https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/polymarket.md) |

The only evidence that outcome orders flow through Metascalp is on-chain attribution: fills in Hyperliquid's public builder-fills archive with `coin` starting `#` for Metascalp's builder address (section 8). The app UI path (probably the "Hyperliquid: Spot" connection) is M/unverified.

---

## 2. Chains and collateral

- No chain of its own. DefiLlama: chain "Hyperliquid L1" (HyperCore), category Interface, tag "Hyperliquid HIP4 Builder" (H, https://api.llama.fi/protocol/metascalp-outcome).
- Collateral = whatever the underlying exchange uses: **USDC** for HIP-4 outcomes on Hyperliquid (H per native HIP-4 note). Deposits to Hyperliquid are separate from Metascalp (user funds stay in the user's own Hyperliquid account; Metascalp states it never holds funds).
- Connection credential: Metascalp asks for the **wallet seed phrase** for Hyperliquid and Lighter; the docs say it is used locally to derive a trading key and stored encrypted on the user's machine (H, https://metascalp.gitbook.io/metascalp/faq/security.md). A "view only" mode exists for Hyperliquid without any key (H, hyperliquid.md). Seed-phrase entry is incompatible with a PayBox-style non-custodial signer model.

---

## 3. Fees

- **Terminal fee: 0.02% of trade volume** added on Hyperliquid trading through the terminal, on top of Hyperliquid's own fees; docs also warn API trading on Hyperliquid costs more than the web UI (H, https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/hyperliquid.md). The referral link `app.hyperliquid.xyz/join/METASCALP` is given there.
- **Observed on outcome fills (H, my aggregation of the public archive, fixtures `builder_fills_*`)**: builder fee per fill = 0.0195-0.02% of px*sz (e.g. 17 shares at 0.09997 charged 0.00033989 USD). Matches the documented 0.02%.
- Hyperliquid's builder-code mechanics: user pre-approves a max fee with the main wallet (`ApproveBuilderFee`), builder needs >= 100 USDC perps account value, fee caps 0.1% perps / 1% spot, builder codes apply only to fees collected in the quote asset (so, for outcome buys, not the buying side), paid via the normal referral-reward claim (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md). The page does not state an outcome-specific cap (NOT FOUND).
- Hyperliquid's own outcome fee (charged on close/settle only, scaled by `deployerFeeScale`) is in the native HIP-4 note; not re-derived here.
- DefiLlama fee total for "Metascalp Outcome": $4.38 all-time (H).

---

## 4. Read API

- **Official/public API: none.** The docs page "MetaScalp API" at https://metascalp.gitbook.io/metascalp/api.md (786 bytes, saved as fixture `metascalp_docs_api_page_stub.md`) says only that the section will show "current APIs", "usage rules and examples" but contains **no endpoints, ports, URLs, auth or limits**; it has no child pages in the docs index. H.
- NOT FOUND (searched: docs.metascalp.io -> metascalp.gitbook.io index/llms.txt, api.md, homepage text, release notes 1.0.140-1.0.170): any REST/WebSocket URL, localhost API, SDK, OpenAPI spec, rate limit, or market-data feed operated by Metascalp. The terminal talks directly to each exchange from the user's PC ("requests go directly to the exchange", faq/security.md, H).
- GitHub: not searched (no WebSearch; no repo linked from the site or docs). NOT FOUND.
- **Useful public data that exists, all from third parties (not Metascalp):**
  - DefiLlama attribution: `GET https://api.llama.fi/summary/dexs/metascalp-outcome` and `.../summary/fees/metascalp-outcome` (shape saved in fixtures `defillama_*_trimmed.json`; fields `total24h`, `total7d`, `totalAllTime`, `totalDataChart [[unix_day, usd]]`, `methodology`, `doublecounted`). H, fetched 2026-10-19.
  - Hyperliquid public builder-fills archive: `GET https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address_lowercase}/{YYYYMMDD}.csv.lz4` (documented in the builder-codes page, H). CSV columns: `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee` (H, fixture `builder_fills_20261015_outcome_sample_redacted.csv`, wallet columns redacted). Useful only to measure what share of HL outcome flow a given front end routes. Contains other users' addresses: do not persist.
- For actual market data, books and resolution use the native Hyperliquid API (keyless WebSocket `l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`; REST `POST /info`), documented in the native HIP-4 note.

---

## 5. Trade path

- **Metascalp has no programmatic trading interface for third parties.** Orders are placed by a human in the desktop UI (hotkeys, mouse trading), signed locally with the key derived from the user's seed phrase, and sent straight to Hyperliquid (H, faq/security.md; M for the UI details).
- Order flow to Hyperliquid carries Metascalp's builder address and fee in the `builder:{b,f}` field of the standard `order` action; this is how the attribution above exists (M, inferred from builder-fills data and builder-codes doc).
- An agent should skip Metascalp and sign HL actions itself (agent wallet via `approveAgent`), see native HIP-4 note section 5.

PayBox reachability: **no.** There is nothing to call (no API, desktop GUI, seed-phrase based). The underlying venue, Hyperliquid, is only "partial" from PayBox (orders are signed HyperCore actions, not EVM transaction proposals; PayBox's own Hyperliquid plugin is read-only), per the native note.

---

## 6. Resolution mechanism and dispute risk

Metascalp does not resolve anything. Resolution is that of each Hyperliquid HIP-4 market (protocol auto-settle for recurring series; validator-voted/deployer-settled for the large majority; no trader dispute window), see native HIP-4 note section 8. Metascalp states that exchange actions on prohibited trading are "outside MetaScalp's control" and not grounds for claims (H, otvetstvennaya-torgovlya.md).

---

## 7. Geo / ToS / automation

- Metascalp: homepage gates the download behind "you agree to waive claims", Windows PC only. Footer links labelled "Terms of service" and "Privacy policy" exist but I could not extract their URLs or text from the page (the labels carry no `href`; likely a JS popup). **Metascalp Terms text: NOT FOUND** (searched: homepage HTML, docs index).
- Docs state no geographic restrictions and no age limit; "rules differ by jurisdiction ... the user is responsible for the legality of trading" (Russian original: "Ответственность за законность торговой деятельности несёте вы"). The docs do not address bots/automation/API use of the terminal. H (otvetstvennaya-torgovlya.md, faq/security.md).
- Underlying Hyperliquid terms apply to outcome markets (US and Ontario residents barred, plus an unpublished "Excluded Persons" list for outcome markets; VPN circumvention prohibited): H per native HIP-4 note (Terms of Use dated 2026-06-15). A front end does not change that.
- Security advice in docs: use a separate trading wallet, never enable withdrawal rights on API keys, exported settings files contain readable keys (H, faq/security.md).

---

## 8. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Metascalp Outcome volume, all-time | **$22,441** (first non-zero day 2026-08-29; builder config start 2026-05-02) | https://api.llama.fi/summary/dexs/metascalp-outcome , fetched 2026-10-19 | H |
| 24h (day 2026-10-18) / 7d / 30d | $88 / $21,872 / $22,189 | same | H |
| Daily non-zero points | 08-29 $63; 09-02 $112; 09-10 $27; 09-11 $12; 09-16 $38; 09-23 $2; 09-24 $207; 10-01 $78; 10-06 $30; **10-15 $17,942; 10-16 $3,783**; 10-17 $59; 10-18 $88 | same | H |
| Share of Hyperliquid outcomes | 0.047% of 30d volume ($22.2k of $47.0M); 0.009% all-time ($22.4k of $261.1M) | https://api.llama.fi/summary/dexs/hyperliquid-outcomes , 2026-10-19 | H data / M ratio |
| Fees collected | $4.38 all-time | https://api.llama.fi/summary/fees/metascalp-outcome | H |
| Public-archive cross-check (my count of `#`-coin rows for the Metascalp builder address) | 2026-10-15: 1,172 fills, ~$10.1k px*sz, **3 distinct wallets**, 12 coins, 08:38-12:08 UTC; 10-16: 45 fills, ~$3.7k, 2 wallets; 10-17: 0; 10-18: 1 fill ~$2; most other days 0-13 fills from 1 wallet | stats-data.hyperliquid.xyz builder_fills archive, fetched 2026-10-19 (fixture `builder_fills_outcome_summary.json`) | H data / M interpretation |
| Archive vs DefiLlama | Agree within ~3% on 6 of the sampled days; DefiLlama is 1.78x higher on 10-15 and non-zero on 6 days where the archive shows no outcome fills (cause unresolved, perhaps a day shift or definition difference) | same | M |
| Context: Metascalp Spot / Perps (not outcomes) | Spot volume $1.81M on 2026-10-18, $154.98M all-time; Perps fees $4,028 on 2026-10-18, $755.6k all-time | https://api.llama.fi/summary/dexs/metascalp-spot , .../fees/metascalp-perps | H |

Reading: Metascalp is a genuinely used HL spot/perps terminal, but its outcome-market channel is a few hundred dollars a day at best with 1-3 wallets, plausibly the team or a handful of testers.

---

## 9. Event categories and overlap

None of its own. All overlap is Hyperliquid's: crypto-price ladders (BTC/ETH/SOL/HYPE), sports, Fed/macro, awards; see native HIP-4 note section 11. The `#`-coins seen in Metascalp fills (e.g. `#85731`, `#85680`, `#79470`) are ordinary HL outcome coins (titles not resolved here because `outcomeMeta` is POST-only).

---

## 10. Shared liquidity

**Fully shared with Hyperliquid HIP-4 (native).** DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code", flagged `doublecounted: true` (H, API above). Metascalp adds no new order flow into the book that is not already visible in the native HL feed, and it must never be added to HL's volume or treated as a separate arbitrage leg.

---

## 11. Adapter recommendation

- **adapter_priority: skip.** No API, no markets, no independent liquidity, negligible outcome volume, seed-phrase GUI client.
- What to do instead:
  1. Implement/keep the **native Hyperliquid HIP-4 adapter** (P1 per the parallel note).
  2. Optionally treat the public `builder_fills` archive as a flow-attribution dataset (which front ends carry how much HL outcome flow). Low priority; contains third-party wallet addresses.
  3. If we ever want fee capture on our own routed HL orders, that is our own builder code, not Metascalp's.
- Revisit only if Metascalp publishes real content under its "MetaScalp API" docs page or its outcome volume moves by orders of magnitude.

---

## Open questions

- Which Metascalp UI path (Hyperliquid: Spot connection?) exposes outcome coins, and whether the 10-15/16 volume was the team or users: unverified.
- Metascalp Terms of Service text and any automation clause: not retrievable from the static HTML.
- Cause of the DefiLlama vs archive discrepancy on specific days.
- Whether a local/desktop API will ever be documented under the stub page.

## Sources

1. Official site, product description, integration list, alpha/waiver notice: https://metascalp.io/ (H; Last-Modified header 2026-07-01, footer 2026)
2. Official docs index: https://metascalp.gitbook.io/metascalp/llms.txt (docs.metascalp.io redirects here) (H)
3. Hyperliquid connection page (seed phrase, view-only, 0.02% terminal fee, referral): https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/hyperliquid.md (H)
4. Polymarket connection page: https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/polymarket.md (H)
5. API stub page: https://metascalp.gitbook.io/metascalp/api.md (H)
6. Security / key storage FAQ: https://metascalp.gitbook.io/metascalp/faq/security.md (H, page read through a summarising fetch tool, so M on exact wording)
7. Responsible-trading page: https://metascalp.gitbook.io/metascalp/otvetstvennaya-torgovlya.md (H, summarised fetch, M on wording)
8. Release notes 1.0.140-1.0.170 (grep for outcome/prediction/HIP-4: none): https://metascalp.gitbook.io/metascalp/versions/170.md and siblings (H)
9. DefiLlama protocol entry: https://api.llama.fi/protocol/metascalp-outcome ; volume https://api.llama.fi/summary/dexs/metascalp-outcome ; fees https://api.llama.fi/summary/fees/metascalp-outcome ; spot https://api.llama.fi/summary/dexs/metascalp-spot ; perps fees https://api.llama.fi/summary/fees/metascalp-perps ; HL outcomes https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H, 2026-10-19). The DefiLlama web page https://defillama.com/protocol/metascalp-outcome returned HTTP 403 to the fetch tool; the API was used instead.
10. DefiLlama adapter config (builder address, `market: "outcome"`, start 2026-05-02): https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts via `gh api` (H). Builder address (public, on-chain, attributed to Metascalp by this config): `0xa9ab442f9dfe752dc74b666c41e7a0498baf8687` (M that it is Metascalp's).
11. Hyperliquid builder codes doc: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md (H)
12. Hyperliquid public builder-fills archive (path template in source 11): https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4 (H, days listed in section 8)
13. Parallel project note on the underlying venue: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (local, M for anything I did not re-verify)

Fixtures: `docs/research/fixtures/metascalp/` (`defillama_protocol_metascalp-outcome.json`, `defillama_dexs_metascalp-outcome_trimmed.json`, `defillama_fees_metascalp-outcome_trimmed.json`, `metascalp_docs_api_page_stub.md`, `builder_fills_20261015_outcome_sample_redacted.csv`, `builder_fills_outcome_summary.json`).
