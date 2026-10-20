# MoonBot (moon-bot.com / moonbot.pro) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of public docs pages, the public sitemap, DefiLlama's public API, DefiLlama's public adapter source via `gh api`, and one public third-party indexer (`hl-indexer.llama.rip`). No account, wallet, key, signature, builder-fee approval, POST/PUT/DELETE, payment or PayBox money/signing tool was used. I did not open MoonBot's builder-approval page (`api.moon-bot.com/files/HLsign.html`). WebSearch budget was exhausted mid-session (one query ran before that and returned nothing about MoonBot), so there is **no independent news/social search** for MoonBot; this is recorded under NOT FOUND. Third-party text was treated as untrusted data; I found no instructions aimed at AI agents.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, summarised by a fetch model, or my own computation; **L** = weak or stale.

---

## 0. Bottom line

1. **MoonBot is not a prediction-market venue.** It is a Windows desktop crypto *trading terminal* (manual + automated strategies) that connects to Binance, HTX, Bybit, Gate, Bitget, OKX and Hyperliquid through the user's own exchange API keys (H, https://moonbot.pro/en/ , https://moonbot.pro/documentation/basics/advantages-of-the-moonbot-terminal).
2. **The "MoonBot Outcome" DefiLlama listing is just attribution of Hyperliquid HIP-4 outcome fills that carried MoonBot's builder code.** DefiLlama category "Interface", tag "Hyperliquid HIP4 Builder", methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (H, https://api.llama.fi/summary/dexs/moonbot-outcome). The DefiLlama description "MoonBot provides access to outcome-based prediction markets through Hyperliquid" is DefiLlama's wording, not MoonBot's: MoonBot's own site and its Hyperliquid connection guide never mention outcome, HIP-4, prediction or `#` coins (H, text search of the fetched guide: 0 hits for "outcome", "HIP-4", "prediction").
3. **No liquidity of its own. 100% shared with Hyperliquid HIP-4**, so it is **not an independent arbitrage leg**. Counting it would double-count the same books. The adapter for this ecosystem is the Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`).
4. **Outcome usage through MoonBot is negligible and dormant:** $339,344 lifetime tagged outcome volume (2026-05-02..2026-10-18), **$0 in the last 30 days**, $172 since 2026-07-21 (H, DefiLlama, fixture). Meanwhile the same builder code routes about $10.7M/day of perps+spot (H, indexer, 2026-10-18), so the product is live, but not for outcomes.
5. **No public API.** Only a password-signed UDP remote-control protocol (MoonCMD) that drives the terminal's strategies, with no market-data feed (H).
6. **adapter_priority = skip.** Reasons: not a venue, duplicate liquidity, no API, outcome flow ~0. Useful only as one attribution tag if the registry wants to label HL fills by builder code (address below).

---

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://moon-bot.com/en/` | HTTP 301 to `https://moonbot.pro/en/`; the real site is moonbot.pro (DefiLlama still lists the old domain) | H |
| moonbot.pro sitemap | 564 URLs, all `lastmod` 2026-10-19T01:30+03:00 (auto-regenerated; do not read as content freshness) | H |
| MoonBot Hyperliquid guide | `datePublished` 2026-01-16, `dateModified` 2026-10-19 (likely auto-updated) | H |
| Media page | `updated_at` 2026-09-21 | M (fetch-model summary) |
| MoonBot builder code, 2026-10-18 | $10.72M volume ($10.57M perps, $0.15M spot), $1,615.82 builder fees, **outcome volume 0** (fixture `indexer_builder_daily_2026-10-18.json`) | H |
| DefiLlama parent "MoonBot" / "MoonBot Spot" | spot volume 24h $148,940, 7d $924,687, 30d $9,302,510, all-time $105.4M (fixture `defillama_moonbot_siblings_totals.json`) | H |
| DefiLlama "MoonBot Outcome" | listed 2026-10-08 (`listedAt` 1791497917 = 2026-10-08T22:18Z); 24h/7d/30d = 0 | H |

