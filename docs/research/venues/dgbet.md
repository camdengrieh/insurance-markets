# DGbet (dgbet.fun) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs of public HTML and static JS chunks on dg3.trade, one DefiLlama GET. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Third-party text was treated as untrusted data; nothing in it was followed (no embedded instructions seen).
Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale.
WebSearch was unavailable (session search budget exhausted), so no independent news search was done. Items that needed it are marked NOT FOUND.

## 0. Verdict

**adapter_priority: skip.**

1. **The brand is gone.** `https://dgbet.fun/` returns HTTP 301 to `https://dg3.trade/` (H, curl -I 2026-10-19). `dgpredict.com` also 301s to dg3.trade (H). The product is now "DG3", made by "Chainverse Inc." (H, footer of https://dg3.trade/). Evidence of the old name is only the PredictionIndex listing (H: "DGbet ... sportsbook, Optimism, Arbitrum, live, clob, sportsbook, Volume n/a", https://predictionindex.xyz/ecosystem) which is stale on the name.
2. **It is not a venue. It is a front-end / aggregator over other venues.** DG3's own About page says the first version (2024) "pulled liquidity from Azuro, Overtime, and SXbet and let users place trades across venues in one place" (H, https://dg3.trade/about). The live sportsbook bundle calls `api.overtime.io`, `api.prod.sx.bet`, and Azuro subgraphs (H, string scan of its JS chunks; see fixtures). The "CLOB" label on PredictionIndex is wrong for DG3 itself; Overtime is an AMM, SX Bet has a CLOB, Azuro is an LP-pool sportsbook.
3. **The newer product (the DG3 "terminal") is a Polymarket-only UI.** "DG3 is currently in Phase 0, live on Polymarket only"; "Every order routes through to Polymarket" (H, https://dg3.trade/faq and https://dg3.trade/docs). That is the same book as Polymarket, so zero independent liquidity.
4. **No public API, no own contracts found, no own liquidity.** Everything it shows is sourced from Overtime, SX Bet, Azuro, Polymarket, which are covered or being covered as their own venues. Build adapters for those, not for DG3.

## 1. Liveness (H)

| Check | Result | Source |
|---|---|---|
| dgbet.fun | 301 to https://dg3.trade/ | curl -I 2026-10-19 |
| dg3.trade | 200, copyright "2026", "Alpha access rolling out now" | https://dg3.trade/ |
| Sportsbook | 200 at https://sportsbook.dg3.trade/sportsbook, titled "DG3 - Best Odds, No Bans, No Limits Crypto Sportsbook"; SSR payload contains live Overtime games with `maturity` timestamps up to 2026-10-18+ (epoch 1792434600 = 2026-10-19) | https://sportsbook.dg3.trade/sportsbook |
| Blog | Posts dated Aug-Sep 2026, latest Sep 3, 2026 | https://dg3.trade/blog |
| Old X handle `DGbet_official` (from PredictionIndex) | NOT FOUND (X not fetched; current site links https://x.com/DG3_terminal) | |

So the *site* is live, the *DGbet venue as described by PredictionIndex* is not a distinct thing.

## 2. Kind and market model

- **Kind:** non-custodial aggregator / UI layer ("intelligence terminal"), not a market maker or exchange (H: FAQ "DG3 never takes control of or holds those funds").
- **Terminal (Phase 0):** CLOB orders on Polymarket (Polygon). Order types FOK/FAK/GTC/GTD; errors mention `WALLET_CHAIN_MISMATCH ... Switch to Polygon` (H, https://dg3.trade/docs).
- **Sportsbook:** provider switch. Seeded state in the page: `providerFromServer: "overtime"`, `chainIdFromServer: 8453` (Base), slots for SX (`initialSxNavigation`, `initialSxHomeData`) (H, fixture `sportsbook_ssr_excerpt_2026-10-19.json`). Azuro subgraph URLs also in the bundle (H). Market structure, tokenisation and pricing are those of the underlying protocol (see overtime.md, sx-bet.md, azuro.md in this directory).
- Chains: PredictionIndex says Optimism + Arbitrum (M). The live sportsbook defaults to Base (H). Overtime itself runs on Optimism, Arbitrum, Base (see overtime.md). Polygon for the terminal (H). DG3 has no chain of its own that I could find.

## 3. Collateral

- Terminal: USDC on Polygon (docs: "Balance: Total USDC on your connected wallet", Polygon chain-mismatch error) (H).
- Sportsbook: whatever the provider uses (Overtime USDC/others, SX USDC, Azuro USDT/WETH). Funding via Relay.link / Glide / Coinbase onramp / MoonPay hosts present in the bundle (M, string scan only).

## 4. Read API

- **DG3 official public API: none found.** NOT FOUND (searched: https://dg3.trade/docs text for "API" (only prose), blog index, FAQ, homepage links, sportsbook bundle). The blog has a post titled "No Vig API: Pulling Fair Odds Programmatically" (H, listed on https://dg3.trade/blog, Aug 25 2026) but its likely URL slug returned 404 and I did not locate it; treat as a tutorial using other venues' APIs (L).
- The only machine-readable thing on DG3 is the Next.js server-rendered payload embedded in the sportsbook HTML (Overtime games and implied-probability odds); that is an unstable internal format, not an API. Sample in fixtures.
- FAQ states that terminal market data "comes from Polymarket's own CLOB API" (H, https://dg3.trade/faq). So the proper read source is Polymarket, not DG3.
- Auth/limits/websocket: NOT FOUND for DG3.

Fixtures (docs/research/fixtures/dgbet/):
- `sportsbook_ssr_excerpt_2026-10-19.json` (3 KB): SSR excerpt showing provider = overtime, chainId 8453, first game with decimal-looking implied probabilities `[0.4948, 0.3215, 0.2499]` for a three-way market.
- `redirects_and_bundle_hosts_2026-10-19.json` (1 KB): redirect map and upstream hosts.

## 5. Trade path

- Terminal: signs Polymarket orders client-side with a Privy embedded wallet (Google/X/Discord login) or an external EOA; "External wallets require a prompt on every trade" (H, docs). No order API for third parties. NOT FOUND: any API key, SDK or builder endpoint.
- Sportsbook: wallet transactions to the underlying Overtime / SX / Azuro contracts or APIs.
- **PayBox reach: no for DG3 itself** (no programmable surface). The underlying venues are reached directly (Overtime: contract calls on OP/ARB/Base but odds roots/proofs need its gated API; SX Bet: EIP-712 signed orders on SX chain; Azuro: EIP-712 + approval on Polygon; Polymarket: Polygon CLOB). Those are assessed in their own notes. Going through DG3 would only add a fee and a UI.

## 6. Fees

- Terminal order summary lists "Polymarket fee $1.72" and "DG3 fee $1.20" on a $200 order, "DG3 fee FREE - 10d" (H, https://dg3.trade/docs); "DG3 waives trading fees for the first 10 days from account creation" (H). Fee formula for the DG3 fee after the waiver: NOT FOUND (the sample implies 0.6% of notional, M inference from a single example). FAQ: "a separate DG3 fee on trades" (H).
- Sportsbook: DG3 fee/rev-share on top of provider margins: NOT FOUND.

## 7. Resolution and dispute risk

- Inherited from the underlying venue (Polymarket UMA, Overtime oracle + Chainlink, SX UMA/oracle, Azuro data provider). DG3 has none of its own (M). Dispute/void rules therefore depend on provider; see per-venue notes.

## 8. Geo / ToS / automation

- Terms-and-conditions: `https://dgpredict.com/terms-and-conditions/` 301 to `https://dg3.trade/terms-and-conditions/` which returns 404 (H, 2026-10-19). NOT FOUND: restricted jurisdictions, bot/automation rules. The pre-rebrand ToS was not retrievable (archive services not used).
- The sportsbook headline "No Bans, No Limits" is marketing copy (H) and not a ToS statement.
- Docs say nothing on automation of orders (H); terminal has "Automate" playbooks (stop-loss, take-profit, Kelly) executed by DG3 inside the product (H).

## 9. Liquidity

- Self-reported "$25M+ Total Volume Traded", "100K+ Markets Indexed Monthly" on the homepage (L, unaudited marketing, undated, https://dg3.trade/).
- DefiLlama protocol list: no DGbet/DG3/DGPredict entry (H, api.llama.fi/protocols scanned 2026-10-19); dexs summary slug `dgbet` not found (H).
- PredictionIndex: volume "n/a" (H).
- Actual depth = depth of Overtime / SX / Azuro / Polymarket.

## 10. Event overlap (where arbitrage exists)

Sports and esports only (H, docs: "DG3 currently covers Sports and Esports"). Overlaps Polymarket/Kalshi/SX sports (moneyline, totals, props). No politics, macro or crypto. All overlap is by proxy through the underlying venues.

## 11. Shared liquidity

**Yes, 100% shared.** Terminal = Polymarket order book. Sportsbook = Overtime / SX Bet / Azuro. DG3 is not an independent arbitrage leg and should not be double-counted.

## 12. Open questions

- Whether DG3's sportsbook still lists Azuro and SX in the UI (code present; only Overtime/Base was the SSR default).
- Whether Chainverse Inc. has a separate DGBT token or contracts (whitepaper page https://dgpredict.gitbook.io/whitepaper mentions a "DGBT Token" and a "decentralized, non-custodial, fully on-chain" platform but gives no chains, contracts or protocols (H, WebFetch summary)); treat as legacy/unverified.
- Post-rebrand terms (404).

## Sources

- https://dgbet.fun/ (301 to dg3.trade, curl -I 2026-10-19)
- https://dg3.trade/ , https://dg3.trade/about , https://dg3.trade/faq , https://dg3.trade/docs , https://dg3.trade/blog
- https://sportsbook.dg3.trade/sportsbook (HTML + 45 static JS chunks scanned for host strings)
- https://predictionindex.xyz/ecosystem (discovery entry)
- https://dgpredict.gitbook.io/whitepaper (legacy whitepaper, thin)
- https://api.llama.fi/protocols (no match)
- Sibling notes: overtime.md, sx-bet.md, azuro.md in this directory
