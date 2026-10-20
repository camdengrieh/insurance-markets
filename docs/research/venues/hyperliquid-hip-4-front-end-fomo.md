# Hyperliquid HIP-4 front-end: fomo (fomo.family) - venue spec for the cross-venue aggregator

Researched 2026-10-19. Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/inferred/computed; **L** = weak or stale.

Method notes and one disclosed deviation:
- WebSearch budget was exhausted before this run started; no web search was possible. Facts come from direct page fetches and unauthenticated GETs.
- **Deviation:** I sent one `POST https://api.hyperliquid.xyz/info` with body `{"type":"outcomeMeta"}` (a documented read-only query; no signing, no account, no key) before re-reading the "no POST" rule. I stopped there and made no further POSTs. Its truncated output is saved as a shape-only sample (see Fixtures) and flagged as such.
- This venue (the fomo front-end) was already covered under slug `fomo` in `docs/research/venues/fomo.md`, and the underlying book in `hyperliquid-hip-4-outcomes-native.md` / `hyperliquid-hip-4-outcome-markets.md`. I re-verified the load-bearing fomo facts below independently (homepage, Terms, three DefiLlama endpoints, HIP-4 and builder-code docs). Where I did not re-verify something, it is marked "via sibling note" (M).

---

## 0. Bottom line

