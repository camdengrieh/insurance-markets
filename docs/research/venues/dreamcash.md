# Dreamcash - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page and docs reads, `gh api` raw file reads, unauthenticated GETs to documented hosts (DefiLlama API, dreamcash.xyz, docs.dreamcash.xyz, trade.dreamcash.xyz static HTML and JS). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data. No search budget remained after the first search, so no further news searches were run.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own inference/arithmetic; **L** = weak or stale.

---

## 0. Bottom line

1. **Dreamcash is a live Hyperliquid front end, not a prediction market.** It is a self-custodial mobile/web trading app (operator Supreme Liquid Labs, Cayman) whose core products are Hyperliquid perps, spot and (until July) HIP-3 markets. (H)
2. **Its "outcome markets" are Hyperliquid HIP-4 outcomes viewed through its UI.** Order book, liquidity, settlement and fees live on HyperCore. Dreamcash only adds a builder-code fee and a UI. There is no Dreamcash-owned book, API or contract. (H: Terms of Use and how-it-works page.)
3. **It is not an independent arbitrage leg.** Every Dreamcash outcome fill lands on the same HIP-4 books as every other front end. Model it as an *attribution tag* on the Hyperliquid HIP-4 pool, not a venue. (H)
4. **Volume through Dreamcash's builder code is trivial:** DefiLlama "Dreamcash Outcome" = $1,198 over 30 days and $12,480 all-time (since 2026-05-05), against $47.0M (30d) and $261.1M (all-time) for Hyperliquid Outcomes as a whole (about 0.003% and 0.005%). (H, DefiLlama API, fetched 2026-10-19; share is my arithmetic.)
5. **adapter_priority = skip** for Dreamcash as a venue. Build the Hyperliquid HIP-4 adapter (spec: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`) and, if wanted, carry `builder_label: "dreamcash"` as metadata only.
6. The discovery hint "Dreamcash Markets lists outcome-market access" is **wrong**: that DefiLlama row is the retired HIP-3 CASH perps deployer. Only "Dreamcash Outcome" refers to outcomes. (H, section 1.)

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://www.dreamcash.xyz/` and `https://trade.dreamcash.xyz/` return HTTP 200 on 2026-10-19; the home page copy reads "Crypto. Stocks. Commodities. Forex. Prediction markets." | H |
| iOS App Store listing shows version 2.14.0 released "6d ago" at capture (2.12.1 Sep 16, 2.11.1 Aug 10, 2.9.0 Jul 8 "Mirror" copy-trading, 2.6.0 May 13 Vaults) - an actively shipped app. The listing text never mentions prediction or outcome markets. https://apps.apple.com/app/id6748916424 | M (WebFetch summary) |
| Terms of Use "Last Updated: 1 July 2026" contain dedicated Outcome Markets clauses (section 9). https://www.dreamcash.xyz/terms-of-use | H |
| DefiLlama `dreamcash` (parent): 24h volume $2,379, 30d $92.5K, all-time $26.4M; fees 30d $30.4K, all-time $3.58M (api.llama.fi/summary/dexs/dreamcash and /summary/fees/dreamcash, 2026-10-19). The parent's volume figure is almost all spot (`dreamcash-spot` 30d $91.3K); perps builder revenue shows in fees but not in this volume number (M, inference). | H |
| `dreamcash-markets` (HIP-3 deployer dex "cash", Tether-backed USDT0 perps launched 2026-01-20) is **dead**: DefiLlama adapter marks `deadFrom: "2026-07-03"` with the comment that Dreamcash "kept its main frontend but retired the CASH HIP-3 market once USDC became the dominant Hyperliquid quote asset. Last fees 2026-07-02." `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` | H |
| Press: Feb 2026 coverage of Tether investing in Dreamcash and the CASH RWA perps; a 2026-06-26 report of the phased CASH shutdown. Seen only as search-result titles/snippets (search budget then ran out). https://www.theblock.co/news/defi/2026-02-13-tether-invests-in-hyperliquid-frontend-dreamcash-offering-perps-markets-for-tsla-gold-and-more-using-usdt0-collateral-389916 , https://www.cryptotimes.io/2026/06/26/tether-backed-dreamcash-cuts-cash-markets-amid-hyperliquid-usdc-surge/ | L |
| Web app (trade.dreamcash.xyz) server-renders an "outcome metas v2" query with 231 entries, dehydrated at 2026-10-18T06:30:03Z (about a day before my fetch, so a cached render). Proves the web app has outcome-market plumbing; the mobile apps' outcome UI is unconfirmed. Fixture `web_app_outcome_metas_sample.json`. | H (data) / M (inference about UI) |
| DefiLlama "Dreamcash Outcome": listed on DefiLlama 2026-10-08 (that is the listing date, not a launch date); builder adapter start 2026-05-02 (= HIP-4 mainnet launch); non-zero volume on 59 of 167 days 2026-05-05..2026-10-18; last big day 2026-10-17 ($950); latest day (10-18) $0. | H |

Verdict: **still_live = true** for the Dreamcash front end; its outcome-market access is real but near-idle.

---

## 2. Kind and market model

- **Kind (H):** broker / front end ("frontend product acting as an interface layer", Terms). "Dreamcash is not the counterparty to user trades" and "balances stay on Hyperliquid" (how-it-works). https://www.dreamcash.xyz/how-dreamcash-works , https://www.dreamcash.xyz/terms-of-use
- **Market model:** whatever Hyperliquid HIP-4 provides - fully collateralised binary outcomes on a native CLOB with a merged Yes/No book, plus multi-outcome "questions" (one book per outcome with a fallback outcome). Full model, unit and settlement details are in the sibling note (H there; not re-verified here): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`.
- **Tokenisation seen in Dreamcash's own data (H, fixture):** outcome id 12722 -> `yesCoin "#127220"`, `noCoin "#127221"`, i.e. `#<10*outcome+side>`, side 0 = Yes, 1 = No. Sides can be templated (`{shortNameA}`/`{shortNameB}` for "Sports contest winner"). The app surfaces the **whole Hyperliquid outcome universe** (21 questions + 210 standalone = 231 entries at 2026-10-18T06:30Z), not a curated subset (M: inferred from ids and names matching Hyperliquid's).
- Dreamcash adds **no market of its own** (no creation, no resolution, no custom tokens). (H, Terms: SLL "does not create, sponsor, operate, administer, or resolve any Outcome Market".)

---

## 3. Chains and collateral

- **Chain (H):** Hyperliquid L1 / HyperCore. Dreamcash names no other chain. Deposit/withdraw is "crypto or card/Apple Pay/Google Pay" through third-party on-ramps (MoonPay, Helio visible in the app's API paths; M).
- **Collateral for outcomes:** not stated on any Dreamcash page (Collateral and margin page covers perps only and says only "your stablecoin of choice"). Per the Hyperliquid note, HIP-4 quote token is **USDC** since the USDH sunset (H there / M here). iOS 2.7.0 notes say stablecoin swaps (USDH/USDE/USDT/USDC) happen automatically in the background (M).
- Wallet: email login creates a Privy wallet; users can import/export keys or connect MetaMask, Rabby or WalletConnect (H, docs "How to trade on Dreamcash"). Self-custodial: "wallet signs each trade on your device".

---

## 4. Read API

- **Dreamcash-specific read API: none (H).** The Developers page (`/build`) documents only how to place orders via Hyperliquid's `POST https://api.hyperliquid.xyz/exchange` with Dreamcash's builder code. No market-data endpoint, no WebSocket, no SDK, no rate limits are published by Dreamcash. docs.dreamcash.xyz (GitBook, `llms.txt` index of 19 pages) contains **no** API, outcome or HIP-4 page. https://www.dreamcash.xyz/build , https://docs.dreamcash.xyz/llms.txt
- `api.dreamcash.xyz` exists (found in the public JS bundle: `/api/user/me`, `/api/geo/status`, `/api/v2/points/*`, `/api/favorite/*`, `/api/vault/*`, `/api/moonpay/*`, `/api/funding/helio/*`) but is an **undocumented, account-oriented backend** (points, funding, geo, favourites). It is not a market-data API and I did not call it. (M, JS string search)
- **For data, use Hyperliquid directly:** `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `settledOutcome`) and `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`). Docs, rate limits (REST 1200 weight/min/IP, WS 1000 subscriptions) and live shapes are in the sibling note. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
- Attribution of Dreamcash-routed flow is only visible via the builder address on fills; the public aggregate is DefiLlama `GET https://api.llama.fi/summary/dexs/dreamcash-outcome?dataType=dailyVolume` (H, keyless, shape in fixture `defillama_dreamcash-outcome_trimmed.json`).
- **Verified shapes this session (GET only):**
  - DefiLlama summary above -> `{name, category:"Interface", chains:["Hyperliquid L1"], methodology{Volume,NotionalVolume,Fees,Revenue,ProtocolRevenue}, total24h, total7d, total30d, totalAllTime, totalDataChart:[[unix_day, usd],...]}`.
  - `https://trade.dreamcash.xyz/` HTML carries Next.js `dehydratedState.queries[]` with keys `perps metas v17`, `spot metas v24`, `outcome metas v2` (list of `{kind:"question"|"standalone", question|outcome:{id,name,description,yesCoin,noCoin,sides[],...}}`). This is an app-internal cache, scraping it is not a supported interface and is hit by the Terms' anti-automation clause; do not build on it. Sample only, in `web_app_outcome_metas_sample.json`.
- **Not available:** Hyperliquid `/info` is POST-only (previous finding: `GET /info` -> 405). POST is outside this task's ground rules, so no live outcomeMeta/l2Book was captured for this note.

---

## 5. Trade path

- **Programmatic: only via Hyperliquid, not Dreamcash (H).** Dreamcash's own recipe: signed `order` action to `POST https://api.hyperliquid.xyz/exchange`, with `builder: {b: "<Dreamcash builder address>", f: <fee>}` in the action; fields `a` (asset id), `b`, `p`, `s`, `t.limit.tif` (Gtc/Alo/Ioc), `c`, `nonce`, `signature`; "you generate the signature with your own signing logic". https://www.dreamcash.xyz/build . For outcome orders `a = 100_000_000 + 10*outcome + side` (Hyperliquid asset-ids page, per sibling note).
- Dreamcash's public builder address (also in the Fees page): `0x4950994884602d1b6c6d96e4fe30f58205c39395`. Using it requires the trader to pre-approve a max builder fee (`approveBuilderFee`) and sends 2-4.5 bps to Supreme Liquid Labs for XP rewards. **An aggregator has no reason to use it** (it only adds cost). (H for address/fee; M for the approval mechanics, from the Hyperliquid builder-code docs)
- No Dreamcash order API, no sandbox, no API keys.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial - identical to Hyperliquid HIP-4, with no extra benefit from Dreamcash.**

1. Trading is signed HyperCore actions (EIP-712 over a msgpack "phantom agent" hash), not EVM transaction proposals. PayBox lists Hyperliquid only as HyperEVM (`eip155:999`); outcomes trade on HyperCore. (M, from sibling note, which read PayBox docs and the `hyperliquid` plugin contract, three read-only tools)
2. A PayBox EVM wallet could sign `approveAgent`/orders via `request_wallet_sign` (`typedData` or `raw`), and fund HyperCore with USDC via Arbitrum (sibling note). All of this is the same with or without Dreamcash.
3. Dreamcash's app itself needs its own Privy wallet or an imported/WalletConnect wallet; driving it through PayBox would be a UI path, not an API path, and automated access to the UI is prohibited (section 9).

---

## 7. Fees

- **Dreamcash builder fee (H, https://docs.dreamcash.xyz/trading/fees.md and Terms):** "For transactions conducted through Dreamcash's mobile app, a fee of 0.045% is applied"; web app 0.025%. The /build page says builder `f` must be 0.02% or 0.045% to earn Season XP (0.5 or 1 XP per $ traded). Terms: "SLL applies a builder-code service fee to each blockchain transaction initiated through Dreamcash." Paid by the trader, on top of Hyperliquid's own fees. The fee pages do **not** say whether it applies to outcome trades (NOT FOUND for outcomes specifically).
- **Observed (M, my arithmetic):** DefiLlama Dreamcash Outcome fees all-time $2.81 on volume $12,480 = 0.0225%, which equals 0.045% on half the volume. That fits a 0.045% builder fee charged on outcome *sells* only (DefiLlama's adapter text and the HIP-4 page both say builders earn on sells).
- **Hyperliquid's own outcome fee:** see sibling note (charged on close/settle only; numeric rate not in official docs; "no outcome fee before 2026-08-15" per DefiLlama).
- Fee schedule on the Fees page (taker 0.0090%->0.0048%, maker 0.0030%->0.0000%, HYPE-stake discounts 5-40%) is Hyperliquid's perps-style schedule restated; applicability to outcomes unknown. (H page, M relevance)

---

## 8. Resolution mechanism and dispute risk

- Entirely Hyperliquid's: deployer-settled templates and protocol-recurring markets with no trader dispute window for most markets (sibling note: about 98% of open markets are deployer-settled, M). Dreamcash says it "does not determine, verify, or guarantee the accuracy, timeliness, or finality of any outcome or resolution source" and users "may lose their entire stake regardless of the actual outcome" (H, Terms).
- Dreamcash adds no dispute channel. Dispute risk = HIP-4 deployer risk.

---

## 9. Geo, ToS and automation

- **Operator and law (H):** Supreme Liquid Labs, Cayman Islands; Cayman law, LCIA arbitration. https://www.dreamcash.xyz/terms-of-use (Last Updated 1 July 2026)
- **General exclusions (H):** sanctioned jurisdictions; residents of the Cayman Islands and the UK; FAQ lists GB, IR, CU, KP as app-wide blocks and says HIP-3 is blocked in the US.
- **Outcome Markets (H):** access "is further restricted ... from certain jurisdictions where the offer or use of event-based or prediction-market products may be restricted ... as determined by SLL in its sole discretion (together with the United States and Canada 'Restricted Territories')". The list is unpublished, changes "without prior notice", and IP geoblocking is used. So a US/Canada operator cannot use Dreamcash's outcome UI; the underlying Hyperliquid terms have their own (US/Ontario + unpublished) exclusion (sibling note).
- **Automation (H):** Terms prohibit "any robot, spider, or other automatic device, process or means to access Dreamcash for any purpose, including monitoring or copying any of the material on Dreamcash". The only sanctioned programmatic path is Hyperliquid's own API with the builder code (the /build page). No Dreamcash API terms exist.
- Fixture `terms_of_use_excerpts.txt` holds the quoted clauses.

---

## 10. Liquidity (all DefiLlama, fetched 2026-10-19, data to 2026-10-18)

| Metric | Value | Tag |
|---|---|---|
| Dreamcash Outcome volume 24h / 7d / 30d / all-time | $0 / $1,003 / $1,198 / $12,480 | H |
| Dreamcash Outcome fees all-time | $2.81 | H |
| Largest day | $1,936 on 2026-07-19 | H |
| Hyperliquid Outcomes (whole pool) 24h / 7d / 30d / all-time | $3.13M / $17.9M / $47.0M / $261.1M | H |
| Dreamcash share of pool, 30d / all-time | about 0.003% / 0.005% | M (division) |
| Dreamcash parent (all products) 30d volume / fees | $92.5K / $30.4K | H |
| Book depth, OI, TVL attributable to Dreamcash | none exists; liquidity is the shared HIP-4 book | H |

---

## 11. Event categories (what the Dreamcash UI exposes = the HIP-4 universe)

From the 231 entries in the web-app state at 2026-10-18T06:30Z (name heuristic, M; fixture has counts): price thresholds/touches about 127 (BTC, ETH, HYPE, ZEC, GOLD, CL oil, S&P 500, XYZ100 index and single stocks like META, INTC, IBM, BX), sports about 88 (contest result/winner/spread/total, tournament winners), company events about 13 (e.g. IPO confirmed), macro policy-rate 2 (Fed October 2026 FOMC decision, two duplicate questions), awards 1. Politics: none seen.

Overlap with other venues (where arbitrage exists): crypto price up/down and thresholds (Polymarket, Predict.fun, Limitless, Kalshi), FOMC decision (Kalshi, Polymarket), sports (Polymarket, Kalshi, SX Bet). But all of it sits in the Hyperliquid pool; the leg to scan is HIP-4 itself.

---

## 12. Shared liquidity

**Fully shared with Hyperliquid HIP-4 (H).** Other front ends on the same books: DefiLlama lists about 35 "X Outcome" interface rows (Phantom, Nansen, Outcome.xyz, Dexly, etc., per the project's platform-registry notes) and the adapter factory above maps them all to builder-code attribution. Treat Dreamcash, Phantom, Outcome.xyz, etc. as one pool `hyperliquid-outcomes` with `front_ends[]`. **Not independent.**

---

## 13. Adapter recommendation

- **adapter_priority: skip.** No independent liquidity, no Dreamcash API, trivial attributed volume, anti-automation ToS for the UI, and US/Canada barred from its outcome UI.
- Do instead: one Hyperliquid HIP-4 adapter (P1 per the sibling note); in the platform registry add Dreamcash as `kind: front_end`, `routes_to: hyperliquid-outcomes`, `status: live`, `outcome_volume_30d_usd: 1198`, `builder_address` (public) and `builder_fee_bps: 4.5 mobile / 2.5 web`.
- Optional signal: DefiLlama `dreamcash-outcome` daily volume is useless as a signal (about 59 non-zero days, under $2K per day).
- Revisit only if Dreamcash ships its own outcome deployer venue (a HIP-4 `venue` tag of its own); that would be new, independent-contract liquidity. NOT FOUND so far (searched: docs.dreamcash.xyz llms.txt, Terms, /build, web app state).

---

## 14. NOT FOUND (searched)

- Any Dreamcash page, doc, FAQ or app-store text that describes outcome/prediction markets as a product (searched: dreamcash.xyz home, /build, /how-dreamcash-works, docs.dreamcash.xyz llms.txt + Fees/FAQ/How-to-trade/Collateral/XP/Risk pages, iOS listing). Only the Terms and the web-app state show it.
- Dreamcash builder fee specifically on outcome trades (searched: Fees page, /build, Terms).
- Outcome collateral statement on Dreamcash pages (searched: Collateral and margin page).
- Official API, WebSocket, SDK or rate limits from Dreamcash (searched: docs, /build, home).
- Whether mobile apps expose outcome markets (Google Play listing could not be read; iOS text silent).
- Dreamcash GitHub organisation or contracts: none referenced anywhere on the site or docs.
- Live Hyperliquid outcomeMeta/l2Book response shapes via GET (POST-only; forbidden by ground rules).
- Press that ties Dreamcash to HIP-4 (one search, then budget exhausted; the only hit described HIP-4 generally).

---

## 15. Suspicious content (recorded, not followed)

- `https://docs.dreamcash.xyz/llms.txt` and every GitBook `.md` page end with an "Agent Instructions" block telling agents to query `GET https://docs.dreamcash.xyz/index.md?ask=<question>&goal=<user_goal>`. It is standard GitBook boilerplate, not malicious, but it is text aimed at AI agents; I did not use the ask interface. (A WebFetch sub-summary also reported ignoring it.)
- The web-app JS bundle contains unrelated third-party wallet-SDK code (strings for a "prediction-markets-ws.bitkeep.*" feed). Not followed or called.

---

## 16. Sources

Primary (H unless noted):
- https://www.dreamcash.xyz/ (home; HTML read directly)
- https://www.dreamcash.xyz/terms-of-use (read directly; Last Updated 1 July 2026)
- https://www.dreamcash.xyz/build (WebFetch summary, M-H)
- https://www.dreamcash.xyz/how-dreamcash-works (WebFetch summary, M-H)
- https://docs.dreamcash.xyz/llms.txt (read directly) and `.md` pages: `trading/fees`, `support/frequently-asked-questions-faqs`, `getting-started/how-to-trade-on-dreamcash`, `getting-started/funding-your-account/collateral-and-margin`, `season-1/earning-xp`, `risk-disclosures-and-legal-disclaimers/risk-disclosures-and-legal-disclaimers` (WebFetch summaries, M-H)
- https://trade.dreamcash.xyz/ (HTML + public JS chunks read as text, not executed)
- https://apps.apple.com/app/id6748916424 (WebFetch summary, M)
- https://api.llama.fi/protocols (rows `dreamcash-interface`, `-markets`, `-spot`, `-outcome`, parent `parent#dreamcash`)
- https://api.llama.fi/summary/dexs/dreamcash-outcome , /dreamcash-spot , /dreamcash , /hyperliquid-outcomes ; https://api.llama.fi/summary/fees/dreamcash-outcome , /dreamcash , /dreamcash-markets
- `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts` (builder address, `dreamcash-markets` deadFrom 2026-07-03, `dreamcash-outcome` start 2026-05-02)
- Sibling notes (H there, relied on here as M): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/09-venues-onchain-clob.md` section 2.6, `docs/research/platform-registry` claims in `docs/platform-registry-design.md`.
- Search results (titles/snippets only, L): The Block 2026-02-13 (Tether invests in Dreamcash), CryptoTimes 2026-06-26 (CASH markets cut), Oak Research HIP-4 explainer (undated here).
- Google Play listing: unreadable (page truncated).

Staleness: all Dreamcash sources are 2026-06/07 or later except the Feb 2026 press piece (about 8 months old, flagged L).

## 17. Fixtures (`docs/research/fixtures/dreamcash/`)

- `defillama_dreamcash-outcome_trimmed.json` - DefiLlama summary, scalars + methodology + last 45 daily points (GET, keyless).
- `web_app_outcome_metas_sample.json` - trimmed, normalised sample of the `outcome metas v2` query from the trade.dreamcash.xyz HTML (6 questions, 12 standalone, category counts). Internal cache format; sample only.
- `defillama_adapter_dreamcash_excerpt.txt` - lines from DefiLlama's factory showing builder address, HIP-3 retirement and outcome start.
- `terms_of_use_excerpts.txt` - short quoted clauses (builder fee, Outcome Markets, Restricted Territories, automation).

## 18. Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1`. The one script I wrote (`mkfix.py`) and all saved fixtures were grepped for `@`; no hits. No personal identifiers appear in any request or file. The builder address above is Dreamcash's public project address, not a user wallet.
