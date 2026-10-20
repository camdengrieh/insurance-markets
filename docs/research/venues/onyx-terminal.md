# Onyx Terminal (onyx.live) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes about 04:00-04:30 UTC). READ-ONLY: WebFetch and unauthenticated GET/HEAD requests with the generic User-Agent `insurance-markets-research/0.1`, `gh api` raw reads of one public file, no account, wallet, key, signature, POST/PUT/DELETE, payment, or PayBox tool. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Method limits: the shared WebSearch budget was exhausted before I could search (two calls refused), so there is **no press or news check**. Everything below comes from pages and APIs I fetched directly. `x.com/Onyx_terminal` returned HTTP 402 to WebFetch; I did not pay or work around it, so the project's social feed is unread.

Fixtures (all under 50 KB): `docs/research/fixtures/onyx-terminal/`.

---

## 0. Bottom line

1. **Onyx Terminal is a front end, not a venue.** It is a "Pro trading terminal" built on Hyperliquid's backend ("Onyx is embedded with Hyperliquid's backend system", Onyx fees doc, H). Its "outcome markets" are Hyperliquid HIP-4 outcome books reached with an Onyx **builder code**. It has no books, collateral, oracle or settlement of its own. DefiLlama says so in its own methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code", `doublecounted: true` (H).
2. **The trading surface is not live today.** `app.onyx.live` (every path I tried, including `/trade`) answers **HTTP 301 to `https://app.hyperliquid.xyz/`** on 2026-10-19 (curl and WebFetch both; fixture `http_redirects_app_and_site.txt`) (H). The marketing site `www.onyx.live` and the docs are still up (H). Onyx-routed outcome volume has been **zero since 2026-07-19**, and no builder-fill archive file exists for the Onyx builder address after **2026-08-19** (H data, M interpretation: the front end is dormant or retired).
3. **Duplicate liquidity.** Whatever Onyx once routed went into the same Hyperliquid HIP-4 books that the aggregator should read directly. It can never be an independent arbitrage leg.
4. **adapter_priority = skip.** Dead or dormant front end, no API of its own, duplicate liquidity, about $34k of lifetime routed volume. Build one Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-hip-4-outcome-markets.md`) and, at most, carry `frontend=onyx` as an attribution label.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET/HEAD https://app.onyx.live/trade`, `/trade/BTC`, `/`, `/outcomes`, `/portfolio`, `/terms`, `/robots.txt` | all `301 -> https://app.hyperliquid.xyz/` (Cloudflare), 2026-10-19 04:19-04:23Z | H |
| WebFetch of `https://app.onyx.live/trade` (different client) | same redirect to `app.hyperliquid.xyz` | H |
| `https://www.onyx.live/` | 200, Next.js, title "Onyx - Trade with edge across all markets", copy: "Onyx is the unified trading terminal for onchain markets ... powered by Hyperliquid"; "Start Trading" links to `https://app.onyx.live` (the redirecting host); `x-vercel-cache: HIT`, `age: 1096624` s (about 12.7 days cached) | H |
| Docs `https://tradewithonyx.gitbook.io/docs` (20 pages, `docs.onyx.live` 301 to it) | up; fees page references "Hyperliquid's published documentation"; points programme "began on May 13th, 2026", 1,000,000 points per week; funding page screenshot dated 2026-02-23 | H |
| DefiLlama "Onyx Terminal Outcome" (id 9026, category "Interface", tag "Hyperliquid HIP4 Builder", chain Hyperliquid L1) | `listedAt` = 2026-10-08 22:18 UTC, which is when DefiLlama began tracking it, **not** evidence of activity. The adapter backfills from 2026-05-02. | H |
| DefiLlama daily volume, Onyx outcome | first non-zero 2026-05-19; **last non-zero 2026-07-19 ($159)**; 24h, 7d, 30d all `0` on 2026-10-19; 54 non-zero days out of 153 | H |
| Hyperliquid builder-fill archive for the Onyx builder address | files exist up to **2026-08-19** (497 bytes); every probed day after that is missing (all of 2026-08-20..31, plus 09-01, 09-15, 10-01, 10-10, 10-17, 10-18). A control builder shows a file for 2026-10-18, so the 403s are real absences. This covers all markets, not just outcomes. | H data / M interpretation (fixture `builder_fills_archive_head_checks.json`) |
| DefiLlama parent "Onyx Terminal" fees | last meaningful day 2026-08-19 ($8.08), then $0.03 on 09-02 and $0.01 on 09-10; 30d total `0` | H |

