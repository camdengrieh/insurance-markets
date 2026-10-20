# Hyperliquid HIP-4 front-end: MoonBot (moon-bot.com / moonbot.pro) - venue spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (DefiLlama public API, a public community indexer), WebFetch of moonbot.pro pages, `gh api` file reads. No account, wallet, key, signature, builder-fee approval, POST/PUT/DELETE, payment or PayBox tool was used. WebSearch budget was exhausted (search refused), so there is no independent news/social search. Third-party text was treated as untrusted data; no instructions aimed at AI agents were seen.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/inferred/computed; **L** = weak or stale.

Relationship to earlier notes: this repo already has `docs/research/venues/moonbot.md` (a deeper MoonBot write-up) and the authoritative Hyperliquid specs `hyperliquid-hip-4-outcome-markets.md` / `hyperliquid-hip-4-outcomes-native.md`. I independently re-verified the load-bearing MoonBot facts below (redirect, homepage, DefiLlama series, fees, builder address, indexer shape). Facts I did not re-verify are marked "via sibling note" (M). Hyperliquid book mechanics are not duplicated; see the sibling notes.

---

## 0. Bottom line

1. **MoonBot is a crypto trading terminal, not a prediction-market venue.** Its homepage describes "an advanced terminal for cryptocurrency trading" (manual and automated) supporting Binance, Bybit, Gate, Bitget, Hyperliquid, OKX; it does not mention HIP-4, outcome or prediction markets (H, https://moonbot.pro/en/ and https://moonbot.pro/documentation/basics/advantages-of-the-moonbot-terminal, fetched 2026-10-19).
2. **"MoonBot Outcome" is only a DefiLlama attribution line** for Hyperliquid HIP-4 outcome fills that carried MoonBot's builder code. DefiLlama: category "Interface", tag "Hyperliquid HIP4 Builder", `doublecounted: true`, methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H, https://api.llama.fi/protocol/moonbot-outcome and https://api.llama.fi/summary/dexs/moonbot-outcome). The "provides access to outcome-based prediction markets" wording is DefiLlama's, not MoonBot's.
3. **100% shared liquidity with Hyperliquid HIP-4. Not an independent arbitrage leg.** A builder code is a fee tag on fills in the HyperCore book (H, same DefiLlama methodology).
4. **Outcome flow through MoonBot is tiny and dormant:** $339,344 lifetime (2026-05-02..2026-10-18), $0 in the last 24h/7d/30d, last non-zero day 2026-09-17 ($142), last meaningful day 2026-07-20 (H, DefiLlama, fixture).
5. **No public API, no trade path for third parties.** adapter_priority = **skip**. Build the Hyperliquid HIP-4 adapter instead; MoonBot is at most a builder-attribution tag.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `GET https://moon-bot.com/en/` returns HTTP 301 to `https://moonbot.pro/en/` (curl, 2026-10-19). DefiLlama still lists the old domain. | H |
| `https://moonbot.pro/en/` loads and describes the terminal (WebFetch 2026-10-19) | H |
| DefiLlama `moonbot-outcome` (id 9017), `listedAt` 1791497917 = 2026-10-08, series 2026-05-02..2026-10-18 | H |
| Builder code `0xb84c...9533` routed $10.72M volume on 2026-10-18 (perps $10.57M, spot $0.15M) with outcome volume 0 (fixture `indexer_builder_daily_2026-10-18.json`) | H |

Verdict: **the company/terminal is live; the outcome-market angle is dormant.** `still_live` = true for the product only. As an outcome venue it is effectively inactive.

---

## 2. Kind and market model

- **Kind:** broker/terminal front-end (desktop software using the user's own exchange API keys). No matching engine, no tokens, no contracts (DefiLlama `tvl: []`, `github: null`, `audits: "0"`; H).
- **Market model:** whatever Hyperliquid offers. HIP-4 outcomes are a merged Yes/No CLOB on HyperCore with coins `#<10*outcome+side>` and order asset id `100_000_000 + encoding` (via sibling note `hyperliquid-hip-4-outcome-markets.md`, H there). Binary, categorical "questions" and scalar-capable standalone outcomes; see that note.
- **Why fills are tagged at all (M, inference):** outcome orders are generic signed `order` actions, so a terminal that already attaches its builder code can reach them if a user enters such a coin. The indexer shows outcome fee keys `+2120`, `+2121`, `+1730`, `+8560`, `+8561` on 2026-07-19 (H, fixture), consistent with a few manual/experimental trades. No MoonBot doc says outcomes are supported (via sibling note: 0 hits for "outcome"/"HIP-4"/"prediction" in the Hyperliquid connection guide).

---

## 3. Chains and collateral

Hyperliquid L1 (HyperCore), USDC collateral; deposit via Arbitrum USDC (via sibling notes, H there). MoonBot's guide quotes 5 USDC minimum deposit and 1 USDC withdrawal fee (via sibling note, M). Hyperliquid's own docs are the authority.

---

## 4. Read API

**MoonBot: none.** No REST/WebSocket market-data API. Docs are a terminal manual (https://moonbot.pro/documentation). The only programmatic surface is the MoonCMD UDP remote-control protocol (HMAC-signed commands that drive a locally running terminal; no market data) (via sibling note, M).

**For prices, books, trades, resolution use Hyperliquid directly:** keyless `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `allMids`, `outcomeMetaUpdates`) and `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `settledOutcome`); limits 1200 weight/min/IP REST, 1000 WS subscriptions (via sibling note `hyperliquid-hip-4-outcome-markets.md` section 4). Not re-fetched here; my POST ban applies.

**Useful third-party attribution API (not MoonBot's, H, GET without auth):**
`GET https://hl-indexer.llama.rip/v2/data/builder/0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533/daily/YYYYMMDD-or-YYYY-MM-DD` (both date forms returned data; I used `2026-10-18` and `2026-07-19`). Response shape (H, live):
`{date, timestamp, hours, builder, builderFees{token:amt}, builderPerpsFees, builderSpotFees, builderOutcomeFees, builderVolumeUsd, builderPerpsVolumeUsd, builderSpotVolumeUsd, builderOutcomeVolumeUsd, builderOutcomeNotionalVolumeUsd}`. Docs: https://hl-indexer.llama.rip/llms.txt (via sibling note). Community indexer, rate limits NOT FOUND, not a Hyperliquid service (M).

DefiLlama shapes (H): `GET https://api.llama.fi/summary/dexs/moonbot-outcome` -> `{total24h,total7d,total30d,total1y,totalAllTime,totalDataChart:[[unixDay,usd],...],methodology{...},doublecounted,...}`; `/summary/fees/moonbot-outcome` the same for builder fees.

Builder address `0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533` is public, from DefiLlama's adapter `factory/hyperliquid.ts` line 659 (H, `gh api` read: `"moonbot": { addresses: [...] }`, lines 1478-1479 define `moonbot-spot` and `moonbot-outcome` with `market: "outcome"`, `start: "2026-05-02"`).

Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-moonbot/` (three small JSON files; see the end).

---

## 5. Trade path

- **MoonBot:** no usable programmatic path. Closed-source Windows app; orders come from its own strategies. The user pastes a Hyperliquid API (agent) wallet address and private key into the terminal and approves a builder fee once through a MoonBot-hosted page (via sibling note, M). Handing a PayBox-derived agent key to a third-party desktop app is not recommended and adds no liquidity.
- **Real path = Hyperliquid directly:** EIP-712 phantom-agent signed `order` actions to `POST /exchange`, asset id `100_000_000 + enc`, optional builder code (via sibling note `hyperliquid-hip-4-outcome-markets.md` section 5). If the aggregator wants MoonBot-style attribution, it could attach its own builder code; that is out of scope here.

---

## 6. Reachability from a PayBox wallet

**no** for MoonBot as a venue (nothing to propose or sign; no contract, no API). The underlying Hyperliquid rails were rated **partial** in the sibling note (USDC funding via Arbitrum reachable; orders are HyperCore signed actions that `request_wallet_sign` typed-data/raw could sign; PayBox's own Hyperliquid plugin is read-only spot browsing). Not re-verified here.

---

## 7. Fees

- **MoonBot software:** FREE and PRO tiers, Hyperliquid account activation 1000 Moon Credits (via sibling note, M). Pricing NOT FOUND (searched: moonbot.pro homepage, documentation page; sibling note searched FAQ).
- **MoonBot builder-code rate: not published** (guide says "a small developer fee"). My computation from live data (M): outcomes $59.77 fees / $339,344 volume = about 1.8 bps lifetime (https://api.llama.fi/summary/fees/moonbot-outcome); perps on 2026-10-18 $1,586.02 / $10,573,472.52 = about 1.5 bps; spot $29.81 / $148,939.95 = about 2.0 bps (fixture). Outcome builder fees are charged on sells only (Hyperliquid HIP-4 page, via sibling note), so the ratio to total volume is understated.
- **Hyperliquid protocol/deployer fees on outcomes:** see sibling note (numeric rate not in official docs; empirical 11-25 bps all-in, M there).
- MoonBot "fast IOC" priority fee of 0.08% of executed volume paid in HYPE exists in its guide (via sibling note, M); applicability to outcome orders NOT FOUND.

---

## 8. Resolution mechanism and dispute risk

MoonBot resolves nothing. Resolution is Hyperliquid's: protocol auto-settle for recurring series, validator vote for canonical markets, deployer-settled with no documented trader dispute window for most open markets (via sibling note). Added risk from MoonBot: operational only (desktop app holding an agent key).

---

## 9. Geo, ToS, automation

- **MoonBot terms of service: NOT FOUND** (searched: moonbot.pro homepage and documentation page this session; sibling note searched sitemap, /offer, /en/offer, /policy/terms, FAQ, about, guide; `/offer` returned 404 there). Only privacy policies are published (via sibling note, M). No geographic restriction text found.
- **Automation:** the product is automation (strategies, signals, UDP control). No bot-ban risk from MoonBot.
- **Hyperliquid rules still bind the end user:** US and Ontario residents barred, plus an unpublished "Excluded Persons" list for outcome markets (Terms of Use last updated 2026-06-15; via sibling note, H there).

---

## 10. Liquidity and category overlap

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Lifetime outcome volume via MoonBot code | $339,344 (2026-05-02..2026-10-18) | https://api.llama.fi/summary/dexs/moonbot-outcome , fetched 2026-10-19 | H |
| Monthly (my sums of non-zero days) | May $202,258; Jun $49,736; Jul $87,178; Aug $0; Sep $172; Oct (to 18th) $0 | same | M |
| Peak day | 2026-07-19 $61,709 (notional $77,962) | indexer | H |
| Last non-zero days | 2026-07-20 $460; 2026-09-09 $30; 2026-09-17 $142 | DefiLlama | H |
| 24h / 7d / 30d | 0 / 0 / 0 | DefiLlama, 2026-10-19 | H |
| Lifetime outcome builder fees | $59.77 | https://api.llama.fi/summary/fees/moonbot-outcome | H |
| Whole HIP-4 venue context | about $3.13M on 2026-10-18 | sibling note | H there |
| TVL | none | DefiLlama `tvl: []` | H |

- **Liquidity shared with: Hyperliquid HIP-4 outcome markets** (100%). Zero independent depth or price.
- **Category overlap:** whatever Hyperliquid lists (crypto price ladders, policy-rate decisions, sports/awards/company templates per sibling note); MoonBot adds none.

---

## 11. Adapter spec

Do not build a MoonBot adapter. Registry entry if wanted: `kind: "frontend/terminal"`, `liquiditySource: "hyperliquid-hip4"`, `independent: false`, `builder: "0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533"`, `status: "dormant for outcomes"`. Optional daily poll of the indexer route; only re-evaluate if `builderOutcomeVolumeUsd` becomes sustained and large (and even then it is a flow signal on Hyperliquid, not a new price source).

---

## NOT FOUND

- MoonBot terms of service / public offer (searched: moonbot.pro homepage, documentation page; sibling note: sitemap, /offer, /en/offer, /policy/terms, FAQ, about).
- Any MoonBot statement that the terminal supports HIP-4 outcome or prediction markets (searched: homepage, documentation page, advantages page; sibling note: Hyperliquid guide, FAQ, about, media).
- MoonBot builder-fee rate (searched: homepage, documentation page).
- Public MoonBot API, SDK, GitHub org, smart contracts.
- Independent news/social coverage (WebSearch refused: session budget used up).
- Content of https://defillama.com/protocol/moonbot-outcome (HTTP 403 to WebFetch; the same data was read from api.llama.fi).

## Open questions

1. Does any current terminal build have a supported route to `#` outcome coins, or were May-July fills manual/experimental?
2. What is the builder-fee value and does the IOC priority fee apply to outcome orders?
3. Why did tagged outcome flow stop after 2026-07-20?

## Sources

- https://moon-bot.com/en/ (301 to https://moonbot.pro/en/) (H, curl)
- https://moonbot.pro/en/ and https://moonbot.pro/documentation/basics/advantages-of-the-moonbot-terminal (H as summarised by WebFetch, so M on exact wording)
- https://api.llama.fi/protocol/moonbot-outcome ; https://api.llama.fi/summary/dexs/moonbot-outcome ; https://api.llama.fi/summary/fees/moonbot-outcome (H)
- https://defillama.com/protocol/moonbot-outcome (403; hint only)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (lines 659, 1478-1479, `gh api`) (H)
- https://hl-indexer.llama.rip/v2/data/builder/0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533/daily/2026-10-18 and .../2026-07-19 (H)
- Repo notes: `docs/research/venues/moonbot.md`, `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/venues/hyperliquid-hip-4-front-end-fomo.md` (same pattern)

## Fixtures

All in `docs/research/fixtures/hyperliquid-hip-4-front-end-moonbot/`:
- `defillama_moonbot-outcome_trimmed.json` (metadata, totals, non-zero days, monthly sums, from api.llama.fi, 2026-10-19)
- `indexer_builder_daily_2026-10-18.json` (builder daily record, zero outcome volume)
- `indexer_builder_daily_2026-07-19_peak_outcome_day.json` (peak outcome day)