Verdict: **the company/terminal is live; the outcome-market angle is effectively dormant** (`still_live` = true for the product, false for any meaningful outcome venue).

Operator: data controller "BOOSTED MOONBOT PARTNER", Grand Cayman, Cayman Islands (H, https://moonbot.pro/policy/privacy-global via fetch summary, so M on exact wording). The team page lists a "2019" team launch and says it entered decentralised markets through Hyperliquid in 2025 (M, fetch summary of https://moonbot.pro/about).

---

## 2. Kind and market model

- **Kind:** broker/terminal front end (non-custodial desktop software using the user's own API keys). Not an exchange, no matching engine, no tokens (H).
- **Market model:** whatever Hyperliquid offers. In MoonBot's docs the supported Hyperliquid modes are "Hyper Spot" and "Hyper Futures", plus HIP-3 perp dexes via API (one market per terminal instance; xyz, para, mkts, io named; flx, vntl, hyna, km, abcd, cash "not serviced") (H, https://moonbot.pro/documentation/settings-login-tab/connecting-to-the-hyperliquid-exchange). **HIP-4 outcome markets are not documented as supported.**
- **Why fills are tagged anyway (M, inference):** HIP-4 outcome coins are `#<10*outcome+side>` and trade through the ordinary `order` action with asset id `100_000_000 + encoding` (H, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` section 2/5). A terminal that already sends signed orders with its builder code can reach them if a user types such a coin or sends such an asset id. The indexer shows outcome fee keys like `+2120`, `+2121`, `+8560` (outcome tokens in `builderOutcomeFees`) on 2026-07-19 (H, fixture), consistent with a few manual or experimental outcome trades, but there is no proof of a supported outcome workflow. Treat this as unconfirmed.
- Outcome tokenisation, merged Yes/No book, categorical questions, scalar-capable outcomes: see the Hyperliquid note, not duplicated here.

---

## 3. Chains and collateral

- Hyperliquid L1 (HyperCore), USDC collateral. MoonBot guide: fund an EVM wallet with ETH on Arbitrum, swap to USDC, deposit on Hyperliquid; minimum deposit 5 USDC, withdrawal fee 1 USDC; "Deposits and withdrawals are USDC only" (H as quoted by a fetch summary of the guide, M for exact figures; Hyperliquid's own docs are the authority, see the Hyperliquid note section 3).
- Other exchanges MoonBot supports (Binance, Bybit, OKX, Gate, Bitget, HTX) are CEX spot/futures, irrelevant to outcome markets.

---

## 4. Read API

**None.** MoonBot publishes no REST/WebSocket market-data API.

- Official docs: https://moonbot.pro/documentation (terminal manual; 564-URL sitemap has no API reference). No `llms.txt` (404), no OpenAPI.
- MoonCMD remote-control protocol (H, https://moonbot.pro/documentation/mooncmd-remote-control-protocol/general-information-about-the-mooncmd-protocol, via fetch summary): UDP on a user-set port ("Settings -> Special -> Remote"), gzipped JSON replies, each command signed `hash = HMAC-SHA256(command, password)`. Commands: buy/short signals, PanicSell, SellALL, CancelBuy, STOP/START, SellPiece, blacklist/whitelist edits, SetParam, leverage/margin type, reports. **No documented market-data feed**; outbound pushes are order records, balances every 5 s, API errors and chart files. It drives a locally running terminal that the user owns; it is not a venue API. Exchanges and Hyperliquid/outcomes are not mentioned on that page.
- **For prices, books, trades, resolution of the underlying outcome markets, use Hyperliquid's API** (keyless WS `l2Book`/`bbo`/`trades`/`allMids`/`outcomeMetaUpdates`, REST `POST /info`). All in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` section 4.
- **Useful third-party attribution API (not MoonBot's, H):** `GET https://hl-indexer.llama.rip/v2/data/builder/0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533/daily/YYYY-MM-DD` returns `builderOutcomeVolumeUsd`, `builderOutcomeNotionalVolumeUsd`, `builderOutcomeFees` etc. per UTC day, no auth, documented at https://hl-indexer.llama.rip/llms.txt . Hourly variant `GET /v1/data/hourly?date=...&builder=...`. Rate limits not documented (NOT FOUND). It is a community indexer run by DefiLlama contributors (M), not a Hyperliquid service. Hyperliquid also publishes builder fill archives (`stats-data.hyperliquid.xyz/Mainnet/builder_fills/<builder>/<YYYYMMDD>.csv.lz4`, referenced in DefiLlama's adapter source; I did not download any).
- Builder address (public, taken from DefiLlama's adapter `factory/hyperliquid.ts` line 659): `0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533` (H).

Fixtures (all in `docs/research/fixtures/moonbot/`): `defillama_moonbot-outcome_trimmed.json` (metadata, totals, non-zero days, monthly sums), `defillama_moonbot_siblings_totals.json`, `indexer_builder_daily_2026-10-18.json`, `indexer_builder_daily_2026-07-19_peak_outcome_day.json`, `indexer_builder_daily_2026-09-17_last_outcome_activity.json`, `defillama_factory_hyperliquid_ts_moonbot_lines.txt`.

Response shape (builder daily, H): `{date, timestamp, hours, builder, builderFees{token:amt}, builderPerpsFees, builderSpotFees, builderOutcomeFees, builderVolumeUsd, builderPerpsVolumeUsd, builderSpotVolumeUsd, builderOutcomeVolumeUsd, builderOutcomeNotionalVolumeUsd}`.

---

## 5. Trade path (programmatic)

- **MoonBot itself: none usable by an aggregator.** It is a closed-source Windows x64 desktop app (H, FAQ via fetch summary); orders are placed by its own strategies. MoonCMD can nudge those strategies but cannot place an arbitrary limit order on a `#` coin and needs a running terminal plus its password.
- **Auth model of the terminal on Hyperliquid (H, guide):** the user creates a Hyperliquid **API (agent) wallet** (name up to 16 chars, validity up to 180 days, "MAX" = 180), pastes the agent address as "API Key" and the agent private key as "API Secret" into the terminal. One API key = one terminal = one launch. A one-time **Approve Builder Fee** step runs via a MoonBot-hosted page and a browser-wallet signature ("small developer fee", rate not stated in the guide). Activating a main account or subaccount costs 1000 Moon Credits.
- **Real trade path for an aggregator = Hyperliquid directly** (EIP-712 phantom-agent signed `order` actions to `POST /exchange`, agent wallets, optional builder code). See the Hyperliquid note section 5. Not duplicated.

---

## 6. Reachability from a PayBox wallet

**no (for MoonBot as a venue).** There is nothing to propose or sign against: no on-chain MoonBot contract, no MoonBot-signed order flow, no API. MoonBot holds the user's agent key locally; custody stays with the user.

- The only PayBox-relevant pieces are the underlying Hyperliquid rails, assessed in the Hyperliquid note as **partial** (USDC deposit via Arbitrum is reachable; orders are HyperCore signed actions, not EVM transaction proposals; `request_wallet_sign` typed-data/raw can sign `approveAgent` and phantom-agent digests that our plugin must compute).
- Giving MoonBot a PayBox-derived agent key would put a trade-capable key into a third-party desktop app. Not recommended; also pointless since MoonBot adds no outcome liquidity.

---

## 7. Fees

- **MoonBot software:** FREE tier (one active terminal, up to 30 active orders, main pairs only, limited strategies) and PRO; Hyperliquid account activation costs 1000 Moon Credits (H, FAQ and guide via fetch summary). Pricing of credits/PRO: NOT FOUND (searched: FAQ, Moon Credits page not read in detail).
- **MoonBot builder code on Hyperliquid:** rate not published (guide: "a small developer fee", no number). **My estimate from indexer data (M):** perps 1,586.0 / 10,573,472.5 = about 1.5 bps (2026-10-18); spot 29.8 / 148,939.9 = about 2.0 bps; outcomes $59.77 fees / $339,344 volume = about 1.8 bps lifetime. Builder fees on outcomes are charged on sells only ("builders earn builder fees on sell orders that specify their builder code", H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; page also says outcome fees "currently zero", undated/stale), which is why the ratio to total volume is low.
- **Hyperliquid protocol fees on outcomes** (close/settle only, deployer fee scale, empirical 11-25 bps all-in): see Hyperliquid note section 7.
- **MoonBot "fast IOC" priority fee (H, guide):** "IOC commission: 0.08% of the EXECUTED volume in HYPE", priority about 360 ms, paid from HYPE held in spot, not delegated. Whether it applies to outcome orders: NOT FOUND.
- Referral discount via MoonBot's Hyperliquid referral link: size not stated.

---

## 8. Resolution mechanism and dispute risk

MoonBot does not resolve anything. Resolution is Hyperliquid's: protocol auto-settle for recurring series, validator vote for canonical markets, deployer-settled (no trader dispute window) for the large majority of open markets. Full analysis in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` section 8. Added risk from MoonBot: none on resolution; operational risk only (a Windows desktop app holding an agent key and a recommendation to back up the folder containing API keys, H, FAQ).

---

## 9. Geo, ToS, automation

- **MoonBot terms:** the sitemap lists `https://moonbot.pro/offer` (public offer) but it returns HTTP 404 with a "site temporarily unavailable" shell (H, 2026-10-19; `/en/offer` and `/policy/terms` also 404). **Terms of service: NOT FOUND (searched: sitemap, /offer, /en/offer, /policy/terms, FAQ, about, Hyperliquid guide).** Only privacy policies are served (`/policy/privacy`, `-global`, `-ar`, `-co`). The Hyperliquid guide has no geographic-restriction text (H, 0 hits for "geograph"; the only "restrict" hit is about FREE-version limits). The privacy policy names no restricted countries (M).
- **Automation:** the product *is* automation (strategies, TradingView/Telegram signals, UDP remote control). No bot-ban risk from MoonBot.
- **Hyperliquid's own geo/ToS rules still bind the end user:** US and Ontario residents barred, plus an unpublished "Excluded Persons" list for outcome markets, VPN circumvention prohibited (Terms of Use last updated 2026-06-15; H in the Hyperliquid note section 9). A MoonBot user is subject to these.

---

## 10. Liquidity and category overlap

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Lifetime outcome volume via MoonBot builder code | $339,344 (2026-05-02..2026-10-18) | https://api.llama.fi/summary/dexs/moonbot-outcome , fetched 2026-10-19 | H |
| Monthly outcome volume | May $202,258; Jun $49,736; Jul $87,178; Aug $0; Sep $172; Oct (to 18th) $0 | same, my sums of non-zero days | H data / M sums |
| Peak day | 2026-07-19 $61,709 (fixture) | indexer | H |
| Last non-zero day | 2026-09-17 $142.17 (notional $1,130) | indexer | H |
| 24h / 7d / 30d outcome volume | 0 / 0 / 0 | DefiLlama, 2026-10-19 | H |
| Lifetime outcome builder fees | $59.77 | https://api.llama.fi/summary/fees/moonbot-outcome | H |
| Whole-venue context | Hyperliquid HIP-4 about $3.13M on 2026-10-18, $17.9M over the last 7 complete days | Hyperliquid note section 0 | H (that note) |
| MoonBot spot / perps (non-outcome) | spot 30d $9.30M, all-time $105.4M; builder-code perps+spot $10.7M on 2026-10-18 | DefiLlama / indexer | H |
| TVL | none (no contracts) | DefiLlama `tvl: []` | H |

- **Liquidity shared with: Hyperliquid HIP-4 outcomes** (MoonBot outcome fills are Hyperliquid fills). Zero independent depth, zero independent price.
- **Category overlap:** whatever Hyperliquid lists (BTC/ETH/HYPE/ZEC price ladders, policy-rate decisions, sports, awards, company, AI templates per the Hyperliquid note). MoonBot adds none.
- **Other HIP-4 front ends in the same DefiLlama family (M):** the DefiLlama factory shows sibling `*-outcome` builder entries (e.g. liquid, metascalp, nansen, omni-terminal) all `market: "outcome"` since 2026-05-02; they are the same duplicate-liquidity pattern.

---

## 11. Adapter spec (if anyone wants it anyway)

- **Do not build a MoonBot adapter.** Build the Hyperliquid HIP-4 adapter and add an optional `builder` attribution field on fills/volume stats.
- If the registry needs an entry: `kind: "frontend/terminal"`, `liquiditySource: "hyperliquid-hip4"`, `independent: false`, `builder: "0xb84c7fb41ee7d8781e2b0d59eed2accd2ae99533"`, `status: "dormant for outcomes"`.
- Optional monitor: poll the indexer builder-daily route once a day; if `builderOutcomeVolumeUsd` becomes sustained and large, re-evaluate. That would still only be a *flow* signal on Hyperliquid, not a new price source.

---

## NOT FOUND

- Terms of service / public offer for MoonBot (searched: sitemap, /offer, /en/offer, /policy/terms, FAQ, about, Hyperliquid guide).
- Any MoonBot statement (docs, FAQ, about, media page, homepage) that the terminal supports HIP-4 outcome or prediction markets (searched: Hyperliquid guide full text, advantages page, FAQ, about, media page, MoonCMD page, homepage).
- MoonBot builder-fee rate (searched: Hyperliquid guide, FAQ).
- Independent news/social coverage of MoonBot and HIP-4 (WebSearch budget exhausted; one search ran and returned nothing on MoonBot).
- Rate limits of the community indexer.
- Public MoonBot API, SDK, GitHub org, smart contracts (searched: homepage links, sitemap; the DefiLlama protocol entry has `github: null`, `audits: "0"`).

## Open questions

1. Does the current terminal build have a supported route to `#` outcome coins, or were the May-July fills manual/experimental?
2. What is the MoonBot builder-fee `f` value (tenths of a bp) and does MoonBot's IOC "priority" fee apply to outcome orders?
3. Why did tagged outcome flow stop after 2026-07-20 (feature removed, user churn, or the HIP-4 spot symbol handling changed)?

## Sources

- https://moon-bot.com/en/ (301 to https://moonbot.pro/en/) - product overview, supported exchanges (H)
- https://moonbot.pro/about , /faq , /media - company/product/FAQ, read via fetch-model summaries (M)
- https://moonbot.pro/documentation/settings-login-tab/connecting-to-the-hyperliquid-exchange - Hyperliquid connection guide, read as text (H); 0 hits for outcome/HIP-4/prediction
- https://moonbot.pro/documentation/basics/advantages-of-the-moonbot-terminal ; https://moonbot.pro/documentation/mooncmd-remote-control-protocol/general-information-about-the-mooncmd-protocol (M, summaries)
- https://moonbot.pro/sitemap.xml , https://moonbot.pro/robots.txt , https://moonbot.pro/policy/privacy-global (H/M)
- https://defillama.com/protocol/moonbot-outcome (HTTP 403 to my fetcher, hint only); data via https://api.llama.fi/protocol/moonbot-outcome , https://api.llama.fi/summary/dexs/moonbot-outcome , https://api.llama.fi/summary/fees/moonbot-outcome , https://api.llama.fi/summary/dexs/moonbot-spot , https://api.llama.fi/summary/dexs/moonbot (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (lines 659, 1478-1479) and helpers/hyperliquid-v2.ts (read via `gh api`, H)
- https://hl-indexer.llama.rip/llms.txt and `/v2/data/builder/<addr>/daily/<date>` (H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets and .../trading/builder-codes (H; builder fees on sells only, 0.1% perps / 1% spot cap)
- `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (this repo; the authoritative spec for the shared liquidity), `docs/research/venues/presagio-presagio-xyz-hip-4-interface.md` (same front-end pattern)