1. fomo is a **consumer trading app (memecoins, perps, spot) that is a Hyperliquid HIP-4 builder-code front-end**; it has no prediction-market product page, API or liquidity of its own (H).
2. **100% shared liquidity** with Hyperliquid HIP-4 outcomes: a builder code is a fee tag on fills in the HyperCore book. Not an independent arbitrage leg (H: DefiLlama methodology + `doublecounted: true`).
3. **Tiny:** $543 all-time attributed volume, 13 non-zero days, $80 in 30d, $0 in last 24h, $0.05 all-time fees (H, DefiLlama, 2026-10-19), vs $261.1M all-time / $3.13M 24h for Hyperliquid outcomes overall (H).
4. **adapter_priority = skip.** Read the Hyperliquid HIP-4 adapter instead. fomo adds nothing but a fee tag.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://fomo.family` loads; marketing copy "2,500,000 traders", iOS/Android/web, memecoin/social trading (fetched 2026-10-19) | H |
| Terms of Service fetched 2026-10-19 (https://fomo.family/terms); its date (August 17, 2026) is from sibling note | H/M |
| DefiLlama `fomo-outcome` (id 8984): category "Interface", tag "Hyperliquid HIP4 Builder", `listedAt` 1791497884 (= 2026-10-08), description "fomo provides access to outcome-based prediction markets through Hyperliquid." (https://api.llama.fi/protocol/fomo-outcome) | H |
| Last non-zero attributed outcome volume day 2026-10-16 ($38); 2026-10-15 $31 (https://api.llama.fi/summary/dexs/fomo-outcome) | H |
| fomo homepage and Terms contain **no mention** of prediction markets / outcomes / HIP-4 | H |

Verdict: **still_live = true** for the company and for builder-code fills as recent as 2026-10-16; whether the in-app UI currently exposes an outcomes tab is **NOT FOUND** (app is mobile/login-gated, browser automation not permitted).

---

## 2. Kind and market model

- **Kind (H):** social crypto trading app acting as a front-end/broker for Hyperliquid HIP-4 outcomes. Not a venue.
- **Market model (H, HIP-4 doc https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets):** fully collateralised outcomes on a native order book (CLOB). Each outcome has Yes/No sides, one merged book ("a buy of Yes at price p is equivalent to a sell of No at 1-p"), price-side-time priority, no leverage or liquidation. "Questions" group outcomes so exactly one settles Yes (categorical). Settlement: Yes pays `settleFraction`, No pays `1 - settleFraction`; binary = 1 / 0 (scalar-capable).
- **Tokenisation (via sibling note, M; asset-ids doc):** `encoding = 10*outcome + side`; coin `#<encoding>`, token `+<encoding>`, order asset id `100_000_000 + encoding`.
- **Live shape seen today (H, partial `outcomeMeta`, see Fixtures):** fields `outcome`, `name` (template names such as `template:sportsContestParticipant2`, `template:binaryPrice`, `template:priceTouch`, `template:sportsTournamentParticipant`), `description` (pipe-delimited key:value, e.g. `perp:ZEC|priceDescription:the Pyth ZEC/USD price|seconds:90|threshold:1057|time:20261023-0800`), `sideSpecs`, `quoteToken: "USDC"`, optional `venue` (`out`, `skew`, `txyz` - deployer venues) and `deployerFeeScale`.
- fomo-specific market list or curation: **NOT FOUND** (searched: fomo.family home, /terms; sibling note also searched /answers, /blog, sitemap, llms.txt).

## 3. Chains and collateral

- Settles on **HyperCore (Hyperliquid L1)**, quote token **USDC** (H: DefiLlama chain "Hyperliquid L1"; `quoteToken: "USDC"` in live `outcomeMeta`).
- How fomo funds a user's Hyperliquid account (own account vs fomo-managed/derived wallet): **NOT FOUND**. The builder-code mechanism requires the user's main wallet to sign `ApproveBuilderFee` (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md), implying per-user HL accounts.

## 4. Read API

- **Official fomo API: none** (`exists = none`). Nothing on the homepage or Terms; sibling note found `api./docs./developers.fomo.family` not resolving, `/llms.txt` 404 (I re-checked `/llms.txt`: HTTP 404, H), no GitHub org (via sibling note, M).
- **Usable public data about fomo-attributed flow (H, keyless GET):**
  - `https://api.llama.fi/summary/dexs/fomo-outcome` - daily attributed volume; `.../summary/fees/fomo-outcome` - fees; `https://api.llama.fi/protocol/fomo-outcome` - metadata.
  - Hyperliquid builder fills: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address_lowercase}/{YYYYMMDD}.csv.lz4` (H, builder-codes doc; LZ4 CSV, case-sensitive lowercase address). Builder addresses used by DefiLlama are in sibling note section 4 (M); not re-fetched, not downloaded.
- Market data for the actual book: use the Hyperliquid API (keyless `POST /info`, WS `wss://api.hyperliquid.xyz/ws`; limits in sibling note: 1200 weight/min/IP REST, 1000 WS subscriptions, M). Not repeated here.
- fomo rate limits: NOT FOUND (no API).

## 5. Trade path

- **Via fomo: none.** No API or external-wallet order flow found. Terms section 16 forbids bots/scripts to "execute trades" and scraping of pricing/transaction data (H, quoted sparingly below).
- **Via Hyperliquid directly:** EIP-712-signed actions to `POST /exchange` with agent wallets; builder tag optional per order (sibling note, M). Our orders would not need fomo's code.

## 6. PayBox reachability

**no** for fomo as a venue: no contract or signing API to target. Underlying Hyperliquid is only **partially** reachable (signed HyperCore actions, not EVM transaction proposals; PayBox's Hyperliquid plugin is read-only per sibling note, M). That route bypasses fomo.

## 7. Fees

- fomo outcome fee: **NOT FOUND**. Terms section 7: fomo charges a fee on buys/sells "shown before you confirm", changeable at any time; only number given is **perps 0.05% per transaction** (H, https://fomo.family/terms).
- Hyperliquid builder fee caps: max 0.1% on perps, 1% on spot; doc "doesn't mention outcome or HIP-4 trades", so whether/how builder fees apply to outcomes per that page is **NOT FOUND** (H). HIP-4 page says builders earn fees "on sell orders that specify their code" and that "fees are currently zero for outcome markets for initial testing" (H, stale per sibling note).
- Observed (M, weak): fees $0.02 / $0.03 on days with $31 / $38 volume, about 6-8 bps, rounded to cents.
- Who pays: user, on top of Hyperliquid's own fee; fomo keeps the builder fee (DefiLlama methodology, H).

## 8. Resolution and dispute risk

fomo resolves nothing. Resolution is Hyperliquid's: HIP-4 doc describes settlement to a fraction and the first market settling to the BTC mark price (H); sibling note reports most permissionless markets are deployer-settled with no documented trader dispute window (M). Live `outcomeMeta` shows multiple deployer venues (`out`, `skew`, `txyz`) (H), so dispute risk varies by deployer. fomo's Terms say nothing on outcome disputes (H).

## 9. Geo, ToS, automation (https://fomo.family/terms, H)

- Not offered in sanctioned/crypto-restricted jurisdictions or to sanctioned persons; VPN circumvention prohibited.
- Perps not available to U.S. Persons; **no outcome-market clause exists** (gating for outcomes undocumented).
- Section 16 bars "automated scripts, bots ... to ... execute trades" and scraping "pricing" / "transaction data", market manipulation (wash trading, spoofing).
- Underlying Hyperliquid Terms (2026-06-15) bar US and Ontario residents for outcome markets (via sibling note, M).

## 10. Liquidity (all DefiLlama, fetched 2026-10-19, H)

| Metric | Value |
|---|---|
| fomo outcome volume: 24h / 7d / 30d / all-time | $0 / $69 / $80 / $543 |
| Non-zero days | 13 (2026-07-17 .. 2026-10-16), max $130 (2026-08-10) |
| fomo outcome fees all-time | $0.05 |
| Hyperliquid outcomes overall (https://api.llama.fi/summary/dexs/hyperliquid-outcomes): 24h / 7d / 30d / all-time | $3.13M / $17.9M / $47.0M / $261.1M |
| fomo share of underlying all-time | about 0.0002% (M, computed) |

## 11. Event-category overlap

None of its own. Whatever the app surfaces is Hyperliquid HIP-4: live `outcomeMeta` today shows sports (NFL game winners, soccer participants/draws, MLB tournament winners), crypto price (binaryPrice/priceTouch on ZEC, HYPE, XYZ100) (H). These overlap Polymarket, Kalshi, Limitless etc., but the leg is the Hyperliquid adapter.

## 12. Shared liquidity

**Yes, fully, with Hyperliquid HIP-4 outcomes.** Not an independent arbitrage leg (H: DefiLlama `doublecounted: true`, methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code").

## 13. Adapter spec

No fomo adapter. Registry entry: `kind=frontend`, `liquidity_source=hyperliquid-hip4`, `independent=false`, `trade_via=hyperliquid`. Do not scrape fomo; do not emit separate quotes. Optional daily poll of the DefiLlama fomo-outcome series is not worth it ($0-130/day).

## 14. Open questions

- Does the fomo UI currently show an outcomes tab, and which markets? (needs logged-in app)
- fomo's outcome builder fee and the max fee users approve.
- Why DefiLlama fee series starts later (2026-10-15) than volume (2026-07-17).
- Whether fomo serves US users for outcomes (Terms silent).

## Fixtures (`docs/research/fixtures/hyperliquid-hip-4-front-end-fomo/`)

- `defillama_protocol_fomo-outcome.json` - GET https://api.llama.fi/protocol/fomo-outcome, 2026-10-19.
- `defillama_dexs_fomo-outcome_trimmed.json` - trimmed from GET https://api.llama.fi/summary/dexs/fomo-outcome (totals, methodology, non-zero days).
- `outcomeMeta_partial_sample.json` - four hand-copied objects from the truncated output of the single read-only POST described above; shape evidence only.

## Sources

1. https://fomo.family - H
2. https://fomo.family/terms (sections 1, 7, 10, 16) - H
3. https://fomo.family/llms.txt (404) - H
4. https://api.llama.fi/protocol/fomo-outcome ; https://api.llama.fi/summary/dexs/fomo-outcome ; https://api.llama.fi/summary/fees/fomo-outcome ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes - H
5. https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md - H
6. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes.md - H
7. `POST https://api.hyperliquid.xyz/info {"type":"outcomeMeta"}` (single call, see deviation) - H
8. Repo notes `docs/research/venues/fomo.md`, `hyperliquid-hip-4-outcomes-native.md` - M (reused, not all re-verified)

Suspicious / embedded instructions found in third-party content: none.
