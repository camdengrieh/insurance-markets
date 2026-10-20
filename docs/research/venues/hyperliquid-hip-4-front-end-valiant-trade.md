# Hyperliquid HIP-4 front-end: Valiant Trade - venue spec

Researched 2026-10-19. Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/inferred; **L** = weak/stale.

This task duplicates an earlier, more detailed note, `docs/research/venues/valiant-trade.md` (same venue, same conclusion). I re-verified its key claims independently (sunset string, builder constants, DefiLlama series) and kept this note short. The native venue is covered in `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`.

Method limits: WebSearch budget was exhausted (no searches run). WebFetch of the SPA shell returned only the page title; `defillama.com/protocol/...` returned HTTP 403. I used curl GETs of the site, its public JS bundle (read as text, never executed), and `api.llama.fi`.

Process slip (disclosed): early in the session I sent one `POST https://api.hyperliquid.xyz/info {"type":"outcomeMeta"}` (a read-only query, but POST, which the ground rules forbid). I deleted the response, saved no fixture from it, and no claim in this note relies on it. No other POST was made.

## 0. Bottom line
1. Valiant is a **builder-code front-end on Hyperliquid HIP-4**, not a venue. It has no books, listings, oracle or resolution of its own (H: bundle + DefiLlama tag "Hyperliquid HIP4 Builder").
2. **Sunset and dead.** The site bundle carries: "Valiant Perps and Outcome markets will be sunset on September 30th. Please withdraw any funds." (H). The year is not in the string (M: 2026, since the shell was last modified 2026-10-15 and the DefiLlama listing dates from 2026-10-08). DefiLlama attributed volume is $1,026 all-time, last non-zero day 2026-07-26, zero since (H).
3. **Not an independent leg**: fills are Hyperliquid fills (H). Adding it would double-count.
4. **adapter_priority = skip.** Use the Hyperliquid HIP-4 adapter; optionally register Valiant as an alias with its builder address.

## 1. Still live?
- `https://valiant.trade/perps/` returns HTTP 200, a Vite SPA titled "Valiant", `last-modified: Thu, 15 Oct 2026 22:16:13 GMT` (H, `curl -I`). The shell does not prove the Outcomes tab trades.
- Sunset banner string in `https://valiant.trade/assets/index-DiG92gwS.js` (H; fixture `valiant_bundle_excerpts.txt`).
- The bundle still contains Outcomes UI chunks (`Outcomes-*.js`, `OutcomeMarket-*.js`). Runtime state after 2026-09-30: NOT FOUND (searched: bundle, docs; no browser automation allowed).
- DefiLlama `valiant-trade-outcome` (id 9061, category "Interface", chain "Hyperliquid L1", listedAt 1791497961 = 2026-10-08 22:19 UTC, description "Valiant Trade provides access to outcome-based prediction markets through Hyperliquid."): `total24h/7d/30d` = 0, `totalAllTime` = 1026, 20 non-zero days ending 2026-07-26; fees all 0 (H, `https://api.llama.fi/protocol/valiant-trade-outcome`, `.../summary/dexs/valiant-trade-outcome`, `.../summary/fees/valiant-trade-outcome`; fixtures).
- Verdict: still_live = false.

## 2. Kind and market model
Interface/builder on Hyperliquid HIP-4 (H). Market model is Hyperliquid's: binary Yes/No order book on HyperCore, coin `#<10*outcome+side>`, order asset id `100000000 + 10*outcome + side`, collateralised, no leverage; multi-outcome "questions" exist natively (see the Hyperliquid note, H there). Valiant's company description: "Institutional trading in your browser. The fastest DEX in crypto." Core business is a Fogo spot DEX plus Hyperliquid-routed perps (H: `https://docs.valiant.trade/` fetch; docs index has no outcome page per the earlier note, M here).

## 3. Chains and collateral
Settles on HyperCore (Hyperliquid L1), collateral USDC (M, from Hyperliquid note). Bundle config: `HL_CHAIN_ID=1337`. Valiant deposits via Fogo/Solana/Ethereum/BNB/Arbitrum routes into Privy-embedded wallets (M, earlier note citing `docs.valiant.trade/perpetuals/references/faqs.md`).

## 4. Read API
- Valiant: **no public/official API for outcomes. NOT FOUND** (searched: docs landing page, Terms of Use, bundle). Terms mention "Valiant APIs or SDKs" and posted rate limits, but none is documented for outcomes (H).
- Hosts seen in the bundle (`https://mainnet-api.valiant.trade`, `https://browser-api.valiant.trade`, `https://docs.valiant.trade/`) are Valiant's private backends for its Fogo/perps UI; do not use.
- Use Hyperliquid directly: `wss://api.hyperliquid.xyz/ws`, `POST https://api.hyperliquid.xyz/info` (the bundle references `api.hyperliquid.xyz/info`, H). Details in the Hyperliquid note.
- Fixtures: none of a market/book shape (Valiant has no such API; Hyperliquid REST is POST-only). Saved instead: DefiLlama JSON and the bundle excerpt under `docs/research/fixtures/hyperliquid-hip-4-front-end-valiant-trade/`.

