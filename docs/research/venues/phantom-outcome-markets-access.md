# Phantom (outcome markets access) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page reads, raw `curl` GETs of Phantom help pages and public Hyperliquid/DefiLlama hosts, `gh api` raw reads of public DefiLlama source, and read-only PayBox discovery calls (`discover_plugins` x3, `get_contract` x1). No account, wallet, key, signature, POST/PUT/DELETE, payment, `use_plugin` or any PayBox money/signing tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed and none contained instructions aimed at agents.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/computation from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/phantom-outcome-markets-access/` (section 17).

Sibling specs this one points at: `docs/research/venues/hyperliquid-outcomes-hip-4.md` (the venue that "Phantom Outcome" routes into) and `docs/research/venues/world.md` (the venue behind Phantom's actual prediction-market product).

---

## 0. Bottom line

1. **"Phantom Outcome" is a DefiLlama bookkeeping row, not a venue and not a product.** It is an auto-generated "outcome" view of Phantom's single Hyperliquid builder code (`phantom-outcome: { builder: "phantom-perps", market: "outcome", start: "2026-05-02" }` in DefiLlama's `factory/hyperliquid.ts`). It says "Phantom provides access to outcome-based prediction markets through Hyperliquid", but no Phantom page, help article, docs page, CLI command or changelog says Phantom exposes HIP-4 outcome markets (section 2). (H)
2. **Flow is effectively zero, and the hint "not yet visible" is too generous.** The whole lifetime of the series is one non-zero day: 2026-05-02 (HIP-4 launch day), $91 of volume and $0.02 of fees. I reproduced it from Hyperliquid's own builder-fills archive: 8 fills, 1 distinct address, one 15-minute window (12:34-12:49 UTC), one outcome coin (`#0`). Four sampled later days (2026-05-03, 08-15, 10-15, 10-17) have 0 outcome fills while the same builder code carried 13k-32k perps/spot fills per day. Looks like a one-off internal test or accidental route, not a product. (H)
3. **Not an independent arbitrage leg.** Any real flow would go into the same HyperCore merged order books as every other HIP-4 front end. DefiLlama marks the row `doublecounted: true`. Count it as zero additional liquidity. (H)
4. **Phantom's actual prediction-market product is something else**: Solana-only, mobile-app-only, powered by **World** (world.xyz) for positions opened on/after 2026-06-01 and by **Kalshi via DFlow** before that. Phantom states "Phantom does not offer a public API for this feature, and external development is not supported." (H) World is specced separately (`world.md`, P2).
5. **adapter_priority = skip** for Phantom as a venue. Keep only a **registry/route record** so the aggregator never counts Phantom as its own pool and knows where Phantom-originated flow lands (section 13). No trading adapter, no market-data adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://phantom.com/` fetched 2026-10-19 | Tagline "Your home for trading crypto, predictions, perps, and more"; "Trade big moments in culture with Prediction Markets". No mention of Hyperliquid, outcome markets, Kalshi or World on the homepage (WebFetch summary). | M |
| Phantom help article "Trade prediction markets in Phantom" (https://help.phantom.com/articles/47187740851731, raw curl 2026-10-19) | "Markets in Phantom are powered by World Prediction Markets on Solana." Mobile app only. Current text (no date shown on the page). | H |
| Phantom disclosures page dated "Jul 1, 2026" (https://phantom.com/prediction-market-disclosures, raw curl) | Kalshi via DFlow for positions opened before 2026-06-01; World for positions opened on/after 2026-06-01. | H |
| DefiLlama `phantom-outcome` (id 9036), `listedAt` 1791497936 = 2026-10-08T22:18:56Z | Listed, category `Interface`, tag `Hyperliquid HIP4 Builder`, parent `phantom`; series through 2026-10-17; all zeros except 2026-05-02. | H |
| Hyperliquid builder-fills archive for Phantom's builder address, 2026-10-17 | 13,208 rows that day, 0 outcome rows. So the Phantom builder is alive (perps/spot), the outcome route is not used. | H |

Verdict: **Phantom the wallet is live and so is its World-backed prediction market; "Phantom outcome markets access" as a Hyperliquid HIP-4 product is not demonstrably live.** I report `still_live = false` for the HIP-4 product the hint describes (zero flow since launch day, no Phantom-side documentation), while noting the DefiLlama row still exists and the Phantom builder code is active for Hyperliquid perps/spot.

---

## 2. What "Phantom Outcome" actually is

- **DefiLlama entry (H, `GET https://api.llama.fi/protocol/phantom-outcome`):** `{"id":"9036","name":"Phantom Outcome","url":"https://phantom.com/","description":"Phantom provides access to outcome-based prediction markets through Hyperliquid.","chain":"Hyperliquid L1","tags":["Hyperliquid HIP4 Builder"],"category":"Interface","parentProtocol":"parent#phantom","listedAt":1791497936,...}`. The `listedAt` date (2026-10-08) is DefiLlama's listing date, not a product launch; the adapter's `start` is 2026-05-02, the HIP-4 mainnet date.
- **Methodology (H, same API, `summary/dexs`):** "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." Fees: "Builder-code fees paid by users on Hyperliquid HIP-4 outcome trades placed through the builder code." `doublecounted: true`.
- **Adapter source (H, `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts`):** the same single Phantom builder (`phantom-perps`, address `0xb84168cf3be63c6b8dad05ff5d755e97432ff80b`, a public protocol-level builder address) is expanded into `phantom-spot` (start 2025-07-08) and `phantom-outcome` (start 2026-05-02) rows. Dozens of other builders get the same auto-generated `*-outcome` row (`perpflow-outcome`, `onyx-outcome`, `omni-terminal-outcome`, ...), so the existence of the row proves only that DefiLlama's factory enumerates the three Hyperliquid market types for each builder code. The attribution of this address to Phantom is DefiLlama's (M); it is consistent with Phantom's published fee (observed builder fee 5 bps on 14,067 of 17,321 fills on 2026-05-02, Phantom states "0.05% Phantom" on perps, H both) so I accept it.
- **The only evidence of a real outcome trade (H, first-hand):** Hyperliquid's builder-fills archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` for 2026-05-02 holds 8 rows with coin `#0` (outcome 0, side 0, per the asset-id doc), all IOC taker fills, 4 buys (builder_fee 0) and 4 sells (builder_fee = 5.0 bps of px x sz), one user address, sizes 1 to 40 shares at prices 0.561-0.571, notional sum $90.69, builder fees $0.02255. That is exactly DefiLlama's $91 / $0.02. Zero outcome rows on every other sampled day. Saved redacted (user and counterparty addresses replaced by `REDACTED`).
- **No Phantom-side confirmation (H, NOT FOUND):** Phantom docs (`docs.phantom.com`, CLI `commands` page, `updates` changelog through April 2026 entries), Phantom perps help article, Phantom Perps blog, Phantom "HIP-3" explainer, Phantom Terminal (`trade.phantom.com`, tabs Discover/Launches/Track/Tokens/Perps/Portfolio) and the Phantom Terms of Use mention no HIP-4, outcome market or Hyperliquid prediction product. The HIP-3 explainer says only that HIP-3 markets "will soon become accessible inside Phantom". (Pages read via WebFetch summaries, M for the negative; the help-center page was also read raw, H.)

---

## 3. Kind and market model

- **Kind (H):** `broker-or-frontend`. Phantom is a non-custodial wallet; per its disclosures it "does not operate as a house, take positions against users, or maintain a house edge" and "does not take custody of your funds or the tokenized prediction market positions".
- **Market model of the Hyperliquid route (H, official HIP-4 page https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets):** fully collateralised binary Yes/No outcomes on a merged central limit order book on HyperCore; "Questions" group outcomes where exactly one settles Yes (multi-outcome); each side is a spot-like token. Not AMM, not parimutuel. Full detail: `hyperliquid-outcomes-hip-4.md`.
- **Tokenisation (H, asset-ids doc https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** `encoding = 10 * outcome + side`; coin `#<encoding>`, token `+<encoding>`, asset id `100_000_000 + encoding`. Example: outcome 0 side 0 is `#0`, which is the coin in the Phantom builder fills.
- **Market model of Phantom's real product (H, help article):** binary markets across "sports, politics, crypto, and culture"; "Your position is represented by standard Solana SPL tokens called outcome tokens"; whole contracts only; Ledger accounts not supported. World's mechanism (RFQ market makers plus on-chain complete-set vault, no resting limit orders) is in `world.md`.

---

## 4. Chains and collateral

- **Hyperliquid route:** HyperCore (Hyperliquid L1, not an EVM chain). Collateral/quote token USDC in the current docs sample (`settledOutcome` example shows `"quoteToken":"USDC"`, H); earlier launch coverage said USDH (M, search result; see sibling spec). A Phantom user funds a Hyperliquid account via SOL/other tokens converted to USDC (Phantom Perps blog, H: "Phantom users fund their perps balance with SOL, which is converted to USDC on Hyperliquid"; summary M).
- **Phantom's actual prediction markets:** Solana; payment from Cash (Phantom's CASH stablecoin), SOL or another supported Solana token; payouts credited as CASH. Pre-2026-06-01 Kalshi positions were DFlow tokenized contracts settled back into the funding stablecoin. (H, help article and disclosures)

---

## 5. Read API

`exists = none` for Phantom itself. (H) Phantom: "Can I build on prediction markets in Phantom? No. Phantom does not offer a public API for this feature, and external development is not supported." Phantom's developer docs (https://docs.phantom.com/) cover wallet SDKs, the Phantom MCP server (tools for swaps, portfolio, perps) and the Phantom CLI (`phantom perps markets|account|positions|orders|history|open|close|cancel|leverage|deposit|transfer|withdraw|withdraw-hl-spot`); none lists a prediction or outcome tool. (M for the docs summaries; the CLI `commands` page was summarised by WebFetch.)

What an aggregator can read that relates to "Phantom outcome" flow:

| Need | Source | Notes | Tag |
|---|---|---|---|
| Markets, books, trades for the HIP-4 venue | Hyperliquid public API: REST `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `outcomeTemplates`, `settledOutcome`), WS `wss://api.hyperliquid.xyz/ws` | Specced in `hyperliquid-outcomes-hip-4.md`. I did **not** call `POST /info` (ground rules forbid POST), so I have no live shape from it; the doc example is in the docs page (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot). | H (docs) |
| Phantom-attributed fills | `GET https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase builder}/{YYYYMMDD}.csv.lz4` | Keyless GET, LZ4 CSV, columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`. 0.5-1.3 MB per day for Phantom. Next-day publication (2026-10-18 file returned 403 on 2026-10-19). Case-sensitive, lowercase address only. Confirmed live (fixture). | H |
| Phantom-attributed volume/fees series | `GET https://api.llama.fi/summary/dexs/phantom-outcome`, `.../fees/phantom-outcome` | Keyless GET JSON. Confirmed live (fixture). All zeros except 2026-05-02. | H |
| Phantom's World-routed markets | Not available from Phantom. See `world.md` (no public API; PayBox official `world` plugin has read tools). | | H |

Rate limits / auth for the above hosts: none documented for the S3 archive or DefiLlama free API; I made 1-2 requests per URL and was not throttled. NOT FOUND (searched: Hyperliquid docs rate-limit page not read for this spec; see sibling spec).

---

## 6. Trade path

`none` for Phantom as a venue. There is no Phantom order API.

- **Phantom app (human path):** prediction markets in the mobile app only, not the browser extension; no public API (H, help article). Perps in the mobile app and in Phantom Terminal (`trade.phantom.com`, market orders only, requires the extension) (H, perps help article via WebFetch summary M).
- **Phantom CLI / MCP server (agent path, M):** `phantom evm sign-typed`, `phantom evm sign`, `phantom perps open|close|cancel` exist (CLI commands page). There is **no** CLI/MCP command for outcome markets. Perps commands cannot place HIP-4 orders (they take `--market`, `--direction`, `--sizeUsd`, `--leverage`, `--orderType`).
- **Programmatic route to the underlying venue:** trade Hyperliquid HIP-4 directly (EIP-712 signed L1 actions to `POST /exchange`, optional per-order builder field `{"b": address, "f": tenths-of-bp}`, builder fee approved by the user's main wallet via `ApproveBuilderFee`; H, builder-codes page https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). Our own aggregator would not use Phantom's builder code; it would use no builder or its own.

---

## 7. PayBox reachability

`paybox_reachable = no` for "Phantom outcome markets access" as a distinct venue (there is nothing Phantom-specific to reach). Underlying routes:

- **Hyperliquid HIP-4:** `partial` per the sibling spec. HyperCore is not an EVM chain, so no transaction proposals; it needs EIP-712 typed-data signing (an agent/API key is the realistic path). PayBox's **official `hyperliquid` plugin** (discover_plugins, 2026-10-19; not enabled for this account) is read-only: tools `hyperliquid_markets`, `hyperliquid_prices`, `hyperliquid_token`, described as "Browse Hyperliquid spot markets, prices, and token metadata"; its `hyperliquid_markets` description says it "helps discover markets before a Hyperliquid trade tool exists". No outcome tool, no trade tool. (H, `get_contract paybox://plugins/hyperliquid`; I did not call `use_plugin`.)
- **World (Phantom's real prediction-market backend):** PayBox has an official **`world`** plugin ("Discover prediction markets, trade outcomes, and manage positions", enabled for this account on 2026-10-19; H, `discover_plugins`). That is the one first-party PayBox Solana route to the same liquidity Phantom users see. Details and read-tool outputs are in `world.md`; I did not call it.
- **Phantom itself:** no PayBox plugin found (`discover_plugins` "phantom prediction" returned an empty list).

---

## 8. Fees

| Layer | Fee | Who pays | Tag |
|---|---|---|---|
| Phantom perps (context for the builder code) | "0.095% (0.05% Phantom + 0.045% Hyperliquid)" per open/close; first perps deposit/withdraw 1 USDC flat from Hyperliquid; later 0.07% HL spot-swap fee plus network fee | user | H (help article https://help.phantom.com/hc/en-us/articles/42292249388307-How-to-trade-perps-in-Phantom, WebFetch summary => M for exact quote) |
| Phantom builder fee on HIP-4 outcomes (observed) | 5.0 bps of notional on sell fills, 0 on buy fills (4 sells + 4 buys, 2026-05-02) | seller / closer | H (computed from the builder-fills file) |
| Builder-code rules | Max 0.1% on perps, 1% on spot; builder fee only on the side where fees are collected in quote/collateral; outcome builder codes "work the same as normal spot trading, where builders earn builder fees on sell orders" | | H (builder-codes page; HIP-4 page) |
| Hyperliquid's own outcome fee | Charged only when closing or settling, not on open; no maker rebates; numeric base rate not in the official docs; DefiLlama says Hyperliquid charged no outcome fee of its own before 2026-08-15 | closer / settler | H (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees section "Outcome tokens"); date claim M (DefiLlama methodology text in the sibling fixture) |
| Phantom World prediction fee | `Prediction fee = 0.1 * p * (1 - p) * C` (p = price 0-1, C = contracts); lowest near $0 or $1, highest near $0.50; example 100 Yes at $0.75 = $1.875 Phantom fee. World's own embedded maker spread is on top (see `world.md`). | buyer | H (raw curl of the help article) |

An all-in cost model for an arbitrage leg that touches Phantom would therefore be: Phantom fee 0.1*p*(1-p) per contract (World path) or 5 bps (HIP-4 builder path, sells only, almost certainly not a real path) plus the underlying venue's costs.

---

## 9. Resolution mechanism and dispute risk

- **HIP-4 route:** resolution is the underlying Hyperliquid mechanism (protocol-recurring price markets settle by code against HyperCore mark prices; third-party deployer markets settle by the deployer; validators vote on templates). Phantom adds nothing and has no say. See `hyperliquid-outcomes-hip-4.md` (H for the recurring-market formula in https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications).
- **Phantom's World route (H, help article + disclosures):** "Resolution determines which outcome satisfies the market's published rules. Phantom does not decide the result." Sports results "can take around 10-15 minutes to resolve, but some markets take longer" with a possible challenge period; crypto markets follow a stated price source, possibly a TWAP; payouts credited automatically as CASH; canceled/unclear markets may pay partial amounts to both outcomes; Chainlink is named as an oracle for post-2026-06-01 positions. Disclosure language: "Market resolution depends on external data sources and oracles ... Phantom cannot guarantee the accuracy, timeliness, or reliability of external data sources used for market resolution." Escalation is "contact Phantom Support", which only relays to World. Dispute risk is World's, not Phantom's (see `world.md`).
- **Legacy Kalshi/DFlow positions (opened before 2026-06-01):** holders must trade the expired outcome token for the funding stablecoin at a quote "which may differ from the original contract price". (H, disclosures)

---

## 10. Geo, ToS, automation

- **Phantom prediction markets:** "Varies by region. Not available in regions subject to comprehensive US economic sanctions." (H, https://help.phantom.com/articles/48634486197651; no US-specific statement, no date on the page). Disclosures: "only available to users in certain jurisdictions". Mobile app only; Ledger unsupported. Users with material non-public information or a direct conflict tied to an outcome are barred (M, press summary).
- **Phantom perps:** "Worldwide except the United States, the United Kingdom, and regions subject to comprehensive US economic sanctions." (H, same page). Needs a multi-chain Phantom account with Ethereum enabled (perps help article, M). Anything built on the Phantom builder code inherits these limits for Phantom users, but a direct Hyperliquid trader does not use Phantom's geo rules; Hyperliquid's own restrictions apply (see sibling spec: US and Ontario barred from the Interface).
- **Phantom Terms of Use, last updated 2026-03-17 (H via WebFetch summary => M):** prohibits "use scraping techniques to mine or otherwise scrape data" and using the Functionality "in a way intended to avoid incurring fees or exceeding usage limits or quotas"; says AI Agents may access wallets through supported connections without that being unauthorized use. The Terms do not mention prediction markets or perps specifically. No automation licence for prediction markets exists: the help article says external development is unsupported.
- **Automation verdict:** nothing to automate on Phantom's side. Scraping Phantom's app is prohibited and pointless; use Hyperliquid's and World's own surfaces.

---

## 11. Liquidity and category overlap

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Phantom Outcome 24h / 7d / 30d volume | $0 / $0 / $0 | `api.llama.fi/summary/dexs/phantom-outcome`, series to 2026-10-17 | H |
| Phantom Outcome lifetime volume / fees | $91 / $0.02 (single day, 2026-05-02) | same; reproduced from builder-fills file ($90.69 / $0.02255) | H |
| Phantom builder fills per day (all markets) | 17,321 (2026-05-02); 23,106 (05-03); 15,093 (08-15); 31,682 (10-15); 13,208 (10-17) | Hyperliquid builder-fills archive | H |
| Phantom wallet users | "over 20 million" / "roughly 20 million" (Dec 2025 and Jun 2026 press) | CoinDesk/Decrypt/Crypto Briefing search results; older than 6 months for the Dec 2025 figure | M/L |
| World (Phantom's prediction backend) TVL | $177,492 (Solana) | `api.llama.fi/protocol/world`, fetched 2026-10-19 | H |
| Hyperliquid HIP-4 (underlying) | ~$2.9M/day, 30d $43.9M | sibling fixture `defillama_hyperliquid-outcomes_summary_trimmed.json` (DefiLlama, last full day 2026-10-17) | M (read from a local sibling fixture) |

No OI/TVL exists for "Phantom Outcome" (DefiLlama TVL arrays empty). NOT FOUND (searched: DefiLlama protocol and dimension endpoints; Phantom pages publish no prediction-market volume).

**Event categories:** the Phantom-via-World product lists sports, politics, crypto, culture (H) and at launch (2026-07-01) short-duration BTC up/down plus 2026 FIFA World Cup, with sports/politics/macro "planned through July" (M, Yahoo/BeInCrypto and Crypto Briefing). Those overlap Polymarket, Kalshi, Hyperliquid HIP-4 and XO on crypto price and sports. But the overlap is World's and Hyperliquid's to claim, not Phantom's: Phantom has no markets of its own.

---

## 12. Shared liquidity (independent leg?)

**No.** Three separate answers, all non-independent:

1. "Phantom Outcome" (HIP-4 builder code) shares 100% of its liquidity with Hyperliquid HIP-4 (`hyperliquid-outcomes-hip-4.md`); DefiLlama `doublecounted: true`. (H)
2. Phantom's prediction markets since 2026-06-01 are World liquidity (`world.md`), reached through Phantom's UI. A Phantom user's World trade is the same pool as a trade on world.xyz or through PayBox's `world` plugin. (H)
3. Phantom's pre-2026-06-01 positions are Kalshi liquidity via DFlow (see `dflow-prediction-markets.md` and the Kalshi spec). (H)

---

## 13. Adapter recommendation

**adapter_priority = skip** (as a venue). Reasons: not a venue; no Phantom API; the only Phantom-attributed HIP-4 flow in history is $91 from one address on launch day; its real product's liquidity is World's (P2, thin, no public API) and its HIP-4 route's liquidity is Hyperliquid's (P1); mobile-app-only; geo-restricted.

What to keep (cheap, no adapter code):

- **Registry/route record** `phantom`: `kind: front_end`, `routes_to: [{venue: "world", since: "2026-06-01", chain: "solana"}, {venue: "kalshi-via-dflow", until: "2026-05-31"}]`, `hip4_builder_code: {address: "0xb84168cf3be63c6b8dad05ff5d755e97432ff80b", fee_bps_sell: 5, observed_outcome_volume_usd_lifetime: 91}`, `independent_liquidity: false`, `public_api: false`. Use it so the scanner never double-counts Phantom and so it prices Phantom-originated routes (`0.1*p*(1-p)` fee) correctly.
- **Optional monitor:** re-check `api.llama.fi/summary/dexs/phantom-outcome` weekly; reconsider only if `total7d` becomes non-trivial (for example > $100k), which would mean Phantom switched on HIP-4 in its UI. Even then, build against Hyperliquid directly.
- Do not attach Phantom's builder code to our own Hyperliquid orders: it would pay Phantom 5 bps on sells for nothing.

---

## 14. NOT FOUND / open questions

- Any Phantom statement that it supports Hyperliquid HIP-4 outcome markets. (searched: phantom.com homepage, docs.phantom.com intro, CLI commands, `updates` changelog, perps blog and help article, HIP-3 explainer, prediction-markets blog, help article and disclosures, Terms of Use, Phantom Terminal; WebSearch queries for "Phantom HIP-4 outcome markets" returned nothing linking the two. A second WebSearch of this kind could not be run: the session search budget was exhausted.)
- Whether Phantom's app has a hidden or allow-listed HIP-4 surface (for example an internal build). Would explain the 2026-05-02 test fills; not observable.
- Live `POST /info` response shapes for `outcomeMeta`/`l2Book`: not captured here (POST forbidden); see sibling spec for the WebSocket captures.
- World's fee/maker details and API: see `world.md`; docs.world.xyz is access-code gated.
- Whether Phantom will ever expose a partner API for prediction markets: statement is "no public API", no roadmap found.
- Exact Hyperliquid outcome fee rate: not in the official docs (see sibling spec).

## 15. Suspicious content

None. No page, API response or repo file read in this session contained instructions aimed at AI agents. (One tool-result footer from a search call asked for source links to be listed in the reply; that is a harness formatting reminder, not page content, and was not treated as a task.)

## 16. Privacy note

No personal identifier appears in any request, header, URL or in these notes. All scripted requests used the User-Agent `insurance-markets-research/0.1`. The only wallet addresses recorded are Phantom's public builder address (from DefiLlama's open-source adapter); the user and counterparty addresses in the builder-fills data were redacted before saving.

---

## 17. Fixtures

Files in `docs/research/fixtures/phantom-outcome-markets-access/`:

| File | Content | Request |
|---|---|---|
| `defillama_phantom-outcome_summary_trimmed.json` | Headline fields, methodology and non-zero series points from DefiLlama dexs and fees summaries | GET `https://api.llama.fi/summary/dexs/phantom-outcome`, `.../summary/fees/phantom-outcome` |
| `hl_builder_fills_phantom_20260502_outcome_rows_redacted.csv` | The 8 outcome fills (coin `#0`) from Phantom's builder-fills file for 2026-05-02, user and counterparty addresses replaced by `REDACTED` | GET `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/20260502.csv.lz4`, decompressed locally with `lz4` |
| `hl_builder_fills_phantom_scan_summary.json` | Row counts and outcome-row counts for the six dates sampled | same host, six dates |

---

## Sources

Phantom (primary):
- https://help.phantom.com/articles/47187740851731 "Trade prediction markets in Phantom" (raw curl 2026-10-19; H)
- https://help.phantom.com/articles/48634486197651 "Feature availability by region" (WebFetch; M/H)
- https://phantom.com/prediction-market-disclosures (dated Jul 1, 2026; raw curl; H)
- https://phantom.com/learn/blog/phantom-prediction-markets (Dec 12, 2025, Kalshi era; stale for provider; H)
- https://phantom.com/learn/crypto-101/prediction-markets (undated, Kalshi via DFlow; stale; H)
- https://phantom.com/learn/blog/phantom-perps and https://phantom.com/learn/crypto-101/hyperliquid-hip-3 (WebFetch; M)
- https://help.phantom.com/hc/en-us/articles/42292249388307-How-to-trade-perps-in-Phantom (WebFetch; M)
- https://docs.phantom.com/ , https://docs.phantom.com/phantom-cli/commands , https://docs.phantom.com/updates (WebFetch; M)
- https://phantom.com/terms (last updated 2026-03-17; WebFetch; M)
- https://trade.phantom.com/ (WebFetch; M)

Hyperliquid (primary):
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint (H; split/merge/negate outcome actions)
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4 (H; dates 20260502, 20260503, 20260815, 20261015, 20261017)

DefiLlama (primary for the listing, H):
- https://defillama.com/protocol/phantom-outcome (WebFetch returned 403; the same data read from the API instead)
- https://api.llama.fi/protocol/phantom-outcome , https://api.llama.fi/summary/dexs/phantom-outcome , https://api.llama.fi/summary/fees/phantom-outcome , https://api.llama.fi/protocol/world
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (via `gh api` raw)

PayBox (read-only discovery): `discover_plugins` queries "hyperliquid", "phantom prediction", "world prediction"; `get_contract paybox://plugins/hyperliquid` (2026-10-19).

Secondary (M/L):
- https://cryptobriefing.com/phantom-taps-world-to-replace-kalshi-for-prediction-markets/ (2026-06-29; WebFetch)
- https://finance.yahoo.com/markets/crypto/articles/solana-prediction-market-world-goes-201113336.html (World live in Phantom 2026-07-01; WebFetch)
- Dec 2025 launch coverage of the Kalshi integration (CoinDesk, Decrypt, Forbes) appeared in search results only; older than 6 months, stale for provider (L)
- https://world.xyz/ (SPA shell, no content without JS; docs.world.xyz redirects to a login)
