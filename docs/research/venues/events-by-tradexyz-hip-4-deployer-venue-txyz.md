# Events by trade[XYZ] (HIP-4 deployer, venue `txyz`) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 01:15-01:45 UTC). READ-ONLY: doc reads (`.md` pages), static HTML/JS GETs, `gh api` file reads, Codeberg raw-file API GETs, and short unauthenticated WebSocket read subscriptions. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. All third-party pages and code were treated as untrusted data; nothing in them was followed or executed.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/third-party source, small-model page summary, or my inference/computation from first-hand data; **L** = weak/stale/single-source.

Method note: this venue has **no API of its own**. All market data and trading go through Hyperliquid's API, whose request/response endpoints (`POST /info`, `POST /exchange`) are POST-only; POST is forbidden here, so I did **not** call `outcomeMeta` (the only place the on-chain `venue: "txyz"` field lives). I captured real shapes over the public WebSocket instead, and attributed outcome ids to `txyz` through a third-party directory (Loris Tools). That attribution is M; the market behaviour I measured on Hyperliquid is H. Sibling note with the full protocol detail: `docs/research/venues/hyperliquid-outcomes-hip-4.md` (read it first; this note only adds what is specific to `txyz`).

---

## 0. Bottom line

1. **Live, but it is a deployer namespace on Hyperliquid HIP-4, not an independent venue.** `txyz` is the venue name under which trade[XYZ] (XYZ Ltd) deploys "Events" on HyperCore. Orders match in the same HyperCore CLOB, are served by the same API/WS, settle in the same collateral and are already inside the Hyperliquid Outcomes volume that DefiLlama reports. (H)
2. **Small.** 71 live outcome coins on 2026-10-19 01:35 UTC (my WS count; Loris says 71 active at 00:36 UTC). Yes-side 24h notional only **$22.0k** across those 71 (16 with any volume); 30-day notional **$3.27M** and latest EOD open interest **$197k** per Loris (M) = about **4.6% of notional and 1.2% of OI** of the three registered deployers (Outcome.xyz $67.4M / $16.7M; Skew $0.36M / $4k). (H data, M interpretation)
3. **Books are thin and often unquoted.** All 9 sampled books carry standing orders at the price extremes (0.00025/0.99975 and 0.00001/0.99999); daily Up/Down (`binaryPrice`) books were effectively unquoted (best bid about 0.02, best ask about 0.9996, zero 24h volume) at the time of capture. Only sports spreads/totals/moneylines showed two-sided ladders (2-3 cent spreads, about $0.5-2.5k per level). (H, fixtures)
4. **Resolution is issuer-controlled.** XYZ Ltd selects the sources, decides the result and submits the settlement; its Terms say there is **no formal challenge or appeal process** unless the market rules provide one, and a settled result is not automatically reversed. (H, Terms 1.6)
5. **Geo is stricter than Hyperliquid's:** Terms bar persons in or subject to the laws of the **US, Canada or UK** (plus sanctioned jurisdictions); 18+ for Events. (H, Terms 2.2)
6. **adapter_priority = skip as a standalone adapter.** Do not build a `txyz` adapter. Build the Hyperliquid Outcomes (HIP-4) adapter (P1 in its own note) and carry `deployer_venue = "txyz"` as an attribute so the linker can (a) apply txyz's resolution rules (ESPN; xyz-perp 5-minute TWAP; 0.5 on ties/no-result), (b) apply `deployerFeeScale`, and (c) down-weight a txyz leg that has only sentinel quotes.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Official docs site documents Events by trade[XYZ] (architecture, mechanics, resolution, spec index, fees, risks) | https://docs.trade.xyz/events.md and sub-pages, fetched 2026-10-19. Pages are undated; architecture table header says "Draft status" | H |
| Terms of Use "Last Updated: September 6, 2026" with dedicated Events clauses (1.6, 1.7, 2.2, 4.1.10-11) | https://trade.xyz/terms (server-rendered HTML read as text) | H |
| App bundle hard-codes the venue: `venue:"txyz",displayName:"txyz"` on mainnet | static JS chunk of https://app.trade.xyz read as text | H |
| Live Hyperliquid WS, 2026-10-19 01:35 UTC: 71 `#<10*outcome>` coins from the Loris `txyz` directory answered `activeAssetCtx` (all 71 present in `allMids`) | fixture `derived_txyz_live_outcomes_ctx.json` | H data / M attribution |
| Latest fills seen on txyz-attributed coins: 2026-10-19T01:20:25Z, 00:05:13Z, 2026-10-18T23:15:54Z, 20:56:31Z | fixture `ws_trades_txyz_redacted.json` | H |
| Third-party tracker: 1,035 tracked markets, 71 active, 30d notional $3.27M, "Data updated Oct 19, 2026, 12:36 AM UTC" | https://loris.tools/hip4/txyz (HTML GET) | M |
| Team's feed repo has commits through 2026-09-29 ("Support the templates that went live on mainnet 2026-09-29") | https://codeberg.org/hl-fan/hip4-markets (commits API) | M |

