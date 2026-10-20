# Phantom prediction markets (Kalshi via DFlow, plus World) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: raw `curl` GETs of Phantom, DFlow and DefiLlama public pages and APIs (User-Agent `insurance-markets-research/0.1`), WebFetch of three news pages, `gh api` raw read of one public DefiLlama adapter, and read-only PayBox calls (`discover_plugins` x3, `discover_services` x1, `get_contract paybox://plugins/world`, `use_plugin` for the read tools `world_get_events` and `world_orderbook` only). No account, wallet, key, signature, POST/PUT/DELETE, payment, or money/signing PayBox tool was used. Third-party text was treated as untrusted data. The WebSearch budget was exhausted after one query, so two leads from the discovery hint could not be chased (section 12).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, sibling note, or my inference/computation from first-hand data; **L** = weak or stale.

Fixtures (each <= 50 KB): `docs/research/fixtures/phantom-prediction-markets-kalshi-via-dflow-plus-world/` (section 14).

Sibling specs this one routes to: `docs/research/venues/world.md` (the current backend, P2), `docs/research/venues/dflow-prediction-markets.md` (the retired Kalshi backend, skip), `docs/research/venues/phantom-outcome-markets-access.md` (a separate DefiLlama Hyperliquid row, skip).

---

## 0. Bottom line