## 5. Trade path
Valiant has no third-party order API. Its UI signs Hyperliquid `order` actions with the builder field `{b: 0x751d254C07f7A4B454Eb5C2a23EbE3ADf1a4eaeC, f: 38}` (H: bundle constants `BUILDER_ADDRESS`, `BUILDER_FEE=38`, `BUILDER_MAX_FEE_RATE="0.05%"`; error string "Builder fee not approved. Please approve builder fees before placing orders."). A programmatic trader should call Hyperliquid `/exchange` directly and skip Valiant's fee.

## 6. PayBox reachability
**no** for Valiant (sunset, no API, no contract). The underlying Hyperliquid route is "partial" (HyperCore takes signed actions, not EVM transaction proposals; see Hyperliquid note). No PayBox calls made.

## 7. Fees
Builder fee 38 tenths-of-bp = **3.8 bps**, approval cap 0.05% (H, bundle). Valiant docs describe the 3.8 bps for perps; no outcome-specific fee page found (M). Hyperliquid charges its own outcome fee on close/settle (see Hyperliquid note). Payer: the trader; builder fee goes to the builder address.

## 8. Resolution and dispute risk
Identical to Hyperliquid HIP-4 (Valiant lists HyperCore markets verbatim; M): protocol-recurring, validator-set, or deployer-settled markets, mostly with no trader dispute window. Valiant has no resolution role.

## 9. Geo, ToS, automation
Terms of Use (`https://docs.valiant.trade/legal/terms-of-use`, H via WebFetch summary): excludes "the United States or its territories, Cuba, Iran, North Korea, Syria," Crimea/Donetsk/Luhansk and comprehensively sanctioned jurisdictions; may geo-block and screen wallets/IPs. API/SDK users "must follow the posted documentation and rate limits". No outcome/prediction-market clause found (the earlier note dates the ToU 14 Oct 2025, predating HIP-4; M). Hyperliquid's own terms add US/Ontario and "Excluded Persons" limits for outcomes (M, from sibling note).

## 10. Liquidity (dated 2026-10-19 reads)
- Valiant outcome builder-attributed volume: $0 24h / 7d / 30d; $1,026 all-time (H, DefiLlama dexs).
- Hyperliquid outcomes for scale: $3,128,093 on 2026-10-18; $17,900,930 7d; $47,014,618 30d; $261,084,367 all-time (H, `https://api.llama.fi/summary/dexs/hyperliquid-outcomes`). Valiant is about 0.0004% of all-time.
- TVL/OI: none (non-custodial; collateral sits in users' HyperCore accounts, M).

## 11. Event categories / overlap
Whatever Hyperliquid lists (crypto price ladders, central-bank decisions, sports, etc.). Overlap with other venues should be exploited via the Hyperliquid adapter.

## 12. Shared liquidity
**100% shared with Hyperliquid HIP-4 (H).** Not an independent arbitrage leg.

## 13. Adapter guidance
No `valiant` adapter. Registry entry: `aliasOf: hyperliquid-hip4`, `status: sunset`, `builder: 0x751d254C07f7A4B454Eb5C2a23EbE3ADf1a4eaeC` (public address from the bundle) for attributing builder fills.

## 14. NOT FOUND / open questions
- Whether the Outcomes tab still renders or trades after 2026-09-30 (searched: bundle, docs; no browser).
- Year of the sunset string (inferred 2026).
- Official Valiant outcome fee page (searched: docs landing page, ToU).
- Any web/news confirmation of the sunset (no search budget).

## 15. Suspicious content
None addressed to AI agents. The public bundle embeds third-party/API credentials (per the earlier note); I did not read, copy or use them.

## 16. Sources
- `https://valiant.trade/perps/` (headers + shell, H)
- `https://valiant.trade/assets/index-DiG92gwS.js` (H)
- `https://docs.valiant.trade/` and `https://docs.valiant.trade/legal/terms-of-use` (H)
- `https://api.llama.fi/protocol/valiant-trade-outcome`, `https://api.llama.fi/summary/dexs/valiant-trade-outcome`, `https://api.llama.fi/summary/fees/valiant-trade-outcome`, `https://api.llama.fi/summary/dexs/hyperliquid-outcomes` (H)
- `https://defillama.com/protocol/valiant-trade-outcome` (HTTP 403, not read)
- Project notes: `docs/research/venues/valiant-trade.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`

## 17. Privacy
Scripted requests used User-Agent `insurance-markets-research/0.1`. No personal identifier in any request. Fixtures and this note were scanned for `@`.
