# fomo (fomo.family) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page reads, public unauthenticated GETs/HEADs to documented hosts, `gh api` reads. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text treated as untrusted data. WebSearch budget was exhausted mid-session (one search ran before that, with no fomo hits), so there is no further press coverage here.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my own computation/inference; **L** = weak or stale.

---

## 0. Bottom line

1. **fomo is a consumer front-end, not a venue.** Its prediction-market access is a Hyperliquid HIP-4 *builder code* on the native Hyperliquid outcome order book. fomo adds no liquidity, no markets, no resolution logic and no public API of its own. DefiLlama states it directly: "fomo provides access to outcome-based prediction markets through Hyperliquid" (H).
2. **Not an independent arbitrage leg.** Every fomo outcome trade is a fill on the same HyperCore book covered in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`. Integrating fomo would double-count Hyperliquid.
3. **Tiny.** DefiLlama attributes **$543 of all-time outcome volume** to fomo (13 non-zero days since 2026-07-17; $80 in the last 30 days; $0 in the last 24 h; $0.05 fees all-time), against $261.1M all-time and $3.13M/day for Hyperliquid outcomes overall (H). That is roughly 0.0002% of the underlying book.
4. **Official fomo sources never mention outcome/prediction markets** (homepage, Terms of 2026-08-17, FAQ, blog, sitemap). The only evidence the feature exists is DefiLlama's builder-fill attribution (H for the attribution, NOT FOUND for any fomo-published product page).
5. **adapter_priority = skip.** Use the Hyperliquid HIP-4 adapter for the read leg. If we want fomo's own flow as a signal, DefiLlama's builder-attribution series is the only handle and it is too small to matter.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://fomo.family` HTTP 200; sitemap `lastmod` 2026-10-16T23:11Z; marketing copy "2,500,000 users", iOS/Android/web | H |
| Terms of Service dated "August 17, 2026" (https://fomo.family/terms) | H |
| Blog post "Perpetuals now on fomo" dated June 11, 2026: perps "powered by Hyperliquid and Trade[XYZ]"; latest blog post in the sitemap is that one (https://fomo.family/blog/perpetuals-now-on-fomo; blog index lists nothing newer) | H |
| DefiLlama `fomo-outcome` (id 8984): category "Interface", tag "Hyperliquid HIP4 Builder", `listedAt` 1791497884 = 2026-10-08 22:18Z, last non-zero volume day 2026-10-16 (https://api.llama.fi/protocol/fomo-outcome, https://api.llama.fi/summary/dexs/fomo-outcome, fetched 2026-10-19) | H |

Verdict: **the company and app are live; the outcome-market feature is live only in the sense that builder-code fills were recorded as recently as 2026-10-16.** Whether the in-app UI currently exposes an outcomes tab was NOT verified (app is login/mobile-gated; no browser automation allowed).

---

## 2. Kind and market model

- **Kind (H):** social crypto trading app / broker-style front-end ("social-first crypto trading app ... leaderboard, a feed for following top traders", https://fomo.family). Products: memecoin swaps (self-custodial, gasless per DefiLlama parent description, M), perps (Hyperliquid + Trade[XYZ]), spot, and per DefiLlama, Hyperliquid HIP-4 outcomes.
- **Market model: inherited from Hyperliquid HIP-4 (H via sibling note).** Fully collateralised binary outcomes on a native on-chain CLOB; Yes/No on a merged book; USDC collateral; questions group mutually exclusive outcomes; tokenised as HyperCore coins `#<10*outcome+side>`, order asset id `100_000_000 + 10*outcome + side`. Details and live samples: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` sections 2-4.
- fomo-specific market list, ranking, categories or curation: **NOT FOUND** (searched: fomo.family home, /terms, /answers, /blog, sitemap.xml, /llms.txt (404), robots.txt).

---

## 3. Chains and collateral

- Outcome trades settle on **HyperCore (Hyperliquid L1)**, collateral **USDC** (H via DefiLlama: chain "Hyperliquid L1"; collateral from sibling note).
- fomo itself says only "multichain" without naming chains (H, homepage). How a fomo user funds Hyperliquid (fomo-managed wallet, bridge, deposit rail) is **NOT FOUND**.
- Whether fomo uses a user's own Hyperliquid account or a fomo-custodied/derived one: **NOT FOUND**. The builder-code mechanism requires the *user's* HL account to approve the builder fee (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes), which implies fills are on a per-user HL account.

---

## 4. Read API

- **Official fomo API: none found.** `api.fomo.family`, `docs.fomo.family`, `developers.fomo.family`, `app.fomo.family` do not resolve (H, curl "Could not resolve host"). `https://fomo.family/llms.txt` 404. `fomo.family/api`, `/predictions`, `/outcomes` return an identical 12,055-byte SPA shell (a catch-all, not an endpoint) (H). No GitHub org found (`gh api repos/fomo-family` -> Not Found). robots.txt disallows `/token`, `/coin`, `/prices/`, `/profile/`, `/u/` etc.; the Terms prohibit scraping (see section 9). Verdict: `exists = none`.
- **What an aggregator can use instead: the Hyperliquid public API** (keyless WS + `POST /info`), see the sibling note. For fomo's *attributed* flow only:
  - DefiLlama (public GET, no key): `https://api.llama.fi/summary/dexs/fomo-outcome` (daily builder-attributed volume; methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code"; `doublecounted: true`) and `https://api.llama.fi/summary/fees/fomo-outcome`. Fixtures saved. (H)
  - Hyperliquid public S3: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address_lowercase}/{YYYYMMDD}.csv.lz4` (H, builder-codes doc). HEAD on the builder address DefiLlama uses for `fomo-perps` returned 200 for 2026-10-15/16/18 (13-35 KB each, covers all fomo builder fills, not outcomes only) (H). Not downloaded or decoded.
  - Builder address used by the DefiLlama outcome adapter (`fomo-outcome` -> builder `fomo-perps`): `0xb838e4d1c8bcf71fa8e63299d5aa3258c83d6adb` (H, https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts, read with `gh api`). A second address `0x2a2b6b093a9813fbd8cddae800c3d17d46460d17` ("fomo-social-trading-perps", start 2026-06-05) exists for perps (H). Public project attribution addresses, not the user's.
- Rate limits for fomo: NOT FOUND (no API). DefiLlama public API limits not documented in what I read.

Fixtures: `docs/research/fixtures/fomo/` - `defillama_protocol_fomo-outcome.json`, `defillama_dexs_fomo-outcome_trimmed.json`, `defillama_fees_fomo-outcome_trimmed.json`, `builder_fills_head_sample.txt`, `fomo_family_robots.txt`.

---

## 5. Trade path (programmatic)

- **Via fomo: none.** No API, no documented external-wallet connection, no bot program. The Terms (section 16) prohibit "bots or scripts to ... execute trades" on the service and state the document "doesn't describe a public API or a sanctioned bot program" (H, https://fomo.family/terms; second clause is the reader's summary of absence).
- **Via the underlying venue: yes.** Orders go to `POST https://api.hyperliquid.xyz/exchange` as signed actions; an optional per-order `builder:{b:<addr>,f:<tenths of bp>}` is how fomo is paid (H, builder-codes doc and sibling note section 5). Our own orders would not need fomo's builder code at all.

---

## 6. Reachability from a PayBox wallet

**Verdict: no (for fomo as a venue).**

- fomo exposes no on-chain contract to propose transactions against and no external-wallet or order-signing API (NOT FOUND). Outcomes trade on HyperCore, which takes signed L1 actions, not EVM transaction proposals.
- The underlying Hyperliquid book is reachable only *partially* from PayBox (signing via `request_wallet_sign` typed data/raw is possible; PayBox's Hyperliquid plugin is read-only; USDC funding via Arbitrum). See `hyperliquid-hip-4-outcomes-native.md` section 6. That route goes direct to Hyperliquid and bypasses fomo entirely.

---

## 7. Fees

- **fomo outcome fee: NOT FOUND.** The Terms (section 7) say fomo charges a fee on buys and sells "displayed before you confirm" and "may change it at any time"; the only number given is **perps 0.05% per transaction** on top of protocol fees (H, https://fomo.family/terms). No outcome-specific rate is published.
- **Observed builder fee (M, weak):** DefiLlama fees $0.02 and $0.03 on 2026-10-15 and 2026-10-16 against volume $31 and $38 on those days, i.e. roughly 6-8 bps, but values are rounded to cents so this is indicative only. Fee series starts 2026-10-15 even though volume starts 2026-07-17 (reason unknown; possibly fee data only recorded from the new listing).
- **Hyperliquid base fee underneath (H via sibling note):** none to open, charged on close/settlement, scaled per deployer (`deployerFeeScale`); builder fee is on top, capped by the user-approved max (builder codes: 0.1% perps / 1% spot caps; outcome cap not stated in that page).
- Who pays: the user, on top of Hyperliquid's fee; fomo keeps the builder fee ("Revenue ... all kept by the builder", DefiLlama methodology, H).

---

## 8. Resolution mechanism and dispute risk

- fomo does not resolve anything. Resolution is whatever Hyperliquid's market says: protocol auto-settle for recurring series, validator vote for canonical markets, deployer settlement for the large majority of permissionless markets, with **no trader dispute window** (H/M via sibling note section 8).
- fomo's Terms say nothing about outcome-market disputes (the Terms contain no reference to prediction/outcome markets at all, H). Expect no recourse from fomo.

---

## 9. Geo, ToS, automation (H, https://fomo.family/terms, "Date: August 17, 2026")

- General: not offered in sanctioned jurisdictions (Cuba, Iran, North Korea named) or to sanctions-listed persons; 18+.
- Perps (section 10): not available to "U.S. Persons" or from within the US; fomo "may restrict Perps in other jurisdictions and may require KYC". **No outcome-market clause exists**; the intended gating for outcomes is therefore undocumented. Underlying Hyperliquid Terms (2026-06-15) bar US and Ontario residents and an unpublished "Excluded Persons" list for outcome markets (H via sibling note section 9).
- VPN/proxy circumvention prohibited (material breach).
- Automation (section 16): prohibits bots/scripts that "execute trades or otherwise control account activity", and "scraping, crawling, or data mining" of "pricing" and "transaction data". So no automated trading *through fomo*, and no scraping of fomo pages. Public DefiLlama and Hyperliquid data are separate services.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| fomo-attributed outcome volume, all-time | **$543** (13 non-zero days) | https://api.llama.fi/summary/dexs/fomo-outcome, fetched 2026-10-19 | H |
| 24h / 7d / 30d / 1y | $0 / $69 / $80 / $543 | same | H |
| Non-zero days | 2026-07-17 $31; 07-23 $12; 07-24 $57; 07-29 $113; 08-10 $130; 08-11 $53; 08-31 $15; 09-01 $21; 09-05 $21; 09-07 $10; 10-07 $11; 10-15 $31; 10-16 $38 | same | H |
| fomo outcome fees, all-time | $0.05 | https://api.llama.fi/summary/fees/fomo-outcome, 2026-10-19 | H |
| Underlying Hyperliquid outcomes | $3.13M on 2026-10-18; $17.9M 7d; $47.0M 30d; $261.1M all-time | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19 | H |
| fomo share of the underlying | about 0.0002% of all-time volume | my computation | M |
| fomo overall (perps + spot + outcome) | NOT FOUND for outcomes; fomo parent claims 2.5M users | https://fomo.family | M (marketing) |

DefiLlama notes the figure is attribution, flagged `doublecounted: true`: it is a slice of the Hyperliquid number, not additional liquidity.

---

## 11. Event categories and cross-venue overlap

fomo has no catalogue of its own (NOT FOUND). Whatever overlap exists is Hyperliquid HIP-4's: crypto price ladders (BTC/ETH/SOL/HYPE), sports (NFL, NBA, soccer, esports), central-bank rate decisions, plus thin awards/IPO/AI markets, overlapping Polymarket, Kalshi, Limitless, Predict.fun, Opinion and others (see sibling note section 11). Which of those fomo's UI surfaces: NOT FOUND.

---

## 12. Shared liquidity?

**Yes, 100% shared with Hyperliquid HIP-4 outcomes.** A builder code is a fee tag on fills in the HyperCore book; DefiLlama books it as a separate "Interface" line whose volume is an attribution of the same fills (H: builder-codes doc; DefiLlama methodology + `doublecounted: true`). **fomo is not an independent arbitrage leg.** Sibling front-ends in the same DefiLlama factory (floatout, gdex, gtr-trade, hbank, hyperbeat-liquidbank, hyperdash, ...) are the same story (H: factory/hyperliquid.ts).

---

## 13. Adapter spec

- **No fomo adapter.** Model `fomo` in the platform registry as `kind=frontend`, `liquidity_source=hyperliquid-hip4`, `independent=false`, `trade_via=hyperliquid` (direct). Route any "fomo" market to the Hyperliquid adapter; never emit separate quotes.
- **Optional signal feed (not recommended):** poll `https://api.llama.fi/summary/dexs/fomo-outcome` daily for builder-attributed volume. It is $0-130/day, so it carries no usable signal.
- **Do not** scrape fomo.family pages or the app (Terms section 16) and do not rely on third-party unofficial fomo backends.

---

## 14. Open questions

- Does the fomo app/web UI currently expose an outcomes/predictions tab, and what markets? (needs a logged-in session; not allowed here)
- Is the fomo builder fee for outcomes documented anywhere (in-app only)? What max builder fee do users approve?
- Why do DefiLlama volumes start 2026-07-17 while the adapter start is 2026-05-02, and fees only 2026-10-15?
- Does fomo sell outcomes to US users? Terms are silent beyond perps.

---

## Sources

1. https://fomo.family (homepage, fetched 2026-10-19) - H
2. https://fomo.family/terms (dated August 17, 2026; sections 1, 7, 10, 16 via page read) - H
3. https://fomo.family/answers (FAQ index; no prediction/outcome/perps/API entries) - H
4. https://fomo.family/blog/perpetuals-now-on-fomo (June 11, 2026) and https://fomo.family/blog/february-2026-recap (Feb 28, 2026; no prediction mention) - H
5. https://fomo.family/sitemap.xml (lastmod 2026-10-16; 155 URLs; no prediction/outcome pages) and https://fomo.family/robots.txt - H
6. https://defillama.com/protocol/fomo-outcome (HTTP 403 to WebFetch; data read via API below) - n/a
7. https://api.llama.fi/protocol/fomo-outcome, https://api.llama.fi/summary/dexs/fomo-outcome, https://api.llama.fi/summary/fees/fomo-outcome, https://api.llama.fi/summary/dexs/hyperliquid-outcomes, https://api.llama.fi/protocol/fomo, https://api.llama.fi/protocol/fomo-perps (fetched 2026-10-19) - H
8. https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (via `gh api`; builder addresses, `fomo-outcome` start 2026-05-02) - H
9. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes(.md) - H
10. https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/ (HEAD only) - H
11. Repo notes: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (read 2026-10-19; underlying venue facts reused, its own tags apply)
12. WebSearch "FOMO app prediction markets Hyperliquid HIP-4 outcomes launch" returned only HIP-4 explainers and no fomo-specific result - H (negative)

Suspicious / embedded instructions found in third-party content: none.
