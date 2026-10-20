# Purrdict (purrdict.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 02:40-02:50 UTC). READ-ONLY: page reads, `gh api` file reads, unauthenticated GETs to documented hosts, static JS of the public web app read as text (never executed). No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my inference/computation; **L** = weak or stale.

Method limits: WebSearch budget was exhausted (shared session limit), so no fresh news search; everything below is from direct fetches. Purrdict's own API host and the mute.sh API host were both down during my probes (section 4). The HyperCore read API (`POST /info`) is POST-only and was not called (ground rules); Hyperliquid mechanics are covered by the sibling note `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` and are reused here only where I re-verified them (tagged).

---

## 0. Bottom line

1. **Purrdict is a front-end and tooling brand on top of Hyperliquid HIP-4, not a venue with its own liquidity.** Its own text: "independent HIP-4 prediction-market interface on Hyperliquid", "not Hyperliquid and is not presented as the official HIP-4 frontend" (H, https://www.purrdict.xyz/ and https://www.purrdict.xyz/hip4/). The web app reads and trades straight against `api.hyperliquid.xyz` (H, static JS). Every Purrdict mainnet fill is a fill on the HyperCore outcome books that every other HIP-4 front-end shares. **It is not an independent arbitrage leg.**
2. **Its only mainnet product is the trading UI.** The permissionless Launchpad (deploy markets), the parlay escrow/relay and the pooled "be the house" vault are all **testnet only** (HyperEVM Testnet, chain 998) and explicitly "Not live" on mainnet (H, https://www.purrdict.xyz/launch-prediction-market/, /prediction-market-parlays/, /prediction-market-vault/, llms.txt "Last reviewed: August 4, 2026").
3. **Purrdict adds a fee and no data you cannot get from Hyperliquid.** The app attaches builder code `f=1000` (tenths of a bp = **1.00%**, the spot cap) to orders, which HL collects on sells (H, JS + HL docs). A direct HL integration pays none of that.
4. **Its public data API is down and its open dataset is stale.** `api.purrdict.xyz` returns HTTP 522; the CC BY snapshot repo was last updated 2026-08-03 (H).
5. **adapter_priority = skip.** Build the Hyperliquid HIP-4 adapter (P1 in the sibling note); do not build a Purrdict adapter. Reuse Purrdict only as a reference (open-source parsing of the `class:priceBinary|...` description strings) and as a tracker of "is this front-end still alive".

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| Marketing site served 2026-10-19; homepage lists four daily markets "for Oct 19, 2026, settling at 06:00 UTC", footer "(c) 2026 Purrdict Beta" (i.e. the static build is from 2026-10-18/19) | H (https://www.purrdict.xyz/) |
| `app.purrdict.xyz` returns HTTP 200, title "Purrdict Preview", labelled "Preview", sections Markets / Combos (Beta) / Earn, stake buttons $10/$25/$50/$100, "Sign in to trade"; the market list is client-rendered so I saw only "Loading market details" (no browser automation allowed) | H (shell) / unverified (order flow) |
| Underlying venue is live: Hyperliquid Outcomes daily volume $3.13M on 2026-10-18 (DefiLlama), see section 10 | H |
| `api.purrdict.xyz` (root and `/api/markets/overview`) HTTP 522 at 02:41Z and 02:45Z; the site's own data page says the 2026-10-18 build got "Snapshot unavailable: the public index returned no rows" | H (fixture `api_purrdict_xyz_overview_522_headers.txt`; https://www.purrdict.xyz/hip4-market-data/) |
| `api.mute.sh` (Purrdict-linked paid data API) returns Cloudflare 530/1033 at 02:44Z and 02:45Z | H |
| GitHub org `purrdict` created 2026-03-28; `hip4-skills` and `hip4-example` last pushed 2026-03-28 (pre-mainnet, testnet-default, still mention USDH); `hip4-market-data` last pushed 2026-08-03; `hip4-ui` last pushed 2026-08-29; npm `@purrdict/hip4` 0.2.0 published 2026-03-28 and never updated | H (`gh api users/purrdict/repos`, npm registry; >6 months old for skills/SDK: stale) |

Verdict: **still_live = true** as a front-end that exists and is served; low assurance on data services (API down, datasets and SDK stale).

---

## 2. Kind and market model

- **Kind (H):** broker/front-end plus developer platform for Hyperliquid HIP-4. Self-description: "interface, launchpad, data publisher, and developer platform" (https://www.purrdict.xyz/llms.txt). Company address in Prospera ZEDE, Roatan, Honduras (footer); legal entity not stated (NOT FOUND).
- **Deployer?** Not on mainnet. Launchpad: "currently a Hyperliquid Testnet feature"; requires >= 100 HYPE delegated, Standard account mode, one-time `activateOutcomeDeployer`, 2-4 char venue name; "does not hold a deployer key" (H, /launch-prediction-market/). No Purrdict mainnet deployer venue observed (M: the sibling note saw venue tag `out` live; hint lists `txyz`, `skew`; none is Purrdict).
- **Market model (H, https://www.purrdict.xyz/hip4/):** on HyperCore's central limit order book, not an AMM. Types: binary; multi-outcome (several binaries, one wins); recurring price binary (e.g. above target at set time); price bucket (mutually exclusive ranges). "Fully collateralized", winning shares settle at 1, losing at 0, "no separate claim button", no liquidation on standard outright positions.
- **Tokenisation (H, HL asset-ids doc via Purrdict's guide and hip4-skills README):** `encoding = 10*outcome + side` (side 0 Yes, 1 No); coin `#N` for books/prices, token `+N` for balances, order asset id `100_000_000 + N`. Yes/No share a merged book (Purrdict README: "Buying Yes at 0.65 automatically creates a mirrored No at 0.35").
- **Parlays (H, /prediction-market-parlays/):** a separate synthetic product. Taker picks legs; a relay asks registered market makers for signed RFQ quotes; both sides lock collateral in a Parlay escrow on **HyperEVM Testnet (chain 998)**; "Not live. Do not treat the current testnet system or indicative builder as a mainnet parlay product." Not an arbitrage instrument today.
- **Vault (H, /prediction-market-vault/):** pooled maker-side collateral for testnet parlays; testnet limits 80% utilisation, $50,000 per parlay, 64 live positions; "mainnet deposits are not live".
- **Other (H, homepage):** Quests (Season 1 points), a "10,000 USDC raffle", Sports page. These are incentives, not liquidity.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | Hyperliquid HyperCore (L1), not an EVM chain; outcomes are HyperCore spot-like tokens | H |
| Collateral | Mainnet quote token **USDC** ("current mainnet metadata labels USDC as the quote token"; legacy testnet fixtures may show USDH); the app also reads a USDH balance (legacy) | H (/hip4/, llms.txt, app JS) |
| Funding in | Via Hyperliquid's USDC deposit rail (Arbitrum) - see sibling note; the Purrdict app uses Privy login (embedded wallets / external wallets) and a MoonPay on-ramp host appears in the bundle | M (sibling note, app JS strings) |
| Parlay / vault chain | HyperEVM Testnet (chain 998), test USDC | H |
| Contracts | Parlay escrow address not published on the page (NOT FOUND) | - |

---

## 4. Read API

Purrdict-specific data APIs (all unusable for an aggregator right now):

| Surface | What it is | State |
|---|---|---|
| `GET https://api.purrdict.xyz/api/markets/overview` | live JSON of cumulative per-outcome-token stats (`coin, market_class, underlying, period, target_price, market_name, trades, traders, volume, avg_px`); cumulative only, no books, no prices | **HTTP 522 (down)** 2026-10-19 (H) |
| `github.com/purrdict/hip4-market-data` `latest/overview.json|csv|stats.json` | dated snapshots, CC BY 4.0 (README says so; GitHub license field shows NOASSERTION); README says a weekly Action refreshes it | last commit **2026-08-03** (stale 11 weeks) (H) |
| `https://api.mute.sh` (REST `/v1/markets/overview`, `/v1/markets/coin-labels`, SSE `/v1/activity/stream`, gRPC `grpc.mute.sh`) | commercial normalised HIP-4 data layer; `X-API-Key` header; anonymous/free 10 req/min and 1,000 req/month; paid Growth $1,100/mo, Scale $2,300/mo | **HTTP 530 (down)** 2026-10-19; docs https://mute-sh.gitbook.io/mute.sh/api (H for docs text via page summary = M) |
| `https://hip4.fun` | Purrdict-published reference + archive, snapshot dated 2026-08-04: "$403.82M indexed cumulative volume, 5.74M indexed fills, 1,830 outcome rows"; no API documented | stale (M, page summary) |

**Where an adapter must read instead:** Hyperliquid's keyless API - `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `settledOutcome`), `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `activeAssetCtx`, `allMids`, `outcomeMetaUpdates`). Rate limits: REST 1200 weight/min/IP; WS 1000 subscriptions/IP. Full detail in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (section 4), which I did not re-probe. Purrdict's own app does exactly this: it POSTs `outcomeMeta` and balances to `https://api.hyperliquid.xyz/info` and uses `wss://api.hyperliquid.xyz/ws` (H, app JS; fixture `app_bundle_config_extract.txt`).

Fixture sample shapes (all GET, unauthenticated): `hip4-market-data_latest_stats.json` (aggregate: 1,818 outcome-token rows, indexed notional $403,183,505, 5,723,936 fills, as of 2026-08-03T19:26Z, 76% rows "unclassified") and `hip4-market-data_overview_top25_trimmed.json` (top 25 of 1,818 rows).

**Caveat on the snapshot's "volume":** it counts Yes and No token rows separately, so it is about 2.2x DefiLlama's halved cumulative on the same date ($403.2M vs $181.1M to 2026-08-03; fixture `defillama_vs_purrdict_snapshot_check.json`) (M, my computation). It also covers the **whole protocol**, not Purrdict-routed trades. Do not use it as liquidity or as Purrdict's volume.

---

## 5. Trade path

- **Mechanism (H, app JS + HL docs):** the browser app signs Hyperliquid actions and POSTs them to Hyperliquid's `/exchange`. Flow: Privy sign-in -> `approveAgent` (user-signed EIP-712, domain `HyperliquidSignTransaction` v1, `chainId` = `signatureChainId`, `verifyingContract` zero address) -> `approveBuilderFee` with max fee `"1%"` (same domain) -> an **agent key held in the browser** signs L1 `order`/`cancel` actions (msgpack hash signed as EIP-712 domain `Exchange` v1 chainId 1337, `Agent{source, connectionId}`). Orders: `a = 100_000_000 + enc`, limit `tif` default `Gtc`, `grouping:"na"`, `builder:{b:<Purrdict builder addr>, f:1000}`, request sent with `isFrontend:true`.
- **Programmatic use of Purrdict as a service:** none. There is no Purrdict trading API; its "market data API" is mute.sh. Its agent skills (`purrdict/hip4-skills`, MIT; `hip4-trade` signs locally with `@nktkas/hyperliquid` + `viem` and expects `HIP4_PRIVATE_KEY` in the environment) are thin wrappers around Hyperliquid's API and default to testnet (H, README/SKILL.md, March 2026 = stale). Skill doc claims "min 20 shares"; the SDK README gives `minShares = ceil(10 / min(markPx, 1-markPx))` (i.e. about $10 minimum notional) (M/L: pre-mainnet; the sibling note found no official minimum).
- **Our integration should skip Purrdict entirely:** talk to Hyperliquid directly (agent wallet + `/exchange`), no builder code, no Purrdict dependency.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial, identical to native Hyperliquid, with no benefit from going through Purrdict.**

- There is no EVM transaction proposal that trades HIP-4 (H via sibling note and HL docs): orders are signed HyperCore actions. PayBox lists Hyperliquid only as `eip155:999` (HyperEVM) (docs/research/06-paybox-platform.md, H there).
- A PayBox EVM wallet could sign the one-time `approveAgent` / `approveBuilderFee` typed data via `request_wallet_sign` `typedData` (domains above, verified in Purrdict's bundle), after which a locally held agent key trades at speed. That key sits outside PayBox (M).
- Purrdict's UI needs a Privy login and an in-browser agent key: not automatable and no reason to use it.
- Purrdict parlays/vault live on HyperEVM testnet (998): irrelevant to a real-money PayBox wallet.
- No PayBox plugin for Purrdict or HIP-4 orders (sibling note, live `discover_plugins`, H there). I made no PayBox calls this session.

---

## 7. Fees

| Layer | Detail | Tag |
|---|---|---|
| Purrdict builder fee | App config: `NEXT_PUBLIC_BUILDER_FEE:"1000"`; HL docs: `f` is in tenths of a basis point (10 = 1 bp), spot cap 1% => 1000 = 100 bp = **1.00%**. User must approve max `"1%"`. Builder fees apply to the quote-asset side, i.e. **sells**, not buys. Whether it is also charged on settlement payout is NOT FOUND. The SDK README example uses 100 (0.1%), so the app value is Purrdict's own choice and can change on redeploy | H (JS, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes, /hip4-outcome-markets) |
| Hyperliquid outcome fee | "Outcome trading only charges fees when closing or settling... does not support rebates". The HIP-4 page still says "Fees are currently zero for outcome markets for initial testing" (undated, stale); numeric rate not in the fees page; sibling note's empirical all-in median is about 14.7 bp including builder fees | H (fees.md, hip4 page) / M (empirical) |
| Purrdict deposit/withdraw/trading fee disclosures | Not stated anywhere on purrdict.xyz or the app shell | NOT FOUND (searched: homepage, /about/, /hip4/, /compare/, /build/, /launch, parlay and vault pages, app shell) |
| Parlays / vault | no fee schedule published | NOT FOUND |

Practical consequence: a round trip through Purrdict costs up to about 1% extra on the exit leg versus the same trade placed directly on Hyperliquid. That alone can erase thin arbitrage edges.

---

## 8. Resolution mechanism and dispute risk

Purrdict resolves nothing. Resolution is whatever the Hyperliquid market uses (H, Purrdict's /launch page: "does not say who resolves a market"; /hip4/ "the resolution source and wording matter just as much as the final side"):

- Recurring protocol series: HyperCore mark-price based, auto-settled (e.g. daily 06:00 UTC); no oracle, no human.
- Template/deployer markets: validator-approved templates settled by the deployer, no trader dispute window, per the sibling note (M, with H primary quotes there: HL Terms disclaim "erroneous outcome determination and disputed settlements").
- Purrdict's risk page: "Thin markets can be wrong"; testnet permissions may differ from mainnet (H).

Arbitrage rule is unchanged from the sibling note: only protocol-settled recurring binaries are machine-checkable legs; compare rules text for everything else.

---

## 9. Geo, ToS, automation

- **Purrdict's own terms: NOT FOUND.** The app login says "By continuing, you agree to the Terms and Privacy Policy." but the text is not hyperlinked; `/terms`, `/privacy`, `/legal`, `/terms-of-use` return 404 on both `www.` and `app.purrdict.xyz` (H, my probes). No geo-block text on the homepage, /about/, /hip4/ or the app shell. Robots.txt allows AI crawlers; no automation rules stated.
- **Governing rules are Hyperliquid's** (H, re-read 2026-10-19 in https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js, "Last updated on June 15, 2026"): Interface unavailable to residents/entities of "the United States of America or Ontario, Canada" and sanctioned jurisdictions; clause 1.7 "outcome markets accessible via the Interface are not available to 'Excluded Persons'" (jurisdictions "that we designate from time to time" - list not published); 1.8 permits technical blocking of the outcome-markets tab and forbids circumvention; 3.1.8 bans automated use "in ways that exceed reasonable usage, bypass rate limits...". Whether these bind a third-party front-end or direct API use is a legal question I did not resolve.
- Purrdict is incorporated/located in Honduras (Prospera) per footer (H); its own user-eligibility rules are unknown.

---

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Purrdict-routed volume | **NOT FOUND**. No DefiLlama line (1,557 DEX/interface protocols scanned, none contains "purrdict"; other interfaces do have lines, e.g. Outcome.xyz Outcome 24h $5.29M / all-time $153.4M, Liquidiction Outcome 24h $0.41M, Tradoor Outcome all-time $10.8M); the builder-fill files `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<lowercase builder addr>/<YYYYMMDD>.csv.lz4` returned 403 (S3) for 2026-10-16..18; mute.sh down | https://api.llama.fi/overview/dexs fetched 2026-10-19 | H (absence) |
| Underlying protocol volume (shared with Purrdict) | 2026-10-18 **$3.13M**; 7d $17.9M; 30d $47.0M; all-time $261.1M (halved: each trade counted once) | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19 | H |
| Underlying collateral locked / books | about $2.7M open interest proxy, a few dozen liquid books of about 334 outcomes | sibling note, WS sweep 2026-10-19 01:31Z | M |
| Purrdict dataset | $403.18M indexed notional, 5.72M fills, 1,818 outcome-token rows as of 2026-08-03 (double-counts Yes/No, see section 4) | hip4-market-data stats.json | H (figure) / L (as liquidity) |
| Top rows as of 2026-08-03 | Soccer World Cup winner outcomes dominate (Argentina, Spain, France, Portugal; each Yes token $3.7M-$10.4M cumulative), then BTC daily recurring binaries ($3.4M-$3.5M per row) | overview top-25 fixture | H (data) |

---

## 11. Event categories and cross-venue overlap

Same as Hyperliquid HIP-4 (Purrdict lists "crypto prices, sports, and politics" and "Sports" and "Combos" pages, H homepage; politics markets on HL are NOT verified here - searched: homepage text only).

| Category | Evidence | Overlaps | Arb quality |
|---|---|---|---|
| Crypto price (BTC/HYPE daily and 15-minute binaries/buckets) | Purrdict homepage lists four daily markets settling 2026-10-19 06:00 UTC (H); fixture rows `priceBinary` BTC 1d | Polymarket, Kalshi, Limitless, Predict.fun, Opinion | highest; align expiry and reference price (HL mark vs spot index) |
| Sports futures (World Cup winner, others) | top-volume rows in the Aug snapshot (H) | Polymarket, Kalshi, SX Bet | good for outrights |
| Macro/politics | not verified for Purrdict | - | unknown |

---

## 12. Shared liquidity?

**Yes, fully.** Purrdict has no book of its own. All Purrdict mainnet orders hit the single HyperCore outcome books also used by Hyperliquid's own UI, Outcome.xyz, Liquidiction and the other builder-code front-ends; DefiLlama books those front-ends as separate "Interface" lines that are attribution slices of the same fills (M, adapter comment + methodology). **Not an independent arbitrage leg**; double counting risk if both "Hyperliquid" and "Purrdict" were registered as venues. In the platform registry, model Purrdict (if at all) as a *route* to venue `hyperliquid-outcomes`, with `builder_fee_bps=100`.

---

## 13. Adapter spec (if anything)

- Do **not** create a `purrdict` venue adapter. Implement `hyperliquid-outcomes` per the sibling note. Rate limits, dedupe of `trades` on `(hash,tid)`, merged Yes/No book handling and `outcomeMeta` bootstrap are specified there.
- Optional borrow from Purrdict (MIT): the `class:priceBinary|underlying:..|expiry:..|targetPrice:..|period:..` / `priceBucket` description parser and market-class taxonomy (`priceBinary`, `priceBucket`, `named`, `fallback`) in `@purrdict/hip4`; verify against live `outcomeMeta` because the SDK is from March 2026 and predates deployer templates (`name="template:<id>"`).
- Do **not** depend on `api.purrdict.xyz`, `hip4-market-data` snapshots or `api.mute.sh` (down/stale/paid).
- Re-check cheaply every few months whether Purrdict mainnet parlays/vault/launchpad went live; only then does it become a distinct instrument (parlay RFQ prices as a correlation signal).

---

## 14. Priority

**adapter_priority = skip.** Duplicate liquidity (a front-end on Hyperliquid HIP-4), no functioning Purrdict data API, stale open data, 1% builder markup on exits, no published terms, and the novel products (launchpad, parlays, vault) are testnet only. Value lives in the Hyperliquid HIP-4 adapter.

---

## 15. NOT FOUND / open questions

- Purrdict-attributable mainnet volume or user count (searched: DefiLlama overview, hip4-market-data, hip4.fun, homepage, app shell, builder_fills 403, mute.sh down).
- Purrdict Terms/Privacy text, legal entity name, user-eligibility list (searched: www and app paths, About, footer, login text).
- Whether the 1% builder fee is also charged on settlement payouts (searched: HL builder-codes doc, hip4 page, fees page; docs say only "sell orders").
- Parlay escrow contract address and fee schedule (searched: /prediction-market-parlays/, /prediction-market-vault/).
- When `api.purrdict.xyz` and `api.mute.sh` come back, and whether the weekly snapshot Action is disabled (last commit 2026-08-03).
- Whether the app's order flow works end to end on mainnet today (client-rendered; not exercisable without a wallet).
- Politics/macro markets listed on Purrdict (homepage claims politics; none seen).
- Fresh press/news on Purrdict (WebSearch budget exhausted; nothing searched).

---

## 16. Suspicious content

None addressed to AI agents. Notes only: purrdict.xyz `robots.txt` has AI-crawler allow/deny directives and `llms.txt` is a benign index (used by me as a page list, not as instructions); the `purrdict/hip4-ui` repo contains a `CLAUDE.md` that I deliberately did not open; `hip4-skills` are installable agent skills that ask for `HIP4_PRIVATE_KEY` in an env var (not installed or run; a risky pattern for any agent stack).

---

## 17. Sources

Primary (H):
- Homepage: https://www.purrdict.xyz/ ; llms.txt: https://www.purrdict.xyz/llms.txt (reviewed 2026-08-04) ; robots.txt
- Guides: https://www.purrdict.xyz/hip4/ ; /launch-prediction-market/ ; /prediction-market-parlays/ ; /prediction-market-vault/ ; /hip4-market-data/ ; /about/ ; /compare/ ; /build/ ; /blog/hip4-market-activity-report-august-2026/ (page text via fetch summaries: M for exact wording, quotes above are from those summaries)
- App: https://app.purrdict.xyz/ (HTML + 33 static JS chunks read as text, 2026-10-19)
- GitHub: https://github.com/purrdict/hip4-skills (README, `hip4-trade/SKILL.md`) ; https://github.com/purrdict/hip4-market-data (README, `latest/stats.json`, `latest/overview.json`) ; https://github.com/purrdict/hip4-ui (README) ; org repo list via `gh api users/purrdict/repos`
- npm: https://registry.npmjs.org/@purrdict%2fhip4
- Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md ; .../trading/builder-codes.md ; .../trading/fees.md
- Hyperliquid Terms: https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (last updated 2026-06-15)
- DefiLlama: https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; https://api.llama.fi/overview/dexs ; adapter `gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts`
- mute.sh: https://mute.sh ; https://mute-sh.gitbook.io/mute.sh/api (page summaries: M)
- hip4.fun: https://hip4.fun (summary: M)
- Probes: `api.purrdict.xyz` 522, `api.mute.sh` 530/1033, `stats-data.hyperliquid.xyz/Mainnet/builder_fills/...` 403, `www|app.purrdict.xyz/{terms,privacy,legal}` 404

Project notes (M, leads re-verified where tagged): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` ; `docs/research/06-paybox-platform.md`

Fixtures (`docs/research/fixtures/purrdict/`): `hip4-market-data_latest_stats.json`, `hip4-market-data_overview_top25_trimmed.json`, `api_purrdict_xyz_overview_522_headers.txt`, `app_bundle_config_extract.txt`, `npm_purrdict_hip4_meta_trimmed.json`, `defillama_vs_purrdict_snapshot_check.json`.

## 18. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1`. No contact address, name, email or home path was sent to any service or written to these notes or fixtures; fixtures were grepped for `@` (only the npm scope `@purrdict/...` and `@nktkas/...` appear) and for the user's name (no hits). The one wallet-like address in the fixtures (`0x000000000a84...B659`) is Purrdict's public builder address taken from its public JS bundle, not a user address. No user wallet address was read or written.
