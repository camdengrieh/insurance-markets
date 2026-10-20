# GTR.trade - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch, unauthenticated GETs to public hosts (gtr.trade, api.gtr.trade root, gtr-trade.gitbook.io, hyperliquid.gitbook.io, api.llama.fi), `gh api` raw file read of a public DefiLlama adapter. No account, wallet, key, signature, POST/PUT/DELETE, payment, PayBox money/signing tool or browser automation. All third-party text treated as untrusted data; the site's JavaScript chunks were downloaded and read as text only, nothing was executed. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred or derived by me; **L** = weak or stale.

Method limits (read first):
- WebSearch budget was exhausted before my first search succeeded (shared session limit). No web searches were used; everything below comes from direct fetches. Third-party press about GTR was therefore not checked (NOT FOUND, not searched).
- Hyperliquid reads are `POST /info`, which the ground rules forbid, so I captured no live Hyperliquid response shapes. The sibling note `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` has live WebSocket captures for the underlying venue; this note does not repeat them.
- I could not log in or render the JavaScript app. Statements about what the logged-in UI shows are limited to what the public HTML, docs and JS chunks reveal.

---

## 0. Bottom line

1. **GTR.trade is a front end, not a venue.** It is a Privy-wallet social trading terminal ("GTR", formerly GetRabbit) for crypto perps, spot, tokenized stocks and memecoins, built on Hyperliquid with a builder code. It has no order book, no market creation, no resolution logic and no liquidity of its own. (H: docs and site text, section 2.)
2. **No evidence it exposes HIP-4 outcome trading at all.** GTR's docs (full index fetched) have no prediction/outcome page; its Terms (last updated 29 July 2025) never mention prediction markets or Hyperliquid; none of 74 public JS chunks contains any HIP-4 API call or the HIP-4 asset-id encoding. Its only "prediction market" feature is a read-only Polymarket events panel in the War Terminal that links out to polymarket.com. (H for the absence in what I fetched; M for "the logged-in app has nothing more".)
3. **The DefiLlama "GTR.trade Outcome" line the hint relied on is mechanically generated.** DefiLlama's factory file gives every Hyperliquid builder an `-outcome` listing that reuses the builder's address (H, section 3). It proves nothing about a GTR outcome product. Attributed volume: **$1,749 all-time, $0 in the last 30 days** (H, DefiLlama 2026-10-19).
4. **Liquidity is 100% Hyperliquid HyperCore.** Any fill through GTR is a fill on the same merged Yes/No book as Hyperliquid's own app. GTR is **not an independent arbitrage leg** and adds no independent price.
5. **adapter_priority = skip.** Integrate Hyperliquid HIP-4 directly (see the sibling note, rated P1 there). Do not build a GTR adapter; at most record GTR's builder address as a known front end so its attributed volume is never added to the Hyperliquid base figure.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://gtr.trade/` returns HTTP 200 on 2026-10-19; Vercel-hosted Next.js app; prerendered page `age` header 2,055,314 s (about 23.8 days since last build, so deployed roughly 2026-09-25) | H (`fixtures/gtr-trade/gtr_home_headers.txt`) |
| DefiLlama parent `GTR.trade` lists Perps, Spot, Outcome sub-listings; Perps builder-fee revenue 24h $0.42, 7d $5.69, 30d $66.36, all-time $12,840.52 (tiny but non-zero) | H (`fixtures/gtr-trade/defillama_dimensions_extract.json`) |
| Docs site `gtr-trade.gitbook.io/docs` reachable; X handle `tradeongtr` | H |
| GTR **outcome** activity: all-time attributed volume $1,749; 24h/7d/30d all $0; all-time fees $0.05 | H (DefiLlama) |

Verdict: **the company/app is live; an outcome-market product is not evidenced.** `still_live = true` applies to the front end only.

---

## 2. Kind and market model