Verdict: **still_live = true.** Launch date of `txyz` on mainnet: NOT FOUND (searched docs.trade.xyz, Terms, Codeberg history; WebSearch budget was exhausted so no news search was possible). The Loris `txyz` directory spans outcome ids 1633 to 13391 (fixture), but I cannot date them.

Hint check: the lead that the product may be branded "unit.xyz" / run by Unit Labs (KuCoin/Odaily, 2026-08-31) is **not supported**: the docs and Terms name "trade[XYZ]" and the contracting entity **XYZ Ltd** (BVI law). I did not find any Unit Labs link (NOT FOUND in docs.trade.xyz, Terms, app.trade.xyz). (H for what the docs say, NOT FOUND for the Unit link)

---

## 2. Kind and market model

- **Kind (H):** on-chain central limit order book on HyperCore, via Hyperliquid HIP-4 "outcomes". "Fully collateralized outcome contracts ... no leverage, funding, liquidations, or auto-deleveraging" (https://docs.trade.xyz/events.md).
- **Tokenisation (H):** each outcome has two tokens (Yes/No, or template side names). Coins `#<10*outcome>` (Yes) and `#<10*outcome+1>` (No); order asset id `100000000 + 10*outcome + side`. The two sides share **one merged book**: "buying Yes at price p is equivalent to selling No at 1 - p" (https://docs.trade.xyz/events/event-contract-mechanics.md; asset-ids page via sibling note).
- **Binary, scalar-capable, categorical via questions (H):** standalone Yes/No outcomes; multi-way "questions" (one outcome settles Yes, the rest No, plus an automatic "other" fallback); standalone outcomes may settle to a fraction (`settleFraction` in [0,1]). txyz uses 0.5 settlements for ties/no-result in several templates (section 9).
- **Template kinds seen on txyz (M, Loris labels + team repo + spec index):** `binaryPrice` / `binaryPrice4` (xyz-perp or HL-perp Up/Down; Loris labels 671 of the 1,035 historical ids `template:binaryPrice`), `sportsSpread` (45), `sportsTotal` (45), `sportsContestParticipant2` (38) and `sportsContestDraw2` (19) (3-way matches), `sportsOverUnderMarket` (10), named team/fighter/player outcomes (NFL, NCAAF, MLB championship, tennis, UFC), `companyIpoConfirmed`, `companyIpoFirstDayMarketCap`, `policyRateNoChange/Decrease/Increase`, `binaryPriceExternal`. 17 market types are listed in the official spec index (section 12).
- **Price domain (H, live books):** probabilities in (0,1), 5 significant figures, integer share sizes, $1 per share at settlement. Tick/min size/min notional: NOT FOUND in official docs (see sibling note).
- **Identity strings:** on-chain `name = "template:<id>"` and `description = key:value|key:value` (sorted keys), e.g. `perp:BTC|priceDescription:Hyperliquid BTC-USD perp mark|seconds:300|threshold:70000|time:20260930-1200` for `binaryPrice4`, `competition:...|participantA:...|participantB:...|resolutionDeadline:...|scheduledStart:...|officialSource:...` for sports (from the team's repo README; the Premier League example there is a testnet `ap` deployer sample, not txyz). (M)

---

## 3. Chains and collateral

- **Venue chain:** HyperCore (Hyperliquid L1), not an EVM chain. (H)
- **Collateral:** the HIP-4 "quote token"; docs.trade.xyz never names it (NOT FOUND in the Events pages). Hyperliquid's own docs show `"quoteToken": "USDC"` in the outcome settlement sample and the sibling note records the USDH-to-USDC migration (June 2026) (H sample, M migration). Treat as **USDC**.
- **Funding in:** via Hyperliquid (Arbitrum USDC deposit, minimum 5 USDC) per the sibling note (H there). The trade[XYZ] interface logs in through Privy/WalletConnect (app bundle references `auth.privy.io`, `explorer-api.walletconnect.com`) (H). Deposit routes offered by the interface: NOT FOUND (SPA, not read).
- **Withdrawal:** not researched.

---

## 4. Read API

There is **no trade[XYZ]-specific API**. "Events use Hyperliquid's public APIs and onchain state. Hyperliquid data remains authoritative for market existence, balances, orders, and settlement." (https://docs.trade.xyz/events/developer-resources.md, H).

| Item | Value | Tag |
|---|---|---|
| Docs | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (index `.../llms.txt`, every page also at `.md`) | H |
| Base URLs | REST `https://api.hyperliquid.xyz/info` and `/exchange` (POST), WS `wss://api.hyperliquid.xyz/ws`; testnet `api.hyperliquid-testnet.xyz` | H |
| Auth | none for market data | H |
| Rate limits | REST 1200 weight/min per IP (`l2Book`/`allMids` weight 2, other documented info requests 20); WS max 10 connections, 30 new connections/min, 1000 subscriptions, 2000 messages/min | H (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md) |
| Universe + venue tag | `POST /info {"type":"outcomeMeta"}`. The team's parser reads top-level `deployers[]` (`{deployer, venue}`), `outcomes[]` (`outcome`, `name`, `description`, `sideSpecs`, `venue`, `deployerFeeScale`) and `questions[]` (`fallbackOutcome`, `namedOutcomes`, `settledNamedOutcomes`); filter `outcome.venue == "txyz"`. Not called by me (POST). | M (third-party code: `src/hip4_markets/parse.py`, read via Codeberg raw API); HL docs say `outcomeMeta` "includes non-null outcome deployers" and returns per-outcome fee scales (H) |
| Templates | `POST /info {"type":"outcomeTemplates"}` (28 on mainnet per the repo/tracker, M) | H (docs), M (count) |
| Quotes | WS `l2Book`, `bbo`, `allMids`, `activeAssetCtx` for `#<10*outcome>` (Yes coin only; merged book) | H (captured) |
| Trades | WS `trades` for the Yes coin (snapshot of last <=30 fills on subscribe, then live) | H (captured) |
| Volume / OI | WS `activeAssetCtx`: `dayNtlVlm`, `circulatingSupply` (shares outstanding, $1 each = OI proxy), `markPx`, `midPx`, `prevDayPx` | H (captured) |
| Resolution data | `POST /info {"type":"settledOutcome","outcome":N}`; WS `outcomeMetaUpdates` (only changes; **no snapshot**: my capture of about 8 minutes (01:33-01:42 UTC) saw only the ack) | H (docs + capture) |
| Bulk/other | Team-maintained, self-hosted convenience feed `uv run hip4-markets --deployer txyz --network mainnet` serving `GET /markets`, `/markets/<coin>`, `/health` on localhost (polls `/info` every 15 s; optional best-effort Kalshi/Polymarket reference ids). "Not a canonical market registry"; MIT licence; **do not install or run it** - use the same `/info` calls directly. | H (docs.trade.xyz live-market-feed page), M (repo contents) |
| Third-party analytics | Loris Tools `/hip4/txyz`, `/hip4/leaderboard/txyz`, `/hip4/{outcome id}` (HTML dashboards; its paid REST API lists HIP-4 only on paid plans; endpoints undocumented) | M |

**Live shapes captured (fixtures in `docs/research/fixtures/events-by-tradexyz-hip-4-deployer-venue-txyz/`):**

| Fixture | What it shows | Kind |
|---|---|---|
| `ws_l2Book_txyz_samples.json` | real `l2Book` frames for the 4 most active txyz coins (sports spread/total/moneyline) | live WS |
| `ws_l2Book_txyz_binaryPrice_and_spread.json` | 5 more books + `activeAssetCtx` (4 Up/Down `binaryPrice`, 1 spread) | live WS |
| `ws_trades_txyz_redacted.json` | last fills per coin, counterparty addresses redacted by me | live WS |
| `derived_txyz_live_outcomes_ctx.json` | per-coin `dayNtlVlm`, `circulatingSupply`, mid/mark for the 71 live txyz coins, plus totals | derived by me from WS |
| `loris_txyz_outcome_directory.json` | 1,035 txyz outcome ids -> Loris label (the attribution key) | third-party HTML GET |
| `loris_deployer_snapshot_2026-10-19.json` | headline 30d stats for txyz, Outcome.xyz, Skew | third-party HTML GET |
| `DOCS_NOT_LIVE_txyz_architecture_fees_resolution.json` | deployer address, fee scale, rate table tier 0, spec-index types, resolution rules | docs, not live |
| `DOCS_NOT_LIVE_outcomeMeta_venue_shape_from_parser.json` | inferred `outcomeMeta` venue fields | third-party code, not live |

Gotchas seen live (H unless noted):
- **Sentinel quotes.** All 9 sampled books carry standing orders at the price extremes (bids 0.00025 x 20,000 and 0.00001 x 100,000; asks 0.99975 x 20,000 and 0.99999 x 100,000). Two of the four most-active books (`#132620`, `#132470`) had *only* sentinels on both sides (best bid 0.00025 / best ask 0.99975), so `midPx` reads exactly 0.5 while `markPx` was 0.65 / 0.24; a third (`#117990`) had a real bid (0.98625 x 2) but only a sentinel ask. 14 of 71 live coins had `midPx == "0.5"`. An adapter must ignore levels outside a sanity band (e.g. < 0.01 or > 0.99) and refuse to publish a mid when either side is sentinel-only. Whose orders these are is unknown (M: protocol floor orders, a market maker or the deployer; other deployers' books were not checked).
- Thin real depth: `#132750` (sports total) bids 2,272 shares per level at 0.218-0.205, asks 649 per level from 0.2386 (about $0.5k-0.6k per side per level); `#132650` (spread) 2,631 shares at 0.188 vs 633 at 0.216.
- Merged book: subscribe Yes only; derive No (`bid_no = 1 - ask_yes`).
- Trades come as duplicated per-order rows; dedupe on `(time, tid)`.
- Settled markets drop out of the live set; persist results on receipt (sibling note: settlement details are pruned from L1 state).

---

## 5. Trade path

Identical to Hyperliquid HIP-4 (full detail in the sibling note, section 5):

- Signed actions to `POST https://api.hyperliquid.xyz/exchange`: L1 actions (orders, cancels, split/merge/negate) use the msgpack "phantom agent" signed as EIP-712 (chain id 1337 domain); user-signed actions (`approveAgent`, `approveBuilderFee`, withdrawals) use EIP-712 with an Arbitrum `signatureChainId`. Outcome orders: `a = 100000000 + 10*outcome + side`. An approved **agent (API) wallet** can sign orders on behalf of the master account. (H, HL docs)
- The trade[XYZ] interface does exactly this: its bundle has `approveAgent` / `approveBuilderFee` flows and keeps an agent key in browser storage under a `txyz_<mainnet>.agent` key, with Privy/WalletConnect login (H, static JS read as text). Whether orders placed through the interface carry a trade[XYZ] builder fee, and at what rate: NOT FOUND (builder address and rate not found in the 48 chunks I read; docs.trade.xyz fee page lists only Hyperliquid's base rates). Builder codes can also be charged on outcome *buys* per the HL deployer-actions page (H).
- trade[XYZ] says it "is not the exclusive means of accessing `txyz` markets" (https://docs.trade.xyz/events/architecture.md, H), so direct API trading is the intended-by-design route; the Terms nonetheless cover the Interface (section 10).

---

## 6. Reachability from a PayBox wallet

**partial** (same as the Hyperliquid HIP-4 note, section 6; evidence there is H from live `discover_*` calls; I did not re-run PayBox tools).

- Orders are not EVM transaction proposals. They are Hyperliquid-signed actions; PayBox's `request_wallet_sign` supports `typedData`, so a one-time `approveAgent` and, in principle, per-order EIP-712 signing are possible, but per-order human-in-the-loop signing cannot meet arbitrage latency. The practical design is an approved agent key held by our service (docs/research/06-paybox-platform.md, section 4). (H/M)
- Funding is reachable: USDC on Arbitrum is in PayBox's chain set (06-paybox-platform.md); PayBox's chain list shows "Hyperliquid (999)" which is HyperEVM, the wrong layer for HyperCore books. PayBox's official `hyperliquid` plugin is spot-browse only. (H, prior notes)
- Geo: a PayBox user in the US, Canada or UK is a Restricted Person for the trade[XYZ] Interface; a plugin must surface this before enabling txyz-tagged trading. (H, Terms 2.2)

---

## 7. Fees

- **Who/when (H, https://docs.trade.xyz/events/fees.md and https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, "Outcome tokens"):** fees are charged **only when a position is closed or settled, not on opening**; minting (split) is free; **no maker rebates** on outcomes (a would-be rebate maker pays zero). Only fee-paying volume counts toward tiers. Same fee tier as spot/perps, HYPE-staking discounts apply (5% at >10 HYPE up to 40% at >500,000 HYPE).
- **txyz deployer fee:** `deployerFeeScale = 0` "for every standalone outcome or question" at launch; questions' outcomes inherit the question's scale (H, docs.trade.xyz fees + architecture, architecture table marked "Draft status"). With HL's formula (user pays base x `(scale + max(scale,1))`) a scale of 0 means **1x base**, and txyz receives nothing. Read the per-outcome scale live from `outcomeMeta`; it can change per market (scale up to 10 = 20x base per the HL deployer-actions page, H).
- **Base rates, tier 0 (docs.trade.xyz table, H):** taker 0.070%, maker 0.040% of notional; tiers fall to taker 0.025%, maker 0% by >$7B 14-day weighted volume (spot schedule). I read this as: a position bought and sold pays the rate once (on the exit), roughly half the round-trip cost of a spot trade (M, my inference; consistent with the "half of spot" claim in the sibling note).
- **Observed:** Loris reports $454 total fees on $3.27M 30-day notional (1.4 bps) for txyz; compare Outcome.xyz $39.4k on $67.4M (5.8 bps). Definition of Loris "fees" unverified (M/L).
- **Settlement-fee mechanics** (how `settle_fraction * sz` volume converts to a fee at expiry): official numeric formula NOT FOUND beyond the volume-credit rules on the HL fees page.
- **Other:** USDC bridge in/out, possible interface builder fee (NOT FOUND).

---

## 8. Resolution mechanism and dispute risk

Two stages (H, https://docs.trade.xyz/events/resolution.md): (1) the market's published methodology determines the result from its declared source; (2) the `txyz` outcome deployer (`0x88806a71D74ad0a510b350545C9aE490912F0888`) or an authorised sub-deployer (`0x8EF95FA212D22448c9c7eAFa277b4c8bbf3f9D57`) submits `settleOutcome`/`settleQuestion2`; HyperCore only checks authorisation, "not that an offchain fact is true" (H, architecture page + Terms 1.6).

| Market family | Rule (H, docs.trade.xyz resolution + spec index) | Arb basis risk |
|---|---|---|
| Daily Up/Down on xyz HIP-3 perps (SK Hynix, Gold, WTI, XYZ100, Micron, SNDK, SpaceX/SPCX, Nvidia) and HL perps | Yes iff the **5-minute TWAP** (mean of five 1-minute candles' `(high+low+close)/3` from Hyperliquid's candle endpoint) of the referenced perp is **strictly greater** than the strike; equal -> No. Resolution times follow the equity session (e.g. 4:00 pm ET) and there are separate weekend strike/resolution windows | Reference is a Hyperliquid perp, not the exchange official close/Chainlink; strict ">" with tie -> No |
| Sports (NFL, NCAAF, MLB, soccer, UFC, tennis) | **ESPN** is the declared source unless the market terms say otherwise. Tie, no-contest, "no winner", or "no result established by the resolution deadline" -> **0.5** in several templates (NFL, NCAAF, MLB, soccer two-team, UFC). Soccer counts regulation + stoppage time only (no extra time/penalties). **Soccer spec: final one hour after ESPN records completion, later appeals/corrections do not change it (other sports templates not all read)** | Differs from venues that void, refund or pay the draw leg; same title is not same payoff |
| IPO Confirmed by Date | Confirmation = regulator approval/clearance, or final price+share count published, or unconditional exchange approval; evidence up to 7 days after the deadline may be used | Text-heavy; compare field by field |
| Policy rate | official-source decision (templates `policyRateNoChange/Decrease/Increase`); wording not re-read (sibling note H for `policyRateDecision`) | Good alignment with Kalshi/Polymarket Fed markets |

**Dispute risk is high and concentrated (H, Terms 1.6 and docs risk page):** the deployer is also the Interface operator and picks sources and result; "If a source or technical failure, ambiguity, or other exceptional circumstance prevents ordinary resolution, we may delay resolution and determine the appropriate treatment"; "Unless the Event Rules expressly provide otherwise, there is no formal outcome challenge or appeal process. Once settlement is applied onchain, a later source correction, changed determination, or discovery of an error does not automatically reverse it." Protocol-level backstop (M, sibling note): validators can slash a deployer's stake for poorly defined or incorrectly settled markets; no trader-initiated path. The risk page also lists "compromised credential" and "anomalous settlement submission" as risks (H).

---

## 9. Geo, ToS and automation (primary source, H)

Source: https://trade.xyz/terms, "Last Updated: September 6, 2026", parties: you and **XYZ Ltd**, operating `app.trade.xyz`.

- 2.2 Restricted Persons: residents/located/incorporated/"otherwise subject to the laws of the United States of America, Canada, the United Kingdom, or certain other jurisdictions we may designate in our sole discretion", plus comprehensively sanctioned jurisdictions (Crimea, Cuba, Iran, North Korea, Syria, Myanmar, Donetsk, Luhansk and similar), their citizens, and sanctioned persons. Separately in section 2: **at least 18** to access or participate in Events. The list of "other jurisdictions" is not published (NOT FOUND).
- 2.3: no VPN/proxy/Tor to circumvent geo-blocks. 2.4: you warrant that prediction-market/event-contract activity is lawful where you are.
- 4.1.7: prohibits bots/scripts "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions, or disrupt" the Interface, Protocol, Hyperliquid. 4.1.5: no data mining/scraping of **Interface** content without permission. No separate API or automated-trading policy exists in the Terms (H absence). The Terms govern the Interface; whether they bind direct HyperCore API users is a legal question I did not resolve. Reading public HL market data needs no account.
- 4.1.10-4.1.11: no wash trading/spoofing/manipulation of a referenced market, source or resolution; no trading on material non-public information or where you can influence the outcome.
- Law/disputes: British Virgin Islands law; 30-day informal resolution by email, then individual binding arbitration (BVI IAC, seat Road Town, sole arbitrator, English); no class actions; claims within 12 months (section 9 of the Terms).
- Hyperliquid's own Interface terms (US + Ontario barred; "Excluded Persons" for outcome markets) are in the sibling note; txyz's list (US, Canada, UK) is broader for the trade[XYZ] Interface.

---

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| 30d notional | **$3.27M**; 13,853 trades; 581 unique traders; fees $454.00 | https://loris.tools/hip4/txyz, "Data updated Oct 19, 2026, 12:36 AM UTC" | M |
| Peer deployers, same page type/date | Outcome.xyz $67.44M / 1.95M trades / 3,748 traders / OI $16.67M / 161 active; Skew $359k / OI $4.08k / 61 active. txyz share of three: 4.6% of notional, 1.2% of OI | loris.tools, same stamp (fixture `loris_deployer_snapshot_2026-10-19.json`) | M |
| Latest EOD open interest | $197.33k (txyz) at the 00:36 UTC stamp; an earlier stamp (2026-10-18 21:51 UTC) showed $187.49k. A market that is not in the live set (`/hip4/4965`) showed a latest EOD OI of $157k on its own page, so Loris OI may include settled markets | loris.tools | M/L |
| Live 24h notional, Yes-side coins | **$22.0k** across 71 live coins; 16 coins non-zero. By family: sportsSpread $13.6k, sportsTotal $4.3k, named team/fighter $4.1k, policy rate $30, binaryPrice $0.78 | my WS sweep 2026-10-19 01:35 UTC | H data |
| Shares outstanding (OI proxy) | 491,765 Yes shares = at most ~$0.49M of locked collateral across 71 coins (51 non-zero); this proxy is 2.5x Loris's txyz OI, and Loris's three-deployer OI sum ($16.9M) is about 7x the sibling note's $2.35M HL-wide proxy, so Loris OI definitions are unreliable (L) | same sweep | M |
| Time profile | 30d volume sits in sports weeks: top-25 30d markets are NFL/NCAAF games (e.g. Ole Miss vs Florida $60.6k, Eagles vs Bears $57.1k) and a few `binaryPrice` ids ($28k-$120k, 7-14 traders each); none of those 25 is live now | loris.tools top-25 table vs live set | M |
| Concentration | Top all-time trader on txyz about $2.18M volume (9,594 trades, 460 markets) among 890 traders: volume is dominated by one or two accounts | https://loris.tools/hip4/leaderboard/txyz, snapshot 2026-10-18 18:16 UTC (WebFetch summary) | M/L |
| DefiLlama | No `txyz` line (attribution there is by builder code; Hyperliquid Outcomes 24h $3.13M, 30d $47.0M, all-time $261M on 2026-10-19 covers all deployers) | https://api.llama.fi/overview/dexs (fetched 2026-10-19) | H |

Reading: tens of thousands of dollars a day outside sports weekends, sub-$1M OI, one or two dominant traders. Not enough for an arbitrage leg except as an occasional sports-spread/total or moneyline quote.

---

## 11. Event categories and cross-venue overlap

| Category on txyz | Examples (H spec index / M Loris labels) | Overlaps | Arb quality |
|---|---|---|---|
| **Sports - winners** | NFL, NCAAF, MLB game and championship winners, soccer match winner (with draw legs), UFC contest winner, tennis (US Open winner/match, now past) | Polymarket, Kalshi, SX Bet, Azuro, Smarkets | Best overlap; ESPN-based resolution with 0.5 tie rules and "final one hour after completion" must be compared to the counter-venue text |
| **Sports - spreads/totals** | 45 `sportsSpread`, 45 `sportsTotal`, 10 over/under templates historically; the only live family with volume | Kalshi (team's repo maps spreads/totals to Kalshi lines), Polymarket (nickname labels, riskier) | Line must match exactly; the team's own README warns matching is best-effort and a wrong mapping prices "a different game, or the opposing side" |
| **Equity/commodity/index Up/Down daily** | SK Hynix, Gold, WTI, XYZ100 (Nasdaq-100 style), Micron, SNDK, SpaceX (SPCX), Nvidia; 39 live coins but unquoted at capture | Kalshi/Polymarket daily "up or down" and index range markets | Reference mismatch (Hyperliquid xyz perp 5-minute TWAP vs exchange official close); effectively no liquidity now |
| **Crypto price** | `binaryPrice4` on HL perps (the README example is BTC) | Polymarket, Kalshi, Limitless, Predict.fun | Possible, but crypto price volume lives mainly in Hyperliquid's protocol-recurring and Outcome.xyz markets; no live txyz crypto ladder identified |
| **Macro / Fed** | `policyRateNoChange/Decrease/Increase` (live ids 4886-4888; institution not read) | Kalshi, Polymarket | Mids on those books read 0.74 / 0.13 / 0.50 and do not sum to 1 (thin books), so unusable as prices today |
| **IPO** | `companyIpoConfirmed`, `companyIpoFirstDayMarketCap` (8 live coins, no volume) | Polymarket, Kalshi | Thin, text-risk |

The same real-world fixture may also be listed by **other HIP-4 deployers** (Outcome.xyz, Skew) as separate books on the same CLOB with different resolution authorities; that is an intra-Hyperliquid comparison, not a cross-venue one (NOT verified: I could not read titles for the other deployers' live markets).

---

## 12. Does it share liquidity with another venue?

**Yes, with Hyperliquid Outcomes (HIP-4) - it is a slice of it, not an independent leg.** Same HyperCore matching engine, same accounts and collateral, same API/WS, same fee schedule; trade[XYZ] itself says it "provides a non-custodial interface" and is "not the exclusive means of accessing txyz markets" (H). Other front-ends (Outcome.xyz, Liquidiction, etc.) can trade the same txyz books via builder codes, so any DefiLlama "Interface" volume for those is the same fills. Each outcome has its **own** book, so txyz books are not merged with other deployers' books for the same event. I found no evidence that txyz books mirror Polymarket, Kalshi or any other venue (NOT FOUND: searched docs.trade.xyz, Terms, team repo). The xyz HIP-3 perps are a hedge instrument for the Up/Down markets, not shared liquidity.

---

## 13. Adapter spec (as a tag on the Hyperliquid HIP-4 adapter)

- Do not create a separate venue. In the HL adapter, store `deployer_venue` from `outcomeMeta.outcomes[].venue` and map `deployers[]` address -> venue name (`txyz` = `0x88806a71D74ad0a510b350545C9aE490912F0888`).
- Per txyz leg also store: template id, `deployerFeeScale`, expiry/resolution deadline, ESPN/xyz-perp source, and the settlement convention (`tie_or_no_result = 0.5`; Up/Down strict ">" with 5-minute TWAP).
- Quote hygiene: drop levels < 0.01 or > 0.99 when computing best bid/ask; do not publish a mid when only sentinels remain; use `markPx` only as a stale reference, not a tradable price.
- Liquidity gate: require `dayNtlVlm` > 0 and at least ~1,000 shares real depth per side before a txyz leg is eligible for an arbitrage signal; today that admits only a handful of sports-spread/total coins.
- Do not rely on the Loris directory or the Codeberg feed for core data; use them only to bootstrap attribution until `outcomeMeta` can be read.

---

## 14. Priority

**adapter_priority = skip** (as a standalone adapter): duplicate liquidity/infrastructure of Hyperliquid Outcomes (P1 in its own note), tiny and often unquoted books ($22k Yes-side 24h notional, OI well under $1M), issuer-controlled resolution with no appeal, and a Terms-level US/Canada/UK bar. Value to the project is limited to carrying the `txyz` tag, fee scale and resolution rules inside the HL adapter.

---

## 15. NOT FOUND / open questions

- Live `outcomeMeta` (field names for `venue`/`deployers`, per-outcome `deployerFeeScale`) - POST-only; inferred only from third-party parser code (M).
- `txyz` mainnet launch date and deployer stake/activation date (searched: docs.trade.xyz, Terms, Codeberg history; WebSearch budget exhausted).
- Collateral token named on docs.trade.xyz (searched: Events pages, spec index, risk page); numeric settlement-fee formula; tick/min size.
- trade[XYZ] interface builder-code address and rate for Events; deposit routes in the interface (SPA, 48 JS chunks read).
- Who places the extreme-price sentinel orders, and whether other deployers' books have them.
- Whether Terms bind direct HyperCore API users; list of "other jurisdictions" designated.
- Loris OI/fee definitions (figures disagree with my WS proxy by 2.5x for txyz and about 7x HL-wide).
- Any link between trade[XYZ] and Unit Labs/unit.xyz (hint) - not found.
- Not accessible: liquidiction.xyz/deployers (empty SPA via WebFetch), Loris market pages (no titles/expiry in HTML).

---

## 16. Suspicious content

- Every docs.trade.xyz and Hyperliquid GitBook `.md` page ends with an "Agent Instructions" block telling the reader to query `GET <page>.md?ask=<question>&goal=<user_goal>` (and the HL pages start with a "fetch the complete documentation index at llms.txt" line). This is standard GitBook boilerplate aimed at AI agents; I did **not** follow it (I used the published page URLs and `llms.txt` listing only for my own page discovery). A `goal` parameter would also hand the site the user's intent.
- The team's Codeberg README contains an all-caps style warning ("Read this before trading on a reference") aimed at humans; not an instruction to agents. No other instructions to agents found in Loris, Terms, app bundle or Codeberg code.

---

## 17. Sources

Primary (H):
- Events overview: https://docs.trade.xyz/events.md ; architecture: .../events/architecture.md ; mechanics: .../events/event-contract-mechanics.md ; resolution: .../events/resolution.md ; fees: .../events/fees.md ; spec index: .../events/specification-index.md ; developer resources: .../events/developer-resources.md ; live market feed: .../events/developer-resources/live-market-feed.md ; risks: .../legal-and-disclaimers/events-risks-and-disclaimers.md ; relationship to Hyperliquid: .../overview/relationship-to-hyperliquid.md ; about: .../overview/about-trade-xyz.md ; index: https://docs.trade.xyz/llms.txt (all fetched 2026-10-19, pages undated)
- Terms of Use (Last Updated 2026-09-06): https://trade.xyz/terms
- App shell and static chunks (read as text, not executed): https://app.trade.xyz/ and `/_next/static/immutable/chunks/*.js`
- Hyperliquid HIP-4 page: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; deployer actions (testnet-only banner): .../for-developers/api/hip-4-deployer-actions ; info endpoint (spot/outcomes): .../for-developers/api/info-endpoint/spot ; fees: .../trading/fees ; rate limits: .../for-developers/api/rate-limits-and-user-limits
- Live WS: `wss://api.hyperliquid.xyz/ws` (2026-10-19 01:33-01:45 UTC; subscriptions `allMids`, `activeAssetCtx`, `l2Book`, `trades`, `bbo`, `outcomeMetaUpdates`)
- DefiLlama: https://api.llama.fi/overview/dexs ; adapters via `gh api repos/DefiLlama/dimension-adapters/contents/dexs/hyperliquid-outcome/index.ts` and `factory/hyperliquid.ts`
- Sibling notes: `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md`

Secondary (M/L):
- Loris Tools: https://loris.tools/hip4/txyz , https://loris.tools/hip4/outcomexyz , https://loris.tools/hip4/skew , https://loris.tools/hip4/leaderboard/txyz , https://loris.tools/hip4/4965 , https://loris.tools/api (HTML/WebFetch summaries, 2026-10-18/19)
- Team feed repo (read via Codeberg API only, never cloned): https://codeberg.org/hl-fan/hip4-markets (README, `src/hip4_markets/{hl,parse,poller}.py`, commit list)
- https://liquidiction.xyz/hip4 (template/deployer count only: "28 approved templates ... 3 registered deployers")
- Discovery hint: KuCoin/Odaily 2026-08-31 (not re-opened)

---

## 18. Privacy

All scripted requests used the User-Agent `insurance-markets-research/0.1` (curl); the three small Node WebSocket scripts send no custom headers and were grepped for `@` before running (no hits). No personal identifier appears in any request, query string, fixture or note. Counterparty wallet addresses in the trades fixture are redacted; the only addresses recorded are the venue's published deployer and sub-deployer addresses.