1. **Phantom is a front end, not a venue.** It is a self-custody wallet with a mobile-only "Predict" tab. It has no order book, no pool and no market of its own; its disclosures say it does not "take positions against users" and "does not take custody of your funds or the tokenized prediction market positions" (H, https://phantom.com/prediction-market-disclosures).
2. **Two backends, one live.** Positions opened before 2026-06-01 are "Kalshi via DFlow"; positions opened on or after 2026-06-01 are "World Prediction Markets" (H, same page, dated Jul 1, 2026). The help article now says only "Markets in Phantom are powered by World Prediction Markets on Solana" (H). So the "Kalshi via DFlow" half of the venue name is legacy: no new positions, wind-down settlement only.
3. **No public API and none planned.** Phantom's help center: "Can I build on prediction markets in Phantom? No. Phantom does not offer a public API for this feature, and external development is not supported." (H, https://help.phantom.com/articles/47187740851731).
4. **Not an independent arbitrage leg.** The live leg is World's liquidity (same pool as world.xyz and the PayBox `world` plugin); the legacy leg was 100% Kalshi liquidity (section 11).
5. **adapter_priority = skip.** Keep a route record so the scanner never counts Phantom as a pool and prices Phantom-originated routes correctly (section 12). Build any World adapter against `world.md`, not against Phantom.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Phantom help article, fetched 2026-10-19 | Live product. "Predict" tab in the mobile app; "Markets in Phantom are powered by World Prediction Markets on Solana"; "Some older markets may no longer appear in discovery. If you already have an open position, you can still view it and sell/close it." No date on the page. | H |
| Phantom disclosures page, dated "Jul 1, 2026" | Provider split at 2026-06-01 (Kalshi via DFlow before, World on/after). | H |
| Phantom homepage, 2026-10-19 | "Trade big moments in culture with Prediction Markets"; "Trusted by a community of 20+ million users". | H |
| https://phantom.com/prediction-markets and https://phantom.com/learn/crypto-101/prediction-markets (2026-10-19) | Still say "powered by Kalshi via DFlow". Stale copy (the learn page and blog are from Dec 2025, older than 6 months); they contradict the help article and disclosures. Trust the disclosures. | H (that they say it), L (as current) |
| Crowdfund Insider, 2026-06-30 | Phantom moved new trades to World for positions opened on/after 2026-06-01; pre-June positions stay on Kalshi-via-DFlow and "still require manual settlement". | M (WebFetch summary) |
| Yahoo Finance, 2026-07-02 | World launched 2026-07-01 and is live in Phantom; Phantom "roughly 20 million users"; launch markets were short-duration BTC up/down and 2026 FIFA World Cup. | M |
| World backend live | `world_orderbook` quote timestamped 2026-10-19T01:43:21Z; DefiLlama daily volume non-zero through 2026-10-18. | H |
| DFlow Kalshi product | Sunset: DefiLlama volume 0 every day since 2026-07-03 (last non-zero day 2026-07-02, $12,806); Metadata API prod host returns HTTP 403 empty body, dev host does not resolve, docs pages 404, `llms.txt` has zero "prediction"/"kalshi" hits. Details and the 2026-07-11 "Sunset Kalshi" repo commit are in `dflow-prediction-markets.md`. | H (re-probed this session, fixture `dflow_prediction-markets-api_probe_2026-10-19.txt`) |

`still_live = true` for Phantom's prediction feature (World-backed); false for the Kalshi-via-DFlow backend.

---

## 2. Kind and market model

- **Kind (H):** `broker-or-frontend`, non-custodial wallet UI. "Phantom does not offer gambling... does not operate as a house... All transactions occur peer-to-peer between users" (disclosures).
- **Market model (H, help article):** binary Yes/No contracts across "sports, politics, crypto, and culture". Whole contracts only (leftover amounts refunded). **Market orders only; limit orders and custom prices are not supported.** Sell ("Cash Out") needs an executable quote and can fail with "Quote unavailable" in thin markets.
- **Tokenisation (H):** "Your position is represented by standard Solana SPL tokens called outcome tokens"; visible in explorers; the wallet warns "This transaction will burn a valuable prediction market token" (https://docs.phantom.com/llms-full.txt, fixture `phantom_docs_llms_prediction-mentions.json`). World's tokens are Token-2022 YES/NO mints per market (M, sibling `world.md`).
- **Underlying mechanism (M, from `world.md`):** on-chain complete-set vault plus off-chain RFQ market makers; no order book. Legacy Kalshi/DFlow: tokenised Kalshi contracts filled by liquidity providers against Kalshi's book ("Concurrent Liquidity Program"; `dflow-prediction-markets.md`).
- **Scalar/categorical:** Phantom shows only Yes/No; multi-outcome events are sets of binary markets (for example NFL Champion = 32 binary team markets, H fixture `paybox-world_get_events.trimmed.json`).

## 3. Chains and collateral

- **Solana only (H).** Pay with Phantom "Cash" (the CASH stablecoin), SOL "or another supported Solana token"; "Get started with as little as $1, using any Solana token" (landing page, stale copy, L). Trades funded from Cash are gasless; token-funded trades need a little SOL. Payouts credit as CASH (H, help article).
- World collateral mint `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` appears in every live market's `accounts` object (H, fixture). Legacy Kalshi/DFlow settled in the stablecoin used to open the position (USDC or CASH, H disclosures; mint addresses from `dflow-prediction-markets.md`, M).
- Ledger accounts are unsupported for predictions; desktop extension unsupported (H).

## 4. Read API

`exists = none` for Phantom. (H, sentence quoted in section 0.) Phantom's developer docs (`llms.txt`, 18,238 bytes, and `llms-full.txt`, 203,250 bytes, fetched 2026-10-19) describe a wallet MCP server and Connect SDKs; they contain zero prediction/Kalshi/DFlow/outcome references apart from the burn warning above (H, fixture). Phantom's own app builds market objects (`market.ticker`, `title`, `yesProbabilityPct`) from a backend it does not document; I did not probe it (not documented, would be reverse-engineering a private API).

Where an aggregator can actually read these markets:

| Need | Source | Status | Tag |
|---|---|---|---|
| Current markets, quotes, orderbook, price history | World via PayBox official plugin `world` (`world_search`, `world_get_events`, `world_get_markets`, `world_orderbook`, `world_market_prices`, `world_filter_outcome_mints`, `world_positions`), enabled for this account | Works, read-only, no credential; live responses saved | H |
| Same data directly | World's own hosts (`markets-api-proxy.world-xyz.workers.dev`, WS) | Cloudflare Turnstile gated (403 to plain GET per `world.md`); not retested here | M (sibling) |
| Legacy Kalshi/DFlow markets | DFlow Metadata API | Gone: prod 403 empty body, dev NXDOMAIN, docs 404 (re-probed) | H |
| Platform volume/TVL (World) | `GET https://api.llama.fi/summary/dexs/world`, `.../protocol/world` | Keyless JSON, works | H |
| Phantom-specific volume | Nothing. No DefiLlama row for Phantom's prediction product (scan of `api.llama.fi/protocols`: only `world`, `dflow-prediction-market`, `phantom-outcome` [an unrelated Hyperliquid builder row], `phantom-perps`, `phantom-spot`). | NOT FOUND | H |

Auth/limits for Phantom: not applicable. DefiLlama: none documented, 1-2 requests per URL, not throttled. NOT FOUND (searched: help.phantom.com article, docs.phantom.com llms files, phantom.com/terms): any Phantom rate limit or WebSocket.

Response shapes confirmed this session (fixtures): World event/market objects (`ticker`, `eventTicker`, `status`, `yesBid/yesAsk/noBid/noAsk` as decimal strings in CASH, `volume`, `openInterest`, `closeTime`, `accounts.<CASH mint>.{marketLedger,yesMint,noMint,isInitialized,redemptionStatus}`), and `world_orderbook` (`yes`/`no` each `{bid,bidQty,ask,askQty,slotId,ts}`, one level per side).

## 5. Trade path

`none` for Phantom as a venue (H): no order API, no CLI/MCP tool for predictions (docs fixture). The only human path is the Phantom mobile app (iOS/Android), market orders, signed by the user's own wallet on-device.

Programmatic routes to the same liquidity (not through Phantom):

- **World via PayBox official plugin (H, contract read this session):** `world_buy_outcome(credential_id, market_mint, size [atomic USDC, exact-in], slippage_bps?)`, `world_change_position(side buy|sell)`, `world_redeem`. Solana wallet credentials only; "PayBox pins the buyer and sender from the credential"; approval follows the grant (`pending_signature` or `pending_approval`, then poll `get_request`); the signing window runs a region check. State-changing; not called.
- **World web-app protocol (M, sibling `world.md`):** `GET /order` returns a server-built Solana transaction plus `orderToken`; wallet signs (ed25519); `POST /submit`. Turnstile-gated.
- **Phantom wallet as signer (M):** Phantom's MCP server "can sign transactions... across Solana, Ethereum, Bitcoin" (docs `llms.txt`) and the Terms allow AI Agents to access a wallet "using Phantom's supported connection mechanisms" (Terms, last updated 2026-03-17, H). That is a signing path, not a prediction API.

## 6. PayBox reachability

`paybox_reachable = partial`.

- Phantom itself: `discover_plugins` for "phantom prediction" and for "kalshi" returned empty lists (H, 2026-10-19). No PayBox route to Phantom's app.
- Underlying live liquidity: PayBox official plugin `world` is enabled for this account (H). Reads work for any caller; trades need a **Solana** credential.
- **EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): cannot trade this.** Collateral is CASH (SPL), positions are SPL/Token-2022 tokens, and orders are Solana transactions; there is no EVM contract, no EIP-712 order and no EVM transaction proposal for it. An EVM balance would first have to be swapped/bridged to a Solana wallet (separate step, not tested).
- `discover_services` ("prediction markets kalshi") returned only third-party paid x402 data wrappers (x402tap.com, saylorinnovations.com, x402.shizu.me, clinkagent.com; $0.006 to $0.02 per call, USDC on Base/Polygon/Arbitrum/Solana). They resell Kalshi/Polymarket odds, not Phantom data. Not called, not paid (H listing, untrusted vendor text).
- Our own Open Plugin: a PayBox `kind:"solana"` proposal limits (single signer, <= 1232 bytes, no sponsor) are discussed in `world.md`; same conclusion: use the official plugin, do not rebuild.

## 7. Fees

| Layer | Fee | Payer | Tag |
|---|---|---|---|
| Phantom prediction fee | `0.1 * p * (1 - p) * C` (p = price 0-1, C = contracts); "lowest near $0 or $1, highest near $0.50"; example 100 Yes at $0.75 = $1.875; "shown before you confirm" | buyer/seller in Phantom | H (help article) |
| Network fee | small SOL fee when funding from portfolio tokens; none when funding from Cash ("gasless"); token-account creation | user | H |
| World maker spread (embedded in quote) | live sample: YES ask 0.15553 / bid 0.13452; NO ask 0.86548 / bid 0.84448; YES ask + NO ask = 1.0210, YES bid + NO bid = 0.9790, so about 2.1 cents over/under par each side; depth about 64 YES / 11.6 NO contracts (about $10) per side | taker | H (computed from fixture `paybox-world_orderbook_WXNFLCHAMP-26-SERS.json`, 2026-10-19T01:43Z) |
| World platform fee | Terms say no protocol fee "currently"; third parties saw a per-fill `platform_fee` in some quotes | taker | M (`world.md`) |
| Legacy Kalshi/DFlow | `roundup(0.07*c*p*(1-p)) + 0.01*c*p*(1-p)` at DFlow, builder tiers on top | user | H as archived docs, L as current (`dflow-prediction-markets.md`) |

Worked Phantom fee at the sampled price: buying SF 49ers YES at the 0.1555 ask costs `0.1*0.1555*0.8445 = 0.0131` per contract on top of the spread (8.4% of price). At p = 0.50 the fee is 2.5 cents per contract (5% of price) versus 1.75 cents under a Kalshi-style `0.07*p*(1-p)` schedule (M). Whether Phantom's fee is in addition to World's own platform fee is NOT FOUND (the app shows a combined "Review the order and fees" screen I cannot read). Going through the PayBox `world` plugin would skip Phantom's fee but not World's spread (M, inference: the fee is described as Phantom's).

## 8. Resolution mechanism and dispute risk

- **Phantom does not decide (H):** "Resolution determines which outcome satisfies the market's published rules. Phantom does not decide the result." Disputes: "All resolution and payout data comes from the provider. If you believe a market was resolved incorrectly, contact Phantom Support", which only relays.
- **World (post-2026-06-01, H):** oracles "such as Chainlink"; sports can take 10-15 minutes with a provisional result and challenge period; crypto markets follow the rule's price source, possibly a TWAP; payouts auto-credit as CASH. Canceled/unclear markets may pay partial amounts to both outcomes. Live catalog carries `disputeWindowSeconds` 300 and Chainlink market ids (M, `world.md`). Independent code analysis (M, dated 2026-07/09 in `world.md`) says a single operator key posts outcomes and there is no on-chain dispute path: treat as counterparty risk.
- **Legacy Kalshi/DFlow (H, disclosures):** resolution "depends on... Kalshi's database and DFlow's integration and reindexing of Kalshi's database"; holders must trade the expired outcome token for the stablecoin at a quote "which may differ from the original contract price". Extra risk versus Kalshi direct: DFlow indexing error plus settlement-trade slippage.
- **Arbitrage hazard:** Phantom shows World's rule text, not Kalshi's or Polymarket's; soccer, political and crypto-TWAP rules differ. Compare rule hashes before pairing (see `docs/market-linking-design.md`).

## 9. Geo, ToS, automation

- **Geo (H):** "Prediction markets: Varies by region. Not available in regions subject to comprehensive US economic sanctions." (https://help.phantom.com/articles/48634486197651). Disclosures: "only available to users in certain jurisdictions". Perps are explicitly barred in the US and UK; prediction markets are not enumerated, so US availability is NOT FOUND on Phantom's side. The World backend's own Terms and FAQ exclude the United States and dozens of other jurisdictions (H, `world.md`), which implies US users are blocked in practice (M, inference).
- **Conduct (H):** no trading with material non-public information; Related Persons (players, coaches, league staff, family) barred from sports contracts.
- **Terms of Use, last updated 2026-03-17 (H):** forbid using "scraping techniques to mine or otherwise scrape data" from the App or Site, and using the Functionality "in a way intended to avoid incurring fees or exceeding usage limits or quotas"; allow AI Agents connected through Phantom's supported mechanisms, with the user "solely responsible". The Terms do not mention prediction markets. Help article: external development is unsupported.
- **Automation verdict:** nothing sanctioned to automate on Phantom. Do not scrape the app or reverse its private backend. Read and trade via World's channels (PayBox plugin) instead, subject to World's geo rules.

## 10. Liquidity (with dates)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Phantom prediction volume/OI | Not published anywhere | NOT FOUND (searched: help center, disclosures, blog, DefiLlama protocol scan) | H (negative) |
| Phantom users | "20+ million" | https://phantom.com/ 2026-10-19 | H (wallet users, not predictors) |
| World TVL (CASH in market vaults) | $177,491 | api.llama.fi/protocol/world, 2026-10-18 | H |
| World reported volume | 24h (day 2026-10-18) $515,597; 7d $3.32M; 30d $13.11M; all-time $59.43M | api.llama.fi/summary/dexs/world, fetched 2026-10-19 | H for the numbers, **upper bound**: Dune count of DFlow-router swap events with CASH as input/output in transactions touching the World program, so funding and cash-out legs can be counted |
| World catalog volume (sample) | NFL Champion event: volume 25,904,971, OI 149,979,719, 24h 1,902,239; best single market OI 84,638,079. If 6-decimal CASH that is about $25.90 / $149.98 / $1.90. Most sampled markets have 0 volume. | `world_get_events`, 2026-10-19 | H for raw numbers, M for the unit |
| Gap between the two World volume views | $515k/day (DefiLlama) vs single-digit dollars per event (catalog) | computed | M, unresolved; do not size positions off the DefiLlama figure |
| Quoted depth | about $10 per side on sampled markets | `world_orderbook` 2026-10-19 | H |
| DFlow Kalshi markets (legacy backend) | all-time $17.31M; 30d $0; vault TVL $741 on 2026-10-18; peak day $378,439 on 2026-02-22 | api.llama.fi, 2026-10-19 | H |
| Share of DFlow volume from Phantom | ">98%" | discovery hint ("stepdata") | M/L, unverified (not found in any source I could open) |

World's volume-to-TVL ratio (about 2.9x per day) and the tiny catalog numbers both suggest the real tradeable depth is small (M).

## 11. Event categories and shared liquidity

- **Categories (H for Phantom's list, H for World samples):** sports (NFL, MLB, MLS, EPL, other soccer leagues), politics (2028 US presidential winner and nominees), crypto price (BTC thresholds, launch-era Up/Down), economics (Fed cuts), culture. These overlap Kalshi, Polymarket, Limitless and XO. Third-party matching evidence (M, via `world.md`): 816 World outcomes matched to Kalshi/Polymarket twins, median premium 0.56 cents, so any gap has to clear the 2.1-cent per-side spread plus Phantom's fee.
- **Shared liquidity (H unless noted):**
  1. Current Phantom markets = **World** liquidity. Same pool as world.xyz, the PayBox `world` plugin and any DFlow-router/Manifest access to World tokens. One leg, not two.
  2. Legacy Phantom positions = **Kalshi** liquidity through DFlow's tokenisation; no independent price (`dflow-prediction-markets.md`).
  3. DFlow's router program still carries World swaps (the DefiLlama adapter counts swaps through program `DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH` in transactions touching World program `prediCtPZCttYMvm2W3PtxmMxLmT1dtN7riU6Cxh6tM`; https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/world-xyz/index.ts, H) and tags the row `doublecounted: true //kalshi, dflow`. DFlow is therefore still infrastructure under World, not a venue.
  4. Whether World's makers hedge on Kalshi or Polymarket: NOT FOUND, so World prices may themselves be derived from those venues.

## 12. Adapter recommendation

**adapter_priority = skip.** No API, retired Kalshi backend, live backend already specced as P2 in `world.md`, shared liquidity, mobile-only, geo-restricted.

Keep (cheap, no adapter code):

- **Route record** `phantom`: `kind: front_end`, `public_api: false`, `independent_liquidity: false`, `routes_to: [{venue: "world", since: "2026-06-01", chain: "solana"}, {venue: "kalshi-via-dflow", positions_opened_until: "2026-05-31", status: "wind-down settlement only"}]`, `fee_model: "0.1*p*(1-p) per contract on top of venue cost"`, `order_types: ["market"]`, `platform: "mobile-app-only"`.
- Do not model Phantom as a counterparty or a price source; if a Phantom-originated leg ever has to be priced, use World's quote plus the Phantom fee.
- Revisit only if Phantom announces a partner API or adds a second prediction provider; check the help article and disclosures page monthly.

## 13. NOT FOUND / open questions

- The Block article (July 2026) and the "stepdata" source for the ">98% of DFlow volume through Phantom" claim. (searched: the WebSearch budget was exhausted after one query; direct fetches of the Block December 2025 article, Crowdfund Insider and Yahoo did not contain it.)
- Phantom-side prediction volume, open interest, user count or share of World flow. (searched: help center, disclosures, blog, DefiLlama protocol list.)
- US availability of the Phantom prediction feature. (searched: region article, disclosures, learn pages.)
- Whether the Phantom fee is charged in addition to World's platform fee, and what spread Phantom's own quotes show versus the PayBox `world_orderbook` (the app is mobile-only).
- Why DefiLlama's World volume is about five orders of magnitude above the catalog's per-market volume (unit or double counting).
- Any dated Phantom or DFlow announcement of the switch. Only the disclosures page (Jul 1, 2026) and press (2026-06-30, 2026-07-02) were found.
- Phantom partner or API roadmap: none found.

## 14. Suspicious content

None found on Phantom, DefiLlama, DFlow or the news pages. Two non-page items for the record: (a) PayBox first-party `world_*` tool descriptions contain behavioural directives (for example "never re-call this tool for that request", tell the user to turn off a VPN on a region block); treated as documentation, no action taken. (b) `discover_services` returned third-party x402 vendor listings with payTo addresses; untrusted vendor text, not followed, nothing paid. The search tool footer asking for a sources list is harness formatting, not page content.

## 15. Privacy note

No personal identifier appears in any request, header, URL, search query, fixture or in these notes. Scripted requests used the User-Agent `insurance-markets-research/0.1`. The only on-chain addresses recorded are public program ids, token mints and market ledger accounts from public sources (no user wallet addresses). The fixture-building script was grepped for "@" before running (no hits) and the fixture directory was grepped afterwards (no hits).

## 16. Fixtures

Files in `docs/research/fixtures/phantom-prediction-markets-kalshi-via-dflow-plus-world/`:

| File | Content | Request |
|---|---|---|
| `phantom_help_trade-predictions_47187740851731.extract.txt` | Help article text (fees formula, FAQ, resolution, no-API statement) | GET `https://help.phantom.com/articles/47187740851731` |
| `phantom_prediction-market-disclosures.extract.txt` | Disclosures dated Jul 1, 2026 (provider split, resolution, conduct) | GET `https://phantom.com/prediction-market-disclosures` |
| `phantom_help_feature-availability-by-region.extract.txt` | Region table | GET `https://help.phantom.com/articles/48634486197651` |
| `phantom_prediction-markets_landing_STALE-kalshi-via-dflow.extract.txt` | Marketing FAQ still naming Kalshi via DFlow | GET `https://phantom.com/prediction-markets` |
| `phantom_docs_llms_prediction-mentions.json` | Result of scanning Phantom developer docs for prediction/Kalshi/DFlow terms | GET `https://docs.phantom.com/llms.txt`, `/llms-full.txt` |
| `defillama_world_volume_tvl.trimmed.json` | World volume (14 days), totals, methodology, TVL (10 days) | GET `https://api.llama.fi/summary/dexs/world?dataType=dailyVolume`, `/protocol/world` |
| `defillama_dflow-prediction-market_volume_tvl.trimmed.json` | DFlow PM totals, last non-zero days, peak, TVL | GET `https://api.llama.fi/summary/dexs/dflow-prediction-market`, `/protocol/dflow-prediction-market` |
| `defillama_protocols_scan.json` | Slug scan showing no Phantom prediction row | GET `https://api.llama.fi/protocols` (filtered locally) |
| `dflow_prediction-markets-api_probe_2026-10-19.txt` | Status codes of the DFlow probes | GET to `prediction-markets-api.dflow.net`, `dev-...`, `pond.dflow.net/...` |
| `paybox-world_get_events.trimmed.json` | 5 of the 65 markets returned (4 of 32 NFL Champion, 1 of 3 MLS; the 30-market MLB event omitted), values hand-copied from the plugin response (World market/event shape) | PayBox `use_plugin world / world_get_events {limit:3}` |
| `paybox-world_orderbook_WXNFLCHAMP-26-SERS.json` | Verbatim World orderbook for one market | PayBox `use_plugin world / world_orderbook` |

---

## Sources

Phantom (primary, all fetched 2026-10-19):
- https://help.phantom.com/articles/47187740851731 "Trade predictions in Phantom" (H)
- https://phantom.com/prediction-market-disclosures (dated Jul 1, 2026; H)
- https://help.phantom.com/articles/48634486197651 "Feature availability by region" (H)
- https://phantom.com/ (homepage; H) and https://phantom.com/prediction-markets (stale Kalshi-via-DFlow copy; L as current)
- https://phantom.com/learn/crypto-101/prediction-markets (Dec 2025 era, stale; L) and https://phantom.com/learn/crypto-101/polymarket-prediction-market (tutorial on using Polymarket with a Phantom wallet on Polygon, not an integration; H)
- https://docs.phantom.com/llms.txt and https://docs.phantom.com/llms-full.txt (H)
- https://phantom.com/terms (last updated 2026-03-17; H)

Backends and data:
- https://api.llama.fi/summary/dexs/world , https://api.llama.fi/protocol/world , https://api.llama.fi/summary/dexs/dflow-prediction-market , https://api.llama.fi/protocol/dflow-prediction-market , https://api.llama.fi/protocols (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/world-xyz/index.ts (read via `gh api` raw; H)
- https://pond.dflow.net/llms.txt , https://pond.dflow.net/build/metadata-api/openapi.json , https://prediction-markets-api.dflow.net/api/v1/events?limit=1 (403) , https://dev-quote-api.dflow.net/venues (H)
- PayBox official plugin contract `paybox://plugins/world`, read-only `use_plugin` calls `world_get_events` and `world_orderbook`, `discover_plugins` queries "phantom prediction", "world prediction markets", "kalshi", `discover_services` query "prediction markets kalshi" (all 2026-10-19; H)

Press (M):
- https://www.crowdfundinsider.com/2026/06/288594-phantom-wallet-moves-prediction-market-backend-to-world-prediction-markets-enabling-automatic-on-chain-settlement/ (2026-06-30; WebFetch summary)
- https://finance.yahoo.com/markets/crypto/articles/solana-prediction-market-world-goes-201113336.html (2026-07-02; WebFetch summary)
- https://www.theblock.co/post/382340/phantom-integrates-kalshi-prediction-markets-web3-wallet (page dated 2025-12-12; launch announcement; stale; does not mention DFlow)
- https://forklog.com/en/phantom-integrates-kalshi-prediction-market/ (discovery evidence, Dec 2025, stale; not re-read)

Sibling notes used as M-level context, not re-verified in full: `docs/research/venues/world.md`, `docs/research/venues/dflow-prediction-markets.md`, `docs/research/venues/phantom-outcome-markets-access.md`.