**still_live = false** for Onyx as a trading surface. The company site and docs persist, and the underlying HIP-4 venue is very much alive (DefiLlama `hyperliquid-outcomes`: $3.13M on 2026-10-18, $47.0M over 30d, H). Caveat: the redirect was observed from a single Cloudflare edge (BKK) with a generic User-Agent, so a geo- or UA-conditional redirect or a temporary one cannot be ruled out (L). The 3-month volume drought and the missing archive files argue against a temporary cause.

Disambiguation: this is **not** Onyx Odds / Onyx Predictions (onyxodds.com, a US sweepstakes and broker front end; see `docs/research/venues/onyx-odds.md`).

---

## 2. Kind and market model

- **kind: broker-or-frontend** (Hyperliquid builder-code interface; DefiLlama category "Interface"). Products per its docs: spot and perpetual trading with "boosted leverage" (up to 100x on core perps, 50x on select HIP-3 pairs) supplied from an Onyx vault, extra order types (stop, TWAP, scale), a points programme (H). **Onyx's own docs never mention outcome or prediction markets.** I grepped all 20 doc pages for outcome/prediction/HIP-4: zero hits (H). The only evidence that Onyx ever exposed HIP-4 is the builder-code volume on DefiLlama, May 19 to Jul 19 2026 (M).
- **Market model:** inherited unchanged from Hyperliquid HIP-4: on-chain CLOB on HyperCore, fully collateralised Yes/No share pairs on a merged book, binary plus exactly-one-wins questions plus scalar-capable standalone outcomes; asset id `100_000_000 + 10*outcome + side`. Details and live-checked shapes: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` sections 2 and 4 (H there).
- **Tokenisation:** HyperCore spot-style tokens, not ERC-20s (same note).

---

## 3. Chains and collateral

- Chain: Hyperliquid L1 (HyperCore) (H, DefiLlama `chains: ["Hyperliquid L1"]`).
- Collateral: USDC on HyperCore (HIP-4 note, H sample + M). Onyx's funding page lists: USDC from Arbitrum via the Arbitrum bridge and Circle CCTP, USDT swapped to USDC via LiFi, USDC to USDH via Across, and transfer of USDC from HyperEVM (H). "Hyperliquid users can directly fund their Hyperliquid trading account and utilize those funds to trade all markets on Onyx" (H), i.e. the account is the user's own Hyperliquid account.
- DefiLlama TVL for the protocol: empty (`tvl: []`) (H).

---

## 4. Read API

- **Onyx API: NOT FOUND** (searched: the 20-page docs index `llms.txt` and every page, `www.onyx.live` HTML and outbound links, GitHub repository search for the domain (one unrelated hit), DNS/HTTP for `api.onyx.live` and `ws.onyx.live` (no connection), `docs.onyx.live` (301 to the gitbook)). `exists = none`.
- **Where the data actually is:** Hyperliquid's keyless `POST /info` and `wss://api.hyperliquid.xyz/ws` (HIP-4 note section 4: `outcomeMeta`, `allMids`, `l2Book`, `bbo`, `trades`, `activeAssetCtx`; limits 1200 weight/min/IP REST, 1000 WS subscriptions). I did not re-probe it; the sibling note has live fixtures (`docs/research/fixtures/hyperliquid-hip-4-outcome-markets/`).
- **Third-party attribution data (the only machine-readable Onyx signal):**
  - DefiLlama free API: `GET https://api.llama.fi/protocol/onyx-terminal-outcome`, `/summary/dexs/onyx-terminal-outcome`, `/summary/fees/onyx-terminal-outcome` (200, fixtures `defillama_onyx-terminal-outcome_trimmed.json`). `/overview/derivatives` returned a plain-text 402 ("Upgrade to the paid API plan"); not paid, not needed.
  - Hyperliquid stats archive: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4` (HEAD-probed only; not downloaded). Builder address (public, from the DefiLlama adapter entry `onyx-perps`): `0xb290f2f3fad4e540d0550985951cdad2711ac34a`.

---

## 5. Trade path

- **Onyx: none of its own.** Orders are ordinary Hyperliquid orders carrying a builder field. A client approves the builder fee once (`approveBuilderFee`, user-signed) and may attach the builder code per order; HIP-4 note section 5 covers signing (EIP-712 phantom-agent over a msgpack/keccak `connectionId`, chainId 1337, agent wallets).
- **For our purposes the right route is direct to Hyperliquid, with no builder code or our own.** Routing through Onyx adds a 5 bps builder fee on most pairs (section 7) and a dead front end.

## 6. Reachability from a PayBox wallet

**partial, and identical to Hyperliquid HIP-4, not to Onyx.** An EVM wallet could fund via Arbitrum USDC and sign Hyperliquid typed-data orders (`request_wallet_sign` typedData), but this is signed-order trading on HyperCore, not EVM transaction proposals, and nothing about Onyx helps. See HIP-4 note section 6 (M here: I did not call PayBox tools this session). Base, Ethereum, BNB, Polygon and Solana wallets can only fund, not trade.

---

## 7. Fees

- **Onyx builder fee (H, https://tradewithonyx.gitbook.io/docs/onyx/fees):** "The platform implements a 0.01% Builder fee on HIP-3 Growth mode pairs. A 0.05% builder fee is implemented for all other pairs." Whether that applies to HIP-4 outcome trades: **NOT FOUND** (the fees page lists only perp, spot and HIP-3 tables).
- **Hyperliquid's own HIP-4 fee:** charged on close or settle only, base rate not in official docs, deployer scale `base * (scale + max(scale, 1))` (HIP-4 note section 7, H/M). DefiLlama's all-in band for HL outcomes was about 11-25 bps (M).
- **Observed Onyx outcome builder revenue (DefiLlama, H data):** $2.35 all-time against $34,440.94 routed volume, a ratio of about 0.7 bps. That is far below 5 bps, which is consistent with builder fees accruing only on closing legs, a different outcome fee, or sparse attribution; I cannot tell which (L).
- Onyx boosted leverage borrows from an Onyx vault at a fixed annual rate; irrelevant to unlevered outcome shares.

---

## 8. Resolution mechanism and dispute risk

Entirely Hyperliquid's: protocol-settled recurring BTC/HYPE binaries (interpolated mark price), validator-voted canonical markets, and the large majority **deployer-settled with no documented trader dispute window** (HIP-4 note section 8). Onyx adds no resolution layer and its docs say nothing about outcome settlement (NOT FOUND, searched all 20 pages).

---

## 9. Geo, ToS, automation

- **Onyx's own terms: NOT FOUND.** `www.onyx.live/terms` and `/privacy` are 404; `app.onyx.live/terms` redirects to Hyperliquid; no legal link on the homepage HTML; the docs have no terms page (H).
- **Hyperliquid Terms of Use (last updated 2026-06-15, read in the sibling run, H there):** US and Ontario residents barred; an unpublished "Excluded Persons" list applies to outcome markets; disguising location prohibited; scripted use must not "exceed reasonable usage" or bypass rate limits (HIP-4 note section 9).
- No Onyx API means no Onyx automation policy.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Onyx-routed HIP-4 volume, all time | **$34,440.94** (2026-05-19 to 2026-07-19) | `api.llama.fi/summary/dexs/onyx-terminal-outcome`, fetched 2026-10-19 | H |
| Same, 24h / 7d / 30d | **$0 / $0 / $0** | same | H |
| Peak day | $5,059 on 2026-06-04; only 12 of 153 days above $1,000 | same, my read of the series | H |
| Share of all HL HIP-4 volume over the same 153 days | **0.015%** ($34.4k of $231.9M) | my computation from `hyperliquid-outcomes` series, same date | M |
| Onyx outcome builder fees, all time | $2.35 | `api.llama.fi/summary/fees/onyx-terminal-outcome` | H |
| Parent "Onyx Terminal" (spot + outcome children) volume, all time | $1,373,493.94; last non-zero day 2026-08-09; 30d `0` | `api.llama.fi/summary/dexs/onyx-terminal` | H |
| Parent fees, all time | $62,947.26 (peak $5,239 on 2026-05-30); 30d `0` | `api.llama.fi/summary/fees/onyx-terminal` | H |
| Underlying HL HIP-4 | $3.13M on 2026-10-18; $47.0M 30d; $261.1M all time | `api.llama.fi/summary/dexs/hyperliquid-outcomes`, 2026-10-19 | H |

Onyx has no standalone OI or TVL.

---

## 11. Event categories and overlap

Onyx lists no markets of its own. Anything it exposed is the HL HIP-4 catalogue: sports (largest), crypto price ladders, central-bank decisions, some stock/commodity templates (HIP-4 note section 11, M). Those overlap Polymarket, Kalshi, Limitless and others, but the arbitrage leg is **Hyperliquid**, not Onyx.

## 12. Shared liquidity

**Yes, 100%.** Same HyperCore books as every other HIP-4 front end (Outcome, Phantom, Based, PerpFlow, Omni Terminal and dozens of others, per the DefiLlama `*-outcome` entries in `factory/hyperliquid.ts`, H). Do not model Onyx as a leg. DefiLlama marks it `doublecounted: true`.

---

## 13. Adapter spec

- **No Onyx adapter.** One Hyperliquid HIP-4 adapter covers it. If attribution is wanted, tag fills by builder address; Onyx's (`0xb290...ac34a`) has been silent since 2026-08-19, so the tag would be empty today.
- Re-check cadence: none needed unless `app.onyx.live` stops redirecting. A cheap tripwire is a weekly `HEAD https://app.onyx.live/trade` and a DefiLlama `total30d` read.