- **Kind:** broker/front end (self-described "social trading platform to trade Crypto Perps, Stocks, Memes, & Prediction Markets alongside the best traders in real time. Your P&L is your reputation", site JS) over Hyperliquid perps/spot (docs "Crypto Perps & Spot (HL)", page footer "Powered By Hyperliquid"), plus Dinari tokenized stocks and cross-chain memecoin swaps. https://gtr.trade/ , https://gtr-trade.gitbook.io/docs/llms.txt (H)
- **Market model for outcomes: none of its own.** The only outcome-market primitive reachable through GTR would be Hyperliquid HIP-4 (binary/categorical, fully collateralised, merged Yes/No central limit order book; coins `#<10*outcome+side>`, token `+<enc>`, asset id `100_000_000 + enc`). Source: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md and .../for-developers/api/asset-ids.md (H). Full detail: sibling note.
- **What the GTR site actually does with prediction markets (H, JS + docs):** the War Terminal calls GTR's own proxy `GET /polymarket-events?...tag_slug=iran...` and renders Polymarket events with outcome prices, linking to `https://polymarket.com/event/<slug>`. Docs: "Polymarket event tracking for live geopolitical bets and prediction markets" (https://gtr-trade.gitbook.io/docs/gtr-tools/war-terminal.md). No trading of Polymarket from GTR is described.
- **HIP-4 asset-id logic absent (H, M for completeness):** GTR's order code computes asset indices for perps (`index`), HIP-3 perps (`1e5 + 1e4*dexIndex + n`) and spot (via `spotMeta`); none of the 74 chunks I read contained `outcomeMeta`, `outcomeTemplates`, `settledOutcome`, `userOutcome` or `splitOutcome` (`fixtures/gtr-trade/gtr_frontend_probe.json`). Lazy-loaded, login-gated chunks not referenced from public pages would not have been seen (M).

---

## 3. Why DefiLlama shows "GTR.trade Outcome" (the hint's evidence)

- DefiLlama protocol 8989 "GTR.trade Outcome": description "GTR.trade provides access to outcome-based prediction markets through Hyperliquid.", category Interface, tag "Hyperliquid HIP4 Builder", listed 2026-10-08, parent `GTR.trade`. https://api.llama.fi/protocol/gtr.trade-outcome (H, `fixtures/gtr-trade/defillama_protocol_gtr.trade-outcome.json`)
- Adapter source: `factory/hyperliquid.ts` in DefiLlama/dimension-adapters contains `"gtr-trade-perps": { addresses: ["0x5ef4...972a"], start: "2025-06-17" }` and `"gtr-trade-outcome": { builder: "gtr-trade-perps", market: "outcome", start: "2026-05-02" }`, under the comment "Builders are split into one listing per market ... these are the builder's other markets, reusing its addresses and settings ... outcome listings no earlier than HIP-4 (2026-05-02)". The file has 35 such `market: "outcome"` entries and 73 `market: "spot"` entries; one builder (cro.trade) was disabled because its "HIP-4 outcome product is now inactive and its builder code shows $0 outcome volume since launch". (H, `gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts`)
- Reading: the listing means "fills on HyperCore outcome coins that carried GTR's builder code". Builder-fee approval is per user account, so tiny non-zero volume can arise without a dedicated GTR outcome UI. The $1,749 is unexplained (NOT FOUND: what produced it). (M)

---

