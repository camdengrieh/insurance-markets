# Hyperliquid HIP-4 front-end: HyperDash (hyperdash.com) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (site, docs page, DefiLlama API). No account, wallet, key, signature, POST, payment, browser automation or PayBox tool. WebSearch was unavailable (session search budget exhausted), so no new web-search evidence was gathered; the deeper read of HyperDash's docs, Terms and JS bundle comes from the same-day note `docs/research/venues/hyperdash.md`, and key numbers were re-fetched today (matched exactly). Third-party text treated as untrusted data.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary, inferred, or carried from a repo note; L = weak/stale.

## 0. Bottom line

1. HyperDash is a trading terminal; its prediction tab is a front-end onto Hyperliquid HIP-4 outcome markets, monetised by a builder-code fee. It has no book, AMM, market creation or resolution of its own (H: DefiLlama description "HyperDash provides access to outcome-based prediction markets through Hyperliquid"; tag "Hyperliquid HIP4 Builder"; category "Interface").
2. Liquidity is 100% shared with Hyperliquid HIP-4. NOT an independent arbitrage leg. Model at most as `front_end="hyperdash"` metadata on the Hyperliquid HIP-4 adapter (full spec: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`).
3. Live but nearly dormant for outcomes: $3,800 all-time attributed volume.
4. No HyperDash prediction API. Go to Hyperliquid directly.
5. adapter_priority = skip.

## 1. Still live? (2026-10-19)

- `https://hyperdash.com/` HTTP 200, title "Hyperdash | Advanced Trading Platform", meta description "Advanced trading platform built for global markets" (H, curl today). The HTML shell does not mention predictions.
- `https://hyperdash.com/predictions` HTTP 200 (H, curl today); client-rendered, so contents not visible to a plain GET.
- `https://docs.hyperdash.com/fees-referrals-rewards.md` HTTP 200 and states fees for "spot and prediction markets" (H).
- DefiLlama `https://api.llama.fi/protocol/hyperdash-outcome`: id 8995, chain "Hyperliquid L1", twitter hypurrdash, parent "HyperDash", `listedAt` 1791497895 (2026-10-08) (H, fetched today).
- Verdict: still_live = true (front-end up; outcome flow negligible).

## 2. Kind and market model

- Kind: broker/front-end (terminal) over Hyperliquid HIP-4, builder-code monetised (H, DefiLlama methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code").
- Market model and tokenisation are Hyperliquid's: on-chain CLOB on HyperCore; outcome coins `#<10*outcome+side>`, tokens `+<enc>`, asset id `100_000_000+enc`; binary outcomes plus question/named-outcome groupings (M, carried from sibling note; not re-verified here).
- HyperDash UI category buckets: All, Crypto, Sports, Stocks, Commodities, Economics, Other (M, i18n strings in bundle per `hyperdash.md`). Display buckets only.

## 3. Chains and collateral

HyperCore (Hyperliquid L1), USDC collateral (M, sibling note). HyperDash says users can fund from any chain/card/fiat and offers Turnkey-based embedded wallets (M, from `hyperdash.md`/docs); positions live on the user's Hyperliquid account. No HyperDash-specific contract or chain for outcomes.

## 4. Read API

- Official HyperDash prediction API: NOT FOUND (searched: docs.hyperdash.com llms.txt and ~6 pages, hyperdash.com llms.txt / AGENTS.md / robots / sitemap, main bundle strings - per `hyperdash.md`; docs OpenAPI is Mintlify's placeholder). exists = none.
- The web app reads Hyperliquid directly (`api.hyperliquid.xyz` info types `outcomeMeta`, `outcomeTemplates`, `settledOutcome`; WS `outcomeMetaUpdates`) plus an undocumented `api.hyperdash.com` (M, minified bundle).
- Correct integration point: Hyperliquid `POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`, keyless, ~1200 weight/min/IP, 1000 WS subs (M, sibling note). Docs: https://hyperliquid.gitbook.io/hyperliquid-docs
- Per-builder attribution only: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` (M).
- Machine-readable volume (the only public data about HyperDash outcomes): DefiLlama `https://api.llama.fi/summary/dexs/hyperdash-outcome` and `/summary/fees/hyperdash-outcome` (H). Shape: `{name,total24h,total7d,total30d,total1y,totalAllTime,totalDataChart:[[unix_ts,usd],...],methodology:{Volume,NotionalVolume,Fees,Revenue,ProtocolRevenue},...}`. Fixtures saved (section 14).

## 5. Trade path

- Via HyperDash: none programmatic. Browser-generated Hyperliquid agent wallet (180-day validity, encrypted in browser) plus builder-fee approval (M, from `hyperdash.md` reading of docs `agent-wallets-security.md`).
- Via Hyperliquid directly: signed `POST /exchange` actions (L1 EIP-712 phantom-agent for orders; `approveAgent` / `approveBuilderFee` user-signed) (M, sibling note). An aggregator should trade on Hyperliquid itself and omit HyperDash's builder code (otherwise +3 bps and a builder approval).

## 6. PayBox reachability

- HyperDash itself: no (no API; browser-held agent key).
- Underlying Hyperliquid HIP-4: partial. Orders are HyperCore L1-action signatures, not EVM transaction proposals; PayBox lists Hyperliquid as HyperEVM (`eip155:999`) and its official plugin was recorded as spot-oriented (M, `docs/research/06-paybox-platform.md`). Funding is USDC to HyperCore via Arbitrum. HyperDash adds nothing to this.

## 7. Fees

- HyperDash builder fee: "1.5 basis points (0.015%) on perps and 3 basis points (0.03%) on spot and prediction markets, added to the base Hyperliquid fee schedule"; referral signups pay 10% less, discounts do not stack (H, https://docs.hyperdash.com/fees-referrals-rewards.md, fetched today, saved as fixture). Paid by trader.
- Cross-check: DefiLlama fees $1.15 on $3,800 volume = about 3.0 bps (H data, M computation).
- Hyperliquid base outcome fee: charged on close/settle, minting free (M, sibling note); numeric rate not in official docs, empirical all-in about 11-25 bps (M).
- Net: trading via HyperDash is about +3 bps over the direct book.

## 8. Resolution and dispute risk

Entirely Hyperliquid's (protocol-native for recurring BTC series; deployer-settled for most others with no documented trader dispute window) (M, sibling note). HyperDash only displays state. Rule text must come from `outcomeMeta`/templates, not HyperDash.

## 9. Geo / ToS / automation

- HyperDash Terms (https://hyperdash.com/terms, "Last updated Jun 27, 2025", M via `hyperdash.md`): prohibited jurisdictions include the USA and Ontario; section 7.1 conflicts by allowing US persons spot only. Terms pre-date HIP-4 mainnet (2026-05-02) and have no prediction clause, so stale for outcomes.
- Automation: users may not use "web crawlers, bots, spiders or other automatic devices ... to access, obtain, copy or monitor any part of the properties" (Terms 4.5, M). Do not scrape hyperdash.com. robots.txt disallows `/api/` except `/api/asset/` (M).
- Hyperliquid's own Terms (2026-06-15) bar US and Ontario residents and add an unpublished "Excluded Persons" list for outcomes (M, sibling note).
- Geo-block behaviour of the predictions tab: NOT FOUND (no browser automation allowed).

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| HyperDash Outcome volume, all time | $3,800 | https://api.llama.fi/summary/dexs/hyperdash-outcome, fetched 2026-10-19, last point 2026-10-18 | H |
| 30d / 7d / 24h | $3,479 / $0 / $0 | same | H |
| Days with non-zero volume | 10 of 50 returned days (first 2026-08-30) | same (my count of `totalDataChart`) | H data |
| Builder fees, all time / 30d | $1.15 / $1.06 | https://api.llama.fi/summary/fees/hyperdash-outcome | H |
| Shared pool: all Hyperliquid Outcomes | 24h $3.13M, 7d $17.9M, 30d $47.0M, all time $261.1M | DefiLlama `hyperliquid-outcomes`, 2026-10-18 point | M (carried from `hyperdash.md`) |
| Own TVL/OI | none (interface; empty TVL arrays) | https://api.llama.fi/protocol/hyperdash-outcome | H |

HyperDash is about 0.007% of the 30d Hyperliquid Outcomes volume (M computation).

## 11. Event-category overlap

Same as Hyperliquid HIP-4 (M, sibling note): sports (largest), crypto price (overlaps Polymarket, Kalshi, Limitless, Predict.fun, Opinion; reference is HyperCore perp mark so basis risk), Fed/macro, stock/commodity price templates. Quotient's `hl_outcomes` feed is the relevant signal (M, `docs/research/12-quotient.md`). HyperDash lists no unique markets.

## 12. Shared liquidity

Yes, entirely, with Hyperliquid HIP-4 and every other HIP-4 front-end. Same books and fills; builder code is a fee tag. Not an independent leg; do not add its volume to the Hyperliquid base figure.

## 13. Adapter spec

No standalone adapter. Optionally tag `front_ends:["hyperdash"]` on the Hyperliquid HIP-4 adapter; deep-link scheme under `hyperdash.com/predictions/...` unverified. Do not attach HyperDash's builder code to aggregator orders; do not scrape the site.

## 14. Priority: skip

Duplicate liquidity, no prediction API, $3,800 lifetime volume, stale Terms that bar automation.

Fixtures (docs/research/fixtures/hyperliquid-hip-4-front-end-hyperdash/):
- `defillama_summary_dexs_hyperdash-outcome.json` (5.7 KB)
- `defillama_summary_fees_hyperdash-outcome.json` (5.9 KB)
- `docs_hyperdash_fees-referrals-rewards.md` (3 KB)

## 15. NOT FOUND / open

- NOT FOUND: HyperDash-published prediction API/SDK (searched: see section 4).
- NOT FOUND: launch announcement or third-party coverage (WebSearch budget exhausted this session; earlier searches recorded in `hyperdash.md` found none).
- NOT FOUND: outcome-specific Terms clauses; geo-block behaviour of predictions tab.
- Open: builder-approval ceiling a new user signs (UI 0.05% vs code path 1%, M); whether zero 24h/7d volume is no flow or DefiLlama lag.
- WebFetch of https://defillama.com/protocol/hyperdash-outcome returned HTTP 403 (used api.llama.fi instead).

## 16. Suspicious content

None encountered in this session's fetches. Carried from `hyperdash.md`: llms.txt / AGENTS.md / Mintlify docs contain benign AI-crawler discovery text and agent-card/MCP link headers; none followed.

## 17. Sources

- https://hyperdash.com/ , https://hyperdash.com/predictions (curl, 2026-10-19) (H)
- https://docs.hyperdash.com/fees-referrals-rewards.md (H)
- https://api.llama.fi/protocol/hyperdash-outcome , https://api.llama.fi/summary/dexs/hyperdash-outcome , https://api.llama.fi/summary/fees/hyperdash-outcome (H, 2026-10-19)
- https://defillama.com/protocol/hyperdash-outcome (403 to fetch; used as discovery evidence only)
- Repo notes (M): `docs/research/venues/hyperdash.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, `docs/research/06-paybox-platform.md`, `docs/research/12-quotient.md`

## 18. Privacy

All scripted requests used exactly `User-Agent: insurance-markets-research/0.1`. Fixtures grepped for "@": no hits. No personal identifiers in requests or notes.