---

## 14. Priority

**skip.** Dead or dormant front end (redirect, 3 months of zero outcome volume), no API, duplicate liquidity, $34k lifetime, no outcome docs, no terms. Confidence in the skip is high; confidence in the explanation for the shutdown is low (no press check possible).

---

## 15. NOT FOUND / open questions

- Why `app.onyx.live` redirects, and whether it is permanent (searched: homepage, docs, DNS; X feed returned 402 and WebSearch was exhausted).
- Whether Onyx's UI ever had an outcome-markets tab (docs silent; only builder-code volume suggests it).
- Whether the Onyx 0.05% builder fee applied to outcomes.
- Any Onyx terms of service or geo list.
- Any Onyx API or SDK.
- Whether the redirect is geo- or UA-conditional (observed from one edge only).

## 16. Suspicious content

None addressed to AI agents. Every gitbook page opens with a boilerplate line pointing to `llms.txt` (a benign index hint; I read the index but followed no instruction). DefiLlama's `/overview/derivatives` replied "Upgrade to the paid API plan"; I took no action on it. X returned 402; no payment made.

---

## 17. Sources

Primary (H):
- Marketing site: https://www.onyx.live/ (200); redirects of https://app.onyx.live/* (301 to https://app.hyperliquid.xyz/), 2026-10-19
- Docs index: https://tradewithonyx.gitbook.io/docs/llms.txt ; pages: `/onyx.md`, `/onyx/web-terminal.md`, `/onyx/fees.md`, `/onyx/funding-trading-account.md`, `/onyx/onyx-points.md`, `/others/official-links.md`, plus the trading and boosted-framework pages (no outcome content)
- DefiLlama API: https://api.llama.fi/protocol/onyx-terminal-outcome ; https://api.llama.fi/summary/dexs/onyx-terminal-outcome ; https://api.llama.fi/summary/fees/onyx-terminal-outcome ; https://api.llama.fi/summary/dexs/onyx-terminal ; https://api.llama.fi/summary/fees/onyx-terminal ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes
- DefiLlama adapter: `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (entries `onyx-perps`, `onyx-outcome`; builder-fills archive URL pattern)
- Hyperliquid stats archive HEAD probes: https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/ (see fixture)

Sibling notes in this repo (H for their own first-hand reads, M here):
- `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`
- `docs/research/venues/onyx-odds.md` (different company)

Secondary: none used. Not reached: x.com/Onyx_terminal (HTTP 402).
