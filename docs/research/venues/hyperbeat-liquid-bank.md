# Hyperbeat Liquid Bank (outcome markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc reads, unauthenticated GETs to documented hosts (DefiLlama API, Hyperliquid and Hyperbeat docs, hyperbeat.org pages), `gh api` read-only org/repo listing. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, small-model page summary, or my own computation/inference; **L** = weak or stale.

Method limits:
- The WebSearch budget was exhausted before any search ran, so there are no search-based leads; every fact below comes from direct fetches.
- `https://app.hyperbeat.org` is a single-page app. Fetches returned only the Earn page; the outcome UI (`/predict` per the blog, `/dapp/trade` per the nav) was not rendered, so I could not read any Hyperbeat market list. `https://app.hyperbeat.org/predict` returned 404 to a GET (H); the blog may use a different in-app route (NOT FOUND).
- Hyperliquid `POST /info` (outcomeMeta etc.) is POST-only and POST is forbidden by this task's rules, so no live Hyperliquid response shape was captured here. The full underlying-venue spec, including live WebSocket shapes, already exists in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (written earlier today by another workflow; not re-verified here except where tagged H below).

---

## 0. Bottom line

1. **Hyperbeat is a front end (builder-code interface) on Hyperliquid HIP-4, not a venue.** DefiLlama: "Hyperbeat Liquid Bank provides access to outcome-based prediction markets through Hyperliquid", category Interface, tag "Hyperliquid HIP4 Builder" (H, https://api.llama.fi/protocol/hyperbeat-liquid-bank-outcome). All order flow lands on the Hyperliquid HyperCore order book, so **liquidity is 100% shared with Hyperliquid HIP-4 and Hyperbeat is not an independent arbitrage leg.**
2. **Negligible flow.** Volume routed through Hyperbeat's builder code: **$49.67 over the last 30 days, $0 over the last 24 h and 7 d, $150,404 all-time** (DefiLlama, data through 2026-10-18). The latest non-zero day is 2026-10-10 ($5.48). Against Hyperliquid HIP-4 as a whole ($3.13M on 2026-10-18, $47.0M over 30 d, $261.1M all-time), Hyperbeat is about 0.0001% of 30-day volume (M, my arithmetic on H data).
3. **No Hyperbeat-specific API.** Nothing in Hyperbeat's docs, GitHub org or site describes a market-data or trading API for outcomes (NOT FOUND, details in section 4). Anything an aggregator needs is on Hyperliquid's own public API.
4. **ToS friction.** Hyperbeat's Terms (last updated 2026-03-01, before the outcome launch) prohibit unauthorized bots and VPN location masking, and list "binary options (including prediction-market transactions)" in a compliance-conditional restriction (H, section 8).
5. **adapter_priority = skip.** Build the native Hyperliquid HIP-4 adapter instead (rated P1 in the native note); Hyperbeat adds no liquidity, no data and no better access. At most, record Hyperbeat's builder address as a label if it ever shows up in Hyperliquid fill data.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| DefiLlama protocol 8993 "Hyperbeat Liquid Bank Outcome", `listedAt` 1791497893 (= 2026-10-08T22:18:13Z), dimensions `dexs` and `fees` module `hyperbeat-liquidbank-outcome`; last non-zero daily volume 2026-10-10 ($5.48); `total24h` 0, `total7d` 0, `total30d` 49.67 (fixtures `defillama_summary_dexs_hyperbeat-liquidbank-outcome.json`, `defillama_protocol_hyperbeat-liquid-bank-outcome.json`) | H |
| `https://app.hyperbeat.org` serves the Hyperbeat app (Earn page shown; status text "Operational"); it did not mention outcome markets in the rendered text | H (site up) / M (outcome UI present) |
| Hyperbeat blog post 2026-07-24 "Prediction Markets on Hyperbeat, Explained" describes Yes/No markets on a `/predict` page (https://hyperbeat.org/blog/predict-markets-explained) | M (small-model summary of the page) |
| The underlying venue, Hyperliquid HIP-4, is live: DefiLlama `hyperliquid-outcomes` has non-zero daily volume every day 2026-05-02 to 2026-10-18 (fixture `defillama_summary_dexs_hyperliquid-outcomes_last45d.json`) | H |
| Hyperbeat docs (`docs.hyperbeat.org/llms.txt`) have no page on prediction or outcome markets | H (absence) |

Verdict: **still_live = true**, with the caveat that it is a thin skin over Hyperliquid with near-zero usage. The 2026-05-02 to 2026-05-04 volume (about $101k, roughly two-thirds of all-time volume) and later daily figures predate the DefiLlama listing (2026-10-08) and the blog (2026-07-24); this looks like backfilled builder-fill data, but I did not verify why (open question).

---

## 2. Kind and market model

- **Kind (H):** interface/frontend (a "builder" in Hyperliquid terms) for HIP-4 outcome markets. Hyperbeat's own Terms say of Trade: "All transactions on Trade are executed on Hyperliquid's decentralized infrastructure... We are not a counterparty, broker, exchange... and we have no involvement in matching, executing, clearing, or settling transactions" (https://hyperbeat.org/terms, Trade clause, page last updated 2026-03-01).
- **Market model (H, underlying venue):** fully collateralized binary outcome tokens on a native HyperCore CLOB; Yes and No books for one outcome are merged; "Questions" group outcomes where exactly one settles Yes (categorical); no leverage or liquidations. https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- **Tokenisation (H):** `encoding = 10 * outcome + side`; coin `#<encoding>`, token `+<encoding>`, asset id `100_000_000 + encoding`; example outcome 1 side 0 = `#10` = `+10` = `100000010`. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- **Hyperbeat UX (M):** each share trades between 0 and 1 USDC, a winner pays 1 USDC; states "Settles In", "Awaiting Settlement", "Market Settled"; multi-outcome events and recurring markets with a "Trade next market" shortcut; trading is described as gasless and one-click (blog 2026-07-24, small-model summary). The blog does not name Hyperliquid or HIP-4; the Hyperliquid link comes from DefiLlama's description and methodology (H).
- **Hyperbeat's catalogue vs Hyperliquid's:** whether Hyperbeat exposes every HIP-4 market or a subset is NOT FOUND (searched: docs.hyperbeat.org llms.txt and liquid-banking pages, hyperbeat.org home, blog index, app.hyperbeat.org rendered text).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue | Hyperliquid HyperCore (L1), not an EVM contract set. DefiLlama chain: "Hyperliquid L1" | H |
| Quote / collateral | USDC (settled outcome sample `"quoteToken": "USDC"` in the official docs; Hyperbeat blog: "settle in USDC") | H (docs) / M (blog) |
| Hyperbeat account type | hyperbeat.org describes Liquid Bank as "a single self-custodial smart wallet on HyperEVM". How that wallet relates to the Hyperliquid account that actually holds outcome tokens (same address, a linked account, or an agent/API wallet) is **NOT FOUND** (searched: hyperbeat.org, docs liquid-banking, liquid-banking-architecture index entry, Terms). | M / NOT FOUND |
| Funding paths | Hyperbeat blog (2026-07-14, "Funding Your Trading Account") exists but was not read; Hyperliquid's own funding is Arbitrum USDC (see native note). | NOT FOUND for Hyperbeat |

---

## 4. Read API

- **Official Hyperbeat market-data API for outcomes: none found.** Hyperbeat's docs index (https://docs.hyperbeat.org/llms.txt) lists only: Liquid banking, Pay, USD+, Beatpot, Staking (beHYPE and a Staking API for HYPE delegation), Earn vaults, delta-neutral tokens, Morphobeat, Builder Codes (for vault and staking integrators) and a "Hyperfolio API" (portfolio). Searched for "outcome", "predict", "HIP-4": no page. (H absence)
- GitHub: org `0xhyperbeat` has 6 repos (DefiLlama-Adapters, ethena_sats_adapters, dimension-adapters, Audits, Pendle-SY-Public, beHYPE); none relates to outcomes or an app SDK (H, `gh api orgs/0xhyperbeat/repos`).
- **Therefore read data from Hyperliquid directly** (H, official docs; details and live WebSocket shapes in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`):
  - REST `POST https://api.hyperliquid.xyz/info` with `{"type":"outcomeMeta"}`, `{"type":"outcomeTemplates"}`, `{"type":"settledOutcome","outcome":N}`; response shape `outcomes[] {outcome, name, description, sideSpecs[{name}]}`, settled: `{spec{..., quoteToken}, settleFraction, details}` (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot). Not captured live here (POST).
  - WebSocket `wss://api.hyperliquid.xyz/ws`: `l2Book`, `trades`, `bbo`, `allMids`, and `outcomeMetaUpdates` (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions).
  - Limits per IP: REST 1200 weight/min (l2Book and allMids weight 2, other info weight 20); WS max 10 connections, 1000 subscriptions, 2000 messages/min (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).
  - Volume attributable to Hyperbeat specifically: Hyperliquid publishes builder fills as LZ4 CSV at `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address_lowercase}/{YYYYMMDD}.csv.lz4` (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). Hyperbeat's builder address is **NOT FOUND** in its docs (searched: llms.txt, builder-codes docs which cover vaults and staking only), so this was not fetched.
- **Public aggregates (H, used for the fixtures):** `GET https://api.llama.fi/summary/dexs/hyperbeat-liquidbank-outcome` (builder-routed HIP-4 volume), `GET https://api.llama.fi/summary/dexs/hyperliquid-outcomes` (all HIP-4 volume), `GET https://api.llama.fi/protocol/hyperbeat-liquid-bank-outcome`. No key. Response shape: protocol metadata + `total24h/7d/30d/1y/allTime` + `totalDataChart [[unix_ts, usd_volume], ...]` daily. DefiLlama methodology for the Hyperbeat entry: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code."

Fixtures saved (<= 50 KB each) in `docs/research/fixtures/hyperbeat-liquid-bank/`:
- `defillama_summary_dexs_hyperbeat-liquidbank-outcome.json` (full daily series 2026-05-02 to 2026-10-18; breakdown arrays removed)
- `defillama_summary_dexs_hyperliquid-outcomes_last45d.json` (underlying venue, last 45 daily points)
- `defillama_protocol_hyperbeat-liquid-bank-outcome.json`

---

## 5. Trade path

- **Via Hyperbeat: none for an agent.** No documented order API; the product is a consumer app. Hyperbeat's Terms bar unauthorized bots (section 8).
- **How Hyperbeat itself routes (H, official Hyperliquid docs):** orders are Hyperliquid `order` actions carrying `"builder": {"b": <builder address>, "f": <fee in tenths of a basis point>}`; the user must first approve a max builder fee with `ApproveBuilderFee`, signed by the user's main wallet (not an agent wallet) (https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). HIP-4 page: "builder codes do work the same as normal spot trading, where builders earn builder fees on sell orders that specify their builder code."
- **Native alternative (H, docs; signing details M):** `POST https://api.hyperliquid.xyz/exchange` with an EIP-712 signed action (two schemes, L1 action via msgpack and user-signed action, per https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing; the docs recommend an SDK instead of hand-rolled signing); outcome order asset = `100_000_000 + 10*outcome + side`; extra actions `userOutcome` split/merge/mergeQuestion/negate (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint).

### PayBox reachability

- **paybox_reachable = partial (and only for the native Hyperliquid route, not for Hyperbeat).** A PayBox EVM wallet can sign EIP-712 typed data with `request_wallet_sign` (repo note `docs/research/06-paybox-platform.md`, H there), and PayBox's chain catalog includes Arbitrum (42161) and Hyperliquid (999). Hyperliquid trading needs signed off-chain actions to `/exchange` on HyperCore, not EVM transaction proposals; a plugin cannot sign (same note) so it is the agent-orchestrated prepare, sign, submit pattern. Funding the Hyperliquid account needs an Arbitrum USDC deposit (native note).
- **Via Hyperbeat: no.** Its account is described as a HyperEVM smart wallet behind an app; no API, no documented signing scheme, and the Terms bar unauthorized automation.

---

## 6. Fees

| Fee | Value | Tag |
|---|---|---|
| Hyperbeat builder fee | "a small builder fee of 0.025 percent on trades", approved once during setup, max capped onchain (Hyperbeat blog "Fees on Hyperbeat Trade", dated 2026-07-14). The article does not mention outcome or prediction markets, so whether 0.025% applies to outcome trades is not confirmed. Paid by the user, to Hyperbeat. | M |
| Builder fee ceiling | At most 0.1% on perps and 1% on spot; applied to the quote/collateral side only (for outcome trades, spot-like per the HIP-4 page) | H (builder-codes page) / M (outcome applicability) |
| Hyperliquid outcome fee | Charged only when closing or burning or settling a position, not when opening; no maker rebates (maker orders pay zero where a rebate would otherwise apply). Numeric rate NOT FOUND in the official docs (HIP-4 page still says "Fees are currently zero... for initial testing", which DefiLlama contradicts: "Hyperliquid charged no outcome fee of its own before 15 Aug 2026"). https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees ("Outcome tokens" section), DefiLlama methodology | H (structure) / NOT FOUND (rate) |
| Hyperbeat "Platform Fee" | Terms reserve the right to charge a Platform Fee on "all transactions made on or via the Platform", amount not stated in the Terms | H |
| Gas | Hyperbeat blog: no gas fees on Trade (small-model summary) | M |

Fee drag for arbitrage: any Hyperbeat leg costs strictly more than the identical native Hyperliquid leg by at least the builder fee.

---

## 7. Resolution mechanism and dispute risk

Identical to Hyperliquid HIP-4 because settlement happens on HyperCore, not at Hyperbeat:
- Protocol-recurring markets settle automatically to the HyperCore mark price (linear interpolation around the settlement time) (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications).
- Deployer-created template markets (e.g. `binaryPrice`, `policyRateDecision`) resolve per validator-approved template text; "Markets that contradict their template's semantic restriction are considered malformed and slashable by validators" (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions, page carries a "Testnet-only" banner). The earlier native note finds most open markets are deployer-settled with no trader dispute window (M there).
- Hyperbeat's blog says exact criteria sit in each market's Rules dialog and does not say who decides outcomes (M).
- Hyperbeat disclaims all liability for Trade ("no responsibility whatsoever" per the page summary; M) so an aggregator has no recourse against Hyperbeat.

---

## 8. Geo, ToS, automation (quoted sparingly; Terms last updated 2026-03-01)

Source: https://hyperbeat.org/terms (raw HTML read and grepped, H). The Terms predate the outcome launch and contain no outcome-market-specific clause (grep for "outcome" hits only generic uses and the Beatpot clause).
- **Bots (9.1.3, "Cheating"):** prohibits "bots; i.e. any code and/or software, not expressly authorized by the Company, that allows the automated control of your User Account or any Service or Content of the Platform". An agent driving the Hyperbeat app would violate this unless authorized.
- **VPN (9.1):** "Disguise your location through IP proxying, VPN or other methods." is prohibited.
- **Prediction markets (9.1.15.4):** restricts "binary options (including prediction-market transactions)" where such transactions "do not comply with all laws, r[ules]..." (compliance-conditional). Separately 9.1.2(v) bars "organizing, promoting, facilitating, or participating in any event involving wagering on the outcome" of activities on the Platform without authorization (as summarised by a small model; the first quote I confirmed verbatim in raw HTML, the second only via summary: M).
- **Geography:** the Platform is "not made available" to residents/domiciliaries of Ontario, Canada, nor to sanctioned countries; US residents "may use the Stake Service" and, subject to a cardholder agreement, Pay, "but may not have access to certain Earn features" (Trade eligibility for US persons is not stated: NOT FOUND). The long country list in the Terms (US, UK, Canada, Australia, Singapore, etc.) is the Beatpot restriction list, not the Trade list (H).
- **Underlying Hyperliquid terms:** `https://app.hyperliquid.xyz/terms` and `https://hyperliquid.xyz/terms` returned 403 / no text to WebFetch (NOT FOUND this session). The native note reports US and Ontario residents barred and an unpublished "Excluded Persons" list for outcome markets (M here; H in that note from the Terms JS bundle dated 2026-06-15).

---

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Hyperbeat builder-routed HIP-4 volume | $0 (24 h), $0 (7 d), $49.67 (30 d), $150,404 (all-time) | DefiLlama `summary/dexs/hyperbeat-liquidbank-outcome`, data through 2026-10-18 | H |
| Hyperbeat peak day | $33,367 / $34,523 / $33,662 on 2026-05-02..04; June to July typically $0.1k to $10k per day (max $9,572 on 2026-07-15); Aug to Oct typically < $60 per day | same fixture | H |
| Hyperbeat TVL / OI | none (DefiLlama `tvl` empty); interface entry only | `api.llama.fi/protocol/hyperbeat-liquid-bank-outcome` | H |
| Underlying Hyperliquid HIP-4 volume | $3.13M (2026-10-18), $17.9M (7 d), $47.0M (30 d), $261.1M (all-time since 2026-05-02) | DefiLlama `summary/dexs/hyperliquid-outcomes` | H |
| Hyperbeat share of HIP-4 volume | about 0.0001% (30 d), about 0.06% (all-time) | my arithmetic | M |
| Resting depth | not Hyperbeat's; it is Hyperliquid's merged books (see native note) | n/a | n/a |

Hyperbeat's volume may include only fills tagged with its builder code; users who deposit via Hyperbeat but trade elsewhere are invisible (M).

---

## 10. Event coverage (arbitrage overlap)

- Because Hyperbeat is a skin, coverage equals Hyperliquid HIP-4 for whatever markets the UI lists (Hyperbeat's subset: NOT FOUND). Per the native note and docs: crypto price binaries and buckets (BTC daily and 15 m recurring, template `binaryPrice` on any Hyperliquid perp), central-bank rate decisions (template `policyRateDecision`, macro), plus sports, awards, company and AI templates (M, third-party tracker in the native note). Hyperbeat's blog gives only generic examples: a team winning a tournament and numeric thresholds reached by a date (M).
- Overlap with other venues is real for crypto price, macro rates and sports, but the arbitrageable leg is the Hyperliquid book, not Hyperbeat.
- Related DefiLlama entries for other Hyperliquid HIP-4 front ends with the same dependency (all `*-outcome` Interface listings dated 2026-10-08, e.g. basedapp, floatout, phantom, liquary, outcome.xyz) confirm the pattern: dozens of builders share one book (H, DefiLlama `protocols` list).

---

## 11. Liquidity shared with

**Hyperliquid HIP-4 Outcomes (native)**, fully. Any Hyperbeat order matches against the same HyperCore books as app.hyperliquid.xyz and every other HIP-4 front end. An aggregator must treat Hyperbeat, Phantom, BasedApp, Floatout, Outcome.xyz, etc. as one venue (H for Hyperbeat via DefiLlama methodology; model per `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`).

---

## 12. Adapter recommendation

- **adapter_priority: skip.** Reasons: duplicate liquidity (100% shared), no Hyperbeat API, $49.67 of 30-day volume, bot clause in Terms, and a consumer smart-wallet front end that adds friction over the native route.
- Do instead: implement the Hyperliquid HIP-4 adapter and, if desired, set an optional `builder: {b, f}` on native orders only if a builder address is deliberately chosen (not Hyperbeat's, which is unknown and unnecessary).
- Revisit only if Hyperbeat publishes an agent/API product or exposes distinct (non-HIP-4) markets.

---

## 13. Open questions

1. Hyperbeat's builder address and exact outcome builder fee (needed only to attribute fills; fetchable from `stats-data.hyperliquid.xyz/Mainnet/builder_fills/...` once known).
2. Why DefiLlama shows $101k of Hyperbeat outcome volume on 2026-05-02..04 (backfill, a test, or a bulk trader) and near zero since.
3. How the Liquid Bank HyperEVM smart wallet maps to the Hyperliquid account that holds outcome tokens.
4. Whether `app.hyperbeat.org` currently shows outcome markets to all users or is geo/feature gated (SPA not rendered by the fetch tool; no browser automation allowed).
5. Hyperliquid's own Terms of Use text for outcome markets (403 to WebFetch this session).

---

## Sources

- DefiLlama protocol: https://api.llama.fi/protocol/hyperbeat-liquid-bank-outcome (H, fetched 2026-10-19)
- DefiLlama volume (Hyperbeat entry): https://api.llama.fi/summary/dexs/hyperbeat-liquidbank-outcome (H)
- DefiLlama fees (Hyperbeat entry; cumulative $2): https://api.llama.fi/summary/fees/hyperbeat-liquidbank-outcome (H)
- DefiLlama volume (all HIP-4): https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
- DefiLlama protocol list: https://api.llama.fi/protocols (H; Hyperbeat siblings: Earn, LST, USD, Credit, Liquid Bank Perps/Spot/Outcome)
- DefiLlama page (HTTP 403 to WebFetch, hint only): https://defillama.com/protocol/hyperbeat-liquid-bank-outcome
- Hyperbeat app: https://app.hyperbeat.org (H); home https://hyperbeat.org (M, summary)
- Hyperbeat docs index: https://docs.hyperbeat.org/llms.txt ; https://docs.hyperbeat.org/liquid-banking.md (H)
- Hyperbeat Terms of Use (last updated 2026-03-01): https://hyperbeat.org/terms (H, raw HTML)
- Hyperbeat blog index: https://hyperbeat.org/blog (M); https://hyperbeat.org/blog/predict-markets-explained (M); https://hyperbeat.org/blog/fees-on-hyperbeat-trade (M)
- Hyperbeat GitHub org: https://github.com/0xhyperbeat (H, `gh api orgs/0xhyperbeat/repos`)
- Hyperliquid docs (official): HIP-4 https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; asset ids .../for-developers/api/asset-ids ; info endpoint (spot, outcomeMeta) .../for-developers/api/info-endpoint/spot ; exchange endpoint .../for-developers/api/exchange-endpoint ; signing .../for-developers/api/signing ; rate limits .../for-developers/api/rate-limits-and-user-limits ; websocket subscriptions .../for-developers/api/websocket/subscriptions ; builder codes .../trading/builder-codes ; fees .../trading/fees ; contract specifications .../trading/contract-specifications ; HIP-4 deployer actions (testnet-only) .../for-developers/api/hip-4-deployer-actions (all H)
- Repo notes cross-referenced: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/06-paybox-platform.md`