## 4. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading venue behind GTR | Hyperliquid HyperCore (L1), USDC collateral for outcomes | H (HL docs; `quoteToken:"USDC"` in the settledOutcome sample) |
| GTR deposit chains | Solana, Arbitrum, Base, BNB Chain, Berachain, Sonic, HyperEVM, Monad ("single USDC balance", chain-abstracted) | H (https://gtr-trade.gitbook.io/docs/supported-chains.md) |
| Perps withdrawal | USDC to the GTR wallet, flat $1 fee | H (docs "Crypto Perps & Spot (HL)") |
| Wallet model | Privy embedded wallets (auth.privy.io, email/social sign-up, "no crypto wallet connections"). Docs say "self-custodial"; the bundle references a Privy TEE-wallet migration guide. Custody claim not independently verified. | H (docs, JS) / L (custody claim) |

---

## 5. Read API

- **GTR has no public read API for markets.** `GET https://api.gtr.trade/` returns `404 {"success":false,"message":"/ not found","requestId":...}` (H, `fixtures/gtr-trade/api_gtr_trade_root_404.txt`). The frontend uses `https://api.gtr.trade/v1` (REST) and `wss://api.gtr.trade/` (WebSocket) with `Authorization: Bearer <Privy access token>` and a Bearer sub-protocol on the socket (H, JS). These are the app's private backend: authenticated, undocumented, and the Terms prohibit "data mining, scraping, or similar" (section 8). Not an integration target.
- **Docs:** https://gtr-trade.gitbook.io/docs (index https://gtr-trade.gitbook.io/docs/llms.txt, 43 lines, saved as `fixtures/gtr-trade/gtr_docs_llms.txt`). No API, builder-code, prediction or outcome page. (H)
- **The market data that matters is Hyperliquid's:** keyless `POST https://api.hyperliquid.xyz/info` and `wss://api.hyperliquid.xyz/ws` (`outcomeMeta`, `outcomeTemplates`, `settledOutcome`, `outcomeDeployerLimits`; WS `l2Book`, `trades`, `outcomeMetaUpdates`). Rate limits: 1200 weight/min per IP, `l2Book`/`allMids` weight 2, other documented info requests weight 20; WS max 10 connections, 1000 subscriptions. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits.md , .../info-endpoint/spot.md , .../websocket/subscriptions.md (H). Live shapes: not captured here (POST), see sibling note's WS fixtures.
- **Fixtures saved** (`docs/research/fixtures/gtr-trade/`): `defillama_protocol_gtr.trade-outcome.json` (raw GET), `defillama_dimensions_extract.json` (my extract of two overview GETs), `gtr_docs_llms.txt`, `api_gtr_trade_root_404.txt`, `gtr_home_headers.txt`, `gtr_frontend_probe.json` (derived), `gtr_terms_excerpt.txt`.

---

## 6. Trade path

- **Through GTR: none programmatic.** No public order API; the app signs Hyperliquid actions in the browser with a Privy-managed wallet and posts directly to `https://api.hyperliquid.xyz/exchange` (L1 action signature, `builder:{b:"0x5ef4...972a", f:50}`, one-time `approveBuilderFee` with `maxFeeRate:"0.05%"`). (H, JS)
- **Real trade path for the aggregator = Hyperliquid directly:** `order` action with `a = 100_000_000 + 10*outcome + side`, signed with the account key or an approved agent (API) wallet. https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint.md , .../nonces-and-api-wallets.md (H; details in sibling note section 5).

## 7. Reachability from a PayBox wallet

**For GTR itself: no.** There is no API or signed-order interface to target, and the account is a Privy embedded wallet that PayBox does not control.

**For the underlying Hyperliquid outcomes: partial** (from `docs/research/06-paybox-platform.md` and the sibling note; not re-verified here): orders are HyperCore signed actions (phantom-agent EIP-712), not EVM transaction proposals; PayBox's official `hyperliquid` plugin is read-only spot browsing; `request_wallet_sign` can produce EIP-712/raw signatures, so a one-time `approveAgent` plus a local agent key is the workable pattern; Arbitrum USDC funding is plausible. (M)

---

## 8. Fees

- **GTR (H, https://gtr-trade.gitbook.io/docs/start-trading/crypto-perps-and-spot-hl/fees-breakdown.md):** "We follow Hyperliquid Fee model"; "A small builder fee of 0.05% is applied on top of Hyperliquid's trading fees for all Perps and Spot trades executed through GTR"; up to 40% of it is redistributed as affiliate rewards. The docs say nothing about outcome markets. The frontend's builder fee field is `f:50` (tenths of a bp = 5 bps) and the approval is capped at "0.05%" (H, JS), so any outcome order carrying GTR's builder code would be capped at 5 bps (M).
- **Underlying HIP-4 fees (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees.md):** fees only on closing/settling, not on opening; minting/splitting free; no maker rebates on outcomes. The official HIP-4 page still says "Fees are currently zero ... for initial testing" (undated, stale); DefiLlama states Hyperliquid charged no outcome fee before 15 Aug 2026. Numeric base outcome rate: NOT FOUND in official docs (searched: HIP-4 page, fees page, deployer-actions page). Deployer markets pay `base * (scale + max(scale,1))` via `deployerFeeScale`. Builder codes can apply to outcome buys and sells, charged in the quote token. (H; the deployer-actions page carries a "Testnet-only" banner.)

## 9. Resolution mechanism and dispute risk

GTR has none; it inherits Hyperliquid's. Recurring series settle automatically on an interpolated HyperCore mark price at expiry (H, contract-specifications page); deployer-created template markets are settled by third-party deployers with validator-voted templates and stake slashing, and no trader dispute window is documented (sibling note section 8; M for the deployer share). GTR adds no resolution layer and no recourse; its Terms (section 12) require binding individual arbitration with GTR.Trade (H).

## 10. Geo, ToS, automation

- **GTR Terms of Use**, "Last Updated: 29 July 2025" (over 12 months old: possibly stale): 1.4 "does not provide services to users located in, established in, or residents of certain restricted jurisdictions, including but not limited to China, North Korea, Iran, Syria, Cuba, and any regions subject to comprehensive sanctions"; VPN circumvention "strictly prohibited"; prohibited activities include "data mining, scraping, or similar data gathering and extraction methods in connection with the Interface". https://gtr.trade/terms/ (H, `fixtures/gtr-trade/gtr_terms_excerpt.txt`)
- **GTR docs:** "Perp trading is not available for users in the United States" (H). The Terms and docs never mention outcome markets, so the HIP-4-specific exclusions (US, Ontario, an unpublished "Excluded Persons" list) come from Hyperliquid's own Terms (updated 2026-06-15, per sibling note, M) and would apply to the underlying venue.
- **Automation:** no bot clause found in GTR's Terms beyond scraping; no API offered, so there is no sanctioned automation route (NOT FOUND: searched Terms payload for automated/bot/API).

## 11. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| GTR-attributed outcome volume | $1,749 all-time; $0 24h/7d/30d; fees $0.05 all-time | https://api.llama.fi/overview/dexs and /fees, fetched 2026-10-19 (last daily point 2026-10-18) | H |
| GTR perps builder-fee revenue | $12,840.52 all-time; $66.36 30d | same | H |
| Implied GTR perps notional (rough) | about $26M all-time if the 5 bps builder fee applied throughout (12,840 / 0.0005) | my computation | M |
| Underlying Hyperliquid Outcomes volume (all front ends, each trade counted once) | $3.13M on 2026-10-18; $17.9M over 7d; $47.0M over 30d; $261.1M all-time | https://api.llama.fi/overview/dexs, slug `hyperliquid-outcomes` | H |
| Biggest HIP-4 front end for comparison | Outcome.xyz Outcome: $5.29M 24h, $79.4M 30d, $153.4M all-time | same | H |
| GTR share of HIP-4 volume | $1,749 / $261.1M = 0.0007% all-time | my computation | M |

## 12. Event categories and cross-venue overlap

GTR has no categories of its own. Via Hyperliquid, the overlap is crypto-price binaries and ladders, sports, and central-bank rate decisions (templates `binaryPrice`, `policyRateDecision`; see HL info-endpoint doc, H) against Polymarket, Kalshi, Limitless, Predict.fun, Opinion. Details and arbitrage quality tables are in the sibling note, sections 11 and 12. Reading the overlap off GTR would only duplicate those rows.

## 13. Shared liquidity

**Yes: 100% shared with Hyperliquid HIP-4 Outcomes.** One HyperCore book per outcome; GTR (builder `0x5ef4...972a`) is one of the builder addresses DefiLlama tracks for outcome fills (35 `market: "outcome"` listings in its factory file). It is **not** an independent leg. The only separate market data GTR displays is a Polymarket proxy panel, which is just Polymarket again. (H for the mechanism, M for "no GTR-side order flow is matched internally": nothing suggests it, but GTR's backend is closed.)

---

## 14. Adapter spec

**Do not build one.** Recommended handling in the aggregator:
- Maintain a small registry entry `gtr-trade` of kind `frontend` pointing at venue `hyperliquid-hip-4`, with builder address `0x5ef4deeb76f87d979d0ddc8c51f5b4f65d1c972a` and builder fee cap 5 bps, so attribution lines from DefiLlama are de-duplicated rather than summed.
- Any HIP-4 arbitrage leg should be quoted and executed at Hyperliquid (fee = Hyperliquid's schedule, no builder fee) which is strictly cheaper than routing through GTR (extra up to 5 bps) and is the only automatable path.
- Re-check GTR if its docs ever add an outcome/prediction page, or if DefiLlama's GTR outcome volume becomes non-trivial.

## 15. NOT FOUND

- Any GTR documentation of outcome/prediction trading (searched: gitbook llms.txt index of 43 lines, FAQ, fees, supported chains, war terminal pages; Terms and Privacy payloads; support.gtr.trade home; sitemap.xml).
- A public GTR market/price/trade API or rate-limit statement (searched: api.gtr.trade root, docs index, JS for base URLs).
- Cause of the $1,749 outcome volume attributed to GTR's builder address.
- Third-party coverage of GTR outcome markets (web search budget exhausted; no search performed).
- Numeric Hyperliquid base outcome fee (searched official fees, HIP-4 and deployer pages).
- GTR Privacy Policy details and custody facts (not read beyond the Terms; the Privacy page fetched but not analysed).

## 16. Suspicious content (embedded instructions)

None found in the pages, docs, JS chunks or API responses read. The GitBook pages carry a standard "For the complete documentation index, see llms.txt" banner (a machine-readable index pointer, benign; used only because it was my own discovery step). No text aimed at AI agents was followed.

## 17. Sources

- https://gtr.trade/ (home HTML, meta, JS chunks under /_next/static/chunks/), https://gtr.trade/terms/ , https://gtr.trade/sitemap.xml , https://gtr.trade/robots.txt (H)
- https://api.gtr.trade/ (404 JSON) (H)
- https://gtr-trade.gitbook.io/docs/llms.txt ; .../faq.md ; .../supported-chains.md ; .../start-trading/crypto-perps-and-spot-hl.md ; .../crypto-perps-and-spot-hl/fees-breakdown.md ; .../gtr-tools/war-terminal.md ; .../security/partner-audits-and-proof-of-reserves.md (H)
- https://support.gtr.trade/en/ (H, no relevant articles)
- https://api.llama.fi/protocol/gtr.trade-outcome ; https://api.llama.fi/protocol/gtr.trade ; https://api.llama.fi/overview/dexs ; https://api.llama.fi/overview/fees ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H, fetched 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (read via `gh api`, H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md ; .../for-developers/api/asset-ids.md ; .../for-developers/api/info-endpoint/spot.md ; .../for-developers/api/exchange-endpoint.md ; .../for-developers/api/rate-limits-and-user-limits.md ; .../for-developers/api/hip-4-deployer-actions.md ; .../for-developers/api/websocket/subscriptions.md ; .../trading/contract-specifications.md ; .../trading/fees.md (H)
- Project notes (M, not re-verified here): `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md`
- Hint source named in the task: DefiLlama Interface listing (2026-10-08), confirmed above to be a mechanically generated builder-code listing.
